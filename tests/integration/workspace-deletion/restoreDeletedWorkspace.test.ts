/**
 * Workspace Deletion - Restore inside the 30-day window (BK-512, Wave 1)
 *
 * Real DELETE, then real restore (no backdating, no DB write). Only what the
 * Story states is asserted: the workspace, its content, its memberships and its
 * listing come back. PAT and invite state after a restore is NOT asserted.
 *
 * Cleanup is unconditional: whichever assertion failed (before or after the
 * restore), afterEach reads the workspace and deletes it when it is alive again;
 * a workspace that is already gone (404) needs nothing.
 *
 * Project: integration (depends on api-setup)
 */

import type { ContentSnapshot } from '@api/WorkspaceDeletionApi';
import type { OwnedWorkspaceWithContent } from '@steps/WorkspaceDeletionSteps';

import { WorkspaceDeletionSteps } from '@steps/WorkspaceDeletionSteps';
import { expect, test } from '@TestFixture';

test.describe('BK-512: The Owner restores a deleted workspace', () => {
  let seeded: OwnedWorkspaceWithContent | null = null;

  test.beforeEach(async ({ request }) => {
    seeded = await new WorkspaceDeletionSteps({ request }).createOwnedWorkspaceWithContent();
  });

  test.afterEach(async ({ api, request }) => {
    if (seeded) {
      const steps = new WorkspaceDeletionSteps({ request });
      try {
        const gone = await steps.isWorkspaceGone(seeded.workspace.id).catch(() => null);
        if (gone === null) {
          // The read threw: treat it as "not gone" and still delete, tolerating a 404
          const [response] = await api.workspaces.deleteWorkspaceRaw(seeded.workspace.id);
          expect([200, 404], `cleanup delete of ${seeded.workspace.id}`).toContain(response.status());
        }
        else {
          await steps.cleanupDeletionWorkspace({ workspace: seeded.workspace, deleted: gone });
        }
      }
      finally {
        seeded = null;
      }
    }
  });

  test('BK-981: should bring the workspace and everything it held back when the Owner restores it inside the 30-day window', async ({ api, request }) => {
    const steps = new WorkspaceDeletionSteps({ request });
    const contentBefore: ContentSnapshot = await api.workspaceDeletion.captureContentSnapshot(seeded!.workspace.id);

    await steps.deleteAsOwner(seeded!.workspace);

    await api.workspaceDeletion.restoreDeletedWorkspace({ workspace: seeded!.workspace, contentBefore });
  });
});
