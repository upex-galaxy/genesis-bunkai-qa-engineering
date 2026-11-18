/**
 * KATA Architecture - Layer 3: Workspaces Settings Page Component (BK-512)
 *
 * UI component for Settings > Workspaces (`/settings/workspaces`): the list of
 * the caller's workspaces, the owner-only "Delete" action of each row and the
 * "Delete workspace" confirmation modal (type the exact name to confirm). The
 * modal is private locators of this page (used by several ATCs).
 *
 * The product renders stable `data-testid`s on this screen: `workspaces-list`,
 * `workspace-row-<slug>`, `workspace-delete-<slug>`, `workspace-active-<slug>`
 * and the modal's `delete-workspace-modal|input|confirm|cancel`.
 *
 * The delete only re-points the caller's active workspace when the deleted one
 * was ACTIVE, so suites make the synthetic workspace active before they open
 * the page (`createSyntheticWorkspace({ makeActive: true })` on `page.request`).
 *
 * Callbacks, not request contexts: the ATC step title prints its arguments, and
 * a Playwright request context is a circular object.
 */

import type { MeResponse } from '@schemas/auth.types';
import type { Workspace, WorkspaceDeletionRecord } from '@schemas/workspaces.types';
import type { TestContextOptions } from '@TestContext';

import { DELETION_UI_SETTLE_TIMEOUT_MS } from '@data/constants';
import { expect, test } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc, step } from '@utils/decorators';

/** Clock skew tolerated between this machine and the database stamping `requested_at`. */
const AUDIT_CLOCK_SKEW_MS = 60_000;

/** A workspace named in a landing or a "remaining set". */
export interface WorkspaceRef {
  id: string
  name: string
}

/** One workspace screen a teammate opens by direct link (BK-941). */
export interface WorkspaceScreen {
  url: string
  /** Text the screen shows ONLY while the workspace is live (positive marker) */
  liveMarker: string
  /**
   * CSS selector of the region that renders `liveMarker` from the workspace's own
   * content (e.g. `main`), so the app shell (sidebar, workspace switcher) cannot
   * satisfy it; omitted = the whole page (the marker is not in the shell)
   */
  liveRegion?: string
  /** Where the product sends a former member instead (the blocked state) */
  blockedUrl: RegExp
  /** Text the blocked destination shows, proving it rendered before any absence check */
  blockedMarker: string | RegExp
}

/** Input of the BK-937 ATC. */
export interface OwnerDeletionCheck {
  /** The synthetic workspace the Owner deletes (it is the ACTIVE one) */
  workspace: Workspace
  /** A workspace where the Owner is only a member: its row must offer no Delete */
  memberOnly: Workspace
  /** Every other workspace the Owner belongs to (the possible landings) */
  remaining: WorkspaceRef[]
  /**
   * Content snapshot taken before the deletion, by workspace id: ONLY the expected
   * landing (the Owner's oldest remaining workspace), not every remaining one
   */
  snapshotsBefore: Record<string, unknown>
  /** Reads the same snapshot now */
  readSnapshot: (workspaceId: string) => Promise<unknown>
  /** The Owner's user id (the audit row's `requested_by`) */
  ownerUserId: string
  /**
   * Reads the `workspace_deletions` rows of the workspace; `null` when no read-only
   * DB is configured (the ATC then skips the test after its UI part, naming the variable)
   */
  readDeletionAudit: () => Promise<WorkspaceDeletionRecord[] | null>
}

export class WorkspacesSettingsPage extends UiBase {
  private readonly route = '/settings/workspaces';

  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // Shared locators (2+ uses)
  // ============================================

  private readonly workspacesList = () => this.page.getByTestId('workspaces-list');
  private readonly rowOf = (workspace: Workspace) => this.page.getByTestId(`workspace-row-${workspace.slug}`);
  private readonly deleteButtonOf = (workspace: Workspace) => this.page.getByTestId(`workspace-delete-${workspace.slug}`);
  private readonly modal = () => this.page.getByTestId('delete-workspace-modal');
  private readonly nameInput = () => this.page.getByTestId('delete-workspace-input');
  private readonly confirmButton = () => this.page.getByTestId('delete-workspace-confirm');
  private readonly cancelButton = () => this.page.getByTestId('delete-workspace-cancel');

  /** The caller's own identity snapshot (`GET /me`), on the page's cookie session. */
  private async readMe(): Promise<[number, MeResponse]> {
    const response = await this.page.request.get(`${this.config.apiUrl.replace(/\/$/, '')}/me`);
    return [response.status(), (await response.json().catch(() => ({}))) as MeResponse];
  }

  // ============================================
  // Navigation / precondition helpers (Public, no @atc)
  // ============================================

  /** Open Settings > Workspaces and wait for the list card. */
  @step
  async goto(): Promise<void> {
    await this.page.goto(this.route);
    await expect(this.workspacesList()).toBeVisible();
  }

  /** Open the delete confirmation of a row and verify the modal names exactly that workspace. */
  @step
  async openDeleteConfirmation(workspace: Workspace): Promise<void> {
    await this.deleteButtonOf(workspace).click();
    await expect(this.modal()).toBeVisible();
    await expect(this.modal()).toContainText(workspace.name);
    await expect(this.modal()).toContainText(workspace.slug);
  }

  /**
   * Precondition of BK-941 (run as the teammate BEFORE the deletion): every
   * screen renders its live marker, so its absence afterwards is not vacuous.
   */
  @step
  async verifyWorkspaceScreensLive(screens: WorkspaceScreen[]): Promise<void> {
    for (const screen of screens) {
      await this.page.goto(screen.url);
      const region = screen.liveRegion === undefined ? this.page : this.page.locator(screen.liveRegion);
      await expect(
        region.getByText(screen.liveMarker).first(),
        `${screen.url} shows "${screen.liveMarker}" in ${screen.liveRegion ?? 'the page'} while the workspace is live`,
      ).toBeVisible();
    }
  }

  // ============================================
  // ATCs - Complete Test Cases
  // ============================================

  /**
   * ATC: The confirm action stays unavailable until the exact name is typed
   *
   * Complete flow:
   * 1. Open Settings > Workspaces and the delete confirmation of the workspace (ACTION)
   * 2. Type `typed` (ACTION) and verify the confirm button is disabled and the
   *    modal is still open
   * 3. Control: type the exact name, the confirm button enables; then Cancel (the
   *    deletion is NEVER confirmed here) and the workspace is still listed
   *
   * Parameterized over the typed-name partitions (empty, prefix, other case,
   * whitespace-padded); the deletion itself is BK-937's.
   *
   * `workspace`: A synthetic workspace the caller owns
   * `typed`: What is typed into the name field (differs from the name)
   */
  @atc('BK-926')
  async verifyConfirmGatedByExactName(args: { workspace: Workspace, typed: string }): Promise<void> {
    const { workspace, typed } = args;
    await this.goto();
    await this.openDeleteConfirmation(workspace);

    await this.nameInput().fill(typed);
    await expect(this.nameInput()).toHaveValue(typed);
    await expect(this.confirmButton(), `confirm is unavailable for the typed value "${typed}"`).toBeDisabled();
    await expect(this.modal()).toBeVisible();

    await this.nameInput().fill(workspace.name);
    await expect(this.confirmButton(), 'control: the exact name enables the confirm action').toBeEnabled();

    await this.cancelButton().click();
    await expect(this.modal()).toHaveCount(0);
    await expect(this.rowOf(workspace), 'the workspace is still listed').toBeVisible();
  }

  /**
   * ATC: Dismissing the confirmation after typing the exact name changes nothing
   *
   * Complete flow:
   * 1. Read the workspace content (VERIFICATION baseline) and open the confirmation
   *    (ACTION): the modal names exactly this workspace, nothing is deleted yet
   * 2. Type the exact name (the confirm action enables) and press Cancel (ACTION)
   * 3. Verify the modal is gone, the row is still listed (also after a reload) and the
   *    content read again equals the baseline
   * 4. Reopen the confirmation: the name field is empty, then Cancel again
   *
   * `workspace`: A synthetic workspace the caller owns
   * `readContentSnapshot`: Reads the workspace's content (API, caller's session)
   */
  @atc('BK-930')
  async dismissDeleteConfirmationChangingNothing(args: {
    workspace: Workspace
    readContentSnapshot: () => Promise<unknown>
  }): Promise<void> {
    const { workspace } = args;
    const before = await args.readContentSnapshot();

    await this.goto();
    await this.openDeleteConfirmation(workspace);
    await this.nameInput().fill(workspace.name);
    await expect(this.confirmButton()).toBeEnabled();

    await this.cancelButton().click();
    await expect(this.modal()).toHaveCount(0);
    await expect(this.rowOf(workspace), 'the workspace is still listed').toBeVisible();
    await this.page.reload();
    await expect(this.rowOf(workspace), 'the workspace is still listed after a reload').toBeVisible();
    expect(await args.readContentSnapshot(), 'nothing was deleted or changed').toEqual(before);

    await this.openDeleteConfirmation(workspace);
    await expect(this.nameInput(), 'reopening starts with an empty name field').toHaveValue('');
    await this.cancelButton().click();
    await expect(this.modal()).toHaveCount(0);
  }

  /**
   * ATC: The Owner deletes one of several workspaces - lands in another, told which, audit written
   *
   * Complete flow:
   * 1. Open Settings > Workspaces (ACTION): the Owner's row offers Delete, the row of
   *    the workspace where the Owner is only a member offers none; the subject is
   *    the ACTIVE workspace
   * 2. Confirm the deletion with the exact name (ACTION)
   * 3. Verify the row is gone, the toast names a workspace of the remaining set,
   *    `GET /me` reports that workspace as active, and its content equals the
   *    snapshot taken before (the landing is the oldest remaining membership, so
   *    no specific destination is asserted)
   * 4. Verify the `workspace_deletions` row (read-only DB): exactly one, with the name
   *    at the time, the Owner as requester and a request time inside the action window
   *    (no read-only DB configured: after the whole UI part ran, the test is
   *    skipped at runtime, so BK-937 records SKIP / NOT RUN, never PASS)
   */
  @atc('BK-937')
  async deleteOwnedWorkspaceAsOwner(args: OwnerDeletionCheck): Promise<void> {
    const { workspace, memberOnly, remaining } = args;
    await this.goto();
    await expect(this.deleteButtonOf(workspace), 'the Owner row offers Delete').toBeVisible();
    await expect(this.rowOf(memberOnly), 'the member-only workspace is listed').toBeVisible();
    await expect(this.deleteButtonOf(memberOnly), 'a workspace the caller does not own offers no Delete').toHaveCount(0);
    await expect(this.page.getByTestId(`workspace-active-${workspace.slug}`), 'the subject is the active workspace')
      .toContainText('active');

    const startedAt = Date.now();
    await this.openDeleteConfirmation(workspace);
    await this.nameInput().fill(workspace.name);
    await this.confirmButton().click();

    await expect(this.modal()).toHaveCount(0);
    await expect(this.rowOf(workspace), 'the deleted workspace is no longer listed').toHaveCount(0);

    const toast = this.page.getByText(`${workspace.name} was deleted.`);
    await expect(toast).toBeVisible();
    const toastText = (await toast.first().textContent()) ?? '';
    const landed = /was deleted\. (.+) is now your active workspace\./.exec(toastText)?.[1];
    expect(landed, `the toast names the new active workspace ("${toastText}")`).toBeDefined();
    const landing = remaining.filter(item => item.name === landed);
    expect(landing.length, 'the named workspace is one the Owner still belongs to').toBeGreaterThan(0);

    await expect.poll(async () => {
      const [status, me] = await this.readMe();
      return status === 200 ? me.active_workspace_id : `http-${status}`;
    }, {
      message: 'GET /me reports the workspace named in the toast as active',
      timeout: DELETION_UI_SETTLE_TIMEOUT_MS,
    }).toEqual(expect.stringMatching(new RegExp(`^(${landing.map(item => item.id).join('|')})$`)));
    const [meStatus, me] = await this.readMe();
    expect(meStatus, 'GET /me').toBe(200);
    const landedId = me.active_workspace_id as string;

    expect(args.snapshotsBefore[landedId], `a before-snapshot was taken of the landing ${landedId}`).toBeDefined();
    expect(await args.readSnapshot(landedId), 'the destination workspace is exactly as it was').toEqual(
      args.snapshotsBefore[landedId],
    );
    const endedAt = Date.now();

    const audit = await args.readDeletionAudit();
    // No read-only DB: the UI part above ran and passed, but the merged audit TCs
    // (TC47, TC61) did not run. Skipping INSIDE the ATC records BK-937 as SKIP
    // (NOT RUN), never PASS.
    test.skip(
      audit === null,
      `workspace_deletions audit not checked: ${this.config.readOnlyDb.varName ?? 'STAGING_DB_RO_URL'} is not set `
      + '(needs the qa_inspector_ro read-only connection); the UI assertions ran and passed',
    );
    // test.skip above ends the test at runtime when audit is null
    const rows = audit!;
    expect(rows, 'exactly one deletion row').toHaveLength(1);
    const [row] = rows;
    expect(row.workspaceName, 'the audit row keeps the name at the time').toBe(workspace.name);
    expect(row.workspaceSlug).toBe(workspace.slug);
    expect(row.requestedBy, 'the audit row names the Owner').toBe(args.ownerUserId);
    expect(row.requestedAt.getTime(), 'requested_at is not before the action').toBeGreaterThanOrEqual(startedAt - AUDIT_CLOCK_SKEW_MS);
    expect(row.requestedAt.getTime(), 'requested_at is not after the action').toBeLessThanOrEqual(endedAt + AUDIT_CLOCK_SKEW_MS);
    expect(row.purgedAt, 'not purged yet').toBeNull();
  }

  /**
   * ATC: Deleting the only workspace lands the Owner on onboarding, still signed in
   *
   * Precondition: the caller's only workspace is the synthetic one, and it is active.
   * 1. Open Settings > Workspaces: the row is listed (precondition guard)
   * 2. Confirm the deletion with the exact name (ACTION)
   * 3. Verify the URL is `/onboarding` and the page offers the create-workspace form
   * 4. Verify the caller is still signed in: `GET /me` answers 200 with no workspace
   *
   * `workspace`: The synthetic workspace, the caller's only one
   */
  @atc('BK-946')
  async deleteOnlyWorkspaceLandingOnOnboarding(args: { workspace: Workspace }): Promise<void> {
    const { workspace } = args;
    await this.goto();
    const [beforeStatus, before] = await this.readMe();
    expect(beforeStatus, 'precondition: signed in').toBe(200);
    expect(before.workspaces.map(item => item.id), 'precondition: exactly this workspace').toEqual([workspace.id]);

    await this.openDeleteConfirmation(workspace);
    await this.nameInput().fill(workspace.name);
    await this.confirmButton().click();

    await expect(this.page).toHaveURL(/\/onboarding$/, { timeout: DELETION_UI_SETTLE_TIMEOUT_MS });
    await expect(this.page.getByText('Create workspace', { exact: true }).first()).toBeVisible();
    await expect(this.page.getByPlaceholder('Acme QA'), 'the workspace name field is offered').toBeVisible();
    await expect(this.page.getByPlaceholder('acme-qa'), 'the URL slug field is offered').toBeVisible();
    await expect(this.page.getByRole('button', { name: /^Create workspace/ })).toBeEnabled();

    const [afterStatus, after] = await this.readMe();
    expect(afterStatus, 'still signed in').toBe(200);
    expect(after.workspaces, 'the caller belongs to no workspace now').toEqual([]);
  }

  /**
   * ATC: A former member cannot reach any screen of the deleted workspace
   *
   * Runs on the TEAMMATE's page, after the Owner deleted the workspace; the test
   * first ran `verifyWorkspaceScreensLive` on the same screens (positive control).
   * 1. Open each deleted-workspace URL (ACTION) and verify the blocked state
   *    rendered (the product's redirect destination and its marker), then that
   *    the screen's live marker and every hidden text are gone; open the deleted
   *    URL again: same (nothing served from cache)
   * 2. The restore page (it holds no workspace content, live or deleted): the
   *    teammate's restore is refused (error state) and the workspace stays gone
   * 3. Read the workspace through the teammate's own API session: 404 (guards
   *    against a UI-only masking of an API leak)
   *
   * `screens`: Deleted-workspace screens, opened by direct link
   * `restoreUrl`: The workspace's restore page
   * `hiddenTexts`: Texts that only the deleted workspace holds
   * `readDeletedWorkspaceStatus`: Status of `GET /workspaces/{id}` on the teammate's session
   */
  @atc('BK-941')
  async verifyDeletedWorkspaceScreensBlocked(args: {
    screens: WorkspaceScreen[]
    restoreUrl: string
    hiddenTexts: string[]
    readDeletedWorkspaceStatus: () => Promise<number>
  }): Promise<void> {
    for (const screen of args.screens) {
      // Twice: the second request re-asks the deleted URL itself (a reload would re-ask the redirect destination)
      for (const phase of ['opened', 'reopened']) {
        await this.page.goto(screen.url);
        await expect(this.page, `${screen.url} (${phase}) sends the teammate away`).toHaveURL(screen.blockedUrl);
        await expect(this.page.getByText(screen.blockedMarker).first(), `${screen.url} (${phase}) renders the blocked state`)
          .toBeVisible();
        for (const text of [screen.liveMarker, ...args.hiddenTexts]) {
          await expect(this.page.getByText(text), `${screen.url} (${phase}) shows no "${text}"`).toHaveCount(0);
        }
      }
    }

    await this.page.goto(args.restoreUrl);
    await this.page.getByRole('button', { name: 'Restore workspace' }).click();
    await expect(this.page.getByRole('button', { name: 'Back to sign-in' }), 'the teammate\'s restore is refused').toBeVisible();
    await expect(this.page.getByText('is back.'), 'nothing was restored').toHaveCount(0);

    expect(await args.readDeletedWorkspaceStatus(), 'the teammate API cannot read the deleted workspace').toBe(404);
  }
}
