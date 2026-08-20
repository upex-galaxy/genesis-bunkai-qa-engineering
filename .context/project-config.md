# Project Configuration

> Project: Bunkai
> Generated: 2026-08-19

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
- Type: PostgreSQL 16
- Provider: Supabase (single project/tenancy shared across local/staging/production per `.agents/project.yaml`, project ref `fmbpikzpkafptqximhxn`)
- Access: DBHub MCP (see `dbhub.toml`) — connects via Supabase **session pooler** (port 5432, NOT the 6543 transaction pooler) using a read-only role `qa_inspector_ro.<project-ref>`. Config is templated from `${DBHUB_*}` env vars, no secrets committed. Real credentials are tracked in Jira epic BK-29 per the file's own comment.
- Migrations: `supabase/migrations/` — 73 SQL migration files present (schema is actively evolving; covers tenancy, projects/modules, authoring, ATCs, RLS helpers, workspace bootstrap, access tokens, cross-cutting concerns, workspace invites, and more).

### Infrastructure
- Cloud: Vercel (no `vercel.json` found — zero-config Next.js deploy via Vercel's Git integration, consistent with the `main-integration` git strategy where `main` maps to the Vercel production environment and `staging` maps to the Vercel staging environment)
- CI/CD: No `.github/workflows/` directory found in the target repo (confirmed absent). No GitHub Actions CI/CD pipeline detected locally — deploys appear to be driven entirely by Vercel's native Git integration (auto-deploy on push to `main`/`staging`), not a custom Actions pipeline. Local git hooks exist via Husky (`.husky/`) for pre-commit/lint-staged.
- Monitoring: Discovery Gap — no Sentry/Datadog/PostHog or similar observability dependency found in `package.json`.

## Environments

| Environment | URL | Purpose | Access |
|-------------|-----|---------|--------|
| Local | http://localhost:3000 | Dev | Direct (`next dev`) |
| Staging | https://staging-upexbunkai.vercel.app | Pre-prod testing | Vercel preview alias for the `staging` branch; same Supabase project as local/production (single-tenancy MVP) |
| Production | https://upexbunkai.vercel.app | Live | Read-only. Vercel production alias. Defensive domains `bunkai.io` (primary target domain, not yet wired) and `bankai.io` (redirect) declared in target repo's `.agents/project.yaml` but not yet the live host. |

## Tools and Access

- Issue tracker: JIRA (`upexgalaxy71.atlassian.net`) — resolved via [ISSUE_TRACKER_TOOL]
- Project key: BK
- Database: resolved via [DB_TOOL] (DBHub MCP, session pooler, read-only role — see `dbhub.toml`)
- Docs: In-repo Markdown (target repo root: `README.md`, `CONTEXT.md`, `DESIGN.md`, `INSTALLER.md`, `CLAUDE.md`). No Confluence or Notion references found.
- API spec source: OpenAPI 3.1, generated via `@asteasolutions/zod-to-openapi` (`lib/openapi/registry.ts` → `scripts/openapi-gen.ts` → `public/openapi.json`), served live at `app/api/openapi/route.ts` and browsable at `/api/docs`. Target repo also has a checked-in copy at `upex-bunkai-tms/.context/SRS/api-contracts.yaml` (1293 lines). Consumed by `bun run api:sync` for `api/openapi-types.ts` in this boilerplate; business angle deferred to `/business-api-map`. Found via Phase 2 SRS discovery — see `.context/SRS/architecture.md` §10.

## Access Checklist

- [x] Repository read access — confirmed, target repo present locally at `C:\Users\Genesis Ojose\Documents\Auto\Dojo 4\upex-bunkai-tms`
- [ ] Database access (MCP or direct) — DBHub config present (`dbhub.toml`) but requires `${DBHUB_*}` env vars (host/port/database/user/password) not verified as set in this boilerplate's `.env`
- [ ] Issue tracker access — `ATLASSIAN_EMAIL`/`ATLASSIAN_API_TOKEN` are expected in `.env` per this boilerplate's `.env.example`; not verified live (would require an authenticated `acli` call, out of scope for this read-only discovery pass)
- [ ] Staging environment reachable — not verified (would require a live HTTP request, out of scope for this read-only discovery pass)
- [ ] CI/CD visibility — N/A locally: no GitHub Actions workflows exist in the target repo to have visibility into; deploy visibility would instead be via Vercel dashboard/CLI (not verified)

## Discovery Gaps

- [ ] Monitoring/observability tooling (Sentry, Datadog, PostHog, etc.) — none found in `package.json`, unconfirmed whether handled outside the repo (e.g. Vercel Analytics dashboard-only)
- [ ] Live reachability of staging (`https://staging-upexbunkai.vercel.app`) and production (`https://upexbunkai.vercel.app`) — not tested (read-only discovery, no network calls made)
- [ ] Live Jira/DBHub credential validity — env var names are known (`.env.example`), but whether they are populated and valid was not tested
- [ ] Whether a GitHub Actions pipeline exists remotely-only (e.g. added after this local checkout, or configured via GitHub UI/Vercel dashboard rather than committed YAML) — local filesystem shows no `.github/workflows/`, but this cannot rule out remote-only or dashboard-configured automation
