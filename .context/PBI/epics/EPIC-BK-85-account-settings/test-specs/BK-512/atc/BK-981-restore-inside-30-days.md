# ATC Spec: BK-981 — restoreDeletedWorkspace

> Ticket: BK-981 (TC66)
> Component: WorkspaceDeletionApi (NEW)
> Type: API — Positive / recovery
> Parent Story: BK-512 · Wave 1 · Spec file: `tests/integration/workspace-deletion/restoreDeletedWorkspace.test.ts`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Restore inside the window | The Owner gets the workspace and all content back | Seeded workspace deleted moments ago, not purged | ADR-0015 point 10 (AC-03/AC-07 "can be restored") |

## 2. ATC Contract

```typescript
/**
 * ATC: Restoring a soft-deleted workspace brings everything back
 * Fixed assertions:
 *  - POST /workspaces/{id}/restore -> 200 { workspaceId, workspaceName } matching the workspace
 *  - GET /workspaces/{id} 200, same row as before the delete (name, slug)
 *  - listed again for the Owner with role 'owner'
 *  - content snapshot equals `contentBefore`
 */
@atc('BK-981')
async restoreDeletedWorkspace(
  args: { workspace: Workspace, contentBefore: ContentSnapshot },
): Promise<[APIResponse, RestoreWorkspaceResponse]>
```

## 4. Assertions Split

**Fixed**: as contract. **Test-level**: before restore, `GET /workspaces/{id}` is 404 (it really was deleted). **Not asserted**: PAT / invite state after restore (revoked at deletion; Q7), the 30-day boundary (needs a backdated `deleted_at`, a DB write, refused by BK-508 Q2; TC67 stays out). Restore is called through the Owner cookie even though the workspace is invisible via RLS (the RPC resolves ownership directly).

## 6. Technique-derivation check

ST: `active -> deleted -> restored`. Invalid transitions (restore of an active workspace 409 `not_deleted`) are Deferred.

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Seeded workspace, deleted | Generate | Steps + real DELETE | test body | afterEach deletes it again (it is live after restore) |

## 9. Checklist

- [x] naming · [x] object param · [x] tuple return
