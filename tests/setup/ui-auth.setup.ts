/**
 * KATA Architecture - UI Auth Setup
 *
 * Authenticates through the real Bunkai login page and saves the browser
 * session (Supabase cookie) as storageState for E2E tests.
 *
 * The Bearer PAT is NOT produced here: api-setup owns it (api-state.json).
 *
 * Dependencies: global-setup
 * Dependents: e2e, smoke
 */

import { test as setup } from '@TestFixture';
import { config } from '@variables';

const storageStateFile = config.auth.storageStatePath;

setup('UI Setup: authenticate via UI', async ({ ui, page }) => {
  console.log('[UI Setup] Starting UI authentication...');
  console.log('[UI Setup] Target: /login');

  await ui.login.goto();

  const credentials = {
    email: config.testUser.email,
    password: config.testUser.password,
  };
  await ui.login.loginSuccessfully(credentials);
  console.log('[UI Setup] UI login successful');

  await page.context().storageState({ path: storageStateFile });
  console.log(`[UI Setup] Storage state saved to ${storageStateFile}`);
  console.log(`[UI Setup] Current URL: ${page.url()}`);
});
