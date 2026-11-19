# ATC Spec: BK-1701 — refuseKeyReuseWithDifferentPayload

> Ticket: BK-1701 (TC12)
> Component: IdempotencyApi (NEW)
> Type: API — Negative (EP: live key, different payload)
> Parent Story: BK-667 · Wave 1 · Spec file: `tests/integration/idempotency/refuseIdempotencyKeyReuse.test.ts` · Fixture `{ api }`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Same key, different payload is a conflict | A key names one request; a different body under it is refused and not written | Bearer PAT; fresh parent chain | AC-03 |

## 2. ATC Contract

```typescript
@atc('BK-1701')
async refuseKeyReuseWithDifferentPayload(args: { target: IdempotencyTarget, parents: ParentChain }): Promise<[APIResponse, CreateBody, object]>
```

Fixed assertions:
- (K, payload A with marker A) -> 201
- (K, payload B with marker B, same parent) -> 409, `error.code === 'conflict'`, message contains `different request payload` (not the in-flight message)
- `countByMarker(markerB) === 0`; `countByMarker(markerA) === 1` and record A still carries its original name/title

## 3A. API Details

All 5 rows (the AC lists 3; the ATP covers 5). For workspaces, B differs in name and slug.

## 4. Assertions Split

**Fixed**: as contract. **Test-level**: none; returns the decisive call (the 409 reuse) as `[response, body, payloadB]`; workspaces are cleaned by the `afterAll` slug-prefix cleanup.

## 6. Technique-derivation check

EP: {live key, different payload}. DT row: key same x payload different x parent same.

## 7-8. Data Context

As BK-1690.
