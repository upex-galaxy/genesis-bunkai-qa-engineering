# ATC Spec: BK-1700 — createNewRecordAfterKeyExpired

> Ticket: BK-1700 (TC11) · prior Defect BK-1724 (Closed, PR #341)
> Component: IdempotencyApi (NEW) + `tests/utils/idempotencyClock.ts` (NEW)
> Type: API — Boundary (BVA on the time window) / State-Transition
> Parent Story: BK-667 · Wave 2 · Spec file: `tests/integration/idempotency/expireIdempotencyKey.test.ts` · Fixture `{ api }`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| A key past its window is a new request | After 24 h the same key and payload create a new record (the BK-1724 regression guard) | Parent chain; write credential (Q1) | AC-02 (window clause) |

## 2. ATC Contract

```typescript
@atc('BK-1700')
async createNewRecordAfterKeyExpired(args: {
  target: 'atcs' | 'bugs'
  parents: ParentChain
  ageKey: (key: string) => Promise<number | null>
}): Promise<[APIResponse, CreateBody, object]>
```

Fixed assertions:
1. (K, P) -> 201, id1
2. (K, P) -> 201, same id1 (inside the window: proves the row was live)
3. `ageKey(K)` must return exactly 1 (one aged row); anything else, `null` included, fails. A missing DB configuration is handled earlier: the spec's `beforeAll` skips the file naming `config.idempotencyDb.varNames` (NOT RUN). Returns the after-window create as `[response, body, payload]`
4. (K, P) -> 201, id2, `id2 !== id1`
5. `countByMarker(marker) === 2`

## 3A. API Details

`ageKey` (test-level closure) calls `ageIdempotencyKey({ userId: me.id, endpoint: 'POST /api/v1/atcs' | 'POST /api/v1/bugs', key })`:
`UPDATE public.idempotency_keys SET created_at = now() - interval '48 hours', expires_at = now() - interval '1 second' WHERE user_id = $1 AND endpoint = $2 AND key = $3 AND key LIKE 'qa-auto-bk667-tc11-%'`, session not read-only, returns row count. `userId` from `AuthApi.getCurrentUser()` in `beforeAll`.

## 4. Assertions Split

**Fixed**: as contract. **Test-level**: the `ageKey` closure (the DB util lives outside the component; the ATC stays DB-agnostic).

## 6. Technique-derivation check

BVA: just-outside (`expires_at` = now - 1 s) here; just-inside = step 2 and TC9. ST: `succeeded(live) -> expired -> new succeeded row`.

## 7-8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Key row past `expires_at` | Modify | guarded UPDATE (D9) | in ATC via callback | product replaces the row (new 24 h TTL) |
| Records | Generate | ATC | in ATC | die with the synthetic workspace |

Feasibility: NEEDS-DB-WRITE (Q1). The dbhub MCP is down this session (irrelevant at run time: the suite would use its own connection). Without Q1 = YES the TC is not automatable honestly: waiting 24 h or a product clock hook are the only other paths.
