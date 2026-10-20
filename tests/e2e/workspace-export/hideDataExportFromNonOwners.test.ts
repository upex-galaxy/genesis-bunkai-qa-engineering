/**
 * Workspace Data Export - Hidden from and refused to non-Owner roles (BK-508, Wave 2)
 *
 * Two identities per test: the Owner (the `test` fixture, .auth/user.json)
 * creates a synthetic workspace, prepares a completed export (so a refused
 * download cannot be a 404 in disguise) and invites the role account; the role
 * account (second browser context from .auth/role-<role>.json) accepts the
 * invite, switches to the workspace and looks. A fresh workspace per row: an
 * invite accept never demotes an existing member.
 *
 * TMS sync: every BK-1001 verification (the API refusals, the Owner-side "no job
 * enqueued" re-read and the UI check) runs INSIDE the BK-1001 ATC, so any
 * failure writes a FAIL row for that role. A check run outside it would abort
 * the test without a row, and the other roles' PASS rows would sync as PASSED.
 *
 * Cleanup: the role account leaves the workspace on its own session (finally),
 * because a soft-delete emails every active member; then the Owner soft-deletes
 * the workspace in afterEach, even on failure.
 *
 * Project: e2e-roles (depends on ui-setup, api-setup, roles-setup).
 * Run with `bun run test:e2e:roles`.
 */

import type { Workspace } from '@schemas/workspaces.types';

import { WorkspaceExportApi } from '@api/WorkspaceExportApi';
import { WorkspacesApi } from '@api/WorkspacesApi';
import { WorkspaceExportSteps } from '@steps/WorkspaceExportSteps';
import { config, expect, test } from '@TestFixture';
import { DataExportPage } from '@ui/DataExportPage';
import { ROLE_USER_NAMES } from '@variables';

test.describe('BK-508: Hide the Data export section from non-Owners', { tag: ['@critical'] }, () => {
  let workspace: Workspace | null = null;

  test.beforeEach(async ({ request }) => {
    workspace = await new WorkspaceExportSteps({ request }).createSyntheticWorkspace();
  });

  test.afterEach(async ({ request }) => {
    if (workspace) {
      await new WorkspaceExportSteps({ request }).cleanupSyntheticWorkspace(workspace);
      workspace = null;
    }
  });

  for (const role of ROLE_USER_NAMES) {
    test(`BK-1001: should hide the Data export section from a workspace ${role}`, async ({ browser, request }) => {
      // Budget: precondition ~60 s (workspace, export settle up to 30 s, invite) + the ATC's
      // own bound ~121 s + cleanup ~20 s, so the ATC always throws (FAIL row) before this fires
      test.setTimeout(240_000);
      const workspaceId = workspace!.id;
      const owner = new WorkspaceExportSteps({ request });
      const ownerExport = await owner.prepareCompletedExport(workspaceId);

      const roleContext = await browser.newContext({
        baseURL: config.baseUrl,
        storageState: config.auth.roleStatePath(role),
      });
      const rolePage = await roleContext.newPage();
      try {
        await owner.grantRoleInWorkspace({
          workspaceId,
          email: config.roleUsers[role].email,
          role,
          memberRequest: rolePage.request,
        });

        // Precondition proven: the role account really is a member with that role
        const [listResponse, list] = await new WorkspacesApi({ request: rolePage.request }).listWorkspaces();
        expect(listResponse.status()).toBe(200);
        expect(list.workspaces.find(item => item.id === workspaceId)?.role, `the account is a ${role}`).toBe(role);

        // Every BK-1001 check (API refusals, no job enqueued, UI hidden) runs inside the ATC
        const ownerExportApi = new WorkspaceExportApi({ request });
        await new DataExportPage({ page: rolePage }).verifySectionHiddenForNonOwner({
          workspaceId,
          ownerExportId: ownerExport.id,
          readOwnerLatestExportId: async () => {
            const [response, latest] = await ownerExportApi.getExport(workspaceId);
            expect(response.status(), 'the Owner reads the latest export').toBe(200);
            return latest.export?.id ?? null;
          },
        });
      }
      finally {
        try {
          // End the role before the soft-delete, which would email every active member
          await new WorkspacesApi({ request: rolePage.request }).leaveWorkspace(workspaceId);
        }
        catch (error) {
          // A cleanup error must never mask the test's own failure
          console.warn(`[BK-1001] ${role}: could not leave the workspace (${error instanceof Error ? error.name : 'error'})`);
        }
        finally {
          await roleContext.close();
        }
      }
    });
  }
});
