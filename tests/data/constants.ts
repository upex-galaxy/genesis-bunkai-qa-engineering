/**
 * Shared test constants.
 */

/**
 * Upper bound for an export job to settle (completed | failed) on staging.
 * Kept well under the 60 s test timeout, so a slow export fails with the poll's
 * own message instead of a generic "Test timeout exceeded". afterEach shares
 * that budget: settle + cleanup settle + setup/teardown calls must fit in 60 s.
 */
export const EXPORT_SETTLE_TIMEOUT_MS = 30_000;

/** Best-effort wait for an in-flight export before cleanup deletes its workspace. */
export const EXPORT_CLEANUP_SETTLE_TIMEOUT_MS = 10_000;

/** Back-off between export status polls. */
export const EXPORT_POLL_INTERVALS_MS = [500, 1_000, 2_000];

/** Slug prefix of every synthetic workspace created by the BK-508 suite (manual purge key). */
export const SYNTHETIC_WORKSPACE_SLUG_PREFIX = 'qa-auto-bk508-';

/** Download window of a completed export: `expires_at = completed_at + 168 h`. */
export const EXPORT_DOWNLOAD_WINDOW_MS = 168 * 60 * 60 * 1000;

/**
 * Content entities of the archive (one file each), confirmed against the real
 * manifest (Q6). `activity` and `memberships` are also exported but are never
 * empty (the Owner's membership, the export's own audit row), so they are not
 * content. `runs` ships as `runs.ndjson`, every other entity as `<name>.json`.
 */
export const EXPORT_CONTENT_ENTITIES = [
  'projects',
  'modules',
  'user_stories',
  'acceptance_criteria',
  'atcs',
  'atc_steps',
  'atc_assertions',
  'atc_acceptance_criteria',
  'tests',
  'test_steps',
  'runs',
  'run_atcs',
  'run_steps',
  'bugs',
] as const;

/** Content chains one workspace can hold: staging refuses a 4th project per workspace (422). */
export const MAX_SEED_ROUNDS_PER_WORKSPACE = 3;

/**
 * Attempts of a concurrent-request race ATC (BK-1002, BK-1000) before it gives
 * up as inconclusive. A lost race (the first job finished before the second
 * request reached the DB) proves nothing either way, so it is retried on the
 * same, already-seeded workspace(s); it is never reported as a product defect.
 */
export const EXPORT_RACE_MAX_ATTEMPTS = 3;

/**
 * Clock-skew tolerance when an export verdict compares timestamps from two
 * clocks: `created_at` is stamped by the DB (`now()`, transaction start), while
 * `started_at` / `completed_at` / `expires_at` come from the export worker's JS
 * clock. A gap or overlap no larger than this cannot be told apart from skew,
 * so it is never treated as proof (BK-1002 lost race, BK-1000 overlap).
 */
export const EXPORT_CLOCK_SKEW_TOLERANCE_MS = 250;

/**
 * Per-request timeout of every call inside the race ATCs (BK-1002, BK-1000):
 * POSTs, back-to-back reads and each settle-poll read. Short on purpose, so a
 * slow call throws inside the ATC (FAIL row) instead of a test timeout (no row).
 */
export const EXPORT_RACE_CALL_TIMEOUT_MS = 5_000;

/**
 * Per-request timeout of the BK-1006 precondition calls (workspace creation,
 * active-workspace switch, export request, each settle-poll read), so the test
 * budget can be computed from bounded calls.
 */
export const EXPORT_PRECONDITION_CALL_TIMEOUT_MS = 10_000;
