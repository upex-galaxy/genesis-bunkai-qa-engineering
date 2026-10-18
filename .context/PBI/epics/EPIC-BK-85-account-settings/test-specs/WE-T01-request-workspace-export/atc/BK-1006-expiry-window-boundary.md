# ATC Spec: BK-1006 — verifyStateAtExpiryBoundary

> Ticket: BK-1006 (TC13)
> Component: DataExportPage (tests/components/ui/DataExportPage.ts)
> Type: UI — Boundary (BVA) / State change
> Parent Story: BK-508 · Wave 3 (forced time state, no DB write)

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| Expired exactly at the 168 h boundary | Prove the UI flips ready -> expired at `expires_at`, not a second later or earlier | Real completed export of a synthetic, active workspace | AC-06, AC-07, BR 168 h window |

## 2. ATC Contract

```typescript
/**
 * ATC: The status card shows the state that matches the browser clock relative to expires_at
 * Fixed assertions:
 *  - ready   -> "Your export is ready. Downloadable until" + "Download archive" link visible
 *  - expired -> "The last export has expired" + "Request a new export" button, NO "Download archive" link
 */
@atc('BK-1006')
async verifyStateAtExpiryBoundary(
  args: { expiresAt: string, offsetMs: number, expectedState: 'ready' | 'expired' },
): Promise<void>
```

## 3B. UI Details

- Page: `/settings/data-export` with the synthetic workspace active (`setActiveWorkspace` on `page.request`).
- Clock: `await this.page.clock.setFixedTime(new Date(Date.parse(expiresAt) + offsetMs))` BEFORE `goto`. `setFixedTime` only pins `Date.now()`; timers keep running, so the view's 4 s poll still works.
- Why it is the real path: the view derives `expired` client-side (`deriveState`: `new Date(row.expires_at).getTime() > Date.now()` -> ready, else expired). The `expires_at` read is the one the worker wrote.
- Locators inline (texts in `automation-plan.md` §2 UI Elements).

## 4. Assertions Split

**Fixed**: state texts + presence/absence of the Download link, per `expectedState`.
**Test-level**: once per test, `expires_at - completed_at === EXPORT_DOWNLOAD_WINDOW_MS` from the API poll (BVA on the window length itself, the "168 hours" part of the TC Gherkin that the UI states as "7 days").

## 5. Code Template (shape only)

```typescript
const rows = [
  { offsetMs: -1_000, expectedState: 'ready' },
  { offsetMs: 0, expectedState: 'expired' },     // strict ">" in deriveState: equality is expired
  { offsetMs: 1_000, expectedState: 'expired' },
] as const;
for (const row of rows) {
  test(`BK-1006: should show the archive as ${row.expectedState} when the clock is ${row.offsetMs} ms from expiry`, async ({ test: t }) => { /* fresh workspace + completed export per row */ });
}
```

## 6. Technique-derivation check

| AC | Technique | ATCs |
|----|-----------|------|
| AC-07 / BR 168 h | BVA `max-1 · max · max+1` on the window end | 1 parameterized ATC, 3 rows |

BVA detail: `expires_at - 1 s` (ready), `expires_at` (expired, product uses strict `>`), `expires_at + 1 s` (expired). A one-millisecond step would also work; one second keeps the row readable and still inside the same partition.

## 7. Dependencies

`createSyntheticWorkspace({ makeActive: true })`, `prepareCompletedExport`, `WorkspaceExportApi.getExportStatusSuccessfully` (reads `expires_at`, `completed_at`).

## 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Completed export | Generate (real path) | request + poll | per test | workspace soft-delete |
| Time position | browser clock | `page.clock.setFixedTime` | per test | none (per-page) |

## 9. Checklist

- [x] naming · [x] object param · [x] void return · [x] fixed vs test-level split · [x] BVA rows logged
