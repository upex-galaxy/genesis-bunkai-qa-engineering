/**
 * KATA Architecture - Layer 3.5: Workspace Export Steps (BK-508)
 *
 * Reusable precondition chains for the workspace data export suite:
 * - createSyntheticWorkspace / cleanupSyntheticWorkspace: per-test isolation
 * - seedWorkspaceContent: project -> environment / module -> user story -> AC
 *   -> ATC -> test -> runs (finished), so the archive has real content and run history
 * - prepareCompletedExport: request an export and poll until it completes
 *   (helpers only: never the BK-1017 ATC, an ATC is not a precondition)
 *
 * Not a fixture: instantiate directly in the test with `{ request }`.
 * Every component used here is cookie-only (no Bearer PAT).
 */

import type { Run, RunVerdict, Test } from '@schemas/workspace-content.types';
import type { WorkspaceExportJob } from '@schemas/workspace-export.types';
import type { Workspace } from '@schemas/workspaces.types';
import type { TestContextOptions } from '@TestContext';

import { ApiFixture } from '@ApiFixture';
import { EXPORT_CLEANUP_SETTLE_TIMEOUT_MS, EXPORT_POLL_INTERVALS_MS } from '@data/constants';
import { expect } from '@playwright/test';
import { TestContext } from '@TestContext';

export interface SeededWorkspaceContent {
  test: Test
  runs: Run[]
}

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
  async prepareCompletedExport(workspaceId: string): Promise<WorkspaceExportJob> {
    const [requestResponse, requestBody] = await this.api.workspaceExport.requestExport(workspaceId);
    expect(requestResponse.status(), 'export request').toBe(202);

    return this.api.workspaceExport.waitForExportToSettle({ workspaceId, exportId: requestBody.export_job_id });
  }

  /**
   * Create a synthetic workspace owned by the caller (`qa-auto-bk508-*` slug).
   */
  async createSyntheticWorkspace(): Promise<Workspace> {
    return this.api.workspaces.createWorkspace(this.data.createWorkspacePayload());
  }

  /**
   * Soft-delete a synthetic workspace (also revokes its PATs and invites).
   * First waits (best effort, bounded) for an in-flight export to settle, so the
   * worker never runs against a deleted workspace.
   */
  async cleanupSyntheticWorkspace(workspace: Workspace): Promise<void> {
    await this.waitForInFlightExportBestEffort(workspace.id);
    await this.api.workspaces.deleteWorkspace({ workspaceId: workspace.id, confirmName: workspace.name });
  }

  /**
   * Best effort: poll until the latest export is no longer `queued` or `running`.
   * Unlike `waitForExportToSettle` (fail-fast, used by ATCs and preconditions), a
   * non-200 poll is treated as transient and retried within the cleanup bound.
   * Never throws: any error or timeout is swallowed so cleanup goes on.
   */
  private async waitForInFlightExportBestEffort(workspaceId: string): Promise<void> {
    try {
      await expect.poll(async () => {
        const [response, body] = await this.api.workspaceExport.getExport(workspaceId);
        if (response.status() !== 200) {
          return `http-${response.status()}`;
        }
        const status = body.export?.status;
        return status === 'queued' || status === 'running' ? status : 'idle';
      }, {
        message: `export of workspace ${workspaceId} should not be in flight before cleanup`,
        timeout: EXPORT_CLEANUP_SETTLE_TIMEOUT_MS,
        intervals: EXPORT_POLL_INTERVALS_MS,
      }).toBe('idle');
    }
    catch {
      // Best effort only: cleanup must never fail on the export wait.
    }
  }
}
