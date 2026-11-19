# ATC Spec: BK-1705 — refuseKeyReuseUnderAnotherParent

> Ticket: BK-1705 (TC16)
> Component: IdempotencyApi (NEW)
> Type: API — Negative / security (Decision Table: key x payload x parent)
> Parent Story: BK-667 · Wave 1 · Spec file: `tests/integration/idempotency/isolateIdempotencyKeyByParent.test.ts` · Fixture `{ api }`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Key reuse under another parent is refused, never replayed | No cross-workspace / cross-module replay; nothing created in the second parent | Same caller owns two synthetic parent chains A and B | AC-09 (oracle: Tech Lead decision 2026-10-25, comment 13114; the Jira AC text "creates a new ATC" is stale, ATP G1) |

## 2. ATC Contract

```typescript
@atc('BK-1705')
async refuseKeyReuseUnderAnotherParent(args: { target: IdempotencyTarget, parentA: ParentChain, parentB: ParentChain }): Promise<[APIResponse, CreateBody, object]>
```

Fixed assertions:
- (K, body under A, marker M) -> 201, id A1
- (K, identically shaped body under B, same marker text) -> 409, `error.code === 'conflict'`, mismatch message
- The 409 body carries the `error` envelope (code and message above) and does not contain A1 or any id of parent A, its acceptance criterion included (no replay leak). Returns the 409 call as `[response, body, payloadB]`
- `countByMarker(M)` in B === 0; in A === 1

## 3A. API Details

| Row | Parent that changes | Body difference |
|-----|---------------------|-----------------|
| projects | workspace (path) | hashed `workspace_id` |
| user-stories | module (path) | hashed `module_id` |
| atcs | module + story + AC (body) | ids in body |
| bugs | project + module (body) | ids in body |

Workspaces is not a row (no parent).

## 4. Assertions Split

**Fixed**: as contract. **Test-level**: none.

## 6. Technique-derivation check

DT: key same x payload "same shape" x parent different -> 409. Two-caller and two-endpoint rows (TC14, TC15) are Deferred.

## 7-8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Parent chains A and B | Generate | `IdempotencySteps.createParentChain` x2 | `beforeAll` | `afterAll` soft-delete both |
