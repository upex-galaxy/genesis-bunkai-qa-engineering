import type { ParentChain } from '@api/IdempotencyApi';
import type { APIRequestContext } from '@playwright/test';

import { EXPIRING_KEY_TARGETS, IDEMPOTENCY_ENDPOINTS } from '@data/constants';
import { IdempotencySteps } from '@steps/IdempotencySteps';
import { expect, test } from '@TestFixture';
import { ageIdempotencyKey } from '@utils/idempotencyClock';
import { config } from '@variables';

test.describe('BK-667: A key past its 24h window is a new request', () => {
  let setup: APIRequestContext | null = null;
  let chain: ParentChain | null = null;

  test.beforeAll(async () => {
    test.skip(
      config.idempotencyDb.connection === null,
      `BK-1700 needs ${config.idempotencyDb.varNames.join(', ')} (qa_inspector_rw, staging) to age the key`,
    );
    setup = await IdempotencySteps.openSetupSession();
    chain = await new IdempotencySteps({ request: setup }).createParentChain();
  });

  test.afterAll(async () => {
    if (setup === null) {
      return;
    }
    try {
      await new IdempotencySteps({ request: setup }).cleanupWorkspaces(chain ? [chain.workspace.id] : []);
    }
    finally {
      await setup.dispose();
    }
  });

  for (const target of EXPIRING_KEY_TARGETS) {
    test(`BK-1700: should create a new ${target} when the same key and payload are sent after the key's 24h window`, async ({ api }) => {
      const [meResponse, me] = await api.auth.getCurrentUser();
      expect(meResponse.status(), 'caller identity for the key row').toBe(200);
      await api.idempotency.createNewRecordAfterKeyExpired({
        target,
        parents: chain!,
        ageKey: async key => ageIdempotencyKey({ userId: me.user.id, endpoint: IDEMPOTENCY_ENDPOINTS[target], key }),
      });
    });
  }
});
