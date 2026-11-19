import type { ParentChain } from '@api/IdempotencyApi';
import type { APIRequestContext } from '@playwright/test';

import { IDEMPOTENCY_SLUG_PREFIX, IDEMPOTENCY_TARGETS } from '@data/constants';
import { IdempotencySteps } from '@steps/IdempotencySteps';
import { test } from '@TestFixture';

test.describe('BK-667: A retry with the same Idempotency-Key replays the first answer', { tag: ['@critical'] }, () => {
  const runStartedAt = Date.now();
  const createdWorkspaceIds: string[] = [];
  let setup: APIRequestContext | null = null;
  let chain: ParentChain | null = null;

  test.beforeAll(async () => {
    setup = await IdempotencySteps.openSetupSession();
    chain = await new IdempotencySteps({ request: setup }).createParentChain();
  });

  test.afterAll(async () => {
    const context = setup;
    if (context === null) {
      return;
    }
    const steps = new IdempotencySteps({ request: context });
    await IdempotencySteps.settleAll('BK-667 tc9 cleanups', [
      async () => steps.cleanupWorkspaces([...createdWorkspaceIds, ...(chain ? [chain.workspace.id] : [])]),
      async () => steps.cleanupStaleWorkspacesWithSlugPrefix({ slugPrefix: `${IDEMPOTENCY_SLUG_PREFIX}tc9-`, runStartedAt }),
      async () => context.dispose(),
    ]);
  });

  for (const target of IDEMPOTENCY_TARGETS) {
    test(`BK-1698: should replay the first status and body and keep one ${target} when the same key and payload are sent twice`, async ({ api }) => {
      await api.idempotency.replayCreateWithSameKey({
        target,
        parents: chain!,
        onWorkspaceCreated: workspaceId => createdWorkspaceIds.push(workspaceId),
      });
    });
  }
});
