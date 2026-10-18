/**
 * KATA Architecture - Layer 3: Auth API Component
 *
 * API component for Bunkai authentication.
 *
 * ATCs follow flow-based design: each ATC is an ACTION + VERIFICATION,
 * not a simple GET. Read-only operations are helpers (no @atc).
 *
 * Bunkai issues two credentials from one sign-in call:
 * - a Supabase session cookie, stored in the Playwright request context
 *   (cookie-only routes such as workspace data export need it)
 * - a Personal Access Token (`bk_pat_*`), sent as `Authorization: Bearer`
 *
 * Endpoints:
 * - POST /api/v1/auth/signin - Headless password sign-in + auto-minted PAT
 * - GET  /api/v1/me          - Introspect the authenticated principal
 */

import type { APIResponse } from '@playwright/test';
import type { ErrorEnvelope, MeResponse, SignInPayload, SignInResponse } from '@schemas/auth.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { atc, step } from '@utils/decorators';

// Re-export types for consumers that import from AuthApi
export type { ErrorEnvelope, MeResponse, SignInPayload, SignInResponse } from '@schemas/auth.types';

// ============================================
// Auth API Component
// ============================================

export class AuthApi extends ApiBase {
  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // Helpers - Read-only operations (no @atc)
  // ============================================

  /**
   * Helper: Introspect the authenticated principal (GET /me).
   *
   * Read-only GET used as the verification step inside ATCs.
   *
   * @returns Tuple with response and principal
   */
  @step
  async getCurrentUser(): Promise<[APIResponse, MeResponse]> {
    const [response, body] = await this.apiGET<MeResponse>(this.config.auth.meEndpoint);
    return [response, body];
  }

  // ============================================
  // ATCs - Complete Test Cases (ACTION + VERIFICATION)
  // ============================================

  /**
   * ATC: Sign in with valid credentials - expects success (200)
   *
   * Complete flow:
   * 1. POST credentials to /auth/signin (ACTION) - the response also sets the
   *    session cookie on this request context
   * 2. GET /me with the minted PAT to confirm it authenticates (VERIFICATION)
   *
   * The PAT is set as the Bearer token for subsequent requests.
   *
   * @param credentials - Email and password, optionally PAT name / scopes / TTL
   * @returns Tuple with response, sign-in body, and sent payload
   */
  @atc('BK-311')
  async authenticateSuccessfully(
    credentials: SignInPayload,
  ): Promise<[APIResponse, SignInResponse, SignInPayload]> {
    // ACTION: POST sign-in
    const [response, body, sentPayload] = await this.apiPOST<SignInResponse, SignInPayload>(
      this.config.auth.loginEndpoint,
      credentials,
    );

    // Fixed assertions - validates successful authentication
    expect(response.status()).toBe(200);
    expect(body.user.email).toBe(credentials.email);
    expect(body.session.access_token).toBeTruthy();
    expect(body.pat.token).toMatch(/^bk_pat_/);
    expect(response.headersArray().some(h => h.name.toLowerCase() === 'set-cookie')).toBe(true);

    // Store the PAT for subsequent Bearer requests
    this.setAuthToken(body.pat.token);

    // VERIFICATION: the PAT authenticates as the same user
    const [meResponse, meBody] = await this.getCurrentUser();
    expect(meResponse.status()).toBe(200);
    expect(meBody.user.email).toBe(credentials.email);

    return [response, body, sentPayload];
  }

  /**
   * ATC: Sign in with invalid credentials - expects error (401)
   *
   * Complete flow:
   * 1. POST invalid credentials to /auth/signin (ACTION)
   * 2. Confirm NO credential was issued: no session cookie, no PAT (VERIFICATION)
   *
   * The verification reads the response itself rather than GET /me, because the
   * shared request context may already carry a cookie from an earlier sign-in.
   *
   * @param credentials - Invalid email or password
   * @returns Tuple with error response and sent payload
   */
  @atc('BK-312')
  async loginWithInvalidCredentials(
    credentials: SignInPayload,
  ): Promise<[APIResponse, ErrorEnvelope, SignInPayload]> {
    // ACTION: POST invalid credentials
    const [response, body, sentPayload] = await this.apiPOST<ErrorEnvelope, SignInPayload>(
      this.config.auth.loginEndpoint,
      credentials,
    );

    // Fixed assertions - Bunkai answers 401 with the canonical error envelope
    expect(response.status()).toBe(401);
    expect(body.error.code).toBe('unauthorized');

    // VERIFICATION: neither a session cookie nor a PAT was issued
    const setsAuthCookie = response
      .headersArray()
      .some(h => h.name.toLowerCase() === 'set-cookie' && /sb-[^=]+-auth-token=[^;]+/.test(h.value));
    expect(setsAuthCookie).toBe(false);
    expect(body).not.toHaveProperty('pat');

    return [response, body, sentPayload];
  }
}
