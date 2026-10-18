/**
 * KATA Architecture - Layer 3: Workspace Data Export API Component (BK-508)
 *
 * Every export route is owner-only and accepts the Supabase session cookie ONLY.
 * Measured on staging: a request carrying a Bearer PAT gets 403 even when the
 * session cookie is also present. This component therefore never sends the PAT
 * (setAuthToken is a no-op) and relies on the request context's cookie
 * (integration storageState from api-setup, or the browser session in E2E).
 *
 * Endpoints:
 * - GET  /api/v1/workspaces/{id}/data-export          - Poll the latest export
 * - POST /api/v1/workspaces/{id}/data-export          - Request an export
 * - GET  /api/v1/workspaces/{id}/data-export/download - Download the ready archive
 */

import type { APIResponse } from '@playwright/test';
import type { GetWorkspaceExportResponse, RequestWorkspaceExportResponse } from '@schemas/workspace-export.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { extractArchive } from '@utils/archive';
import { atc, step } from '@utils/decorators';

export type {
  GetWorkspaceExportResponse,
  RequestWorkspaceExportResponse,
  WorkspaceExport,
  WorkspaceExportStatus,
} from '@schemas/workspace-export.types';

const EXPORT_STATUSES = ['queued', 'running', 'completed', 'failed'];

export class WorkspaceExportApi extends ApiBase {
  private readonly endpoints = {
    exportOf: (workspaceId: string) => `/workspaces/${workspaceId}/data-export`,
    downloadOf: (workspaceId: string) => `/workspaces/${workspaceId}/data-export/download`,
  };

  constructor(options: TestContextOptions) {
    super(options);
  }

  /**
   * Cookie-only routes: a Bearer header turns the call into a 403, so the PAT
   * propagated by the fixture is deliberately ignored.
   */
  override setAuthToken(_token: string) {
    this.authToken = null;
  }

  // ============================================
  // Helpers - Setup / polling (no @atc)
  // ============================================

  /**
   * Helper: Request an export of a workspace (precondition for archive ATCs).
   * Returns the raw response; callers assert on the status they need.
   */
  @step
  async requestExport(workspaceId: string): Promise<[APIResponse, RequestWorkspaceExportResponse]> {
    const [response, body] = await this.apiPOST<RequestWorkspaceExportResponse, Record<string, never>>(
      this.endpoints.exportOf(workspaceId),
      {},
    );
    return [response, body];
  }

  /**
   * Helper: Read the latest export of a workspace (used to poll until it settles).
   */
  @step
  async getExport(workspaceId: string): Promise<[APIResponse, GetWorkspaceExportResponse]> {
    return this.apiGET<GetWorkspaceExportResponse>(this.endpoints.exportOf(workspaceId));
  }

  /**
   * Download the ready archive as raw bytes (the JSON helpers would mangle a ZIP).
   */
  @step
  private async downloadArchive(workspaceId: string): Promise<APIResponse> {
    return this.request.get(this.apiEndpoint(this.endpoints.downloadOf(workspaceId)), {
      headers: this.buildHeaders(),
      timeout: this.config.browser.defaultTimeout,
    });
  }

  // ============================================
  // ATCs - Complete Test Cases (ACTION + VERIFICATION)
  // ============================================

  /**
   * ATC: Poll the latest export of an owned workspace - expects the status shape (200)
   *
   * The body is `{ export: null }` when no export was ever requested; otherwise
   * every documented field is present and the status is a known lifecycle value.
   *
   * @param workspaceId - A workspace the authenticated caller owns
   * @returns Tuple with response and body
   */
  @atc('BK-1018')
  async getExportStatusSuccessfully(
    workspaceId: string,
  ): Promise<[APIResponse, GetWorkspaceExportResponse]> {
    const [response, body] = await this.apiGET<GetWorkspaceExportResponse>(
      this.endpoints.exportOf(workspaceId),
    );

    expect(response.status()).toBe(200);
    expect(body).toHaveProperty('export');

    const latest = body.export;
    if (latest !== null) {
      expect(EXPORT_STATUSES).toContain(latest.status);
      expect(latest.id).toBeTruthy();
      expect(latest.created_at).toBeTruthy();
      for (const field of ['archive_bytes', 'error_message', 'started_at', 'completed_at', 'expires_at']) {
        expect(latest).toHaveProperty(field);
      }
    }

    return [response, body];
  }

  /**
   * ATC: Download a completed export and verify its encoding - run snapshots are
   * NDJSON (`runs.ndjson` only), every other entity file is a JSON array.
   *
   * Regression guard for BK-1025. Precondition: the workspace has run history
   * (so `runs.ndjson` is non-empty) and a completed export.
   *
   * @param workspaceId - A workspace the authenticated caller owns, with a completed export
   * @returns Tuple with the download response and the extracted files (path -> text)
   */
  @atc('BK-1015')
  async downloadArchiveWithNdjsonRunSnapshots(
    workspaceId: string,
  ): Promise<[APIResponse, Record<string, string>]> {
    const response = await this.downloadArchive(workspaceId);
    expect(response.status()).toBe(200);

    const files = extractArchive(await response.body());
    expect(files, 'archive should be a readable ZIP').not.toBeNull();
    const archive = files as Record<string, string>;

    // Run snapshots: runs.ndjson only, never runs.json
    expect(Object.keys(archive)).not.toContain('runs.json');
    const runs = archive['runs.ndjson'];
    expect(runs, 'runs.ndjson should be present').toBeDefined();
    expect(runs.trim().length, 'runs.ndjson should be non-empty').toBeGreaterThan(0);
    expect(runs.trimStart().startsWith('['), 'runs.ndjson must not be a JSON array').toBe(false);
    for (const line of runs.split('\n').filter(row => row.trim() !== '')) {
      const record: unknown = JSON.parse(line);
      const isObject = typeof record === 'object' && record !== null && !Array.isArray(record);
      expect(isObject, `runs.ndjson line is not an object: ${line.slice(0, 80)}`).toBe(true);
    }

    // Every other entity file is a JSON array
    const entityFiles = Object.keys(archive).filter(path => path.endsWith('.json') && path !== 'manifest.json');
    expect(entityFiles.length, 'archive should hold entity files').toBeGreaterThan(0);
    for (const path of entityFiles) {
      const parsed: unknown = JSON.parse(archive[path]);
      expect(Array.isArray(parsed), `${path} should be a JSON array`).toBe(true);
    }

    return [response, archive];
  }
}
