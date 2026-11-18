/**
 * KATA Architecture - Layer 3.5: Workspace Deletion Steps (BK-512)
 *
 * Reusable precondition chains for the "Delete a workspace I own" suite. It
 * composes `WorkspaceExportSteps` (create, seed, grant role, cleanup) and adds
 * the deletion-specific links:
 * - createOwnedWorkspaceWithContent: a `qa-auto-bk512-*` workspace with content
 *   (and, with `withEverything`, a bug and a milestone: one of every child entity)
 * - deleteAsOwner: soft-delete a workspace this test created (prefix guard, R1)
 * - grantTeammate: give a second identity a role in it
 * - cleanupDeletionWorkspace: soft-delete unless the test already deleted it
 * - teammateSession: open a second identity's own request context
 *
 * Not a fixture: instantiate directly in the test with `{ request }` (add
 * `page` in E2E, so `makeActive` switches the browser's active workspace).
 */

import type { EntityProbeTarget } from '@api/WorkspaceDeletionApi';
import type { DeletionEntityType } from '@data/constants';
import type { APIRequestContext, Browser, BrowserContext } from '@playwright/test';
import type { SignInPayload, SignInResponse } from '@schemas/auth.types';
import type { Bug, Milestone } from '@schemas/workspace-content.types';
import type { DeleteWorkspaceResponse, InviteRole, Workspace } from '@schemas/workspaces.types';
import type { SeededWorkspaceContent } from '@steps/WorkspaceExportSteps';
import type { TestContextOptions } from '@TestContext';

import type { RoleUserName } from '@variables';
import { TokensApi } from '@api/TokensApi';
import { WorkspacesApi } from '@api/WorkspacesApi';
import { ApiFixture } from '@ApiFixture';
import { DELETION_SLUG_PREFIX } from '@data/constants';
import { expect, request as playwrightRequest } from '@playwright/test';
import { WorkspaceExportSteps } from '@steps/WorkspaceExportSteps';
import { TestContext } from '@TestContext';
import { config } from '@variables';

export interface OwnedWorkspaceWithContent {
  workspace: Workspace
  content: SeededWorkspaceContent
  bug: Bug | null
  milestone: Milestone | null
}

/** A workspace created by the admin role account where the caller is only a member. */
export interface MemberOnlyWorkspace {
  workspace: Workspace
  /** The admin account's own request context (disposed by `releaseMemberOnlyWorkspace`) */
  adminSession: APIRequestContext
}

export class WorkspaceDeletionSteps extends TestContext {
  private readonly api: ApiFixture;
  private readonly exportSteps: WorkspaceExportSteps;

  constructor(options: TestContextOptions = {}) {
    super(options);
    this.api = new ApiFixture(options);
    this.exportSteps = new WorkspaceExportSteps(options);
  }

  /**
   * Create an empty synthetic workspace under the BK-512 slug prefix. With
   * `makeActive`, it becomes the caller's active one (needs a page).
   */
  async createOwnedWorkspace(options: { makeActive?: boolean } = {}): Promise<Workspace> {
    return this.exportSteps.createSyntheticWorkspace({
      makeActive: options.makeActive,
      slugPrefix: DELETION_SLUG_PREFIX,
    });
  }

  /**
   * Create a synthetic workspace under the BK-512 slug prefix and seed one
   * content chain (project .. run). With `withEverything`, also file a bug and
   * a milestone, so the workspace holds one of every entity BK-938 probes.
   * With `makeActive`, the workspace becomes the caller's active one (needs a page).
   * The workspace is soft-deleted (best effort) if seeding fails, so it never leaks.
   */
  async createOwnedWorkspaceWithContent(
    options: { makeActive?: boolean, withEverything?: boolean } = {},
  ): Promise<OwnedWorkspaceWithContent> {
    const workspace = await this.createOwnedWorkspace({ makeActive: options.makeActive });
    try {
      const content = await this.exportSteps.seedWorkspaceContent(workspace.id, { withRunHistory: true });
      let bug: Bug | null = null;
      let milestone: Milestone | null = null;
      if (options.withEverything) {
        bug = await this.api.bugs.createBug({
          project_id: content.project.id,
          module_id: content.module.id,
          title: 'QA Auto BK-512 standalone bug',
          severity: 'P3',
        });
        milestone = await this.api.projects.createMilestone(content.project.id, this.data.createMilestonePayload());
      }
      return { workspace, content, bug, milestone };
    }
    catch (error) {
      await this.api.workspaces.deleteWorkspace({ workspaceId: workspace.id, confirmName: workspace.name })
        .catch(() => { /* best effort: the original failure is what matters */ });
      throw error;
    }
  }

  /** The 10 seeded entities as BK-938 probe targets (PATCH probes re-send their own current values). */
  probeTargets(seeded: OwnedWorkspaceWithContent): EntityProbeTarget[] {
    const { content, bug, milestone } = seeded;
    if (!bug || !milestone) {
      throw new Error('probeTargets needs a workspace seeded with `withEverything: true`.');
    }
    const byEntity: Record<DeletionEntityType, EntityProbeTarget> = {
      project: { entity: 'project', entityId: content.project.id },
      module: { entity: 'module', entityId: content.module.id, patchBody: { name: content.module.name } },
      user_story: { entity: 'user_story', entityId: content.story.id },
      acceptance_criterion: { entity: 'acceptance_criterion', entityId: content.criterion.id },
      atc: { entity: 'atc', entityId: content.atc.id },
      test: { entity: 'test', entityId: content.test.id },
      run: { entity: 'run', entityId: content.runs[content.runs.length - 1].id },
      bug: { entity: 'bug', entityId: bug.id },
      milestone: {
        entity: 'milestone',
        entityId: milestone.id,
        patchBody: { name: milestone.name, target_date: milestone.target_date, description: milestone.description },
      },
      environment: {
        entity: 'environment',
        entityId: content.environment.id,
        patchBody: { name: content.environment.name },
      },
    };
    return Object.values(byEntity);
  }

  /**
   * Soft-delete a workspace this test created, as its Owner. Fails fast (before
   * any request) unless its slug carries the BK-512 prefix: the environment is
   * shared, so a test must never delete a workspace it did not create (R1).
   */
  async deleteAsOwner(workspace: Workspace): Promise<DeleteWorkspaceResponse> {
    if (!workspace.slug.startsWith(DELETION_SLUG_PREFIX)) {
      throw new Error(`Refusing to delete a workspace outside the ${DELETION_SLUG_PREFIX}* prefix.`);
    }
    return this.api.workspaces.deleteWorkspace({ workspaceId: workspace.id, confirmName: workspace.name });
  }

  /** Give a second identity a role in a workspace the caller owns (invite, accept, switch). */
  async grantTeammate(args: {
    workspaceId: string
    role: InviteRole
    roleUser: RoleUserName
    memberRequest: APIRequestContext
  }): Promise<void> {
    await this.exportSteps.grantRoleInWorkspace({
      workspaceId: args.workspaceId,
      email: config.roleUsers[args.roleUser].email,
      role: args.role,
      memberRequest: args.memberRequest,
    });
  }

  /**
   * True when the caller can no longer read the workspace (it was soft-deleted,
   * e.g. by the UI under test). UI tests use it to tell afterEach whether a
   * second DELETE is needed.
   */
  async isWorkspaceGone(workspaceId: string): Promise<boolean> {
    const [response] = await this.api.workspaces.getWorkspaceById(workspaceId);
    return response.status() === 404;
  }

  /**
   * Cleanup of a BK-512 workspace: nothing to do when the test already deleted
   * it (a second DELETE answers 404 and mails the members again); otherwise a
   * normal soft-delete.
   */
  async cleanupDeletionWorkspace(args: { workspace: Workspace, deleted: boolean }): Promise<void> {
    if (args.deleted) {
      return;
    }
    await this.exportSteps.cleanupSyntheticWorkspace(args.workspace);
  }

  /**
   * Open a role account's own cookieless-of-Owner request context from its
   * saved session (`.auth/role-<role>.json`, written by roles-setup). The
   * caller disposes it in `finally`.
   */
  async openRoleSession(roleUser: RoleUserName): Promise<APIRequestContext> {
    return playwrightRequest.newContext({
      baseURL: config.baseUrl,
      storageState: config.auth.roleStatePath(roleUser),
    });
  }

  /**
   * Create a synthetic workspace owned by the ADMIN role account (its own
   * session) and make the caller a plain `member` of it, so the caller owns
   * nothing there: its row must offer no Delete (BK-937). `ownerRequest` is the
   * caller's request context (the page's, so the browser gets the cookie). The
   * invite and the accept switch the caller's active workspace to it; callers
   * make their own workspace active afterwards.
   */
  async createMemberOnlyWorkspace(ownerRequest: APIRequestContext): Promise<MemberOnlyWorkspace> {
    const adminSession = await this.openRoleSession('admin');
    try {
      const adminSteps = new WorkspaceExportSteps({ request: adminSession });
      const workspace = await adminSteps.createSyntheticWorkspace({ slugPrefix: DELETION_SLUG_PREFIX });
      try {
        await adminSteps.grantRoleInWorkspace({
          workspaceId: workspace.id,
          email: config.testUser.email,
          role: 'member',
          memberRequest: ownerRequest,
        });
      }
      catch (error) {
        await adminSteps.cleanupSyntheticWorkspace(workspace).catch(() => { /* best effort */ });
        throw error;
      }
      return { workspace, adminSession };
    }
    catch (error) {
      await adminSession.dispose();
      throw error;
    }
  }

  /**
   * End a member-only workspace: the caller leaves it (a soft-delete mails every
   * active member), then its creator deletes it. Always disposes the admin session.
   */
  async releaseMemberOnlyWorkspace(args: { memberOnly: MemberOnlyWorkspace, ownerRequest: APIRequestContext }): Promise<void> {
    const { workspace, adminSession } = args.memberOnly;
    try {
      try {
        await new WorkspacesApi({ request: args.ownerRequest }).leaveWorkspace(workspace.id);
      }
      finally {
        await new WorkspaceExportSteps({ request: adminSession }).cleanupSyntheticWorkspace(workspace);
      }
    }
    finally {
      await adminSession.dispose();
    }
  }

  /**
   * Open a browser context signed in as the lone-owner account (an account that
   * belongs to NO workspace, BK-946). Signs in headlessly on a throw-away
   * request context (no Owner Bearer rides along), revokes the PAT the sign-in
   * mints (204 required) and hands its session cookie to a new browser context.
   * Nothing from the response is logged or attached. The caller closes the context.
   */
  async openLoneOwnerContext(browser: Browser): Promise<BrowserContext> {
    const account = config.loneOwner;
    const context = await playwrightRequest.newContext();
    try {
      const payload: SignInPayload = {
        email: account.email,
        password: account.password,
        pat_name: 'qa-automation-lone-owner',
        pat_expires_in_days: 1,
      };
      const response = await context.post(`${config.apiUrl}${config.auth.loginEndpoint}`, { data: payload });
      expect(response.status(), 'lone-owner sign-in').toBe(200);
      const body = (await response.json()) as SignInResponse;
      await new TokensApi({ request: context }).revokeToken(body.pat.id, { requireRevoked: true });
      return await browser.newContext({ baseURL: config.baseUrl, storageState: await context.storageState() });
    }
    finally {
      await context.dispose();
    }
  }
}
