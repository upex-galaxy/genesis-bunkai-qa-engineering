import type { ParentChain } from '@api/IdempotencyApi';
import type { APIRequestContext } from '@playwright/test';

import { IDEMPOTENCY_SLUG_PREFIX, IDEMPOTENCY_TARGETS } from '@data/constants';
import { IdempotencySteps } from '@steps/IdempotencySteps';
import { test } from '@TestFixture';

test.describe('BK-667: A create without an Idempotency-Key is refused', { tag: ['@critical'] }, () => {
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
    await IdempotencySteps.settleAll('BK-667 tc1 cleanups', [
      async () => steps.cleanupWorkspaces([...createdWorkspaceIds, ...(chain ? [chain.workspace.id] : [])]),
      async () => steps.cleanupStaleWorkspacesWithSlugPrefix({ slugPrefix: `${IDEMPOTENCY_SLUG_PREFIX}tc1-`, runStartedAt }),
      async () => context.dispose(),
    ]);
  });

  for (const target of IDEMPOTENCY_TARGETS) {
    test(`BK-1690: should refuse a ${target} create with 400 idempotency_key_required and write nothing when the header is absent`, async ({ api }) => {
      await api.idempotency.refuseCreateWithoutKey({
        target,
        parents: chain!,
        onWorkspaceCreated: workspaceId => createdWorkspaceIds.push(workspaceId),
      });
    });
  }
});
