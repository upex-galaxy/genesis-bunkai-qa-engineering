/**
 * Shared test constants.
 */

/** Upper bound for an export job to settle (completed | failed) on staging. */
export const EXPORT_SETTLE_TIMEOUT_MS = 60_000;

/** Back-off between export status polls. */
export const EXPORT_POLL_INTERVALS_MS = [500, 1_000, 2_000];

/** Slug prefix of every synthetic workspace created by the BK-508 suite (manual purge key). */
export const SYNTHETIC_WORKSPACE_SLUG_PREFIX = 'qa-auto-bk508-';
