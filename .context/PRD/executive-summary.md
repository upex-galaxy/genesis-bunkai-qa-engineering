# Executive Summary — Bunkai (upex-bunkai-tms)

> Discovery performed against `C:\Users\Genesis Ojose\Documents\Auto\Dojo 4\upex-bunkai-tms` (read-only). Built on top of the Phase 1 artifacts already in this repo (`.context/business/business-model.md`, `.context/business/domain-glossary.md`) — this document restructures and extends their findings for the PRD audience rather than re-deriving them. Every claim below cites a code or in-product-copy source; forward-looking claims are isolated in Discovery Gaps.

---

## 1. Problem Statement

Bunkai's own `/about` page states its thesis directly, in the product's working language (Spanish is the convention for user-facing teaching/marketing copy in this codebase; code and identifiers stay English):

> "Las herramientas de gestión de pruebas guardan documentos. No enseñan a testear." — *Test management tools store documents. They don't teach how to test.* (`app/about/page.tsx` line 77, rendered via `AboutHero()` in `app/about/_components/sections.tsx`)

The page's `PainSolution()` component (`app/about/_components/sections.tsx` lines 97-143) enumerates four concrete pains it claims to fix, each paired with the product's structural answer:

1. **"El mismo paso, cuarenta veces"** (the same step, forty times) — a manual step like "navigate to /login" duplicated across dozens of test cases with no single edit point. Bunkai's answer: an ATC (Acceptance Test Case) is written once; every Test chain that references it inherits an edit.
2. **"Nadie sabe qué sigue siendo válido"** (nobody knows what's still valid) — as the product evolves, the test suite silently drifts from it. Bunkai's answer: coverage is computed, not felt — uncovered criteria and never-run tests surface as a list.
3. **"¿Qué cubre esta historia?"** (what does this story cover?) — traceability scattered across a spreadsheet, a Confluence page, and someone's memory. Bunkai's answer: Story → Criterion → ATC → Test → Run → Bug in one navigable, bidirectional chain.
4. **"Los bugs se van del loop de QA"** (bugs leave the QA loop) — a defect is handed off to an external tracker the instant it fails, losing which ATC failed and under what run conditions. Bunkai's answer: the defect is born anchored to module, ATC, and run; the copy to an external tracker is optional, not a handoff of ownership.

The login page's own copy (`app/(auth)/login/page.tsx` lines 101-107) restates the same thesis as the product's tagline: "A test management system that decomposes user stories into executable Acceptance Test Cases." The product's structural bet, per the About page's `Closing()` section, is to "poner la disciplina en el modelo de datos" (put the discipline in the data model) rather than in a feature list or a process document — corroborated by the schema itself: an ATC cannot be created without at least one bound Acceptance Criterion (`supabase/migrations/0021_atc_create_update.sql:158-168`, SQLSTATE `45020`, error `"Every acceptance criterion must belong to the given user story."`).

Bunkai is explicitly positioned as a **Test Management System (TMS)** — "Test Management System open core para equipos de QA" (`app/about/page.tsx` line 137) — and, per the About page's `Origin()` section, as the productization of the KATA (Komponent Action Test Architecture) methodology this QA-engineering boilerplate itself uses, plus a companion IQL (Integrated Quality Lifecycle) methodology. The Jira ticket ID (e.g. `BK-166`) is the literal join key between a KATA `@atc('BK-166')` method in code and the Bunkai ATC entity in the product (`app/about/_components/sections.tsx` `Origin()`, lines 196-203).

---

## 2. Solution Overview

### Product Vision

A test management system that makes traceability and defect context structurally unavoidable by anchoring every artifact — Acceptance Test Case, Test, Run, Bug — to the requirement it verifies, rather than leaving discipline to process.

### Core Capabilities

| # | Feature | Problem Addressed | Evidence |
|---|---|---|---|
| 1 | ATC library with mandatory AC anchoring + edit propagation | "One ATC edit updates every chaining test" — eliminates the duplicated-step problem | `app/about/_components/Capabilities.tsx` line 45 ("Propagación de ediciones a los tests", `listo`); `supabase/migrations/0035_atc_update_propagation.sql`, `0021_atc_create_update.sql` |
| 2 | Structural traceability chain (Story → AC → ATC → Test → Run → Bug) | "What does this story cover?" — replaces spreadsheet/Confluence tracking | `supabase/migrations/0068_story_traceability_report.sql`, `0069_story_traceability_module.sql`; `app/(app)/projects/[projectSlug]/traceability/page.tsx` |
| 3 | Three execution modes (manual / agentic / CI) producing one comparable run type | Unifies human, AI-agent, and pipeline test execution under the same report | `app/about/_components/sections.tsx` `ExecutionModes()` lines 145-186; `supabase/migrations/0031_runs.sql`, `0036`-`0043` (abort/finish/realtime) |
| 4 | Native defect management anchored to module + ATC + run | "Bugs leave the QA loop" — defect keeps its execution context by default | `supabase/migrations/0046_bugs.sql`; `lib/runs/report-bug-view.ts` (run-step-linked bug prefill); `app/about/_components/Capabilities.tsx` "Sync de una vía al tracker externo" |
| 5 | Jira import by JQL (bring existing stories/ACs in, no re-authoring) | Lowers the cost of adopting Bunkai on an existing Jira backlog | `lib/jira/import-runner.ts`; `app/(app)/projects/[projectSlug]/import-from-jira-dialog.tsx`; `app/about/_components/Capabilities.tsx` "Import de Jira por JQL" (`listo`) |

*Capped at 5 per doctrine; the full feature taxonomy (CRUD matrix, FEAT-NNN IDs, third-party integrations) lives in `.context/business/business-feature-map.md`, produced separately by `/business-feature-map` — not duplicated here.*

### Key Differentiators

- **API-first / agent-operable by design, not as an add-on.** A Personal Access Token lets an AI agent authenticate and drive the same REST API a human uses — the product's own copy states "El agente es un consumidor de primera clase, no un chatbot pegado al costado" (the agent is a first-class consumer, not a chatbot bolted on the side) (`app/about/_components/sections.tsx` `ExecutionModes()` lines 155-157; `lib/api/pat.ts`, `app/api/v1/tokens/`).
- **The vocabulary is the same on both sides of the KATA↔Bunkai boundary.** The product renders a literal mapping table to visitors (e.g. `@atc('BK-166')` in code ↔ ATC entity in the UI; Playwright execution ↔ a Run with `ci`/`agent` executor) — the Jira key is the join key, no separate mapping file (`app/about/_components/sections.tsx` `Origin()` lines 188-254).
- **Open-core, self-hostable positioning.** The login page footer states "Open-source, self-hostable, Apache-2.0. Your test specifications stay on your servers — Bunkai never reaches for the cloud unless you tell it to." (`app/(auth)/login/page.tsx` line 219) and offers a "Connect to your own Bunkai server (Community edition)" path (`app/(auth)/login/page.tsx` lines 201-216) — though this boilerplate's own `business-model.md` notes the self-hosted Docker Compose "Phase 2" is a stated future direction, not yet shipped code.

---

## 3. Success Metrics

### Tracked Metrics

None found. No `analytics.track()`, `sentry`, `datadog`, `posthog`, or `amplitude` call sites or dependencies exist in `app/` or `lib/`, and `package.json` lists no observability/analytics SDK — confirmed absent, not merely unread (cross-checked against this boilerplate's own `.context/project-config.md`, which already flags monitoring as a Discovery Gap).

### Inferred KPIs (from shipped features, not real tracking)

| Inferred KPI | Why it's plausible | Evidence |
|---|---|---|
| Time-to-green per story | The product renders this as a coverage metric already, even without an analytics pipeline behind it | `app/about/_components/Capabilities.tsx` "Tiempo hasta verde por historia" (`listo`) |
| ATC reuse count / propagation reach | "Reporte de uso en N tests" is a shipped capability — the product already computes how many Tests reference a given ATC | `app/about/_components/Capabilities.tsx` "Reporte de uso en N tests" (`listo`); `supabase/migrations/0029_atc_usage.sql` |
| Defect density / heatmap trend | Product ships a defect heatmap with a weekly trend, an obvious quality-posture proxy | `supabase/migrations/0052_defect_heatmap_report.sql`; `lib/metrics/defect-heatmap.ts` (`HeatBucket`, `TrendDirection`) |

### Unknown Metrics

- Adoption/engagement (DAU/MAU, seats activated vs. seats purchased) — no tracking mechanism exists.
- Revenue metrics — no payment processor is wired (see Product Scope below); nothing to measure yet.
- Any metric requiring cross-session or cross-user aggregation outside the product's own Postgres tables — no external analytics warehouse dependency found.

---

## 4. Target Users

Detailed personas (goals, pain points, permission matrix) live in `.context/PRD/user-personas.md`. Brief summary here, per the domain glossary's `workspace_members.role` / `workspace_invites.role` enum (`lib/types.ts:13`, `supabase/migrations/0001_tenancy.sql:44`):

| System Role | Need | Evidence |
|---|---|---|
| `owner` | Full workspace control; only role with leave-with-transfer semantics; sole owner of billing/workspace-level settings | `supabase/migrations/0001_tenancy.sql` (`workspaces.owner_user_id`); `lib/workspaces/invites.ts` |
| `admin` | Manage members, issue `workspace:admin`-scoped PATs, day-to-day QA process ownership | `lib/api/pat.ts:29-84`; `app/(app)/workspaces/[id]/members/page.tsx` |
| `member` | Standard authoring/execution: create ATCs, Tests, Runs, Bugs | Default authoring role, `lib/types.ts:13` |
| `viewer` | Read-only visibility into a workspace's projects and results | RBAC gate on mutating endpoints, `lib/types.ts:13` |

---

## 5. Product Scope

### Included (shipped, per the product's own capability matrix — `app/about/_components/Capabilities.tsx`)

- Workspaces with roles + invitations; password, magic-link, and OAuth (GitHub/Google) login; workspace switching; Personal Access Tokens.
- Projects, nested modules (move/archive), per-project environments, tree/table/mind-map views, tabs + command palette.
- User stories anchored to a module, orderable Acceptance Criteria, Markdown editor, Jira import by JQL.
- ATC builder (steps + assertions), mandatory AC anchoring, edit propagation, usage-count reporting, duplicate + autocomplete search.
- Test chain assembly + per-step reorder, reserved + custom tags, manual run with per-step verdict, abort-with-reason, run history/report.
- Defect capture from a failed run step, filterable list by module/severity, defect heatmap with weekly trend, one-way sync to an external tracker.
- Coverage/gap reporting, full traceability chain, time-to-green metric, activity feed, chain export as a snapshot.

### Not Included (confirmed absent, not merely unread)

- **Real payment collection.** Three pricing tiers are coded (`lib/billing/plan-tiers.ts`: Community $0, Cloud $24/seat/month, Enterprise custom) and a read-only usage/plan overview exists (`app/(app)/settings/billing/page.tsx`), but no payment-processor SDK (Stripe, PayPal, etc.) is in `package.json`, and no subscription table exists in the schema. The code's own comment states this outright: "No subscription table exists anywhere in the schema yet... a real renewal DATE cannot be sourced honestly for a paying tier" (`lib/billing/plan-tiers.ts:27-35`).
- **Automated CI run ingestion** ("Envío y streaming de runs automatizados", "Subida de archivo de resultados de CI") — both marked `próximo` in `app/about/_components/Capabilities.tsx` despite the manual/agentic modes being shipped.
- **Team coordination features** — notification inbox, per-event-type notification preferences, Test Plans/Milestones (progress tracking beyond the bare `Milestone` entity), chat channels with mentions, a home dashboard — all marked `próximo` in `Capabilities.tsx`, despite partial schema already migrated (e.g. `0064_milestones.sql`, `0053_notifications.sql`, `0062_notification_preferences.sql`) — schema exists ahead of shipped UI/feature completion here.
- **Observability/monitoring tooling** — no Sentry/Datadog/PostHog dependency found.

### Future Indicators

- Self-hosted "Community edition" login path is rendered in the UI (`app/(auth)/login/page.tsx` lines 201-216) but the self-hosted Docker Compose distribution itself is a stated Phase 2 plan in `.agents/project.yaml` comments, not shipped infrastructure.
- `ATC Priority` and a `Test-design technique` field on ATCs are named in the target's own domain glossary as tracked future work (epic reference `BK-399`) but have no corresponding column in the live generated Supabase types.
- Post-MVP entities named in the target's own glossary (Test Plan, Channel, Message, Mention, Rich Link, Subscription, Invoice, CI Results File) have no corresponding tables in `lib/types/supabase.ts` — confirmed absent from the live schema.

---

## 6. Discovery Gaps

| Gap | Impact | Suggested Source |
|---|---|---|
| Customer Segments, Channels, Customer Relationships (go-to-market intent) | Cannot ground QA priorities in "who actually uses this" beyond the roles the system recognizes | Product owner / founder interview — the only existing source (target's own pre-code `business-model.md`) is self-labeled unvalidated hypothesis |
| Real payment/billing collection timeline | Billing QA scope is currently limited to the read-only usage overview; testing a checkout/invoice flow would be premature | Roadmap for the not-yet-built story referenced in code as `BK-231` |
| No monitoring/analytics tooling | Success Metrics section above is almost entirely "Inferred" or "Unknown" — there is no ground truth to validate a metric against | Confirm whether Vercel Analytics (dashboard-only, no code footprint) is in use outside this codebase |
| Self-hosted "Community edition" completeness | The login page already advertises a self-host path; unclear whether `docker compose up` (referenced in the login page's own footer, `app/(auth)/login/page.tsx` line 133) is functional today or aspirational copy | Live test against a self-hosted instance, or a direct question to the team |

---

## 7. QA Relevance

**Critical Testing Areas**

- **Update propagation** (ATC edit → every chaining Test reflects it) is the product's core value proposition per its own pitch; this boilerplate's own `business-model.md` already flags it as the highest-risk regression surface for Bunkai's own QA plan.
- **RLS as the sole tenant-isolation boundary** — several routes (e.g. the billing overview) rely entirely on an RPC's own gate with no app-layer role-check backstop; a missed RLS policy on a new table is a direct cross-tenant data leak (see `.context/business/domain-glossary.md` §3, Rule: RLS is the sole tenant-isolation boundary).
- **Async Jira import** — a background job (Vercel `after()`), not request/response; needs status-polling, partial-failure (`errors[]`), and idempotency (`external_id` upsert) test design, not simple assertions.

**Risk Areas**

- Billing surfaces are display-only today — testing a payment/checkout flow that does not exist would waste effort; focus instead on the read-only meter's boundary logic (`meterState` 80%/100% thresholds, `lib/billing/plan-tiers.ts:71-91`).
- The `Capabilities.tsx` matrix is the product's own live "what's shippable today" signal — cross-check any feature against it before writing a test plan, so `próximo` items are not tested as if `listo`.

---

## 8. Document References

| Document | Status |
|---|---|
| `.context/PRD/user-personas.md` | Complete (this discovery pass) |
| `.context/PRD/user-journeys.md` | Complete (this discovery pass) |
| `.context/business/business-model.md` | Complete (prior discovery pass) — Phase 1 source for this document |
| `.context/business/domain-glossary.md` | Complete (prior discovery pass) — Phase 1 source for this document |
| `.context/business/business-feature-map.md` | Not yet produced — deferred to the standalone `/business-feature-map` command |
| `.context/project-config.md` | Complete (prior discovery pass) — stack/infra source |
