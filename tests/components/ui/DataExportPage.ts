/**
 * KATA Architecture - Layer 3: Data Export Page Component (BK-508)
 *
 * UI component for Settings > Data export (`/settings/data-export`).
 * The page shows the persistent "What's in an export" card and the "Export
 * status" card, which drives the lifecycle: never-requested -> preparing ->
 * ready (or expired / failed). The view polls the export API every 4 s while
 * preparing. The Settings nav lists "Data export" only for the Owner of the
 * ACTIVE workspace (`bk_active_ws` cookie), so callers switch the active
 * workspace on `page.request` before navigating. The BK-1001 ATC also calls
 * the export routes on `page.request` (the page's own cookie session).
 *
 * The product renders no data-testid on this screen: locators are role/text
 * based, inline (shared ones extracted below at 2+ uses).
 */

import type { APIResponse, Download, Response, Route } from '@playwright/test';
import type { ErrorEnvelope } from '@schemas/auth.types';
import type { WorkspaceExportJob } from '@schemas/workspace-export.types';
import type { TestContextOptions } from '@TestContext';

import { statSync } from 'node:fs';
import { EXPORT_DOWNLOAD_WINDOW_MS } from '@data/constants';
import { expect } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc, step } from '@utils/decorators';

export interface DownloadedArchive {
  /** File name the browser suggested for the download */
  suggestedFilename: string
  /** Size of the saved file in bytes */
  sizeBytes: number
}

/** Input of the BK-1001 ATC: the non-Owner side runs on this page, the Owner side through the reader. */
export interface NonOwnerExportCheck {
  /** The active workspace (guard: the view reads THIS workspace) */
  workspaceId: string
  /** The Owner's latest (completed) export before the non-Owner calls */
  ownerExportId: string
  /** Reads the latest export id on the OWNER's session (a non-Owner cannot read it) */
  readOwnerLatestExportId: () => Promise<string | null>
}

const PREPARING_TEXT = 'An export is being prepared, requested';
const READY_TEXT = 'Your export is ready. Downloadable until';
const NEVER_REQUESTED_TEXT = 'No export has been requested yet';
const EXPIRED_TEXT = 'The last export has expired';
const FAILED_TEXT = 'The export failed to prepare';

/** Browser clock offset for the BK-1003 expired partition: mid-partition, well past the boundary BK-1006 owns. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** State of a completed export the status card shows for a given browser clock. */
export type CompletedExportState = 'ready' | 'expired';

/** Input of the BK-1006 ATC: one BVA row on the window end. */
export interface ExpiryBoundaryCheck {
  /** The real completed export of the active workspace (its `expires_at` and `completed_at` are the worker's) */
  completedExport: WorkspaceExportJob
  /** Browser clock relative to `expires_at`, in ms (negative = before the instant) */
  offsetMs: number
  expectedState: CompletedExportState
}

export class DataExportPage extends UiBase {
  private readonly route = '/settings/data-export';

  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // Shared locators (2+ uses)
  // ============================================

  private readonly settingsNav = () => this.page.getByRole('navigation', { name: 'Settings sections' });
  private readonly dataExportNavLink = () => this.settingsNav().getByRole('link', { name: 'Data export', exact: true });
  private readonly statusCard = () => this.page.getByText('Export status', { exact: true });
  private readonly downloadLink = () => this.page.getByRole('link', { name: 'Download archive' });
  private readonly requestButton = () => this.page.getByRole('button', { name: 'Request export', exact: true });
  private readonly preparingText = () => this.page.getByText(PREPARING_TEXT);
  private readonly readyText = () => this.page.getByText(READY_TEXT);
  private readonly expiredText = () => this.page.getByText(EXPIRED_TEXT);
  private readonly requestNewExportButton = () => this.page.getByRole('button', { name: 'Request a new export' });

  /** The view's export API call (`/api/v1/workspaces/{id}/data-export`), not the page or the download route. */
  private isExportApiCall(response: Response, method: 'GET' | 'POST'): boolean {
    return response.request().method() === method
      && /^\/api\/v1\/workspaces\/[^/]+\/data-export$/.test(new URL(response.url()).pathname);
  }

  /** The browser Supabase client's refresh-token call (side-effect guard of openAtBrowserTime). */
  private readonly isRefreshTokenCall = (url: URL): boolean =>
    url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'refresh_token';

  /** One handler instance, so openAtBrowserTime can unroute it before routing it again. */
  private readonly abortRefreshTokenCall = async (route: Route): Promise<void> => route.abort();

  /** Matches the view's own poll (`GET /api/v1/workspaces/{id}/data-export`). */
  private isExportPoll(response: Response): boolean {
    return this.isExportApiCall(response, 'GET');
  }

  /**
   * Open the page with the browser clock pinned at `instantMs` and verify the
   * view read THIS completed export (guard against a stale or foreign row).
   *
   * The view derives ready / expired client-side (`expires_at > Date.now()`),
   * so pinning `Date.now()` (`clock.setFixedTime`, timers keep running) reaches
   * those states on the real data path, with no DB write and no faked response.
   * Side-effect guard, not a state fake: with the clock days ahead, the
   * browser's Supabase client would see its access token as expired and rotate
   * the shared session's refresh token; the refresh call is aborted (a
   * retryable network error to the client, which keeps its session). The page
   * and the export API authenticate on the server clock, so they are unaffected.
   *
   * Safe to call several times on the same page (BK-1006 opens it once per BVA
   * row): the abort route is the same matcher + handler pair, unrouted before it
   * is routed again (never stacked), and every call re-pins the clock before a
   * fresh navigation, so each row reads its own instant.
   *
   * Budget: navigation and the view's read run in parallel, 15 s each.
   */
  private async openAtBrowserTime(completedExport: WorkspaceExportJob, instantMs: number): Promise<void> {
    await this.page.unroute(this.isRefreshTokenCall, this.abortRefreshTokenCall);
    await this.page.route(this.isRefreshTokenCall, this.abortRefreshTokenCall);
    await this.page.clock.setFixedTime(new Date(instantMs));

    const read = this.page.waitForResponse(response => this.isExportPoll(response), { timeout: 15_000 });
    await this.page.goto(this.route, { timeout: 15_000 });
    const response = await read;
    expect(response.status(), 'the view reads the export').toBe(200);
    const job = ((await response.json()) as { export: WorkspaceExportJob | null }).export;
    expect(job?.id, 'the view reads the completed export under test').toBe(completedExport.id);
    expect(job?.expires_at, 'the view reads the worker\'s expires_at').toBe(completedExport.expires_at);
  }

  /** Format an ISO instant the way the view does (`toLocaleString()` in the browser). */
  private async formatInBrowser(iso: string): Promise<string> {
    return this.page.evaluate(value => new Date(value).toLocaleString(), iso);
  }

  // ============================================
  // Navigation (Public)
  // ============================================

  /**
   * Open Settings > Data export directly and wait for the status card to load.
   */
  @step
  async goto(): Promise<void> {
    await this.page.goto(this.route);
    await expect(this.statusCard()).toBeVisible();
  }

  // ============================================
  // ATCs - Complete Test Cases
  // ============================================

  /**
   * ATC: Owner opens Settings and finds the Data export section with its explanation
   *
   * Precondition: the caller owns the ACTIVE workspace, which was never exported.
   * 1. Open Settings (ACTION) - the nav lists "Data export"
   * 2. Follow the nav entry (ACTION)
   * 3. Verify the page, the explanation card (entities covered, no credential,
   *    7-day download window) and the status card, which offers the first
   *    request: "No export has been requested yet" and an enabled "Request export"
   */
  @atc('BK-994')
  async openDataExportSectionAsOwner(): Promise<void> {
    await this.page.goto('/settings/account');
    await expect(this.dataExportNavLink()).toBeVisible();

    await this.dataExportNavLink().click();
    await expect(this.page).toHaveURL(/\/settings\/data-export$/);
    await expect(this.dataExportNavLink()).toHaveAttribute('aria-current', 'page');
    await expect(this.page.getByRole('heading', { level: 1, name: 'Data export' })).toBeVisible();

    await expect(this.page.getByText('What\'s in an export', { exact: true })).toBeVisible();
    const explanation = this.page.getByText(/A single archive of this workspace's/);
    await expect(explanation).toContainText(
      'Projects, Modules, User Stories, Acceptance Criteria, ATCs, Tests, Runs, Bugs, activity, and membership',
    );
    await expect(explanation).toContainText('No credential (Personal Access Token, invite link, or magic link) is ever included');
    await expect(explanation).toContainText('downloadable for 7 days');
    await expect(this.statusCard()).toBeVisible();

    await expect(this.page.getByText(NEVER_REQUESTED_TEXT)).toBeVisible();
    await expect(this.requestButton()).toBeEnabled();
  }

  /**
   * ATC: Owner requests an export - expects an immediate "being prepared" acknowledgement
   *
   * Precondition: the page is open (goto) on a never-exported active workspace
   * with content (an empty one can export before the view re-reads it).
   * 1. Click "Request export" (ACTION)
   * 2. Verify the view re-reads the export and shows it as being prepared, with
   *    its request time (formatted the way the view formats it), without
   *    waiting for completion
   * 3. Reload, then leave Settings > Data export and come back: the request is
   *    still shown (preparing, or ready if the job finished meanwhile), never
   *    "No export has been requested yet"
   * 4. Re-read the export API on the page's own session: the latest export is
   *    the job the UI requested
   *
   * @returns The export job the UI requested (as the view read it)
   */
  @atc('BK-995')
  async requestExportAcknowledged(): Promise<WorkspaceExportJob> {
    await expect(this.page.getByText(NEVER_REQUESTED_TEXT)).toBeVisible();

    const posted = this.page.waitForResponse(
      response => this.isExportApiCall(response, 'POST'),
    );
    const reread = this.page.waitForResponse(response => this.isExportPoll(response));
    await this.requestButton().click();

    expect((await posted).status(), 'export request').toBe(202);
    const poll = await reread;
    expect(poll.status(), 'the view re-reads the export').toBe(200);
    const job = ((await poll.json()) as { export: WorkspaceExportJob | null }).export;
    expect(job, 'the view reads the job just requested').not.toBeNull();
    // The view renders "being prepared" ONLY from this re-read (the 202 itself sets no state), and the
    // job runs server-side right after the 202, so a job that completes before the re-read makes the
    // state unobservable. No honest test-side hold exists: delaying the re-read widens the race, and
    // fulfilling it would fabricate the state. Seeding narrows the race but does not close it (test is fixme).
    expect(['queued', 'running'], 'acknowledged while the job is in flight (a "completed" here means the job won the race against the view\'s re-read: inconclusive, not a product defect)').toContain(job!.status);

    const requestedAt = await this.formatInBrowser(job!.created_at);
    await expect(this.preparingText()).toContainText(`${PREPARING_TEXT} ${requestedAt}`);
    await expect(this.requestButton()).toHaveCount(0);

    const stillRequested = this.preparingText().or(this.readyText());
    await this.page.reload();
    await expect(stillRequested).toBeVisible();
    await expect(this.page.getByText(NEVER_REQUESTED_TEXT)).toHaveCount(0);

    await this.page.goto('/settings/account');
    await this.dataExportNavLink().click();
    await expect(this.page).toHaveURL(/\/settings\/data-export$/);
    await expect(stillRequested).toBeVisible();
    await expect(this.page.getByText(NEVER_REQUESTED_TEXT)).toHaveCount(0);

    const latest = await this.page.request.get(poll.url());
    expect(latest.status(), 'the API re-reads the latest export').toBe(200);
    const latestJob = ((await latest.json()) as { export: WorkspaceExportJob | null }).export;
    expect(latestJob?.id, 'the API offers the job the UI requested').toBe(job!.id);

    return job!;
  }

  /**
   * ATC: Owner downloads a ready archive - expects one ZIP file download
   *
   * Precondition: the active workspace has a completed, unexpired export.
   * 1. Open the page and verify the ready state with its "Downloadable until" date
   * 2. Click "Download archive" (ACTION)
   * 3. Verify one browser download named `workspace-export-<id>-<YYYY-MM-DD>.zip`
   *    whose saved file is the whole archive (size equals the export's `archive_bytes`)
   *
   * @param workspaceId - The active workspace (the file name embeds it)
   * @param expectedBytes - The completed export's `archive_bytes` (null fails the size check)
   * @returns The suggested file name and the saved size
   */
  @atc('BK-996')
  async downloadReadyArchive(workspaceId: string, expectedBytes: number | null): Promise<DownloadedArchive> {
    await this.page.goto(this.route);
    await expect(this.readyText()).toBeVisible();
    await expect(this.readyText()).toContainText(/Downloadable until .*\d/);
    await expect(this.downloadLink()).toHaveCount(1);

    const downloadEvent: Promise<Download> = this.page.waitForEvent('download');
    await this.downloadLink().click();
    const download = await downloadEvent;

    expect(await download.failure(), 'the download completes').toBeNull();
    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename).toMatch(new RegExp(`^workspace-export-${workspaceId}-\\d{4}-\\d{2}-\\d{2}\\.zip$`));

    const sizeBytes = statSync(await download.path()).size;
    expect(sizeBytes, 'the saved archive is non-empty').toBeGreaterThan(0);
    expect(sizeBytes, 'the saved file is the whole archive').toBe(expectedBytes);

    return { suggestedFilename, sizeBytes };
  }

  /**
   * ATC: A non-Owner member calls the export routes and opens Settings - expects
   * every route refused, no job enqueued, and no Data export section anywhere
   *
   * Every BK-1001 verification runs inside this ATC, so any failure (API, Owner
   * side or UI) records a FAIL row for BK-1001; a check run before it would
   * abort the test without a row and let the other roles' PASS rows sync alone.
   *
   * Precondition: the caller (this page's session) is an active admin, member or
   * viewer of the ACTIVE workspace (not its Owner), and the Owner has a completed
   * export there, so a refused download cannot be a 404 in disguise.
   * 1. POST a request, GET the poll, GET the download on the caller's own cookie
   *    session (ACTION): each answers 403 with the `forbidden` envelope carrying
   *    the Owner-gate wording, and the download carries no ZIP
   * 2. Re-read the latest export on the Owner's session: still the Owner's own
   *    export (the refused request enqueued nothing)
   * 3. Open Settings (ACTION): the nav renders (positive control: Account) but
   *    lists no "Data export" entry
   * 4. Open `/settings/data-export` directly (ACTION): the view's export read is
   *    refused (403) and the page shows no export data: no lifecycle text, no
   *    "Request export" button, no "Download archive" link
   *
   * Time budget: every wait carries its own timeout, so slowness throws HERE
   * (FAIL row written) instead of the test timeout abandoning the body (no row,
   * the other roles' PASS rows sync alone). Worst case ~121 s: API calls 3 x 10 s,
   * Owner re-read 30 s (ApiBase default), Settings 15 + 5 + 5 s, direct open 15 s
   * (navigation and the view's read in parallel) + 5 s, absence checks 8 x 2 s
   * (the error state is already rendered). The caller's test timeout must cover
   * this plus its precondition and cleanup.
   */
  @atc('BK-1001')
  async verifySectionHiddenForNonOwner(args: NonOwnerExportCheck): Promise<void> {
    const { workspaceId } = args;
    const exportUrl = `${this.config.apiUrl.replace(/\/$/, '')}/workspaces/${workspaceId}/data-export`;
    const calls: [string, () => Promise<APIResponse>][] = [
      ['request', async () => this.page.request.post(exportUrl, { data: {}, timeout: 10_000 })],
      ['poll', async () => this.page.request.get(exportUrl, { timeout: 10_000 })],
      ['download', async () => this.page.request.get(`${exportUrl}/download`, { timeout: 10_000 })],
    ];
    for (const [endpoint, call] of calls) {
      const response = await call();
      expect(response.status(), `${endpoint}: a non-Owner is refused`).toBe(403);
      expect(response.headers()['content-type'] ?? '', `${endpoint}: no archive bytes`).not.toContain('application/zip');
      const body = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      expect(body.error?.code, `${endpoint}: error envelope code`).toBe('forbidden');
      // Product wording: assertExportAuthorized (request, poll) and the download route's 42501 mapping
      expect(body.error?.message, `${endpoint}: the Owner gate, not the cookie-only gate`)
        .toMatch(/^Only the workspace Owner can (request or )?download a data export\.$/);
    }

    expect(await args.readOwnerLatestExportId(), 'no job was enqueued by the non-Owner').toBe(args.ownerExportId);

    await this.page.goto('/settings/account', { timeout: 15_000 });
    await expect(this.settingsNav().getByRole('link', { name: 'Account', exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(this.dataExportNavLink()).toHaveCount(0, { timeout: 5_000 });

    const refused = this.page.waitForResponse(response => this.isExportPoll(response), { timeout: 15_000 });
    await this.page.goto(this.route, { timeout: 15_000 });
    const read = await refused;
    expect(new URL(read.url()).pathname, 'the view reads the active workspace under test')
      .toBe(`/api/v1/workspaces/${workspaceId}/data-export`);
    expect(read.status(), 'the view\'s export read is refused').toBe(403);
    await expect(this.page.getByText('Could not load the export status.'), 'non-disclosure state').toBeVisible({ timeout: 5_000 });

    for (const text of [NEVER_REQUESTED_TEXT, PREPARING_TEXT, READY_TEXT, EXPIRED_TEXT, FAILED_TEXT]) {
      await expect(this.page.getByText(text), `no lifecycle text: ${text}`).toHaveCount(0, { timeout: 2_000 });
    }
    await expect(this.requestButton()).toHaveCount(0, { timeout: 2_000 });
    await expect(this.requestNewExportButton()).toHaveCount(0, { timeout: 2_000 });
    await expect(this.downloadLink()).toHaveCount(0, { timeout: 2_000 });
  }

  /**
   * ATC: Owner opens Data export after the window lapsed - expects "expired" and
   * a fresh request offered instead of a download
   *
   * Precondition: the active workspace has a real completed export.
   * 1. Pin the browser clock one day past `expires_at` and open the page (ACTION;
   *    mid-partition value, the boundary itself is BK-1006)
   * 2. Verify the expired text, an enabled "Request a new export" button, no
   *    "Download archive" link, no anchor to the download route, no ready text
   *
   * Server-side refusal of an expired download is BK-1010 (out of automation):
   * the browser clock cannot expire the archive for the server.
   *
   * Time budget: page open ~15 s (see openAtBrowserTime), 2 x 5 s visible
   * checks, 3 x 2 s absence checks: ~31 s worst case, every wait bounded.
   *
   * @param completedExport - The active workspace's completed export (real `expires_at`)
   */
  @atc('BK-1003')
  async verifyExpiredArchiveNotOffered(completedExport: WorkspaceExportJob): Promise<void> {
    const expiresAt = Date.parse(completedExport.expires_at ?? '');
    expect(Number.isNaN(expiresAt), 'precondition: a completed export with an expires_at').toBe(false);

    await this.openAtBrowserTime(completedExport, expiresAt + ONE_DAY_MS);

    await expect(this.expiredText()).toContainText('no longer downloadable', { timeout: 5_000 });
    await expect(this.requestNewExportButton()).toBeEnabled({ timeout: 5_000 });
    await expect(this.downloadLink()).toHaveCount(0, { timeout: 2_000 });
    await expect(this.page.locator('a[href$="/data-export/download"]')).toHaveCount(0, { timeout: 2_000 });
    await expect(this.readyText()).toHaveCount(0, { timeout: 2_000 });
  }

  /**
   * ATC: Owner opens Data export with the browser clock at a point around the
   * expiry instant - expects the state that matches it (BVA on the window end)
   *
   * Precondition: the active workspace has a real completed export.
   * 1. Verify the window is exactly 168 h (`expires_at - completed_at`)
   * 2. Pin the browser clock at `expires_at + offsetMs` and open the page (ACTION)
   * 3. Verify the state: `ready` -> ready text and one "Download archive" link,
   *    no expired text; `expired` -> expired text, an enabled "Request a new
   *    export" button, no download link, no ready text. The view uses a strict
   *    `expires_at > now`, so the instant itself is already expired.
   *
   * Rows (shared testId): -1000 ms -> ready, 0 -> expired, +1000 ms -> expired.
   * The caller runs the rows SEQUENTIALLY in one test, on one completed export
   * and one page (the ATC re-pins the clock and re-opens the page per call), so
   * a failing row throws (FAIL row) and stops the later ones. A test timeout
   * mid-row would write no row at all; the per-call bounds below plus the
   * caller's budget (worst case + 25 %) keep that from happening under them.
   * Time budget per call: page open ~15 s (see openAtBrowserTime), 2 x 5 s
   * visible checks, up to 2 x 2 s absence checks: ~29 s worst case (~31 s with
   * the window check and route setup), every wait bounded, so a slow env throws
   * HERE (FAIL row) well before the test timeout.
   */
  @atc('BK-1006')
  async verifyStateAtExpiryBoundary(args: ExpiryBoundaryCheck): Promise<void> {
    const { completedExport, offsetMs, expectedState } = args;
    const expiresAt = Date.parse(completedExport.expires_at ?? '');
    const completedAt = Date.parse(completedExport.completed_at ?? '');
    expect(expiresAt - completedAt, 'the download window is exactly 168 h').toBe(EXPORT_DOWNLOAD_WINDOW_MS);

    await this.openAtBrowserTime(completedExport, expiresAt + offsetMs);

    if (expectedState === 'ready') {
      await expect(this.readyText()).toBeVisible({ timeout: 5_000 });
      await expect(this.downloadLink()).toHaveCount(1, { timeout: 5_000 });
      await expect(this.expiredText()).toHaveCount(0, { timeout: 2_000 });
    }
    else {
      await expect(this.expiredText()).toBeVisible({ timeout: 5_000 });
      await expect(this.requestNewExportButton()).toBeEnabled({ timeout: 5_000 });
      await expect(this.downloadLink()).toHaveCount(0, { timeout: 2_000 });
      await expect(this.readyText()).toHaveCount(0, { timeout: 2_000 });
    }
  }
}
