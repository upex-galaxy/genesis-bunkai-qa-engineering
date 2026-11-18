# ATC Spec: BK-937 — deleteOwnedWorkspaceAsOwner

> Ticket: BK-937 (TC22, merges TC01, TC14, TC34, TC35, TC36, TC47, TC61)
> Component: WorkspacesSettingsPage (NEW)
> Type: UI + DB read — Positive / happy path
> Parent Story: BK-512 · Wave 3 · Spec file: `tests/e2e/workspace-deletion/deleteOwnedWorkspace.test.ts`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Owner of several deletes one | Gone from the list, lands in another workspace they are told about, destination untouched, audit tombstone written | Owner of synthetic A (active, seeded); member-only in synthetic B (created by `roleUsers.admin`); other older memberships may exist | AC-01, AC-04 (exact name), AC-07, AC-11, AC-17, N4 |

## 2. ATC Contract

```typescript
/**
 * ATC: The Owner deletes one of several workspaces
 * Fixed assertions:
 *  - A's row offers Delete; B's row (member) offers none
 *  - name typed, confirm enabled, confirm pressed
 *  - A no longer listed (UI) and absent from `GET /workspaces`
 *  - toast "<A> was deleted. <X> is now your active workspace." where X is in the remaining set and equals /me.active_workspace_id
 *  - destination snapshot unchanged (before/after)
 *  - workspace_deletions: exactly 1 row for A; workspace_name = A's name, requested_by = Owner id, requested_at within [clickedAt, now]; readable by an ordinary query
 */
@atc('BK-937')
async deleteOwnedWorkspaceAsOwner(
  args: { workspace: Workspace, memberOnlyWorkspace: Workspace, ownerId: string },
): Promise<DeleteLandingEvidence>
```

Cross-layer reads (me, snapshot, audit) go through injected readers in the args object (add `readers: { me, snapshot, audit }`), same callback shape as BK-1001. Signature stays 1 object param.

## 4. Assertions Split

**Fixed**: as contract. **Not asserted**: a specific landing workspace (BR-1 = oldest remaining membership, R5). **Audit lines**: read through `readWorkspaceDeletions` (Q1, read-only `qa_inspector_ro` connection from `STAGING_DB_RO_URL`). When the variable is unset, the ATC runs the whole UI part first, then calls `test.skip` inside the ATC with a reason naming `STAGING_DB_RO_URL` / `qa_inspector_ro`: Playwright reports the test skipped and BK-937 is recorded as SKIP (NOT RUN in Xray/Jira), never PASS, so the merged audit TCs (TC47, TC61) never get a false PASS. The UI step results stay visible in the report.

## 6. Technique-derivation check

EP: roles on rows {owner, member}. ST: `listed -> deleted -> landed`. DT: delete offered iff role = owner.

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| A | Generate | Steps, `makeActive: true` | beforeEach | deleting A IS its cleanup |
| B (member-only) | Generate | `roleUsers.admin` creates, invites Owner as `member`, Owner accepts | beforeEach | Owner `leaveWorkspace(B)`, then admin deletes B |
| Destination snapshot | Discover | `captureContentSnapshot` of the workspace named in the toast, read before is taken from `/me` workspace list | test body | none |
| Audit row | Discover (read) | `readWorkspaceDeletions(A.id)` | inside readers | none |

## 9. Checklist

- [x] naming · [x] object param · [x] Q1 audit read (skips as NOT RUN when STAGING_DB_RO_URL is unset) · [ ] Q5 member-only workspace creator
