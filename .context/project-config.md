# Project Configuration

> Project: Bunkai
> Generated: 2026-08-19
> Re-verified: 2026-10-11 against `upex-bunkai-tms` `origin/staging` (98ee1b4); the local checkout is older, read via `git show origin/staging:<path>`

## Repositories

| Repository | URL | Branch | Purpose |
|------------|-----|--------|---------|
| upex-bunkai-tms | https://github.com/upex-galaxy/upex-bunkai-tms.git | main | Single Next.js application — backend (API routes) and frontend live in the same repo, not a split/monorepo |

## Tech Stack

### Frontend
- Framework: Next.js 15 (App Router — confirmed by `app/` directory, no `pages/` dir present), React 19
- Language: TypeScript
- Styling: Tailwind CSS 3.4 (`tailwind.config.ts`, `postcss.config.js`) + shadcn/ui (`components.json`, style "new-york", base color "neutral", RSC enabled)
- State: No dedicated state library found (no zustand/redux/jotai/react-query in `package.json`). State appears to rely on React Server Components + built-in React state/context. Notable: `.agents/project.yaml` describes a planned "React Flow" mind-map view, but `reactflow`/`react-flow` is NOT yet present in `package.json` dependencies — feature appears not yet implemented.

### Backend
- Framework: Next.js API routes (`app/api/`) — no separate backend service. `.agents/project.yaml` (target repo's own copy) confirms: "Monorepo — backend lives in `app/api/` of the Next.js project for MVP. Spin out to a NestJS service when self-hosted Docker Compose lands (Phase 2)."
- Language: TypeScript
- ORM: None — direct Supabase client usage (`@supabase/supabase-js`, `@supabase/ssr`; client/server/admin/rpc helpers found in `lib/supabase/`). No Prisma dependency in `package.json` despite `.env.example` listing optional Postgres direct-connection vars "Required if using Prisma / raw SQL" (template boilerplate text, not an active usage signal).

### Database
- Type: PostgreSQL 17.6 on the live instance (recorded in `supabase/migrations/0075_run_inactivity_sweep.sql`); extensions in use include `pg_cron`
- Provider: Supabase (single project/tenancy shared across local/staging/production per `.agents/project.yaml`, project ref `fmbpikzpkafptqximhxn`)
- Access: DBHub MCP (see `dbhub.toml`) — connects via Supabase **session pooler** (port 5432, NOT the 6543 transaction pooler) using a read-only role `qa_inspector_ro.<project-ref>`. Config is templated from `${DBHUB_*}` env vars, no secrets committed. Real credentials are tracked in Jira epic BK-29 per the file's own comment.
- Migrations: `supabase/migrations/` — 89 SQL migration files at `origin/staging` (73 at the 2026-08-19 pass). Since then: test plans (0073, 0076), run inactivity sweep via pg_cron (0075), Stripe billing checkout (0077), notification digest log (0078), workspace data export (0083), workspace soft-delete + pg_cron purge (0084, 0084a, 0089), `qa_inspector` role grants (0085, 0086, 0088), ATC classification (0087), coverage skipped/blocked split (0090).

### Infrastructure
- Cloud: Vercel, deployed through Vercel's Git integration (`main` maps to the Vercel production environment, `staging` to the Vercel staging environment). `vercel.json` now exists and only declares one Vercel Cron: `POST /api/v1/admin/send-digest` daily at 08:00 UTC (`CRON_SECRET`-gated).
- Third-party services added since 2026-08-19: Stripe (`stripe` dependency; hosted Checkout + `app/api/v1/billing/webhook/route.ts`) and Resend (`resend` dependency; daily notification digest email).
- CI/CD: No `.github/workflows/` directory in the target repo (confirmed absent at `origin/staging` on 2026-10-11). No GitHub Actions CI/CD pipeline detected locally — deploys appear to be driven entirely by Vercel's native Git integration (auto-deploy on push to `main`/`staging`), not a custom Actions pipeline. Local git hooks exist via Husky (`.husky/`) for pre-commit/lint-staged.
- Monitoring: Discovery Gap — no Sentry/Datadog/PostHog or similar observability dependency found in `package.json`.

## Environments

| Environment | URL | Purpose | Access |
|-------------|-----|---------|--------|
| Local | http://localhost:3000 | Dev | Direct (`next dev`) |
| Staging | https://staging-upexbunkai.vercel.app | Pre-prod testing | Vercel preview alias for the `staging` branch; same Supabase project as local/production (single-tenancy MVP) |
| Production | https://upexbunkai.vercel.app | Live | Read-only. Vercel production alias. Defensive domains `bunkai.io` (primary target domain, not yet wired) and `bankai.io` (redirect) declared in target repo's `.agents/project.yaml` but not yet the live host. |

## Tools and Access

- Issue tracker: JIRA (`upexgalaxy72.atlassian.net`) — resolved via [ISSUE_TRACKER_TOOL]
- Project key: BK
- Database: resolved via [DB_TOOL] (DBHub MCP, session pooler, read-only role — see `dbhub.toml`)
- Docs: In-repo Markdown (target repo root: `README.md`, `CONTEXT.md`, `DESIGN.md`, `INSTALLER.md`, `CLAUDE.md`). No Confluence or Notion references found.
- API spec source: OpenAPI 3.1, generated via `@asteasolutions/zod-to-openapi` (`lib/openapi/registry.ts` → `scripts/openapi-gen.ts` → `public/openapi.json`), served live at `app/api/openapi/route.ts` and browsable at `/api/docs`. Target repo also has a checked-in copy at `upex-bunkai-tms/.context/SRS/api-contracts.yaml` (1293 lines). Consumed by `bun run api:sync` for `api/openapi-types.ts` in this boilerplate; business angle deferred to `/business-api-map`. Found via Phase 2 SRS discovery — see `.context/SRS/architecture.md` §10.

## Access Checklist

- [x] Repository read access — confirmed, target repo present locally at `C:\Users\Genesis Ojose\Documents\Auto\Dojo 4\upex-bunkai-tms`
- [x] Database access (MCP or direct) — DBHub read-only queries used in sprint-testing sessions through 2026-10-10 (e.g. `pg_get_functiondef` checks for migration 0089)
- [x] Issue tracker access — `acli` and `jira:sync-issues` used daily through 2026-10-11; re-checked by Phase 4 `bun run jira:check`
- [x] Staging environment reachable — `https://staging-upexbunkai.vercel.app` exercised by UI and API retests through 2026-10-11 (BK-988, BK-991, BK-512)
- [ ] CI/CD visibility — N/A locally: no GitHub Actions workflows exist in the target repo to have visibility into; deploy visibility would instead be via Vercel dashboard/CLI (not verified)

## Discovery Gaps

- [ ] Monitoring/observability tooling (Sentry, Datadog, PostHog, etc.) — none found in `package.json`, unconfirmed whether handled outside the repo (e.g. Vercel Analytics dashboard-only)
- [ ] Live reachability of production (`https://upexbunkai.vercel.app`) — not tested (staging is verified, see Access Checklist)
- [ ] Stripe mode on staging (test vs live keys) — checkout and webhook routes exist; key mode not verified
- [ ] `bun run jira:check` exits 1 on one mismatch (2026-10-11): `.agents/jira-workflows.json` names the story work type `Story`, while the live instance and `.agents/jira-required.yaml` say `Historia` (verified on BK-508 via `acli`). Connection, 234 field/workflow checks and all link types are green. Likely fix: `bun run jira:sync-workflows` to refresh the stale catalog, then re-run `jira:check`.
- [ ] Whether a GitHub Actions pipeline exists remotely-only (e.g. added after this local checkout, or configured via GitHub UI/Vercel dashboard rather than committed YAML) — local filesystem shows no `.github/workflows/`, but this cannot rule out remote-only or dashboard-configured automation
