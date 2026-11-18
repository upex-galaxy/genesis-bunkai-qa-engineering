# ATC Spec: BK-960 — leaveOtherWorkspaceUntouched

> Ticket: BK-960 (TC45, merges TC46)
> Component: WorkspaceDeletionApi (NEW)
> Type: API — Isolation
> Parent Story: BK-512 · Wave 1 · Spec file: `tests/integration/workspace-deletion/isolateOtherWorkspace.test.ts`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Second owned workspace untouched | Deleting A never touches B or B's members | Owner of A and B, each seeded; `roleUsers.member` is a member of B | AC-16 |

## 2. ATC Contract

```typescript
/**
 * ATC: Workspace B and its member are untouched after A is deleted
 * Fixed assertions:
 *  - B still listed for the Owner with the same row (name, slug, role)
 *  - B's content snapshot equals the one captured before the delete
 *  - the member (own session) still lists B with role 'member' and reads GET /workspaces/{B} 200
 *  - A answers 404 for the Owner (control that the deletion happened)
 */
@atc('BK-960')
async leaveOtherWorkspaceUntouched(
  args: { otherWorkspaceId: string, before: ContentSnapshot, memberRequest: APIRequestContext },
): Promise<void>
```

## 4. Assertions Split

**Fixed**: as contract. **Test-level**: `deleteAsOwner(A)` 200, both workspaces seeded one round each (R7), `before` captured after seeding and before the delete. Snapshot excludes volatile fields (`updated_at`, run timestamps are stable once finished; the open Run is excluded from equality by id list only).

## 6. Technique-derivation check

EP: workspace {deleted, sibling}. Roles in sibling {owner, member}.

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| A, B | Generate | Steps x2 | beforeEach | A deleted by test; B: member `leaveWorkspace(B)`, then Owner delete |
| Member | Discover | `grantTeammate({ workspaceId: B, role: 'member' })` | test body | leaves in `finally` |

## 9. Checklist

- [x] naming · [x] object param · [ ] Q4 · `test.slow()`
