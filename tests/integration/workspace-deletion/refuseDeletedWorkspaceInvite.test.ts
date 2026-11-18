/**
 * Workspace Deletion - An invite to a deleted workspace is refused (BK-512, Wave 1)
 *
 * The invitee is the `viewer` role account (own session from roles-setup). The
 * invite is addressed to the viewer's OWN email in a fresh workspace the viewer
 * does not belong to, so before the deletion it is redeemable by exactly that
 * account (positive control: it is `pending` and the viewer is not a member).
 * The deletion is then the only reason for a refusal. Both the deleted-workspace
 * invite and a random, never-issued token are redeemed on the viewer's session
 * and must be refused identically. The refusal means the account never joins,
 * so nothing is left to clean on the viewer side.
 *
 * The deletion is the cleanup (a second DELETE would 404).
 *
 * Project: integration-roles (depends on api-setup, roles-setup)
 * Run with `bun run test:integration:roles`.
 */

import type { Workspace } from '@schemas/workspaces.types';

import { WorkspacesApi } from '@api/WorkspacesApi';
import { WorkspaceDeletionSteps } from '@steps/WorkspaceDeletionSteps';
import { config, expect, test } from '@TestFixture';

test.describe('BK-512: A deleted workspace refuses its outstanding invites', { tag: ['@critical'] }, () => {
  let workspace: Workspace | null = null;
  let deleted = false;

  test.beforeEach(async ({ request }) => {
    deleted = false;
    workspace = await new WorkspaceDeletionSteps({ request }).createOwnedWorkspace();
  });

  test.afterEach(async ({ request }) => {
    if (workspace) {
      await new WorkspaceDeletionSteps({ request }).cleanupDeletionWorkspace({ workspace, deleted });
      workspace = null;
    }
  });

  test('BK-956: should refuse an outstanding invite to a deleted workspace exactly like an invite that never existed', async ({ api, request }) => {
    const steps = new WorkspaceDeletionSteps({ request });
    const invitee = await steps.openRoleSession('viewer');
    try {
      const inviteeApi = new WorkspacesApi({ request: invitee });
      const listInviteeWorkspaceIds = async (): Promise<string[]> => {
        const [response, list] = await inviteeApi.listWorkspaces();
        expect(response.status(), 'the invitee lists their workspaces').toBe(200);
        return list.workspaces.map(item => item.id);
      };

      // Precondition: the viewer is not a member of the fresh workspace
      expect(await listInviteeWorkspaceIds(), 'precondition: the viewer does not belong to the fresh workspace')
        .not
        .toContain(workspace!.id);

      const { inviteId, token } = await api.workspaces.createInvite({
        workspaceId: workspace!.id,
        email: config.roleUsers.viewer.email,
        role: 'member',
      });
      // Positive control: before the deletion the invite is redeemable (pending)
      expect(
        await api.workspaceDeletion.readInviteStatus({ workspaceId: workspace!.id, inviteId }),
        'positive control: the invite to the viewer is pending before the deletion',
      ).toBe('pending');

      await steps.deleteAsOwner(workspace!);
      deleted = true;

      await api.workspaceDeletion.refuseDeletedWorkspaceInvite({
        workspaceId: workspace!.id,
        workspaceName: workspace!.name,
        token,
        acceptAsInvitee: async candidate => inviteeApi.acceptInviteRaw({ token: candidate }),
        listInviteeWorkspaceIds,
      });
    }
    finally {
      await invitee.dispose();
    }
  });
});
