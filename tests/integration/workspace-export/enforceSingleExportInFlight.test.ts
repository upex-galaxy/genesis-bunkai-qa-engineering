/**
 * Workspace Data Export - One export in flight per workspace (BK-508, Wave 3)
 *
 * No DB writes (Q2): the in-flight state is the product's own. A sequential
 * second request lost the race against the export job 4 of 4 times on staging
 * (job ~0.75-1.05 s, one call ~0.5 s from the runner), so each ATC fires its
 * two requests concurrently (see the ATC JSDoc). Every exported workspace is
 * seeded with the most content staging allows (MAX_SEED_ROUNDS_PER_WORKSPACE
 * chains with run history), so its job runs longer. A lost race is retried
 * INSIDE the ATC on the same seeded workspace(s), up to EXPORT_RACE_MAX_ATTEMPTS,
 * and never ends as a PASS without the expected outcome: BK-1002 fails as a
 * suspected defect when a first job was never observed finished, otherwise as
 * inconclusive; BK-1000 fails as inconclusive when no overlap is proven.
 *
 * Every test owns its synthetic workspaces (created in beforeEach / the test,
 * soft-deleted in afterEach after a best-effort wait for in-flight exports).
 *
 * Project: integration (depends on api-setup)
 */

import type { Workspace } from '@schemas/workspaces.types';

import {
  EXPORT_CLEANUP_SETTLE_TIMEOUT_MS,
  EXPORT_RACE_CALL_TIMEOUT_MS,
  EXPORT_RACE_MAX_ATTEMPTS,
  EXPORT_SETTLE_TIMEOUT_MS,
  MAX_SEED_ROUNDS_PER_WORKSPACE,
} from '@data/constants';
import { WorkspaceExportSteps } from '@steps/WorkspaceExportSteps';
import { test } from '@TestFixture';

// Test timeout budget. Every wait INSIDE the race ATCs is bounded (each call carries
// EXPORT_RACE_CALL_TIMEOUT_MS = 5 s, each settle poll EXPORT_SETTLE_TIMEOUT_MS = 30 s overall), so a slow env
// throws inside the ATC (FAIL row) before the test timeout. Seeding is budgeted from measurements.
// - one workspace created + MAX_SEED_ROUNDS_PER_WORKSPACE chains seeded: measured ~20 s, budget 40 s
// - cleanup of one workspace: best-effort in-flight wait (10 s) + soft-delete under the request
//   context's default 30 s timeout = 40 s worst case
const SEEDED_WORKSPACE_BUDGET_MS = 40_000;
const SOFT_DELETE_TIMEOUT_MS = 30_000;
const CLEANUP_BUDGET_MS = EXPORT_CLEANUP_SETTLE_TIMEOUT_MS + SOFT_DELETE_TIMEOUT_MS;
const MARGIN_MS = 30_000;

/**
 * BK-1002 attempt worst case: POST pair + one trailing reader GET (2 call timeouts), the latest-job
 * read (1 call timeout) and one settle poll of the later job = 2 x 5 + 5 + 30 = 45 s.
 */
const BK_1002_ATTEMPT_MS = 3 * EXPORT_RACE_CALL_TIMEOUT_MS + EXPORT_SETTLE_TIMEOUT_MS;

/** BK-1002: one seeded workspace + 3 worst-case attempts + one cleanup + margin = 40 + 3 x 45 + 40 + 30 = 245 s. */
const BK_1002_TIMEOUT_MS = SEEDED_WORKSPACE_BUDGET_MS
  + EXPORT_RACE_MAX_ATTEMPTS * BK_1002_ATTEMPT_MS
  + CLEANUP_BUDGET_MS
  + MARGIN_MS;

/** BK-1000 attempt worst case: POST pair (1 call timeout), two settle polls, one read = 5 + 2 x 30 + 5 = 70 s. */
const BK_1000_ATTEMPT_MS = 2 * EXPORT_RACE_CALL_TIMEOUT_MS + 2 * EXPORT_SETTLE_TIMEOUT_MS;

/** BK-1000: two seeded workspaces + 3 worst-case attempts + two cleanups + margin = 80 + 3 x 70 + 80 + 30 = 400 s. */
const BK_1000_TIMEOUT_MS = 2 * SEEDED_WORKSPACE_BUDGET_MS
  + EXPORT_RACE_MAX_ATTEMPTS * BK_1000_ATTEMPT_MS
  + 2 * CLEANUP_BUDGET_MS
  + MARGIN_MS;

test.describe('BK-508: One workspace export in flight at a time', () => {
  let workspaces: Workspace[] = [];

  test.beforeEach(async ({ request }) => {
    // Seeding (3 chains) already exceeds the default test timeout; each test sets its full budget below
    test.slow();
    const steps = new WorkspaceExportSteps({ request });
    const busy = await steps.createSyntheticWorkspace();
    workspaces = [busy];
    for (let round = 0; round < MAX_SEED_ROUNDS_PER_WORKSPACE; round++) {
      await steps.seedWorkspaceContent(busy.id, { withRunHistory: true, round });
    }
  });

  test.afterEach(async ({ request }) => {
    const created = workspaces;
    workspaces = [];
    await new WorkspaceExportSteps({ request }).cleanupSyntheticWorkspaces(created);
  });

  test('BK-1002: should refuse a second export request while one is being prepared', async ({ api }) => {
    test.setTimeout(BK_1002_TIMEOUT_MS);
    await api.workspaceExport.requestExportWhileOneInFlightRefused(workspaces[0].id);
  });

  test('BK-1000: should accept an export request for another workspace while the first is being prepared', async ({ api, request }) => {
    test.setTimeout(BK_1000_TIMEOUT_MS);
    const steps = new WorkspaceExportSteps({ request });
    const [busy] = workspaces;
    const other = await steps.createSyntheticWorkspace();
    workspaces.push(other);
    // Seeded too: an empty workspace exports so fast that the two jobs missed each other 1 time in 20
    for (let round = 0; round < MAX_SEED_ROUNDS_PER_WORKSPACE; round++) {
      await steps.seedWorkspaceContent(other.id, { withRunHistory: true, round });
    }

    await api.workspaceExport.requestExportWhileOtherWorkspaceExporting({ workspaceId: other.id, busyWorkspaceId: busy.id });
  });
});
