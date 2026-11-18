# ATC Spec: BK-954 — refuseDeletedWorkspacePat

> Ticket: BK-954 (TC39, merges TC40)
> Component: WorkspaceDeletionApi (NEW)
> Type: API — Negative / security
> Parent Story: BK-512 · Wave 1 · Spec file: `tests/integration/workspace-deletion/refuseDeletedWorkspacePat.test.ts`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Deleted-workspace PAT refused like an unknown token | A PAT never outlives its workspace and the refusal leaks nothing | PAT bound to the synthetic workspace works before deletion | AC-13 |

## 2. ATC Contract

```typescript
/**
 * ATC: The deleted workspace's PAT is refused exactly like a never-issued token
 * Fixed assertions (cookieless context, Bearer only):
 *  - the PAT call answers 401/403-class refusal (status recorded)
 *  - the unknown-token call (`DataFactory.createUnknownPat()`) answers the same status, error.code, error.message and body key set
 *  - the refusal body contains neither the workspace id, slug nor name
 */
@atc('BK-954')
async refuseDeletedWorkspacePat(
  args: { token: string, workspaceId: string },
): Promise<[APIResponse, ErrorEnvelope]>
```

## 4. Assertions Split

**Fixed**: as contract; the comparison covers the whole envelope, not just the status (ATP: "byte-for-byte fixture", minus volatile request ids). **Test-level**: positive control, the PAT lists the workspace (`GET /workspaces/{id}` 200) BEFORE deletion, so a refusal cannot be a bad token in disguise; `deleteAsOwner` 200. TC40 ("identical shape") is the oracle comparison inside this ATC.
Probe endpoint: `GET /api/v1/workspaces/{id}` with Bearer, chosen because the BK-508 suite proved it accepts `atc:read` PATs.

## 6. Technique-derivation check

EP: credential state {valid-before, deleted-workspace, never-existed}. DT: refusal identical iff both fail at the same gate (the shape that BK-988 broke for invites).

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| PAT | Generate | `TokensApi.issueToken({ workspaceId, scopes: ['atc:read','workspace:admin'], expiresInDays: 1 })` | test body | revoked by the delete |
| Unknown PAT | Generate | `createUnknownPat()` | in ATC | none |

## 9. Checklist

- [x] naming · [x] object param (`token` key masked) · [x] tuple return · [x] token never logged
