# ATC Spec: BK-1718 — verifyEarlierAdopterContractUnchanged

> Ticket: BK-1718 (TC29)
> Component: IdempotencyApi (NEW)
> Type: API — Regression
> Parent Story: BK-667 · Wave 1 · Spec file: `tests/integration/idempotency/keepEarlierAdoptersUnchanged.test.ts` · Fixture `{ api }`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| `/tests` and `/runs` behave as before | The reference adopters keep 400 missing, 400 invalid, replay, 409 mismatch | Parent chain + environment + ATC (for a Test) + Test (for a Run) | AC-08 |

## 2. ATC Contract

```typescript
@atc('BK-1718')
async verifyEarlierAdopterContractUnchanged(args: { target: EarlierAdopterTarget, parents: EarlierAdopterParents }): Promise<[APIResponse, CreateBody, object]>
```

Fixed assertions, in order:
1. no header -> 400 `idempotency_key_required`
2. key `abc` -> 400 `idempotency_key_invalid` (distinct code)
3. key K + body P -> 201
4. K + P again -> same status, parsed body equal (same id)
5. K + body P' -> 409 `conflict`, mismatch message
6. read-back: `tests` row -> `GET /atcs/{seededAtcId}/usage` `count === 1`; `runs` row -> `GET /tests/{seededTestId}/runs` lists exactly 1 Run

## 3A. API Details

`tests` body: `{ title: marker, atc_ids: [atc.id], workspace_id }`, P' changes the title. `runs` body: `{ test_id, environment_id }`, P' adds `executor_mode: 'agent'`. Both carry one fixed `start_token`: the product hashes `start_token` into the request fingerprint and mints a random one when it is absent (`../upex-bunkai-tms/app/api/v1/runs/route.ts:75,95`), so without a fixed token every retry would look like a different payload and the replay row could never pass. Returns the first create as `[response, body, payload]` (see automation-plan.md "Return shape").

## 4. Assertions Split

**Fixed**: as contract. **Test-level**: none. One TC, one precondition, four behaviours as a sequence (TC identity rule): kept in one ATC, rows = the two endpoints.

## 6. Technique-derivation check

Regression of EP partitions {absent, malformed, live same, live different}.

## 7-8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Parent chain + environment + ATC + Test | Generate | `IdempotencySteps.createParentChain` + `seedEarlierAdopterParents` | `beforeAll` | `afterAll` soft-delete |
