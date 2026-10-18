# ATC Spec: BK-1013 — downloadArchiveScopedToWorkspace

> Ticket: BK-1013 (TC20)
> Component: WorkspaceExportApi (tests/components/api/WorkspaceExportApi.ts)
> Type: API — Negative / tenant isolation (archive parsing)
> Parent Story: BK-508 · Wave 3

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| Archive scoped to one workspace | The archive of W_A carries W_A's records only, none of W_B's, even though the same Owner owns both | Two synthetic workspaces, both seeded with distinctive names (faker + `qa-auto-bk508` marker) | AC-09, BR "exactly one workspace" |

## 2. ATC Contract

```typescript
/**
 * ATC: The archive of one workspace contains no record of another workspace the same Owner owns
 * Fixed assertions:
 *  - every record exposing `workspace_id` equals workspaceId
 *  - none of foreignMarkers (W_B id, its project/test/run ids, its unique names) appears in any file
 *  - manifest.workspace_id === workspaceId
 */
@atc('BK-1013')
async downloadArchiveScopedToWorkspace(
  args: { workspaceId: string, foreignMarkers: string[] },
): Promise<[APIResponse, Record<string, string>]>
```

## 3A. API Details

Records without a direct `workspace_id` (modules, steps, run snapshots) are scoped through their parents (`collect.ts` cascades by project / story / ATC / run ids), so the foreign-marker scan is what proves them clean.

## 4. Assertions Split

**Fixed**: as contract.
**Test-level**: positive control: W_A's own markers ARE present (a scan for absent strings over an empty archive would pass vacuously).

## 6. Technique-derivation check

| AC | Technique | ATCs |
|----|-----------|------|
| AC-09 | EP: own records (present) vs foreign records (absent) in one ATC with a positive control | 1 |

The "active workspace" wording of AC-09 is a UI notion; the API exports the path id. Active-workspace selection in the UI is covered by Wave 2 setting the active workspace before every UI test.

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| W_A, W_B | Generate | `createSyntheticWorkspace` x2 | `beforeEach` | both soft-deleted |
| Content in both | Generate | `seedWorkspaceContent` x2 (runs optional; projects + tests minimum) | test body | with workspaces |
| Completed export of W_A | Generate | request + poll | test body | same |

`test.slow()`: two seeding chains + one export.

## 9. Checklist

- [x] naming · [x] object param · [x] tuple return · [x] positive control against vacuous pass
