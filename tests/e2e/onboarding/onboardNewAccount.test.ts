import { SIGNUP_OTP_TIMEOUT_MS } from '@data/constants';
import { IdempotencySteps } from '@steps/IdempotencySteps';
import { ApiFixture, expect, test } from '@TestFixture';
import { isInboxReadable, waitForSignupOtp } from '@utils/inbox';
import { config } from '@variables';

test.describe('BK-667: A brand-new account completes onboarding', { tag: ['@nightly'] }, () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let createdWorkspaceId: string | null = null;

  test.afterEach(async ({ test: fixture }) => {
    if (createdWorkspaceId !== null) {
      const workspaceId = createdWorkspaceId;
      createdWorkspaceId = null;
      await new IdempotencySteps({ request: fixture.page.request }).cleanupWorkspaces([workspaceId]);
    }
  });

  test('BK-1714: should create the first workspace and land in the product signed in when a brand-new account completes onboarding', async ({ test: fixture }) => {
    test.skip(
      !(await isInboxReadable()),
      `BK-1714 needs ${config.qaInbox.apiKeyVarName} with Resend receiving access to read the sign-up code (the key is unset or rejected by the Resend API)`,
    );
    test.slow();
    const credentials = fixture.data.createSignupCredentials();
    await fixture.ui.login.createAccountThroughSignup({
      ...credentials,
      readCode: async () => waitForSignupOtp(credentials.email, { timeoutMs: SIGNUP_OTP_TIMEOUT_MS }),
    });
    const slug = fixture.data.createIdempotencyMarker('tc25');
    const name = `QA Auto BK-667 ${slug}`;
    await fixture.ui.onboarding.completeOnboardingCreatingFirstWorkspace({
      name,
      slug,
      onCreated: (workspaceId) => { createdWorkspaceId = workspaceId; },
    });

    const newAccount = new ApiFixture({ request: fixture.page.request });
    const [meResponse, me] = await newAccount.auth.getCurrentUser();
    expect(meResponse.status(), 'the new account is signed in').toBe(200);
    expect(me.workspaces.map(item => ({ name: item.name, owner: item.owner_user_id })), 'exactly one workspace, owned by the new user')
      .toEqual([{ name, owner: me.user.id }]);
  });
});
