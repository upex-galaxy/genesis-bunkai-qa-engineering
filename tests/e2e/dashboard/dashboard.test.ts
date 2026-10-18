/**
 * KATA Architecture - Authenticated Shell E2E Test (BK-166)
 *
 * Verifies that the browser session saved by ui-setup (.auth/user.json) is
 * reused: a protected page opens without bouncing to /login, and the API is
 * reachable from the same test with the stored PAT.
 */

import { config, expect, test } from '@TestFixture';

test.describe('BK-166: Authenticated shell', { tag: ['@critical'] }, () => {
  test('BK-166: should open a protected page with the saved session', async ({ page }) => {
    await page.goto('/projects');

    await expect(page).not.toHaveURL(/.*\/login.*/);
    await expect(page.getByTestId('account-menu-trigger')).toBeVisible();
  });

  test('BK-166: should reach the API from the same test with the stored PAT', async ({ test: fixture }) => {
    const [response, me] = await fixture.api.auth.getCurrentUser();

    expect(response.status()).toBe(200);
    expect(me.user.email).toBe(config.testUser.email);
  });
});
