# Business Model Canvas — Bunkai (upex-bunkai-tms)

> Discovery performed against `C:\Users\Genesis Ojose\Documents\Auto\Dojo 4\upex-bunkai-tms` (read-only). Every populated row cites the file it was found in. Rows without code/doc evidence are marked "Unknown — requires user input" rather than inferred.

**Confidence level: MEDIUM.**

Why not High: the strongest, most consistent evidence (nine-domain plan-tier code, RLS role model, Jira import worker, About-page capability matrix) is solid and code-backed. But two of the canvas's most business-y blocks — Customer Segments and Channels — have **no code footprint at all**; the only source for them is the target repo's own `.context/business/business-model.md`, a **pre-implementation vision document** ("MVP Hypotheses to Validate", prices marked "TBD"). That document reads as founder narrative/marketing hypothesis, not verified fact, so those two blocks are downgraded and flagged accordingly rather than stated as confirmed.

Why not Low: the product's actual mechanics (data model, RBAC, pricing tiers, execution modes, Jira integration) are directly readable in migrations and route code, not guessed — that part of the picture is solid.

---

## Problem Statement

Bunkai's own `/about` page (`app/about/_components/sections.tsx`, `PainSolution()`) states the pitch directly, in the product's working language (Spanish, per the repo's convention that user-facing teaching copy for QA audiences is authored in Spanish while code stays English):

> "Las herramientas de gestión de pruebas guardan documentos. No enseñan a testear." — *Test management tools store documents. They don't teach how to test.* (`app/about/page.tsx` line 77)

The page enumerates four concrete pains it claims to fix (`sections.tsx` lines 99–122): (1) the same manual step (e.g. "navigate to /login") duplicated across dozens of test cases with no single edit point, (2) no way to know which tests are still valid as the product evolves, (3) traceability from user story to acceptance criterion to test scattered across spreadsheets/Confluence/memory, and (4) bugs handed off to an external tracker the moment they fail, losing the QA context (which ATC failed, under what run conditions).

The product's structural answer, per the same page: force traceability into the data model itself rather than the feature list — "un ATC sin historia de usuario no puede existir" (an ATC without a user story cannot exist). This is corroborated by the actual schema: `supabase/migrations/0003_authoring.sql`–`0004_atcs.sql` (ATCs anchor to acceptance criteria) and the RLS/tenancy model in `0001_tenancy.sql`.

Bunkai is explicitly positioned as a **Test Management System (TMS)**, described in the About page footer as "Test Management System open core para equipos de QA" (`app/about/page.tsx` line 137), and — per `app/about/_components/sections.tsx` `Origin()` — as the productization of the KATA (Component Action Test Architecture) methodology this very QA-engineering boilerplate uses, plus a companion "IQL" (Integrated Quality Lifecycle) methodology. This is a meaningful, verifiable discovery: Bunkai is not a generic SaaS starter output — it is the commercial TMS product built around the same test-architecture vocabulary (ATCs, modules, runs) that this repo's own KATA framework uses, with the Jira ticket ID as the literal join key between the two (`sections.tsx` `Origin()` mapping table, lines 196–203).

---

## Business Model Canvas

### 1. Customer Segments — Unknown — requires user input (weak evidence only)

No code artifact (route, schema field, pricing gate, persona flag) targets a specific customer type. The only source is the target repo's own `.context/business/business-model.md` §1, which names four aspirational segments (indie QA engineers, mid-market engineering orgs, regulated-industry enterprises, a QA-training audience tied to "UPEX Galaxy"). That document is self-labeled as **hypotheses to validate**, not fact, and is dated as a pre-code vision artifact. Reported here for completeness, not as a discovered fact.

*Found in: `upex-bunkai-tms/.context/business/business-model.md` §1 (vision doc, unverified against code) — no corroborating code signal found.*

### 2. Value Propositions — Medium-High confidence

| Proposition | Evidence |
|---|---|
| One ATC (Acceptance Test Component), many tests — edit once, all chaining tests update | `app/about/_components/Capabilities.tsx` line 45 "Propagación de ediciones a los tests" marked `listo` (shipped); migration `0035_atc_update_propagation.sql` |
| Traceability is structurally enforced (Story → AC → ATC → Test → Run → Bug), not optional | `supabase/migrations/0068_story_traceability_report.sql`, `0069_story_traceability_module.sql`; `app/about/_components/sections.tsx` `PainSolution()` |
| Three execution modes (manual / agentic / automated CI) produce the same comparable run type against the same ATCs | `app/about/_components/sections.tsx` `ExecutionModes()` lines 145–186; migrations `0031_runs.sql`, `0036`–`0043` (run lifecycle, abort, finish, realtime) |
| Native defect management anchored to module + ATC + run, not delegated wholesale to an external tracker | `supabase/migrations/0046_bugs.sql`, `0052_defect_heatmap_report.sql`; `app/about/_components/Capabilities.tsx` "Sync de una vía al tracker externo" (one-way sync, not delegation) |
| API-first / agent-operable: an AI agent authenticates with a personal access token and drives the same REST API a human uses | `lib/api/pat.ts`, `app/api/v1/tokens/`; `app/about/_components/sections.tsx` `ExecutionModes()` "ejecutor: agente ... autenticada con un token personal. El agente es un consumidor de primera clase" |
| Optional Jira import (JQL-driven) brings existing user stories + acceptance criteria in, rather than requiring re-authoring | `lib/jira/import-runner.ts` (BK-17), `app/api/v1/imports/`; `Capabilities.tsx` "Import de Jira por JQL" marked `listo` |

*Found in: files cited per row above.*

### 3. Channels — Unknown — requires user input (weak evidence only)

No code artifact evidences a distribution channel (no marketing site analytics, no referral system, no marketplace code). The target's own vision doc (`.context/business/business-model.md` §3) lists GitHub-led open-source distribution, content marketing, conference talks, and a tie-in to a training course, but — same caveat as Customer Segments — this is founder hypothesis, not something the code confirms. The one channel-adjacent artifact actually in code is the public, unauthenticated `/about` explainer page itself (`app/about/page.tsx`, no auth gate) and the public `/qa` testability-guide page, both of which function as top-of-funnel content, but neither is evidence of a *strategy* beyond "a public marketing page exists."

*Found in: `upex-bunkai-tms/.context/business/business-model.md` §3 (vision doc); `app/about/page.tsx` (public page exists, confirms *a* channel surface, not the channel strategy).*

### 4. Customer Relationships — Unknown — requires user input

No support-tier, SLA, or community-forum integration found in code. The vision doc (`.context/business/business-model.md` §4) proposes self-serve/community support for the free tier and SLA-backed support for paid tiers, but nothing in `app/` or `lib/` implements or references a support channel, SLA tracking, or a Discord/community integration.

*Found in: `upex-bunkai-tms/.context/business/business-model.md` §4 (vision doc, unconfirmed by code) — no code evidence found.*

### 5. Revenue Streams — High confidence (mechanism); Medium on go-to-market intent

A three-tier plan ladder is implemented as typed constants, gated by a `workspaces.plan` column:

| Tier | Seats | Projects | Retention | Price | Paid? |
|---|---|---|---|---|---|
| Community | 5 | 3 | 30 days | $0 | No |
| Cloud | 25 | 50 | 90 days | $24.00 / seat / month | Yes |
| Enterprise | unlimited | unlimited | unlimited | "Custom" (per contract) | Yes |

*Found in: `lib/billing/plan-tiers.ts` (`PLAN_TIERS` constant, lines 38–69); schema constraint `plan in ('community','cloud','enterprise')` in `supabase/migrations/0001_tenancy.sql` line 32–33.*

This is a **per-seat SaaS subscription model** (Community/free self-serve tier + Cloud paid tier + Enterprise custom-contract tier) — the classic "open core" shape. However, **no payment processor integration exists**: `package.json` has no `stripe`, `paypal`, or any billing-SDK dependency, and the only billing route (`app/api/v1/workspaces/[id]/billing/route.ts`) is a **read-only usage/plan overview** (seats used, project count, retention age) via a Supabase RPC (`bunkai_workspace_billing_overview`) — it does not create charges, checkout sessions, or invoices. This is corroborated in-app: the About page's own capability matrix marks "Asientos, tiers y facturas" (seats, tiers, and *invoices*) as `próximo` (upcoming), not shipped (`app/about/_components/Capabilities.tsx` line 18). The code comment in `lib/billing/plan-tiers.ts` (lines 27–35) states explicitly: "No subscription table exists anywhere in the schema yet... a real renewal DATE cannot be sourced honestly for a paying tier — that lands with BK-231 (billing details + invoices)."

**Conclusion: the pricing model is designed and partially displayed in-app, but revenue collection is not yet wired.** This directly updates/supersedes the target's own pre-code vision doc, which listed pricing as "TBD (~$20–$30/seat/mo)" — the code has since locked $24/seat/month for Cloud.

*Found in: `lib/billing/plan-tiers.ts`, `app/(app)/settings/billing/page.tsx`, `app/api/v1/workspaces/[id]/billing/route.ts`, `app/about/_components/Capabilities.tsx` line 18, `package.json` (dependency list, no billing SDK present).*

### 6. Key Resources — Medium-High confidence

- **The KATA-modeled data schema itself** (73 migrations in `supabase/migrations/`) — workspaces/tenancy, projects/modules, ATCs, tests-as-ATC-chains, runs, bugs, coverage/traceability reporting. This schema *is* the product's core IP per its own pitch ("poner la disciplina en el modelo de datos" — put the discipline in the data model; `app/about/_components/sections.tsx` `Closing()`).
- **The REST + OpenAPI surface** (`app/api/v1/`, `app/api/openapi/`, `app/api/docs/`) — the mechanism enabling the "API-first / agent-operable" value prop.
- **Row-Level Security as the tenancy/authorization engine** — every table's access is enforced by Postgres RLS policies keyed to `workspace_members.role` (`owner`/`admin`/`member`/`viewer`), not application-layer checks (`supabase/migrations/0001_tenancy.sql` lines 60–211; `0005_rls_helpers.sql`).
- **Personal Access Tokens (PATs)** as the credential type letting external/AI agents operate the same API a human uses (`lib/api/pat.ts`, `app/api/v1/tokens/`).

*Found in: files cited above.*

### 7. Key Activities — High confidence

Inferred strictly from the migration sequence and route tree (never guessed beyond what's named):

| Activity | Evidence |
|---|---|
| Multi-tenant workspace + RBAC management | `0001_tenancy.sql`, `0006_bootstrap_workspace.sql`, `0010_workspace_invites.sql`, `0044_leave_workspace.sql` |
| Authoring requirements (user stories, acceptance criteria) and organizing them into projects/modules | `0002_projects_modules.sql`, `0003_authoring.sql`, `0016_user_story_uniqueness.sql`, `0017_acceptance_criteria_ordering.sql` |
| Building/maintaining a reusable ATC (Acceptance Test Component) library | `0004_atcs.sql`, `0021_atc_create_update.sql`, `0027_atc_search.sql`, `0028_atc_duplicate.sql`, `0029_atc_usage.sql`, `0035_atc_update_propagation.sql` |
| Composing ATCs into ordered test chains and running them (manual / agentic / CI) | `0024_tests.sql`, `0026_tests_reorder.sql`, `0031_runs.sql` through `0043_run_realtime_replication.sql` |
| Defect capture + analytics anchored to module/ATC/run | `0046_bugs.sql`, `0051_bugs_list.sql`, `0052_defect_heatmap_report.sql`, `0054_bug_assignment_status.sql` |
| Coverage/traceability + release-readiness reporting | `0048_project_coverage_report.sql`, `0049_recovery_cycle_report.sql`, `0068_story_traceability_report.sql` |
| Importing existing Jira user stories/ACs via JQL (product feature, distinct from this boilerplate's own dev-tooling Jira sync scripts) | `lib/jira/import-runner.ts`, `app/api/v1/imports/` |
| Notifications + activity stream (in-app coordination) | `0045_activity_stream.sql`, `0053_notifications.sql`, `0056_bug_event_notifications.sql`, `0062_notification_preferences.sql` |

*Found in: files cited per row above.*

### 8. Key Partners — Medium confidence

| Partner | Role | Evidence |
|---|---|---|
| **Supabase** | Database (Postgres 16), auth, RLS enforcement, realtime | `@supabase/supabase-js`, `@supabase/ssr` in `package.json`; `lib/supabase/` |
| **Vercel** | Hosting/deploy target, background job execution (`after()` slot used by the Jira import worker) | `.agents/project.yaml` deploy notes (per this boilerplate's own `.context/project-config.md`); `lib/jira/import-runner.ts` line 16 "Runs in the Vercel `after()` background slot" |
| **Atlassian (Jira Cloud)** | Two distinct roles, do not conflate: (1) **product feature** — customers import their own Jira stories via JQL (`lib/jira/import-runner.ts`, `app/api/v1/imports/`); (2) **this repo's own dev tooling** — `scripts/sync-jira-issues.ts` syncs *Bunkai's own* backlog into `.context/PBI/` for the AI coding workflow, unrelated to the product's customer-facing feature | Both cited above |
| **GitHub / Google (OAuth)** | Sign-in identity providers | `lib/auth/oauth.ts` line 5: `OAUTH_PROVIDERS = ['github', 'google']` |

No email-delivery vendor (Resend, SendGrid, etc.), payment processor, or observability vendor dependency was found in `package.json` — confirmed absent, not assumed.

*Found in: files cited per row above.*

### 9. Cost Structure — Unknown — requires user input

No cost data (team size, cloud spend, contractor costs, CAC) is discoverable from code or in-repo docs. The only inferable cost driver is the infrastructure stack itself (Supabase + Vercel usage-based hosting, both implied by the Key Resources/Partners above) — this is a structural inference from the stack, not a stated cost figure, and is reported only as directional context.

*Found in: no direct evidence; inferred only from Supabase/Vercel dependency in `package.json` and `.agents/project.yaml`.*

---

## Discovery Gaps

- **Customer Segments, Channels, Customer Relationships**: no code footprint. The only source is the target repo's own pre-implementation vision document (`.context/business/business-model.md`), which self-identifies its claims as unvalidated hypotheses. Treat as unconfirmed narrative, not fact, until a human confirms current go-to-market intent.
- **Actual billing/payment collection**: pricing tiers are defined in code (`lib/billing/plan-tiers.ts`) and partially surfaced in a read-only usage overview UI, but no payment processor is wired and no subscription table exists yet (explicitly noted in the code's own comments, tied to a not-yet-built story `BK-231`). Whether/when real payment collection ships is unknown.
- **Team Chat, Test Plans/Milestones, automated CI run ingestion, notification inbox**: all explicitly marked `próximo` (upcoming) on the product's own capability matrix (`app/about/_components/Capabilities.tsx`) despite having partial schema support already migrated (e.g., `0064_milestones.sql`, `0053_notifications.sql`) — schema exists ahead of UI/feature completion in these areas.
- **Cost Structure**: entirely unconfirmed — no financial data available in-repo.
- **Self-hosted/Docker Compose "Phase 2" distribution** and its licensing model (mentioned in `.agents/project.yaml` comments as a planned NestJS/Postgres self-hosted edition) is a stated future direction, not a current fact — not counted as a current Key Resource.
- The target repo's `.context/business/business-model.md`, `business-feature-map.md`, and `business-api-map.md` are dated 2026-05-19 and explicitly self-labeled as greenfield/pre-code artifacts ("Mode: CREATE... no codebase to reverse-engineer"). They are now stale relative to the actual 73-migration, feature-rich codebase discovered here — several claims in them (e.g., "TBD" pricing) are superseded by shipped code found during this discovery pass.

---

## QA Relevance

| Business aspect | Testing implication |
|---|---|
| Multi-tenant RLS is the sole authorization mechanism (no app-layer role checks in several routes, e.g. `billing/route.ts` relies entirely on the RPC's own gate) | Tenant-isolation tests are not optional coverage — a missed RLS policy is a direct cross-tenant data leak. Every new table/RPC needs an explicit "other workspace cannot see/mutate this row" test, mirroring the `*-isolation.test.ts` pattern already used throughout `lib/` (e.g. `lib/billing/billing-overview-isolation.test.ts`, `lib/bugs/isolation.test.ts`). |
| Four-role RBAC (`viewer`/`member`/`admin`/`owner`) gates mutations differently per resource (e.g., workspace mutation = owner only; member management = admin+owner) | Coverage must include a role-matrix, not just "logged in vs. not" — each mutating endpoint needs negative tests for every role below its required threshold. |
| Billing shows plan/seat/usage but does not yet process real payments | Do not test payment flows as if they exist (there is no checkout/invoice surface to test yet) — focus billing QA on the read-only overview's correctness (seat counts, meter thresholds in `lib/billing/plan-tiers.ts` — `meterState`, `meterFillPercent` boundary logic already has dedicated unit tests worth reviewing, not duplicating). |
| Jira import is a customer-facing, asynchronous background job (Vercel `after()`), not a synchronous request | Needs async/eventual-consistency test design: job status polling, partial-failure handling (per-issue errors appended to `errors[]`), and idempotency on re-import (`external_id` upsert key) — not simple request/response assertions. |
| The product's core value prop is "one ATC edit updates every chaining test" (propagation) | This propagation mechanism is itself the highest-risk regression surface for the product — any QA plan for Bunkai's own ATC/test-chain features should treat update-propagation correctness as a P0, mirroring how this boilerplate's own KATA doctrine treats ATC reuse. |
| Capability matrix (`Capabilities.tsx`) is the product's own source of "what's actually shippable today" vs. roadmap | Before writing test plans against any Bunkai feature, cross-check this matrix — testing a `próximo` item as if it were `listo` wastes effort on unbuilt surface. |

---

## Sources Used

- `upex-bunkai-tms/README.md` — generic; this file is the **unmodified agentic-dev-boilerplate scaffolding README**, not product-specific copy. Downgrades confidence: it describes the meta-tooling ("the dev workflow, but AI runs it"), not Bunkai itself. Not used as a product-fact source.
- `upex-bunkai-tms/CONTEXT.md` — same caveat as README; generic boilerplate context-engineering doc, not Bunkai-specific. Not used as a product-fact source.
- `genesis-bunkai-qa-engineering/.context/project-config.md` — prior discovery pass (this boilerplate's own), confirmed stack/tenancy/infra facts, cross-checked against code in this pass.
- `upex-bunkai-tms/app/about/page.tsx` + `app/about/_components/sections.tsx` + `app/about/_components/Capabilities.tsx` — the product's own public pitch/explainer page and honest shipped-vs-upcoming capability matrix. Primary source for Problem Statement, Value Propositions.
- `upex-bunkai-tms/supabase/migrations/0001_tenancy.sql` through `0072_workspace_billing_overview.sql` (73 files) — schema evidence for tenancy/RBAC, Key Activities, Key Resources.
- `upex-bunkai-tms/lib/billing/plan-tiers.ts`, `app/(app)/settings/billing/page.tsx`, `app/api/v1/workspaces/[id]/billing/route.ts` — Revenue Streams.
- `upex-bunkai-tms/lib/jira/import-runner.ts`, `app/api/v1/imports/` — Key Activities, Key Partners (Jira as product feature, distinct from dev tooling).
- `upex-bunkai-tms/lib/auth/oauth.ts` — Key Partners (GitHub/Google OAuth).
- `upex-bunkai-tms/package.json` — dependency inventory (confirmed absence of billing/email/observability SDKs).
- `upex-bunkai-tms/.agents/project.yaml` — project identity (`project_name: Bunkai`, `project_key: BK`, `webapp_domain: bunkai.io`), stack notes, planned self-hosted Phase 2.
- `upex-bunkai-tms/.context/business/business-model.md` — target's own pre-implementation vision doc; used only where explicitly labeled as such (Customer Segments, Channels, Customer Relationships), never presented as confirmed fact.
- `upex-bunkai-tms/.context/business/business-feature-map.md` — cross-checked for staleness note (dated, self-labeled greenfield/pre-code).
