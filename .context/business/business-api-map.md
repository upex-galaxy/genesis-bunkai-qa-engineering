# Business API Map — Bunkai (upex-bunkai-tms)

> Last verified against OpenAPI on 2026-08-22.

> Discovery performed against `C:\Users\Genesis Ojose\Documents\Auto\Dojo 4\upex-bunkai-tms` (read-only). Narrative complement to `.context/business/business-data-map.md` (data-centric) and `.context/business/business-feature-map.md` (capability-centric, 87-endpoint inventory, CRUD matrix). This document does not restate what those two already express as tables — it explains how the API's auth model and call chains actually deliver each critical journey, and where a QA engineer should look when one of those journeys breaks. Primary new evidence for this pass: `middleware.ts`, `lib/api/handler.ts`, `lib/api/principal.ts`, `lib/api/pat.ts`, `lib/api/middleware/bearer.ts`, `lib/api/capabilities.ts`, `app/api/openapi/route.ts`.

---

## 1. Executive Summary

Bunkai's API lets a QA team run its entire test-management discipline — author a requirement, anchor a reusable test to it, execute that test, and turn a failure into a tracked defect — without ever leaving a single audit trail. A signed-in QA engineer authors a User Story once, builds a library of Acceptance Test Cases against it, chains those ATCs into a Test, and starts a Run; every step's verdict, every bug that verdict spawns, and every later edit to the ATC all stay joined back to where they started. The same set of operations is equally reachable from a human clicking through the browser or from a CI job / AI agent calling the REST API directly with a scoped Personal Access Token (PAT) — the product's own differentiator is that these two callers are structurally the same principal underneath, not two auth systems bolted together.

What the API does NOT yet let the business do is collect money: a full three-tier billing model exists in the schema, but there is no checkout endpoint and no payment webhook anywhere in the codebase (`business-data-map.md` §1, §6). It also does not yet let an `admin`/`owner` remove or re-rank another member through a documented route — member governance beyond invite issuance is either unimplemented or hidden behind an undiscovered Server Action (§9 of `business-feature-map.md`, carried into this document's Discovery Gaps).

The API's most distinctive architectural trait is that authorization is deliberately split into two independent layers that both have to agree before a write lands: an application-layer **capability** check (`atc:read` / `atc:write` / `run:execute` / `workspace:admin`) that gates which route a caller may even reach, and a database-layer **Row-Level Security** policy keyed to `workspace_members.role` that gates which *rows* that caller may touch once inside. A PAT can be minted with a narrower capability set than its holder's role would allow in the UI; RLS is what still stops it from reading another tenant's data even if the capability check were ever misconfigured. Roughly a quarter of the product's `GET` routes currently skip the capability layer and rely on RLS alone (tracked as open debt, BK-499 — carried from `business-feature-map.md` §9) — this is the single fact most worth keeping in mind when writing negative-authorization tests against this API today.

---

## 2. Permission & Auth Model

Bunkai layers two independent auth schemes plus a role dimension. Only capabilities are read/write gates at the API layer; role (`viewer < member < admin < owner`, full definitions in `.context/PRD/user-personas.md` §6-7) is enforced separately — mostly by Postgres RLS, occasionally by an explicit workspace-membership lookup inline in a handler (e.g. token-issuance role gate, `lib/api/pat.ts:51-87`).

| Tier | Who | How to acquire | Where enforced |
|---|---|---|---|
| **Public** | Anyone, unauthenticated | No credential — endpoint posture is `auth: 'public'` | `lib/api/handler.ts:88` (`withApiHandler` skips identity resolution entirely) |
| **Cookie session** | A signed-in browser user (any of the 4 roles) | Password, magic link, or GitHub/Google OAuth via Supabase Auth at `/login` | `middleware.ts` (page routes only — `PROTECTED_PREFIXES`) + `lib/api/principal.ts:66-78` (`resolveIdentity`, SSR cookie path) for API routes |
| **Bearer PAT** | A CLI script, CI job, or AI agent acting *as* a member | `POST /api/v1/tokens`, cookie-only issuance, scoped to a subset of the 4 capabilities | `lib/api/middleware/bearer.ts` (`requireBearerToken` — prefix lookup + SHA-256 hash compare, uniform 401 on any failure mode) |
| **Capability-gated** (`required:<capability>`) | Cookie sessions implicitly hold all 4 capabilities; a PAT holds only what it was minted with | Cookie: automatic. PAT: chosen at `POST /api/v1/tokens` time from `atc:read` / `atc:write` / `run:execute` / `workspace:admin` | `lib/api/principal.ts:84-88` (`requireCapability`), vocabulary owned by `lib/api/capabilities.ts` |
| **Cookie-only** (`auth: 'cookie-only'`) | Browser session only — a Bearer PAT is structurally rejected even if otherwise valid | N/A — this is a restriction, not a grant | `lib/api/handler.ts:90-92`. Used for PAT issuance/revocation itself: "a PAT must not mint a PAT" (ADR-0001) |
| **Workspace role** (`admin`/`owner`) | A `workspace_members.role` value, separate from capabilities | Workspace creation (`owner`) or an invite accepted at a granted role (`admin`/`member`/`viewer` — `owner` cannot be invited, CHECK-constrained at the schema level) | Mix of RLS policies and inline checks (e.g. `assertTokenIssuanceAuthorized`, `lib/api/pat.ts:51-87`) — **not** part of the capability vocabulary above |
| **Row-Level Security (backstop)** | Every principal, regardless of tier | N/A — always active | Postgres RLS policies keyed to `workspace_members.role`; the *sole* tenant-isolation boundary per `business-data-map.md` §2 Rule 2 |

**Cookie-session flow** (browser, the majority of human traffic):

```
Browser                    Supabase Auth              middleware.ts           Route Handler
  |  /login (password /         |                          |                       |
  |   magic-link / OAuth)       |                           |                       |
  |----------------------------->|                          |                       |
  |     session cookie set       |                          |                       |
  |<-----------------------------|                          |                       |
  |                              |                          |                       |
  |  GET /projects (page route)  |                          |                       |
  |------------------------------------------------------->  |                       |
  |                          getUser() refreshes session     |                       |
  |                          isProtected(path) && !user?      |                       |
  |                          --> redirect /login (else pass) |                       |
  |                                                          |----------------------->|
  |  POST /api/v1/... (API route — middleware does NOT gate this path)               |
  |------------------------------------------------------------------------------------>|
  |                                              resolveIdentity(): SSR cookie -> user  |
  |                                              principal.capabilities = ALL 4 (implicit)|
  |                                              RLS still scopes every query to caller's|
  |                                              own workspace_members rows             |
```

**Bearer PAT flow** (CLI / CI / AI agent):

```
Operator                POST /api/v1/tokens          Client / CI / Agent          Route Handler
  |  (cookie session)          |                              |                        |
  |-------- issue PAT -------->|                               |                        |
  |   { scopes, workspace_id?} |                               |                        |
  |     cookie-only posture:    |                               |                        |
  |     Bearer callers 403 here |                               |                        |
  |<---- bk_pat_<prefix>.<secret> (shown once) ------------------|                        |
  |                             |                               |                        |
  |                             |    Authorization: Bearer bk_pat_...                    |
  |                             |------------------------------------------------------->|
  |                             |                     requireBearerToken():               |
  |                             |                       lookup by token_prefix (indexed)  |
  |                             |                       SHA-256(secret) compare           |
  |                             |                       reject if revoked/expired         |
  |                             |                     principal.capabilities = token.scopes|
  |                             |                     requireCapability() per route        |
  |                             |                     impersonatingClient(): mints a short-|
  |                             |                       lived Supabase JWT so RLS applies  |
  |                             |                       identically to the cookie path     |
```

No per-endpoint listing here by design — the full 87-route posture table lives in `business-feature-map.md` §4, generated from the codebase's own `lib/api/route-capability-coverage.snapshot.json`.

---

## 3. Critical Business Journeys

Selected for core-value, security, and blast-radius weight; capped at 7 per doctrine. Billing/checkout is deliberately excluded — no such journey exists in the code yet (`business-data-map.md` §6).

### 3.1 Sign-Up & Workspace Onboarding

Purpose: turn an anonymous visitor into the accountable `owner` of a new tenant — the only door into the product.

```
Client -> Supabase Auth -> Handler (POST /workspaces) -> DB -> Response
  |  authenticate (pwd/magic-link/OAuth)  |                       |          |
  |--------------------------------------->|                       |          |
  |  session cookie                        |                       |          |
  |<----------------------------------------|                       |          |
  |  submit {name, slug}                                            |          |
  |----------------------------------------------------------------->|          |
  |                                              INSERT workspace +  |          |
  |                                              owner membership     |          |
  |                                                                    |-------->|
  |<------------------------------------------------------------- 201 / conflict-|
```

1. User authenticates via password, magic link, or GitHub/Google OAuth — Supabase Auth is the sole identity provider (no separate app-level credential store).
2. Server checks for an active `workspace_members` row; zero membership routes the user to `/onboarding` instead of an empty product.
3. `POST /api/v1/workspaces` creates the Workspace row and an `owner`-role membership atomically — the creator is the only way an `owner` is ever provisioned (invites structurally cannot grant that rank).
4. Slug conflicts surface a friendly 409, not a raw error — the only negative path in this journey.

**Endpoints**: `POST /api/v1/workspaces`. **Entities**: Workspace, WorkspaceMember (`business-data-map.md` §2). **Feature IDs**: FEAT-004.

### 3.2 Author a User Story and Anchor an ATC to It

Purpose: protect the product's structural claim — no test case can exist without a requirement behind it.

```
Client -> Handler (user-stories/ACs) -> RPC (bunkai_atcs_create) -> DB -> Response
  |  create story + ACs   |                          |                |         |
  |----------------------->|                          |                |         |
  |  mark ready_to_test    |                          |                |         |
  |----------------------->|  gate: >=1 active AC?    |                |         |
  |                        |------------------------->|                |         |
  |  create ATC(p_ac_ids)  |                          |                |         |
  |----------------------->|  gate: all AC ids belong |                |         |
  |                        |  to this story?          |                |         |
  |                        |------------------------->| INSERT atc +   |         |
  |                        |                          | atc_acceptance_|         |
  |                        |                          | criterion (atomic)       |
  |                        |                          |--------------->|         |
  |<----------------------------------------------------------------- 201 / 45010 / 45020 --|
```

1. A `member`+ authors a Story and one or more ordered Acceptance Criteria.
2. Marking the Story `ready_to_test` is refused (SQLSTATE `45010`) unless it carries at least one active AC — the Ready-to-Test gate.
3. Creating an ATC is refused (SQLSTATE `45020`) unless every referenced AC belongs to that same Story — there is no window where an orphan ATC can exist, because the check and the insert happen inside one RPC transaction.
4. Any number of Tests can later chain this same ATC (§3.3) — this is the reuse mechanic the whole product is built around.

**Endpoints**: `POST/PATCH /api/v1/user-stories/[id]`, `POST /api/v1/user-stories/[id]/acceptance-criteria`, `POST/PATCH /api/v1/atcs`. **Entities**: UserStory, AcceptanceCriterion, Atc, AtcAcceptanceCriterion. **Feature IDs**: FEAT-014, FEAT-015, FEAT-017, FEAT-018.

### 3.3 Compose a Test Chain and Execute a Run

Purpose: the only path that turns an ATC library into a comparable, reportable result — every downstream coverage/traceability number depends on this.

```
Client -> Handler (tests/runs) -> Realtime channel -> DB (RunAtc/RunStep snapshot) -> Response
  |  build ATC chain -> POST /tests  |                       |                        |         |
  |----------------------------------->|                       |                        |         |
  |  Start run (pick Environment)      |                       |                        |         |
  |----------------------------------->|  POST /runs           |                        |         |
  |                                     |----------------------------------------------->| INSERT running snapshot rows
  |  subscribe to run channel          |                        |                       |         |
  |<----------------------------------- realtime updates ------|                        |         |
  |  mark step (pass/fail/blocked)     |                       |                        |         |
  |----------------------------------->|  reject if run closed (45212)                  |         |
  |  finish / abort                    |                       |                        |         |
  |----------------------------------->|                       |----------------------->| terminal status
```

1. `member`+ picks ATCs from the **workspace-wide** library (not just the current project) into an ordered Test — the reuse surface is deliberately broader than the authoring surface.
2. Starting a Run requires a Project Environment; the server snapshots the chain into `RunAtc`/`RunStep` rows so a later ATC edit never rewrites history already recorded.
3. Each step mark is last-write-wins while the Run is `running`, and structurally rejected (SQLSTATE `45212`) once the Run reaches a terminal status — this is where a race between two testers marking the same step matters most.
4. Finish recomputes the Run's verdict from its steps; Abort requires a reason and is a run-grain-only terminal state.

**Endpoints**: `POST /api/v1/tests`, `POST /api/v1/runs`, `POST /api/v1/runs/[id]/steps/[stepId]/mark`, `POST /api/v1/runs/[id]/finish`, `POST /api/v1/runs/[id]/abort`. **Entities**: Test, TestStep, Run, RunAtc, RunStep, ProjectEnvironment. **Feature IDs**: FEAT-022, FEAT-023, FEAT-025, FEAT-026.

### 3.4 File a Bug from a Failed Run Step

Purpose: the product's core differentiator versus a plain TMS — a defect never loses the execution context that produced it.

```
Client (Runner view) -> Handler (POST /bugs) -> DB -> Response
  |  step marked failed -> "Report bug" button appears (member+, gated client-side)
  |------------------------------------------------------------->|         |
  |  submit pre-filled bug (title/severity/repro/evidence)        |         |
  |--------------------------------------------------------------->|         |
  |                                    re-verify step still failed |         |
  |                                    (independent server check)  |         |
  |                                                                 |-------->|
  |<------------------------------------------------- 201 open / 422 run_step_not_failed --|
```

1. The "Report bug" control is structurally absent unless the caller is `member`+ and the step is currently `failed` — a client-side gate, not merely a disabled button.
2. The server independently re-verifies the step is still `failed` at submit time (422 `run_step_not_failed` otherwise) — a deliberate second check against a race where the step's status changed between page load and submit.
3. The Bug is created `open`, permanently anchored to Module + ATC + Run + RunStep, and its status can then only move forward one stage at a time (`open → in_progress → resolved → closed`), never backward or skipped.

**Endpoints**: `POST /api/v1/bugs`, `POST /api/v1/bugs/[id]/status`, `POST /api/v1/bugs/[id]/assign`. **Entities**: Bug, Run, RunStep, Atc, Module. **Feature IDs**: FEAT-028, FEAT-029.

### 3.5 Invite and Onboard a Team Member

Purpose: the only route by which anyone besides the workspace creator gets provisioned — a security-relevant privilege grant.

```
Admin/Owner -> Handler (POST /invites) -> Invitee -> Handler (POST /invites/accept) -> DB -> Response
  |  issue invite {email, role != owner} |                |                              |         |
  |---------------------------------------|                |                              |         |
  |                                        | opens /invites/accept?token=...              |         |
  |                                        |------------------------------------------------>|         |
  |                                        |                          existing membership   |         |
  |                                        |                          at >= invited rank?    |         |
  |                                        |                          --Yes--> reject_already_member  |
  |                                        |                          --No---> upsert membership       |
  |                                        |                                                  |-------->|
```

1. `admin`/`owner` issues an invite to an email at a chosen role — `owner` is excluded from the choice by a database CHECK constraint, not just UI copy, so it is structurally impossible to invite at that rank.
2. The invitee (possibly signed out) opens the accept link; accepting never demotes an existing higher-or-equal-rank membership — it rejects outright instead (`reject_already_member`).
3. A successful accept upserts the membership at exactly the invited role and redirects into the workspace.

**Endpoints**: `POST /api/v1/workspaces/[id]/invites`, `POST /api/v1/invites/accept`. **Entities**: WorkspaceInvite, WorkspaceMember. **Feature IDs**: FEAT-006.

### 3.6 Issue a Scoped Personal Access Token

Purpose: the credential-issuance path that lets a CI pipeline or AI agent act as a member without ever holding a full session — a security-sensitive control surface in its own right.

```
Client (cookie session) -> Handler (POST /tokens, cookie-only) -> DB -> Response
  |  request {scopes subset of 4, workspace_id?}      |                |         |
  |---------------------------------------------------->|                |         |
  |                            Bearer caller? -> 403 (cookie-only)       |         |
  |                            wants workspace:admin? -> requires        |         |
  |                              admin/owner role in that workspace      |         |
  |                                                                       |-------->|
  |<---------------------------------------------- 201 { token shown once } -------|
```

1. Only a cookie session may mint or revoke a PAT — a Bearer-authenticated caller is rejected outright (`cookie-only` posture) so a token can never bootstrap another token.
2. `workspace:admin` scope requires the caller to hold `admin`/`owner` in that specific target workspace; a global (no-workspace) token with non-admin scopes needs no membership check at all — a deliberate cross-workspace enumeration allowance for headless tooling.
3. The raw secret is shown exactly once; only its SHA-256 hash and a 12-character prefix are persisted, in a sibling table QA/analytics roles cannot read.
4. Every subsequent Bearer call resolves through the same `Principal` shape a cookie session does — RLS applies identically via a short-lived impersonation JWT, so a PAT cannot see more than its holder's own workspace memberships allow regardless of its capability scopes.

**Endpoints**: `POST /api/v1/tokens`, `DELETE /api/v1/tokens/[id]`. **Entities**: AccessToken (PAT). **Feature IDs**: FEAT-008.

### 3.7 Import User Stories from Jira

Purpose: the highest-blast-radius integration in the product — an async, partial-failure-tolerant worker with its own concurrency lock.

```
Client -> Handler (POST /imports, 202) -> Vercel after() worker -> Jira REST -> DB -> Response
  |  submit JQL         |                          |                     |          |         |
  |----------------------|                          |                     |          |         |
  |                      | one active import per    |                     |          |         |
  |                      | project? --Yes--> 409     |                     |          |         |
  |                      | --No--> enqueue, return 202                     |          |         |
  |                      |-------------------------->|                     |          |         |
  |  poll GET /imports/[id] every 2s                 | page by JQL (backoff|          |         |
  |-------------------------------------------------->| on 429 Retry-After)|          |         |
  |                                                    |-------------------->|         |         |
  |                                                    |     upsert stories/ACs        |-------->|
  |<------------------------------------------------------------------------ status: completed/failed --|
```

1. `member`+ submits a JQL string; a second concurrent import for the same Project is rejected with 409 before any row is written — enforced by both a fast-path read and a race-proof unique index, so the client-visible error always matches DB truth.
2. The worker runs in a Vercel Fluid Compute `after()` slot after the 202 response is flushed — the client never blocks on Jira's own response time.
3. Each Jira issue is imported idempotently keyed on `external_id`: a re-run of the same JQL updates title/description but never re-parents a manually-moved Story, and appends only genuinely new Acceptance Criteria text.
4. A per-issue failure is appended to the job's `errors[]` and the job continues; only a fatal error (e.g. invalid Jira credential) fails the whole job — it is never left stuck `running`.

**Endpoints**: `POST /api/v1/imports`, `GET /api/v1/imports/[id]`. **Entities**: ImportJob, UserStory, AcceptanceCriterion, Module. **Feature IDs**: FEAT-016.

---

## 4. Architecture Behind the API

```
Client                Edge                    Handlers                     Services                  Persistence / External
+--------+       +--------------+       +----------------------+     +-------------------+     +--------------------------+
| Browser|------>| Vercel edge  |------>| middleware.ts         |     |                    |     |                          |
| (RSC + |       | network      |       | (PAGE routes only —    |     |                    |     |                          |
| client |       | + Next 15    |       |  redirects signed-out  |     |                    |     |                          |
| forms) |       | routing      |       |  users at PROTECTED_   |     |                    |     |                          |
+--------+       +--------------+       |  PREFIXES)             |     |                    |     |                          |
    |                                    +-----------+-----------+     |                    |     |                          |
    |  Authorization: Bearer bk_pat_...              |                 |                    |     |                          |
    v                                                 v                 |                    |     |                          |
+--------+                              +----------------------+       |                    |     |                          |
| CLI/CI |----------------------------->| withApiHandler()      |------>| lib/<domain>/*.ts  |---->| Supabase Postgres 16     |
| / AI   |    (API routes — separate    | (lib/api/handler.ts): |       | (errors.ts, view-  |     | + RLS (sole tenant       |
| agent  |     gateway from middleware) | request-id, logging,  |       | builders, RPC       |     | isolation boundary)      |
+--------+                              | error envelope,        |       | callers — business  |     |                          |
                                        | resolveIdentity(),      |       | rules + bunkai_*    |     | Supabase Auth (session   |
                                        | requireCapability()     |       | RPC functions)      |     | issuance, OAuth)         |
                                        +-----------+-------------+       +---------+-----------+     |                          |
                                                    |                              |                   | Supabase Realtime        |
                                                    v                              v                   | (Runner WebSocket)       |
                                        +----------------------+       +-------------------+           +--------------------------+
                                        | lib/api/principal.ts  |       | lib/jira/*.ts      |---------->| Atlassian Jira REST      |
                                        | (cookie SSR / Bearer   |       | (import-runner,    |           | (pull-only, backoff)     |
                                        | PAT -> one Principal)  |       | client, adf->md)    |           +--------------------------+
                                        +----------------------+       +-------------------+
```

| Component | Role | Persistence/Integrations touched | Why it matters for QA |
|---|---|---|---|
| `middleware.ts` | Redirects signed-out browsers away from protected **pages** | Supabase Auth (session refresh) | Only gates UI routes — an API-level test suite gets zero protection from this layer; see Discovery Gaps |
| `lib/api/handler.ts` (`withApiHandler`) | The one gateway every `/api/v1` route passes through: request-id, structured logging, uniform error envelope, identity resolution, capability enforcement | None directly — orchestrates the two below | A bug here is systemic, not per-route: it is also what makes "posture" a compile-time-mandatory field, so a missing auth check fails a build, not a pentest |
| `lib/api/principal.ts` + `lib/api/middleware/bearer.ts` | Resolves either a cookie session or a Bearer PAT into one `Principal` shape; mints a short-lived impersonation JWT for PATs so RLS applies identically to both | Supabase Auth (cookie), Supabase Postgres (`access_tokens`/`access_token_secrets` tables) | The cookie/PAT parity guarantee lives entirely here — any negative-auth test that behaves differently for the two callers has found a real bug |
| `lib/<domain>/errors.ts` + `bunkai_*` RPC functions | Business-invariant enforcement (no-orphan-ATC, forward-only Bug lifecycle, Ready-to-Test gate) inside transactional Postgres RPCs | Supabase Postgres | Most of Bunkai's SQLSTATE-coded negative test cases live at this layer, not in the route handler |
| `lib/jira/*.ts` | Async import worker: pull-based JQL search, ADF→Markdown, AC extraction, idempotent reconciliation | Atlassian Jira REST (outbound only) | The only outbound external call with genuine retry/backoff — also the best candidate for eventual-consistency test design (`business-data-map.md` Flow 6 QA note) |
| Supabase Realtime | WebSocket channel the Runner view subscribes to for live step updates | Supabase | A dropped channel degrades to stale UI, not a broken Run — worth an explicit reconnect/poll-fallback test |
| Vercel `after()` compute slot | Executes the Jira import worker after the enqueue response is flushed | Vercel platform | No cron/scheduled work exists anywhere else in the product — this is the sole asynchronous execution path outside a direct request/response |

---

## 5. External Integrations

| Service | Trigger | Direction | Failure mode (user-visible) | Journeys affected |
|---|---|---|---|---|
| Supabase Postgres + RLS | Every authenticated request | Outbound sync | RLS block → generic `forbidden`; outage → 500 with request-id | All journeys (§3.1–3.7) |
| Supabase Auth | `/login` (password/magic-link/OAuth), session refresh in `middleware.ts` | Outbound sync | Invalid/expired session → redirect to `/login` | 3.1 (Sign-Up/Onboarding) |
| Supabase Realtime | Runner view opens a run channel | Outbound async (WebSocket) | Dropped channel → step marks still work via REST but the view goes stale until reconnect | 3.3 (Test/Run execution) |
| GitHub / Google OAuth | `/login` OAuth buttons | Outbound sync (redirect + callback) | Provider denial/error — exact toast/redirect copy not independently verified this pass (see Discovery Gaps) | 3.1 |
| Atlassian Jira (customer-facing) | `POST /api/v1/imports` → background worker pages `searchIssues()` | Outbound async (pull; Jira never calls Bunkai) | Missing/invalid credential → job `status: failed` (`jira_unauthorized`), never an app-boot failure; 429 → exponential backoff honoring `Retry-After` | 3.7 (Jira import) |
| Vercel (`after()` compute) | Fires once per `POST /api/v1/imports` | Platform-internal | Not independently verified: behavior if the compute slot is killed mid-run is unconfirmed (see Discovery Gaps) | 3.7 |
| Resend (transactional email) | Declared (`RESEND_API_KEY` in `.env.example`) | N/A | **No code path calls it** — confirmed unwired; a notification preference set to `email` currently sends nothing | None currently (planned) |
| Stripe/PayPal or any payment SDK | N/A | N/A | **Confirmed absent** — no checkout journey exists to fail | None |

---

## 6. Cross-References

- **Entities**: `.context/business/business-data-map.md` §2 (Entity Map), §4 (State Machines — Bug forward-only lifecycle, Run/RunAtc/RunStep snapshot-freeze, ImportJob).
- **Features**: `.context/business/business-feature-map.md` §2 (Feature Catalog by Domain, FEAT-001–045), §4 (full 87-endpoint inventory with auth posture per route), §9 (Discovery Gaps, including the BK-499 capability-scope debt this document cites in §1 and §2).
- **Roles/personas**: `.context/PRD/user-personas.md` §6-7 (Role Hierarchy, Permission Matrix).
- **OpenAPI spec**: generated by `@asteasolutions/zod-to-openapi` from `lib/openapi/registry.ts` (target repo) via `bun run openapi:gen` → `public/openapi.json`; served live at `GET /api/openapi` (`app/api/openapi/route.ts`, static-prerendered) and rendered interactively at `/api/docs` (Scalar UI).
- **TypeScript types for this repo's own test suite**: `bun run api:sync` (this repo's `scripts/sync-openapi.ts`) writes generated types into `api/schemas/` (currently `auth.types.ts`, `example.types.ts`, `index.ts`).

---

## 7. Discovery Gaps

- **Page-route auth and API-route auth are two structurally separate gateways.** `middleware.ts`'s `PROTECTED_PREFIXES` list (`/home`, `/projects`, `/onboarding`, `/settings`, `/activity`) governs only browser navigation; `/api/v1/**` is never touched by it and is instead gated entirely inside `withApiHandler`/`resolveIdentity`. This is consistent by design (confirmed by reading both), but it means an API-only test suite gets no coverage from `middleware.test.ts`, and a page-route regression cannot be assumed to reflect an API-route regression or vice versa.
- **BK-499 capability-scope debt** (carried forward, not re-derived): ~20 of 87 endpoints are posture `authenticated` rather than `required:<capability>`, covering identity/notifications, reporting reads, runs/tests reads, and workspaces/membership. RLS remains the real isolation boundary underneath, but any negative-authorization test plan should treat these routes as coarse-grained by design, not yet capability-scoped. Full cluster list: `business-feature-map.md` §9.
- **WorkspaceMember has no discovered admin remove-member/change-role route** (carried forward) — only self-leave (`DELETE /api/v1/workspaces/[id]/membership`) was found. Could not be resolved from a read-only pass whether this is a genuine product gap or an undiscovered Server Action; needs team clarification before writing a membership-management test plan.
- **OAuth callback error handling was not independently re-verified in this pass.** `lib/auth/oauth.ts` and `oauth-buttons.tsx` are referenced by upstream discovery but their exact toast/redirect behavior on a provider denial or error was not read directly here — the failure mode listed in §5 for GitHub/Google is inferred, not confirmed.
- **Vercel `after()` compute-slot failure mode for the Jira import worker is unconfirmed.** No evidence was found (in this pass or upstream) describing what happens to an `ImportJob` row if the Fluid Compute slot is terminated mid-run rather than completing or hitting Jira's own error path — worth a dedicated exploratory session before relying on the worker's resilience claims for anything beyond the documented 401/429 cases.
- **No webhook receiver exists anywhere in the codebase** (`grep -i webhook` returns no matches, reconfirmed this pass) — the Jira integration is strictly outbound-pull, and no payment or other inbound webhook exists to test.
- **Single shared Supabase project across local/staging/production** (carried forward from `business-data-map.md` §7): every journey in §3 above resolves against the same physical database in every environment — any API test that mutates data must be workspace-scoped and cleanup-aware regardless of which environment it targets.

---

*Business API Map complete. Cross-referenced against `.context/business/business-data-map.md`, `.context/business/business-feature-map.md`, `.context/PRD/user-personas.md`, and `.context/PRD/user-journeys.md`. New code evidence this pass: `middleware.ts`, `lib/api/handler.ts`, `lib/api/principal.ts`, `lib/api/pat.ts`, `lib/api/middleware/bearer.ts`, `lib/api/capabilities.ts`, `app/api/openapi/route.ts`.*
