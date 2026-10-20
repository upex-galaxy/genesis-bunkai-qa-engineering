# Test Automation Plan: BK-508

> Ticket: BK-508 — Settings | Request an export of my workspace data
> Type: integration + e2e (hybrid ticket, three waves)
> Sprint: post-sprint automation (Story is QA Approved; Tests promoted in `/test-documentation` Stage 4)
> Created: 2026-10-11
> Spec: `spec.md` (same folder). Open questions are numbered Q1..Qn in §9 and referenced from `spec.md`.

## 1. Ticket Summary

- **What to test**: Owner-only Data export section in Settings, the cookie-only export API (`POST`/`GET /api/v1/workspaces/{id}/data-export`, `GET .../download`), the async job lifecycle and 168 h window, the Activity Stream audit rows, and the ZIP content guarantees.
- **Acceptance Criteria**: AC-01, AC-02, AC-04, AC-05, AC-06, AC-07, AC-09, AC-10, AC-11, AC-12, AC-14, AC-15, AC-16 (AC-03 and AC-08 only through excluded Manual TCs; AC-13 not covered by any Candidate TC, see §9 Q9).
- **Dependencies**: none upstream. Downstream: BK-512 (delete workspace) supplies the cleanup endpoint this suite relies on.

### How the job completes (determined, not assumed)

`POST .../data-export` inserts a `queued` row and returns `202 { export_job_id, status }`; the route schedules `runWorkspaceExportJob` with Vercel `after()` (dev implementation plan "API"; data map `flow-workspace-export`; `automatic-processes` lists "Export worker: after() on export request"). No cron, no queue: the job starts right after the response on the same deployment, claims `queued -> running`, uploads the ZIP, then sets `completed` + `expires_at = completed_at + 168 h`, or `failed` + `error_message`. The UI itself polls every 4 s. Therefore:

- Tests poll `GET .../data-export` with `expect.poll` (intervals 500 ms -> 1 s -> 2 s, timeout `EXPORT_SETTLE_TIMEOUT_MS` = 30 s; the best-effort cleanup wait uses `EXPORT_CLEANUP_SETTLE_TIMEOUT_MS` = 10 s, so settle + cleanup + setup fit the 60 s test timeout that afterEach shares). Never a fixed sleep.
- `failed` while waiting for `completed` fails fast and prints `error_message`.
- The poll also asserts the job id it settles on is the one that was requested (guards against reading a stale row).

## 2. Architecture Decisions

> **ADR promotion check.** Decision D1 changes how auth rides requests in tests (an "auth-in-tests change") and is reused by every future cookie-only domain (tokens, delete/restore workspace, active-workspace switch). Draft `ADR-NNNN-cookie-only-requests-in-api-components.md` as `Proposed` when Wave 1 lands; leave `See ADR-NNNN` here. See ADR-0018 (`.context/ADR/ADR-0018-cookie-only-requests-in-api-components.md`).

| # | Decision | Value | Rationale |
|---|----------|-------|-----------|
| D1 | Cookie-only calls | Add `cookieOnly?: boolean` to `RequestOptions` in `ApiBase` (L2); `buildHeaders` omits `Authorization` when set. Every helper and ATC in this suite passes it, except the PAT negative ATC which sets the header explicitly | `TestFixture` and the `api` fixture propagate the `api-setup` PAT to every component. Cookie-only routes (export, tokens issue/revoke, delete workspace, active-workspace switch) answer 403 when a Bearer header is present, and a workspace-bound PAT reads a synthetic workspace's activity as an empty page. `WorkspaceExportApi` already solves this locally with a no-op `setAuthToken`; keep that override untouched (no churn) but do not copy it into 3 more components. Alternative rejected: one no-op override per component (drifts, and `WorkspacesApi.listWorkspaces` legitimately accepts Bearer). |
| D2 | Synthetic workspace per test | `POST /api/v1/workspaces` in `beforeEach`, `DELETE /api/v1/workspaces/{id}` in `afterEach` (tolerates 404) | Same Supabase project backs every env. Soft-delete revokes the workspace's PATs and invites in the same transaction and makes every workspace-scoped endpoint answer not found, so cleanup also neutralises leftovers. |
| D3 | Steps module | `WorkspaceExportSteps` in `tests/components/steps/`, instantiated directly (not a fixture) | The chain "create workspace -> (set active) -> request -> poll to completed" repeats in 10+ tests across 8 files: above the 3+/3+ threshold. |
| D4 | Archive reading | `tests/utils/archive.ts`: `extractArchive(bytes): Record<string, string>` (path -> UTF-8 text), `isNdjson(text)`, `parseJsonArray(text)`. Silent-fail utilities (return `null` on malformed input). New devDependency `fflate` (`unzipSync`) | Agnostic utility (no Playwright, no domain), so `tests/utils/` is the right DRY home. `fflate` is the library the product writes the ZIP with, zero-dependency. Approved (Q8). |
| D5 | UI expiry without DB writes | Playwright `page.clock.setFixedTime(expires_at + offset)` before navigation, on a REAL completed export | The UI derives `expired` client-side (`DataExportView` `deriveState`: `new Date(expires_at) > Date.now()`), so moving the browser clock reaches the expired and boundary states through the real data path. Server-side expiry cannot be reached this way (BK-1010). |
| D6 | PAT negative calls | Inside `rejectPatOnExportEndpoint`, a cookieless `APIRequestContext` from `request.newContext()` (`@playwright/test`), Bearer only, disposed in `finally` | Proves the PAT alone is not accepted (AC-15 literal). The integration context always carries the session cookie from `.auth/api-session.json`, which would turn the test into "Bearer + cookie" (a weaker, already-measured fact). Private helper in `WorkspaceExportApi`; promote to `ApiBase` only when a second component needs it. |
| D7 | Non-Owner sessions (BK-1001) | Role sessions via headless sign-in in a new setup project `roles-setup` writing `.auth/role-<role>.json`; the test opens a second browser context per role | The `test` fixture is bound to the Owner session; a role check needs a second identity in the same test (owner creates + invites, role accepts + looks). See `atc/BK-1001-non-owner-hidden.md`. |

### Component Strategy

| Decision | Value | Rationale |
|----------|-------|-----------|
| API component (export) | `WorkspaceExportApi.ts` (EXISTS, manifest: 1 ATC BK-1018) | Extend: all export endpoints already owned here |
| API component (workspaces) | `WorkspacesApi.ts` (EXISTS, manifest: 0 ATCs) | Extend with helpers only (create, delete, set active, invites) |
| API component (activity) | `ActivityApi.ts` (NEW) | `GET /api/v1/activity` has no owner yet |
| API component (tokens) | `TokensApi.ts` (NEW) | `POST`/`DELETE /api/v1/tokens` has no owner yet |
| API components (content seeding) | `ProjectsApi.ts`, `UserStoriesApi.ts`, `AtcsApi.ts`, `TestsApi.ts`, `RunsApi.ts` (NEW, helpers only) | Needed only to seed Run history for BK-1015 / BK-1013 / BK-1014. Alternative in Q4 |
| UI component | `DataExportPage.ts` (NEW) | `/settings/data-export`; Settings nav link is located inline (one page owns it for now) |
| Fixture (API TCs) | `{ api }` | API only, no browser |
| Fixture (UI TCs) | `{ test }` | UI flows need API setup (synthetic workspace, set active, completed export) in the same test |
| Test files | `tests/integration/workspace-export/*.test.ts`, `tests/e2e/workspace-export/*.test.ts` | camelCase verb names, §5 |
| Preconditions | `WorkspaceExportSteps` | D3 |

### [E2E ONLY] UI Elements

The product renders no `data-testid` on this screen (`DataExportView`), so locators are role/text based, inline in each ATC. A `data-testid` request to dev is optional (Q10).

| Element | Locator Strategy | Locator Value |
|---------|------------------|---------------|
| Settings nav entry | role | `getByRole('link', { name: 'Data export' })` inside the Settings navigation |
| Explanation card | text | heading `What's in an export`; body contains `downloadable for 7 days` |
| Status card | text | heading `Export status` |
| Never-requested | text + role | `No export has been requested yet`; `getByRole('button', { name: 'Request export' })` |
| Preparing | text | `An export is being prepared, requested` |
| Ready | text + role | `Your export is ready. Downloadable until`; `getByRole('link', { name: 'Download archive' })` |
| Expired | text + role | `The last export has expired`; `getByRole('button', { name: 'Request a new export' })` |
| Non-Owner direct hit | page shell only, status card shows no export data | assert absence of every lifecycle text above + no `Download archive` link |

Note: TC03's Jira design says the window is stated as "168 hours"; the shipped copy says "7 days" (explanation card) and "Downloadable until <date>" (ready card). Assert the shipped copy; the 168 h number is asserted at API level (`expires_at - completed_at`).

### [INTEGRATION ONLY] API Details

| Aspect | Value |
|--------|-------|
| Endpoints | `POST`/`GET /api/v1/workspaces/{id}/data-export`, `GET /api/v1/workspaces/{id}/data-export/download`, `GET /api/v1/activity?workspace_id=`, `POST /api/v1/workspaces`, `DELETE /api/v1/workspaces/{id}`, `POST /api/v1/me/active-workspace`, `POST /api/v1/tokens`, `DELETE /api/v1/tokens/{id}`, `POST /api/v1/workspaces/{id}/invites`, `POST /api/v1/invites/accept`, seeding chain (§4) |
| OpenAPI Types | `GetWorkspaceExportResponse`, `RequestWorkspaceExportResponse`, `WorkspaceExport` (`@schemas/workspace-export.types`); `WorkspaceWithRole` (`@schemas/workspaces.types`); new facades `@schemas/activity.types`, `@schemas/tokens.types`, `@schemas/workspaces.types` additions (create body/response, invite body/response) |
| Auth Required | Cookie session (D1). Owner role for every export route |
| Return Pattern | GET/DELETE `[APIResponse, TBody]`; POST `[APIResponse, TBody, TPayload]`; download `[APIResponse, Buffer]` (raw `this.request.get`, the JSON parser in `apiGET` would swallow the binary) |
| Status map | 202 enqueued · 200 poll / download · 403 non-Owner or Bearer PAT · 404 download when never requested / not ready / expired (collapsed; NOT 410, per `context.md` deviation note) · 409 `export_in_progress` |

## 3. ATC Registry

### Existing ATCs (Reuse)

| ATC ID | Component | Method | Description |
|--------|-----------|--------|-------------|
| BK-1018 | WorkspaceExportApi | `getExportStatusSuccessfully` | Poll shape (200, `export` key, status enum, documented fields). Uncommitted at plan time: review only. Two review notes for Wave 1: (a) `smoke.test.ts` calls it on `getOwnedWorkspace()` (a real, shared workspace). It is read-only, so acceptable for smoke, but the BK-508 regression copy should poll a synthetic workspace so both the `null` and the non-null branch are exercised deterministically (never-requested, then queued/running). (b) It should also assert `expires_at === null` unless `status === 'completed'`. |

### New ATCs (Create)

| ATC ID | Wave | Component | Method | Description |
|--------|------|-----------|--------|-------------|
| BK-1017 | 1 | WorkspaceExportApi | `requestExportSuccessfully(workspaceId)` | 202; `export_job_id` is a UUID; `status === 'queued'`; immediate poll returns the same id in `queued`/`running`/`completed` (never `failed`; an empty workspace can finish before the poll) |
| BK-1019 | 1 | WorkspaceExportApi | `downloadArchiveSuccessfully(workspaceId)` | 200; `content-type: application/zip`; `content-disposition` attachment with `workspace-export-<workspaceId>-<YYYY-MM-DD>.zip`; body starts with `PK\x03\x04`; byte length equals the poll's `archive_bytes`. Returns `[response, Buffer]` |
| BK-1004 | 1 | WorkspaceExportApi | `rejectPatOnExportEndpoint({ workspaceId, token, endpoint })` | Cookieless context, Bearer only (`token` key so the step title masks it); positive control `GET /workspaces/{id}` = 200 with the same PAT (`atc:read`); `endpoint` in `request` / `poll` / `download`; 403 + error envelope; for `request`, the poll (cookie) still shows no new job |
| BK-997 | 1 | ActivityApi | `verifyExportRequestedRecorded({ workspaceId, actorId, since })` | `GET /activity?workspace_id=` contains exactly one `export.requested` with actor = Owner, `created_at >= since`, payload `{}` |
| BK-998 | 1 | ActivityApi | `verifyExportDownloadedRecorded({ workspaceId, actorId, since, count })` | Same for `export.downloaded`; one row per successful download (test downloads twice, `count: 2`; exact-count re-read after the poll) |
| BK-1009 | 1 | WorkspaceExportApi | `supersedePriorArchiveWithNewest({ workspaceId, priorExport })` | Request a fresh export after a completed one; settles `completed`; poll returns the NEW id with `expires_at` later than the prior's; download manifest `generated_at` is after the prior `completed_at` |
| BK-994 | 2 | DataExportPage | `openDataExportSectionAsOwner()` | Settings nav lists Data export; page shows the explanation card (entities, no credential, 7 days) |
| BK-995 | 2 | DataExportPage | `requestExportAcknowledged()` | Click Request export; preparing text with a requested-at timestamp appears without waiting for completion; reload + navigate away and back shows the same state |
| BK-996 | 2 | DataExportPage | `downloadReadyArchive()` | Ready text + `Downloadable until`; click Download archive -> Playwright `download` event; suggested filename `workspace-export-*.zip`; saved file non-empty |
| BK-1001 | 2 | DataExportPage | `verifySectionHiddenForNonOwner()` | Role session: nav has no Data export link; direct `/settings/data-export` shows no lifecycle text and no download link |
| BK-1001 | 2 | WorkspaceExportApi | `rejectNonOwnerOnExportEndpoints(workspaceId)` | Role cookie session: POST, GET poll and download all 403 |
| BK-999 | 3 | WorkspaceExportApi | `downloadEmptyWorkspaceArchive(workspaceId)` | Archive parses; `manifest.json` present; every content entity (projects ... bugs) is `[]` with count 0; `memberships` = 1 (Owner) and `activity` >= 1 (the `export.requested` row) are expected non-zero |
| BK-1014 | 3 | WorkspaceExportApi | `downloadArchiveWithConsistentManifest({ workspaceId, requestedAt })` | `manifest.workspace_id`, ISO `generated_at` within [requestedAt, completed_at], `counts` keys = entity files present, each count = parsed record count |
| BK-1015 | 3 | WorkspaceExportApi | `downloadArchiveWithNdjsonRunSnapshots(workspaceId)` | `runs.ndjson` is NDJSON (one JSON object per non-empty line, no enclosing array) and `runs.json` is absent; every other entity file is a JSON array. Regression guard for BK-1025 (closed) |
| BK-1011 | 3 | WorkspaceExportApi | `downloadArchiveExcludingPatSecrets({ workspaceId, secrets })` | No file contains the raw PAT, its `<secret>` part, or SHA-256(secret) hex |
| BK-1012 | 3 | WorkspaceExportApi | `downloadArchiveExcludingInviteTokens({ workspaceId, secrets })` | No file contains the raw invite token or its SHA-256 hex |
| BK-1013 | 3 | WorkspaceExportApi | `downloadArchiveScopedToWorkspace({ workspaceId, foreignMarkers })` | Every record with `workspace_id` equals the exported id; none of the other workspace's ids/names appears anywhere |
| BK-1000 | 3 | WorkspaceExportApi | `requestExportWhileOtherWorkspaceExporting({ workspaceId, busyWorkspaceId })` | 202 for the second workspace while the first is in flight; the first's job id and status unchanged |
| BK-1002 | 3 | WorkspaceExportApi | `requestExportWhileOneInFlightRefused(workspaceId)` | 409 `export_in_progress` with a human-readable message; latest poll still returns the original job id |
| BK-1010 | 3 | WorkspaceExportApi | `downloadExpiredArchiveRefused(workspaceId)` | 404 error envelope; no ZIP bytes |
| BK-1003 | 3 | DataExportPage | `verifyExpiredArchiveNotOffered()` | With the browser clock past `expires_at`: expired text, Request a new export button, no Download archive link |
| BK-1006 | 3 | DataExportPage | `verifyStateAtExpiryBoundary({ offsetMs, expectedState })` | Three rows: `-1000 -> ready`, `0 -> expired`, `+1000 -> expired` |

### New Helpers (No @atc)

| Component | Method | Returns | Description |
|-----------|--------|---------|-------------|
| ApiBase (L2) | `RequestOptions.cookieOnly` | n/a | D1 |
| WorkspaceExportApi | `requestExport(workspaceId)` | `[APIResponse, RequestWorkspaceExportResponse, null]` | Raw POST, no assertions (for the race variants) |
| WorkspaceExportApi | `waitForExportToSettle({ workspaceId, exportId, timeoutMs? })` | `WorkspaceExportJob` | `expect.poll` until `completed`/`failed` for that job id; fails fast on `failed` and on a non-200 poll (`http-<status>`) |
| WorkspaceExportApi | `downloadArchive(workspaceId)` | `[APIResponse, Buffer]` | Raw download, no assertions (Wave 3 ATCs build on it privately) |
| WorkspaceExportApi | private `withPatOnlyContext(token, fn)` | `T` | D6 |
| WorkspacesApi | `createWorkspace(payload?)` | `Workspace` | 201; payload from `DataFactory.createWorkspacePayload()` |
| WorkspacesApi | `deleteWorkspace({ workspaceId, confirmName })` | `DeleteWorkspaceResponse` | Cookie-only soft-delete; expects 200 |
| WorkspacesApi | `setActiveWorkspace(workspaceId)` | `void` | `POST /me/active-workspace`, cookie-only; in `{ test }` it runs on `page.request` so the browser gets the `bk_active_ws` cookie |
| WorkspacesApi | `createInvite({ workspaceId, email, role })` | `{ inviteId, token }` | Raw token returned once |
| WorkspacesApi | `acceptInvite(token)` | `void` | Called on the invitee's context (BK-1001) |
| TokensApi | `issueToken({ name, scopes, workspaceId?, expiresInDays? })` | `{ id, token }` | Cookie-only; `expiresInDays` maps to `expires_in_days` (1..365); token masked in the attachment |
| TokensApi | `revokeToken(id)` | `void` | Cookie-only; 404 tolerated |
| ActivityApi | `listActivity({ workspaceId, limit? })` | `[APIResponse, ActivityPage]` | Cookie |
| AuthApi | `getCurrentUser()` | exists already (used by `dashboard.test.ts`) | Supplies the Owner's user id for actor checks |
| ProjectsApi / UserStoriesApi / AtcsApi / TestsApi / RunsApi | `create*`, `startRun`, `finishRun` | ids | Seeding only, §4 |

### Steps (Layer 3.5)

`tests/components/steps/WorkspaceExportSteps.ts` (extends `TestContext`, instantiated with `{ page?, request }`):

| Method | Composes | Used by |
|--------|----------|---------|
| `createSyntheticWorkspace()` | `WorkspacesApi.createWorkspace` (Wave 2 adds `{ makeActive? }` + `setActiveWorkspace`) | every TC |
| `cleanupSyntheticWorkspace(workspace)` | best-effort wait (`EXPORT_CLEANUP_SETTLE_TIMEOUT_MS`) for an in-flight export to go idle, then `WorkspacesApi.deleteWorkspace` | every `afterEach` |
| `prepareCompletedExport(workspaceId)` | Helpers `WorkspaceExportApi.requestExport` (expects 202) + `waitForExportToSettle` (never the BK-1017 ATC: an ATC is not a precondition) | BK-1019, BK-998, BK-1009, BK-996, Wave 3 |
| `seedWorkspaceContent(workspaceId, { withRunHistory })` | project -> module -> user story -> AC -> ATC -> test -> environment -> run -> finish | BK-1015, BK-1013, BK-1014 |

## 4. Test Data Strategy

| Data | Pattern | Source | Lifecycle |
|------|---------|--------|-----------|
| Owner identity | Discover | `config.testUser` (`STAGING_USER_*` / `LOCAL_USER_*` key names), session from `api-setup` / `ui-setup` | Suite |
| Synthetic workspace | Generate | `POST /api/v1/workspaces`, slug `qa-auto-bk508-<ts>-<rand6>` (must match `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`, avoid reserved slugs) | `beforeEach` create, `afterEach` soft-delete |
| Second workspace (BK-1000, BK-1013) | Generate | same | same, both deleted |
| Completed export | Generate (real path) | request + poll | dies with the workspace; ZIP stays in the bucket (R2) |
| PAT with `workspace:admin` (BK-1004, BK-1011) | Generate | `POST /api/v1/tokens` with `workspace_id` = synthetic | revoked in `afterEach` (also revoked by the workspace delete) |
| Invite (BK-1012) | Generate | `POST /workspaces/{id}/invites`, email `qa-auto-bk508+<rand>@example.com` (never delivered: MVP sends no email) | revoked by the workspace delete |
| Non-Owner memberships (BK-1001) | Generate | invite role account -> accept from role session | removed by the workspace delete |
| Run history (BK-1015) | Generate | seeding chain via `WorkspaceExportSteps.seedWorkspaceContent` | dies with the workspace |
| Expired state (UI) | Real data + browser clock | completed export + `page.clock.setFixedTime` | no residue |
| Expired state (server, BK-1010) | OUT OF AUTOMATION (Q2: no DB writes from tests) | `UPDATE public.workspace_exports SET expires_at = now() - interval '1 second' WHERE id = $exportId AND workspace_id = $syntheticId AND status = 'completed'` | row dies with the workspace |
| In-flight state (BK-1002, BK-1000) | Real path race (Q2: no DB writes) | see `atc/BK-1002-*.md` | dies with the workspace |

**Seeding chain (minimum bodies from `api/openapi.json`)**: `POST /workspaces/{id}/projects {name}` -> `POST /projects/{id}/modules {name}` -> `POST /modules/{id}/user-stories {title}` -> `POST /user-stories/{id}/acceptance-criteria {title}` -> `POST /atcs {title, module_id, user_story_id, acceptance_criterion_ids, layer, steps}` -> `POST /tests {title, atc_ids, workspace_id}` -> `POST /projects/{id}/environments {name}` -> `POST /runs {test_id, environment_id}` -> `POST /runs/{id}/finish {verdict}`. Risk: the ready-to-test gate on User Stories (`0018_ready_to_test_gate_fn`) may refuse a Run until the story is ready; resolve at Code time from the business data map `flow-story-atc`.

### DataFactory additions

```typescript
// tests/data/DataFactory.ts
static createWorkspacePayload(overrides?: Partial<WorkspaceCreateBody>): WorkspaceCreateBody
// name: `QA Auto BK-508 ${uniqueId}`, slug: `qa-auto-bk508-${ts}-${rand6}` lowercased, <= 40 chars
static createInviteEmail(): string        // `qa-auto-bk508+${rand}@example.com`
static createTokenName(): string          // `qa-auto-bk508-${rand}`
```

### Constants additions

```typescript
// tests/data/constants.ts (create if absent)
export const EXPORT_DOWNLOAD_WINDOW_MS = 168 * 60 * 60 * 1000;
export const EXPORT_SETTLE_TIMEOUT_MS = 30_000;          // fail-fast settle bound (ATCs, preconditions)
export const EXPORT_CLEANUP_SETTLE_TIMEOUT_MS = 10_000;  // best-effort in-flight wait before cleanup
export const EXPORT_POLL_INTERVALS_MS = [500, 1_000, 2_000];
export const EXPORT_CONTENT_ENTITIES = ['projects', 'modules', 'user_stories', 'acceptance_criteria', 'atcs', 'atc_steps', 'atc_assertions', 'atc_acceptance_criteria', 'tests', 'test_steps', 'runs', 'run_atcs', 'run_steps', 'bugs'] as const;
// confirm the exact entity keys from the first real manifest (Q6)
```

## 5. Test Scenarios

Every file: `beforeEach` creates its synthetic workspace(s) through `WorkspaceExportSteps`; `afterEach` revokes minted PATs and soft-deletes every workspace it created, even when the test failed.

### Wave 1 — API contract + security (no DB writes)

#### File: `tests/integration/workspace-export/requestWorkspaceExport.test.ts` · Fixture `{ api, request }`

- `BK-1017: should return a queued job id when the owner requests an export of an idle workspace` -> `requestExportSuccessfully`. Test-level: poll id equals the 202 id.
- `BK-1018: should return a null export when the owner polls a never-exported workspace` and `BK-1018: should return the lifecycle shape when the owner polls a requested export` -> `getExportStatusSuccessfully` (reuse, 2 data rows: before / after request).

#### File: `tests/integration/workspace-export/downloadWorkspaceExport.test.ts` · Fixture `{ api, request }`

- `BK-1019: should stream a zip attachment when the owner downloads a ready archive` -> Steps `prepareCompletedExport` + `downloadArchiveSuccessfully`.
- `BK-1009: should offer only the newest archive when a fresh export completes after a ready one` (`test.slow()`) -> `prepareCompletedExport` + `supersedePriorArchiveWithNewest`.

#### File: `tests/integration/workspace-export/rejectPatOnWorkspaceExport.test.ts` · Fixture `{ api, request }` · tag `@critical`

- `BK-1004: should reject a personal access token when it calls the export <endpoint> endpoint` x3 (`request`, `poll`, `download`) -> `TokensApi.issueToken` (scopes `atc:read` + `workspace:admin`, bound to the synthetic workspace, `expiresInDays: 1`) + `rejectPatOnExportEndpoint`: cookie read 200 before and after, PAT positive control `GET /workspaces/{id}` 200 with the same id, 403 `forbidden` whose message matches `/browser session/i`, no new job. The `download` row first prepares a completed export, so the 403 cannot be a 404 in disguise.

#### File: `tests/integration/workspace-export/auditWorkspaceExport.test.ts` · Fixture `{ api, request }`

- `BK-997: should record an export.requested entry attributed to the owner when an export is requested` -> `requestExportSuccessfully` + `ActivityApi.verifyExportRequestedRecorded`.
- `BK-998: should record one export.downloaded entry per download attributed to the owner when the archive is downloaded twice` -> `prepareCompletedExport` + `downloadArchiveSuccessfully` x2 + `ActivityApi.verifyExportDownloadedRecorded` (`count: 2`).

### Wave 2 — UI flows in Settings

#### File: `tests/e2e/workspace-export/viewDataExportSection.test.ts` · Fixture `{ test }` · tag `@critical @smoke`

- `BK-994: should list the Data export section and explain it when the owner opens Settings` -> `createSyntheticWorkspace({ makeActive: true })` + `DataExportPage.openDataExportSectionAsOwner`.

#### File: `tests/e2e/workspace-export/requestDataExport.test.ts` · Fixture `{ test }`

- `BK-995: should show the export as being prepared with its request time when the owner requests it` -> `DataExportPage.requestExportAcknowledged`.
- `BK-996: should offer the archive as a single download when the export is ready` -> `prepareCompletedExport` + `DataExportPage.downloadReadyArchive`.

#### File: `tests/e2e/workspace-export/hideDataExportFromNonOwners.test.ts` · Fixture `{ test }` · tag `@critical` · unblocked (Q1): needs `config.roleUsers` + `roles-setup`

- `BK-1001: should hide the Data export section from a workspace <role>` x3 -> see `atc/BK-1001-non-owner-hidden.md`.

### Wave 3 — Archive content + forced states

#### File: `tests/integration/workspace-export/inspectWorkspaceExportArchive.test.ts` · Fixture `{ api, request }`

- `BK-999: should produce a valid archive with no content records when the workspace is empty`
- `BK-1014: should describe the archive in a manifest whose counts match its files when an export completes` (seeded)
- `BK-1015: should encode run snapshots as NDJSON when the workspace has run history` (seeded, `test.slow()`)
- `BK-1011: should leave every PAT secret out of the archive when the workspace has issued tokens`
- `BK-1012: should leave every invite token out of the archive when the workspace has pending invites`
- `BK-1013: should contain only the exported workspace's records when the owner owns two workspaces` (both seeded)

#### File: `tests/integration/workspace-export/enforceSingleExportInFlight.test.ts` · Fixture `{ api, request }`

- `BK-1002: should refuse a second export request while one is being prepared`
- `BK-1000: should accept an export request for another workspace while the first is being prepared`

#### File: `tests/integration/workspace-export/rejectExpiredDownload.test.ts` · Fixture `{ api, request }` · OUT OF AUTOMATION (Q2, decided 2026-10-19)

- `BK-1010: should refuse the download route when the archive window has elapsed` + test-level: no new `export.downloaded` row.

#### File: `tests/e2e/workspace-export/showExpiredDataExport.test.ts` · Fixture `{ test }`

- `BK-1003: should show the archive as expired without a download link when the window has lapsed`
- `BK-1006: should show the archive as <state> when the clock is <offset> from the expiry instant` x3

## 6. Implementation Order (one commit per box)

**Wave 1**
- [x] `ApiBase` `cookieOnly` request option (D1) + ADR draft (ADR-0018, Proposed; 0014 is taken by an upstream ADR)
- [ ] Type facades: `@schemas/activity.types`, `@schemas/tokens.types`, workspace create/invite types (after `bun run api:sync`, Q5). Wave 1 part done: activity + tokens facades, `WorkspaceExportJob`; create types pre-existing. Open: invite types (Wave 3, BK-1012); `bun run api:sync` not run (OpenAPI MCP down, local spec used)
- [ ] `DataFactory` + `constants.ts` additions. Wave 1 part done: `createTokenName` (`createWorkspacePayload` pre-existing); `EXPORT_SETTLE_TIMEOUT_MS` 30s + `EXPORT_CLEANUP_SETTLE_TIMEOUT_MS` 10s. Open: `createInviteEmail`, `EXPORT_DOWNLOAD_WINDOW_MS`, `EXPORT_CONTENT_ENTITIES` (Wave 2/3)
- [ ] `WorkspacesApi` helpers, `TokensApi`, `ActivityApi` + fixture registration. Wave 1 part done: `TokensApi`, `ActivityApi` registered in `ApiFixture`; create/delete pre-existing. Open: `setActiveWorkspace`, `createInvite`, `acceptInvite` (Wave 2/3)
- [x] `WorkspaceExportApi` helpers + Wave 1 ATCs; `WorkspaceExportSteps` (create/cleanup/prepareCompletedExport)
- [x] `tests/utils/archive.ts` + `fflate` devDependency (needed by BK-1019 body check) (pre-existing)
- [x] Wave 1 test files; run; `bun run kata:manifest`

**Wave 2**
- [ ] `DataExportPage` + `UiFixture` registration
- [ ] `viewDataExportSection` + `requestDataExport` test files
- [ ] `config.roleUsers`, `roles-setup` project, BK-1001 ATCs + test file

**Wave 3**
- [ ] Seeding components + `WorkspaceExportSteps.seedWorkspaceContent`
- [ ] Archive ATCs + `inspectWorkspaceExportArchive.test.ts` (BK-1015 regression guard)
- [ ] `enforceSingleExportInFlight.test.ts` (product race, no DB writes per Q2)
- [ ] `showExpiredDataExport.test.ts` (clock control)
- [ ] TMS: move automated TCs to Pull Request on PR open (`create_pr`); Automated only after merge

### Fixture registration changes

| File | Change |
|------|--------|
| `tests/components/api/ApiBase.ts` | `RequestOptions.cookieOnly`; `buildHeaders` honours it |
| `tests/components/ApiFixture.ts` | register `activity: ActivityApi`, `tokens: TokensApi`, `projects`, `userStories`, `atcs`, `tests`, `runs`; propagate `setAuthToken` / `clearAuthToken` to each |
| `tests/components/UiFixture.ts` | register `dataExport: DataExportPage` |
| `tests/components/TestFixture.ts` | no change (inherits through `ApiFixture` / `UiFixture`) |
| `playwright.config.ts` | (BK-1001 only) `roles-setup` project producing `.auth/role-<role>.json`, dependency of `e2e` |
| `config/variables.ts` | (BK-1001 only) optional `config.roleUsers.{admin,member,viewer}` from `STAGING_ADMIN_*` / `STAGING_MEMBER_*` / `STAGING_VIEWER_*` (and `LOCAL_*` twins), failing by name when used and absent |
| `package.json` | devDependency `fflate` (Q8) |

### Complexity per ATC

| ATC | Complexity | Driver |
|-----|-----------|--------|
| BK-1017, BK-1018 | Low | single call + poll |
| BK-1019 | Medium | binary response, headers, size cross-check |
| BK-1004 | Medium | cookieless context, 3 rows |
| BK-997, BK-998 | Medium | activity contract unclear (Q5) |
| BK-1009 | Medium | two full export cycles, `test.slow()` |
| BK-994 | Low | navigation + text |
| BK-995 | Medium | async state, reload persistence |
| BK-996 | Medium | browser download event |
| BK-1001 (x2) | High | second identity, invite/accept, 3 roles, blocked on accounts |
| BK-999 | Medium | archive parse |
| BK-1014 | Medium | manifest vs file cross-check |
| BK-1015 | High | full seeding chain + NDJSON |
| BK-1011, BK-1012 | Medium | secret + hash scan |
| BK-1013 | High | two seeded workspaces |
| BK-1000, BK-1002 | High | race or forced state |
| BK-1010 | High | DB write (blocked) |
| BK-1003 | Medium | clock control |
| BK-1006 | Medium | clock control, 3 BVA rows |

## 7. Success Criteria

- [ ] All in-scope ACs covered, plus the risk-beyond-AC cases in `spec.md` (checklist P1)
- [ ] BVA on the 168 h window automated (UI three points; server pending Q2)
- [ ] KATA compliance (atomic ATCs, no ATC calling ATC, max 2 positional params, inline locators, alias imports)
- [ ] Fixture choice per file as in §5
- [ ] No hardcoded waits; every async wait bounded and condition-based
- [ ] Every test leaves no live synthetic workspace behind (soft-deleted)
- [ ] Tests pass on staging, BK-1015 included (regression guard for BK-1025)
- [ ] TMS TCs moved to Pull Request on PR open, never Automated before merge

## 8. Dependency graph

```
ApiBase.cookieOnly --+--> WorkspacesApi / TokensApi / ActivityApi --> WorkspaceExportSteps
                     |                                                   |
                     +--> WorkspaceExportApi (BK-1017, poll helper) -----+--> Wave 1 tests
archive.ts + fflate -------------------------------------------------------> BK-1019, Wave 3
DataExportPage ------------------------------------------------------------> Wave 2, BK-1003, BK-1006
Seeding components --> seedWorkspaceContent -------------------------------> BK-1015, BK-1013, BK-1014
roles accounts + roles-setup ----------------------------------------------> BK-1001
Q2 decision ---------------------------------------------------------------> BK-1010 (+ BK-1002/1000 deterministic)
```

## 9. Open questions

| # | Question | Blocks | Default if unanswered |
|---|----------|--------|-----------------------|
| Q1 | Do non-Owner role accounts exist? `.env.example` has `STAGING_ADMIN_*`, `STAGING_MEMBER_*`, `STAGING_VIEWER_*` (and `STAGING_OWNER_*`) only as commented keys, and `config/variables.ts` does not read them. Is the Owner of the TCs (`STAGING_OWNER_EMAIL`) the same person as `STAGING_USER_EMAIL`? | BK-1001 | ANSWERED 2026-10-19: the `STAGING_OWNER/ADMIN/MEMBER/VIEWER_*` accounts are set in `.env` (confirmed with `bunx varlock load --agent`) and declared in `.env.schema`. The Owner account differs from `STAGING_USER_EMAIL`; tests keep `config.testUser` as the Owner of their synthetic workspaces. BK-1001 is unblocked; remaining work is wiring `config.roleUsers` plus the `roles-setup` project. |
| Q2 | May tests write to `public.workspace_exports` directly (only `expires_at` on a `completed` row, or insert a `running` row, `WHERE workspace_id = <synthetic id>`)? The runner has no DB client and no service-role or DB credentials; `DBHUB_*` keys exist only for the agent MCP. Adding one means a new secret able to write the database that also backs production. | BK-1010 (hard), deterministic BK-1002 / BK-1000 | ANSWERED 2026-10-19: no DB writes from the test runner. BK-1010 is OUT of automation (stays manual); BK-1002 / BK-1000 run on the product race with the explicit precondition guard. Follow-up: ask dev for a staging-only export TTL override, which would let BK-1010 be automated without DB access. |
| Q3 | Is `DELETE /api/v1/workspaces/{id}` live on the target env? BK-512 shows BLOCKED in the Story traceability, while the OpenAPI documents the route. Any per-user cap on owned workspaces? | Cleanup for every test | If not live, fall back to leaving `qa-auto-bk508-*` workspaces and a manual purge list (not acceptable long-term on a shared DB) |
| Q4 | Run-history seeding: build the 9-call API chain (5 new helper components), or keep one long-lived, Owner-owned "export fixture" workspace seeded once and only read (Discover)? | BK-1015, BK-1013, BK-1014 | Generate per test (chain) |
| Q5 | `api/openapi.json` `ActivityItem` union has no `export.requested` / `export.downloaded` variants. Stale local spec (`bun run api:sync`) or real contract drift between the OpenAPI and `bunkai_list_activity`? | BK-997, BK-998 typing | Assert on raw `action` strings; if the live API omits them, that is a product defect to raise via `/sprint-testing` |
| Q6 | Which archive file(s) must be NDJSON, and with which extension? The dev plan says `run_steps`; BK-1025 says `runs.json`; the Tech Lead comment says "Run snapshots" (in the data model, `run_atcs` / `run_steps`). Also confirm the exact entity keys in `manifest.counts` | BK-1015, BK-999 entity list | ANSWERED by the BK-1025 retest (ReTest BK-1167): only `runs.ndjson` is NDJSON; `runs.json` is absent; `run_steps.json`, `run_atcs.json` and the other entity files are JSON arrays; manifest counts match the files. An empty workspace exports `runs.ndjson` as 0 bytes |
| Q7 | Accept the residue of soft-delete cleanup on a shared project: 30-day tombstones, ZIPs left in the private bucket (no purge job), one deletion email to the Owner per test? | All tests | Proceed, report volume after the first full run |
| Q8 | Approve `fflate` as a devDependency for reading ZIPs in tests? | Wave 3, BK-1019 body check | ANSWERED: approved, `fflate` added as a devDependency |
| Q9 | AC-13 ("an export changes nothing") has no Candidate TC. Add one (snapshot entity counts before/after an export on a seeded workspace) via `/test-documentation`? | none (gap) | Logged as gap, not automated |
| Q10 | Ask dev for `data-testid` on the status card states and the Download link? | none | Role/text locators |
| Q11 | BK-1004 Jira design says the PAT is "held by a non-Owner user". The plan uses the Owner's own `workspace:admin` PAT (stronger: highest identity + highest scope, still refused, so the gate is the auth mode, not the role). Add the admin-held PAT as a second data row once Q1 is answered? | none | Owner PAT only |
| Q12 | Measured export duration on staging for an empty vs seeded workspace (sets `EXPORT_SETTLE_TIMEOUT_MS` and the race window for BK-1002) | tuning | 30 s settle timeout, 10 s cleanup wait |
