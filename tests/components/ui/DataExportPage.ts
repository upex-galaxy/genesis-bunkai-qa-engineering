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

import type { APIResponse, Download, Response } from '@playwright/test';
import type { ErrorEnvelope } from '@schemas/auth.types';
import type { WorkspaceExportJob } from '@schemas/workspace-export.types';
import type { TestContextOptions } from '@TestContext';

import { statSync } from 'node:fs';
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

  /** The view's export API call (`/api/v1/workspaces/{id}/data-export`), not the page or the download route. */
  private isExportApiCall(response: Response, method: 'GET' | 'POST'): boolean {
    return response.request().method() === method
      && /^\/api\/v1\/workspaces\/[^/]+\/data-export$/.test(new URL(response.url()).pathname);
  }

  /** Matches the view's own poll (`GET /api/v1/workspaces/{id}/data-export`). */
  private isExportPoll(response: Response): boolean {
    return this.isExportApiCall(response, 'GET');
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
    await expect(this.page.getByRole('button', { name: 'Request a new export' })).toHaveCount(0, { timeout: 2_000 });
    await expect(this.downloadLink()).toHaveCount(0, { timeout: 2_000 });
  }
}
