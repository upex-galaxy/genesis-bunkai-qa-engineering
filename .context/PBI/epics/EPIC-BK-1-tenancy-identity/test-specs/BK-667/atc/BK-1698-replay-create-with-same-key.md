# ATC Spec: BK-1698 — replayCreateWithSameKey

> Ticket: BK-1698 (TC9)
> Component: IdempotencyApi (NEW)
> Type: API — Positive (EP: live key, same payload)
> Parent Story: BK-667 · Wave 1 · Spec file: `tests/integration/idempotency/replayIdempotentCreate.test.ts` · Fixture `{ api }`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Retry replays the first answer | A retry with the same key and body returns the first status and body and writes nothing twice | Bearer PAT; fresh parent chain | AC-02 |

## 2. ATC Contract

```typescript
@atc('BK-1698')
async replayCreateWithSameKey(args: { target: IdempotencyTarget, parents: ParentChain }): Promise<[APIResponse, CreateBody, object]>
```

Fixed assertions:
- First send (key K, payload P) -> 201, record id present
- Second send (K, P) -> same status as the first (201) and `toEqual` the first parsed body (same id, same `created_at`)
- `countByMarker(marker) === 1`

## 3A. API Details

Same 5 rows as BK-1690. Parsed comparison only: workspaces, projects and user-stories replay with a different key order (evidence `BK-667-ac02-tc9-replay.log`).

## 4. Assertions Split

**Fixed**: as contract. **Test-level**: none; returns the decisive call (the retry) as `[response, body, payload]`; workspaces are cleaned by the `afterAll` slug-prefix cleanup.

## 6. Technique-derivation check

EP: {live key, same payload}. State-Transition: `none -> succeeded -> replay`. The just-inside-window side of TC11's BVA is this ATC.

## 7-8. Data Context

As BK-1690 (parent chain in `beforeAll`, marker and key generated in the ATC).
