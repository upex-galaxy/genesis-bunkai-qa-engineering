# ATC Spec: BK-930 — dismissDeleteConfirmationChangingNothing

> Ticket: BK-930 (TC15, merges TC10, TC16)
> Component: WorkspacesSettingsPage (NEW)
> Type: UI + API read — Negative / state
> Parent Story: BK-512 · Wave 2 · Spec file: `tests/e2e/workspace-deletion/dismissWorkspaceDeletion.test.ts`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Dismissing the confirmation changes nothing | Opening and cancelling never deletes or alters the workspace | Owner of a seeded synthetic workspace | AC-03 (nothing deleted yet, TC10), AC-05 |

## 2. ATC Contract

```typescript
/**
 * ATC: Cancelling the delete confirmation leaves workspace and contents intact
 * Fixed assertions:
 *  - modal names exactly this workspace and no other; consequence text present (30 days, restore)
 *  - nothing deleted while the modal is open (snapshot read)
 *  - exact name typed, Cancel pressed -> back on the list, row still present
 *  - content snapshot after === before; reopening shows an empty name field (TC16/AC-05)
 */
@atc('BK-930')
async dismissDeleteConfirmationChangingNothing(
  args: { workspace: Workspace, readContentSnapshot: () => Promise<ContentSnapshot> },
): Promise<void>
```

## 4. Assertions Split

**Fixed**: as contract. `readContentSnapshot` callback is the API read (`WorkspaceDeletionApi.captureContentSnapshot`), keeping the UI component free of API calls. Escape / overlay dismissal: not in scope.

## 6. Technique-derivation check

ST: `confirm open -> typed -> dismissed -> reopened(empty)`. SEED: none.

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Seeded workspace | Generate | Steps `createOwnedWorkspaceWithContent({ makeActive: true })` | beforeEach | Owner soft-delete |

## 9. Checklist

- [x] naming · [x] object param · [x] callback instead of cross-layer call
