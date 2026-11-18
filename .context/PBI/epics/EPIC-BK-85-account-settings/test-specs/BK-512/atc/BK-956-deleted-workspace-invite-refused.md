# ATC Spec: BK-956 — refuseDeletedWorkspaceInvite

> Ticket: BK-956 (TC41, merges TC42, prior bug BK-988)
> Component: WorkspaceDeletionApi (NEW)
> Type: API — Negative / security
> Parent Story: BK-512 · Wave 1 · Spec file: `tests/integration/workspace-deletion/refuseDeletedWorkspaceInvite.test.ts`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Deleted-workspace invite refused like an unknown invite | An outstanding invite dies with its workspace without revealing it existed | Pending invite issued by the Owner, not accepted | AC-14 |

## 2. ATC Contract

```typescript
/**
 * ATC: The deleted workspace's invite is refused exactly like a never-issued invite token
 * Fixed assertions (invitee session, POST /invites/accept):
 *  - invite token call and random-token call (`createUnknownInviteToken()`) return the identical status, error.code, error.message and key set
 *  - neither body contains the workspace id, slug or name
 *  - the invitee's workspace list is unchanged (never joined)
 */
@atc('BK-956')
async refuseDeletedWorkspaceInvite(
  args: { token: string, inviteeRequest: APIRequestContext },
): Promise<[APIResponse, ErrorEnvelope]>
```

## 4. Assertions Split

**Fixed**: as contract. BK-988 history: before the fix a deleted-workspace token got 409 "Invite has been revoked." vs 404 "Invite token is invalid.". The identical-envelope comparison is the regression guard. **Test-level**: `deleteAsOwner` 200; invite was valid pre-delete is implied by `createInvite` 201 (the accept itself is never called pre-delete, so the invite stays pending).
Invitee: the `viewer` role account's cookie session (never becomes a member, nothing to clean). `acceptInvite` helper asserts 200, so the ATC uses a raw POST on the invitee context.

## 6. Technique-derivation check

EP/DT same as BK-954 with the invite gate.

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Invite | Generate | `createInvite({ email: createInviteEmail(), role: 'member' })` | test body | revoked by the delete |
| Invitee session | Discover | `.auth/role-viewer.json` (project `integration-roles`, Q4) | test body | context disposed |

## 9. Checklist

- [x] naming · [x] object param (`token` masked) · [x] tuple return · [ ] Q4 · [ ] Q8
