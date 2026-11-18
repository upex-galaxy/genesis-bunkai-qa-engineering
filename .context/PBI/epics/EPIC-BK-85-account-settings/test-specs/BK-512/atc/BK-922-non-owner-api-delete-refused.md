# ATC Spec: BK-922 — rejectDeleteByNonOwner

> Ticket: BK-922 (TC07)
> Component: WorkspaceDeletionApi (tests/components/api/WorkspaceDeletionApi.ts, NEW)
> Type: API — Negative / security
> Parent Story: BK-512 · Wave 1 · Spec file: `tests/integration/workspace-deletion/rejectDeleteByNonOwner.test.ts`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Direct DELETE refused for Admin / Member / Viewer | The Owner-only rule holds at the API, not only in the UI | Synthetic workspace; the role account is an active member with that role | AC-02 |

## 2. ATC Contract

```typescript
/**
 * ATC: A non-Owner's direct DELETE is refused and changes nothing
 * Fixed assertions:
 *  - cookie DELETE as the role -> 403, error.code 'forbidden', message starts "Only the workspace Owner can delete"
 *  - cookieless context with the role's Bearer-less session still 403 (no body difference tolerated)
 *  - Owner re-read: GET /workspaces/{id} 200, same name, listed in Owner's workspace list
 */
@atc('BK-922')
async rejectDeleteByNonOwner(
  args: { workspaceId: string, role: InviteRole, memberRequest: APIRequestContext },
): Promise<[APIResponse, ErrorEnvelope]>
```

Parameterized: 3 rows (admin, member, viewer) = same behaviour, one ATC (EP-merge within one partition "non-Owner").

## 4. Assertions Split

**Fixed**: as contract. **Test-level**: precondition proof that the role account really holds the role (`listWorkspaces` on its request, as BK-1001 does).
Bearer variant: PAT-bearing 403 message ("browser session only") is a different branch. Not a role row; asserted once on the Owner PAT in BK-954's body? No: out of scope here, noted as Deferred (UI/PAT variants of AC-02).

## 6. Technique-derivation check

EP: roles {owner} valid vs {admin, member, viewer} invalid. DT: delete allowed iff Owner AND cookie. BVA N/A.

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Subject workspace | Generate | Steps `createOwnedWorkspaceWithContent` | beforeEach | Owner soft-delete in afterEach |
| Role membership | Discover + Generate | `grantTeammate` with `config.roleUsers[role]` | test body | role `leaveWorkspace` in `finally`, before Owner delete |
| Role session | Discover | `.auth/role-<role>.json` via `request.newContext`, project `integration-roles` | test body | context disposed |

## 9. Checklist

- [x] naming · [x] object param · [x] tuple return · [x] no secrets logged · [ ] needs Q4 (integration-roles project)
