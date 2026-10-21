# ATC Spec: BK-1010 — downloadExpiredArchiveRefused

> Ticket: BK-1010 (TC17)
> Component: WorkspaceExportApi (tests/components/api/WorkspaceExportApi.ts)
> Type: API — Negative / boundary
> Parent Story: BK-508 · Wave 3 (forced state) · **BLOCKED pending Q2**

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| Download refused after the window, hit directly | Prove the route re-checks `status='completed' AND expires_at > now()` server-side on every call (`bunkai_resolve_workspace_export_download`) | Completed export whose `expires_at` is in the past | AC-07, ATP E7, Risk #6 |

## 2. ATC Contract

```typescript
/**
 * ATC: The download route refuses an archive whose window has elapsed (404, collapsed not-available)
 * Fixed assertions:
 *  - status 404, JSON error envelope, content-type is NOT application/zip
 *  - no `PK` zip signature in the body
 */
@atc('BK-1010')
async downloadExpiredArchiveRefused(workspaceId: string): Promise<[APIResponse, ErrorEnvelope]>
```

## 3A. API Details

`GET /api/v1/workspaces/{id}/data-export/download` (cookie-only). 404 is the shipped status for never-requested / not-ready / expired (no 410; `context.md` deviation note). Body: `ErrorEnvelope`.

## 4. Assertions Split

**Fixed**: 404 + envelope, no ZIP bytes.
**Test-level**: (a) BVA sibling row: same workspace with `expires_at = now() + 60 s` -> `downloadArchiveSuccessfully` passes (proves the 404 is caused by expiry, not by a broken fixture); (b) `ActivityApi.listActivity` shows no new `export.downloaded` row after the refused call (refusal must not be audited as a download; the RPC writes the row only on success).

## 5. Precondition mechanism

Only reachable with a DB write: the window is 168 h and there is no product endpoint that shortens it. Browser-clock control cannot help: the check uses the database clock.

```sql
-- scoped strictly to the synthetic workspace and the export this test created
UPDATE public.workspace_exports
   SET expires_at = now() - interval '1 second'
 WHERE id = $exportId
   AND workspace_id = $syntheticWorkspaceId
   AND status = 'completed';
-- expect rowCount === 1, otherwise fail before the ATC runs
```

Requirements (Q2): a DB client in the runner (`pg` or `@supabase/supabase-js` with a service-role key; none in `package.json` today), a new secret in `.env` / CI, and an explicit user OK because the same database backs production. If Q2 is refused, the case stays `BLOCKED — unreachable precondition: completed export past expires_at` and the server-side half of AC-07 remains covered only by the ATR's manual run; the UI half is automated by BK-1003 / BK-1006 on real data.

## 6. Technique-derivation check

| AC | Technique | ATCs |
|----|-----------|------|
| AC-07 server side | BVA around `now()`: `expires_at = now() + 60 s` (valid, test-level sibling) / `now() - 1 s` (this ATC). Exact equality is not reachable server-side (clock drift between runner and DB) and is covered client-side by BK-1006 | 1 ATC + 1 sibling row |

## 7. Dependencies

`prepareCompletedExport`, DB helper (new, only if Q2 approved), `ActivityApi.listActivity`.

## 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Completed export | Generate (real path) | request + poll | test body | workspace soft-delete |
| Elapsed window | Modify (DB) | SQL above | test body | row dies with the workspace |

## 9. Checklist

- [x] naming · [x] 1 positional param · [x] tuple return · [x] fixed vs test-level split · [x] SEED: real-path sibling exists (BK-1006 on real `expires_at`)

## 10. Status (2026-10-20)

OUT OF AUTOMATION (Q2: no DB writes from the test runner). Not coded in Wave 3; stays Manual. Automatable only with a staging-only export TTL override from dev.
