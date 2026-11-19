# ADR-0030 — A guarded single-row DB write ages an idempotency key for the 24 h window test

- **Status:** Accepted (2026-11-18)
- **Date:** 2026-11-18
- **Deciders:** Project owner (BK-667 test automation, Phase 1 plan, answer to Q1, recorded in `.session/test-automation/BK-667/progress.md` §Phase 1)
- **Tags:** test-data, db-write, credentials, ci
- **Supersedes:** —
- **Superseded by:** —

---

## Context

BK-667 TC11 (Xray Test BK-1700) checks that an `Idempotency-Key` older than its 24 h window is treated as a new request. The product exposes no API or test hook to move the clock of a key, and the story keeps the retention window out of scope, so the only way to automate the check in one run is to age the key row in `public.idempotency_keys` directly.

Every other suite DB access is read-only (`qa_inspector_ro`, `STAGING_DB_RO_URL`). The staging database is shared, so an automated write from the suite is a new security posture: a wrong credential, environment or filter could change rows the suite does not own.

The `qa_inspector_rw` role already holds UPDATE on `public.idempotency_keys` (the same update was approved by hand for the BK-1724 retest), and its connection is already configured for the DBHub MCP server through the `DBHUB_*` variables.

## Decision

We will let BK-1700 age exactly one `idempotency_keys` row through the `qa_inspector_rw` role, reusing the `DBHUB_*` variables (`DBHUB_HOST`, `DBHUB_PORT`, `DBHUB_DATABASE`, `DBHUB_USER`, `DBHUB_PASSWORD`, read through `config.idempotencyDb`) instead of a new dedicated variable. The only code path is `tests/utils/idempotencyClock.ts`, and it upholds these guards on every call:

1. Staging only: `config.idempotencyDb.connection` is `null` for any other `TEST_ENV`, and the spec skips naming the variables.
2. Own row only: the `WHERE` clause binds the caller's own `user_id`, the endpoint, the exact key, and `key LIKE 'qa-auto-bk667-tc11-%'`; a key outside that prefix is refused before connecting.
3. Role check: inside the same transaction and before the UPDATE, `select current_user` must equal `qa_inspector_rw`, otherwise the transaction aborts with nothing written and the test fails naming the role.
4. Single row: an UPDATE that matches anything but one row is rolled back and the test fails.

## Consequences

- **Positive:** the expired-window contract (a real prior-bug guard) is automated in one run, with no product change and no cross-run state.
- **Negative / trade-offs:** CI needs the `DBHUB_*` secrets to run BK-1700 (without them the test records SKIP, never PASS). The credential is shared with the DBHub MCP server, so rotating it touches both, and a test run and an agent session hold the same write-capable role. The suite now owns a write path to a shared database that has to stay guarded.
- **Neutral / follow-ups:** any new DB write from the suite needs its own decision; this ADR covers only the BK-1700 aging update. If `qa_inspector_rw` gains wider grants, the guards above still bound what the suite touches.

## Alternatives considered

- **A dedicated `STAGING_DB_IDEMPOTENCY_RW_URL` variable** — rejected by the owner: a second copy of the same role's credential to rotate, with no added isolation.
- **A test-only TTL hook in the product** — rejected: a product change that contradicts "no change to the retention window".
- **Wait 24 h across two runs** — rejected: cross-run state, fragile.
- **Keep TC11 manual** — rejected: the prior-bug guard would stay unautomated.

## References

- `.context/PBI/epics/EPIC-BK-1-tenancy-identity/test-specs/BK-667/automation-plan.md` (D9, Q1)
- `tests/utils/idempotencyClock.ts`, `tests/integration/idempotency/expireIdempotencyKey.test.ts`
- `.session/test-automation/BK-667/progress.md` §Phase 1 (Q1 answer, 2026-11-18)
