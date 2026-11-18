/**
 * Workspace Deletion - Non-Owners cannot delete a workspace (BK-512, Wave 1)
 *
 * One row per role (admin, member, viewer). Two identities per test: the Owner
 * (the `api` fixture) creates a synthetic workspace and invites the role account;
 * the role account (own request context from .auth/role-<role>.json) accepts and
 * then calls DELETE on its own session. The Owner's PAT, sent alone on a
 * cookieless context, proves the Bearer refusal. Every verification (both
 * refusals and the Owner-side "still alive" re-read) runs INSIDE the ATC.
 *
 * Cleanup: the role leaves on its own session (a refused delete means the
 * workspace is alive, so leaving is allowed; a soft-delete would mail every
 * active member), the PAT is revoked, then the Owner soft-deletes the workspace.
 *
 * Project: integration-roles (depends on api-setup, roles-setup)
 * Run with `bun run test:integration:roles`.
 */

import type { Workspace } from '@schemas/workspaces.types';

import { WorkspacesApi } from '@api/WorkspacesApi';
import { WorkspaceDeletionSteps } from '@steps/WorkspaceDeletionSteps';
import { test } from '@TestFixture';
import { ROLE_USER_NAMES } from '@variables';

test.describe('BK-512: Only the Owner can delete a workspace', { tag: ['@critical'] }, () => {
  let workspace: Workspace | null = null;
  let tokenId: string | null = null;

  test.beforeEach(async ({ request }) => {
    workspace = await new WorkspaceDeletionSteps({ request }).createOwnedWorkspace();
  });

  test.afterEach(async ({ api, request }) => {
    try {
      if (tokenId) {
        await api.tokens.revokeToken(tokenId);
      }
    }
    finally {
      tokenId = null;
      if (workspace) {
        await new WorkspaceDeletionSteps({ request }).cleanupDeletionWorkspace({ workspace, deleted: false });
        workspace = null;
      }
    }
  });

  for (const role of ROLE_USER_NAMES) {
    test(`BK-922: should refuse a direct delete request when the caller is a workspace ${role}`, async ({ api, request }) => {
      test.slow();
      const steps = new WorkspaceDeletionSteps({ request });
      const session = await steps.openRoleSession(role);
      const member = new WorkspacesApi({ request: session });
      try {
        await steps.grantTeammate({ workspaceId: workspace!.id, role, roleUser: role, memberRequest: session });
        const pat = await api.tokens.issueToken({
          name: api.data.createTokenName(),
          scopes: ['atc:read', 'workspace:admin'],
          workspaceId: workspace!.id,
          expiresInDays: 1,
        });
        tokenId = pat.id;

        await api.workspaceDeletion.rejectDeleteByNonOwner({
          workspaceId: workspace!.id,
          workspaceName: workspace!.name,
          role,
          token: pat.token,
          deleteAsMember: async () => member.deleteWorkspaceRaw(workspace!.id),
        });
      }
      finally {
        try {
          // End the role before the Owner's soft-delete, which would mail every active member
          await member.leaveWorkspace(workspace!.id);
        }
        catch (error) {
          // A cleanup error must never mask the test's own failure
          console.warn(`[BK-922] ${role}: could not leave the workspace (${error instanceof Error ? error.name : 'error'})`);
        }
        finally {
          await session.dispose();
        }
      }
    });
  }
});
