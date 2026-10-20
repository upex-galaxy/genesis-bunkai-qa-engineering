/**
 * KATA Architecture - Layer 3.5: Workspace Export Steps (BK-508)
 *
 * Reusable precondition chains for the workspace data export suite:
 * - createSyntheticWorkspace / cleanupSyntheticWorkspace: per-test isolation
 * - seedWorkspaceContent: project -> environment / module -> user story -> AC
 *   -> ATC -> test -> runs (finished), so the archive has real content and run history
 * - prepareCompletedExport: request an export and poll until it completes
 *   (helpers only: never the BK-1017 ATC, an ATC is not a precondition)
 * - grantRoleInWorkspace: invite a second identity with a role and accept it
 *   from that identity's own session (BK-1001)
 *
 * Not a fixture: instantiate directly in the test with `{ request }` (add
 * `page` in E2E, so `makeActive` switches the browser's active workspace).
 * Every component used here is cookie-only (no Bearer PAT).
 */

import type { APIRequestContext } from '@playwright/test';
import type { Run, RunVerdict, Test } from '@schemas/workspace-content.types';
import type { WorkspaceExportJob } from '@schemas/workspace-export.types';
import type { InviteRole, Workspace } from '@schemas/workspaces.types';
import type { TestContextOptions } from '@TestContext';

import { WorkspacesApi } from '@api/WorkspacesApi';
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
   * The ATC step content and the test title are multiline on purpose. Pass a
   * distinct `round` to seed several chains in one workspace (project names
   * are unique per workspace).
   */
  async seedWorkspaceContent(
    workspaceId: string,
    options: { withRunHistory: boolean, round?: number } = { withRunHistory: true },
  ): Promise<SeededWorkspaceContent> {
    const projectName = options.round ? `QA Auto Export Project ${options.round}` : 'QA Auto Export Project';
    const project = await this.api.projects.createProject(workspaceId, { name: projectName });
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
   * With `makeActive`, also make it the caller's active workspace. The switch
   * runs on the page's own request context, so the browser receives the
   * `bk_active_ws` cookie; it needs the Steps built with a `page`. When the
   * switch fails, the just-created workspace is soft-deleted (best effort)
   * before the error is rethrown, so it never leaks.
   */
  async createSyntheticWorkspace(options: { makeActive?: boolean } = {}): Promise<Workspace> {
    if (options.makeActive && !this._page) {
      throw new Error('createSyntheticWorkspace({ makeActive: true }) needs WorkspaceExportSteps built with a page.');
    }
    const workspace = await this.api.workspaces.createWorkspace(this.data.createWorkspacePayload());
    if (options.makeActive) {
      try {
        await new WorkspacesApi({ request: this._page!.request }).setActiveWorkspace(workspace.id);
      }
      catch (error) {
        await this.api.workspaces.deleteWorkspace({ workspaceId: workspace.id, confirmName: workspace.name })
          .catch(() => { /* best effort: the original failure is what matters */ });
        throw error;
      }
    }
    return workspace;
  }

  /**
   * Give a second identity a role in a workspace the caller owns: the caller
   * invites the identity's email, the identity accepts on its own request
   * context, then makes the workspace its active one there (pass the role
   * page's `page.request`, so its browser gets the `bk_active_ws` cookie).
   * Fails fast when the accepted role differs from the invited one.
   */
  async grantRoleInWorkspace(args: {
    workspaceId: string
    email: string
    role: InviteRole
    memberRequest: APIRequestContext
  }): Promise<void> {
    const { token } = await this.api.workspaces.createInvite({
      workspaceId: args.workspaceId,
      email: args.email,
      role: args.role,
    });

    const member = new WorkspacesApi({ request: args.memberRequest });
    const accepted = await member.acceptInvite({ token });
    expect(accepted.workspace_id, 'invite acceptance: the invited workspace').toBe(args.workspaceId);
    expect(accepted.role, 'invite acceptance: the invited role').toBe(args.role);

    await member.setActiveWorkspace(args.workspaceId);
  }

  /**
   * Soft-delete a synthetic workspace (also revokes its PATs and invites). It
   * does NOT end memberships quietly: the product emails every active member,
   * so a test that granted a role ends it first (`WorkspacesApi.leaveWorkspace`
   * on the member's own session).
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
