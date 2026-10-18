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
