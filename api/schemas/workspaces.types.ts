/**
 * KATA Framework - Type Facade: Workspaces Domain
 *
 * Consumed by: tests/components/api/WorkspacesApi.ts
 */

import type { components, paths } from '@openapi';

// ============================================================================
// Schema Types (from components.schemas)
// ============================================================================

/** A workspace plus the caller's role in it. */
export type WorkspaceWithRole = components['schemas']['WorkspaceWithRole'];

// ============================================================================
// Endpoint Types - GET /api/v1/workspaces
// ============================================================================

type ListWorkspacesPath = paths['/api/v1/workspaces']['get'];

/** 200 body: `{ workspaces: WorkspaceWithRole[] }`. */
export type ListWorkspacesResponse = ListWorkspacesPath['responses']['200']['content']['application/json'];

// ============================================================================
// Endpoint Types - POST /api/v1/workspaces
// ============================================================================

type CreateWorkspacePath = paths['/api/v1/workspaces']['post'];

/** Body: `{ name, slug }`. */
export type CreateWorkspacePayload = NonNullable<CreateWorkspacePath['requestBody']>['content']['application/json'];

/** 201 body: `{ workspace }`. */
export type CreateWorkspaceResponse = CreateWorkspacePath['responses']['201']['content']['application/json'];

/** A workspace row. */
export type Workspace = components['schemas']['Workspace'];

// ============================================================================
// Endpoint Types - DELETE /api/v1/workspaces/{id} (owner-only, session-only)
// ============================================================================

type DeleteWorkspacePath = paths['/api/v1/workspaces/{id}']['delete'];

/**
 * Confirmation body the route expects (`confirm_name` = the workspace name).
 * Not declared in the OpenAPI spec; shape mirrors the proven staging call.
 */
export interface DeleteWorkspacePayload {
  confirm_name: string
}

/** 200 body: soft-delete receipt (`workspaceId`, `purgeDeadline`, ...). */
export type DeleteWorkspaceResponse = DeleteWorkspacePath['responses']['200']['content']['application/json'];
