/**
 * Workspace Deletion - Every kind of content is unreachable once deleted (BK-512, Wave 1)
 *
 * ONE test on purpose: the workspace is seeded with one of every child entity,
 * each entity's routes are read BEFORE the deletion (a 404 afterwards would prove
 * nothing otherwise), the Owner deletes once, and the ATC then runs once per
 * entity type, sequentially. Per-row tests would each need their own workspace
 * and a failing precondition would write no row while the others synced a false PASS.
 *
 * The deletion is the cleanup (no second DELETE).
 *
 * Project: integration / smoke (depends on api-setup)
 */

import type { OwnedWorkspaceWithContent } from '@steps/WorkspaceDeletionSteps';

import { WorkspaceDeletionSteps } from '@steps/WorkspaceDeletionSteps';
import { expect, test } from '@TestFixture';

test.describe('BK-512: A deleted workspace holds nothing reachable', { tag: ['@critical'] }, () => {
  let seeded: OwnedWorkspaceWithContent | null = null;
  let deleted = false;

  test.beforeEach(async ({ request }) => {
    deleted = false;
    seeded = await new WorkspaceDeletionSteps({ request }).createOwnedWorkspaceWithContent({ withEverything: true });
  });

  test.afterEach(async ({ request }) => {
    if (seeded) {
      await new WorkspaceDeletionSteps({ request }).cleanupDeletionWorkspace({ workspace: seeded.workspace, deleted });
      seeded = null;
    }
  });

  test('BK-938: should make every kind of content unreachable when the Owner deletes the workspace', async ({ api, request }) => {
    test.slow();
    const steps = new WorkspaceDeletionSteps({ request });
    const targets = steps.probeTargets(seeded!);

    const reachableBefore: boolean[] = [];
    for (const target of targets) {
      const answers = await api.workspaceDeletion.probeEntity(target);
      reachableBefore.push(answers.every(answer => answer.status === 200));
    }

    await steps.deleteAsOwner(seeded!.workspace);
    deleted = true;

    const [workspaceResponse] = await api.workspaces.getWorkspaceById(seeded!.workspace.id);
    expect(workspaceResponse.status(), 'GET /workspaces/{id}: the workspace itself answers 404').toBe(404);

    // The ATC is softFail: a failing row records FAIL for BK-938 and answers undefined
    const failedEntities: string[] = [];
    for (const [index, target] of targets.entries()) {
      const answers = await api.workspaceDeletion.verifyEntityUnreachableAfterDeletion({
        target,
        reachableBefore: reachableBefore[index],
      });
      if (answers === undefined) {
        failedEntities.push(target.entity);
      }
    }
    expect(failedEntities, 'every kind of content is unreachable after the deletion').toEqual([]);
  });
});
