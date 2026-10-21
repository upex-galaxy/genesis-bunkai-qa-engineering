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
**Inside the ATC** (JD Wave 3 round 1): `expires_at - completed_at === EXPORT_DOWNLOAD_WINDOW_MS` from the API poll (BVA on the window length itself, the "168 hours" part of the TC Gherkin that the UI states as "7 days").

## 5. Code Template (shape only)

```typescript
const rows = [
  { offsetMs: -1_000, expectedState: 'ready' },
  { offsetMs: 0, expectedState: 'expired' },     // strict ">" in deriveState: equality is expired
  { offsetMs: 1_000, expectedState: 'expired' },
] as const;
test('BK-1006: should show the archive as ready just before the expiry instant and as expired at and after it', async ({ test: t, request }) => {
  test.setTimeout(BK_1006_TIMEOUT_MS); // worst case ~193 s x 1.25 (see §10)
  const completedExport = await new WorkspaceExportSteps({ request }).prepareCompletedExport(workspaceId, { requestTimeoutMs: EXPORT_PRECONDITION_CALL_TIMEOUT_MS });
  for (const row of rows) {
    await t.ui.dataExport.verifyStateAtExpiryBoundary({ completedExport, ...row }); // sequential: a failing row stops the rest
  }
});
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
| Completed export | Generate (real path) | request + poll | once per test (shared by the 3 rows) | workspace soft-delete |
| Time position | browser clock | `page.clock.setFixedTime` | per test | none (per-page) |

## 9. Checklist

- [x] naming · [x] object param · [x] void return · [x] fixed vs test-level split · [x] BVA rows logged

## 10. Implemented (Wave 3, 2026-10-20)

Signature: `verifyStateAtExpiryBoundary({ completedExport, offsetMs, expectedState })`. The 168 h window check (`expires_at - completed_at === EXPORT_DOWNLOAD_WINDOW_MS`) runs INSIDE the ATC, so a wrong window writes a FAIL row. Side-effect guard (not a state fake): with the browser clock days ahead, the browser Supabase client would treat its access token as expired and rotate the SHARED session's refresh token, so the ATC aborts `.../auth/v1/token?grant_type=refresh_token` on that page; the page and the export API authenticate on the server clock. Every wait inside the ATC is bounded (~31 s worst case per row). The precondition calls (workspace creation, active-workspace switch, export request, each settle-poll read) carry `EXPORT_PRECONDITION_CALL_TIMEOUT_MS` = 10 s. The test sets `test.setTimeout(BK_1006_TIMEOUT_MS)` = worst case x 1.25 = ~241 s (worst case 193 s: 20 s setup + 40 s export + 3 x 31 s rows + 40 s cleanup), computed in the test file.

**One test, sequential rows (JD Wave 3 round 1, 2026-10-20).** The three rows were three tests; the TMS sync marks a TC PASS when every one of its @atc rows is PASS and a test that fails BEFORE its ATC writes no row, so a precondition failure in one row's test let the other two sync a false PASS. Now ONE test prepares ONE completed export and calls the ATC for the three rows in order: a failing row throws (FAIL row) and stops the later ones, and a precondition failure writes no row at all. A test timeout mid-row would also write no row; with every call bounded and the budget above, that does not occur under the per-call bounds. The ATC is safe to call three times on one page: each call re-pins the clock and re-opens the page, and the refresh-token abort route is unrouted before it is routed again (never stacked). Test timeout: superseded in JD Wave 3 round 2 (2026-10-21) by the bounded budget above (~241 s; was `test.setTimeout(200_000)` from an estimate that assumed ~5 s setup and a ~5 s delete).
