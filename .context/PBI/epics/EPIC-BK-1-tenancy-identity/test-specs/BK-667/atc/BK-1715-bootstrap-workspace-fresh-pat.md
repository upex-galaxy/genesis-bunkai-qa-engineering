# ATC Spec: BK-1715 — bootstrapFirstWorkspaceWithFreshPat

> Ticket: BK-1715 (TC26)
> Component: IdempotencyApi (NEW), instantiated on the TC26 request context
> Type: API — Positive / integration (headless bootstrap)
> Parent Story: BK-667 · Wave 2 · Spec file: `tests/integration/idempotency/bootstrapWorkspaceWithFreshPat.test.ts` · Fixture `{ api }` (not used for the call) + own context

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Fresh PAT creates the first workspace | The documented headless bootstrap still works with a key | Account with zero workspaces (Q2); PAT minted now by `POST /auth/signin` | AC-06 |

## 2. ATC Contract

```typescript
@atc('BK-1715')
async bootstrapFirstWorkspaceWithFreshPat(args: { payload: CreateWorkspacePayload, userId: string }): Promise<[APIResponse, CreateBody, CreateWorkspacePayload]>
```

Fixed assertions:
- Precondition read: `GET /workspaces` (Bearer fresh PAT) -> 200 with 0 workspaces (fails fast, naming the account variable, so a leftover is never mistaken for a pass)
- (K, payload) -> 201, `workspace.owner_user_id === userId`, slug = payload slug
- `GET /workspaces` -> exactly 1, that slug, role `owner`
- (K, payload) again -> 201 with the same id; `GET /workspaces` still 1

## 3A. API Details

Context: `IdempotencySteps.openFreshPatContext()` = `playwright.request.newContext()` + `POST /auth/signin { email, password, pat_name: 'qa-auto-bk667-tc26', pat_expires_in_days: 1 }` with `config.bootstrapUser` (Q2). The PAT and session value are never logged or attached. Before the zero-workspace precondition, `openFreshPatContext` soft-deletes leftover `qa-auto-bk667-*` workspaces of that account (an earlier run that died before cleanup) and still fails fast, naming the account variable, when any other workspace remains. `releaseFreshPatContext` in `finally`: soft-delete the created workspace (cookie, Owner), revoke the PAT (204), dispose.

## 4. Assertions Split

**Fixed**: as contract. **Test-level**: none. The header-absent case is TC1's (not repeated).

## 7-8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Zero-workspace account | Discover | `STAGING_BOOTSTRAP_EMAIL` / `_PASSWORD` (Q2) | test body | returns to zero workspaces |
| Fresh PAT | Generate | product sign-in | test body | revoked |

Feasibility: NEEDS-ACCOUNT (Q2). Never via service role, admin API, magic link or DB session rows.
