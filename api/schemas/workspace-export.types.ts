/**
 * KATA Framework - Type Facade: Workspace Data Export Domain (BK-508)
 *
 * Every route here is owner-only and accepts the Supabase session cookie ONLY
 * (no Bearer PAT), so components must call them on a cookie-authenticated context.
 *
 * Consumed by: tests/components/api/WorkspaceExportApi.ts
 */

import type { components, paths } from '@openapi';

// ============================================================================
// Schema Types (from components.schemas)
// ============================================================================

/** Latest export request, or null when none was ever requested. */
export type WorkspaceExport = components['schemas']['WorkspaceExport'];

/** Export lifecycle: queued -> running -> completed | failed. */
export type WorkspaceExportStatus = NonNullable<WorkspaceExport>['status'];

// ============================================================================
// Endpoint Types - GET /api/v1/workspaces/{id}/data-export
// ============================================================================

type GetExportPath = paths['/api/v1/workspaces/{id}/data-export']['get'];

/** 200 body: `{ export: WorkspaceExport }`. */
export type GetWorkspaceExportResponse = GetExportPath['responses']['200']['content']['application/json'];

// ============================================================================
// Endpoint Types - POST /api/v1/workspaces/{id}/data-export
// ============================================================================

type RequestExportPath = paths['/api/v1/workspaces/{id}/data-export']['post'];

/** 202 body: `{ export_job_id, status }`. */
export type RequestWorkspaceExportResponse = RequestExportPath['responses']['202']['content']['application/json'];
