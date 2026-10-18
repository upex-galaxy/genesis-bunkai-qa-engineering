# ATC Spec: BK-999 — downloadEmptyWorkspaceArchive

> Ticket: BK-999 (TC06)
> Component: WorkspaceExportApi (tests/components/api/WorkspaceExportApi.ts)
> Type: API — Boundary (archive parsing)
> Parent Story: BK-508 · Wave 3

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| Empty workspace exports cleanly | Zero content still yields a completed, structurally valid archive | Freshly created synthetic workspace (never seeded) — the doctrine's "fixture identity" for an empty state, reachable on the shared DB | AC-16 |

## 2. ATC Contract

```typescript
/**
 * ATC: An export of a content-free workspace completes and contains a valid, content-empty archive
 * Fixed assertions:
 *  - archive extracts; manifest.json present with workspace_id === workspaceId
 *  - every content entity (EXPORT_CONTENT_ENTITIES) present, parses, and has 0 records; manifest count 0
 *  - memberships === 1 (the Owner) and activity >= 1 (the export.requested row written by the insert trigger)
 */
@atc('BK-999')
async downloadEmptyWorkspaceArchive(workspaceId: string): Promise<[APIResponse, Record<string, string>]>
```

## 4. Assertions Split

**Fixed**: as contract. The memberships / activity carve-out is deliberate: AC-16 lists Projects, Modules, Tests, Runs and Bugs as the content that is absent; membership and the export's own audit row necessarily exist, and asserting them as zero would be a false failure.
**Test-level**: the settled export is `completed` (not `failed`) with `archive_bytes > 0`.

## 6. Technique-derivation check

| AC | Technique | ATCs |
|----|-----------|------|
| AC-16 | BVA on content volume: 0 records (this) vs >= 1 (BK-1014) | 1 |

## 7. Dependencies / 8. Data Context

`createSyntheticWorkspace`, `prepareCompletedExport`. No seeding. Cleanup: workspace soft-delete. Entity key list confirmed from the first real manifest (Q6).

## 9. Checklist

- [x] naming · [x] 1 positional param · [x] tuple return · [x] OBS: empty state reached through a fixture identity, not a shared account
