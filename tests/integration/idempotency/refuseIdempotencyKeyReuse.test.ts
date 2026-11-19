import type { ParentChain } from '@api/IdempotencyApi';
import type { APIRequestContext } from '@playwright/test';

import { IDEMPOTENCY_SLUG_PREFIX, IDEMPOTENCY_TARGETS } from '@data/constants';
import { IdempotencySteps } from '@steps/IdempotencySteps';
import { test } from '@TestFixture';

test.describe('BK-667: A key reused with a different payload is a conflict', { tag: ['@critical'] }, () => {
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
    await IdempotencySteps.settleAll('BK-667 tc12 cleanups', [
      async () => steps.cleanupWorkspaces([...createdWorkspaceIds, ...(chain ? [chain.workspace.id] : [])]),
      async () => steps.cleanupStaleWorkspacesWithSlugPrefix({ slugPrefix: `${IDEMPOTENCY_SLUG_PREFIX}tc12-`, runStartedAt }),
      async () => context.dispose(),
    ]);
  });

  for (const target of IDEMPOTENCY_TARGETS) {
    test(`BK-1701: should answer 409 and not write the second ${target} when a key is reused with a different payload`, async ({ api }) => {
      await api.idempotency.refuseKeyReuseWithDifferentPayload({
        target,
        parents: chain!,
        onWorkspaceCreated: workspaceId => createdWorkspaceIds.push(workspaceId),
      });
    });
  }
});
