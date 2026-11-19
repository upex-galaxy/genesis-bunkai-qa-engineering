import { IDEMPOTENCY_SLUG_PREFIX } from '@data/constants';
import { IdempotencySteps } from '@steps/IdempotencySteps';
import { test } from '@TestFixture';
import { config } from '@variables';

function bootstrapUserUnavailable(): string | null {
  try {
    void config.bootstrapUser;
    return null;
  }
  catch (error) {
    return (error as Error).message;
  }
}

test.describe('BK-667: A fresh PAT bootstraps the first workspace', { tag: ['@critical'] }, () => {
  test('BK-1715: should create the first workspace over the API when a fresh PAT of an account with no workspace sends an Idempotency-Key', async () => {
    const unavailable = bootstrapUserUnavailable();
    test.skip(unavailable !== null, unavailable ?? '');
    const steps = new IdempotencySteps();
    const fresh = await steps.openFreshPatContext();
    try {
      const payload = steps.data.createWorkspacePayload({ prefix: `${IDEMPOTENCY_SLUG_PREFIX}tc26-` });
      await fresh.idempotency.bootstrapFirstWorkspaceWithFreshPat({ payload, userId: fresh.userId });
    }
    finally {
      await steps.releaseFreshPatContext(fresh);
    }
  });
});
