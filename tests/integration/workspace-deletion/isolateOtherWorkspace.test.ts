/**
 * Workspace Deletion - A second owned workspace is untouched (BK-512, Wave 1)
 *
 * The Owner holds two workspaces, both with content; the `member` role account
 * holds a role in the second. The Owner deletes the first. The ATC then proves
 * the second workspace, its content and its member are exactly as before (the
 * snapshot is taken before the deletion, on the Owner's session; the member
 * reads on its own session).
 *
 * Cleanup: the member leaves the second workspace on its own session (a
 * soft-delete mails every active member), then the Owner deletes it. The first
 * is already deleted by the test.
 *
 * Project: integration-roles (depends on api-setup, roles-setup)
 * Run with `bun run test:integration:roles`.
 */

import type { OwnedWorkspaceWithContent } from '@steps/WorkspaceDeletionSteps';

import { WorkspacesApi } from '@api/WorkspacesApi';
import { WorkspaceDeletionSteps } from '@steps/WorkspaceDeletionSteps';
import { test } from '@TestFixture';

test.describe('BK-512: Deleting a workspace leaves the others alone', { tag: ['@critical'] }, () => {
  let subject: OwnedWorkspaceWithContent | null = null;
  let other: OwnedWorkspaceWithContent | null = null;
  let subjectDeleted = false;

  test.beforeEach(async ({ request }) => {
    subjectDeleted = false;
    const steps = new WorkspaceDeletionSteps({ request });
    subject = await steps.createOwnedWorkspaceWithContent();
    other = await steps.createOwnedWorkspaceWithContent();
  });

  test.afterEach(async ({ request }) => {
    const steps = new WorkspaceDeletionSteps({ request });
    const created = [
      subject ? { workspace: subject.workspace, deleted: subjectDeleted } : null,
      other ? { workspace: other.workspace, deleted: false } : null,
    ];
    subject = null;
    other = null;
    const errors: unknown[] = [];
    for (const entry of created) {
      if (entry) {
        try {
          await steps.cleanupDeletionWorkspace(entry);
        }
        catch (error) {
          errors.push(error);
        }
      }
    }
    if (errors.length > 0) {
      throw errors[0];
    }
  });

  test('BK-960: should leave a second owned workspace and its members untouched when the first is deleted', async ({ api, request }) => {
    test.slow();
    const steps = new WorkspaceDeletionSteps({ request });
    const otherId = other!.workspace.id;
    const session = await steps.openRoleSession('member');
    const member = new WorkspacesApi({ request: session });
    try {
      await steps.grantTeammate({ workspaceId: otherId, role: 'member', roleUser: 'member', memberRequest: session });
      const before = await api.workspaceDeletion.captureContentSnapshot(otherId);

      await steps.deleteAsOwner(subject!.workspace);
      subjectDeleted = true;

      await api.workspaceDeletion.leaveOtherWorkspaceUntouched({
        otherWorkspaceId: otherId,
        before,
        memberRole: 'member',
        readAsMember: async () => {
          const [listResponse, list] = await member.listWorkspaces();
          const [readResponse] = await member.getWorkspaceById(otherId);
          return {
            role: listResponse.status() === 200 ? (list.workspaces.find(item => item.id === otherId)?.role ?? null) : null,
            readStatus: readResponse.status(),
          };
        },
      });
    }
    finally {
      try {
        await member.leaveWorkspace(otherId);
      }
      catch (error) {
        console.warn(`[BK-960] member: could not leave the workspace (${error instanceof Error ? error.name : 'error'})`);
      }
      finally {
        await session.dispose();
      }
    }
  });
});
