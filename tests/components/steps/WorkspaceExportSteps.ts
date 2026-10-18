/**
 * KATA Architecture - Layer 3.5: Workspace Export Steps (BK-508)
 *
 * Reusable precondition chains for the workspace data export suite:
 * - seedWorkspaceContent: project -> environment / module -> user story -> AC
 *   -> ATC -> test -> runs (finished), so the archive has real content and run history
 * - prepareCompletedExport: request an export and poll until it completes
 *
 * Not a fixture: instantiate directly in the test with `{ request }`.
 * Every component used here is cookie-only (no Bearer PAT).
 */

import type { Run, RunVerdict, Test } from '@schemas/workspace-content.types';
import type { GetWorkspaceExportResponse } from '@schemas/workspace-export.types';
import type { TestContextOptions } from '@TestContext';

import { ApiFixture } from '@ApiFixture';
import { EXPORT_POLL_INTERVALS_MS, EXPORT_SETTLE_TIMEOUT_MS } from '@data/constants';
import { expect } from '@playwright/test';
import { TestContext } from '@TestContext';

export interface SeededWorkspaceContent {
  test: Test
  runs: Run[]
}

type ExportState = NonNullable<GetWorkspaceExportResponse['export']>;

export class WorkspaceExportSteps extends TestContext {
  private readonly api: ApiFixture;

  constructor(options: TestContextOptions = {}) {
    super(options);
    this.api = new ApiFixture(options);
  }

  /**
   * Seed a workspace with the full content chain. With `withRunHistory`, three
   * runs are started and two are finished (passed, failed); one stays open.
   * The ATC step content and the test title are multiline on purpose.
   */
  async seedWorkspaceContent(
    workspaceId: string,
    options: { withRunHistory: boolean } = { withRunHistory: true },
  ): Promise<SeededWorkspaceContent> {
    const project = await this.api.projects.createProject(workspaceId, { name: 'QA Auto Export Project' });
    const environment = await this.api.projects.createEnvironment(project.id, { name: 'staging' });
    const module = await this.api.projects.createModule(project.id, { name: 'Export' });
    const story = await this.api.userStories.createUserStory(module.id, { title: 'QA Auto export story' });
    const criterion = await this.api.userStories.createAcceptanceCriterion(story.id, {
      title: 'Runs are exported as NDJSON',
    });
    const atc = await this.api.atcs.createAtc({
      title: 'QA Auto multiline ATC',
      module_id: module.id,
      user_story_id: story.id,
      acceptance_criterion_ids: [criterion.id],
      layer: 'API',
      steps: [{ position: 1, content: 'Line one\nLine two with "quotes" and a {brace}', expected: 'Expected\nmultiline' }],
    });
    const test = await this.api.tests.createTest({
      title: 'QA Auto export test\nwith newline in title',
      atc_ids: [atc.id],
      workspace_id: workspaceId,
    });

    const runs: Run[] = [];
    if (options.withRunHistory) {
      const verdicts: (RunVerdict | null)[] = ['passed', 'failed', null];
      for (const verdict of verdicts) {
        const run = await this.api.runs.startRun({ test_id: test.id, environment_id: environment.id });
        runs.push(verdict ? await this.api.runs.finishRun(run.id, verdict) : run);
      }
    }

    return { test, runs };
  }

  /**
   * Request an export and poll (bounded, condition-based) until it settles.
   * Fails fast when the job ends `failed` or does not settle in time.
   */
  async prepareCompletedExport(workspaceId: string): Promise<ExportState> {
    const [requestResponse] = await this.api.workspaceExport.requestExport(workspaceId);
    expect(requestResponse.status(), 'export request').toBe(202);

    let latest: GetWorkspaceExportResponse['export'] = null;
    await expect.poll(async () => {
      const [, body] = await this.api.workspaceExport.getExport(workspaceId);
      latest = body.export;
      return latest?.status;
    }, {
      message: 'export should settle (completed | failed)',
      timeout: EXPORT_SETTLE_TIMEOUT_MS,
      intervals: EXPORT_POLL_INTERVALS_MS,
    }).toMatch(/^(completed|failed)$/);

    const settled = latest as ExportState | null;
    if (!settled || settled.status !== 'completed') {
      throw new Error(`Export did not complete: status=${settled?.status}, error=${settled?.error_message}`);
    }
    return settled;
  }
}
