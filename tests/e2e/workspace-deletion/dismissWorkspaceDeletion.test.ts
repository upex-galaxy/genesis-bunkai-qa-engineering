/**
 * Workspace Deletion - Dismissing the confirmation changes nothing (BK-512, Wave 2)
 *
 * The workspace holds seeded content, so "nothing changed" is a real comparison
 * (content read through the API before and after), not an empty one. The
 * deletion is never confirmed, so the workspace is soft-deleted in afterEach.
 *
 * Project: e2e (depends on ui-setup, api-setup)
 */

import type { OwnedWorkspaceWithContent } from '@steps/WorkspaceDeletionSteps';

import { WorkspaceDeletionSteps } from '@steps/WorkspaceDeletionSteps';
import { test } from '@TestFixture';

test.describe('BK-512: Dismissing the delete confirmation', () => {
  let seeded: OwnedWorkspaceWithContent | null = null;

  test.beforeEach(async ({ page, request }) => {
    seeded = await new WorkspaceDeletionSteps({ page, request }).createOwnedWorkspaceWithContent({ makeActive: true });
  });

  test.afterEach(async ({ request }) => {
    if (seeded) {
      await new WorkspaceDeletionSteps({ request }).cleanupDeletionWorkspace({ workspace: seeded.workspace, deleted: false });
      seeded = null;
    }
  });

  test('BK-930: should leave the workspace and its contents intact when the Owner dismisses the confirmation after typing the exact name', async ({ test: fixture }) => {
    const workspace = seeded!.workspace;
    await fixture.ui.workspacesSettings.dismissDeleteConfirmationChangingNothing({
      workspace,
      readContentSnapshot: async () => fixture.api.workspaceDeletion.captureContentSnapshot(workspace.id),
    });
  });
});
