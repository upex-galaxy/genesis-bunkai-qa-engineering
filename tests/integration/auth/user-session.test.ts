/**
 * KATA Architecture - User Session Integration Tests (BK-166)
 *
 * Validates that the credentials produced by api-setup work:
 * - the PAT from api-state.json authenticates as Bearer
 * - without any credential the API answers 401
 * - a fresh sign-in mints a new PAT
 *
 * Project: integration (depends on api-setup)
 */

import { config, expect, test } from '@TestFixture';

test.describe('BK-166: User Session API', { tag: ['@critical'] }, () => {
  test('BK-166: should get the current user with the stored PAT', async ({ api }) => {
    // The PAT is loaded from api-state.json by the api fixture
    const [response, me] = await api.auth.getCurrentUser();

    expect(response.status()).toBe(200);
    expect(me.user.id).toBeTruthy();
    expect(me.user.email).toBe(config.testUser.email);
  });

  test('BK-166: should be able to re-authenticate', async ({ api }) => {
    api.clearAuthToken();

    const [response, signIn] = await api.auth.authenticateSuccessfully({
      email: config.testUser.email,
      password: config.testUser.password,
      pat_name: 'qa-automation-reauth',
      pat_expires_in_days: 1,
    });

    expect(response.status()).toBe(200);
    expect(signIn.pat.token).toMatch(/^bk_pat_/);
  });
});

test.describe('BK-166: User Session API (no credentials)', { tag: ['@critical'] }, () => {
  // Drop the session cookie the integration project loads by default
  test.use({ storageState: { cookies: [], origins: [] } });

  test('BK-166: should answer 401 without any credential', async ({ api }) => {
    api.clearAuthToken();

    const [response] = await api.auth.getCurrentUser();

    expect(response.status()).toBe(401);
  });
});
