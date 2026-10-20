/**
 * KATA Architecture - Non-Owner Roles Auth Setup (Project)
 *
 * Signs in each non-Owner role account (admin, member, viewer) headlessly and
 * saves its Supabase session cookie as `.auth/role-<role>.json`. Tests open a
 * second browser context from that file when they need a second identity next
 * to the Owner (BK-1001).
 *
 * The sign-in is a raw POST on this project's own cookieless request context:
 * no Owner Bearer PAT rides along (the `api` fixture would inherit it from
 * api-state.json), and the BK-311 ATC is not invoked (setup is not a test case;
 * it would record three extra BK-311 results). The route always mints a PAT;
 * it is never stored and is revoked right away (204 required, else the setup
 * fails). Nothing from the response is attached or logged, and the project
 * records no trace, video or screenshot (playwright.config.ts).
 *
 * Dependencies: global-setup
 * Dependents: e2e-roles
 */

import type { SignInPayload, SignInResponse } from '@schemas/auth.types';

import { TokensApi } from '@api/TokensApi';
import { expect, test as setup } from '@TestFixture';
import { config, ROLE_USER_NAMES } from '@variables';

const PAT_TTL_DAYS = 1;

for (const role of ROLE_USER_NAMES) {
  setup(`Roles Setup: authenticate the ${role} account via API`, async ({ request }) => {
    const user = config.roleUsers[role];
    const payload: SignInPayload = {
      email: user.email,
      password: user.password,
      pat_name: `qa-automation-${role}`,
      pat_expires_in_days: PAT_TTL_DAYS,
    };
    const response = await request.post(`${config.apiUrl}${config.auth.loginEndpoint}`, { data: payload });
    expect(response.status(), `${role} sign-in`).toBe(200);
    expect(response.headersArray().some(h => h.name.toLowerCase() === 'set-cookie'), `${role} session cookie`).toBe(true);
    const body = (await response.json()) as SignInResponse;
    expect(body.user.email?.toLowerCase(), `${role} sign-in: the requested account`).toBe(user.email.toLowerCase());

    // The minted PAT is never used: revoke it (cookie-only route). Only a 204
    // proves it is dead; a just-minted PAT has no reason to be gone already.
    await new TokensApi({ request }).revokeToken(body.pat.id, { requireRevoked: true });

    const stateFile = config.auth.roleStatePath(role);
    await request.storageState({ path: stateFile });
    console.log(`[Roles Setup] ${role} session cookie saved to ${stateFile}`);
  });
}
