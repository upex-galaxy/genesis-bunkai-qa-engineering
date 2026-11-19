# Test Automation Plan: BK-667

> Ticket: BK-667 — API Contract | Make the five remaining create endpoints safe to retry
> Type: integration (7 ATCs) + e2e (1 ATC)
> Created: 2026-11-18 (Phase 1, plan only)
> Spec: `spec.md` (same folder). Open questions are Q1..Qn in §9.

## 1. Ticket Summary

- **What to test**: the ADR-0002 `Idempotency-Key` contract on `POST /api/v1/workspaces`, `/workspaces/{id}/projects`, `/modules/{id}/user-stories`, `/atcs`, `/bugs`; the two earlier adopters `/tests` and `/runs` unchanged; the two bootstrap paths (UI onboarding, fresh-PAT first workspace).
- **ACs reached by the 8 Candidates**: AC-01, AC-02, AC-03, AC-06, AC-08, AC-09 (oracle per Tech Lead decision 2026-10-25). Not reached, by ROI decision: AC-04, AC-05, AC-07 (all their Tests Deferred, comment 13718).
- **Dependencies**: BK-508/BK-512 suites (synthetic workspace Steps, seeding helpers, lone-owner sign-in pattern). Defect BK-1724 (Closed).

### Verified facts the plan rests on

| Fact | Source | Consequence |
|------|--------|-------------|
| Missing header -> 400 `idempotency_key_required` "Missing idempotency-key header."; malformed -> 400 `idempotency_key_invalid` | `lib/api/idempotency.ts` `readKey`; evidence tc1, tc29 | TC1 / TC29 assert the code and the header name in the message |
| Different hash -> 409 `conflict` "Idempotency-Key reused with a different request payload."; pending -> 409 "already in flight" | same | TC12 / TC16 match the mismatch message, not only 409 |
| Replay returns the stored snapshot and stored status | same | TC9 compares status AND parsed body |
| Replay body key order differs on workspaces, projects, user-stories | evidence `BK-667-ac02-tc9-replay.log` | parsed deep equality only |
| Parent ids are part of the hashed payload (`workspace_id`, `module_id`; atcs/bugs bodies carry module/project) | `lib/api/idempotent-create.ts`, route files, comment 13114 | TC16 oracle = 409 mismatch, never a new record, never a replay |
| `expires_at` default `now() + 24h`; expired row deleted then request runs as new | migration 0009; `beginIdempotentRequest` (PR #341) | TC11 window = 24 h; aging needs a DB write |
| `idempotency_keys`: RLS on, owner SELECT policy only, no API route | migration 0009; route tree | No API can age or read a key row |
| `qa_inspector_rw` holds UPDATE on `public.idempotency_keys` | Engram #138 (BK-1724 retest, user-approved aging) | The write is technically possible; it needs a credential decision (Q1) |
| `POST /workspaces` has no capability gate; the other four need `atc:write` | route wrappers | The api-setup PAT (`atc:read`, `atc:write`, `run:execute`) covers every row |
| List/read routes for read-back: `GET /workspaces`, `GET /workspaces/{id}/projects`, `GET /modules/{id}/user-stories`, `GET /atcs/search?query&project_id`, `GET /bugs?project_id&module_id`, `GET /atcs/{id}/usage` (Tests chaining an ATC), `GET /tests/{id}/runs` | `origin/staging` route tree | Counts without the DB. `GET /workspaces/{id}/projects` is missing from the local OpenAPI: run `bun run api:sync` first |
| Signup UI: `/login` email -> "Create account" (password, min 8) -> "Verification code" -> "Verify and continue"; onboarding form: name ("Acme QA" placeholder), slug ("acme-qa"), "Create workspace"; success -> `router.replace('/projects')`; key rotates after a refusal | `app/(auth)/login/email-first-form.tsx`, `app/(app)/onboarding/onboarding-form.tsx` | Role/placeholder locators (no `data-testid` on these forms) |
| `POST /auth/signin` mints a PAT (`pat_scopes` optional) and sets the session cookie | `AuthApi`, `WorkspaceDeletionSteps.openLoneOwnerContext` | TC26 gets a freshly minted PAT through the product's own login |

## 2. Architecture Decisions

| # | Decision | Value | Rationale |
|---|----------|-------|-----------|
| D1 | How the ATCs send a chosen / absent / malformed key | NEW component `IdempotencyApi` owning a raw `postCreate({ target, parents, payload, key })` where `key: string \| null` (`null` = header omitted) | (a) A cross-endpoint parameterized ATC must live in ONE component; spreading it over five resource classes would mean five ATCs per TC, which the EP rule forbids. (b) The existing `WorkspacesApi`, `ProjectsApi`, `UserStoriesApi`, `AtcsApi`, `BugsApi`, `TestsApi`, `RunsApi` are cookie-only seeding helpers (they override `setAuthToken` to drop the PAT) that mint a fresh key per call by design; changing that would alter every BK-508/BK-512 seed. (c) KATA: a component does not depend on other components, so the endpoint table and the read-back routes live together in `IdempotencyApi`. Rejected: adding a `key` option to each existing class (5 edits, channel mixing, ATC split across classes) |
| D2 | Channel | Bearer PAT from `api-setup` (default `buildHeaders`), never `cookieOnly` | The persona and the TC text are PAT callers. Setup and cleanup stay cookie-only through the existing helpers |
| D3 | Row target table | `IDEMPOTENCY_TARGETS` constant: `workspaces`, `projects`, `user-stories`, `atcs`, `bugs` (+ `tests`, `runs` for TC29), each with path builder, payload builder and read-back route | One source for the 5 rows; the ATC takes the row name |
| D4 | Marker per created record | Every payload carries a unique marker (`qa-auto-bk667-<tc>-<rand>`) in its title/name/slug | Read-back counts by marker inside a fresh parent; never by "latest record" |
| D5 | Generated keys | `DataFactory.createIdempotencyKey(tc)` -> `qa-auto-bk667-<tc>-<uuid>` (<= 128, `[\w-]`) | Traceable, never reused across tests |
| D6 | Parent chains | `IdempotencySteps.createParentChain()` in `beforeAll` per file: synthetic workspace (`slugPrefix: 'qa-auto-bk667-'`) + project + module + user story + acceptance criterion (cookie-only helpers) | 6 consumer files, above the Steps threshold; reuses `WorkspaceExportSteps.createSyntheticWorkspace` |
| D7 | Per-row tests | One `test()` per row (BK-922 pattern), the whole row (first send, retry, read-back) inside the ATC | Each row reports separately; results merge worst-wins (`tests/utils/xrayResults.ts`); R10 |
| D8 | Body comparison | `expect(replayBody).toEqual(firstBody)` on parsed JSON | R2 |
| D9 | TC11 aging | `tests/utils/idempotencyClock.ts`: `ageIdempotencyKey({ userId, endpoint, key }): Promise<number \| null>` over a write-capable Postgres connection (`postgres` devDependency already present), credential `config.idempotencyDb.connection` (the existing `DBHUB_*` variables of the `qa_inspector_rw` role, Q1; staging only, optional). Inside one transaction it checks `select current_user = qa_inspector_rw`, then runs one parameterized UPDATE, guarded `WHERE user_id = $1 AND endpoint = $2 AND key = $3 AND key LIKE 'qa-auto-bk667-tc11-%'`, sets `created_at = now() - 48h, expires_at = now() - 1s`; returns the row count; `null` when unset | Same shape as `deletionAudit.ts` (BK-512 D9). Unset -> the spec `beforeAll` calls `test.skip` naming the variables, and the ATC asserts exactly 1 aged row: Playwright reports skipped, the TC syncs NOT RUN, never PASS. See ADR-0030 |
| D10 | TC26 identity | Own `request.newContext()` (no fixture cookie, no fixture PAT); `POST /auth/signin` with the zero-workspace account (Q2) and `pat_expires_in_days: 1`; PAT revoked and workspace soft-deleted in `finally` | The fixture's PAT belongs to a user with workspaces |
| D11 | TC25 inbox | `tests/utils/inbox.ts`: `waitForSignupOtp(email, { timeoutMs })`: `Promise<string \| null>` polling the Resend receiving API (`GET /emails/receiving`, then the message) with `config.qaInbox.apiKey` (`RESEND_API_KEY`) for an address on `config.qaInbox.domain` (config value, not an env var); extracts the 6-8 digit code only; email content treated as data | No admin API, no magic link, no DB session row: the code arrives in a real inbox, as in Stage 2. Unset -> ATC skips naming the variables |
| D12 | TC25 browser state | `test.use({ storageState: { cookies: [], origins: [] } })` in the e2e spec | The account must be brand-new, not the default `ui-setup` user |

> **ADR promotion check.** D9 (an automated, credentialed write to the shared production-backed database from the suite) passes all three gates of `adr-doctrine.md` §1: hard to reverse once the secret is in CI, surprising without context, and a real trade-off against "not automatable". Q1 was answered yes (reuse `DBHUB_*`, 2026-11-18): recorded as `.context/ADR/ADR-0030-guarded-db-write-for-time-window-tests.md` (Accepted). See ADR-0030. D1-D8, D10-D12 are ticket-local.

### Component Strategy

| Decision | Value | Rationale |
|----------|-------|-----------|
| API: idempotency | `IdempotencyApi.ts` (NEW) | 7 ATCs (TC1, 9, 11, 12, 16, 26, 29) + raw send + read-back helpers (D1) |
| API: reuse (setup only) | `WorkspacesApi.createWorkspace/deleteWorkspace/listWorkspaces`, `ProjectsApi.createProject/createModule/createEnvironment`, `UserStoriesApi.createUserStory/createAcceptanceCriterion`, `AtcsApi.createAtc`, `TestsApi.createTest`, `AuthApi.getCurrentUser`, `TokensApi.revokeToken` | In manifest, unchanged |
| UI | `OnboardingPage.ts` (NEW, `/onboarding`) | ATC for TC25 |
| UI: reuse + extend | `LoginPage.ts` (EXISTS): add helper `createAccountThroughSignup({ email, password, readCode })` (no `@atc`, precondition) | Owns the `/login` locators already |
| Steps | `IdempotencySteps.ts` (NEW) | D6 |
| Utils | `tests/utils/idempotencyClock.ts` (NEW, D9), `tests/utils/inbox.ts` (NEW, D11) | Fail silently (return `null`) when unconfigured |
| Fixture (API TCs) | `{ api }` | No browser |
| Fixture (TC25) | `{ ui }` with clean storage | UI only; the post-onboarding read uses `page.request` (the new account's cookie) |
| Registration | `ApiFixture`: `idempotency: IdempotencyApi` (propagate `setAuthToken` / `clearAuthToken`); `UiFixture`: `onboarding: OnboardingPage` | Existing pattern |

### [INTEGRATION ONLY] API Details

| Aspect | Value |
|--------|-------|
| Endpoints under test | `POST /workspaces`, `POST /workspaces/{id}/projects`, `POST /modules/{id}/user-stories`, `POST /atcs`, `POST /bugs`, `POST /tests`, `POST /runs` |
| Read-back | `GET /workspaces` (slug), `GET /workspaces/{id}/projects` (name), `GET /modules/{id}/user-stories` (title), `GET /atcs/search?query=<marker>&project_id=` (title), `GET /bugs?project_id=&module_id=` (title), `GET /atcs/{id}/usage` (Tests), `GET /tests/{id}/runs` (Runs) |
| Types | `CreateWorkspacePayload`, `CreateProjectPayload`, `CreateUserStoryPayload`, `CreateAtcPayload`, `CreateBugPayload`, `CreateTestPayload`, `CreateRunPayload` (`@schemas/workspace-content.types`, `@schemas/workspaces.types`), `ErrorEnvelope` (`@schemas/auth.types`); add facades `ListProjectsResponse`, `ListUserStoriesResponse`, `AtcSearchResponse`, `ListBugsResponse`, `AtcUsageResponse`, `ListTestRunsResponse` after `bun run api:sync` |
| Auth | Bearer PAT (`api-setup`); TC26 Bearer PAT of the zero-workspace account |
| Return pattern | raw helper `[APIResponse, TBody]`; ATCs return the decisive call as `[APIResponse, TBody, TPayload]` (see "Return shape") |
| Status map | 201 created / replayed · 400 `idempotency_key_required` / `idempotency_key_invalid` · 403 capability · 409 `conflict` (mismatch or in flight) · 422 validation |

**Return shape.** Every API ATC returns its decisive call as `[APIResponse, CreateBody, TPayload]`: BK-1690 the refused create, BK-1698 the retry, BK-1701 and BK-1705 the 409 reuse, BK-1700 the after-window create, BK-1715 the first workspace create. BK-1718 sweeps four checks with no single decisive call, so it returns the first create (the one write the contract allows). No caller needs a record id: cleanup runs by slug prefix or parent workspace. The UI ATC BK-1714 is the one typed-object exception, `{ workspaceId, landingPath }`: the workspace id feeds the `afterEach` cleanup and the landing path feeds the test-level annotation (a component never calls `test.info()`).

### [E2E ONLY] UI Elements

| Element | Strategy | Value |
|---------|----------|-------|
| Email field | label/placeholder | `qa@your-org.dev`, then "Continue" |
| New password | placeholder | `At least 8 characters`, button "Create account" |
| Code | placeholder | `Verification code`, button "Verify and continue" |
| Onboarding name / slug | placeholder | `Acme QA`, `acme-qa` |
| Submit | role button | "Create workspace" |
| Workspace create request | `page.waitForRequest` / `waitForResponse` on `POST **/api/v1/workspaces` | header `idempotency-key` matches `^[\w-]{8,128}$`; response 201 |
| Refused requests | `page.on('response')` collector for `/api/v1/` | no 4xx/5xx during the journey |
| Landing | URL | `/projects` (Q4 / R9) |

## 3. ATC Registry

### Existing ATCs (Reuse)

None. No BK-667 TC key exists in `kata-manifest.json` (checked BK-1690, 1698, 1700, 1701, 1705, 1714, 1715, 1718: 0 hits; `bun run kata:manifest:check` clean). No component named `IdempotencyApi`, `OnboardingPage` or `IdempotencySteps` exists.

### New ATCs (Create)

| ATC ID | Wave | Component | Method | Description |
|--------|------|-----------|--------|-------------|
| BK-1690 | 1 | IdempotencyApi | `refuseCreateWithoutKey({ target, parents })` | No header -> 400, `error.code = idempotency_key_required`, message names the header; read-back: marker count 0; positive control: same body + fresh key -> 201, count 1 |
| BK-1698 | 1 | IdempotencyApi | `replayCreateWithSameKey({ target, parents })` | Key K + body -> 201; K + identical body -> same status, parsed body equal (same id); read-back count = 1 |
| BK-1701 | 1 | IdempotencyApi | `refuseKeyReuseWithDifferentPayload({ target, parents })` | K + body A -> 201; K + body B -> 409 `conflict` mismatch message; read-back: A count 1 unchanged, B count 0 |
| BK-1705 | 1 | IdempotencyApi | `refuseKeyReuseUnderAnotherParent({ target, parentA, parentB })` | K under A -> 201; K + identically shaped body under B -> 409 mismatch; body has no record key and none of A's ids; B count 0, A count 1. Rows: projects (workspace), user-stories (module), atcs (module + story + AC), bugs (project + module) |
| BK-1718 | 1 | IdempotencyApi | `verifyEarlierAdopterContractUnchanged({ target, parents })` | For `tests` and `runs`: no key -> 400 required; `abc` -> 400 invalid; K -> 201; K again -> same status + body; K + different body -> 409 mismatch; read-back: 1 Test chaining the seeded ATC (`/atcs/{id}/usage`) or 1 Run of the seeded Test (`/tests/{id}/runs`) |
| BK-1715 | 2 | IdempotencyApi (built on the TC26 context) | `bootstrapFirstWorkspaceWithFreshPat({ payload })` | Precondition read inside: `GET /workspaces` = 0; K -> 201, `owner_user_id` = `/me` id; `GET /workspaces` = 1 with that slug and role owner; K again -> same id (no second workspace) |
| BK-1700 | 2 | IdempotencyApi | `createNewRecordAfterKeyExpired({ target, parents, ageKey })` | K -> 201 id1; K again -> same id1 (live window, control); `ageKey` callback -> exactly 1 row aged (else `test.skip` when unconfigured, fail when count != 1); K again -> 201 id2 != id1; read-back count 2. Rows: atcs, bugs |
| BK-1714 | 3 | OnboardingPage | `completeOnboardingCreatingFirstWorkspace({ name, slug })` | On `/onboarding`: fill, submit; the POST carries an `Idempotency-Key` of the published shape and answers 201; no refused `/api/v1/` response during the flow; lands `/projects`; `page.request GET /me` 200 with exactly 1 workspace owned by the new user, named `name` |

### New Helpers (No @atc)

| Component | Method | Returns | Description |
|-----------|--------|---------|-------------|
| IdempotencyApi | `postCreate({ target, parents, payload, key })` | `[APIResponse, unknown]` | Raw Bearer POST; `key: null` omits the header; no assertion |
| IdempotencyApi | `countByMarker({ target, parents, marker })` | `number` | Read-back through the target's list route (§2 API Details), exact-marker match client-side |
| IdempotencyApi | `buildPayload({ target, parents, marker })` | payload | Delegates to `DataFactory.createIdempotentCreatePayload` |
| LoginPage | `createAccountThroughSignup({ email, password, readCode })` | `void` | Email -> Create account -> code (from `readCode`) -> Verify; fails fast when `readCode` returns `null` |
| IdempotencySteps | `createParentChain()` | `ParentChain` (`workspace, project, module, story, criterion`) | D6 |
| IdempotencySteps | `seedEarlierAdopterParents(chain)` | `{ environment, atc, test }` | TC29 only |
| IdempotencySteps | `cleanupParentChains(chains, extraWorkspaces)` | `void` | Soft-delete all, AggregateError on several failures (same as `cleanupSyntheticWorkspaces`) |
| IdempotencySteps | `openFreshPatContext()` | `{ request, pat, userId }` | D10, Q2 account |
| IdempotencySteps | `releaseFreshPatContext(ctx, workspaceId?)` | `void` | Soft-delete the bootstrap workspace, revoke the PAT, dispose |
| utils | `ageIdempotencyKey`, `waitForSignupOtp` | `number \| null`, `string \| null` | D9, D11 |
| DataFactory | `createIdempotencyKey(tc)`, `createIdempotencyMarker(tc)`, `createIdempotentCreatePayload({ target, parents, marker })`, `createSignupEmail()` | values | D4, D5; signup email `qa-auto-bk667-<ts>-<rand>@<config.qaInbox.domain>` |

## 4. Test Data Strategy

| Data | Pattern | Source | Lifecycle |
|------|---------|--------|-----------|
| Main caller + PAT | Discover | `config.testUser`, `api-setup` state | Suite |
| Parent chain (workspace, project, module, story, AC) | Generate | `IdempotencySteps.createParentChain` (cookie-only helpers) | `beforeAll` per file; soft-deleted in `afterAll` (children die with it) |
| Second parent chain (TC16) | Generate | same | same |
| Records under test (projects, stories, ATCs, bugs, tests, runs) | Generate | the ATC itself through `postCreate`, marker-tagged | Inside the synthetic workspace, removed with it |
| Workspaces created by the `workspaces` rows (TC1 control, TC9, TC12) | Generate | the ATC; ids returned to the test | Soft-deleted in `afterEach` through `WorkspacesApi.deleteWorkspace` (cookie, Owner) |
| TC29 environment / ATC / Test | Generate | `IdempotencySteps.seedEarlierAdopterParents` | Inside the synthetic workspace |
| Keys | Generate | `DataFactory.createIdempotencyKey('tcN')` | Live 24 h in `idempotency_keys`, then expire by themselves (rows are not deletable by QA) |
| Zero-workspace account (TC26) | Discover | Q2: `STAGING_BOOTSTRAP_EMAIL` / `STAGING_BOOTSTRAP_PASSWORD` (new, `config.bootstrapUser`, validated by name at point of use) | Ends every run at zero workspaces |
| Fresh PAT (TC26) | Generate | `POST /auth/signin` on its own context | Revoked in `finally` |
| Aged key row (TC11) | Modify | `ageIdempotencyKey` on the key the ATC just created (D9) | Replaced by the product with a new 24 h row |
| Brand-new account (TC25) | Generate | UI signup + OTP from the real inbox (D11) | Auth user persists (no deletion without admin API, R7); its workspace soft-deleted in `afterEach` via `page.request` |

### DataFactory / Constants additions

```typescript
// tests/data/constants.ts
export const IDEMPOTENCY_SLUG_PREFIX = 'qa-auto-bk667-';
export const IDEMPOTENCY_TARGETS = ['workspaces', 'projects', 'user-stories', 'atcs', 'bugs'] as const;
export const EARLIER_ADOPTER_TARGETS = ['tests', 'runs'] as const;
export const IDEMPOTENCY_KEY_WINDOW_HOURS = 24;

// tests/data/DataFactory.ts
static createIdempotencyKey(tc: string): string
static createIdempotencyMarker(tc: string): string
static createIdempotentCreatePayload(args: { target: IdempotencyTarget, parents: ParentChain, marker: string }): CreatePayload
static createSignupEmail(): string
```

## 5. Test Scenarios

API files: `beforeAll` -> `IdempotencySteps.createParentChain()`; `afterAll` -> `cleanupParentChains`. Every `test()` title starts with the TC key.

### Wave 1: API, no new credential

#### `tests/integration/idempotency/requireIdempotencyKey.test.ts` · `{ api }` · `@critical`
- `BK-1690: should refuse a <target> create with 400 idempotency_key_required and write nothing when the header is absent` x5.

#### `tests/integration/idempotency/replayIdempotentCreate.test.ts` · `{ api }` · `@critical`
- `BK-1698: should replay the first status and body and keep one <target> when the same key and payload are sent twice` x5.

#### `tests/integration/idempotency/refuseIdempotencyKeyReuse.test.ts` · `{ api }` · `@critical`
- `BK-1701: should answer 409 and not write the second <target> when a key is reused with a different payload` x5.

#### `tests/integration/idempotency/isolateIdempotencyKeyByParent.test.ts` · `{ api }` · `@critical`
- `BK-1705: should answer 409 and create nothing in the second parent when a <target> key is reused under another parent` x4. Two parent chains in `beforeAll`.

#### `tests/integration/idempotency/keepEarlierAdoptersUnchanged.test.ts` · `{ api }`
- `BK-1718: should keep the Idempotency-Key contract of POST /<target> unchanged` x2 (tests, runs).

### Wave 2: needs Q1 / Q2

#### `tests/integration/idempotency/bootstrapWorkspaceWithFreshPat.test.ts` · `{ api }` + own context · `@critical`
- `BK-1715: should create the first workspace over the API when a fresh PAT of an account with no workspace sends an Idempotency-Key`. `openFreshPatContext` in the test body before the ATC is fine here (single row, no sibling rows to sync PASS).

#### `tests/integration/idempotency/expireIdempotencyKey.test.ts` · `{ api }`
- `BK-1700: should create a new <target> when the same key and payload are sent after the key's 24h window` x2 (atcs, bugs).

### Wave 3: needs Q3

#### `tests/e2e/onboarding/onboardNewAccount.test.ts` · `{ ui }` · clean storage · `test.slow()` · `@nightly`
- `BK-1714: should create the first workspace and land in the product signed in when a brand-new account completes onboarding`. Body: `LoginPage.createAccountThroughSignup` (code from `waitForSignupOtp`) -> `OnboardingPage.completeOnboardingCreatingFirstWorkspace`. `afterEach`: soft-delete the new workspace through `page.request` (the new Owner's cookie).

## 6. Implementation Order (one commit per box)

**Wave 1**
- [ ] `bun run api:sync`; facades for the read-back responses
- [ ] `constants.ts` + `DataFactory` additions
- [ ] `IdempotencyApi` (raw send, read-back, 5 Wave 1 ATCs) + `ApiFixture` registration
- [ ] `IdempotencySteps` (parent chain, earlier-adopter seed, cleanup)
- [ ] 5 Wave 1 spec files; run on staging; `bun run kata:manifest`

**Wave 2** (after Q1, Q2)
- [ ] `config.bootstrapUser` (+ `.env.example` / schema names), `openFreshPatContext`, TC26 ATC + spec
- [ ] ADR-0030 (D9, Accepted: `qa_inspector_rw` through `DBHUB_*`); `config.idempotencyDb`, `tests/utils/idempotencyClock.ts`, TC11 ATC + spec

**Wave 3** (after Q3)
- [ ] `config.qaInbox`, `tests/utils/inbox.ts`, `LoginPage.createAccountThroughSignup`, `OnboardingPage` + `UiFixture` registration, TC25 spec

### Complexity per ATC

| ATC | Complexity | Driver |
|-----|-----------|--------|
| BK-1690, BK-1698, BK-1701 | Medium | 5-row target table, read-back per endpoint |
| BK-1705 | Medium | two parent chains, leak check |
| BK-1718 | Medium | 4 behaviours x 2 endpoints, Test/Run seeding |
| BK-1715 | Medium | second identity, PAT lifecycle |
| BK-1700 | High | guarded DB write, credential |
| BK-1714 | High | real inbox, signup, network assertions |

## 7. Success Criteria

- [ ] All in-scope ACs covered plus the beyond-AC checks in `spec.md`
- [ ] KATA compliance (one component per responsibility, no ATC calling ATC, max 2 positional params, alias imports, inline locators)
- [ ] No hardcoded waits; OTP poll and network waits bounded and condition-based
- [ ] No synthetic workspace left alive after a run, also on failure
- [ ] No secret or token value logged or attached
- [ ] Tests pass on staging

## 8. Dependency graph

```
api:sync + facades --> DataFactory/constants --> IdempotencyApi --> IdempotencySteps --> Wave 1 specs
Q2 bootstrap account ----------------------------------------------> BK-1715
Q1 credential + ADR --> idempotencyClock.ts ------------------------> BK-1700
Q3 inbox key --> inbox.ts --> LoginPage helper --> OnboardingPage --> BK-1714
```

## 9. Open questions

| # | Question | Recommended | Alternatives (cost) | Blocks |
|---|----------|-------------|---------------------|--------|
| Q1 | TC11 needs the key row aged past 24 h. Allow a write-capable credential (`qa_inspector_rw`, UPDATE on `public.idempotency_keys` only) in `.env` and CI, guarded as D9? | YES, with the guard and an ADR. Precedent: the user approved the same UPDATE for the BK-1724 retest. **Answered 2026-11-18:** yes, reusing the existing `DBHUB_*` variables (`qa_inspector_rw`) instead of a new variable; see ADR-0030 | (b) Dev adds a test-only TTL hook: product change, contradicts "no change to the retention window" (out of scope). (c) Wait 24 h across two runs: cross-run state, fragile. (d) Mark TC11 not automatable now: the prior-bug guard stays manual | BK-1700 |
| Q2 | TC26 zero-workspace account | A dedicated account a human signs up once through the app's `/login` (real inbox) and never onboards; names `STAGING_BOOTSTRAP_EMAIL` / `STAGING_BOOTSTRAP_PASSWORD` | (b) Reuse `STAGING_LONE_OWNER_*`: collides with BK-946, which also creates and deletes that account's workspace (needs a serial project). (c) Per-run API signup + OTP: needs Q3's inbox and leaves one account per run | BK-1715 |
| Q3 | TC25 brand-new account each run | Provide a Resend API key with receiving access as `QA_INBOX_RESEND_API_KEY` and the receiving domain as `QA_INBOX_DOMAIN`; accept one residual auth account per nightly run | (b) A pre-confirmed zero-workspace account (Q2's) driven through UI onboarding: no inbox, no residue, but the "just confirmed brand-new account" precondition is NOT met, so the ATC would have to be renamed and the TC re-signed. (c) Keep TC25 manual | BK-1714 |
| Q4 | Post-verify landing (R9) | Verify live at Code time; follow the product's redirect | - | BK-1714 detail |
