# ATC Spec: BK-1000 — requestExportWhileOtherWorkspaceExporting

> Ticket: BK-1000 (TC07)
> Component: WorkspaceExportApi (tests/components/api/WorkspaceExportApi.ts)
> Type: API — Mutation / isolation
> Parent Story: BK-508 · Wave 3 (forced state)

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| Concurrent export across two owned workspaces | Prove the in-flight rule is scoped per workspace, not per Owner | Owner owns W1 (export in flight) and W2 (idle), both synthetic | AC-05 scope (confirmed BR: per workspace) |

## 2. ATC Contract

```typescript
/**
 * ATC: Requesting an export of one workspace succeeds while another workspace of the same Owner is exporting
 * Fixed assertions:
 *  - W2 POST -> 202 with a job id different from W1's
 *  - W1 poll still returns its own job id (unchanged by W2's request)
 */
@atc('BK-1000')
async requestExportWhileOtherWorkspaceExporting(
  args: { workspaceId: string, busyWorkspaceId: string, busyExportId: string },
): Promise<[APIResponse, RequestWorkspaceExportResponse, null]>
```

## 3A. API Details

`POST /api/v1/workspaces/{W2}/data-export`, then `GET /api/v1/workspaces/{W1}/data-export`. The route acts on the path id, not on the active-workspace cookie, so switching the active workspace (TC07 Gherkin) is not needed at API level; the UI switch is out of this ATC's layer.

## 4. Assertions Split

**Fixed**: 202 for W2; distinct ids; W1 id unchanged.
**Test-level (precondition guard)**: W1 was `queued|running` when W2 was requested. With option A of BK-1002 §5 the guard is: W1's status read immediately before the W2 call is `queued|running`; if W1 had already completed, the test fails with `precondition not reached` instead of passing (a 202 for W2 proves nothing when W1 is idle). Both exports then settle `completed` independently (`waitForExportToSettle` on both).

## 5. Precondition mechanism

Same options and recommendation as `BK-1002-refuse-second-request-in-flight.md` §5. Option B would insert the `running` row in W1 only.

## 6. Technique-derivation check

| AC | Technique | ATCs |
|----|-----------|------|
| AC-05 (scope) | EP: same workspace (BK-1002) vs different workspace (this) | 1 |

## 7. Dependencies

`createSyntheticWorkspace` x2, `requestExport`, `waitForExportToSettle`.

## 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| W1, W2 | Generate | `POST /workspaces` | `beforeEach` | both soft-deleted |
| W1 in flight | Generate (race) / DB (Q2) | BK-1002 §5 | test body | with W1 |

## 9. Checklist

- [x] naming · [x] object param · [x] tuple return · [x] fixed vs test-level split · [x] distinct partition from BK-1002

## 10. Implemented (Wave 3, 2026-10-20)

Signature: `requestExportWhileOtherWorkspaceExporting({ workspaceId, busyWorkspaceId }): [APIResponse, RequestWorkspaceExportResponse]`. The sequential design passed but vacuously: the busy job had already completed when the second workspace was requested (same timing as BK-1002 §10). Both requests now fire concurrently; after both settle `completed`, the ATC PROVES the overlap from the jobs: min(completed_at) - max(created_at) > `EXPORT_CLOCK_SKEW_TOLERANCE_MS` (250 ms). `created_at` is the DB clock (`now()`), `completed_at` the worker's JS clock, so an overlap no larger than the tolerance is skew-sized and is NOT proof: it counts as a lost race and is retried. The busy workspace still offers its own job id.

**Lost-race retry (JD Wave 3 round 1, 2026-10-20).** No overlap (max(created_at) >= min(completed_at)) is a lost race, not a defect: it proves nothing either way. Both jobs are already settled, so the ATC retries the concurrent pair on the same, already-seeded workspaces (no extra seeding: staging caps projects per workspace at `MAX_SEED_ROUNDS_PER_WORKSPACE`), up to `EXPORT_RACE_MAX_ATTEMPTS` = 3 attempts. Every attempt lost -> the ATC throws `race lost on all 3 attempts (inconclusive, not a product defect)` with each attempt's windows (a FAIL row, never a PASS). The 202 / distinct-id / `queued` (both bodies, the busy one included) / busy-still-offers-its-job assertions fail at once on any attempt. Test timeout: see JD Wave 3 round 2 below (was 335 s).

**JD Wave 3 round 2 (2026-10-21).** Overlap now needs more than the 250 ms clock-skew tolerance (see above); the inconclusive message names it. Every POST / GET inside an attempt (each settle-poll read included) carries `EXPORT_RACE_CALL_TIMEOUT_MS` = 5 s: per-attempt worst case 5 + 2 x 30 + 5 = 70 s; test timeout 400 s (2 x 40 s seeding + 3 x 70 s + 2 x 40 s cleanup + 30 s margin), computed in the test file.
