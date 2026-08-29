# Business Feature Map — Bunkai (upex-bunkai-tms)

> Discovery performed against `C:\Users\Genesis Ojose\Documents\Auto\Dojo 4\upex-bunkai-tms` (read-only). Feature-centric complement to `.context/business/business-data-map.md` (data-centric) — this document does not re-derive entities/flows/state-machines already established there; it catalogs every capability the system exposes and cites its own evidence per feature. Primary sources: `app/api/v1/**` route files, the repo's own committed route-auth-posture inventory (`lib/api/route-capability-coverage.snapshot.json`, generated + test-enforced by `lib/api/route-posture-scan.ts` — the single most reliable endpoint+auth source in the codebase, read in full rather than re-derived by hand), `app/**` pages/forms/dialogs, `components/**`, `package.json`, `.env.example`, the product's own public capability matrix (`app/about/_components/Capabilities.tsx`), and `.context/dev-roadmap.md` (839 lines, grepped for shipped/planned status corroboration, not read in full).

---

## 1. Inventory Summary

| Category | Features | Status breakdown |
|---|---|---|
| Identity & Access | 8 | Core: 8 |
| Product Structure (Workspace/Project/Module) | 5 | Core: 5 |
| Requirements Authoring | 3 | Core: 2, Secondary: 1 (Jira import) |
| ATC Library | 5 | Core: 5 |
| Test Composition & Execution | 6 | Core: 6 |
| Defect Management | 4 | Core: 4 |
| Coverage, Traceability & Metrics | 4 | Core: 4 |
| Coordination (Notifications/Activity/Home) | 4 | Core: 4 |
| Search | 1 | Core: 1 |
| Billing & Account | 2 | Secondary: 1 (billing overview), Core: 1 (account settings) |
| Dev/Ops Surfaces | 2 | Secondary: 2 (API docs, health check) |
| Public/Marketing | 1 | Secondary: 1 |
| **Total** | **45** | **Core: 40, Secondary: 5, Beta: 0, Planned: 0 (tracked separately in §7)** |

**Reading this table**: "Planned: 0" is not "nothing is planned" — it means no in-code feature is *partially* built and flagged incomplete. Genuinely unbuilt capabilities (Test Plans, Billing checkout, CI results upload, chat/mentions) are cataloged as **Planned** in §7 (Feature Flags and WIP), not counted as a shipped Feature Catalog row, because zero code exists for them (confirmed absent from `lib/types/supabase.ts` per `domain-glossary.md` §8).

---

## 2. Feature Catalog by Domain

Each feature lists its `FEAT-NNN` ID, status, the endpoints/UI/roles that realize it, and its dependencies. "Users" uses the four-role hierarchy (`viewer < member < admin < owner`) per `.context/PRD/user-personas.md`.

### 2.1 Identity & Access

| ID | Status | Endpoints | UI | Users | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| FEAT-001 | Core | `POST /api/v1/auth/signup`, `/signin`, `/check-email`, `/confirm`, `/resend` (all `public`) | `app/(auth)/login/page.tsx` | Public (unauthenticated) | Supabase Auth | `lib/api/route-capability-coverage.snapshot.json` (5 `public`-posture auth routes) |
| FEAT-002 | Core | `POST /api/v1/auth/magic-link` (`public`) | Login form, passwordless tab | Public | Supabase Auth (OTP) | snapshot row `auth/magic-link` |
| FEAT-003 | Core | OAuth initiation/callback (framework-level, not a REST route in the snapshot) | `components/.../oauth-buttons` | Public | Supabase Auth + GitHub/Google | `lib/auth/oauth.ts` (`OAUTH_PROVIDERS = ['github','google']`, `OAuthErrorCode`, ADR-0008 automatic identity linking) |
| FEAT-004 | Core | `POST /api/v1/workspaces` (`authenticated`) | `app/(app)/onboarding/page.tsx` + `onboarding-form.tsx` | Authenticated, no active workspace | Workspace creation grants `owner` (BR-007) | `business-data-map.md` Flow 1 |
| FEAT-005 | Core | `GET /api/v1/me` (`authenticated`), `POST /api/v1/me/active-workspace` (`authenticated`) | `components/layout/WorkspaceSwitcher.tsx` | All roles | Session/identity | snapshot rows `me/route.ts`, `me/active-workspace/route.ts` (both `why: "BK-499 pending — identity and notifications"`) |
| FEAT-006 | Core | `GET/POST /api/v1/workspaces/[id]/invites` (`required:workspace:admin`), `POST`/`DELETE /api/v1/workspaces/[id]/invites/[inviteId]` (`required:workspace:admin`), `POST /api/v1/invites/accept` (`authenticated`) | `app/(app)/workspaces/[id]/members/page.tsx` + `members-client.tsx`, `app/invites/accept/page.tsx` | admin/owner issue; any authenticated user accepts | Workspace | `business-data-map.md` Flow 5; snapshot rows |
| FEAT-007 | Core | No admin "remove member"/"change role" REST endpoint found; `DELETE /api/v1/workspaces/[id]/membership` (`authenticated`, self-leave only) | `app/(app)/workspaces/[id]/members/page.tsx` (list is a direct SSR Supabase query, not `/api/v1`) | Self (leave); admin/owner membership list read-only in UI | Workspace membership | `app/(app)/workspaces/[id]/members/page.tsx:19` (`supabase.from('workspaces')...`); no `PATCH`/`DELETE` on another member's row found in the snapshot — see §9 Discovery Gaps |
| FEAT-008 | Core | `GET /api/v1/tokens` (`authenticated`), `POST /api/v1/tokens` (`cookie-only`), `DELETE /api/v1/tokens/[id]` (`cookie-only`) | `app/(app)/settings/tokens/page.tsx`, `components/settings/IssueTokenModal.tsx`, `RevokeTokenModal.tsx`, `TokensList.tsx` | member+ (self-scoped); `workspace:admin` scope requires explicit issuance by admin/owner | PAT scopes (`atc:read`, `atc:write`, `run:execute`, `workspace:admin`) | `domain-glossary.md` §2 PAT scopes; snapshot `why: "Personal access tokens cannot issue/revoke tokens. Use a browser session."` (deliberate: a PAT cannot mint or kill another PAT) |

### 2.2 Product Structure

| ID | Status | Endpoints | UI | Users | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| FEAT-009 | Core | `POST /api/v1/workspaces/[id]/projects` (`authenticated`), `GET` (list, same route family: `recent-projects`) — no `PATCH`/`DELETE` route found for a Project itself | `app/(app)/projects/page.tsx`, `app/(app)/projects/new/page.tsx` + `create-project-form.tsx` | member+ create; all roles read | Workspace | snapshot; §9 gap (no update/delete route) |
| FEAT-010 | Core | `GET/POST /api/v1/projects/[id]/environments` (`required:atc:read`/`write`), `PATCH`/`DELETE /api/v1/environments/[id]` (`required:atc:write`) | `create-environment-form.tsx`, `rename-environment-form.tsx`, `delete-environment-dialog.tsx` | member+ write; viewer read | Project; a Run referencing an Environment blocks its deletion (BR, `domain-glossary.md` §3) | snapshot rows |
| FEAT-011 | Core | `POST /api/v1/projects/[id]/modules` (`required:atc:write`), `PATCH`/`DELETE /api/v1/modules/[id]` (`required:atc:write`), `GET/POST /api/v1/modules/[id]/user-stories` | `create-module-form.tsx`, `rename-module-form.tsx`, `move-module-dialog.tsx`, `delete-module-dialog.tsx`, `project-explorer.tsx` | member+ write; viewer read | Depth ≤ 6 tree (`domain-glossary.md`), soft-delete + move migrations 0014/0015 | snapshot; `supabase/migrations/0014_module_soft_delete.sql`, `0015_module_move.sql` |
| FEAT-012 | Core | No dedicated REST endpoint (renders from the same module/story/ATC tree read) | `app/(app)/projects/[projectSlug]/mind-map-view.tsx` | All roles (read-only view) | Module tree data | `mind-map-view.tsx:1-12` — own header comment: "Coverage / Bug-density modes need run + bug data that doesn't exist yet (§7 data gates), so they render disabled ('soon')" — a **partially-shipped feature within a shipped feature**, see §7 |
| FEAT-013 | Core | N/A (client-side navigation) | `components/layout/CommandPalette.tsx`, `AppSidebar.tsx`, `Topbar.tsx`, `project-sub-nav.tsx` | All roles | — | Product's own Capabilities matrix: "Pestañas y paleta de comandos" = `listo` |

### 2.3 Requirements Authoring

| ID | Status | Endpoints | UI | Users | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| FEAT-014 | Core | `GET/PATCH/DELETE /api/v1/user-stories/[id]` (`required:atc:read`/`write`) | `user-story-form.tsx`, `delete-user-story-dialog.tsx` | member+ write; viewer read | Module; Ready-to-Test gate (BR-004) | `business-data-map.md` Flow 2; snapshot |
| FEAT-015 | Core | `GET/POST /api/v1/user-stories/[id]/acceptance-criteria`, `GET/PATCH/DELETE /api/v1/acceptance-criteria/[id]` (all `required:atc:read`/`write`) | `acceptance-criteria-panel.tsx` | member+ write; viewer read | UserStory; ordering (migration 0017) | snapshot; `supabase/migrations/0017_acceptance_criteria_ordering.sql` |
| FEAT-016 | Secondary (async, poll-based) | `POST /api/v1/imports` (`required:atc:write`), `GET /api/v1/imports/[id]` (`required:atc:read`) | `import-from-jira-dialog.tsx` (2s poll UI) | member+ | External Jira (JQL, `ATLASSIAN_*` optional creds); one active import per project (migration 0020) | `business-data-map.md` Flow 6 (full worker narration); `lib/jira/import-runner.ts`, `lib/jira/client.ts` |

### 2.4 ATC Library

| ID | Status | Endpoints | UI | Users | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| FEAT-017 | Core | `POST /api/v1/atcs` (`required:atc:write`), `PATCH /api/v1/atcs/[id]` (`required:atc:write`) — **no plain `GET /api/v1/atcs/[id]`** in the snapshot (detail likely SSR-read) | `atcs/new/page.tsx`, `atcs/[atcId]/page.tsx`, `components/atcs/AtcEditor.tsx`, `NewAtcEditor.tsx`, `StepEditor.tsx` | member+ write; viewer read | UserStory + ≥1 AC (BR-003, no-orphan) | `business-data-map.md` Flow 2; snapshot |
| FEAT-018 | Core | Enforced inside `POST`/`PATCH` above via `p_ac_ids` (RPC-level, SQLSTATE `45020`) | `components/atcs/AnchoringPanel.tsx` | member+ | AcceptanceCriterion (same User Story only) | `domain-glossary.md` §3 "no orphan ATC" rule |
| FEAT-019 | Core | `POST /api/v1/atcs/[id]/duplicate` (`required:atc:write`) | ATC detail page action | member+ | Atc | snapshot row |
| FEAT-020 | Core | `GET /api/v1/atcs/search` (`required:atc:read`) | `atc-search-filter.tsx`, `components/tests/AtcChainPicker.tsx` (autocomplete) | All roles | Full-text search vector, auto-refreshed on title/tag change (trigger `atcs_refresh_tsv`) | snapshot; `business-data-map.md` §5 trigger table |
| FEAT-021 | Core | `GET /api/v1/atcs/[id]/usage` (`required:atc:read`) | `components/atcs/AtcPreview.tsx` / ATC detail | All roles | TestStep (M:N reuse across Tests) | snapshot; product's own Capabilities: "Reporte de uso en N tests" = `listo` |

### 2.5 Test Composition & Execution

| ID | Status | Endpoints | UI | Users | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| FEAT-022 | Core | `GET/POST /api/v1/tests` (`required:atc:read`/`write`), `GET /api/v1/tests/[id]` (`authenticated`, `why: BK-499 pending`) | `tests/new/page.tsx` + `NewTestBuilder.tsx`, `TestDetailView.tsx`, `TestDetailTabs.tsx` | member+ write; viewer read | ATC library, workspace-wide (not project-scoped — `business-data-map.md` §3 Flow 3) | snapshot; `business-data-map.md` Flow 3 |
| FEAT-023 | Core | `PATCH /api/v1/tests/[id]/reorder` (`required:atc:write`) | `TestReorderClient.tsx` | member+ | `TestStep.id` is the reorder handle, not `atc_id` (`domain-glossary.md` §3) | snapshot; migration `0026_tests_reorder.sql` |
| FEAT-024 | Core | `PUT /api/v1/tests/[id]/tags` (`required:atc:write`) | `TestTagEditor.tsx`, `test-tag-filter.tsx` | member+ | Reserved suite tags (`smoke`/`sanity`/`regression`, case-normalized) | snapshot; `domain-glossary.md` §2 "Reserved suite tags" |
| FEAT-025 | Core | `POST /api/v1/runs` (`required:run:execute`), `POST /api/v1/runs/[id]/steps/[stepId]/mark` (`required:run:execute`) | `components/tests/StartRunButton.tsx`, `components/runs/RunnerView.tsx` (Supabase Realtime channel) | member+ (`run:execute`); viewer cannot mark | Test chain, ProjectEnvironment | `business-data-map.md` Flow 3; snapshot |
| FEAT-026 | Core | `POST /api/v1/runs/[id]/finish`, `POST /api/v1/runs/[id]/abort` (both `required:run:execute`) | `RunnerView.tsx` finish/abort controls | member+ | Run must be `running`; abort requires reason | `business-data-map.md` §4.3; snapshot |
| FEAT-027 | Core | `GET /api/v1/runs/[id]` (`authenticated`), `GET /api/v1/tests/[id]/runs` (`authenticated`), `GET /api/v1/projects/[id]/runs/report` (`authenticated`) | `components/runs/RunHistoryView.tsx`, `ProjectRunsReportView.tsx`, `runs/[runId]/page.tsx`, `runs/page.tsx` | All roles (read); all three routes carry the `why: "BK-499 pending"` capability-scope debt | Run/RunAtc/RunStep snapshots | snapshot (3 rows share the same `why`) |

### 2.6 Defect Management

| ID | Status | Endpoints | UI | Users | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| FEAT-028 | Core | `POST /api/v1/bugs` (`required:atc:write`) | `components/bugs/BugFormDialog.tsx` (pre-filled from a failed Run step) | member+; button structurally absent unless step is `failed` (BR-005) | Run/RunStep must still be `failed` at write time (server re-verifies, 422 `run_step_not_failed`) | `business-data-map.md` Flow 4; `lib/runs/report-bug-view.ts` |
| FEAT-029 | Core | `POST /api/v1/bugs/[id]/status` (`required:atc:write`), `POST /api/v1/bugs/[id]/assign` (`required:atc:write`) | `components/bugs/BugDetailView.tsx` | member+ | Forward-only lifecycle (BR-002); assignee must be active non-`viewer` member | `domain-glossary.md` §3 Bug rule; snapshot |
| FEAT-030 | Core | `GET /api/v1/bugs` (`authenticated`, `why: BK-499`), `GET /api/v1/bugs/[id]` (`authenticated`, `why: BK-499`), `GET /api/v1/projects/[id]/bugs` (`authenticated`, `why: BK-499`) | `components/bugs/BugsListView.tsx`, `bugs/page.tsx`, `bugs/[bugId]/page.tsx` | All roles | Module/severity filters | snapshot |
| FEAT-031 | Core | `GET /api/v1/projects/[id]/bugs/heatmap`, `GET /api/v1/workspaces/[id]/open-bugs` (`required:atc:read`) | `components/bugs/BugsHeatmapView.tsx`, `components/home/OpenBugs.tsx` | All roles | `HeatBucket` (`clean`/`low`/`elevated`/`hotspot`), `TrendDirection` derived enums | `domain-glossary.md` §2 non-DB constants; snapshot |

### 2.7 Coverage, Traceability & Metrics

| ID | Status | Endpoints | UI | Users | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| FEAT-032 | Core | `GET /api/v1/projects/[id]/coverage`, `GET /api/v1/workspaces/[id]/coverage` (`required:atc:read`) | `components/coverage/ProjectCoverageView.tsx`, `components/home/CoverageSummary.tsx` | All roles | `CoverageSegment` (`all`/`gaps`/`notrun`) | `domain-glossary.md` §2; snapshot |
| FEAT-033 | Core | `GET /api/v1/projects/[id]/traceability` (`authenticated`, `why: BK-499`) | `components/traceability/TraceabilityChainView.tsx`, `traceability/page.tsx` | All roles | Full AC→ATC→Test→Run→Bug chain | snapshot; `lib/traceability/chain-view.ts` |
| FEAT-034 | Core | Server-rendered export, no dedicated REST route found (renders an already-fetched chain client-side/SSR) | Traceability page export action | All roles | `lib/traceability/export-snapshot.ts` — "renders an already-fetched evidence chain into a single self-contained HTML document (inline styles, zero external references)" | `lib/traceability/export-snapshot.ts:18-20`; product's own Capabilities: "Export de la cadena como snapshot" = `listo` |
| FEAT-035 | Core | `GET /api/v1/projects/[id]/metrics/recovery-cycles` (`authenticated`, `why: BK-499`) | `components/metrics/RecoveryCycleSection.tsx`, `metrics/page.tsx` | All roles | "Time to green" per story metric | snapshot; `lib/metrics/recovery-cycle.ts` |

### 2.8 Coordination (Notifications, Activity, Home)

| ID | Status | Endpoints | UI | Users | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| FEAT-036 | Core | `GET /api/v1/activity` (`authenticated`, `why: BK-499`) | `components/activity/ActivityView.tsx`, `activity/page.tsx`, `components/home/RecentActivity.tsx` | All roles | `activity_log` table, dotted `entity.verb` events | snapshot; `domain-glossary.md` §1 `ActivityLogEntry` |
| FEAT-037 | Core (shipped 2026-08-03/06, contradicts stale marketing copy — see §9) | `GET /api/v1/workspaces/[id]/notifications` (`authenticated`, `why: BK-499`), `POST .../read`, `POST .../read-all` (`authenticated`) | `components/notifications/NotificationsPanel.tsx`, `NotificationRow.tsx` | All roles (own inbox) | Realtime channel (`lib/notifications/realtime-notifications-channel.ts`), fan-out triggers `activity_log_notify_bug_event`/`_run_event` | `.context/dev-roadmap.md:191-193` ("BK-209 Inbox ✅ dev-done", "BK-211 Run events ✅", "BK-212 Bug events ✅"); snapshot |
| FEAT-038 | Core | `GET/PATCH /api/v1/notification-preferences` (`authenticated`, `why: BK-499`) | `components/settings/NotificationPreferencesGrid.tsx`, `settings/notifications/page.tsx` | All roles (own prefs) | Event type × channel matrix (`run_lifecycle`/`bug_lifecycle`/`mentions` × `in_app`/`email`) | `.context/dev-roadmap.md:194` ("BK-213 Preferences ✅ dev-done"); `domain-glossary.md` §2 |
| FEAT-039 | Core (shipped 2026-08-04) | Aggregation only (reads FEAT-025/030/032's endpoints); no new endpoint of its own | `app/(app)/home/page.tsx` + `WelcomeBanner.tsx`, `ActiveRuns.tsx`, `CoverageSummary.tsx`, `OpenBugs.tsx`, `RecentActivity.tsx`, `RecentProjects.tsx` | All roles | Runs, Bugs, Coverage, Projects/ATCs data | `.context/dev-roadmap.md:92,381` ("BK-254 Home Dashboard... All 4 stories now ✅ SHIPPED 2026-08-04") |

### 2.9 Search

| ID | Status | Endpoints | UI | Users | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| FEAT-040 | Core | `GET /api/v1/search` (`required:atc:read`) | Global search (command palette integration) | All roles | `bunkai_search_workspace` DB function (migration 0071) | `lib/search/workspace-search-isolation.test.ts`; snapshot |

### 2.10 Billing & Account

| ID | Status | Endpoints | UI | Users | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| FEAT-041 | Secondary (read-only, no checkout) | `GET /api/v1/workspaces/[id]/billing` (`required:atc:read`) | `components/billing/BillingOverviewView.tsx`, `settings/billing/page.tsx` | All roles (read); no write path exists | `PLAN_TIERS` (community/cloud/enterprise), `meterState` classifier | `business-data-map.md` §1, §6 "Confirmed absent: no payment processor"; `lib/billing/plan-tiers.ts` |
| FEAT-042 | Core | No dedicated account-update route found in the v1 snapshot (identity mutation likely goes through Supabase Auth SDK directly, not `/api/v1`) | `settings/account/page.tsx`, `components/settings/IdentityCard.tsx`, `LeaveWorkspaceModal.tsx`, `settings/workspaces/page.tsx` | Self | `lib/account/leave-workspace.ts`, `lib/account/format.ts`, `initials.ts`, `role-label.ts` | file inventory above; §9 gap (no REST route observed for profile edit) |

### 2.11 Dev/Ops Surfaces (not end-user product features, cataloged for completeness)

| ID | Status | Endpoints | UI | Users | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| FEAT-043 | Secondary | `GET /api/v1/health` (`public`), `GET /api/v1/route.ts` + `OPTIONS` (`public`/`bypass`) | — | Ops/monitoring | — | snapshot |
| FEAT-044 | Secondary | `GET /api/openapi` (`bypass` — deliberately outside the capability gateway, it serves the spec describing the gateway itself) | `app/api/docs/page.tsx` (Scalar UI) | Public/developers | `@asteasolutions/zod-to-openapi`, `lib/openapi/registry.ts` → `scripts/openapi-gen.ts` → `public/openapi.json` | snapshot; `.context/project-config.md` API spec source |

### 2.12 Public / Marketing

| ID | Status | Endpoints | UI | Users | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| FEAT-045 | Secondary | N/A (static/RSC marketing pages) | `app/page.tsx`, `app/about/page.tsx` + `_components/{BigPicture,Capabilities,Walkthrough,sections}.tsx`, `app/design-tokens/page.tsx`, `app/qa/page.tsx` | Public | — | `app/about/_components/Capabilities.tsx` (product's own shipped-vs-planned matrix, used throughout this document as a corroborating/contradicting source — see §7 and §9) |

---

## 3. CRUD Matrix

Legend: [OK] Full via REST API · [PARTIAL] Partial (SSR-read-only, no-delete-by-design, or a genuinely missing verb) · [NONE] Not available.

| Entity | Create | Read | Update | Delete | Evidence |
|---|---|---|---|---|---|
| Workspace | [OK] `POST /workspaces` | [OK] `GET /workspaces`, `GET /workspaces/[id]` | [OK] `PATCH /workspaces/[id]` (`workspace:admin`) | [NONE] no route found | snapshot |
| WorkspaceMember | [PARTIAL] only via Invite→Accept, no direct "add member" | [PARTIAL] SSR-only (`workspace-members` table read directly in `members/page.tsx`, no REST list route) | [NONE] no "change another member's role" route found | [PARTIAL] `DELETE /workspaces/[id]/membership` is **self-leave only** — no admin "remove member" route found | `app/(app)/workspaces/[id]/members/page.tsx:19`; snapshot; **flagged in §9** |
| WorkspaceInvite | [OK] `POST /workspaces/[id]/invites` | [OK] `GET /workspaces/[id]/invites` | [OK] `POST /workspaces/[id]/invites/[inviteId]` (resend) | [OK] `DELETE /workspaces/[id]/invites/[inviteId]` | snapshot |
| Project | [OK] `POST /workspaces/[id]/projects` | [OK] `GET /workspaces/[id]/projects`, `/recent-projects` | [NONE] no route found | [NONE] no route found | snapshot; **flagged in §9** |
| ProjectEnvironment | [OK] `POST /projects/[id]/environments` | [OK] `GET /projects/[id]/environments` | [OK] `PATCH /environments/[id]` | [OK] `DELETE /environments/[id]` (blocked while referenced by a Run) | snapshot; `domain-glossary.md` §3 |
| Module | [OK] `POST /projects/[id]/modules` | [PARTIAL] child list only (`GET /modules/[id]/user-stories`); no plain module-read route — tree is SSR-rendered | [OK] `PATCH /modules/[id]` (rename/move) | [OK] `DELETE /modules/[id]` (soft-delete, migration 0014) | snapshot; `0014_module_soft_delete.sql`, `0015_module_move.sql` |
| UserStory | [OK] `POST /modules/[id]/user-stories` | [OK] `GET /user-stories/[id]` | [OK] `PATCH /user-stories/[id]` | [OK] `DELETE /user-stories/[id]` | snapshot |
| AcceptanceCriterion | [OK] `POST /user-stories/[id]/acceptance-criteria` | [OK] `GET /acceptance-criteria/[id]`, list via parent | [OK] `PATCH /acceptance-criteria/[id]` | [OK] `DELETE /acceptance-criteria/[id]` | snapshot |
| Atc | [OK] `POST /atcs` | [PARTIAL] `GET /atcs/search`, `GET /atcs/[id]/usage` — **no plain `GET /atcs/[id]`** in the snapshot | [OK] `PATCH /atcs/[id]` | [NONE] no route found (archive-only pattern, by product design — no orphan-run history corruption) | snapshot; `domain-glossary.md` §1 |
| Test | [OK] `POST /tests` | [OK] `GET /tests`, `GET /tests/[id]` | [PARTIAL] `PATCH /tests/[id]/reorder`, `PUT /tests/[id]/tags` — no generic title/description update route found | [NONE] no route found | snapshot |
| Run | [OK] `POST /runs` | [OK] `GET /runs/[id]`, `GET /tests/[id]/runs` | [PARTIAL] state-machine-only transitions (`mark`, `finish`, `abort`) — no free-form field update, by design (immutable execution history) | [NONE] by design — Runs are permanent history | snapshot; `business-data-map.md` §4.3 |
| Bug | [OK] `POST /bugs` | [OK] `GET /bugs`, `GET /bugs/[id]`, `GET /projects/[id]/bugs` | [PARTIAL] `POST /bugs/[id]/status`, `POST /bugs/[id]/assign` — no generic title/description/severity edit route found | [NONE] by design — forward-only lifecycle, never deleted | snapshot; `domain-glossary.md` §3 |
| Milestone | [OK] `POST /projects/[id]/milestones` | [OK] `GET /projects/[id]/milestones` | [OK] `PATCH /milestones/[id]` | [NONE] no route found | snapshot |
| ImportJob | [OK] `POST /imports` (system creates the row) | [OK] `GET /imports/[id]` | [NONE] system-managed only | [NONE] system-managed only | snapshot; by design |
| AccessToken (PAT) | [OK] `POST /tokens` (cookie-only) | [OK] `GET /tokens` | [NONE] tokens are immutable once issued, by design | [OK] `DELETE /tokens/[id]` (cookie-only) | snapshot |
| Notification | [NONE] system-generated only | [OK] `GET /workspaces/[id]/notifications` | [OK] `POST .../[id]/read`, `POST .../read-all` | [NONE] no route found | snapshot |
| NotificationPreference | [NONE] system-seeded per user/event-type | [OK] `GET /notification-preferences` | [OK] `PATCH /notification-preferences` | [NONE] not applicable | snapshot |
| ActivityLogEntry | [NONE] system-generated only | [OK] `GET /activity` | [NONE] immutable audit trail, by design | [NONE] immutable audit trail, by design | snapshot |

---

## 4. API Endpoint Inventory (grouped by domain)

Source of truth for every row below: `lib/api/route-capability-coverage.snapshot.json` (87 handler entries across 67 route files, test-enforced against source via `lib/api/route-capability-coverage.test.ts`). "Auth" column reproduces the posture literal verbatim (`public` / `cookie-only` / `authenticated` / `required:<capability>` / `bypass`).

### Auth

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/signup` | Password sign-up | public |
| POST | `/api/v1/auth/signin` | Password sign-in | public |
| POST | `/api/v1/auth/check-email` | Check if email is registered | public |
| POST | `/api/v1/auth/confirm` | Confirm email/OTP | public |
| POST | `/api/v1/auth/resend` | Resend confirmation | public |
| POST | `/api/v1/auth/magic-link` | Passwordless magic-link sign-in | public |
| GET | `/api/v1/me` | Current identity | authenticated |
| POST | `/api/v1/me/active-workspace` | Switch active workspace | authenticated |

### Workspaces & Access Governance

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/workspaces` | List caller's workspaces | authenticated |
| POST | `/api/v1/workspaces` | Create workspace (onboarding) | authenticated |
| GET | `/api/v1/workspaces/[id]` | Workspace detail | authenticated |
| PATCH | `/api/v1/workspaces/[id]` | Update workspace | required:workspace:admin |
| DELETE | `/api/v1/workspaces/[id]/membership` | Leave workspace (self) | authenticated |
| GET | `/api/v1/workspaces/[id]/invites` | List invites | required:workspace:admin |
| POST | `/api/v1/workspaces/[id]/invites` | Issue invite | required:workspace:admin |
| POST | `/api/v1/workspaces/[id]/invites/[inviteId]` | Resend invite | required:workspace:admin |
| DELETE | `/api/v1/workspaces/[id]/invites/[inviteId]` | Revoke invite | required:workspace:admin |
| POST | `/api/v1/invites/accept` | Accept invite | authenticated |
| GET | `/api/v1/workspaces/[id]/billing` | Billing overview | required:atc:read |
| GET | `/api/v1/tokens` | List own PATs | authenticated |
| POST | `/api/v1/tokens` | Issue PAT | cookie-only |
| DELETE | `/api/v1/tokens/[id]` | Revoke PAT | cookie-only |

### Projects & Structure

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/workspaces/[id]/projects` | Create project | authenticated |
| GET | `/api/v1/workspaces/[id]/projects` | List projects | authenticated |
| GET | `/api/v1/workspaces/[id]/recent-projects` | Recently viewed projects | required:atc:read |
| GET | `/api/v1/projects/[id]/environments` | List environments | required:atc:read |
| POST | `/api/v1/projects/[id]/environments` | Create environment | required:atc:write |
| PATCH | `/api/v1/environments/[id]` | Rename environment | required:atc:write |
| DELETE | `/api/v1/environments/[id]` | Delete environment | required:atc:write |
| POST | `/api/v1/projects/[id]/modules` | Create module | required:atc:write |
| PATCH | `/api/v1/modules/[id]` | Rename/move module | required:atc:write |
| DELETE | `/api/v1/modules/[id]` | Soft-delete module | required:atc:write |
| GET | `/api/v1/modules/[id]/user-stories` | List stories in module | required:atc:read |
| POST | `/api/v1/modules/[id]/user-stories` | Create story in module | required:atc:write |

### Requirements

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/user-stories/[id]` | Story detail | required:atc:read |
| PATCH | `/api/v1/user-stories/[id]` | Update story / Ready-to-Test | required:atc:write |
| DELETE | `/api/v1/user-stories/[id]` | Delete story | required:atc:write |
| GET | `/api/v1/user-stories/[id]/acceptance-criteria` | List ACs | required:atc:read |
| POST | `/api/v1/user-stories/[id]/acceptance-criteria` | Create AC | required:atc:write |
| GET | `/api/v1/acceptance-criteria/[id]` | AC detail | required:atc:read |
| PATCH | `/api/v1/acceptance-criteria/[id]` | Update AC | required:atc:write |
| DELETE | `/api/v1/acceptance-criteria/[id]` | Delete AC | required:atc:write |
| POST | `/api/v1/imports` | Start Jira JQL import | required:atc:write |
| GET | `/api/v1/imports/[id]` | Poll import job status | required:atc:read |

### ATC Library

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/atcs` | Create ATC (steps + assertions) | required:atc:write |
| PATCH | `/api/v1/atcs/[id]` | Update ATC | required:atc:write |
| POST | `/api/v1/atcs/[id]/duplicate` | Duplicate ATC | required:atc:write |
| GET | `/api/v1/atcs/[id]/usage` | ATC reuse report | required:atc:read |
| GET | `/api/v1/atcs/search` | Search/autocomplete ATCs | required:atc:read |

### Tests & Execution

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/tests` | List tests | required:atc:read |
| POST | `/api/v1/tests` | Create test (ATC chain) | required:atc:write |
| GET | `/api/v1/tests/[id]` | Test detail | authenticated |
| PATCH | `/api/v1/tests/[id]/reorder` | Reorder chain | required:atc:write |
| PUT | `/api/v1/tests/[id]/tags` | Set tags | required:atc:write |
| GET | `/api/v1/tests/[id]/runs` | Runs for a test | authenticated |
| POST | `/api/v1/runs` | Start a run | required:run:execute |
| GET | `/api/v1/runs/[id]` | Run detail | authenticated |
| POST | `/api/v1/runs/[id]/steps/[stepId]/mark` | Mark step verdict | required:run:execute |
| POST | `/api/v1/runs/[id]/finish` | Finish run | required:run:execute |
| POST | `/api/v1/runs/[id]/abort` | Abort run | required:run:execute |
| GET | `/api/v1/projects/[id]/runs/report` | Project run report | authenticated |

### Defects

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/bugs` | List bugs | authenticated |
| POST | `/api/v1/bugs` | File bug (from failed step) | required:atc:write |
| GET | `/api/v1/bugs/[id]` | Bug detail | authenticated |
| POST | `/api/v1/bugs/[id]/status` | Transition status | required:atc:write |
| POST | `/api/v1/bugs/[id]/assign` | Assign bug | required:atc:write |
| GET | `/api/v1/projects/[id]/bugs` | Bugs for a project | authenticated |
| GET | `/api/v1/projects/[id]/bugs/heatmap` | Defect heatmap | authenticated |
| GET | `/api/v1/workspaces/[id]/open-bugs` | Open bugs (Home widget) | required:atc:read |

### Coverage, Traceability & Metrics

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/projects/[id]/coverage` | Project coverage | authenticated |
| GET | `/api/v1/workspaces/[id]/coverage` | Workspace coverage | required:atc:read |
| GET | `/api/v1/projects/[id]/traceability` | Traceability chain | authenticated |
| GET | `/api/v1/projects/[id]/metrics/recovery-cycles` | Time-to-green metric | authenticated |

### Coordination

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/activity` | Activity feed | authenticated |
| GET | `/api/v1/workspaces/[id]/notifications` | Notification inbox | authenticated |
| POST | `/api/v1/notifications/[id]/read` | Mark one read | authenticated |
| POST | `/api/v1/workspaces/[id]/notifications/read-all` | Mark all read | authenticated |
| GET | `/api/v1/notification-preferences` | Get prefs | authenticated |
| PATCH | `/api/v1/notification-preferences` | Update prefs | authenticated |
| GET | `/api/v1/workspaces/[id]/active-runs` | Home widget: active runs | required:atc:read |

### Milestones

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/projects/[id]/milestones` | List milestones | required:atc:read |
| POST | `/api/v1/projects/[id]/milestones` | Create milestone | required:atc:write |
| PATCH | `/api/v1/milestones/[id]` | Update milestone | required:atc:write |

### Search & Dev/Ops

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/search` | Global workspace search | required:atc:read |
| GET | `/api/v1/health` | Health check | public |
| GET | `/api/v1/` | API root/discovery | public |
| OPTIONS | `/api/v1/` | CORS preflight | bypass |
| GET | `/api/openapi` | OpenAPI 3.1 spec (JSON) | bypass |

---

## 5. UI Component Inventory

### Forms

| Form | Purpose | File |
|---|---|---|
| Onboarding form | Create first workspace | `app/(app)/onboarding/onboarding-form.tsx` |
| Create project | New project (name, description) | `app/(app)/projects/create-project-form.tsx` |
| Create module | New module in tree | `app/(app)/projects/[projectSlug]/create-module-form.tsx` |
| Rename module | Edit module name | `app/(app)/projects/[projectSlug]/rename-module-form.tsx` |
| Create environment | New project environment | `app/(app)/projects/[projectSlug]/create-environment-form.tsx` |
| Rename environment | Edit environment name | `app/(app)/projects/[projectSlug]/rename-environment-form.tsx` |
| User story form | Create/edit story (title, Markdown, Jira key) | `app/(app)/projects/[projectSlug]/user-story-form.tsx` |
| ATC editor / new ATC editor | Author ATC steps + assertions | `components/atcs/AtcEditor.tsx`, `NewAtcEditor.tsx`, `StepEditor.tsx` |
| Bug form dialog | File a bug from a failed step | `components/bugs/BugFormDialog.tsx` |
| New test builder | Compose an ATC chain into a Test | `components/tests/NewTestBuilder.tsx` |
| Create/edit milestone | Milestone name, description, target date | `components/milestones/CreateMilestoneForm.tsx`, `EditMilestoneForm.tsx` |
| Notification preferences grid | Per-event-type/channel opt-in | `components/settings/NotificationPreferencesGrid.tsx` |

### Dashboards / Views

| View | Purpose | File |
|---|---|---|
| Home dashboard | Landing-page aggregation (runs, bugs, coverage, activity, recent projects) | `app/(app)/home/page.tsx` + `components/home/*.tsx` |
| Project Explorer | Module tree + story/ATC browsing | `app/(app)/projects/[projectSlug]/project-explorer.tsx` |
| Mind-map view | Node-link topology graph (module→story→ATC) | `app/(app)/projects/[projectSlug]/mind-map-view.tsx` |
| ATC table | Tabular ATC list | `components/atcs/AtcTable.tsx` |
| Test detail | Test chain, tags, run history tabs | `components/tests/TestDetailView.tsx`, `TestDetailTabs.tsx` |
| Runner view | Live run execution (Realtime) | `components/runs/RunnerView.tsx` |
| Run history / project run report | Filterable run history | `components/runs/RunHistoryView.tsx`, `ProjectRunsReportView.tsx` |
| Bugs list / heatmap | Defect browsing + trend heatmap | `components/bugs/BugsListView.tsx`, `BugsHeatmapView.tsx` |
| Coverage view | Project coverage gaps | `components/coverage/ProjectCoverageView.tsx` |
| Traceability chain view | AC→ATC→Test→Run→Bug chain | `components/traceability/TraceabilityChainView.tsx` |
| Recovery cycle section | Time-to-green metric | `components/metrics/RecoveryCycleSection.tsx` |
| Activity view | Workspace activity feed | `components/activity/ActivityView.tsx` |
| Notifications panel | Inbox dropdown/panel | `components/notifications/NotificationsPanel.tsx` |
| Billing overview | Seat/project usage meters | `components/billing/BillingOverviewView.tsx` |
| Milestones list / detail | Milestone tracking | `components/milestones/MilestonesListView.tsx`, `MilestoneDetailView.tsx` |

### Actions (modals / dialogs / confirmations)

| Action | Purpose | File |
|---|---|---|
| Delete module dialog | Confirm module soft-delete | `app/(app)/projects/[projectSlug]/delete-module-dialog.tsx` |
| Move module dialog | Re-parent a module in the tree | `app/(app)/projects/[projectSlug]/move-module-dialog.tsx` |
| Delete environment dialog | Confirm environment delete | `app/(app)/projects/[projectSlug]/delete-environment-dialog.tsx` |
| Delete user story dialog | Confirm story delete | `app/(app)/projects/[projectSlug]/delete-user-story-dialog.tsx` |
| Import from Jira dialog | JQL entry + 2s-poll progress | `app/(app)/projects/[projectSlug]/import-from-jira-dialog.tsx` |
| Issue token modal | Create a new PAT (scopes) | `components/settings/IssueTokenModal.tsx` |
| Revoke token modal | Confirm PAT revocation | `components/settings/RevokeTokenModal.tsx` |
| Leave workspace modal | Confirm self-removal | `components/settings/LeaveWorkspaceModal.tsx` |
| Start run button | Launch a run (pick environment) | `components/tests/StartRunButton.tsx` |

---

## 6. Third-Party Integrations

| Service | Purpose | Package | Status | Features using it |
|---|---|---|---|---|
| Supabase (Postgres + Auth + Realtime) | Sole database, sole auth provider, sole tenancy-isolation (RLS), Runner live-update channel | `@supabase/supabase-js`, `@supabase/ssr` | Active | FEAT-001–002, 004–042 (every feature that reads/writes app data) |
| GitHub OAuth | Sign-in identity provider | via Supabase Auth (no separate SDK) | Active | FEAT-003 |
| Google OAuth | Sign-in identity provider | via Supabase Auth (no separate SDK) | Active | FEAT-003 |
| Atlassian Jira (customer-facing) | Pull-based JQL import of issues into a Workspace | REST calls in `lib/jira/client.ts` (no SDK dependency; hand-rolled fetch + backoff) | Active | FEAT-016 |
| Vercel | Hosting, zero-config Git deploy, `after()` background execution slot for the Jira import worker | N/A (platform, not a package) | Active | FEAT-016 (execution host), all pages (hosting) |
| `@scalar/api-reference-react` | Interactive OpenAPI docs UI | `@scalar/api-reference-react` | Active | FEAT-044 |
| `@asteasolutions/zod-to-openapi` | Generates the OpenAPI 3.1 spec from Zod schemas | `@asteasolutions/zod-to-openapi` | Active | FEAT-044 |
| `@dnd-kit/*` | Drag-and-drop (chain reorder, AC ordering) | `@dnd-kit/core`, `sortable`, `utilities` | Active | FEAT-015, FEAT-023 |
| `@monaco-editor/react` | Code-editor widget (likely ATC step/JSON editing) | `@monaco-editor/react` | Active | FEAT-017 (ATC authoring) |
| `react-markdown` + `remark-gfm` + `rehype-sanitize` | Markdown rendering for story/AC bodies | `react-markdown`, `remark-gfm`, `rehype-sanitize` | Active | FEAT-014 |
| Resend | Transactional email | Declared in `.env.example` (`RESEND_API_KEY`) | **Confirmed absent from app code** — `business-data-map.md` §6: "declared in `.env.example` but unwired to app code" | None (planned, unused) |
| Stripe/PayPal or any payment SDK | Checkout/invoicing | — | **Confirmed absent** | FEAT-041 has no write path because of this |
| Sentry/Datadog/PostHog or any APM/observability SDK | — | — | **Confirmed absent** | — |

---

## 7. Feature Flags and WIP

### Flags

No `FEATURE_*` / `ENABLE_*` / `BETA_*` environment-variable prefix exists anywhere in the target repo (`grep -riE "FEATURE_|ENABLE_|BETA_|isEnabled"` across `app/`, `lib/`, `.env.example` returned exactly two false-positive hits: `FEATURE_TICKS` — marketing-copy array in `app/(auth)/login/page.tsx`, unrelated to feature-flagging — and the `feature_flags` **table type** in generated `lib/types/supabase.ts`). A `FeatureFlag` entity exists in the schema (`feature_flags` table, `global`/`workspace` scope — see `domain-glossary.md` §1) but no application code reads or branches on it in this pass; it is schema-ready infrastructure, not an active flag consumed anywhere yet.

| Flag/Mechanism | Description | Default | Environment |
|---|---|---|---|
| `feature_flags` table (`global`/`workspace` scope) | Schema-level toggle infrastructure | N/A — no seeded rows found, no reader code found | All (unused) |

### Planned features (not yet shipped — zero code exists)

| Planned feature | Evidence | Estimated status |
|---|---|---|
| Test Plans | Named in `domain-glossary.md` §8 as post-MVP (epic BK-201); no `test_plans` table in `lib/types/supabase.ts`; `.context/dev-roadmap.md:107` lists it "Post-MVP P1" | Not started |
| Automated/CI run submission + streaming ("Envío y streaming de runs automatizados") | `app/about/_components/Capabilities.tsx:59` marks `próximo` | Not started |
| CI results-file upload ("Subida de archivo de resultados de CI") | `Capabilities.tsx:60` marks `próximo` | Not started |
| ATC Priority field | `domain-glossary.md` §8: "not yet shipped (tracked as BK-399)... not present in `lib/types/supabase.ts`" | Not started |
| Test-design technique field (EP/BVA/State-Transition/etc. on an ATC) | `domain-glossary.md` §8, same BK-399 | Not started |
| Chat channels with @-mentions | `Capabilities.tsx:88` marks `próximo`; `.context/dev-roadmap.md:327` "BK-217 Mentions" | Not started |
| Billing checkout / seat purchase / invoices | `business-data-map.md` §1, §6: "designed in code but not wired... tracked as a future story, BK-231" | Designed, not implemented |
| Bug standalone detail route | `.context/dev-roadmap.md:600`: "`app/(app)/projects/[projectSlug]/bugs/` has `page.tsx` only" — `lib/notifications/entity-routes.ts` "returns `null` for a standalone defect because no route exists to link to" | Partially implemented (list exists, dedicated bug-only route/deep-link does not) |
| Mind-map Coverage / Bug-density view modes | `mind-map-view.tsx:9-11`: "the mockup's Coverage / Bug-density modes need run + bug data that doesn't exist yet... render disabled ('soon')" | Partially implemented — UI toggle exists and is disabled |

---

## 8. QA Relevance

### Feature test coverage matrix

Coverage assessed against the target repo's own `*.test.ts` files (145 total per this boilerplate's Phase 1 assessment) and the confirmed absence of any E2E harness (no Playwright, no `e2e/` runner). "Unit" = pure-function tests (e.g. `plan-tiers.test.ts`); "Integration" = the `*-isolation.test.ts` pattern hitting a real Supabase instance (env-gated); "E2E" = none exist anywhere in the target repo.

| Feature ID | Unit | Integration | E2E | Status |
|---|---|---|---|---|
| FEAT-001–003 (Auth) | Partial | Partial (`lib/account/auth-redirect.test.ts`) | None | Needs automation — highest-traffic entry point with zero E2E |
| FEAT-006/007 (Invites/Membership) | — | — | None | Gap — no isolation test found for invite accept/reject edge cases in this pass |
| FEAT-008 (PAT) | — | — | None | Gap |
| FEAT-014/015 (Stories/ACs) | — | — | None | Gap |
| FEAT-017/018 (ATC authoring, anchoring) | — | — | None | **High-risk gap** — this is the product's core IP (no-orphan-ATC invariant) |
| FEAT-022–027 (Test/Run execution) | — | Yes (`rls-parity.test.ts` covers isolation broadly) | None | Gap — no E2E on the Runner view's realtime marking flow |
| FEAT-028/029 (Bugs) | Yes (`lib/bugs/errors.test.ts` pattern implied by `lib/bugs/errors.ts`) | Yes (`bug-event-trigger-isolation.test.ts`) | None | Partial |
| FEAT-031 (Heatmap) | Yes (`defect-heatmap.test.ts`) | Yes (`defect-heatmap-isolation.test.ts`) | None | Good unit/integration coverage, no E2E |
| FEAT-032 (Coverage) | Yes (`coverage-view.test.ts`) | Yes (`coverage-isolation.test.ts`) | None | Good unit/integration coverage, no E2E |
| FEAT-033/034 (Traceability/Export) | Yes (`chain-view.test.ts`, `export-snapshot.test.ts`) | Yes (`story-traceability-isolation.test.ts`) | None | Good unit/integration coverage, no E2E |
| FEAT-035 (Recovery cycle) | Yes (`recovery-cycle.test.ts`) | Yes (`recovery-cycle-isolation.test.ts`) | None | Good unit/integration coverage, no E2E |
| FEAT-037/038 (Notifications) | Yes (`group-by-day.test.ts`, `relative-time.test.ts`, `view.test.ts`) | Yes (`list-notifications-isolation.test.ts`, `run-event-trigger-isolation.test.ts`, `bug-event-trigger-isolation.test.ts`) | None | Good unit/integration coverage, no E2E |
| FEAT-040 (Search) | — | Yes (`workspace-search-isolation.test.ts`) | None | Partial |
| FEAT-041 (Billing) | Yes (`plan-tiers.test.ts`) | Yes (`billing-overview-isolation.test.ts`) | None | Good, but feature itself is read-only |
| **All 45 features** | — | — | **0** | **Zero E2E automation exists anywhere in the target repo** — this boilerplate's own KATA/Playwright stack has not yet been adapted to this project (per `.context/project-config.md` CI/CD Maturity: None) |

### High-risk features

| Feature | Risk | Reason |
|---|---|---|
| FEAT-017/018 (ATC authoring + no-orphan anchoring) | High | Core product IP ("un ATC sin historia de usuario no puede existir"); enforced only by an RPC-level check (SQLSTATE `45020`), with zero E2E coverage found. A regression here silently breaks the product's entire value proposition. |
| FEAT-025/026 (Run execution/mark/finish/abort) | High | Realtime, stateful, multi-actor (human/agent/CI); `RunAtc`/`RunStep` snapshot-freeze semantics are easy to violate accidentally in a refactor; no E2E coverage. |
| FEAT-007 (WorkspaceMember management) | High | No admin "remove member" or "change role" REST route was found at all — either a genuine functional gap or an undiscovered SSR-only mutation path; either way it is a governance-critical capability that could not be verified from code in this pass. |
| FEAT-006 (RLS-backed tenant isolation, cross-cutting) | High (carried from `business-data-map.md`) | RLS is the *sole* isolation boundary, no app-layer backstop on several routes (`domain-glossary.md` §3 Rule 1) — a missed policy on any new table is a direct cross-tenant data leak. |
| FEAT-016 (Jira import) | Medium-High | Async, eventual-consistency, partial-failure-tolerant worker with a project-level concurrency lock — the single best candidate in the product for race-condition and idempotency bugs (`business-data-map.md` Flow 6 QA note). |
| FEAT-022–027 read endpoints tagged `authenticated` pending BK-499 | Medium | ~20 GET routes (runs, tests, bugs, traceability, coverage, activity, notifications, workspaces) currently only require *any* authenticated session, not a scoped capability — see §9. Not a cross-tenant leak (RLS still applies) but a capability-model gap the codebase itself tracks as open debt. |
| FEAT-041 (Billing) | Low | Read-only, no payment processor wired — cannot be broken by a checkout bug that doesn't exist, but any test plan that assumes a checkout flow wastes effort. |

---

## 9. Discovery Gaps

- **BK-499 capability-scope debt is real and large, not a documentation artifact.** 20 of the 87 snapshot entries carry `posture: "authenticated"` with an explicit `why: "BK-499 pending — <cluster>"` (identity/notifications, reporting reads, runs/tests reads, workspaces/membership). This means roughly a quarter of all GET endpoints in the product currently gate on "is logged in" rather than "does this principal hold the right capability in this workspace" — RLS is still the real isolation boundary underneath, but the API-layer authorization model the codebase itself is actively building (BK-497/BK-498 shipped the posture-declaration mechanism and enforced it on the authoring domain; BK-499 is the still-open follow-up for the read/reporting/identity domains). Any negative-authorization test plan should treat these 20 routes as "known coarse-grained, tracked debt," not silently assume they behave like the `required:<cap>` routes.
- **WorkspaceMember has no discovered admin mutation path.** No REST route removes another member or changes their role; the members page reads directly via SSR Supabase query, and the only membership-mutating route found (`DELETE /workspaces/[id]/membership`) is self-leave only. This could not be resolved from code alone — either the capability genuinely does not exist yet (a real product gap for an `admin`/`owner` persona whose entire `PRD/user-personas.md` value proposition is "member management"), or it is implemented via a not-yet-discovered SSR Server Action. Needs team clarification before writing any membership-management test plan.
- **Project has no Update or Delete route.** Confirmed absent from the 87-entry snapshot. Either projects are immutable-by-design post-creation (plausible — no UI edit form was found either, only `create-project-form.tsx`), or this is an unimplemented gap. Not resolvable from code alone.
- **The public `/about` marketing page's own Capabilities.tsx matrix is stale against the shipped codebase**, and this is not a small discrepancy: it marks "Inbox de notificaciones" (Notifications), "Preferencias por tipo de evento" (Notification Preferences), and "Dashboard de inicio" (Home Dashboard) all as `próximo` (planned), but `.context/dev-roadmap.md` confirms all three shipped in early August 2026 (BK-209/211/212/213 "✅ dev-done"/"SHIPPED", BK-254 Home Dashboard "✅ SHIPPED 2026-08-04"), and this discovery pass independently found live API routes, DB tables, and UI components for all three. "Test plans y milestones" is also marked `próximo` as one bullet, but Milestones alone (not Test Plans) does have a full CRUD-minus-delete API surface and dedicated UI (§2.8 FEAT — actually cataloged under Coverage in this doc's numbering as part of Product Structure's Milestones section, §4 "Milestones" endpoint group) — meaning that single marketing bullet conflates one shipped sub-feature (Milestones) with one genuinely unshipped one (Test Plans) under a single `próximo` marker. **Do not use `Capabilities.tsx` as a shipped/planned oracle without cross-checking `dev-roadmap.md` or the code directly** — it is marketing copy, last verified against the roadmap sometime before 2026-08-03, and per the target repo's own commit history it has not been revisited since (`docs(roadmap): correct BK-500/BK-502 shipped status` commits touch the roadmap doc, never `Capabilities.tsx`).
- **Mind-map Coverage/Bug-density modes are a partially-shipped feature inside a shipped feature.** The toggle UI exists and is user-visible but intentionally disabled ("soon") because the underlying run/bug data join isn't wired yet. A naive feature inventory that only checked "does the mind-map page exist" would over-report completeness here; treat the two disabled modes as Planned, not Core.
- **No plain `GET /api/v1/atcs/[id]`** exists in the snapshot (only `/search` and `/[id]/usage`), and no plain `GET /api/v1/atcs` list route either — meaning the ATC detail page and any project-scoped ATC list almost certainly reads Supabase directly server-side rather than through the versioned API. This matters for API-level test design: an API-only test suite cannot currently fetch a single ATC by ID through `/api/v1` at all, only through the UI's SSR path or ATC search.
- **Account/profile edit (name, avatar, password change) has no discovered `/api/v1` route.** `settings/account/page.tsx` and `IdentityCard.tsx` exist, but any submit likely calls the Supabase Auth SDK directly from a Server Action rather than a versioned API endpoint — could not be verified in this read-only pass without opening every client-component submit handler.
- **`.context/dev-roadmap.md` was grepped, not read in full** (839 lines) — this document's roadmap-derived claims (BK-209/211/212/213/254 shipped dates) are corroborating evidence for what code + `Capabilities.tsx` already showed, not the primary source; a small chance exists that later lines in the roadmap qualify or supersede one of these shipped markers.
- **Resend (email) is fully unwired** (confirmed in `business-data-map.md` §6 and reconfirmed here — `RESEND_API_KEY` exists only in `.env.example`, no import of a Resend SDK found in `app/` or `lib/`). Any notification feature test plan should not assume an actual email is sent for `channel: 'email'` preference rows — the UI/DB half of that capability may be ahead of its delivery mechanism.

---

## 10. Cross-Reference with `business-data-map.md`

- **Entity coverage**: all 28 entities in `domain-glossary.md` §1 map to at least one feature in this document's §2/§3 — no orphan entities in either direction. `FeatureFlag`, `IdempotencyKey`, `MagicLinkToken`, and `UserViewState` are the four entities with **no dedicated user-facing feature** (they are infrastructure: replay-safety, passwordless-token internals, per-user UI-state persistence, and unused flag scaffolding respectively) — consistent with `business-data-map.md` §2 describing three of these four as "cross-cutting (not tenancy-owned, but workspace-scoped)" rather than product features in their own right. This is expected, not a gap.
- **Flow coverage**: all 6 business flows in `business-data-map.md` §3 map cleanly onto this document's features — Flow 1 (Sign-Up/Onboarding) → FEAT-001–004; Flow 2 (Story+AC+ATC authoring) → FEAT-014/015/017/018; Flow 3 (Test compose + Run) → FEAT-022/025/026; Flow 4 (Bug from failed step) → FEAT-028; Flow 5 (Invite/Accept) → FEAT-006; Flow 6 (Jira import) → FEAT-016. No orphan flows.
- **New material this document surfaces that the data map does not**: the data map is silent on Notifications, Home Dashboard, Milestones, Search, Metrics (recovery cycles), Traceability export, Billing UI, and the Mind-Map view — all of these are genuine, shipped, code-verified features with their own API routes and/or UI components, simply outside the data map's flow-centric scope (it explicitly deferred the feature catalog to this document, per its own closing line: "`/business-feature-map` (feature catalog / CRUD matrix, out of scope here per this skill's doctrine)"). This is by design, not a mismatch.
- **One real mismatch worth flagging**: `business-data-map.md` §7 Discovery Gaps does not mention the BK-499 capability-scope debt at all (it predates or was not in scope of that pass), while this document found it to be one of the most QA-relevant facts in the whole codebase (§8, §9 above) — directly discoverable from the same `route-capability-coverage.snapshot.json` file the data map's own Flow narrations occasionally cite but never opened in full. Recommend the data map's Discovery Gaps section be amended to reference BK-499 on its next refresh, since it materially affects how "authenticated" should be interpreted across roughly a quarter of the product's GET surface.
- **No entity or flow contradictions found** between the two documents — every fact this document depends on from the data map (role hierarchy, RLS-as-sole-boundary, forward-only Bug lifecycle, Run/RunAtc/RunStep snapshot-freeze, Jira import concurrency lock) was used as given and did not need correction.

---

*Business Feature Map complete. Cross-referenced against `.context/business/business-data-map.md`, `.context/business/domain-glossary.md`, `.context/PRD/user-personas.md`, `.context/PRD/user-journeys.md`, and `.context/project-config.md`. Primary technical evidence: `lib/api/route-capability-coverage.snapshot.json` (87 handler postures), `app/about/_components/Capabilities.tsx` (product's own capability matrix), `.context/dev-roadmap.md` (grepped for shipped-status corroboration).*
