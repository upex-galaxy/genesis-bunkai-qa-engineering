---
id: project
title: 'Project-specific instructions'
load_when: 'anything specific to this project: its own conventions, guardrails, environments or vocabulary not covered by another section'
triggers: []
paths: []
---

# Project-specific instructions

> Project-owned overlay. The boilerplate delivers this file once and never overwrites it; every other file in this folder is synced from upstream. Write this project's own rules here, one heading per topic, instead of editing `AGENTS.md` or a synced section. Knowledge about the system under test belongs in a project context skill (`<aspect>-context`), not here.

Add `triggers:` regex sources to the frontmatter above when a rule here should be routed by keyword (the hook reads them), and keep every `NEVER` / `MUST` line reachable: cite `Rule #N`, binding: `/<skill>`, or enforced: `bun run <script>` (checked by `bun run instructions:check`).

## Project context skills

One row per skill this project authored: the `<aspect>-context` skills `project-context` mode `context-skill` creates, and any other skill the project added. The skill router in `agent-skills-and-mcps.md` is synced, so `bun run up` overwrites a row written there; this file is never overwritten. Add each skill's trigger phrases to `triggers:` above as regex sources too, so the hook routes this file when a prompt names them. `bun run instructions:check` fails a row whose `.agents/skills/<slug>/SKILL.md` does not exist.

| Skill | Trigger | Purpose |
|---|---|---|

## Test framework: authentication

Bunkai issues two credentials from one `POST /api/v1/auth/signin` (`config.auth.loginEndpoint`): the Supabase session cookie and a Personal Access Token (`bk_pat_*`, sent as `Authorization: Bearer`). The UI login form posts to the same route.

- `api-setup` signs in headlessly: the cookie goes to `config.auth.apiSessionPath` (storageState of the `integration` / `smoke-api` projects), the PAT to `config.auth.apiStatePath`. `ui-setup` saves the browser session to `config.auth.storageStatePath`.
- Cookie-only routes (`cookieAuth` only in `api/openapi.json`, e.g. workspace data export) answer 403 when a Bearer header is present, even alongside a valid cookie. A component that wraps them overrides `setAuthToken` to a no-op, as `WorkspaceExportApi` does.
- Every sign-in mints a new short-lived PAT; there is no refresh. Re-run the setup (or `bun run api:login <env> [--role <role>]`) when a token goes stale.
- Role credentials follow `<ENV>_<ROLE>_EMAIL` / `<ENV>_<ROLE>_PASSWORD` (owner, admin, member, viewer), declared in `.env.schema`.

## Test framework: API contract

Types come from the staging spec (`OPENAPI_SPEC_PATH`). Regenerate with `bun run api:sync`; components import the facades under `api/schemas/`, never `@openapi`.

## Git Strategy (this repository)

This repository (a consumer of the agentic-qa-boilerplate template, scaffolded to QA-test the Bunkai product) runs `solo-main`: single maintainer, commit and push directly to `main`. `meta.strategy_source` in `.agents/project.yaml` is `chosen`: the maintainer confirmed `solo-main` on 2026-10-18.

### Accepted divergence: declared policy vs enforced ruleset

**None declared in this repo** (`git_strategy.policy.accepted_divergences` is empty). If `verify` ever reports drift again, declare it there, per `.agents/skills/git-flow-master/references/ruleset-parity.md` §2b.


`bun run git:policy verify` reported **zero drift** at the last stamp ("no ruleset rules apply" to `main` on the host): `meta.policy_verified` holds the date, `meta.policy_source: verified`.

This is a change from an earlier state of this repo (last checked 2026-08-20/21) where a `ProtectPublic` ruleset requiring a pull request on `main` was active and bypassed by the admin push credential. That ruleset no longer applies here as of the 2026-08-23 check — either it was removed from this repo or its scope changed. If a future `bun run git:policy verify` reports drift again (declared `allowed` vs. enforced `blocked`), that is the old situation resurfacing, not a new bug: the fix then is the same as it was — record it in `git_strategy.policy.accepted_divergences` (`.agents/project.yaml`), never silently "correct" the yaml to `confirm`, and never run `bun run git:policy apply` while `direct_push_to_protected: allowed` is intentional (it would derive a ruleset with no `pull_request` rule, stripping the requirement for non-bypass contributors).

Why `direct_push_to_protected` stays `allowed` regardless of host ruleset state: this repo has exactly one maintainer with admin credentials, and `allowed` describes how work actually lands here — it is the value `git-flow-master` reads before deciding whether to ask permission for each push (Critical Rule #5). Re-run `bun run git:policy verify` at the start of any session that will push, rather than trusting this paragraph's staleness.

## Project Assessment (Phase 1)

Assessment Date: 2026-08-19

### Testing Maturity: 2/4
- Current state: Moderate (unit + substantial integration-style tests, no automated E2E, and no gate actually runs the suite)
- Test files: 145 (`*.test.ts`, target repo, excluding `node_modules`)
- Frameworks: `bun:test` only (built-in runner via `@types/bun`; no Jest/Vitest/Playwright in devDependencies, no `playwright.config.*`/`vitest.config.*`/`jest.config.*` found)
- Coverage: unknown (no coverage tool/report configured; `package.json` has no `test:coverage` script)
- Evidence: tests span `lib/**` (validation, isolation, RLS-parity, RPC) and `app/api/v1/**` (route handlers) plus `middleware.test.ts` and `scripts/sync-jira-issues.test.ts`. Several suites (e.g. `lib/api/rls-parity.test.ts`) hit a real Supabase instance via env-gated `describe.skip`, which is integration-grade coverage of cross-tenant RLS behavior — stronger than pure unit tests. No browser/E2E automation exists (no Playwright, no `e2e/` runner config; directories literally named `tests/` under `app/`, `components/`, `lib/` hold `.test.ts` files, not an E2E harness).
- Critical gap: neither `.husky/pre-commit` nor `.husky/pre-push` runs `bun test` (pre-commit runs `lint-staged` + `types:check` + `vars:check` + `skills:check`; pre-push runs `format:check` + `lint:check` + `vars:env:check` + `skills:registry:check`). `test` exists only as a standalone `bun run test` script and is not wired into `repo:check`/`repo:fix` either. A large, well-designed test suite has no automated trigger.

### Documentation State: Complete
- README: yes (`README.md`, 37KB — project overview, quickstart, prerequisites)
- API docs: yes — `app/qa/qa-config.ts` documents API response shapes inline; `docs/mcp/`, `docs/setup/jira-setup-guide.md`, OpenAPI sync pipeline (`bun run api:sync`, `openapi:gen`/`openapi:diff` scripts) generate schema-level API docs
- Architecture: yes — `CONTEXT.md` (28KB, context-engineering + directory structure), `DESIGN.md` (12KB, design system/tokens), `docs/architectures/README.md`, `docs/methodology/*` (4 methodology docs), `docs/agentic-development-engineering.md`
- Setup guide: yes — `INSTALLER.md` (32KB, installer contract), `docs/setup/README.md`, `docs/workflows/*` (git-flow, environments, sync-openapi)
- Note: no standalone `CONTRIBUTING.md` found at root; contribution conventions live inside `CLAUDE.md` (55KB) instead.

### Code Quality
- [x] ESLint: configured — `eslint.config.js` (flat config) extends `@antfu/eslint-config` + `@next/eslint-plugin-next`, `lessOpinionated: true`, with targeted overrides (`ts/no-explicit-any: warn`, `no-console: off` for test logging). Reasonably strict, not maximal.
- [x] Prettier: configured — `.prettierrc` (semi, singleQuote, printWidth 100, trailingComma es5), scoped to `json/yml/yaml/css/scss/html` (TS/TSX formatting delegated to ESLint via `@antfu/eslint-config`, not Prettier).
- [x] TypeScript: strict — `tsconfig.json` has `"strict": true`, plus `isolatedModules`, `esModuleInterop`, path aliases (`@/*`, `@app/*`, `@components/*`, `@lib/*`).
- [x] Pre-commit hooks: configured — `.husky/pre-commit` runs `lint-staged` (ESLint --fix on staged TS/JS, Prettier --write on staged json/yml/css/html) + full-repo `types:check` + `vars:check` + `skills:check`, with a conditional `skills:registry:check` gate when skill files are staged. `.husky/pre-push` adds full-repo `format:check` + `lint:check` + `vars:env:check` + `skills:registry:check`. Neither hook runs `bun test` (see Testing Maturity gap above).

### CI/CD Maturity: None
- No `.github/workflows/` in target repo (confirmed via directory listing — `.github` does not exist at root). Deploys via Vercel Git integration only (per `.context/project-config.md`: no `vercel.json`, zero-config deploy, `main` → production, `staging` → Vercel staging environment). Quality gates that exist (`repo:check`, `bun test`) run only locally/manually and via Husky git hooks — nothing runs them on push/PR/merge at the platform level.

### Secret Leak Sweep
- Grepped `app/`, `lib/`, `middleware.ts` for `(api[_-]?key|secret|password|token)\s*[:=]\s*['"]` and for literal secret-shaped strings (`sk_live`, `sk_test`, AWS `AKIA...`, JWT-shaped `eyJ...eyJ`).
- All hits were false positives, no literal secret values found:
  - `app/design-tokens/page.tsx` (design-token CSS block) — CSS design-token hex color values (`--bg-0`, `--accent`, etc.), not credentials.
  - `app/qa/qa-config.ts` (API response-shape doc strings) — documentation strings describing an API response shape (`token:"bk_pat_<prefix>.<secret>"`), placeholder text, not a literal value.
  - `app/qa/qa-config.ts` (DBHub config template) — `password = "${DBHUB_PASSWORD}"`, an env-var interpolation placeholder in a config template, not a hardcoded credential.
- No matches for literal secret-shaped strings anywhere in `app/`, `lib/`, `cli/`, `scripts/`.

### Identified Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| No CI/CD — no `.github/workflows/`, so nothing runs lint/types/tests automatically on push or PR | HIGH | Add a GitHub Actions workflow running `bun run repo:check` and `bun test` on every PR and push to `main`, blocking merge on failure |
| 145 test files exist but are not wired into any automated gate — neither `.husky/pre-commit` nor `.husky/pre-push` runs `bun test`, and CI does not exist to run it either | HIGH | Add `bun test` to CI (see above) at minimum; consider adding it to `.husky/pre-push` for local enforcement, mirroring how `format:check`/`lint:check` are already handled there |
| Single Supabase project shared across local/staging/production (no environment/data isolation), per `.context/project-config.md` line 27-41 | HIGH | Provision separate Supabase projects per environment (or at minimum enforce isolated schemas/seed data for test runs) before running automated regression suites against staging, to avoid corrupting shared data |
| No ORM (direct `@supabase/supabase-js` client + `.rpc()` calls) — manual SQL-adjacent surface | MEDIUM | Injection risk is mitigated in practice: sampled usage (`lib/supabase/rpc.ts`) shows only parameterized `.rpc()` calls with named args, no raw string-concatenated SQL found. Keep the target repo's `types:gen` script (Supabase type generation) current and add a CI drift-check so hand-maintained types don't silently diverge from schema |
| No E2E/browser automation — no Playwright, no `e2e/` harness, despite this being the standard tool for the QA boilerplate's KATA stack | MEDIUM | Once `/adapt-framework` runs, wire Playwright E2E coverage for critical user flows (auth, ATC creation, run reporting) to complement the existing unit/integration `bun:test` suite |
| No automated secret-scanning tool in CI/pre-commit (manual sweep in this assessment found nothing, but that was a one-time check) | LOW | Add a lightweight secret-scan step (e.g. gitleaks) to the future CI workflow as defense-in-depth |

### Phase Prioritization

- Phase 1: Normal -- discovery is complete; `.context/project-config.md` already captures stack, architecture, and deploy model clearly, and this assessment found no surprises requiring rework.
- Phase 2 (PRD/SRS): Extended -- the CI/CD gap and shared-Supabase-across-environments risk are significant enough that the SRS needs explicit NFR sections on release safety, environment isolation, and test-gating before automation work begins.
- Phase 3 (Infrastructure): Skip -- already substantially covered by `.context/project-config.md` (environment URLs, DB access path via DBHub, deploy model); only unverified item is live staging reachability, not worth a dedicated phase.
- Phase 4 (Specification/PBI): Normal -- test file comments already reference existing Jira ticket keys (e.g. `BK-87`, `BK-255`, `BK-49`), indicating an active Jira backlog to sync against via the standard PBI pull, no extended discovery needed.

### Blockers
- [ ] None

## Phase 2 Progress - PRD

- [x] `.context/PRD/executive-summary.md` — Problem Statement, Solution Overview (5 core capabilities), Success Metrics (mostly Inferred/Unknown — no analytics/monitoring tooling found), Target Users, Product Scope, Discovery Gaps, QA Relevance, Document References.
- [x] `.context/PRD/user-personas.md` — 4 personas (`owner`/`admin`/`member`/`viewer`, the full `MemberRole` enum), Role Hierarchy Mermaid backed by code-verified `ROLE_RANK` (`lib/workspaces/invites.ts`, `ROLE_RANK`), Permission Matrix, Test Account Requirements flagged as a gap (no per-role env vars in either repo's `.env.example`).
- [x] `.context/PRD/user-journeys.md` — Route Map (Public/Protected/Dynamic), 5 journeys (Onboarding, Story→ATC authoring, Test→Run execution, Bug filing from a failed step, Invite→Accept), Navigation Structure, Breadcrumb Patterns, Critical Paths, Discovery Gaps, QA Relevance.
- [ ] `.context/business/business-feature-map.md` — deferred to the standalone `/business-feature-map` command, not produced in this phase (per `phase-2-prd.md` §4).

## Business Data Map

Generated: 2026-08-19 — see `.context/business/business-data-map.md` (entities, 6 business flows including Jira import, 6 state machines, triggers/cron/webhooks, external integrations — synthesized from domain-glossary.md, business-model.md, PRD, SRS, and infrastructure docs).
