/**
 * KATA Architecture - Layer 3: Personal Access Tokens API Component
 *
 * Test-data helpers only (no ATCs): mint a PAT for a negative check and revoke it
 * in cleanup. Both routes are session-only, so every call is sent cookie-only
 * (`RequestOptions.cookieOnly`, ADR-0018): a Bearer PAT would get 403.
 *
 * Endpoints:
 * - POST   /api/v1/tokens      - Issue a PAT (raw secret returned once)
 * - DELETE /api/v1/tokens/{id} - Revoke a PAT (soft-delete)
 */

import type { IssueTokenPayload, IssueTokenResponse, TokenScope } from '@schemas/tokens.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { attachRequestResponseToAllure } from '@utils/allure';
import { step } from '@utils/decorators';

export type { IssueTokenPayload, IssueTokenResponse, TokenScope } from '@schemas/tokens.types';

export interface IssuedToken {
  id: string
  token: string
}

export class TokensApi extends ApiBase {
  private readonly endpoints = {
    tokens: '/tokens',
    byId: (tokenId: string) => `/tokens/${tokenId}`,
  };

  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // Helpers - Test data setup / cleanup (no @atc)
  // ============================================

  /**
   * Helper: Issue a PAT for the caller. Fails fast unless 201.
   * The raw token is returned once; callers must never log it.
   * `expiresInDays` (1-365) bounds the PAT's life; omitted = never expires.
   */
  @step
  async issueToken(args: {
    name: string
    scopes: TokenScope[]
    workspaceId?: string
    expiresInDays?: number
  }): Promise<IssuedToken> {
    const payload: IssueTokenPayload = {
      name: args.name,
      scopes: args.scopes,
      ...(args.workspaceId ? { workspace_id: args.workspaceId } : {}),
      ...(args.expiresInDays ? { expires_in_days: args.expiresInDays } : {}),
    };
    // Raw call, not apiPOST: the Allure attachment must never hold the raw token.
    const response = await this.request.post(this.apiEndpoint(this.endpoints.tokens), {
      headers: this.cookieOnlyHeaders(),
      data: payload,
      timeout: this.config.browser.defaultTimeout,
    });
    const body = await this.getResponseJsonObject<IssueTokenResponse>(response);
    await attachRequestResponseToAllure({
      url: this.endpoints.tokens,
      method: 'POST',
      responseBody: { ...body, token: '***' },
      requestBody: payload,
    });
    expect(response.status(), 'token issuance').toBe(201);
    return { id: body.id, token: body.token };
  }

  /**
   * Helper: Revoke a PAT. Idempotent cleanup: 204 (revoked) and 404 (already
   * revoked, e.g. by a workspace soft-delete) both count as success.
   */
  @step
  async revokeToken(tokenId: string): Promise<void> {
    const [response] = await this.apiDELETE(this.endpoints.byId(tokenId), { cookieOnly: true });
    expect([204, 404], 'token revocation').toContain(response.status());
  }
}
