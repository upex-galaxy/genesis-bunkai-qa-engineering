# Backend Infrastructure — Bunkai (upex-bunkai-tms)

> Discovery performed against `C:\Users\Genesis Ojose\Documents\Auto\Dojo 4\upex-bunkai-tms` (read-only). Single Next.js 15 app — no split backend service, no monorepo tooling. Backend = `app/api/v1/**` route handlers + `lib/<domain>/` modules. Cross-references `.context/project-config.md` and `.context/SRS/architecture.md` (do not re-derive what those already establish).

---

## Runtime Environment

| Aspect | Value | Evidence |
|---|---|---|
| Language | TypeScript (strict) | `tsconfig.json` — `"strict": true`, `target: ES2022` |
| Runtime | Bun (dev/build/test) + Node.js (types installed) | `bun.lock` present (not `package-lock.json`/`yarn.lock`/`pnpm-lock.yaml`); `devDependencies` includes both `@types/bun` and `@types/node` |
| Runtime version pin | **Not found** — no `engines` field in `package.json`, no `.nvmrc`, no `.node-version`, no `bunfig.toml` | Confirmed absent by direct read/glob of target repo root |
| Package manager | bun (per lockfile) | `bun.lock` at repo root |
| Framework | Next.js 15 (`^15`), React 19 (`^19`) | `package.json` dependencies |

**Discovery Gap**: no pinned runtime version anywhere in the repo. A CI/local-dev machine could run any Bun/Node version and get silently different behavior. Recommend flagging to the target team before wiring automation that depends on a specific Bun version.

---

## Package Scripts

Read directly from `upex-bunkai-tms/package.json` — do not re-quote from memory elsewhere.

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Local dev server (no `--turbo` flag — Webpack, not Turbopack) |
| `build` | `next build` | Production build |
| `start` | `next start` | Run production build |
| `typecheck` / `types:check` | `tsc --noEmit` | Type checking (duplicate script names, same command) |
| `test` | `bun test` | Runs the co-located `*.test.ts` suite (bun's built-in test runner — not Jest/Vitest) |
| `lint:check` / `lint:fix` | `eslint .` / `eslint --fix .` | ESLint, flat config via `@antfu/eslint-config` |
| `format:check` / `format:fix` | `prettier --check/--write '**/*.{json,yml,yaml,css,scss,html}'` | Prettier — **scoped to json/yml/css/html only, not `.ts`/`.tsx`** (ESLint owns TS formatting via `@antfu/eslint-config`) |
| `vars:check` | `bun scripts/lint-vars.ts` | Lints `{{VAR}}`-style template usage |
| `vars:env:check` | `bun scripts/check-vars.ts` | Cross-checks `.env` against the variables manifest |
| `skills:check` | `bun scripts/lint-skills.ts` | Skill-file lint |
| `skills:registry` / `skills:registry:check` | `bun scripts/build-skill-registry.ts [--check]` | Skill registry generation/freshness |
| `repo:check` | `format:check && lint:check && types:check && vars:check && vars:env:check && skills:check && skills:registry:check` | Full local gate — **note: does NOT include `bun test`** |
| `repo:fix` | fix variants of the above | Auto-fix pass |
| `api:sync` | `bun scripts/sync-openapi.ts` | Syncs OpenAPI types (this boilerplate consumes it as `bun run api:sync`; here it's the target's own copy) |
| `openapi:gen` | `bun scripts/openapi-gen.ts` | Generates `public/openapi.json` from `lib/openapi/registry.ts` |
| `openapi:diff` | `bun scripts/openapi-diff.ts` | Diffs OpenAPI spec versions |
| `types:gen` | `bun scripts/gen-supabase-types.ts` | Generates Supabase-derived TS types |
| `jira:sync-fields` / `jira:sync-workflows` / `jira:sync-issues` / `jira:sync-link-types` / `jira:check` | various `bun scripts/*.ts` | Jira sync tooling (mirrors this boilerplate's own `.agents/` sync scripts — the target repo ships its own copy of this AI-tooling layer) |
| `git:policy` | `bun scripts/git-policy.ts` | Git branch-protection policy check |
| `jira:url` | `bun scripts/atlassian-url.ts` | Resolves Atlassian host from `.agents/project.yaml` |
| `clean` | `rm -rf node_modules dist .next` | Clean build artifacts |
| `prepare` | `husky` | Installs Husky git hooks (auto-runs on `bun install`) |

**No `db:migrate`/`db:seed`/`db:reset`-style npm script exists.** Migrations are applied via the Supabase CLI directly against `supabase/migrations/` (see Database Configuration below) — there is no wrapper script in `package.json`.

**Confirmed absent**: no `.github/workflows/` directory — none of these scripts are wired into any CI gate. `bun test` is not called by any other script (not even `repo:check`) — nothing runs the test suite automatically anywhere in this repo today.

---

## Core Dependencies

| Category | Package | Version | Purpose |
|---|---|---|---|
| Framework | `next` | `^15` | App Router, Route Handlers |
| Framework | `react` / `react-dom` | `^19` | UI runtime |
| Database client | `@supabase/supabase-js` | `^2.106.0` | Core Supabase client (RPC, PostgREST) |
| Database client | `@supabase/ssr` | `^0.10.3` | Cookie-based SSR session client (used by `middleware.ts`, `lib/supabase/server.ts`) |
| Validation | `zod` | `^4.4.3` | Runtime validation across `lib/<domain>/validation.ts`, `lib/env.ts` |
| API spec | `@asteasolutions/zod-to-openapi` | `^8.5.0` | Zod → OpenAPI 3.1 registry (`lib/openapi/registry.ts`) |
| API docs UI | `@scalar/api-reference-react` | `^0.9.38` | Renders `/api/docs` from the generated spec |
| ORM | **None** | — | No Prisma/Drizzle/TypeORM — direct Supabase client calls only, funneled through `lib/supabase/{client,server,admin,rpc}.ts` |
| Auth | **None dedicated** | — | Auth is Supabase Auth (managed) + custom PAT layer in `lib/api/pat.ts` — no NextAuth/Passport/jose |
| Lint | `@antfu/eslint-config` | `^4.16.0` | Flat ESLint config (also lints TS formatting — no separate Prettier pass on `.ts`) |
| Format | `prettier` | `^3.7.4` | JSON/YAML/CSS/HTML only |
| Test runner | `bun:test` (built into Bun) | — | 145 `.test.ts` files repo-wide (per this boilerplate's own Phase 1 assessment) — not a `devDependency`, ships with Bun |
| Git hooks | `husky` + `lint-staged` | `^9.1.7` / `^16.2.7` | Pre-commit/pre-push gates |
| Type checking | `typescript` | `^5.9.3` | Strict mode |

---

## Environment Variables

Source: `upex-bunkai-tms/.env.example` (read directly, no values pasted — key names and example formats only). Cross-checked against `lib/env.ts` (the actual runtime-validated schema).

### CRITICAL FINDING — `.env.example` and `lib/env.ts` disagree on Supabase key names

- `.env.example` documents the **new-style** Supabase key pair: `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` (plus `NEXT_PUBLIC_SUPABASE_URL`).
- The actual runtime schema in `lib/env.ts` — and `middleware.ts`, which reads `process.env` directly — require the **legacy-style** pair: `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. `lib/env.ts` throws a hard startup error (`[bunkai/env] Invalid environment variables`) if `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` are missing — `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` are **not read anywhere in application code** (not found by grep across `.ts`/`.tsx`).
- Practical effect: copy-pasting `.env.example` as-is and filling in the documented new-style names will NOT satisfy `lib/env.ts` — the app will fail to boot. This is a doc/code drift bug in the target repo, not a boilerplate discovery error. Flag to the target team; for THIS QA repo's purposes, treat `lib/env.ts` as authoritative over `.env.example` for these two keys.

### Required (app will not start without these — enforced by `lib/env.ts` Zod schema)

| Variable | Format (from `.env.example` / code) | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Client + server; `z.string().url()` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | opaque JWT-shaped string | **Not present in `.env.example` under this name** — see drift note above; required by `lib/env.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | opaque string | **Not present in `.env.example` under this name** — see drift note above; server-only, bypasses RLS, guarded by `server-only` import |

### Optional (has a default or is conditionally required)

| Variable | Default / Condition | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | defaults to `http://localhost:3000` in `lib/env.ts` (`z.string().url().default(...)`) | Used for auth redirects, OAuth callbacks, invite links; `.env.example` also sets it explicitly for local dev |
| `SUPABASE_JWT_SECRET` | optional in `lib/env.ts` (`.optional()`) | Needed once the Bearer-PAT layer verifies Supabase-issued JWTs directly |
| `ATLASSIAN_URL` / `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` | all optional in `lib/env.ts` | Missing/invalid → Jira Import Job fails with `jira_unauthorized`, not an app-boot error |

### External Service (only needed when a feature is enabled — declared in `.env.example`, not in `lib/env.ts`'s enforced schema)

| Variable | Service | Notes |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase MCP control plane | Admin-scope PAT for project/migration management via MCP — not used by the running app |
| `POSTGRES_HOST` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DATABASE` / `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` / `POSTGRES_PRISMA_URL` | Direct Postgres connection | `.env.example` labels these "Required if using Prisma / raw SQL" — **template boilerplate text; no Prisma dependency exists in `package.json`, so these are effectively unused in this app today** |
| `RESEND_API_KEY` | Resend (transactional email) | No `resend` SDK dependency found in `package.json` — declared in `.env.example` but not wired to app code found in this pass (matches architecture.md's "Email delivery" Discovery Gap) |
| `TAVILY_API_KEY`, `N8N_API_URL`, `N8N_API_KEY` | AI-tooling MCPs, not app runtime | Same AI-tooling layer this boilerplate itself uses — irrelevant to the deployed Bunkai app |
| `QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD` | Dedicated automation login identity | For live-UI validation/automated probes — app's own login path only, never a service-role bypass (per `.env.example` comment) |

**Never paste actual values from any real `.env` into this or any other doc — key names and example formats only, per this repo's Critical Rule #1.**

---

## Database Configuration

| Aspect | Value | Evidence |
|---|---|---|
| Type | PostgreSQL 16 | `.context/project-config.md`, `.context/SRS/architecture.md` |
| Provider | Supabase (managed) | project ref `fmbpikzpkafptqximhxn` — **single project shared across local/staging/production** (no environment-level DB isolation) |
| ORM | None | Direct `@supabase/supabase-js` calls funneled through `lib/supabase/{client,server,admin,rpc}.ts` |
| Data-mutation pattern | Named Postgres RPC functions (`bunkai_*`), not raw table writes | See `.context/SRS/architecture.md` §5 RPC inventory — business invariants enforced transactionally inside Postgres, not in an app-layer service class |
| Migration tool | Supabase CLI against `supabase/migrations/` | 73 SQL files present in `upex-bunkai-tms/supabase/migrations/` |
| Local Supabase stack config | **Not found** — no `supabase/config.toml`, no `supabase/seed.sql` | Confirmed absent by directory listing; the `supabase/` folder contains only `migrations/` |
| Access for QA/automation | DBHub MCP via Supabase **session pooler** (port 5432, not the 6543 transaction pooler), read-only role `qa_inspector_ro.<project-ref>` | `.context/project-config.md`, `dbhub.toml` in this boilerplate |

**Discovery Gap**: because `supabase/config.toml` is absent, `supabase start` (local Dockerized Postgres) cannot be run out-of-the-box — the target repo appears to develop against the **shared remote Supabase project directly**, even at `local` env. This reinforces the single-shared-project HIGH-risk finding already flagged in `.context/SRS/architecture.md` §12 QA Relevance: any automated test that creates/mutates data must be strictly workspace-scoped and cleanup-aware, because there is no environment-level data isolation to fall back on — not even for local dev.

### Migration Commands

No wrapper npm script exists (see Package Scripts above). Bare Supabase CLI usage against the linked project (exact invocation not verified in this read-only pass — the CLI itself is not a repo dependency, and no `supabase/config.toml` is present to confirm a project link):

```bash
# Not verified locally — Supabase CLI is not a project devDependency
# and no supabase/config.toml exists to confirm a linked project ref.
# Documented for completeness based on standard Supabase CLI usage;
# treat as a Discovery Gap until confirmed against the target team.

# Apply pending migrations to the linked project
supabase db push

# Create a new migration file
supabase migration new <name>

# No seed script found — no supabase/seed.sql
```

---

## Build Configuration

| Aspect | Value | Evidence |
|---|---|---|
| Output mode | Default Next.js server build (no `output: 'standalone'` set) | `next.config.ts` — only `reactStrictMode`, `outputFileTracingRoot`, `typedRoutes`, `images.remotePatterns` are set; no `output` key |
| Bundler (build/prod) | Webpack (Next.js default) | No `--turbo` flag anywhere in scripts |
| `outputFileTracingRoot` | `path.resolve(import.meta.dirname)` | Pins file tracing root to the repo root — relevant if this app is ever nested under a monorepo later |
| Typed routes | Enabled (`typedRoutes: true`) | Next.js generates typed `Link`/`router.push` route unions at build time |
| Image domains | `images.remotePatterns: []` | No external image domains currently allow-listed — any `next/image` use with a remote `src` today would need a config addition first |
| TypeScript | Strict mode, `target: ES2022`, path aliases `@/*`, `@app/*`, `@components/*`, `@lib/*` (no relative-import convention — matches this boilerplate's own `@api/`/`@schemas/`/`@utils/` alias pattern) | `tsconfig.json` |

---

## Local Development Setup

```bash
# 1. Clone and install dependencies
git clone https://github.com/upex-galaxy/upex-bunkai-tms.git
cd upex-bunkai-tms
bun install

# 2. Set up environment
cp .env.example .env
# Edit .env — at minimum, per lib/env.ts's ENFORCED schema (not .env.example's
# stale key names — see Environment Variables > CRITICAL FINDING above):
#   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase dashboard>
#   SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase dashboard>
#   NEXT_PUBLIC_APP_URL=http://localhost:3000

# 3. Database — no local Supabase stack config exists (no supabase/config.toml).
#    Point at the shared remote Supabase project (see Database Configuration
#    above for the single-shared-project caveat); apply the 73 files in
#    supabase/migrations/ via the Supabase CLI or dashboard SQL editor.
#    (Not verified in this read-only pass — flagged as a Discovery Gap.)

# 4. Start development server
bun run dev

# 5. Verify
curl http://localhost:3000/api/v1/health
```

---

## Health Check Endpoints

| Endpoint | Method | Auth | Response shape | Evidence |
|---|---|---|---|---|
| `/api/v1/health` | `GET` | `public` (no auth required) | `{ ok: true, service: 'bunkai-tms', env: <environment>, ts: <ISO timestamp> }` | `app/api/v1/health/route.ts` (full file read) — `dynamic = 'force-dynamic'`, wrapped by `withApiHandler` |

This is a genuine, code-confirmed health endpoint (not absent, contrary to this briefing's initial assumption) — usable directly by `/regression-testing` or any uptime probe.

---

## Discovery Gaps

- **No pinned runtime version** — no `engines`, `.nvmrc`, `.node-version`, or `bunfig.toml`. Any Bun/Node version drift between local dev and Vercel's build image is undetectable from the repo alone.
- **`.env.example` documents the wrong Supabase key names** (`SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` vs. the actually-enforced `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` in `lib/env.ts`). This will block a naive first-time setup. Worth raising to the target team before `/adapt-framework` wires this boilerplate's own `.env`/fixtures against it.
- **No local Supabase stack config** (`supabase/config.toml`, `seed.sql` both absent) — local dev appears to point at the shared remote project directly; migration-apply workflow for a fresh clone is not fully verified.
- **Migration commands not verified** — Supabase CLI is not a repo dependency and no config.toml confirms a linked project; the commands documented above are standard-usage best-guesses, not confirmed against this repo's actual workflow.
- **`bun test` is wired into nothing** — not part of `repo:check`, `repo:fix`, any Husky hook, or any CI (none exists). 145+ co-located `.test.ts` files exist but nothing runs them automatically today (mirrors this boilerplate's own Phase 1 Project Assessment finding).
- **Auth mechanism (`middleware.ts`) — see below, documented in full, not a gap**, but note the architectural inconsistency already flagged in `.context/SRS/architecture.md` §6: `/workspaces/[id]/members` is NOT in `PROTECTED_PREFIXES` and instead relies on a page-level `redirect()` call — two different enforcement mechanisms for "must be logged in" in the same app.

---

## Auth Flow — `middleware.ts` (full file read, single most important input for `/adapt-framework`)

**Mechanism**: cookie-based Supabase session, refreshed on every request via `@supabase/ssr`'s `createServerClient`. This is a genuine session **refresh + redirect gate**, not a JWT-decode-only check — it calls `supabase.auth.getUser()` on every matched request, which round-trips to Supabase Auth to validate/refresh the session.

| Detail | Value |
|---|---|
| Session validation method | `supabase.auth.getUser()` (real Supabase Auth call, not a local JWT decode) — per the code's own comment: "do not run any logic between `createServerClient` and `getUser`; doing so risks the session not being refreshed before route logic runs" |
| Cookie handling | `@supabase/ssr`'s `cookies.getAll()`/`cookies.setAll()` contract — refreshed cookies are written back to BOTH the incoming `NextRequest` (so downstream route handlers see the fresh session) and the outgoing `NextResponse` (so the browser persists it) |
| Cookie names | Not hardcoded in `middleware.ts` — `@supabase/ssr` manages its own cookie name(s) internally (typically `sb-<project-ref>-auth-token`, split into chunks if large); not independently confirmed by inspecting a live cookie jar in this read-only pass |
| Protected path prefixes | `PROTECTED_PREFIXES = ['/home', '/projects', '/onboarding', '/settings', '/activity']` (exact match or `startsWith(prefix + '/')`) |
| Public/bypass prefixes | `PUBLIC_PREFIXES = ['/login', '/auth', '/api/auth']` — checked first; a public path is never redirected even if it happens to also match a protected prefix |
| Redirect target on unauthenticated protected-path access | `302` to `/login?next=<original pathname + search>` |
| Matcher (which requests run through this middleware at all) | `['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)']` — excludes Next static assets, the favicon, and any path containing a dot (i.e., static files) |
| Known inconsistency | `/workspaces/[id]/members` is deliberately NOT in `PROTECTED_PREFIXES`; it's gated by an explicit `redirect('/login?next=...')` inside the page component itself instead — a second, separate enforcement mechanism, already flagged as an architectural inconsistency in `.context/SRS/architecture.md` §6 |
| API-layer auth (separate from middleware) | REST routes under `app/api/v1/**` use a second identity-resolution path — `resolveIdentity()` in `lib/api/principal.ts` — supporting BOTH the cookie session (SSR client, `auth.getUser()`) AND a `Authorization: Bearer bk_pat_*` Personal Access Token (minted per-request user JWT via `impersonatingClient()`). Middleware only gates UI page navigation; it does not gate the API's own auth posture per route (`public`/`cookie-only`/`authenticated`/capability-scoped, declared per-route in `lib/api/handler.ts`) |
