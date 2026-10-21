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

import type { ExportManifest } from '@data/types';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { ErrorEnvelope } from '@schemas/auth.types';
import type {
  GetWorkspaceExportResponse,
  RequestWorkspaceExportResponse,
  WorkspaceExportJob,
} from '@schemas/workspace-export.types';
import type { TestContextOptions } from '@TestContext';

import { createHash } from 'node:crypto';
import { ApiBase } from '@api/ApiBase';
import {
  EXPORT_CLOCK_SKEW_TOLERANCE_MS,
  EXPORT_CONTENT_ENTITIES,
  EXPORT_POLL_INTERVALS_MS,
  EXPORT_RACE_CALL_TIMEOUT_MS,
  EXPORT_RACE_MAX_ATTEMPTS,
  EXPORT_SETTLE_TIMEOUT_MS,
} from '@data/constants';
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

/** One of two concurrent export requests: 202 body or 409 envelope, and the (empty) payload. */
type ConcurrentRequestResult = [APIResponse, RequestWorkspaceExportResponse & ErrorEnvelope, Record<string, never>];

/** Entity name of an archive file: `runs.ndjson` -> `runs`, `projects.json` -> `projects`. */
function entityOf(path: string): string {
  return path.replace(/\.(?:nd)?json$/, '');
}

/** Record count of an entity file: non-blank lines for NDJSON, array length for JSON. */
function recordCount(path: string, text: string): number {
  if (path.endsWith('.ndjson')) {
    return text.split('\n').filter(line => line.trim() !== '').length;
  }
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new TypeError(`${path} is not a JSON array`);
  }
  return parsed.length;
}

/** Records of an entity file (NDJSON lines or JSON array items). */
function recordsOf(path: string, text: string): unknown[] {
  if (path.endsWith('.ndjson')) {
    return text.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line) as unknown);
  }
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new TypeError(`${path} is not a JSON array`);
  }
  return parsed;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** True when `value` appears in `text` (case-insensitive for a hex digest). */
function containsForm(text: string, value: string): boolean {
  return text.includes(value) || (/^[0-9a-f]+$/.test(value) && text.toLowerCase().includes(value));
}

/**
 * Where any of the given credential forms appears in the archive (file content,
 * and file names; case-insensitive for hex digests). Entries carry only form
 * labels, NEVER a value. A file whose NAME holds any form is never named: it is
 * reported as `file #<index>: <label> (in file name)`, and its content hits as
 * `file #<index>: <label>`, so an assertion message built from the result
 * cannot leak the credential. Other files are reported as `<path>: <label>`.
 */
function findCredentialLeaks(archive: Record<string, string>, forms: Record<string, string>): string[] {
  const leaks: string[] = [];
  Object.entries(archive).forEach(([path, text], index) => {
    const nameLeaks = Object.entries(forms).filter(([, value]) => containsForm(path, value));
    const display = nameLeaks.length > 0 ? `file #${index}` : path;
    for (const [label] of nameLeaks) {
      leaks.push(`file #${index}: ${label} (in file name)`);
    }
    for (const [label, value] of Object.entries(forms)) {
      if (containsForm(text, value)) {
        leaks.push(`${display}: ${label}`);
      }
    }
  });
  return leaks;
}

/** In-flight windows of the given jobs, as a readable `[created .. completed] vs [...]` string (timestamps only). */
function windowsOf(jobs: WorkspaceExportJob[]): string {
  return jobs.map(job => `[${job.created_at} .. ${job.completed_at}]`).join(' vs ');
}

/**
 * True when both jobs were PROVEN in flight at the same time: the overlap
 * min(completed_at) - max(created_at) exceeds EXPORT_CLOCK_SKEW_TOLERANCE_MS.
 * `created_at` is the DB clock, `completed_at` the worker's JS clock, so an
 * overlap no larger than the tolerance is skew-sized and never counts as proof.
 */
function inFlightTogether(a: WorkspaceExportJob, b: WorkspaceExportJob): boolean {
  const overlapStart = Math.max(Date.parse(a.created_at), Date.parse(b.created_at));
  const overlapEnd = Math.min(Date.parse(a.completed_at ?? ''), Date.parse(b.completed_at ?? ''));
  return overlapEnd - overlapStart > EXPORT_CLOCK_SKEW_TOLERANCE_MS;
}

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
  async requestExport(workspaceId: string, timeoutMs?: number): Promise<[APIResponse, RequestWorkspaceExportResponse]> {
    const [response, body] = await this.apiPOST<RequestWorkspaceExportResponse, Record<string, never>>(
      this.endpoints.exportOf(workspaceId),
      {},
      { timeout: timeoutMs },
    );
    return [response, body];
  }

  /**
   * Helper: Read the latest export of a workspace (used to poll until it settles).
   * `timeoutMs` bounds the single request (default: the config's request timeout).
   */
  @step
  async getExport(workspaceId: string, timeoutMs?: number): Promise<[APIResponse, GetWorkspaceExportResponse]> {
    return this.apiGET<GetWorkspaceExportResponse>(this.endpoints.exportOf(workspaceId), { timeout: timeoutMs });
  }

  /**
   * Helper: Poll (bounded, condition-based) until the given export job settles.
   * Returns the settled job; fails as soon as it settles `failed` (with its
   * `error_message`), as soon as a poll answers non-200 (`http-<status>`), or
   * when it does not settle in time. `timeoutMs` bounds the whole poll;
   * `requestTimeoutMs` bounds each poll read (default: the config's request timeout).
   */
  @step
  async waitForExportToSettle(args: {
    workspaceId: string
    exportId: string
    timeoutMs?: number
    requestTimeoutMs?: number
  }): Promise<WorkspaceExportJob> {
    let latest: WorkspaceExportJob | null = null;
    let pollStatus = 200;
    await expect.poll(async () => {
      const [response, body] = await this.getExport(args.workspaceId, args.requestTimeoutMs);
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

  /**
   * Download the ready archive and extract it (path -> UTF-8 text). Fails fast
   * unless the route answers 200 with a readable ZIP. Used inside the archive
   * ATCs, so its assertions count toward their verdict.
   */
  private async downloadAndExtract(workspaceId: string): Promise<[APIResponse, Record<string, string>]> {
    const response = await this.downloadArchive(workspaceId);
    expect(response.status(), 'archive download').toBe(200);
    const files = extractArchive(await response.body());
    expect(files, 'archive should be a readable ZIP').not.toBeNull();
    return [response, files as Record<string, string>];
  }

  /** Parse `manifest.json` of an extracted archive; fails fast when it is missing. */
  private parseManifest(archive: Record<string, string>): ExportManifest {
    expect(archive['manifest.json'], 'archive should hold manifest.json').toBeDefined();
    return JSON.parse(archive['manifest.json']) as ExportManifest;
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

  /**
   * ATC: Export a content-free workspace - expects a valid archive with no content records
   *
   * Precondition: a never-seeded workspace with a completed export.
   * 1. Download the archive (ACTION)
   * 2. Verify it extracts, `manifest.json` names the workspace, and every content
   *    entity file is present with 0 records and a manifest count of 0
   * 3. Verify the two entities that cannot be empty: `memberships` holds exactly
   *    the Owner (1) and `activity` holds at least the export's own audit row
   *
   * @param workspaceId - An empty workspace the caller owns, with a completed export
   * @returns Tuple with the download response and the extracted files (path -> text)
   */
  @atc('BK-999')
  async downloadEmptyWorkspaceArchive(workspaceId: string): Promise<[APIResponse, Record<string, string>]> {
    const [response, archive] = await this.downloadAndExtract(workspaceId);
    const manifest = this.parseManifest(archive);
    expect(manifest.workspace_id, 'manifest names the exported workspace').toBe(workspaceId);

    const paths = Object.keys(archive);
    for (const entity of EXPORT_CONTENT_ENTITIES) {
      const path = paths.find(file => entityOf(file) === entity);
      expect(path, `${entity}: entity file present`).toBeDefined();
      expect(recordCount(path!, archive[path!]), `${entity}: no records`).toBe(0);
      expect(manifest.counts?.[entity], `${entity}: manifest count`).toBe(0);
    }

    expect(recordCount('memberships.json', archive['memberships.json'] ?? 'null'), 'memberships: the Owner only').toBe(1);
    expect(manifest.counts?.memberships, 'memberships: manifest count').toBe(1);
    expect(recordCount('activity.json', archive['activity.json'] ?? 'null'), 'activity: at least the export request row')
      .toBeGreaterThanOrEqual(1);

    return [response, archive];
  }

  /**
   * ATC: Export a seeded workspace - expects a manifest whose identity, time and counts match the archive
   *
   * Precondition: a workspace seeded with content and run history, with a completed export.
   * 1. Download the archive (ACTION)
   * 2. Verify `manifest.workspace_id`, and that `generated_at` is ISO-8601 inside
   *    [started_at, completed_at] of the settled job (both set by the export
   *    worker, the same clock that stamps `generated_at`)
   * 3. Verify the manifest lists exactly the entity files present, and every
   *    count equals the records parsed from its file (JSON array length, or
   *    non-blank NDJSON lines), with projects and runs non-zero (not a vacuous 0 = 0)
   *
   * @returns Tuple with the download response and the parsed manifest
   */
  @atc('BK-1014')
  async downloadArchiveWithConsistentManifest(args: {
    workspaceId: string
    completedExport: WorkspaceExportJob
  }): Promise<[APIResponse, ExportManifest]> {
    const { workspaceId, completedExport } = args;
    const [response, archive] = await this.downloadAndExtract(workspaceId);
    const manifest = this.parseManifest(archive);

    expect(manifest.workspace_id, 'manifest names the exported workspace').toBe(workspaceId);
    expect(manifest.generated_at, 'generated_at is ISO-8601')
      .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
    const generatedAt = Date.parse(manifest.generated_at);
    expect(generatedAt, 'generated_at is not before the job started').toBeGreaterThanOrEqual(Date.parse(completedExport.started_at ?? ''));
    expect(generatedAt, 'generated_at is not after the job completed').toBeLessThanOrEqual(Date.parse(completedExport.completed_at ?? ''));

    const entityFiles = Object.keys(archive).filter(path => path !== 'manifest.json');
    expect(Object.keys(manifest.counts ?? {}).sort(), 'manifest counts list exactly the entity files present')
      .toEqual(entityFiles.map(entityOf).sort());
    for (const path of entityFiles) {
      expect(manifest.counts[entityOf(path)], `${path}: manifest count equals its records`)
        .toBe(recordCount(path, archive[path]));
    }
    expect(manifest.counts.projects, 'seeded projects reached the archive').toBeGreaterThan(0);
    expect(manifest.counts.runs, 'seeded runs reached the archive').toBeGreaterThan(0);

    return [response, manifest];
  }

  /**
   * ATC: Export a workspace that issued a Personal Access Token - expects no form of its secret in the archive
   *
   * Precondition: a PAT bound to the workspace was issued BEFORE the export was
   * requested, and that export completed.
   * 1. Download the archive (ACTION)
   * 2. Scan EVERY file (content and name) for the raw token, its secret part
   *    (after the dot), the full secret (prefix + secret, what the server
   *    hashes) and the SHA-256 hex of both (the stored form). The `<prefix>`
   *    alone is a non-secret lookup key and is not scanned.
   * 3. Verify no file name looks like a credential store (/token|secret/i)
   *
   * The PAT travels under the `token` key (masked in the step title); failure
   * messages name the file and the form, never the value; a file whose name
   * holds a form (or, for PATs, matches /token|secret/i) is named only by its
   * index in the archive (`file #<index>`).
   *
   * @returns Tuple with the download response and the extracted files (path -> text)
   */
  @atc('BK-1011')
  async downloadArchiveExcludingPatSecrets(args: {
    workspaceId: string
    token: string
  }): Promise<[APIResponse, Record<string, string>]> {
    const match = /^bk_pat_([\w-]{12})\.([\w-]+)$/.exec(args.token);
    expect(match !== null, 'precondition: the PAT has the documented <family><prefix>.<secret> shape').toBe(true);
    const [, prefix, secretPart] = match!;
    const fullSecret = `${prefix}${secretPart}`;

    const [response, archive] = await this.downloadAndExtract(args.workspaceId);
    this.parseManifest(archive);

    const leaks = findCredentialLeaks(archive, {
      'raw PAT': args.token,
      'PAT secret part': secretPart,
      'PAT full secret': fullSecret,
      'SHA-256 of the PAT full secret (stored hash)': sha256Hex(fullSecret),
      'SHA-256 of the PAT secret part': sha256Hex(secretPart),
    });
    expect(leaks, 'no form of the PAT secret appears in the archive').toEqual([]);
    // Indexes only: a file name that looks like a credential store is never printed
    const credentialStoreFiles = Object.keys(archive)
      .map((path, index) => (/token|secret/i.test(path) ? `file #${index}` : null))
      .filter(entry => entry !== null);
    expect(credentialStoreFiles, 'no credential-store file (/token|secret/i name) in the archive').toEqual([]);

    return [response, archive];
  }

  /**
   * ATC: Export a workspace with a pending invite - expects no form of the invite token in the archive
   *
   * Precondition: an invite was issued in the workspace BEFORE the export was
   * requested, and that export completed.
   * 1. Download the archive (ACTION)
   * 2. Scan EVERY file (content and name) for the raw invite token, its secret
   *    part (after `bk_inv_`) and its SHA-256 hex (the stored form). The invite's
   *    `accept_url` embeds the raw token unchanged (base64url is URL-safe), so
   *    the raw-token scan also covers it.
   *
   * The token travels under the `token` key (masked in the step title); failure
   * messages name the file and the form, never the value; a file whose name
   * holds a form is named only by its index in the archive (`file #<index>`).
   *
   * @returns Tuple with the download response and the extracted files (path -> text)
   */
  @atc('BK-1012')
  async downloadArchiveExcludingInviteTokens(args: {
    workspaceId: string
    token: string
  }): Promise<[APIResponse, Record<string, string>]> {
    const match = /^bk_inv_([\w-]+)$/.exec(args.token);
    expect(match !== null, 'precondition: the invite token has the documented <family><secret> shape').toBe(true);
    const [, secretPart] = match!;

    const [response, archive] = await this.downloadAndExtract(args.workspaceId);
    this.parseManifest(archive);

    const leaks = findCredentialLeaks(archive, {
      'raw invite token': args.token,
      'invite token secret part': secretPart,
      'SHA-256 of the invite token (stored hash)': sha256Hex(args.token),
    });
    expect(leaks, 'no form of the invite token appears in the archive').toEqual([]);

    return [response, archive];
  }

  /**
   * ATC: Export one of two workspaces the Owner owns - expects only that workspace's records
   *
   * Precondition: both workspaces are seeded; the exported one has a completed export.
   * 1. Download the archive (ACTION)
   * 2. Verify `manifest.workspace_id` and that every record exposing a
   *    `workspace_id` carries the exported id
   * 3. Verify none of the other workspace's markers (ids, name, slug) appears
   *    in any file (manifest included), and, as a positive control against a
   *    vacuous pass, that every marker of the exported workspace appears in a
   *    content file (manifest.json excluded: it names the workspace by itself)
   *
   * Records without a direct `workspace_id` (modules, steps, run snapshots) are
   * scoped through their parents, so the marker scan is what proves them clean.
   *
   * @returns Tuple with the download response and the extracted files (path -> text)
   */
  @atc('BK-1013')
  async downloadArchiveScopedToWorkspace(args: {
    workspaceId: string
    ownMarkers: string[]
    foreignMarkers: string[]
  }): Promise<[APIResponse, Record<string, string>]> {
    const [response, archive] = await this.downloadAndExtract(args.workspaceId);
    const manifest = this.parseManifest(archive);
    expect(manifest.workspace_id, 'manifest names the exported workspace').toBe(args.workspaceId);

    const foreignRecords: string[] = [];
    for (const [path, text] of Object.entries(archive)) {
      if (path === 'manifest.json') {
        continue;
      }
      recordsOf(path, text).forEach((record, index) => {
        const scoped = typeof record === 'object' && record !== null && 'workspace_id' in record;
        if (scoped && (record as { workspace_id: unknown }).workspace_id !== args.workspaceId) {
          foreignRecords.push(`${path}#${index}`);
        }
      });
    }
    expect(foreignRecords, 'every record with a workspace_id belongs to the exported workspace').toEqual([]);

    const files = Object.entries(archive);
    const foreignHits = args.foreignMarkers
      .flatMap(marker => files.filter(([, text]) => text.includes(marker)).map(([path]) => `${path}: ${marker}`));
    expect(foreignHits, 'no marker of the other workspace appears in the archive').toEqual([]);
    // Content files only: manifest.json always names the workspace, so it would let the control pass vacuously
    const contentFiles = files.filter(([path]) => path !== 'manifest.json');
    const missingOwn = args.ownMarkers.filter(marker => !contentFiles.some(([, text]) => text.includes(marker)));
    expect(missingOwn, 'positive control: every marker of the exported workspace is present in a content file').toEqual([]);

    return [response, archive];
  }

  /**
   * Fire two export requests for one workspace at once while reading its latest
   * export back to back until both answer. The API exposes only the LATEST job,
   * so these snapshots are the one chance to see the first job already
   * finished before the second request reached the DB (a lost race). Used
   * inside the BK-1002 ATC; no assertions.
   * Every call carries EXPORT_RACE_CALL_TIMEOUT_MS, so this ends within two
   * call timeouts: the POST pair, then at most one reader GET still in flight.
   */
  private async requestTwiceWithSnapshots(
    workspaceId: string,
  ): Promise<[ConcurrentRequestResult[], WorkspaceExportJob[]]> {
    const post = async () => this.apiPOST<RequestWorkspaceExportResponse & ErrorEnvelope, Record<string, never>>(
      this.endpoints.exportOf(workspaceId),
      {},
      { timeout: EXPORT_RACE_CALL_TIMEOUT_MS },
    );
    const snapshots: WorkspaceExportJob[] = [];
    const progress = { answered: false }; // set by the requests' finally, read by the reader loop
    const requests = Promise.all([post(), post()]).finally(() => {
      progress.answered = true;
    });
    const reader = (async () => {
      while (!progress.answered) {
        const [response, body] = await this.getExport(workspaceId, EXPORT_RACE_CALL_TIMEOUT_MS);
        if (response.status() === 200 && body.export) {
          snapshots.push(body.export);
        }
      }
    })();
    const [results] = await Promise.all([requests, reader]);
    return [results, snapshots];
  }

  /**
   * ATC: Request an export twice at once on one idle workspace - expects one
   * job enqueued and the other request refused (409 export_in_progress)
   *
   * Why two concurrent requests (no DB writes, Q2): the product starts the job
   * right after the 202 and a seeded staging export completes in ~0.75-1.05 s,
   * while one call from the runner takes ~0.5 s, so a sequential second request
   * (after a read-back guard) lost the race 4 of 4 times (measured 2026-10-20).
   * Fired together, both inserts reach the one-active-per-workspace index
   * while the first job is still `queued`, so the in-flight state is the
   * product's own.
   * 1. POST two requests concurrently (ACTION), reading the latest export back
   *    to back meanwhile
   * 2. [202, 409]: the 409 carries the `conflict` envelope, `details.reason` =
   *    `export_in_progress` and a human-readable message; re-read the export:
   *    the latest job is the accepted one (the refused request enqueued
   *    nothing) and it has not failed
   * 3. [202, 202]: the later job (the latest one) is awaited until it settles,
   *    so the workspace is idle again, and the attempt is classified, then
   *    retried on the same workspace, up to EXPORT_RACE_MAX_ATTEMPTS:
   *    - lost race: the first job was SEEN `completed` with
   *      `completed_at + EXPORT_CLOCK_SKEW_TOLERANCE_MS <= later.created_at`
   *      (it finished before the second request reached the DB: no evidence
   *      either way);
   *    - ambiguous: seen `completed`, but inside the tolerance window
   *      (`completed_at` is the worker's JS clock, `created_at` the DB's
   *      `now()`, so a skew-sized gap or overlap proves nothing);
   *    - suspected defect: the first job was NEVER seen completed (only the
   *      latest job is readable), so the two 202s may have been in flight
   *      together.
   *    Any other status pair fails at once.
   * 4. No attempt refused: if ANY attempt was a suspected defect, fails with
   *    "suspected defect: ..."; otherwise (every attempt a lost race or
   *    ambiguous) fails as INCONCLUSIVE ("race lost on all N attempts"). Never
   *    a PASS without a 409.
   *
   * Time budget per attempt (every call carries EXPORT_RACE_CALL_TIMEOUT_MS):
   * POST pair + one trailing reader GET (2 call timeouts), the latest-job read
   * (1 call timeout) and one settle poll (EXPORT_SETTLE_TIMEOUT_MS, each poll
   * read bounded too): 2 x 5 + 5 + 30 = 45 s worst case. The caller's test
   * timeout must cover EXPORT_RACE_MAX_ATTEMPTS attempts.
   *
   * @param workspaceId - A workspace the caller owns, with no export in flight
   * @returns Tuple with the refused response and its error envelope
   */
  @atc('BK-1002')
  async requestExportWhileOneInFlightRefused(workspaceId: string): Promise<[APIResponse, ErrorEnvelope]> {
    const attempts: string[] = [];
    let suspected = 0;
    for (let attempt = 1; attempt <= EXPORT_RACE_MAX_ATTEMPTS; attempt++) {
      const [results, snapshots] = await this.requestTwiceWithSnapshots(workspaceId);
      const statuses = results.map(([response]) => response.status()).sort((a, b) => a - b);

      if (statuses[0] === 202 && statuses[1] === 409) {
        const [, accepted] = results.find(([response]) => response.status() === 202)!;
        const [response, body] = results.find(([refused]) => refused.status() === 409)!;
        expect(accepted.export_job_id).toMatch(UUID_PATTERN);
        expect(body.error?.code, 'error envelope code').toBe('conflict');
        expect((body.error?.details as { reason?: string } | undefined)?.reason, 'error envelope reason')
          .toBe('export_in_progress');
        expect(body.error?.message?.trim().length ?? 0, 'human-readable message').toBeGreaterThan(0);

        const [pollResponse, pollBody] = await this.getExport(workspaceId, EXPORT_RACE_CALL_TIMEOUT_MS);
        expect(pollResponse.status()).toBe(200);
        expect(pollBody.export?.id, 'the latest export is the accepted job, the refused one enqueued nothing')
          .toBe(accepted.export_job_id);
        expect(['queued', 'running', 'completed'], 'the in-flight job is unaffected (never failed)')
          .toContain(pollBody.export?.status);

        return [response, body];
      }

      expect(statuses, 'one request enqueued and the other refused (409), or both enqueued after a lost race')
        .toEqual([202, 202]);
      const ids = results.map(([, body]) => body.export_job_id);
      const [latestResponse, latestBody] = await this.getExport(workspaceId, EXPORT_RACE_CALL_TIMEOUT_MS);
      expect(latestResponse.status(), 'the latest export is readable').toBe(200);
      const laterId = latestBody.export?.id ?? '';
      expect(ids, 'the latest export is one of the two accepted jobs').toContain(laterId);
      const later = await this.waitForExportToSettle({
        workspaceId,
        exportId: laterId,
        requestTimeoutMs: EXPORT_RACE_CALL_TIMEOUT_MS,
      });

      const earlierId = ids.find(id => id !== laterId);
      const earlier = snapshots.filter(job => job.id === earlierId && job.status === 'completed').at(-1);
      if (!earlier) {
        suspected++;
        attempts.push(`attempt ${attempt}: suspected defect, the first job was never observed completed`);
        continue;
      }
      const gapMs = Date.parse(later.created_at) - Date.parse(earlier.completed_at ?? '');
      attempts.push(gapMs >= EXPORT_CLOCK_SKEW_TOLERANCE_MS
        ? `attempt ${attempt}: race lost, the first job completed ${gapMs} ms before the second was created ${windowsOf([earlier, later])}`
        : `attempt ${attempt}: ambiguous, gap ${gapMs} ms is inside the ${EXPORT_CLOCK_SKEW_TOLERANCE_MS} ms clock-skew tolerance ${windowsOf([earlier, later])}`);
    }

    if (suspected > 0) {
      throw new Error(
        `suspected defect: two 202s while the first job was never observed finished — the one-export-in-flight rule may not hold (${suspected} of ${EXPORT_RACE_MAX_ATTEMPTS} attempts; ${attempts.join('; ')})`,
      );
    }
    throw new Error(
      `race lost on all ${EXPORT_RACE_MAX_ATTEMPTS} attempts (inconclusive, not a product defect): ${attempts.join('; ')}`,
    );
  }

  /**
   * ATC: Request exports of two workspaces of the same Owner at once - expects
   * both accepted and both in flight together (the rule is per workspace)
   *
   * Concurrent for the reason given on BK-1002: a sequential request reached
   * the second workspace after the first job had already completed (measured
   * 2026-10-20), which would pass without proving anything. Here the overlap
   * is PROVEN from the jobs' own timestamps, never assumed.
   * Precondition: both workspaces are idle (no export in flight) and both are
   * seeded, so both jobs run ~1 s and overlap despite the requests' arrival
   * skew (with an empty second workspace the overlap was lost 1 of 20 times).
   * 1. POST a request for each workspace concurrently (ACTION)
   * 2. Verify both 202 with distinct, queued job ids
   * 3. Verify both settle `completed` independently and the busy workspace
   *    still offers its own job
   * 4. Overlap: min(completed_at) - max(created_at) > EXPORT_CLOCK_SKEW_TOLERANCE_MS.
   *    `created_at` is stamped by the DB (`now()`), `completed_at` by the
   *    worker's JS clock, so an overlap no larger than the tolerance is
   *    skew-sized and is NOT proof. No proven overlap = a lost race (proves
   *    nothing either way): both jobs are already settled, so the pair is
   *    retried on the same workspaces, up to EXPORT_RACE_MAX_ATTEMPTS; every
   *    attempt lost fails as INCONCLUSIVE (distinct message), never as a PASS.
   *    Steps 2-3 fail at once on any attempt.
   *
   * Time budget per attempt (every call carries EXPORT_RACE_CALL_TIMEOUT_MS):
   * the POST pair (1 call timeout), two settle polls (EXPORT_SETTLE_TIMEOUT_MS
   * each, each poll read bounded too) and one read: 5 + 2 x 30 + 5 = 70 s
   * worst case. The caller's test timeout must cover EXPORT_RACE_MAX_ATTEMPTS attempts.
   *
   * @returns Tuple with the target workspace's response and body
   */
  @atc('BK-1000')
  async requestExportWhileOtherWorkspaceExporting(args: {
    workspaceId: string
    busyWorkspaceId: string
  }): Promise<[APIResponse, RequestWorkspaceExportResponse]> {
    const post = async (workspaceId: string) => this.apiPOST<RequestWorkspaceExportResponse, Record<string, never>>(
      this.endpoints.exportOf(workspaceId),
      {},
      { timeout: EXPORT_RACE_CALL_TIMEOUT_MS },
    );
    const lostAttempts: string[] = [];
    for (let attempt = 1; attempt <= EXPORT_RACE_MAX_ATTEMPTS; attempt++) {
      const [[busyResponse, busyBody], [response, body]] = await Promise.all([
        post(args.busyWorkspaceId),
        post(args.workspaceId),
      ]);

      expect(busyResponse.status(), 'the busy workspace export is enqueued').toBe(202);
      expect(busyBody.export_job_id).toMatch(UUID_PATTERN);
      expect(busyBody.status, 'the busy workspace job is queued').toBe('queued');
      expect(response.status(), 'another workspace of the same Owner may export at the same time').toBe(202);
      expect(body.export_job_id).toMatch(UUID_PATTERN);
      expect(body.export_job_id, 'a distinct job per workspace').not.toBe(busyBody.export_job_id);
      expect(body.status).toBe('queued');

      const busy = await this.waitForExportToSettle({
        workspaceId: args.busyWorkspaceId,
        exportId: busyBody.export_job_id,
        requestTimeoutMs: EXPORT_RACE_CALL_TIMEOUT_MS,
      });
      const other = await this.waitForExportToSettle({
        workspaceId: args.workspaceId,
        exportId: body.export_job_id,
        requestTimeoutMs: EXPORT_RACE_CALL_TIMEOUT_MS,
      });

      const [busyPollResponse, busyPoll] = await this.getExport(args.busyWorkspaceId, EXPORT_RACE_CALL_TIMEOUT_MS);
      expect(busyPollResponse.status()).toBe(200);
      expect(busyPoll.export?.id, 'the busy workspace still offers its own job').toBe(busyBody.export_job_id);

      if (inFlightTogether(busy, other)) {
        return [response, body];
      }
      lostAttempts.push(`attempt ${attempt}: ${windowsOf([busy, other])}`);
    }

    throw new Error(
      `race lost on all ${EXPORT_RACE_MAX_ATTEMPTS} attempts (inconclusive, not a product defect): no overlap beyond the ${EXPORT_CLOCK_SKEW_TOLERANCE_MS} ms clock-skew tolerance (${lostAttempts.join('; ')})`,
    );
  }
}
