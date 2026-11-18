# ATC Spec: BK-938 — verifyEntityUnreachableAfterDeletion

> Ticket: BK-938 (TC23, prior bug BK-991)
> Component: WorkspaceDeletionApi (NEW)
> Type: API — Integration / matrix
> Parent Story: BK-512 · Wave 1 · Spec file: `tests/integration/workspace-deletion/unreachableAfterDeletion.test.ts`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Every entity type is unreachable | Soft-delete evicts all 10 content types, not just the workspace row | Seeded workspace: project, module, story, AC, ATC, test, run (open), bug, milestone, environment | AC-07 (and AC-15 shape: open Run) |

## 2. ATC Contract

```typescript
/**
 * ATC: One entity type is unreachable after the workspace is deleted
 * Fixed assertions (hard checks under softFail: a failing row records FAIL for BK-938 and answers undefined):
 *  - reachableBefore === true (captured by the test BEFORE the delete; a vacuous 404 can never pass)
 *  - every probe route of `target` answers 404 with error code not_found; 405 / 5xx / 200 fail
 */
@atc('BK-938', { softFail: true })
async verifyEntityUnreachableAfterDeletion(
  args: { target: EntityProbeTarget, reachableBefore: boolean },
): Promise<ProbeAnswer[] | undefined>
```

10 rows (EP: entity types are one behaviour "unreachable"), parameterized in ONE test calling the ATC per entity sequentially (BK-1006 precedent: rows in separate tests would let a failing precondition write no row and sync a false PASS). `workspaceId` is not needed by the probes; ids are global.

## 4. Assertions Split

**Fixed**: as contract. **Test-level**: the test collects the entities whose row answered `undefined` and asserts that failed list is empty (all 10 rows run, then the failure names them); after the delete, the workspace itself answers 404 (`GET /workspaces/{id}`).
Probe table and per-route caveats: automation-plan §5. Probes that mutate (PATCH module / milestone / environment) send the entity's own current values, so the pre-delete state is unchanged.
BK-991 class: tests, runs, ATCs, environments were reachable through admin-client RPCs. ATR BK-987 shows TC23 PASSED, so no expected-fail marker; any red is a regression.

## 6. Technique-derivation check

EP: 10 entity types, one partition each (no merge across types: each uses a different route and RPC gate, the bug class lives per route).

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Full content incl. open Run, bug, milestone | Generate | Steps `createOwnedWorkspaceWithContent({ withEverything: true })` | beforeEach | deleted by the test (D3) |
| reachableBefore | Generate | `probeEntity` helper pre-delete | test body | none |

## 9. Checklist

- [x] naming · [x] object param · [x] tuple return · [ ] probe table verified on staging at Code time · `test.slow()`
