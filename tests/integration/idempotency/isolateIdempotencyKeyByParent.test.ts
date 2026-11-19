import type { ParentChain } from '@api/IdempotencyApi';
import type { APIRequestContext } from '@playwright/test';

import { PARENT_SCOPED_TARGETS } from '@data/constants';
import { IdempotencySteps } from '@steps/IdempotencySteps';
import { test } from '@TestFixture';

test.describe('BK-667: A key reused under another parent is refused, never replayed', { tag: ['@critical'] }, () => {
  let setup: APIRequestContext | null = null;
  const chains: ParentChain[] = [];

  test.beforeAll(async () => {
    setup = await IdempotencySteps.openSetupSession();
    const steps = new IdempotencySteps({ request: setup });
    chains.push(await steps.createParentChain());
    chains.push(await steps.createParentChain());
  });

  test.afterAll(async () => {
    if (setup === null) {
      return;
    }
    try {
      await new IdempotencySteps({ request: setup }).cleanupWorkspaces(chains.map(chain => chain.workspace.id));
    }
    finally {
      await setup.dispose();
    }
  });

  for (const target of PARENT_SCOPED_TARGETS) {
    test(`BK-1705: should answer 409 and create nothing in the second parent when a ${target} key is reused under another parent`, async ({ api }) => {
      await api.idempotency.refuseKeyReuseUnderAnotherParent({ target, parentA: chains[0], parentB: chains[1] });
    });
  }
});
