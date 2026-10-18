/**
 * KATA Architecture - API Auth Setup (Project)
 *
 * Authenticates headlessly via AuthApi.authenticateSuccessfully() ATC.
 * One POST /api/v1/auth/signin yields BOTH Bunkai credentials:
 * - the Supabase session cookie -> saved as storageState (api-session.json),
 *   loaded by the integration project for cookie-only routes
 * - a 1-day PAT -> saved to api-state.json, sent as Bearer by the fixtures
 *
 * Dependencies: global-setup
 * Dependents: integration, smoke
 */

import type { ApiState } from '@data/types';

import { writeFileSync } from 'node:fs';
import { test as setup } from '@TestFixture';
import { attachRequestResponseToAllure } from '@utils/allure';
import { config } from '@variables';

const apiStateFile = config.auth.apiStatePath;
const apiSessionFile = config.auth.apiSessionPath;
const PAT_TTL_DAYS = 1;

setup('API Setup: authenticate via API', async ({ api, request }) => {
  console.log('[API Setup] Starting API authentication...');
  console.log(`[API Setup] Target: ${config.apiUrl}${config.auth.loginEndpoint}`);

  const credentials = {
    email: config.testUser.email,
    password: config.testUser.password,
    pat_name: 'qa-automation',
    pat_expires_in_days: PAT_TTL_DAYS,
  };
  const [response, signIn] = await api.auth.authenticateSuccessfully(credentials);

  // Attach to Allure for debugging (never the secrets)
  await attachRequestResponseToAllure({
    url: response.url(),
    method: 'POST',
    responseBody: { user: signIn.user, pat: { id: signIn.pat.id, scopes: signIn.pat.scopes } },
    requestBody: { email: credentials.email, password: '***' },
  });

  // Session cookie for cookie-only routes
  await request.storageState({ path: apiSessionFile });
  console.log(`[API Setup] Session cookie saved to ${apiSessionFile}`);

  // PAT for Bearer routes
  const apiState: ApiState = {
    token: signIn.pat.token,
    tokenType: 'Bearer',
    expiresIn: PAT_TTL_DAYS * 86400,
    refreshToken: null,
    source: 'api-login',
    createdAt: new Date().toISOString(),
  };
  writeFileSync(apiStateFile, JSON.stringify(apiState, null, 2));
  console.log(`[API Setup] PAT saved to ${apiStateFile} (scopes: ${signIn.pat.scopes.join(', ')})`);
});
