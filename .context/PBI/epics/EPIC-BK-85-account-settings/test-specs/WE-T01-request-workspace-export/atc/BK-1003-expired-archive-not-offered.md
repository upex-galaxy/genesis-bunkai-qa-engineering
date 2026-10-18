# ATC Spec: BK-1003 — verifyExpiredArchiveNotOffered

> Ticket: BK-1003 (TC10)
> Component: DataExportPage (tests/components/ui/DataExportPage.ts)
> Type: UI — Negative / State
> Parent Story: BK-508 · Wave 3 (forced time state, no DB write)

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| Expired archive is not offered | The section never shows a download that leads nowhere once the window lapsed, and offers a fresh request | Real completed export; browser clock well past `expires_at` (+1 day) | AC-07 |

## 2. ATC Contract

```typescript
/**
 * ATC: Past the window, the section says the archive expired and offers a fresh request instead of a download
 * Fixed assertions:
 *  - "The last export has expired and is no longer downloadable" visible
 *  - "Request a new export" button visible and enabled
 *  - no "Download archive" link, and no anchor whose href ends with /data-export/download
 */
@atc('BK-1003')
async verifyExpiredArchiveNotOffered(expiresAt: string): Promise<void>
```

## 3B. UI Details

Same mechanism as `BK-1006-expiry-window-boundary.md` §3B, with `offset = +24 h` (mid-partition value, not the boundary: BK-1006 owns the boundary).

## 4. Assertions Split

**Fixed**: as contract.
**Test-level**: none. The "stored download reference fails" half of the Gherkin is server-side and belongs to BK-1010 (clock control cannot expire the archive for the server). Scope note recorded so BK-1003 is never read as proof of server-side refusal.

## 6. Technique-derivation check

| AC | Technique | ATCs |
|----|-----------|------|
| AC-07 UI | EP: expired partition representative (+24 h) | 1 |

## 7. Dependencies / 8. Data Context

As BK-1006 (synthetic active workspace, real completed export, browser clock).

## 9. Checklist

- [x] naming · [x] 1 positional param · [x] void return · [x] not duplicating BK-1006 (mid-partition vs boundary)
