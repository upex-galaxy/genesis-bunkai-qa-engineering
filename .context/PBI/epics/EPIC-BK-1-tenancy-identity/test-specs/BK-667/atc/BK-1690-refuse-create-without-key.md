# ATC Spec: BK-1690 — refuseCreateWithoutKey

> Ticket: BK-1690 (TC1)
> Component: IdempotencyApi (NEW, `tests/components/api/IdempotencyApi.ts`)
> Type: API — Negative (EP: header absent)
> Parent Story: BK-667 · Wave 1 · Spec file: `tests/integration/idempotency/requireIdempotencyKey.test.ts` · Fixture `{ api }`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Header absent is refused before any write | A caller that forgot the header gets a named 400 and nothing is created | Bearer PAT with `atc:write`; fresh parent chain | AC-01 |

## 2. ATC Contract

```typescript
@atc('BK-1690')
async refuseCreateWithoutKey(args: { target: IdempotencyTarget, parents: ParentChain }): Promise<[APIResponse, CreateBody, object]>
```

Fixed assertions:
- `postCreate({ key: null })` -> 400, `error.code === 'idempotency_key_required'`, `error.message` contains `idempotency-key`
- `countByMarker(marker) === 0` right after the refusal
- Positive control: the identical payload with `createIdempotencyKey('tc1')` -> 201; `countByMarker(marker) === 1` (the 400 came from the header alone, and only the control wrote)

## 3A. API Details

Rows (`IDEMPOTENCY_TARGETS`): workspaces (no parent), projects (`workspace.id`), user-stories (`module.id`), atcs (`module_id`, `user_story_id`, `acceptance_criterion_ids`), bugs (project + module). Read-back routes: `automation-plan.md` §2.

## 4. Assertions Split

**Fixed**: as contract. **Test-level**: none. Returns the decisive call (the refused create) as `[response, body, payload]`; the control workspace is soft-deleted by the `afterAll` slug-prefix cleanup (`qa-auto-bk667-tc1-`).

## 6. Technique-derivation check

EP: key {absent}. Malformed and boundary partitions are Deferred (TC2-TC5).

## 7-8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Parent chain | Generate | `IdempotencySteps.createParentChain` | `beforeAll` | `afterAll` soft-delete |
| Marker, key | Generate | `DataFactory` | in ATC | key expires in 24 h |

## 9. Checklist

- [x] object param · [x] all row logic inside the ATC (R10) · [x] no token logged
