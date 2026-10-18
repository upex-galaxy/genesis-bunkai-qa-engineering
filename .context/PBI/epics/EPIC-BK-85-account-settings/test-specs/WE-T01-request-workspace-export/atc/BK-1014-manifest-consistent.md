# ATC Spec: BK-1014 — downloadArchiveWithConsistentManifest

> Ticket: BK-1014 (TC21)
> Component: WorkspaceExportApi (tests/components/api/WorkspaceExportApi.ts)
> Type: API — Verification (archive parsing)
> Parent Story: BK-508 · Wave 3

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| Manifest describes the archive | `manifest.json` carries workspace id, generated-at and per-entity counts, and the counts are TRUE | Seeded synthetic workspace (non-zero counts, so a count of 0 cannot hide a mismatch) | ATP E4, AC-11 |

## 2. ATC Contract

```typescript
/**
 * ATC: manifest.json identifies the workspace and its counts equal the records actually present
 * Fixed assertions:
 *  - manifest.workspace_id === workspaceId
 *  - manifest.generated_at is ISO-8601 and within [requestedAt, completedAt]
 *  - Object.keys(manifest.counts) === entity files present (minus manifest.json)
 *  - for every entity: counts[name] === parsed record count (JSON array length, or NDJSON non-blank lines)
 */
@atc('BK-1014')
async downloadArchiveWithConsistentManifest(
  args: { workspaceId: string, requestedAt: string, completedAt: string },
): Promise<[APIResponse, ExportManifest]>
```

`ExportManifest` is a local type in `tests/data/types.ts` (`{ workspace_id: string, generated_at: string, counts: Record<string, number> }`): the archive is not in the OpenAPI.

## 4. Assertions Split

**Fixed**: as contract (record counting tolerant of both encodings, so it does not inherit BK-1025's failure).
**Test-level**: `counts.projects >= 1` and `counts.runs >= 1` for the seeded workspace (proves seeding reached the archive).

## 6. Technique-derivation check

| AC | Technique | ATCs |
|----|-----------|------|
| E4 | EP: valid manifest on seeded content. The empty-workspace manifest is BK-999's partition | 1 |

## 7. Dependencies / 8. Data Context

`seedWorkspaceContent` (runs optional but preferred, shared with BK-1015), `prepareCompletedExport` (gives `created_at` and `completed_at`). Cleanup: workspace soft-delete.

## 9. Checklist

- [x] naming · [x] object param · [x] tuple return · [x] encoding-agnostic counting (no coupling to BK-1025)
