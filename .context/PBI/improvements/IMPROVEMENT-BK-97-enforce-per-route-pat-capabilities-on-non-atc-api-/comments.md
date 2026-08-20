# Comments for BK-97

[View in Jira](https://jira.upexgalaxy.com/browse/BK-97)

---

### Ely - 21/6/2026, 16:01:53

Consolidating [https://jira.upexgalaxy.com/browse/BK-168#icft=BK-168](https://jira.upexgalaxy.com/browse/BK-168#icft=BK-168) into this ticket (duplicate). Scope from [https://jira.upexgalaxy.com/browse/BK-168#icft=BK-168](https://jira.upexgalaxy.com/browse/BK-168#icft=BK-168):

Audit and enforce capability scopes across non-ATC write endpoints. The ATC domain enforces capabilities via requires:[] on withApiHandler (~10 routes); non-ATC writes (projects, environments, modules, user stories, acceptance criteria, tests beyond search — ~15-20 routes) have NO capability gate, relying on RLS + workspace_members role checks only. A PAT is therefore not constrained by its scopes outside the ATC domain.

Design-first: audit which operation needs which scope; decide whether new scopes are needed (e.g. projects:write) or the existing vocabulary suffices; apply requires:[] gates + the assertWorkspaceContext workspace_id match (lib/api/principal.ts, added in [https://jira.upexgalaxy.com/browse/BK-167#icft=BK-167](https://jira.upexgalaxy.com/browse/BK-167#icft=BK-167)); consolidate the scope vocabulary, currently duplicated in lib/api/pat.ts, lib/api/principal.ts, app/api/v1/tokens/route.ts and migration 0008.

Depends on the enforcement model in ADR-0006 (Accepted) and builds on the issuance fix in ADR-0005 (Accepted, [https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135](https://jira.upexgalaxy.com/browse/BK-135#icft=BK-135)). The workspace:admin slice was already done in [https://jira.upexgalaxy.com/browse/BK-167#icft=BK-167](https://jira.upexgalaxy.com/browse/BK-167#icft=BK-167) (FIXED).

AC:

- Each non-ATC write endpoint has a documented required capability (or a justified exemption); scope vocabulary has a single source of truth.
- A read-scoped PAT calling a non-ATC write endpoint returns 403.

---

### Ely - 26/6/2026, 00:01:06

## 🤖 Curación de campos QA (estándar Bunkai)

| ***Campo**** | ****Valor**** | ****Justificación*** |
| --- | --- | --- |
| Componentes | Tenancy & Identity | El alcance es la aplicación de capacidades (scopes) del PAT por ruta; es un asunto de autenticación/identidad de tokens. |
| Épica padre | [https://jira.upexgalaxy.com/browse/BK-183#icft=BK-183](https://jira.upexgalaxy.com/browse/BK-183#icft=BK-183) (Defect Management) | Reparentado al épica de gestión de defectos según estándar. |
| Severidad | Moderada | No es fuga cross-tenant (RLS confina al usuario); el PAT solo puede lo que el usuario ya podía. Impacto medio según el propio ticket. |
| Prioridad | Medium | Alineada a severidad Moderada. |
| Tipo de error | Security | Un PAT de scope estrecho conserva más poder del que su scope implica: gap de control de autorización por token. |
| Causa raíz | Code Error | El texto lo establece: las rutas no-ATC migraron con requires:[] y no validan los scopes del token (gap de implementación en código). |
| Entorno | Staging | Trabajo de hardening sobre staging. |
| Frecuencia | (sin cambios) | Campo no tocado por política. |

---

### Ely - 6/8/2026, 07:37:16

## AI Product Owner — Decision: PAT capability vocabulary (BK-97)

> ***Attribution.**** Produced by the AI Product Owner / Business Analyst profile under CLAUDE.md Critical Rule #18, which grants this profile authority over product, business and scope calls. This is ****not*** a human PO sign-off. A human may overturn it at any time.

### Decision

***Keep the existing four scopes exactly as they are — ****`atc:read`****, ****`atc:write`****, ****`run:execute`****, ****`workspace:admin`**** — and redefine their published meaning from "the ATC entity" to "the domain class of operation".**** Every authenticated `/api/v1` route then declares an explicit `requires: [...]` drawn from that four-value set, except a short, ****named and closed*** allowlist of self-service identity routes that carry no domain capability.

No new scope names are coined, so the `scopes` CHECK in `0008*access*tokens.sql:34-36` does ***not*** widen. BK-97 ships as 100% code, zero migrations, zero live-token invalidation.

| Scope | Final published meaning |
| --- | --- |
| `atc:read` | Read any test-asset or project data in reachable workspaces — ATCs, Tests, modules, user stories, acceptance criteria, projects, milestones, environments, bugs, runs, coverage, metrics, activity. |
| `atc:write` | Create / update / delete test assets and the project structure holding them — ATCs, Tests, bugs, modules, user stories, acceptance criteria, projects, milestones, environments, imports. |
| `run:execute` | Start a Run, mark step results, abort or finish a Run. Execution actions only, never reads. |
| `workspace:admin` | Administer an existing workspace — settings, members, invites. Bound to the token's own `workspace_id` (ADR-0005 / ADR-0006). |

### Alternatives considered and scored

Scored 1-5 per criterion, 30 max.

| Candidate | Product value | Least-privilege | Precedent | Impl cost | Reversibility | Usability | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***A. Keep 4, redefine as domain-verbs + exemption allowlist**** | 4 | 3 | 5 | 5 | 5 | 4 | ****26*** |
| B. Full `resource:action` matrix (~14 scopes) | 5 | 5 | 2 | 1 | 1 | 2 | 16 |
| C. Keep 4 + add 2 targeted (`import:run`, `project:write`) | 4 | 4 | 3 | 3 | 2 | 3 | 19 |
| D. Coarse tiers `read` / `write` / `admin` | 3 | 2 | 1 | 2 | 1 | 5 | 14 |

***Why B loses.*** Strongest least-privilege model on paper, worst product decision available today. It needs a CHECK migration, supersedes the four names every live token carries, forces a rework of the frozen BK-85 token mockup (`bk-85-account-settings/settings-tokens.html:1012-1020` hardcodes exactly four checkboxes with their copy) and therefore a §5 divergence plus an ADR under Critical Rule #15, and hands the user a 14-checkbox form they cannot fill correctly without reading the route table. Bunkai has one PAT consumer class — the Karim persona (CLI / AI agent / CI, `business-api-map.md:17`) — who wants "can read the library, can run tests", not "can PATCH a milestone but not a module". The granularity has no buyer.

***Why C loses.**** Two extra names buy a marginal gain and pay B's full structural price anyway: CHECK migration, mockup divergence, UI copy rework, and a vocabulary where a token minted last week silently lacks a scope now gating a route it used to reach. If `import:run` is ever genuinely needed, adding one scope additively is cheap ****then***; speculatively now it is not.

***Why D loses.**** Most usable, least defensible. It renames all four scopes, so ****every already-minted token becomes invalid at the CHECK level*** — the single most expensive thing this ticket could do. It also collapses `run:execute` into `write`, destroying a distinction that already has teeth: a CI agent that may report step results but must not edit the ATC library is a real, shipped capability.

***Why A wins.*** The only candidate whose delta from "today" to "correct" is purely additive `requires: [...]` lines. It preserves every live token, the frozen mockup, the QA guide, and the ADR-0005/0006 issuance and workspace-binding machinery. Its one weakness — coarser granularity than B — is a limit on a capability nobody has asked for.

### Rationale

***The ****`atc:**`*** prefix already means "test-asset domain", not "the ATC entity". This is shipped behaviour, not a reinterpretation invented here.**** `app/api/v1/tests/route.ts:46` gates a Test list on `atc:read` and `:119` gates Test creation on `atc:write` — and the glossary is explicit that a Test is ****not**** an ATC (`domain-glossary.md:60`: an E2E Test is an assembled chain of ATC references). `app/api/v1/bugs/route.ts:210` gates bug filing on `atc:write`. `workspaces/[id]/coverage/route.ts:75` and `recent-projects/route.ts:68` gate workspace-level reads on `atc:read`. The published QA contract states it outright — `app/qa/qa-config.ts:625` defines `atc:read` as "Leer ATCs, steps, assertions, ****modules, user stories, AC***". The vocabulary was always domain-scoped; only the ADR-0001 note and this ticket's text read it entity-literally. This decision ratifies what the code and the QA guide already say, and fixes the UI copy to match.

***Scope names must not contradict the glossary — and A is the only candidate that cannot.**** `domain-glossary.md` §0 is emphatic that ATC means Acceptance Test Case. Coining `library:**` or `project:**` introduces new domain nouns requiring a glossary change protocol entry. Keeping the four identifiers and correcting their ****description*** leaves the glossary untouched.

***The ticket's route census is wrong and understates the work.**** Enumerated directly: ****63 route files****, not "~18 non-ATC routes". 8 are `auth: 'public'`, 20 fully capability-gated, 2 partially gated (`bugs` POST gated / GET not; `workspaces/[id]` PATCH gated / GET not), and ****33 fully ungated****. At handler granularity: ****25 gated entries**** vs ****48 running ****`requires: []`. The `workspace:admin` slice the ticket describes as missing is in fact already live — BK-167 / ADR-0006 shipped it on `workspaces/[id]` PATCH and all four invite handlers, after ADR-0001 was written. After the exemption allowlist, ****35 handler entries need a new ***`requires`.

***The gateway is AND-only, which shapes one call.**** `lib/api/handler.ts:77-78` loops `requires` and calls `requireCapability` for each, so a route cannot express "atc:read OR run:execute". Consequence: run-domain reads (`GET /runs/[id]`, `GET /tests/[id]/runs`, `GET /projects/[id]/runs/report`) require `atc:read`, meaning `run:execute`**** is an action scope, not a standalone profile*** — an execution agent needs `atc:read` + `run:execute`. Precedent already accepts this (`workspaces/[id]/active-runs/route.ts:75`). `DEFAULT*PAT*SCOPES` (`lib/api/pat.ts:24-28`) grants both, so every headless-minted token is unaffected. UI and QA copy must state the pairing.

***Not every route should carry a domain capability.**** Gating `GET /me` or `GET /workspaces` on `atc:read` would break workspace resolution for a token legitimately holding only other scopes — precisely the failure class of BK-182 (bearer run creation could not resolve the active workspace). Identity and per-user notification state are not workspace domain data and get a ****named, enumerated exemption***, so `requires: []` stops being a silent default and becomes a reviewable allowlist.

### Route to capability mapping

`atc:read` — domain reads. New gates: `/activity`, `/bugs` GET, `/imports/[id]`, `/modules/[id]/user-stories` GET, `/user-stories/[id]` GET, `/user-stories/[id]/acceptance-criteria` GET, `/acceptance-criteria/[id]` GET, `/projects/[id]/bugs`, `/projects/[id]/bugs/heatmap`, `/projects/[id]/coverage`, `/projects/[id]/environments` GET, `/projects/[id]/metrics/recovery-cycles`, `/projects/[id]/milestones` GET, `/projects/[id]/runs/report`, `/runs/[id]` GET, `/tests/[id]` GET, `/tests/[id]/runs`, `/workspaces/[id]` GET. Already gated: `/atcs/search`, `/atcs/[id]/usage`, `/tests` GET, `/workspaces/[id]/{active-runs,coverage,open-bugs,recent-projects}`.

`atc:write` — domain and structural writes. New gates: `/imports` POST, `/projects/[id]/modules` POST, `/modules/[id]` PATCH+DELETE, `/modules/[id]/user-stories` POST, `/user-stories/[id]` PATCH+DELETE, `/user-stories/[id]/acceptance-criteria` POST, `/acceptance-criteria/[id]` PATCH+DELETE, `/projects/[id]/environments` POST, `/environments/[id]` PATCH+DELETE, `/projects/[id]/milestones` POST, `/milestones/[id]` PATCH, `/workspaces/[id]/projects` POST, `/workspaces` POST. Already gated: `/atcs` and its `[id]` / `duplicate` writes, `/tests` POST, `/tests/[id]/reorder`, `/tests/[id]/tags`, `/bugs` POST, `/bugs/[id]/assign`, `/bugs/[id]/status`.

> `POST /workspaces` creates a ***new*** tenant, so `workspace:admin` is the wrong gate — a workspace-bound admin token spawning a different workspace is exactly the escalation ADR-0006 closed, and ADR-0005 forbids a global admin token. Gated on `atc:write`; it is the one write that intentionally does not pair with `assertWorkspaceContext`.

`run:execute` — all already shipped: `/runs` POST, `/runs/[id]/abort`, `/runs/[id]/finish`, `/runs/[id]/steps/[stepId]/mark`.

`workspace:admin` — all already shipped: `/workspaces/[id]` PATCH, `/workspaces/[id]/invites` POST+GET, `/workspaces/[id]/invites/[inviteId]` POST+DELETE.

***No capability — named self-service exemption allowlist (closed; additions need PO sign-off).*** `/me` GET (token introspection, every token must reach it), `/me/active-workspace` POST and `/workspaces` GET (workspace resolution — gating these regresses the BK-182 class), `/notification-preferences` GET+PATCH, `/notifications/[id]/read`, `/workspaces/[id]/notifications`, `/workspaces/[id]/notifications/read-all` (per-user inbox state), `/tokens` POST+GET and `/tokens/[id]` DELETE (already bearer-rejected per ADR-0001), `/workspaces/[id]/membership` DELETE (already `assertSessionOnly`, BK-90 self-leave), `/invites/accept` POST (identity/onboarding acting on the caller's own membership).

***Public, unchanged******:**** `/health`, `/` API index, and the six `/auth/**` endpoints.

### Already-minted tokens

No scope names are coined or removed, so ***no live token becomes structurally invalid***. There is still a real behaviour change: a token minted `['atc:read']` can create modules today and will get 403 tomorrow. That is the defect being fixed, but it is a breaking change and needs a deliberate call.

| Option | Security closure | User disruption | Impl cost | Honesty of the scope contract | ***Total /20*** |
| --- | --- | --- | --- | --- | --- |
| ***1. Enforce immediately, no grandfathering**** | 5 | 4 | 5 | 5 | ****19*** |
| 2. Grandfather pre-BK-97 tokens (legacy flag / auto-widen) | 1 | 5 | 2 | 1 | 9 |
| 3. Force re-mint (revoke all pre-BK-97 tokens) | 5 | 1 | 3 | 5 | 14 |

***Decision******:****** Option 1.**** The blast radius is near zero. `DEFAULT*PAT*SCOPES` (`lib/api/pat.ts:24-28`) already grants `atc:read` + `atc:write` + `run:execute` to ****every**** token minted through the headless paths (signin, signup, confirm), which is the overwhelming majority of the live population; those lose nothing. The only tokens that change behaviour are ones a human deliberately narrowed — and for those, losing the loophole ****is the feature they asked for***. Option 2 fails on its own terms: it keeps the vulnerable population alive permanently behind a legacy flag nobody will retire, and makes the scope list a lie for exactly the users who cared enough to narrow it. Option 3 buys nothing Option 1 does not, at the cost of breaking every working integration.

Two product obligations ride with this:

1. ***Release note, not a silent flip.*** Ship with: "PAT scopes are now enforced on every route. A token narrower than its usage will start returning 403 — re-mint with the scopes you need." Silent enforcement turns a security fix into a support incident.
2. ***Fix the UI and QA copy in the same PR.**** `components/settings/IssueTokenModal.tsx:46-51` and `app/qa/qa-config.ts:625-628` describe the scopes in ATC-entity terms. They must state the domain-wide meaning and the `atc:read` + `run:execute` pairing for execution agents. This is copy inside existing elements, so it is ****not*** a mockup divergence under Rule #15 — the four-checkbox structure is preserved exactly.

### Consequences

- ***Migration******:****** NO.*** The CHECK at `0008*access*tokens.sql:34-36` stays byte-identical. BK-97 is 100% code, as the ticket's own decision tree predicts for the reuse branch.
- ***Change surface******:*** 35 handler entries across 33 files gain `requires: [...]`; 13 entries join the documented exemption allowlist.
- ***Consolidation******:*** the four-value vocabulary is currently duplicated across `lib/api/pat.ts:12-19`, `lib/api/principal.ts:31`, `app/api/v1/tokens/route.ts:27` and the migration comment at `0008:59-60`. Collapse to a single exported source of truth as part of this ticket (absorbing the BK-168 scope).
- ***What breaks******:*** narrowly-scoped PATs lose write access outside ATC. Intended. Nothing breaks for default-minted tokens.
- ***What does not change******:*** cookie sessions (they hold `ALL_CAPABILITIES`, `principal.ts:69`), RLS isolation, ADR-0005 issuance role-gate, ADR-0006 workspace-context binding, the frozen BK-85 mockup, the glossary.
- ***Follow-ups******:**** mark ADR-0001's KNOWN LIMITATION (`:14`) resolved with a pointer to BK-97; record the domain-verb reading of `atc:**` and the exemption allowlist in an ADR, since a future reader will otherwise re-litigate why `atc:write` gates a milestone; confirm ***BK-168 stays ABORTED*** with its scope absorbed here.
- ***Deferred, not decided******:*** finer granularity (`import:run`, `project:write`) is additive and cheap later. Revisit only when a real consumer asks.

### Handed to AI Tech Lead

Whether to add `requiresAny` (OR semantics) to `WithApiHandlerOptions` so run-domain reads can accept `atc:read` OR `run:execute` — the product rule is decided (`run:execute` pairs with `atc:read`); whether the gateway should support OR is an architecture call. Also: the shape of the single-source-of-truth consolidation; whether `POST /invites/accept` should become session-only like `/tokens` (ADR-0001 flagged it at `:101` "Confirm during planning" and never closed it); the test strategy; and whether `assertWorkspaceContext` should extend to newly gated `atc:write` routes or stay scoped to the admin surface as ADR-0006 defined.

Decided autonomously by the AI Product Owner profile under CLAUDE.md Critical Rule #18. No human PO sign-off is implied.

---

### Ely - 6/8/2026, 07:37:17

## AI Tech Lead — Decision: enforcement shape for per-route PAT capabilities (BK-97)

> ***Attribution.**** Produced by the AI Tech Lead profile under CLAUDE.md Critical Rule #18, which grants this profile authority over schema, API-contract, auth-enforcement and migration-shape calls. This is ****not*** a human sign-off. Run independently of the AI Product Owner decision above; the two converged.

### Decision

Enforce capabilities ***at each ****`withApiHandler`**** call site****, exactly as the ATC routes already do, and make the declaration ****structurally unskippable*** by tightening `WithApiHandlerOptions` (`lib/api/handler.ts:40-49`) from `requires?: string[]` into a mandatory discriminated union over four explicit auth postures, backed by a filesystem-driven coverage snapshot test.

***No migration is required****: the existing four-scope vocabulary is reused, so the CHECK at `0008*access*tokens.sql:34-36` is untouched and no already-minted token is invalidated. This is ****story-shaped, not bug-shaped**** — 48 handler entries need a capability decision and the type change touches all 81 call sites, so it ships as a ****five-slice chain***, not one PR.

This ***upholds and does not revisit**** ADR-0006, which already ratified TS-layer enforcement via `requires` + `assertWorkspaceContext` and explicitly names this ticket's scope as its follow-up. Only the **durability* question — how a new route is forced to declare — is decided fresh here.

### Route inventory (measured, not assumed)

The ticket's "~18 route files" is stale. Actual surface: ***63 route files, 81 exported handler entries***.

| Posture | Handlers | Notes |
| --- | --- | --- |
| `auth: 'public'` | 8 | health, `/v1` index, 6 auth endpoints |
| `auth: 'required'` ***with*** a capability | 25 | ATC (10), runs (4), workspace:admin (5), tests/reads (6) |
| `auth: 'required'` ***with no capability**** | ****48*** | the gap |

The 48-handler gap: ***20 reads****, ****21 writes****, ****7 identity/session-plumbing***. Two handlers — `tokens` POST (`app/api/v1/tokens/route.ts:36`) and `tokens/[id]` DELETE (`:21`) — hand-roll `principal.via === 'bearer'` rejection inside the handler body. That is a fourth posture the options type does not currently express.

### Alternatives considered and scored

| Candidate | Correctness / auditability | Precedent (ADR-0001/0006) | Migration risk | Impl cost | Reversibility | Failure mode | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Per-route sweep, `requires` stays optional | 2 | 5 | 5 (none) | 4 | 5 | 1 (***fail-open***) | 22 |
| B. Centralized route to capability map | 4 | 2 | 5 (none) | 3 | 3 | 3 | 20 |
| C. Middleware-level enforcement | 3 | 1 | 5 (none) | 2 | 4 | 2 (***fail-open***) | 17 |
| ***D. Per-route + type-level default-deny + coverage snapshot**** | 5 | 5 | 5 (none) | 3 | 4 | 5 (****fail-closed at compile time****) | ****27*** |

***A rejected.**** It is what the ticket literally asks for and it fixes today's 48 routes, but it is a one-time sweep with nothing holding it. `requires?: string[]` stays optional, so route number 82 ships with no capability and nothing goes red. That is the identical failure that produced this ticket: ADR-0001 shipped its migration correctly and the gap opened anyway ****because the declaration was optional***. Fixing the instances without fixing the optionality is a symptom fix, not a root-cause fix.

***B rejected.*** A map keyed on path strings is a second authorization surface beside `requires` — precisely the "do not run two wrappers" reasoning ADR-0001 used to reject a parallel gateway. It must also re-derive dynamic segments (`[id]`, `[stepId]`) from request URLs Next has already parsed, and a pattern that quietly stops matching after a rename degrades to whatever the default is. Its one real win (a single file to audit) is captured by D's committed snapshot without a runtime lookup that can miss.

***C rejected, hardest.*** Next middleware runs on the Edge runtime; `resolveIdentity` (`lib/api/principal.ts:45-74`) pulls `server-only`, the SSR cookie client, a DB lookup by token prefix, and `crypto.subtle` hashing. Middleware would have to duplicate PAT verification or resolve identity a second time, so the thing that authorized the request and the thing that executes it become two resolutions that can diverge. It also moves enforcement off `withApiHandler`, contradicting ADR-0001's central finding that the universal wrapper already exists and should be extended. Matcher gaps are invisible — same fail-open shape as A.

***D chosen.*** Keeps enforcement where ATC, runs and the ADR-0006 admin slice already put it (no new mechanism, no second surface), and moves the cost of forgetting from "permissive route in production" to "red `types:check` locally" — the same prevent / detect / verify posture ADR-0001 chose for authentication. It scores lowest of the four only on implementation cost, which is honest: the union change touches every call site.

### Rationale

***The "open product decision" the ticket says to do first is already closed by a published contract.**** `app/qa/qa-config.ts:625` documents `atc:read` to QA users as covering "ATCs, steps, assertions, ****modules, user stories, AC****", and `:626` documents `atc:write` as create/update/delete over the same domain. The authoring routes in the gap are exactly that set. Expanding the vocabulary would contradict shipped documentation, force a CHECK migration, and desynchronize four declaration sites that ADR-0006's follow-up asks to ****consolidate***, not multiply. Reuse wins on documentation grounds, not merely cost grounds — and that is what makes the whole ticket zero-DB.

***Two mapping calls fall out of a bootstrap constraint, and the obvious answer is wrong.**** `POST /workspaces` must ****not*** require `workspace:admin`: `assertTokenIssuanceAuthorized` (`lib/api/pat.ts:56-61`) refuses to mint an admin-scoped token without an existing workspace where the caller is already admin, so gating creation on that scope is an unsatisfiable deadlock. The same reasoning routes `POST /workspaces/[id]/projects` to `atc:write`, and `DELETE /workspaces/[id]/membership` to the no-capability posture, since a plain member must be able to leave.

***ADR-0006's ****`requires: ['workspace:admin']`**** + ****`assertWorkspaceContext`**** pairing needs no new call sites.*** The five existing sites are correct, and the four routes that deliberately skip it already carry in-line justification (`active-runs/route.ts:28`, `recent-projects/route.ts:23`, `open-bugs/route.ts:30`, `coverage/route.ts:33`). BK-97 adds no admin-scoped routes, so that invariant is untouched.

### Implementation shape

***1. The type change (****`lib/api/handler.ts:40-49`****) — the durable part******:***

```ts
export type Capability = typeof ALL_CAPABILITIES[number];   // single source of truth
type NonEmpty<T> = readonly [T, ...T[]];

export type WithApiHandlerOptions =
  | { auth: 'public' }
  | { auth: 'cookie-only' }                                  // PAT structurally rejected
  | { auth: 'authenticated', why: string }                   // no capability, must be justified
  | { auth: 'required', requires: NonEmpty<Capability> };
```

Four holes closed. `auth` becomes mandatory, so the `options: WithApiHandlerOptions = {}` default at `:63` disappears and a new route cannot compile without stating its posture — all 81 existing call sites already pass an explicit object (verified), so nothing relies on the default. `NonEmpty` makes `requires: []` a type error, closing the "declare an empty array to satisfy the compiler" escape. `Capability` replaces `string[]`, so a typo like `'atc:writ'` fails to compile, and `AccessTokenScope` (`lib/api/pat.ts:12`) collapses into `ALL_CAPABILITIES` (`lib/api/principal.ts:31`), removing one of the four duplicated vocabularies. `why: string` makes the escape hatch cost a sentence a reviewer reads, and is greppable, so the no-capability set is always enumerable.

`auth: 'cookie-only'` lifts the hand-rolled `via === 'bearer'` checks out of the two token routes into the gateway, where ADR-0001's "a PAT must not mint a PAT" exception belongs.

***2. Representative call site*** — `app/api/v1/projects/[id]/modules/route.ts:34`, currently uncovered:

```ts
}, { auth: 'required', requires: ['atc:write'] });
```

Identical in shape to `app/api/v1/atcs/route.ts:49`. ***No handler body changes anywhere in the sweep.***

***3. Anti-rot for new routes — three layers, prevent then detect******:***

- ***Compile time (primary)******:*** the union above. A new route with no posture is a build failure, not a permissive endpoint. This is the piece that makes it a root-cause fix.
- ***Test time (auditability)******:**** `lib/api/route-capability-coverage.test.ts` walks `app/api/v1/***/route.ts` on disk, extracts every exported handler and its posture, and diffs against a committed snapshot. A new route fails the suite until the snapshot is regenerated, and the snapshot is the single file a reviewer reads to see all 81 handlers at once — the one genuine advantage candidate B had.
- ***Lint (optional)******:*** extend the `no-restricted-syntax` block at `eslint.config.js:108-114` to flag `auth: 'authenticated'` without a non-placeholder `why`. Largely subsumed by the type.

***4. DDL******:****** none.**** The vocabulary is unchanged, so `access*tokens*scopes*allowed` stays as written. For the record: had the vocabulary expanded, the correct shape would have been ****ADDITIVE**** — `alter table ... drop constraint access*tokens*scopes*allowed, add constraint ... check (scopes <@ array[<old four>, <new>]::text[])`, widening the accepted set. Dropping-then-re-adding a CHECK on a live table is additive ****only**** when the new array is a strict superset; removing or renaming any of the four existing values would be ****DESTRUCTIVE***, invalidating every already-minted token carrying that value and requiring a backfill.

***5. Already-minted tokens******:****** nothing happens at the storage layer.**** No migration, no backfill, no re-mint, no revocation. Every `access*tokens.scopes` row is read as-is; the only change is at read time in `requireCapability` (`lib/api/principal.ts:79-83`). Blast radius is precisely bounded: because the sweep adds ****zero**** new `workspace:admin` gates, every token minted with `DEFAULT*PAT*SCOPES` (`lib/api/pat.ts:24-28`) loses ****nothing at all***. Only deliberately narrowed tokens change behaviour. Cookie sessions are unaffected — they hold `ALL*CAPABILITIES` (`principal.ts:69`).

### Migration classification

***No migration.*** Classification is moot for this ticket; the numbers are recorded so a later slice need not re-derive them.

***Next available number******:****** ****`0066`, taken from the ****live ledger**** via Supabase MCP `list*migrations` on project ref `fmbpikzpkafptqximhxn` (66 rows). Highest by ****name**** is `0065*atc*tags*cap*guard` (`20260806060122`). Newest by ****timestamp**** is `20260806094556 / 0058*atc*title*min*length`, and the ledger holds several other out-of-order pairs (`0046*bugs` lands after `0050`; `0047` precedes `0046`; `0059/0060/0061` interleave). ****Sorting by timestamp would have produced ****`0059`**** and collided.*** A directory listing is not authoritative either — `0058` was historically applied twice under different numbers.

Applying nothing means `autonomous_delivery.migrations: autonomous` is not engaged. Had the CHECK needed widening, the shape above is ADDITIVE and would qualify as unattended-safe under that config. Per Critical Rules #4 / #5 / #13, nothing is applied by this decision.

### Test strategy

A 403 against a mocked principal proves the mock returned 403. The contract test must mint a real token and observe the database.

***Primary — real production write path with a real narrow-scoped PAT.*** New `lib/api/capability-enforcement.test.ts`, built on the harness in `lib/api/auth-coexistence.test.ts`, which already seeds a real user via the service client (`:81-94`), mints a genuine PAT through the real `mintPat` (`:112-118`), and drives the real `resolveIdentity` with a real `NextRequest` (`:56-60`, `:122`). Same env guard, same `afterAll` cleanup (`:96-106`).

Three assertions per protected write, using `POST /api/v1/projects/[id]/modules` as the reference case:

1. ***Negative with side-effect proof.**** Mint a PAT scoped `['atc:read']` only. Import the route module's real exported `POST` and invoke it with that Bearer. Assert `403`, ****and*** assert via an independent service-role client that the `modules` row count for the target project is unchanged. The row assertion is the part that survives refactoring — a 403 alone also passes when the route is simply broken.
2. ***Positive control.**** Mint `['atc:read','atc:write']`, call the identical handler with an identical body, assert `2xx` ****and*** that the row now exists. Without this, assertion 1 is satisfied by any failure whatsoever and proves nothing about the gate specifically.
3. ***Cookie non-regression.*** The same operation through a principal holding `ALL_CAPABILITIES` still succeeds, locking the AC that cookie sessions are unaffected.

***Secondary.*** `lib/api/route-capability-coverage.test.ts` — the filesystem walk plus committed snapshot. The regression alarm for route 82.

***Existing suites that must stay green***, per the ticket's AC: `lib/api/rls-parity.test.ts` (cross-tenant isolation, ADR-0001 Path B), `lib/api/auth-coexistence.test.ts` (BK-166), `lib/api/workspace-context.test.ts` (ADR-0006 pairing).

> Standing constraint: all three are `describe.skip` without live Supabase credentials, so a session that cannot reach the database cannot verify this ticket. Same limitation ADR-0012 records under Consequences.

### Sizing

***One PR is the wrong shape.*** 48 capability decisions, 40 route files edited, a type change touching all 81 call sites, and two new test files — comparable to the 1900-4200 line chains that set `autonomous_delivery.caps.story: 1`. Five slices, each independently mergeable and revertible:

| Slice | Content | Behaviour change |
| --- | --- | --- |
| ***1. Foundation**** | Union type, `Capability` consolidation, `cookie-only` lift for the two token routes, coverage test + snapshot. Migrate all 81 call sites mechanically; the 48 uncovered get `{ auth: 'authenticated', why: 'BK-97 slice N pending' }`. | ****None.*** Pure refactor, all gates green. Lands the anti-rot machinery first; the only slice touching every file. |
| ***2. Authoring domain*** | modules, user-stories, acceptance-criteria, milestones, environments, imports (~22 handlers) | Narrow PATs start getting 403 |
| ***3. Reporting reads*** | coverage, bugs heatmap, recovery-cycles, runs report, bugs GET, activity, tests reads, runs GET (~12) | 403 for PATs without `atc:read` |
| ***4. Identity + notifications*** | Resolve the remaining ~14 `authenticated` placeholders into final postures with real `why` strings; close `invites/accept` (ADR-0001 flagged it "verify" at `:101` and never did) | Mostly none; documents intent |
| ***5. Docs*** | ADR-0001 KNOWN LIMITATION to resolved; close ADR-0006's BK-168 follow-up; update `qa-config.ts` scope purposes; regenerate `public/openapi.json` security descriptions | None |

Slice 1 must land intact and is the slice that actually fixes the root cause. Slices 2-4 are the sweep, each revertible by reverting single lines. ***If the chain stalls after slice 1, the codebase is strictly better than today***: nothing new is enforced yet, but nothing new can be added without stating its posture.

***Note for the epic owner******:*** BK-97 is currently typed `Improvement` with severity `Moderada`. The five-slice shape and the 48-handler surface make it story-shaped. Recommend converting it to a Story with sub-tasks per slice, or splitting slices 2-4 into sibling tickets under the same parent.

Decided autonomously by the AI Tech Lead profile under CLAUDE.md Critical Rule #18. No human sign-off is implied.

---

### Ely - 6/8/2026, 19:43:48

## AI Tech Lead — Assessment: BK-97 is story-shaped; not taken by the bug routine

Evaluated by the autonomous `bug` delivery routine on 2026-08-06 and ***not claimed***. Recording why, so the next run does not re-derive it.

### This is not being deferred over the open product question

BK-97's description carries a section titled "Open product decision (do this first) — define the capability vocabulary: reuse the current 4 scopes vs. introduce finer-grained ones." Under Critical Rule #18 an open product question is ***work to decide, not a blocker***, so that alone would not stop this run.

### It is being handed back on shape

- ***~******18 route files**** under `app/api/v1/**` would need per-route capability enforcement.
- ***A likely CHECK-widening migration*** on `0008*access*tokens.sql` if the vocabulary changes at all.
- It is marked ***"duplicated by" BK-168*** ("Audit and enforce capability scopes across non-ATC write endpoints") — overlapping work may already exist, and two tickets independently enforcing the same scopes is how contradictory enforcement ships.

A migration plus a multi-slice chain across eighteen routes is a story wearing a bug's clothes. The bug routine's remit is root-cause fixes that land as a single PR.

### Recommended next step

1. ***Resolve the BK-97 / BK-168 overlap first*** — decide which ticket owns the enforcement sweep and close or link the other. Doing this before the vocabulary decision avoids deciding it twice.
2. Then refine the surviving ticket as a story, with the capability vocabulary settled as part of refinement (an `AI Product Owner / Business Analyst` + `AI Tech Lead` joint call, per Rule #18), against ***ADR-0001**** and ****ADR-0005***.
3. Slice by route group, not big-bang — capability enforcement that half-lands across eighteen routes is worse than none.

---

**Posted by the autonomous **`bug`** delivery routine. This is an AI Tech Lead assessment, not human sign-off.**

---

### Ely - 13/8/2026, 18:24:01

## AI Product Owner — Decision: BK-97 duplicate resolution

> ***INFO:*** Attribution. Produced by the AI Product Owner profile under CLAUDE.md Critical Rule #18, which grants this profile decision authority on product/scope calls without waiting for human sign-off. This decision executes the follow-on materialization work that the AI Tech Lead ruling in comment 12195 (2026-08-06) specified, and stops short of it because a duplicate check vetoes the five-slice restructuring that ruling recommended.

### Duplicate found: BK-262 already supersedes BK-97 in scope

BK-97 ("Enforce per-route PAT capabilities on non-ATC API routes (ADR-0001 follow-up)", Improvement, Open) is duplicated in scope by ***BK-262*** ("PAT | Enforce capability scopes on every non-ATC route", Story, Shift-Left QA since 2026-08-02).

Evidence:

- BK-262's own comment `12289` (AI Tech Lead — Refinement input, posted 2026-08-11 by the autonomous bug delivery routine) states outright: **"the design questions on this story are already decided (on BK-97)... Both were decided under CLAUDE.md Critical Rule #18 and published on BK-97, the Improvement ******this story supersedes in scope****."** It points BK-262's refiner directly at BK-97's rulings `12194` and `12195` rather than re-deriving them.
- BK-262's Definition of Done is the same enforcement sweep BK-97 describes: every non-ATC route family (imports, modules, projects, user stories, acceptance criteria, workspaces, invites) gated on the caller token's capability scope, unscoped tokens rejected, cookie/session callers unaffected.
- BK-97 already carries the identical resolution pattern for exactly this situation: comment `11204` shows BK-168 ("Audit and enforce capability scopes across non-ATC write endpoints") was consolidated into BK-97 as a duplicate, and BK-168's live status is now `ABORTED`. BK-97's own link graph still shows `is duplicated by -> BK-168` (stale but consistent — BK-168 is terminal). BK-97 additionally carries a `Relates` link to BK-262 (link id `10789`) that undersells the actual relationship: it is not a mere reference, it is scope duplication in the other direction — BK-262 is the survivor this time, not BK-97.
- BK-97's own comment `12203` (AI Tech Lead — Assessment, autonomous bug routine, 2026-08-06) already flagged this precise risk before either ruling was acted on: **"It is marked 'duplicated by' BK-168... overlapping work may already exist, and two tickets independently enforcing the same scopes is how contradictory enforcement ships"** and recommended, as the first step: **"Resolve the BK-97 / BK-168 overlap first... Then refine the surviving ticket as a story."** BK-262 is that surviving ticket — it already has the Story shape, the `TMS-`-free plain-feature title format, and is already mid-refinement (Shift-Left QA). Materializing a **second** five-slice Story structure directly on BK-97, as this task was dispatched to do, would recreate the exact contradictory-enforcement risk comment `12203` warned about, this time between BK-97's new slices and BK-262.

### Alternatives considered and scored

Scored 1–5 per criterion (5 = best), 25 max.

| Candidate | Product value | Precedent | Impl. cost | Reversibility | Risk | Total |
| --- | --- | --- | --- | --- | --- | --- |
| A. Close BK-97 as Duplicate of BK-262 (link + transition), rulings preserved in this comment | 5 | 5 | 4 | 5 | 5 | ***24*** |
| B. Leave BK-97 open unchanged, add cross-reference comment only | 2 | 2 | 5 | 5 | 3 | 17 |
| C. Merge BK-97 content into BK-262 (edit its AC/DoD), then close BK-97 | 4 | 3 | 2 | 3 | 2 | 14 |
| D. Reject the duplicate finding; proceed with the original plan (convert BK-97 to Story, create 5 slice tickets) | 1 | 1 | 1 | 2 | 1 | 6 |

***Why A wins.*** It is the only candidate that collapses two divergent Jira threads into the one ticket that already has the right shape (Story), the right status (mid-refinement), and the right title convention, while costing one comment, one link correction, and one status transition — no code, no migration, no new tickets. It exactly mirrors the precedent this repo already set for this exact situation (BK-168 → BK-97), just with the roles reversed. It is trivially reversible: the `improvement` workflow's `re_open` transition (`from: any, to: open`) restores BK-97 if this call turns out to be wrong.

***Why B loses.*** It is the status quo that produced this problem: BK-97 and BK-262 have coexisted with overlapping scope since at least 2026-08-06 (three autonomous-routine passes noted it — comments `12203` and `12289` — without either being resolved), and it does not stop the next run from re-deriving the same finding a third time.

***Why C loses.*** Editing BK-262's AC/DoD is refinement work that belongs to whoever owns BK-262's Shift-Left QA pass (a QA owner is not yet assigned — see comment `12289`), not to this duplicate-resolution decision. Reaching into a ticket mid-refinement to rewrite its acceptance criteria as a side effect of closing a different ticket is exactly the kind of scope creep CLAUDE.md's Simplicity/Surgical-Changes principles warn against.

***Why D loses.*** This is the option this task was dispatched to execute (convert BK-97 to Story, create 5 slice tickets) before the duplicate check ran. Doing it anyway would build a second, independent Story-plus-slices structure that enforces the identical PAT capability sweep BK-262 already exists to deliver — the precise "two tickets independently enforcing the same scopes" failure comment `12203` named.

### Resolution (executed with this comment)

Per candidate A: BK-97's link to BK-262 is corrected from `Relates` to `Duplicate` (BK-97 ***duplicates*** BK-262), and BK-97 is transitioned from `Open` to `Duplicated` (the `improvement` work type's `is_duplicated` transition). No ticket is created, converted, or split — the five-slice materialization work is not performed on BK-97; it belongs to BK-262's own refinement pass instead.

### Rulings preserved (nothing is lost by closing BK-97)

Both published rulings this decision is downstream of are reproduced below in full, unabridged, so a reader who lands on BK-262 (or on this now-closed ticket) never has to reopen BK-97 to recover them.





### Where this work actually belongs now

BK-262 is unassigned and has been in Shift-Left QA since 2026-08-02 (per its own comment `12289`). The five-slice materialization this ruling specifies — Foundation, Authoring domain, Reporting reads, Identity + notifications, Docs — is real, undone work; it simply belongs on BK-262, not on a newly-Story-shaped BK-97. That assignment/refinement gap on BK-262 is out of scope for this decision (candidate C was scored down for exactly that reason) and is left for its own refinement pass.

---

### Automation for Jira - 13/8/2026, 18:24:44

Hola Ely!
Este reporte es idéntico a otro reporte de incidencia de la misma US.
Toma en cuenta que cada reporter de defecto/bug debe ser independiente y único. No podemos trabajar en más de 1 defecto cuya incidencia es la misma pero con datos diferentes. Es mejor juntar todos los defectos en un mismo reporte por cada única funcionalidad.
Por lo tanto, éste reporte se considera DUPLICADO, y para no trabajar en 2 incidencias iguales, vamos a considerar una (la primera que se creó) para trabajar cómodamente.
Para cualquier duda, escríbenos por Slack! 🕵🏻‍♂️

---


_Synced from Jira by sync-jira-issues_
