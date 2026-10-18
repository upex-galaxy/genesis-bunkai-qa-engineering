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
