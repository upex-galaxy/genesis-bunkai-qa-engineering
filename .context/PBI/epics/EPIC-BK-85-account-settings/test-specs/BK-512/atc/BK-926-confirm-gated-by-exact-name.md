# ATC Spec: BK-926 — verifyConfirmGatedByExactName

> Ticket: BK-926 (TC11, merges TC12, TC13)
> Component: WorkspacesSettingsPage (tests/components/ui/WorkspacesSettingsPage.ts, NEW)
> Type: UI — Negative / BVA
> Parent Story: BK-512 · Wave 2 · Spec file: `tests/e2e/workspace-deletion/gateWorkspaceDeletionByName.test.ts`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Confirm stays disabled unless the name matches exactly | The destructive button is unreachable for every non-exact name | Owner, synthetic workspace listed in Settings > Workspaces | AC-04 |

## 2. ATC Contract

```typescript
/**
 * ATC: The confirm action is unavailable for a non-exact typed name
 * Fixed assertions:
 *  - modal opens and names exactly this workspace
 *  - confirm button disabled after typing `typed`
 *  - the workspace is still listed after the modal closes without confirming
 *  - control (inside the ATC): the exact name enables the button; the modal is then dismissed, never confirmed
 */
@atc('BK-926')
async verifyConfirmGatedByExactName(
  args: { workspace: Workspace, typed: string },
): Promise<void>
```

Rows (EP within one behaviour, parameterized into ONE ATC): `empty`, `partial` (name minus last char), `case-varying` (swapcase), `whitespace-padded` (` name `).

## 4. Assertions Split

**Fixed**: as contract. **Padded row**: product trims (`typed.trim() === name`), so the button ENABLES and the row would fail on current code. Plan: Q2. Until answered, run the row tagged `@blocked` with the defect key, never pass it by loosening the assertion.
Server does not check the name (verified), so no API assertion exists for this ATC.

## 6. Technique-derivation check

BVA on the name: empty (0), N-1 chars, N chars exact (control), case change, padded. EP: one invalid class each. Locators: `workspace-delete-<slug>`, `delete-workspace-input`, `delete-workspace-confirm` (testids, extracted to getters: 2+ uses).

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Subject workspace, active | Generate | `createSyntheticWorkspace({ makeActive: true })` | beforeEach | Owner soft-delete |
| Typed names | Modify | derived from `workspace.name` | test body | none |

## 9. Checklist

- [x] naming · [x] object param · [x] inline/getter locators · [ ] padded row pending Q2
