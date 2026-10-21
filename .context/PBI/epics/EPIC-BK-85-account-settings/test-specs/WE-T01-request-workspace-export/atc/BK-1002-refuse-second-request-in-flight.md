# ATC Spec: BK-1002 — requestExportWhileOneInFlightRefused

> Ticket: BK-1002 (TC09)
> Component: WorkspaceExportApi (tests/components/api/WorkspaceExportApi.ts)
> Type: API — Negative / State change
> Parent Story: BK-508 · Wave 3 (forced state)

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| Refuse a second request while one is preparing | Prove the one-in-flight-per-workspace rule (partial unique index -> 409) | Synthetic workspace with an export in `queued` or `running` | AC-05, BR "at most one export request per workspace in flight" |

## 2. ATC Contract

```typescript
/**
 * ATC: A second export request on a workspace whose export is still in flight is refused (409)
 * Fixed assertions:
 *  - status 409, error envelope code `export_in_progress`, non-empty message
 *  - the latest poll still returns `inFlightExportId`, status queued|running
 */
@atc('BK-1002')
async requestExportWhileOneInFlightRefused(
  args: { workspaceId: string, inFlightExportId: string },
): Promise<[APIResponse, ErrorEnvelope, null]>
```

## 3A. API Details

`POST /api/v1/workspaces/{id}/data-export` (cookie-only), then `GET` same path. Error body: `ErrorEnvelope` (`components.schemas.ErrorEnvelope`, add to `@schemas/workspace-export.types`).

## 4. Assertions Split

**Fixed**: 409; `error.code === 'export_in_progress'`; poll returns the original id, still `queued|running`.
**Test-level**: nothing beyond the precondition guard below.

## 5. Precondition mechanism (decision pending: Q2)

| Option | How | Determinism | Risk |
|--------|-----|-------------|------|
| A. Product race (default) | `requestExport` (raw) -> capture `export_job_id` -> immediately call the ATC. Guard: if the ATC's POST returns 202, the test FAILS with `precondition not reached: first export settled before the second request` (never passes vacuously, never silently skips). Seed some content first (`seedWorkspaceContent` without runs) to widen the window | Probabilistic; window = job claim + collect + zip + upload | Flaky if staging exports an empty workspace in under the round-trip time (measure, Q12) |
| B. Forced row | `INSERT INTO public.workspace_exports (workspace_id, requested_by, status, created_at) VALUES ($synthetic, $ownerId, 'running', now())` via a DB client scoped to the synthetic workspace | Deterministic; the row is never claimed by a worker, so it stays `running` until the workspace is deleted | New DB-write secret in the runner against the DB that also backs production; seeded state never produced by the product (SEED trigger: sibling real-path case is option A / BK-1017) |

Recommendation: A now; B only if the user approves Q2 and A proves flaky in measured runs.

## 6. Technique-derivation check

| AC | Technique | ATCs |
|----|-----------|------|
| AC-05 | State-Transition (invalid transition: in-flight -> new request) + BVA on the limit (1 allowed, 2nd refused) | This ATC (2nd refused). The "1 allowed" side is BK-1017 |

EP: same workspace (this ATC) vs other workspace (BK-1000): different partitions, separate ATCs.

## 7. Dependencies

`WorkspaceExportSteps.createSyntheticWorkspace`, `WorkspaceExportApi.requestExport` (helper), optional `seedWorkspaceContent`.

## 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| In-flight export | Generate (A) / Modify-DB (B) | see §5 | test body | workspace soft-delete |

## 9. Checklist

- [x] verb{Resource}{Scenario} naming · [x] object param · [x] tuple return · [x] fixed vs test-level split · [x] not duplicating BK-1017 (different partition)

## 10. Implemented (Wave 3, 2026-10-20)

Signature: `requestExportWhileOneInFlightRefused(workspaceId): [APIResponse, ErrorEnvelope]`. Option A as designed (sequential POST, then a read-back guard, then the second POST) lost the race 4 of 4 times on staging: a seeded export runs ~0.75-1.05 s after the 202, and one call from the runner takes ~0.5 s. The ATC therefore fires the two requests CONCURRENTLY: both inserts reach the one-active-per-workspace index (0083, `queued`/`running`) while the first job is still `queued`, which is the product's own in-flight state (no DB write). Pass path [202, 409]: the 409 is the refusal. The envelope code is `conflict` with `details.reason: "export_in_progress"` (route source + staging), not `error.code === "export_in_progress"`. The post-409 poll asserts the accepted id and "never failed" (`completed` allowed: the job may finish before the poll; the 409 itself proves it was in flight). Path [202, 202] never passes: the later job settles, then the attempt is a lost race (first job seen `completed` with `completed_at + EXPORT_CLOCK_SKEW_TOLERANCE_MS (250 ms) <= later.created_at`), ambiguous (seen completed, but inside the 250 ms window: `completed_at` is the worker's JS clock, `created_at` the DB's `now()`, so skew cannot be ruled out) or a suspected defect (the first job was never seen completed: only the latest job is readable, so the two 202s may have been in flight together). Lost and ambiguous attempts are retried; so is a suspected one. With no [202, 409] after `EXPORT_RACE_MAX_ATTEMPTS` = 3 attempts, the ATC fails with `suspected defect: two 202s while the first job was never observed finished ...` when any attempt was suspected, otherwise with `race lost on all 3 attempts (inconclusive, not a product defect)`. No timestamp comparison is treated as proof of overlap. Any other status pair fails at once.

**Lost-race retry (JD Wave 3 round 1, 2026-10-20).** On [202, 202] the ATC no longer fails as a defect straight away. The API exposes only the LATEST job, so the first job can be read only before the second is enqueued: the ATC reads the latest export back to back while the two POSTs are in flight. Then it waits for the later job (the latest) to settle, so the workspace is idle, and classifies the attempt: first job seen `completed` with `completed_at <= later.created_at` -> lost race (no overlap), retried; seen completed AFTER `later.created_at` -> both in flight together, FAIL as a defect at once; not observed finished -> unproven, retried. Up to `EXPORT_RACE_MAX_ATTEMPTS` = 3 attempts on the same, already-seeded workspace (no extra seeding). Every attempt lost -> FAIL `race lost on all 3 attempts (inconclusive, not a product defect)`; when an attempt was unproven, the message says so and asks to check the one-in-flight rule if it repeats. Any status pair other than [202, 409] / [202, 202] fails at once; the [202, 409] path keeps every assertion above. Test timeout: see JD Wave 3 round 2 below (was 190 s).

**JD Wave 3 round 2 (2026-10-21).** Superseded the round-1 classification above: the skew-only "seen completed after `later.created_at` = overlap, defect" branch is gone (a skew-sized gap proves nothing), a 250 ms tolerance (`EXPORT_CLOCK_SKEW_TOLERANCE_MS`) separates a lost race from an ambiguous one, and an attempt whose first job was never seen completed is a suspected defect (final message `suspected defect: ...`), no longer "unproven, inconclusive". Every POST / GET inside an attempt (reader reads and each settle-poll read included) carries `EXPORT_RACE_CALL_TIMEOUT_MS` = 5 s: per-attempt worst case 2 x 5 + 5 + 30 = 45 s; test timeout 245 s (40 s seeding + 3 x 45 s + 40 s cleanup + 30 s margin), computed in the test file.
