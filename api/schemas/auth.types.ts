/**
 * KATA Framework - Type Facade: Auth Domain
 *
 * Type definitions for Bunkai authentication endpoints.
 *
 * Bunkai has two credential families:
 * - Supabase session cookie (`sb-<ref>-auth-token`), set by POST /api/v1/auth/signin
 *   and by the UI login. Required by cookie-only routes (e.g. workspace data export).
 * - Personal Access Token (`bk_pat_*`), minted by the same sign-in call and sent as
 *   `Authorization: Bearer`. Accepted by routes that declare `bearerAuth`.
 *
 * Consumed by: tests/components/api/AuthApi.ts, tests/setup/*.setup.ts
 */

import type { components, paths } from '@openapi';

// ============================================================================
// Schema Types (from components.schemas)
// ============================================================================

/** Canonical error envelope returned by every /api/v1 route on failure. */
export type ErrorEnvelope = components['schemas']['ErrorEnvelope'];

/** Authenticated principal: user + workspaces (GET /api/v1/me). */
export type MeResponse = components['schemas']['MeResponse'];

// ============================================================================
// Endpoint Types - POST /api/v1/auth/signin
// ============================================================================

type SignInPath = paths['/api/v1/auth/signin']['post'];

/** Body: email + password, plus optional PAT name / scopes / TTL. */
export type SignInPayload = NonNullable<SignInPath['requestBody']>['content']['application/json'];

/** 200 body: `{ user, session, pat, warning }`. */
export type SignInResponse = SignInPath['responses']['200']['content']['application/json'];

/** The PAT minted by the sign-in call. */
export type SignInPat = SignInResponse['pat'];

/** PAT scope vocabulary accepted by the sign-in route. */
export type PatScope = NonNullable<SignInPayload['pat_scopes']>[number];
