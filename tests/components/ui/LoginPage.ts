/**
 * KATA Architecture - Layer 3: Login Page Component
 *
 * UI component for authentication via the login page.
 * Handles login flows for E2E tests.
 *
 * Page: /login (Bunkai). Two-step form: email + Continue, then password + Sign in.
 * The form posts to /api/v1/auth/signin, which sets the Supabase session cookie.
 * Locators (data-testid):
 * - Email: [data-testid="login-email"]
 * - Continue: [data-testid="login-continue"]
 * - Password: [data-testid="login-password"]
 * - Sign in: [data-testid="login-signin"]
 * - Error: [data-testid="login-error"]
 * - Post-login shell: [data-testid="account-menu-trigger"]
 */

import type { TestContextOptions } from '@TestContext';

import { expect } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc, step } from '@utils/decorators';

// ============================================
// Types - Login data structures
// ============================================

/**
 * Login credentials for UI authentication
 */
export interface LoginCredentials {
  email: string
  password: string
}

// ============================================
// Login Page Component
// ============================================

export class LoginPage extends UiBase {
  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // Helpers (Private)
  // ============================================

  /**
   * Fill the two-step login form and submit
   * Step 1: email + Continue. Step 2: password + Sign in.
   */
  private async fillAndSubmitLoginForm(credentials: LoginCredentials): Promise<void> {
    await this.page.getByTestId('login-email').fill(credentials.email);
    await this.page.getByTestId('login-continue').click();
    await this.page.getByTestId('login-password').fill(credentials.password);
    await this.page.getByTestId('login-signin').click();
  }

  // ============================================
  // Navigation (Public)
  // ============================================

  /**
   * Navigate to the login page
   * Call this BEFORE using login ATCs
   */
  @step
  async goto(): Promise<void> {
    await this.page.goto(this.buildUrl('/login'));
  }

  // ============================================
  // ATCs - Complete Test Cases
  // ============================================

  /**
   * ATC: Login with valid credentials - expects success
   *
   * IMPORTANT: Call goto() before this ATC.
   * Fills credentials, submits, and verifies redirect away from login page.
   *
   * @param credentials - Email and password
   */
  @atc('BK-313')
  async loginSuccessfully(credentials: LoginCredentials): Promise<void> {
    await this.fillAndSubmitLoginForm(credentials);

    // Wait for authentication to complete and redirect
    await this.page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    await expect(this.page).not.toHaveURL(/.*\/login.*/);
    await expect(this.page.getByTestId('account-menu-trigger')).toBeVisible();
  }

  /**
   * ATC: Login with invalid credentials - expects error
   *
   * IMPORTANT: Call goto() before this ATC.
   * Fills invalid credentials, submits, and verifies error message.
   *
   * @param credentials - Invalid email or password
   */
  @atc('BK-314')
  async loginWithInvalidCredentials(credentials: LoginCredentials): Promise<void> {
    await this.fillAndSubmitLoginForm(credentials);

    // Fixed assertion - Bunkai shows "That email or password is incorrect."
    const errorIndicator = this.page.getByTestId('login-error');
    await expect(errorIndicator).toBeVisible({ timeout: 5000 });
    await expect(this.page).toHaveURL(/.*\/login.*/);
  }
}
