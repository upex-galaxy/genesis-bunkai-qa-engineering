/**
 * Workspace Data Export - Expired archive in Settings (BK-508, Wave 3)
 *
 * No DB writes (Q2): each test prepares ONE real completed export, and the ATC
 * pins the browser clock relative to its real `expires_at`. The view derives
 * ready / expired client-side (`expires_at > Date.now()`), so the clock reaches
 * those states on the product's own data path (no faked response).
 *
 * Every test owns a synthetic workspace (shared Supabase across envs), made the
 * browser's active workspace; it is soft-deleted in afterEach even when the
 * test fails.
 *
 * Project: e2e (depends on ui-setup, api-setup)
 */

import type { Workspace } from '@schemas/workspaces.types';
import type { CompletedExportState } from '@ui/DataExportPage';

import {
  EXPORT_CLEANUP_SETTLE_TIMEOUT_MS,
  EXPORT_PRECONDITION_CALL_TIMEOUT_MS,
  EXPORT_SETTLE_TIMEOUT_MS,
} from '@data/constants';
import { WorkspaceExportSteps } from '@steps/WorkspaceExportSteps';
import { test } from '@TestFixture';

/** BVA on the window end (BK-1006): max-1 s, max, max+1 s. The view uses a strict `>`, so the instant is expired. */
const BOUNDARY_ROWS: { offsetMs: number, expectedState: CompletedExportState }[] = [
  { offsetMs: -1_000, expectedState: 'ready' },
  { offsetMs: 0, expectedState: 'expired' },
  { offsetMs: 1_000, expectedState: 'expired' },
];

// BK-1006 test timeout budget (worst case; every precondition call carries EXPORT_PRECONDITION_CALL_TIMEOUT_MS):
// - beforeEach: workspace creation + active-workspace switch = 2 x 10 s = 20 s
// - prepareCompletedExport: the export request (10 s) + one settle poll (EXPORT_SETTLE_TIMEOUT_MS = 30 s) = 40 s
// - 3 BVA rows x the ATC's bounded worst case (~31 s each, see verifyStateAtExpiryBoundary) = 93 s
// - cleanup: best-effort in-flight wait (EXPORT_CLEANUP_SETTLE_TIMEOUT_MS = 10 s) + soft-delete under the
//   request context's default 30 s timeout = 40 s
// Worst case 193 s; timeout = worst case x 1.25 (~241 s, 25 % margin).
const BK_1006_ROW_WORST_CASE_MS = 31_000;
const SOFT_DELETE_TIMEOUT_MS = 30_000;
const BK_1006_WORST_CASE_MS = 3 * EXPORT_PRECONDITION_CALL_TIMEOUT_MS
  + EXPORT_SETTLE_TIMEOUT_MS
  + BOUNDARY_ROWS.length * BK_1006_ROW_WORST_CASE_MS
  + EXPORT_CLEANUP_SETTLE_TIMEOUT_MS + SOFT_DELETE_TIMEOUT_MS;
const BK_1006_TIMEOUT_MS = Math.ceil(BK_1006_WORST_CASE_MS * 1.25);

test.describe('BK-508: Expired workspace data export in Settings', () => {
  let workspace: Workspace | null = null;

  test.beforeEach(async ({ page, request }) => {
    // A real export settle (<= 30 s) + the ATC's ~31 s bounded budget + cleanup exceed the default 60 s (BK-1006 sets its own, longer budget)
    test.slow();
    workspace = await new WorkspaceExportSteps({ page, request }).createSyntheticWorkspace({
      makeActive: true,
      requestTimeoutMs: EXPORT_PRECONDITION_CALL_TIMEOUT_MS,
    });
  });

  test.afterEach(async ({ request }) => {
    if (workspace) {
      await new WorkspaceExportSteps({ request }).cleanupSyntheticWorkspace(workspace);
      workspace = null;
    }
  });

  test('BK-1003: should show the archive as expired without a download link when the window has lapsed', async ({ test: fixture, request }) => {
    const completedExport = await new WorkspaceExportSteps({ request }).prepareCompletedExport(workspace!.id);

    await fixture.ui.dataExport.verifyExpiredArchiveNotOffered(completedExport);
  });

  test('BK-1006: should show the archive as ready just before the expiry instant and as expired at and after it', async ({ test: fixture, request }) => {
    // Budget: BK_1006_TIMEOUT_MS (worst case + 25 %, every call bounded; see the breakdown above)
    test.setTimeout(BK_1006_TIMEOUT_MS);
    const completedExport = await new WorkspaceExportSteps({ request })
      .prepareCompletedExport(workspace!.id, { requestTimeoutMs: EXPORT_PRECONDITION_CALL_TIMEOUT_MS });

    // Sequential on purpose: a failing row throws inside its ATC (FAIL row) and stops the later ones. Every call is
    // bounded and the budget covers the worst case, so under those bounds no test timeout cuts a row short (no row)
    for (const row of BOUNDARY_ROWS) {
      await fixture.ui.dataExport.verifyStateAtExpiryBoundary({ completedExport, ...row });
    }
  });
});
