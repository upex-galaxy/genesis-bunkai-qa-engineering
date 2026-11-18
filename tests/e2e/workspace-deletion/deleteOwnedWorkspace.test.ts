/**
 * Workspace Deletion - The Owner deletes a workspace from Settings (BK-512, Wave 3)
 *
 * BK-937: the Owner deletes one of several workspaces. The Owner is also a plain
 * `member` of a workspace created by the admin role account (so a non-owned row
 * is on screen and must offer no Delete). The deleted workspace is the ACTIVE
 * one; the landing is the oldest remaining membership, so the ATC asserts only
 * that the toast and `/me` agree on a workspace the Owner still belongs to.
 *
 * Only the expected landing is snapshotted before the deletion: the Owner's
 * oldest remaining workspace (the list is oldest first; the member-only one was
 * joined just now, so it is never the landing).
 *
 * The `workspace_deletions` audit assertions need a read-only DB connection
 * (STAGING_DB_RO_URL, the qa_inspector_ro role). Without it the whole UI part
 * runs first (its assertions must pass), then the ATC skips the test at runtime
 * naming the variable: Playwright reports it skipped and BK-937 records SKIP /
 * NOT RUN, never a PASS for the merged audit TCs (TC47, TC61).
 *
 * BK-946: the lone-owner account (belongs to no workspace) creates a workspace,
 * deletes it from the UI and lands on onboarding. The account ends with zero
 * workspaces, so the test re-runs. SKIPPED (named reason) when the lone-owner
 * account variables are not set.
 *
 * BK-937 needs the admin role session (a workspace it owns) and BK-946 the
 * lone-owner account, so this file runs ONLY in the e2e-roles project (it joins
 * `roleSessionTests` in playwright.config.ts) and a plain e2e run never needs
 * those credentials.
 *
 * Project: e2e-roles (depends on ui-setup, api-setup, roles-setup).
 * Run with `bun run test:e2e:roles`.
 */

import type { MemberOnlyWorkspace, OwnedWorkspaceWithContent } from '@steps/WorkspaceDeletionSteps';

import { WorkspaceDeletionSteps } from '@steps/WorkspaceDeletionSteps';
import { config, expect, test } from '@TestFixture';
import { WorkspacesSettingsPage } from '@ui/WorkspacesSettingsPage';
import { readWorkspaceDeletions } from '@utils/deletionAudit';

/** Why the lone-owner account is unusable (the getter's error names the missing variables, never a value), or null. */
function loneOwnerUnavailable(): string | null {
  try {
    void config.loneOwner;
    return null;
  }
  catch (error) {
    return (error as Error).message;
  }
}

test.describe('BK-512: The Owner deletes one of several workspaces', () => {
  let subject: OwnedWorkspaceWithContent['workspace'] | null = null;
  let memberOnly: MemberOnlyWorkspace | null = null;

  test.beforeEach(async ({ page, request }) => {
    const steps = new WorkspaceDeletionSteps({ page, request });
    memberOnly = await steps.createMemberOnlyWorkspace(page.request);
    // After the invite: accepting it made the member-only workspace the active one
    subject = await steps.createOwnedWorkspace({ makeActive: true });
  });

  test.afterEach(async ({ page, request }) => {
    const steps = new WorkspaceDeletionSteps({ page, request });
    const errors: unknown[] = [];
    try {
      if (subject) {
        let deleted = false;
        try {
          deleted = await steps.isWorkspaceGone(subject.id);
        }
        catch {
          // Unknown state: fall through to the normal cleanup rather than leak the workspace
        }
        await steps.cleanupDeletionWorkspace({ workspace: subject, deleted });
      }
    }
    catch (error) {
      errors.push(error);
    }
    finally {
      subject = null;
    }
    try {
      if (memberOnly) {
        await steps.releaseMemberOnlyWorkspace({ memberOnly, ownerRequest: page.request });
      }
    }
    catch (error) {
      errors.push(error);
    }
    finally {
      memberOnly = null;
    }
    if (errors.length > 0) {
      throw errors[0];
    }
  });

  test('BK-937: should remove the workspace, land the Owner in another one they are told about and record the deletion', async ({ test: fixture }) => {
    test.slow();
    const workspace = subject!;
    const [meResponse, me] = await fixture.api.auth.getCurrentUser();
    expect(meResponse.status(), 'GET /me').toBe(200);
    const [listResponse, list] = await fixture.api.workspaces.listWorkspaces();
    expect(listResponse.status(), 'GET /workspaces').toBe(200);
    const remaining = list.workspaces.filter(item => item.id !== workspace.id).map(({ id, name }) => ({ id, name }));
    // Only the expected landing: the oldest remaining workspace, not the member-only one joined just now
    const expectedLanding = remaining.find(item => item.id !== memberOnly!.workspace.id);
    if (!expectedLanding) {
      throw new Error('BK-937 needs the Owner to belong to another workspace besides the subject and the member-only one.');
    }
    const snapshotsBefore: Record<string, unknown> = {
      [expectedLanding.id]: await fixture.api.workspaceDeletion.captureContentSnapshot(expectedLanding.id),
    };

    await fixture.ui.workspacesSettings.deleteOwnedWorkspaceAsOwner({
      workspace,
      memberOnly: memberOnly!.workspace,
      remaining,
      snapshotsBefore,
      readSnapshot: async id => fixture.api.workspaceDeletion.captureContentSnapshot(id),
      ownerUserId: me.user.id,
      readDeletionAudit: async () => readWorkspaceDeletions(workspace.id),
    });
  });
});

test.describe('BK-512: The Owner deletes the only workspace', () => {
  test('BK-946: should take the Owner to onboarding, still signed in, when their only workspace is deleted', async ({ browser }) => {
    const unavailable = loneOwnerUnavailable();
    test.skip(unavailable !== null, unavailable ?? '');
    const context = await new WorkspaceDeletionSteps().openLoneOwnerContext(browser);
    const page = await context.newPage();
    const steps = new WorkspaceDeletionSteps({ page });
    let workspace: OwnedWorkspaceWithContent['workspace'] | null = null;
    try {
      workspace = await steps.createOwnedWorkspace({ makeActive: true });
      await new WorkspacesSettingsPage({ page }).deleteOnlyWorkspaceLandingOnOnboarding({ workspace });
    }
    finally {
      try {
        // The account must end with zero workspaces, whatever happened
        if (workspace) {
          let gone = false;
          try {
            gone = await steps.isWorkspaceGone(workspace.id);
          }
          catch {
            // Unknown state: attempt the cleanup anyway
          }
          if (!gone) {
            await steps.cleanupDeletionWorkspace({ workspace, deleted: false });
          }
        }
      }
      finally {
        await context.close();
      }
    }
  });
});
