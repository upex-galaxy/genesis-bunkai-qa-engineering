/**
 * KATA Architecture - Layer 3: Workspace Data Export API Component (BK-508)
 *
 * Every export route is owner-only and accepts the Supabase session cookie ONLY.
 * Measured on staging: a request carrying a Bearer PAT gets 403 even when the
 * session cookie is also present. This component therefore never sends the PAT
 * (setAuthToken is a no-op) and relies on the request context's cookie
 * (integration storageState from api-setup, or the browser session in E2E).
 * Raw calls use the shared ApiBase `cookieOnlyHeaders` (ADR-0018). The only
 * Bearer call is the PAT negative ATC (BK-1004), which runs on its own
 * cookieless context.
 *
 * Endpoints:
 * - GET  /api/v1/workspaces/{id}/data-export          - Poll the latest export
 * - POST /api/v1/workspaces/{id}/data-export          - Request an export
 * - GET  /api/v1/workspaces/{id}/data-export/download - Download the ready archive
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { ErrorEnvelope } from '@schemas/auth.types';
import type {
  GetWorkspaceExportResponse,
  RequestWorkspaceExportResponse,
  WorkspaceExportJob,
} from '@schemas/workspace-export.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { EXPORT_POLL_INTERVALS_MS, EXPORT_SETTLE_TIMEOUT_MS } from '@data/constants';
import { expect, request as playwrightRequest } from '@playwright/test';
import { extractArchive } from '@utils/archive';
import { atc, step } from '@utils/decorators';

export type {
  GetWorkspaceExportResponse,
  RequestWorkspaceExportResponse,
  WorkspaceExport,
  WorkspaceExportJob,
  WorkspaceExportStatus,
} from '@schemas/workspace-export.types';

const EXPORT_STATUSES = ['queued', 'running', 'completed', 'failed'];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** First four bytes of every ZIP local file header (`PK\x03\x04`). */
const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04]);

/** Export route a PAT is pointed at in the BK-1004 negative check. */
export type ExportEndpoint = 'request' | 'poll' | 'download';

export class WorkspaceExportApi extends ApiBase {
  private readonly endpoints = {
    exportOf: (workspaceId: string) => `/workspaces/${workspaceId}/data-export`,
    downloadOf: (workspaceId: string) => `/workspaces/${workspaceId}/data-export/download`,
    workspaceOf: (workspaceId: string) => `/workspaces/${workspaceId}`,
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
   * Helper: Poll (bounded, condition-based) until the given export job settles.
   * Returns the settled job; fails as soon as it settles `failed` (with its
   * `error_message`), as soon as a poll answers non-200 (`http-<status>`), or
   * when it does not settle in time.
   */
  @step
  async waitForExportToSettle(args: {
    workspaceId: string
    exportId: string
    timeoutMs?: number
  }): Promise<WorkspaceExportJob> {
    let latest: WorkspaceExportJob | null = null;
    let pollStatus = 200;
    await expect.poll(async () => {
      const [response, body] = await this.getExport(args.workspaceId);
      pollStatus = response.status();
      if (pollStatus !== 200) {
        return `http-${pollStatus}`;
      }
      latest = body.export;
      return latest?.id === args.exportId ? latest.status : `other job (${latest?.id ?? 'none'})`;
    }, {
      message: `export ${args.exportId} should settle (completed | failed)`,
      timeout: args.timeoutMs ?? EXPORT_SETTLE_TIMEOUT_MS,
      intervals: EXPORT_POLL_INTERVALS_MS,
    }).toMatch(/^(completed|failed|http-\d+)$/);

    if (pollStatus !== 200) {
      throw new Error(`Export poll for ${args.exportId} answered HTTP ${pollStatus} instead of 200`);
    }
    const settled = latest as WorkspaceExportJob | null;
    if (!settled || settled.status !== 'completed') {
      throw new Error(`Export did not complete: status=${settled?.status}, error=${settled?.error_message}`);
    }
    return settled;
  }

  /**
   * Download the ready archive as raw bytes (the JSON helpers would mangle a ZIP).
   */
  @step
  private async downloadArchive(workspaceId: string): Promise<APIResponse> {
    return this.request.get(this.apiEndpoint(this.endpoints.downloadOf(workspaceId)), {
      headers: this.cookieOnlyHeaders(),
      timeout: this.config.browser.defaultTimeout,
    });
  }

  /**
   * Run `fn` on a fresh, cookieless request context that carries ONLY the given
   * Bearer PAT, so the call proves the PAT alone (D6). Disposed in `finally`.
   */
  private async withPatOnlyContext<T>(
    token: string,
    fn: (context: APIRequestContext) => Promise<T>,
  ): Promise<T> {
    const context = await playwrightRequest.newContext({
      extraHTTPHeaders: { ...this.requestHeaders, Authorization: `Bearer ${token}` },
    });
    try {
      return await fn(context);
    }
    finally {
      await context.dispose();
    }
  }

  // ============================================
  // ATCs - Complete Test Cases (ACTION + VERIFICATION)
  // ============================================

  /**
   * ATC: Request an export of an idle owned workspace - expects 202 with a queued job
   *
   * Complete flow:
   * 1. POST the request (ACTION)
   * 2. Poll once (VERIFICATION): the latest export is the job just enqueued,
   *    `queued`, `running` or already `completed` (an empty workspace can finish
   *    before the poll), never `failed`
   *
   * @param workspaceId - A workspace the caller owns, with no export in flight
   * @returns Tuple with response, body and the (empty) payload sent
   */
  @atc('BK-1017')
  async requestExportSuccessfully(
    workspaceId: string,
  ): Promise<[APIResponse, RequestWorkspaceExportResponse, Record<string, never>]> {
    const [response, body, payload] = await this.apiPOST<RequestWorkspaceExportResponse, Record<string, never>>(
      this.endpoints.exportOf(workspaceId),
      {},
    );

    expect(response.status()).toBe(202);
    expect(body.export_job_id).toMatch(UUID_PATTERN);
    expect(body.status).toBe('queued');

    const [pollResponse, pollBody] = await this.getExport(workspaceId);
    expect(pollResponse.status()).toBe(200);
    expect(pollBody.export?.id, 'poll should return the job just requested').toBe(body.export_job_id);
    expect(['queued', 'running', 'completed'], 'job should be in flight or done, never failed')
      .toContain(pollBody.export?.status);

    return [response, body, payload];
  }

  /**
   * ATC: Download a ready archive - expects a ZIP attachment stream (200)
   *
   * Complete flow:
   * 1. Read the latest export to learn its `archive_bytes` (helper, precondition)
   * 2. GET the download route (ACTION)
   * 3. Verify headers, ZIP signature, readable archive and exact byte length
   *
   * @param workspaceId - A workspace the caller owns, with a completed export
   * @returns Tuple with the download response and the raw archive bytes
   */
  @atc('BK-1019')
  async downloadArchiveSuccessfully(workspaceId: string): Promise<[APIResponse, Buffer]> {
    const [, pollBody] = await this.getExport(workspaceId);
    const ready = pollBody.export;
    expect(ready?.status, 'precondition: a completed export').toBe('completed');

    const response = await this.downloadArchive(workspaceId);
    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers['content-type']).toContain('application/zip');
    expect(headers['content-disposition']).toMatch(
      new RegExp(`^attachment;\\s*filename="?workspace-export-${workspaceId}-\\d{4}-\\d{2}-\\d{2}\\.zip"?`),
    );

    const bytes = await response.body();
    expect(bytes.subarray(0, 4).equals(ZIP_MAGIC), 'body should start with the ZIP signature PK\\x03\\x04').toBe(true);
    expect(extractArchive(bytes), 'archive should be a readable ZIP').not.toBeNull();
    expect(bytes.length, 'byte length should equal the poll archive_bytes').toBe(ready?.archive_bytes);

    return [response, bytes];
  }

  /**
   * ATC: Call an export route with a Personal Access Token only - expects 403
   *
   * Complete flow:
   * 1. Read the latest export id with the Owner cookie (helper, baseline)
   * 2. Positive control on a cookieless context carrying ONLY the Bearer PAT:
   *    `GET /workspaces/{id}` (a Bearer `atc:read` route) answers 200, so the
   *    PAT does authenticate and the 403 below is the auth-mode gate
   * 3. Call the chosen export route on that same context (ACTION)
   * 4. Verify 403 with the error envelope and no ZIP bytes; re-read the latest
   *    export with the cookie: no new job was enqueued
   *
   * Parameterized over the three export routes (request, poll, download). For
   * `download`, the caller prepares a completed export first, so a 403 cannot be
   * a 404 in disguise. The PAT needs the `atc:read` scope for the control call.
   * It travels under the `token` key, which the step title masks.
   *
   * @returns Tuple with the refused response and its error envelope
   */
  @atc('BK-1004')
  async rejectPatOnExportEndpoint(args: {
    workspaceId: string
    token: string
    endpoint: ExportEndpoint
  }): Promise<[APIResponse, ErrorEnvelope]> {
    const [beforeResponse, before] = await this.getExport(args.workspaceId);
    expect(beforeResponse.status(), 'baseline: the Owner cookie reads the latest export').toBe(200);

    const [response, body] = await this.withPatOnlyContext(args.token, async (context) => {
      const control = await context.get(this.apiEndpoint(this.endpoints.workspaceOf(args.workspaceId)));
      expect(control.status(), 'positive control: the PAT authenticates on a Bearer route').toBe(200);
      const controlBody = await this.getResponseJsonObject<{ workspace?: { id?: string } }>(control);
      expect(controlBody.workspace?.id, 'positive control: the PAT reads the target workspace').toBe(args.workspaceId);

      const url = args.endpoint === 'download'
        ? this.apiEndpoint(this.endpoints.downloadOf(args.workspaceId))
        : this.apiEndpoint(this.endpoints.exportOf(args.workspaceId));
      const refused = args.endpoint === 'request'
        ? await context.post(url, { data: {} })
        : await context.get(url);
      return [refused, await this.getResponseJsonObject<ErrorEnvelope>(refused)] as const;
    });

    expect(response.status()).toBe(403);
    expect(response.headers()['content-type'] ?? '').not.toContain('application/zip');
    expect(body.error?.code, 'error envelope code').toBe('forbidden');
    expect(body.error?.message, 'error envelope message: the cookie-only gate, not a role 403')
      .toMatch(/browser session/i);

    const [afterResponse, after] = await this.getExport(args.workspaceId);
    expect(afterResponse.status(), 'after: the Owner cookie reads the latest export').toBe(200);
    expect(after.export?.id ?? null, 'no new export job should be enqueued').toBe(before.export?.id ?? null);

    return [response, body];
  }

  /**
   * ATC: Request a fresh export after a ready one - expects only the newest archive offered
   *
   * Complete flow:
   * 1. POST a new request (ACTION) - 202 with a job id different from the prior one
   * 2. Poll until the new job completes (helper)
   * 3. Verify the poll offers the NEW job, its window ends after the prior one,
   *    and the downloaded manifest was generated after the prior completion
   *
   * @returns Tuple with the download response and the newest completed job
   */
  @atc('BK-1009')
  async supersedePriorArchiveWithNewest(args: {
    workspaceId: string
    priorExport: WorkspaceExportJob
  }): Promise<[APIResponse, WorkspaceExportJob]> {
    const { workspaceId, priorExport } = args;

    const [requestResponse, requestBody] = await this.requestExport(workspaceId);
    expect(requestResponse.status()).toBe(202);
    expect(requestBody.export_job_id).not.toBe(priorExport.id);

    const newest = await this.waitForExportToSettle({ workspaceId, exportId: requestBody.export_job_id });
    expect(newest.id).toBe(requestBody.export_job_id);
    expect(Date.parse(newest.expires_at ?? ''), 'new window should end after the prior one')
      .toBeGreaterThan(Date.parse(priorExport.expires_at ?? ''));

    const response = await this.downloadArchive(workspaceId);
    expect(response.status()).toBe(200);
    const files = extractArchive(await response.body());
    expect(files?.['manifest.json'], 'archive should hold manifest.json').toBeDefined();
    const manifest = JSON.parse(files!['manifest.json']) as { generated_at?: string };
    expect(Date.parse(manifest.generated_at ?? ''), 'manifest should be generated after the prior completion')
      .toBeGreaterThan(Date.parse(priorExport.completed_at ?? ''));

    return [response, newest];
  }

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
      if (latest.status !== 'completed') {
        expect(latest.expires_at, 'only a completed export has a download window').toBeNull();
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
