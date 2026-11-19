# BK-667: Idempotency-Key contract on the five create endpoints

| Field | Value |
|-------|-------|
| **Priority** | P0 (TC1 header required, TC9 replay, TC12 payload mismatch, TC16 no cross-parent leak, TC25 signup not bricked, TC26 headless bootstrap) / P1 (TC29 earlier adopters unchanged, TC11 retention window, prior Defect BK-1724) |
| **Phase** | Phase 1 plan only (no code). Ticket-driven, three coding waves |
| **Items** | 8 signed Candidate Tests -> 8 parameterized ATCs (28 data rows in total, see the table) |
| **Dependencies** | Reuses `WorkspaceExportSteps.createSyntheticWorkspace` (slug prefix), the cookie-only seeding helpers (`ProjectsApi`, `UserStoriesApi`, `AtcsApi`, `BugsApi`, `TestsApi`, `RunsApi`), `AuthApi`, `TokensApi`, `LoginPage`. Needs the answers to `automation-plan.md` §9 Q1 (TC11 DB write), Q2 (TC26 account), Q3 (TC25 inbox) before the affected waves |
| **Requires** | Main caller `config.testUser` with the PAT minted by `api-setup` (scopes `atc:read`, `atc:write`, `run:execute`); one synthetic `qa-auto-bk667-*` workspace per spec file (two for TC16); a zero-workspace account (TC26, Q2); a write-capable DB credential scoped to `idempotency_keys` (TC11, Q1); a programmatic inbox (TC25, Q3) |
| **Source** | Story BK-667 (Epic BK-1). ATS BK-1720, ATP BK-1721, ATR BK-1722, ReTest BK-1953. Defect BK-1724 (Closed, fix PR #341 `a015b23`). Governing contract: ADR-0002 + Tech Lead decision 2026-10-25 (parent ids are hashed, so reuse under another parent = 409). ROI verdicts: BK-667 comments 13710-13717 (signed 2026-11-18); Deferred list: comment 13718 |

## Summary

Automates the 8 signed Candidates of BK-667 as one regression flow for the `Idempotency-Key` contract (ADR-0002) on `POST /workspaces`, `/workspaces/{id}/projects`, `/modules/{id}/user-stories`, `/atcs`, `/bugs`, plus the two earlier adopters (`/tests`, `/runs`), and the two bootstrap journeys a broken header would brick (UI onboarding, fresh-PAT bootstrap). The suite drives the contract over the PAT channel (the persona is "Karim", a PAT agent). Every API spec file creates its own synthetic workspace with a fresh parent chain, so record counts are read back through the product's own list endpoints scoped to that workspace. No DB read is needed except one DB write for TC11.

Real behaviour verified in product source (`../upex-bunkai-tms`, `origin/staging` at `f5dc10d5`, read-only) and in the Stage 2 evidence (2026-11-11 / 2026-11-17):
- `lib/api/idempotency.ts`: key shape `^[\w-]{8,128}$`; `idempotency_key_required` ("Missing idempotency-key header.") vs `idempotency_key_invalid`; lookup `(user_id, endpoint, key)`; different hash -> 409 `conflict` "Idempotency-Key reused with a different request payload."; same hash + pending -> 409 "already in flight"; succeeded -> replay of the stored snapshot and status; a row past `expires_at` is deleted and the request runs as new (BK-1724 fix).
- `supabase/migrations/0009_cross_cutting.sql`: `expires_at default now() + interval '24 hours'`, `unique (user_id, endpoint, key)`, RLS on, owner-only SELECT policy, no API read surface.
- `lib/api/idempotent-create.ts`: hashed payload includes the parent ids (`workspace_id` for projects, `module_id` for user stories; ATC and bug bodies already carry module/project ids).
- Capability gate (`atc:write`) runs before the key check on projects, user-stories, atcs, bugs; `POST /workspaces` has none.
- Replays on workspaces, projects and user-stories return the same content with a different JSON key order (evidence `BK-667-ac02-tc9-replay.log`): compare parsed bodies, never bytes.

## Test Cases

> Bodies live in Jira (`bun run jira:sync-issues get <KEY>`). Layer `API` = `tests/integration/idempotency/`, `UI` = `tests/e2e/onboarding/`.

| TMS ID | TC | Title (short) | Type | Prio | Wave | Layer | Fixture | Target ATC (component.method) | Rows |
|--------|----|---------------|------|------|------|-------|---------|-------------------------------|------|
| BK-1690 | TC1 | header absent: 400 `idempotency_key_required`, nothing written | Negative / EP | P0 | 1 | API | `{ api }` | `IdempotencyApi.refuseCreateWithoutKey` | 5 endpoints |
| BK-1698 | TC9 | same key + same payload: first status and body replayed, one record | Positive / EP | P0 | 1 | API | `{ api }` | `IdempotencyApi.replayCreateWithSameKey` | 5 endpoints |
| BK-1701 | TC12 | same key + different payload: 409, second body not written | Negative / EP | P0 | 1 | API | `{ api }` | `IdempotencyApi.refuseKeyReuseWithDifferentPayload` | 5 endpoints |
| BK-1705 | TC16 | same key under another parent: 409, nothing created in the second parent, no replay leak | Negative / DT | P0 | 1 | API | `{ api }` | `IdempotencyApi.refuseKeyReuseUnderAnotherParent` | 4 endpoints |
| BK-1718 | TC29 | `POST /tests` and `POST /runs` unchanged (missing, malformed, replay, mismatch) | Regression | P1 | 1 | API | `{ api }` | `IdempotencyApi.verifyEarlierAdopterContractUnchanged` | 2 endpoints |
| BK-1715 | TC26 | fresh PAT, zero workspaces: first workspace created over the API with a key | Positive / Integration | P0 | 2 | API | `{ api }` + own request context | `IdempotencyApi.bootstrapFirstWorkspaceWithFreshPat` | 1 |
| BK-1700 | TC11 | key past its 24h window: same key + payload creates a NEW record (prior Defect BK-1724) | Boundary / BVA | P1 | 2 | API + DB write | `{ api }` | `IdempotencyApi.createNewRecordAfterKeyExpired` | 2 (atcs, bugs) |
| BK-1714 | TC25 | brand-new account completes UI onboarding, first workspace created, no refused request | Positive / E2E journey | P0 | 3 | UI | `{ ui }` (clean storage) | `OnboardingPage.completeOnboardingCreatingFirstWorkspace` | 1 |

**Wave totals**: Wave 1 = 5 ATCs, 21 rows, no new credential. Wave 2 = TC26 (Q2 account) and TC11 (Q1 DB write). Wave 3 = TC25 (Q3 inbox).

### Layer decisions (justified)

| TC | Choice | Why |
|----|--------|-----|
| TC1, TC9, TC12, TC16, TC29 | API over PAT | Server contract; the TC wording is "given a PAT". The UI cannot show a missing header or a replay |
| TC26 | API, own cookieless request context | The subject is a token minted for a different, zero-workspace identity: the fixture's PAT must not ride along |
| TC11 | API + one guarded DB write | The 24h window can only be crossed by waiting a day or by moving `expires_at`; there is no API or clock hook (§9 Q1) |
| TC25 | UI | The risk is the onboarding form itself (`onboarding-form.tsx` sending the header); an API call would not exercise it |

## Excluded / deferred TCs

22 Tests are Deferred by ROI and stay at READY (BK-667 comment 13718): TC2-TC8, TC10, TC13-TC15, TC17-TC24, TC27, TC28, TC30. Not re-planned here. No Manual verdicts.

## Automation Plan

**Order**: Wave 1 first (TC1 and TC9 are the smoke pair from ATP §10; then TC12, TC16, TC29). Wave 2 after Q1/Q2 answers (TC26, then TC11). Wave 3 after Q3 (TC25).

**Shared preconditions**:
- Synthetic workspace + parent chain (project, module, user story, acceptance criterion): `IdempotencySteps.createParentChain` (composes `WorkspaceExportSteps.createSyntheticWorkspace` with `slugPrefix: 'qa-auto-bk667-'` and the cookie-only seeding helpers), in `beforeAll` per file.
- Second parent chain for TC16: a second synthetic workspace through the same Steps call.
- TC29 extra seed: environment + ATC for the Test, a Test for the Run (cookie-only helpers).
- Cleanup: `IdempotencySteps.cleanupParentChains` soft-deletes every synthetic workspace (and the workspaces the workspaces-row ATCs created) in `afterAll`, all attempted even if one fails.

**Blocked by**: Q1 (TC11), Q2 (TC26), Q3 (TC25). Wave 1 is blocked by nothing.

**Preconditions for the whole scope**: `api-setup` session (cookie + PAT with `atc:write`, `run:execute`); staging carries PR #282 (`7ed98093`) and PR #341 (`a015b23`) (both verified ancestors of `origin/staging`); `bun run api:sync` before Wave 1 (local OpenAPI lacks `GET /workspaces/{id}/projects`).

## Expected-fail tests

None. BK-1724 is Closed (ReTest BK-1920 6/6 PASSED, BK-1953 9/9 PASSED). If TC11 fails again, tag the row with the reopened defect key, never leave it red silently.

## Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R1 | Shared Supabase across local, staging and production; a DB write is a write to the real database | High | TC11 writes ONE row, guarded: `WHERE user_id = <caller> AND key LIKE 'qa-auto-bk667-tc11-%' AND endpoint IN (...)`, row count must be exactly 1, credential limited to UPDATE on `public.idempotency_keys` (Q1) |
| R2 | Comparing replay bodies byte-for-byte fails on 3 endpoints (key order differs) | Medium | Parsed deep equality (`toEqual`) on the whole body |
| R3 | A 409 that is the in-flight conflict, not the mismatch, would pass a status-only check | Medium | TC12/TC16 assert `error.code = conflict` AND the mismatch message text |
| R4 | A 400 caused by a bad body would pass TC1 | High | Positive control inside the ATC: the identical body with a fresh key answers 201 afterwards |
| R5 | Community plan = 3 projects per workspace | Low | One synthetic workspace per file; max 2 projects created in it |
| R6 | TC26 account state drifts (a leftover workspace from a failed run) | Medium | `beforeAll` precondition read: zero workspaces, else fail fast naming the account variable; cleanup soft-deletes in `finally` |
| R7 | TC25 creates one auth account per run that the suite cannot delete (no admin API by rule) | Medium | Accepted residue only after Q3; email prefix `qa-auto-bk667-`; the onboarding workspace is soft-deleted; run in the nightly only (`@nightly`) to cap volume |
| R8 | Signup rate limit (`POST /auth/signup` answers 429) and OTP delivery latency | Medium | One signup per run; bounded poll for the OTP email (90 s), `test.slow()` |
| R9 | After verifying the OTP, Stage 2 saw one new account land on `/projects` and another on `/onboarding` | Medium | Verify the redirect live at Code time; the ATC opens `/onboarding` only if the product does not, and records an annotation |
| R10 | Per-row tests: a row that fails outside the ATC writes no result and the other rows sync PASS | Medium | All row logic (first send, retry, read-back) runs inside the ATC; only parent chains live in `beforeAll` (a `beforeAll` failure leaves every row NOT RUN) |

## Test-Design Checklist (test-design-doctrine.md Part 3)

| Check | Result |
|-------|--------|
| P1 risk beyond AC | YES. TC1 positive control (same body + fresh key = 201) proves the 400 came from the header alone; TC9 asserts the stored snapshot is replayed even for the status code; TC12/TC16 distinguish mismatch 409 from in-flight 409 by message and assert the first record is unchanged; TC16 asserts the 409 body leaks no field of parent A's record; TC11 asserts a live-window replay before aging (the key really was stored) |
| P2 AC as floor | YES. AC-01 (TC1), AC-02 (TC9, TC11), AC-03 (TC12, all 5 endpoints, AC lists 3), AC-06 (TC25, TC26), AC-08 (TC29), AC-09 per the 2026-10-25 decision (TC16) |
| P3 concrete exploration | YES. Each ATC names its data (synthetic parents, marker-tagged payloads, generated keys, zero-workspace account, inbox address) |
| P4 1:N per AC | YES. AC-01 -> 5 rows; AC-02 -> 5 replay rows + 2 window rows; AC-03 -> 5 rows; AC-09 -> 4 parent rows; AC-08 -> 2 endpoints x 4 behaviours |
| P5 anomalies | PARTIAL by design: parallel race (TC13), two callers (TC14), failed-attempt release (TC17-19), snapshot failure (TC20) are Deferred by ROI |
| EP | YES. Key {absent, live same payload, live different payload, live other parent, expired}; endpoint {5 adopters, 2 earlier adopters} |
| BVA | PARTIAL. Key length 7/8/128/129 is Deferred (TC3/TC4). Time window: just-outside (`expires_at` = now - 1 s) inside TC11, just-inside covered by TC9's replay |
| ST | YES. Key lifecycle `none -> succeeded (replay) -> expired -> succeeded (new row)` (TC9, TC11) |
| DT | YES. key x payload x parent (TC9, TC12, TC16) |
| PW | N/A (no 3-factor combinable matrix) |
| PARAM | YES. TC1, TC9, TC12 (5 rows), TC16 (4), TC11 (2), TC29 (2) |
| RISK | YES. P0 = header required, replay, mismatch, tenant leak, bootstrap paths |
| OBS | Reachable through the API except TC11 (DB write) and TC25 (inbox) |
| SEED | YES. All state from real API calls; the only forced state is TC11's `expires_at` |

## Merged TCs

None proposed. TC29 keeps its four behaviours (missing, malformed, replay, mismatch) inside one ATC because the signed TC is one Test with one precondition (an earlier adopter); the rows are the two endpoints.

## Acceptance Criteria

- [ ] 8 TCs automated as 8 parameterized ATCs, `@atc` id = TC key
- [ ] Every API file uses its own `qa-auto-bk667-*` workspace and soft-deletes it
- [ ] Record counts read back through list endpoints, never assumed from the status code
- [ ] TC11 runs only with the approved credential; without it the ATC skips with the variable name (NOT RUN, never PASS)
- [ ] Tests pass on staging
