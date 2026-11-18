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

// ============================================================================
// Endpoint Types - POST /api/v1/me/active-workspace (cookie-only)
// ============================================================================

/** Body: `{ workspace_id }`. */
export type SetActiveWorkspacePayload = components['schemas']['ActiveWorkspaceBody'];

/** 200 body: the now-active workspace plus the caller's role in it. Sets `bk_active_ws`. */
export type SetActiveWorkspaceResponse = components['schemas']['ActiveWorkspaceResponse'];

// ============================================================================
// Endpoint Types - POST /api/v1/workspaces/{id}/invites (admin/owner)
// ============================================================================

/** Role an invite grants (never `owner`). */
export type InviteRole = components['schemas']['WorkspaceInviteCreateBody']['role'];

/** Body: `{ email, role }`. */
export type CreateInvitePayload = components['schemas']['WorkspaceInviteCreateBody'];

/** 201 body: `{ invite, token, accept_url, warning }`. The raw token is returned once. */
export type CreateInviteResponse = components['schemas']['WorkspaceInviteCreateResponse'];

// ============================================================================
// Endpoint Types - POST /api/v1/invites/accept (invitee)
// ============================================================================

/** Body: `{ token }`. */
export type AcceptInvitePayload = components['schemas']['InviteAcceptBody'];

/** 200 body: `{ ok, workspace_id, role }`. */
export type AcceptInviteResponse = components['schemas']['InviteAcceptResponse'];

// ============================================================================
// Endpoint Types - GET /api/v1/workspaces/{id}
// ============================================================================

/** 200 body: `{ workspace }`. */
export type GetWorkspaceResponse = components['schemas']['WorkspaceResponse'];

// ============================================================================
// Endpoint Types - POST /api/v1/workspaces/{id}/restore (owner-only, session-only)
// ============================================================================

/** 200 body: `{ workspaceId, workspaceName }`. */
export type RestoreWorkspaceResponse = components['schemas']['WorkspaceRestoreResponse'];

// ============================================================================
// Hand-written: `workspace_deletions` audit row (no API surface, read through a DB role)
// ============================================================================

/** One `workspace_deletions` row, as the read-only audit utility returns it. */
export interface WorkspaceDeletionRecord {
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  requestedBy: string
  requestedAt: Date
  purgeDeadline: Date
  purgedAt: Date | null
  memberCount: number
}

// ============================================================================
// Schema Types - workspace read-backs used to prove "nothing changed" (BK-512)
// ============================================================================

/** GET /api/v1/workspaces/{id}/open-bugs body. */
export type OpenBugs = components['schemas']['OpenBugs'];

/** GET /api/v1/workspaces/{id}/recent-projects body. */
export type RecentProjects = components['schemas']['RecentProjects'];

/** GET /api/v1/workspaces/{id}/coverage body. */
export type WorkspaceCoverage = components['schemas']['WorkspaceCoverage'];
