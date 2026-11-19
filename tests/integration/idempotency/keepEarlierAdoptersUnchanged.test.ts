import type { EarlierAdopterParents } from '@api/IdempotencyApi';
import type { APIRequestContext } from '@playwright/test';

import { EARLIER_ADOPTER_TARGETS } from '@data/constants';
import { IdempotencySteps } from '@steps/IdempotencySteps';
import { test } from '@TestFixture';

test.describe('BK-667: The earlier Idempotency-Key adopters keep their contract', () => {
  let setup: APIRequestContext | null = null;
  let parents: EarlierAdopterParents | null = null;
  let workspaceId: string | null = null;

  test.beforeAll(async () => {
    setup = await IdempotencySteps.openSetupSession();
    const steps = new IdempotencySteps({ request: setup });
    const chain = await steps.createParentChain();
    workspaceId = chain.workspace.id;
    parents = await steps.seedEarlierAdopterParents(chain);
  });

  test.afterAll(async () => {
    if (setup === null) {
      return;
    }
    try {
      await new IdempotencySteps({ request: setup }).cleanupWorkspaces(workspaceId ? [workspaceId] : []);
    }
    finally {
      await setup.dispose();
    }
  });

  for (const target of EARLIER_ADOPTER_TARGETS) {
    test(`BK-1718: should keep the Idempotency-Key contract of POST /${target} unchanged when the key is missing, malformed, replayed or reused`, async ({ api }) => {
      await api.idempotency.verifyEarlierAdopterContractUnchanged({ target, parents: parents! });
    });
  }
});
