/**
 * KATA Framework - Type Facade: Personal Access Tokens Domain
 *
 * Issue and revoke are session-only routes (cookie, never Bearer): a PAT cannot
 * mint or revoke tokens.
 *
 * Consumed by: tests/components/api/TokensApi.ts
 */

import type { components, paths } from '@openapi';

// ============================================================================
// Endpoint Types - POST /api/v1/tokens (session-only)
// ============================================================================

type IssueTokenPath = paths['/api/v1/tokens']['post'];

/** Body: `{ name?, scopes, workspace_id?, expires_in_days? }`. */
export type IssueTokenPayload = IssueTokenPath['requestBody']['content']['application/json'];

/** 201 body: the token row plus the raw `token`, returned exactly once. */
export type IssueTokenResponse = IssueTokenPath['responses']['201']['content']['application/json'];

/** PAT scope vocabulary (`workspace:admin` requires `workspace_id`). */
export type TokenScope = components['schemas']['CreateTokenBody']['scopes'][number];
