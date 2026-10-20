/**
 * Workspace Data Export - Request and download from Settings (BK-508, Wave 2)
 *
 * Every test owns a synthetic workspace (shared Supabase across envs), made the
 * browser's active workspace; it is soft-deleted in afterEach even when the
 * test fails (after a best-effort wait for an in-flight export).
 * BK-995 seeds content first: an empty workspace can export in under a second,
 * before the view re-reads it, so the "being prepared" state would be skipped.
 *
 * Project: e2e (depends on ui-setup, api-setup)
 */

import type { Workspace } from '@schemas/workspaces.types';

import { WorkspaceExportSteps } from '@steps/WorkspaceExportSteps';
import { test } from '@TestFixture';

/**
 * Content chains seeded before BK-995, so the export job outlives the view's
 * re-read. 3 is the ceiling: staging refuses a 4th project per workspace (422).
 */
const BK995_SEED_ROUNDS = 3;

test.describe('BK-508: Request a workspace data export from Settings', () => {
  let workspace: Workspace | null = null;

  test.beforeEach(async ({ page, request }) => {
    workspace = await new WorkspaceExportSteps({ page, request }).createSyntheticWorkspace({ makeActive: true });
  });

  test.afterEach(async ({ request }) => {
    if (workspace) {
      await new WorkspaceExportSteps({ request }).cleanupSyntheticWorkspace(workspace);
      workspace = null;
    }
  });

  // FIXME (race, 2026-10-20): the view renders "being prepared" only from its re-read after the 202, and the
  // job can complete before that re-read; then the ATC records a FAIL that is not a product defect. Measured
  // with --repeat-each=20: one content chain lost the race 1/20. Three chains (the per-workspace project cap)
  // are not yet measured. A real fix needs a product test hook that holds the job in `queued` (or a slower
  // test worker) on staging. fixme does not execute the body, so no BK-995 row is written while it stays.
  test.fixme('BK-995: should show the export as being prepared with its request time when the owner requests it', async ({ test: fixture, request }) => {
    test.slow();
    const workspaceId = workspace!.id;
    // Several content chains: one alone let the job win the re-read race 1 time in 20
    const seeder = new WorkspaceExportSteps({ request });
    for (let round = 0; round < BK995_SEED_ROUNDS; round++) {
      await seeder.seedWorkspaceContent(workspaceId, { withRunHistory: true, round });
    }
    await fixture.ui.dataExport.goto();

    // The ATC also checks the API offers the job it acknowledged (inside it, so it reaches the TMS row)
    await fixture.ui.dataExport.requestExportAcknowledged();
  });

  test('BK-996: should offer the archive as a single download when the export is ready', async ({ test: fixture, request }) => {
    const workspaceId = workspace!.id;
    const ready = await new WorkspaceExportSteps({ request }).prepareCompletedExport(workspaceId);

    // The size check (saved file = archive_bytes) runs inside the ATC, so it reaches the TMS row
    await fixture.ui.dataExport.downloadReadyArchive(workspaceId, ready.archive_bytes);
  });
});
