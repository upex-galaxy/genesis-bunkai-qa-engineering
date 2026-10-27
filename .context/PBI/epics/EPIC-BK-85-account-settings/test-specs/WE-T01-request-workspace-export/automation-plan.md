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
| Status map | 202 enqueued · 200 poll / download · 403 non-Owner or Bearer PAT · 404 download when never requested / not ready / expired (collapsed; NOT 410, per `context.md` deviation note) · 409 `conflict` with `details.reason: "export_in_progress"` (the envelope code is `conflict`, verified in the route and on staging, Wave 3) |

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
| BK-994 | 2 | DataExportPage | `openDataExportSectionAsOwner()` | Settings nav lists Data export; page shows the explanation card (entities, no credential, 7 days); on the never-exported synthetic workspace the status card shows `No export has been requested yet` and an enabled Request export (inside the ATC since 2026-10-20, so it reaches the TMS row) |
| BK-995 | 2 | DataExportPage | `requestExportAcknowledged(): WorkspaceExportJob` | Click Request export; the view re-reads the job (`queued`/`running`) and shows the preparing text with its requested-at time (formatted in the browser like the view) without waiting for completion; reload + navigate away and back still shows the request (preparing or ready), never never-requested. Needs a seeded workspace: an empty one can export before the re-read (measured on staging, 3 of 5 runs). Residual race (2026-10-20): the job still completes before the re-read on some seeded runs. The view renders "being prepared" ONLY from that re-read (the 202 sets no state; `DataExportView.requestExport` -> `load()`), and the job runs server-side right after the 202, so no honest test-side hold exists: a `page.route` hold on the re-read widens the race, a `route.fulfill` would fabricate the state. The final API re-read (latest export id = the job the UI requested) runs inside the ATC (2026-10-20). **Status: `test.fixme`** (2026-10-20), so the body never runs and no TMS row is written: with one seed chain the job won the re-read race 1 time in 20 (`--repeat-each=20`); 3 seed rounds (the ceiling: staging caps projects per workspace) are not yet measured. Unblock: a product-side test hook that holds the job `queued` on staging |
| BK-996 | 2 | DataExportPage | `downloadReadyArchive(workspaceId, expectedBytes): { suggestedFilename, sizeBytes }` | Ready text + `Downloadable until`; click Download archive -> Playwright `download` event; suggested filename `workspace-export-<workspaceId>-<YYYY-MM-DD>.zip`; saved file non-empty and its size equals `expectedBytes` (the settled export's `archive_bytes`), inside the ATC since 2026-10-20 so it reaches the TMS row |
| BK-1001 | 2 | DataExportPage | `verifySectionHiddenForNonOwner({ workspaceId, ownerExportId, readOwnerLatestExportId })` | Every BK-1001 check inside the ATC (revised 2026-10-20), in order: (1) role cookie session (`page.request`): POST, GET poll and download all 403 with the Owner-gate message (`^Only the workspace Owner can`), no ZIP; (2) Owner-side re-read via the reader callback: latest export is still `ownerExportId` (no job enqueued); (3) role session: nav has no Data export link (positive control: Account link); direct `/settings/data-export`: the view reads THIS workspace (guard) and gets 403, shows `Could not load the export status.`, no lifecycle text, no request button, no download link. Every wait has an explicit timeout (worst case ~121 s, budget in the JSDoc) and the test sets `test.setTimeout(240_000)`, so slowness throws inside the ATC (FAIL row) before the test timeout could abandon it |
| BK-999 | 3 | WorkspaceExportApi | `downloadEmptyWorkspaceArchive(workspaceId)` | Archive parses; `manifest.json` present; every content entity (projects ... bugs) is `[]` with count 0; `memberships` = 1 (Owner) and `activity` >= 1 (the `export.requested` row) are expected non-zero |
| BK-1014 | 3 | WorkspaceExportApi | `downloadArchiveWithConsistentManifest({ workspaceId, completedExport })` | `manifest.workspace_id`; ISO `generated_at` within [`started_at`, `completed_at`] of the settled job (all three stamped by the export worker's clock; `created_at` is the DB clock, so it was not used as the lower bound); `counts` keys = entity files present; each count = parsed record count (array length or NDJSON lines); `counts.projects` and `counts.runs` > 0 (inside the ATC, not a vacuous 0 = 0) |
| BK-1015 | 3 | WorkspaceExportApi | `downloadArchiveWithNdjsonRunSnapshots(workspaceId)` | `runs.ndjson` is NDJSON (one JSON object per non-empty line, no enclosing array) and `runs.json` is absent; every other entity file is a JSON array. Regression guard for BK-1025 (closed) |
| BK-1011 | 3 | WorkspaceExportApi | `downloadArchiveExcludingPatSecrets({ workspaceId, token })` | No file (content or name) contains the raw PAT, its secret part (after the dot), the full secret (prefix + secret, what `POST /tokens` hashes), or the SHA-256 hex of either; no file name matching /token|secret/i. The forms are derived inside the ATC from the `token` key (masked in step titles); failure messages carry `<file>: <form>` labels only |
| BK-1012 | 3 | WorkspaceExportApi | `downloadArchiveExcludingInviteTokens({ workspaceId, token })` | No file contains the raw invite token, its secret part (after `bk_inv_`) or SHA-256(token) hex (the `workspace_invites.token_hash` form). `accept_url` embeds the raw token unchanged (base64url), so the raw scan covers it; `createInvite` does not return the URL |
| BK-1013 | 3 | WorkspaceExportApi | `downloadArchiveScopedToWorkspace({ workspaceId, ownMarkers, foreignMarkers })` | Every record with `workspace_id` equals the exported id; none of the other workspace's id, name, slug, test id, run ids appears anywhere; positive control (inside the ATC): every own marker (workspace id, test id, run ids) is present in a content file (`manifest.json` excluded: it names the workspace by itself) |
| BK-1000 | 3 | WorkspaceExportApi | `requestExportWhileOtherWorkspaceExporting({ workspaceId, busyWorkspaceId })` | Both workspaces' requests fired CONCURRENTLY: both 202 with distinct ids, both bodies `status: 'queued'`; both settle `completed`; the busy workspace still offers its own job; overlap PROVEN from the jobs: min(completed_at) - max(created_at) > 250 ms (`EXPORT_CLOCK_SKEW_TOLERANCE_MS`, DB clock vs worker clock). No proven overlap = a lost race: retried inside the ATC on the same seeded workspaces, up to `EXPORT_RACE_MAX_ATTEMPTS` (3); all lost -> FAIL `race lost on all 3 attempts (inconclusive, not a product defect)` |
| BK-1002 | 3 | WorkspaceExportApi | `requestExportWhileOneInFlightRefused(workspaceId)` | Two requests fired CONCURRENTLY on one idle workspace: [202, 409] -> the 409 is `conflict` + `details.reason: export_in_progress` + a non-empty message; the latest poll returns the accepted job, never `failed`. [202, 202] never passes: the later job settles; first job seen completed with `completed_at + 250 ms <= later.created_at` = lost race, seen completed inside the 250 ms window = ambiguous, never seen completed = suspected defect; every kind is retried (up to 3 attempts, same workspace). No [202, 409] after 3 attempts -> FAIL `suspected defect: ...` if any attempt was suspected, else FAIL `race lost on all 3 attempts (inconclusive, not a product defect)`. Any other status pair fails at once |
| BK-1010 | 3 | — | OUT OF AUTOMATION (Q2, no DB writes) | 404 error envelope; no ZIP bytes. Stays Manual; automatable only with a staging-only export TTL override from dev |
| BK-1003 | 3 | DataExportPage | `verifyExpiredArchiveNotOffered(completedExport)` | Browser clock pinned at `expires_at + 24 h` on a real completed export (the view read is guarded to that export id and `expires_at`): expired text, enabled Request a new export button, no Download archive link, no anchor to `/data-export/download`, no ready text |
| BK-1006 | 3 | DataExportPage | `verifyStateAtExpiryBoundary({ completedExport, offsetMs, expectedState })` | Three rows: `-1000 -> ready`, `0 -> expired`, `+1000 -> expired`, run SEQUENTIALLY in ONE test on ONE completed export (a failing row throws a FAIL row and stops the later ones; a precondition failure writes no row; with every call bounded and the budget covering the worst case, a test timeout does not cut a row short); inside the ATC also `expires_at - completed_at` = 168 h. Every wait bounded (~31 s per call); precondition calls bounded by `EXPORT_PRECONDITION_CALL_TIMEOUT_MS` (10 s); the test sets `test.setTimeout(BK_1006_TIMEOUT_MS)` = worst case 193 s x 1.25 (~241 s, budget commented in the test) |

### New Helpers (No @atc)

| Component | Method | Returns | Description |
|-----------|--------|---------|-------------|
| ApiBase (L2) | `RequestOptions.cookieOnly` | n/a | D1 |
| WorkspaceExportApi | `requestExport(workspaceId)` | `[APIResponse, RequestWorkspaceExportResponse, null]` | Raw POST, no assertions (for the race variants) |
| WorkspaceExportApi | `waitForExportToSettle({ workspaceId, exportId, timeoutMs? })` | `WorkspaceExportJob` | `expect.poll` until `completed`/`failed` for that job id; fails fast on `failed` and on a non-200 poll (`http-<status>`) |
| WorkspaceExportApi | `downloadArchive(workspaceId)` | `Promise<APIResponse>` | Raw download, no assertions (callers read `response.body()`). Private; Wave 3 ATCs use the private `downloadAndExtract` (200 + readable ZIP) and `parseManifest` on top of it |
| WorkspaceExportApi | private `withPatOnlyContext(token, fn)` | `T` | D6 |
| WorkspacesApi | `createWorkspace(payload?)` | `Workspace` | 201; payload from `DataFactory.createWorkspacePayload()` |
| WorkspacesApi | `deleteWorkspace({ workspaceId, confirmName })` | `DeleteWorkspaceResponse` | Cookie-only soft-delete; expects 200 |
| WorkspacesApi | `setActiveWorkspace(workspaceId)` | `void` | `POST /me/active-workspace`, cookie-only; in `{ test }` it runs on `page.request` so the browser gets the `bk_active_ws` cookie |
| WorkspacesApi | `createInvite({ workspaceId, email, role })` | `{ inviteId, token }` | Raw token returned once |
| WorkspacesApi | `acceptInvite({ token })` | `AcceptInviteResponse` | Called on the invitee's context (BK-1001). Object param so the step title masks the token (positional args are not masked) |
| TokensApi | `issueToken({ name, scopes, workspaceId?, expiresInDays? })` | `{ id, token }` | Cookie-only; `expiresInDays` maps to `expires_in_days` (1..365); token masked in the attachment |
| TokensApi | `revokeToken(id, { requireRevoked? })` | `void` | Cookie-only; 404 tolerated unless `requireRevoked` (a PAT just minted: only 204 counts) |
| ActivityApi | `listActivity({ workspaceId, limit? })` | `[APIResponse, ActivityPage]` | Cookie |
| AuthApi | `getCurrentUser()` | exists already (used by `dashboard.test.ts`) | Supplies the Owner's user id for actor checks |
| ProjectsApi / UserStoriesApi / AtcsApi / TestsApi / RunsApi | `create*`, `startRun`, `finishRun` | ids | Seeding only, §4 |

### Steps (Layer 3.5)

`tests/components/steps/WorkspaceExportSteps.ts` (extends `TestContext`, instantiated with `{ page?, request }`):

| Method | Composes | Used by |
|--------|----------|---------|
| `createSyntheticWorkspace({ makeActive? })` | `WorkspacesApi.createWorkspace` + (`makeActive`) `setActiveWorkspace` on `page.request` (needs the Steps built with a `page`) | every TC |
| `grantRoleInWorkspace({ workspaceId, email, role, memberRequest })` | Owner `createInvite` -> member `acceptInvite` + `setActiveWorkspace` on `memberRequest` (the role page's `page.request`) | BK-1001 |
| `cleanupSyntheticWorkspace(workspace)` | best-effort wait (`EXPORT_CLEANUP_SETTLE_TIMEOUT_MS`) for an in-flight export to go idle, then `WorkspacesApi.deleteWorkspace` | every `afterEach` |
| `cleanupSyntheticWorkspaces(workspaces)` | `cleanupSyntheticWorkspace` for each; every one attempted; after all, a single error is rethrown as is, several as one `AggregateError` (Wave 3) | BK-1013, BK-1000 (two workspaces per test); BK-1002 and the archive tests BK-999, BK-1011, BK-1012, BK-1014, BK-1015 (one workspace, same hook) |
| `prepareCompletedExport(workspaceId)` | Helpers `WorkspaceExportApi.requestExport` (expects 202) + `waitForExportToSettle` (never the BK-1017 ATC: an ATC is not a precondition) | BK-1019, BK-998, BK-1009, BK-996, Wave 3 |
| `seedWorkspaceContent(workspaceId, { withRunHistory, round? })` (a distinct `round` per extra chain: project names are unique per workspace) | project -> module -> user story -> AC -> ATC -> test -> environment -> run -> finish | BK-1015, BK-1013, BK-1014 |

## 4. Test Data Strategy

| Data | Pattern | Source | Lifecycle |
|------|---------|--------|-----------|
| Owner identity | Discover | `config.testUser` (`STAGING_USER_*` / `LOCAL_USER_*` key names), session from `api-setup` / `ui-setup` | Suite |
| Synthetic workspace | Generate | `POST /api/v1/workspaces`, slug `qa-auto-bk508-<ts>-<rand6>` (must match `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`, avoid reserved slugs) | `beforeEach` create, `afterEach` soft-delete |
| Second workspace (BK-1000, BK-1013) | Generate | same | same, both deleted |
| Completed export | Generate (real path) | request + poll | dies with the workspace; ZIP stays in the bucket (R2) |
| PAT with `workspace:admin` (BK-1004, BK-1011) | Generate | `POST /api/v1/tokens` with `workspace_id` = synthetic | revoked in `afterEach` (also revoked by the workspace delete) |
| Invite (BK-1012) | Generate | `POST /workspaces/{id}/invites`, email `qa-auto-bk508+<rand>@example.com` (never delivered: MVP sends no email) | revoked by the workspace delete |
| Non-Owner memberships (BK-1001) | Generate | invite role account -> accept from role session | the role leaves on its own session (`WorkspacesApi.leaveWorkspace`, `DELETE /workspaces/{id}/membership`, 404 tolerated) in `finally`, before the soft-delete: a soft-delete emails every active member, and the product has no Owner-side member removal |
| Run history (BK-1015) | Generate | seeding chain via `WorkspaceExportSteps.seedWorkspaceContent` | dies with the workspace |
| Expired state (UI) | Real data + browser clock | completed export + `page.clock.setFixedTime` | no residue |
| Expired state (server, BK-1010) | OUT OF AUTOMATION (Q2: no DB writes from tests) | `UPDATE public.workspace_exports SET expires_at = now() - interval '1 second' WHERE id = $exportId AND workspace_id = $syntheticId AND status = 'completed'` | row dies with the workspace |
| In-flight state (BK-1002, BK-1000) | Real path race (Q2: no DB writes) | two CONCURRENT requests on seeded workspaces (3 chains each), see `atc/BK-1002-*.md` §10 and `atc/BK-1000-*.md` §10 | dies with the workspace |

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

- `BK-995: should show the export as being prepared with its request time when the owner requests it` -> 3 x `seedWorkspaceContent({ withRunHistory, round })` + `DataExportPage.requestExportAcknowledged`. **`test.fixme`** (writes no TMS row): 1 lost race in 20 with one seed chain; 3 seed rounds not yet measured; unblock = a product test hook that holds the job `queued` on staging.
- `BK-996: should offer the archive as a single download when the export is ready` -> `prepareCompletedExport` + `DataExportPage.downloadReadyArchive(workspaceId, archive_bytes)`.

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
- `BK-1006: should show the archive as ready just before the expiry instant and as expired at and after it` (one test, the 3 BVA rows run sequentially on one completed export)

## 6. Implementation Order (one commit per box)

**Wave 1**
- [x] `ApiBase` `cookieOnly` request option (D1) + ADR draft (ADR-0018, Proposed; 0014 is taken by an upstream ADR)
- [x] Type facades: `@schemas/activity.types`, `@schemas/tokens.types`, workspace create/invite types (after `bun run api:sync`, Q5). Wave 1 part done: activity + tokens facades, `WorkspaceExportJob`; create types pre-existing. Open: invite types (Wave 3, BK-1012); `bun run api:sync` not run (OpenAPI MCP down, local spec used). Closed 2026-10-25: invite types landed in Wave 2 (`@schemas/workspaces.types`); `bun run api:sync` re-run from staging (97 endpoints, spec unchanged); `api/openapi-types.ts` regenerated by hand with a relative path because the script fails on paths with spaces on Windows (openapi-typescript resolves `%20`), not because of the OpenAPI MCP
- [x] `DataFactory` + `constants.ts` additions. Wave 1 part done: `createTokenName` (`createWorkspacePayload` pre-existing); `EXPORT_SETTLE_TIMEOUT_MS` 30s + `EXPORT_CLEANUP_SETTLE_TIMEOUT_MS` 10s. Wave 3 done (2026-10-20): `createInviteEmail`, `EXPORT_DOWNLOAD_WINDOW_MS`, `EXPORT_CONTENT_ENTITIES` (confirmed against the product entity list), `MAX_SEED_ROUNDS_PER_WORKSPACE`
- [x] `WorkspacesApi` helpers, `TokensApi`, `ActivityApi` + fixture registration. Wave 1 part done: `TokensApi`, `ActivityApi` registered in `ApiFixture`; create/delete pre-existing. Wave 2: `setActiveWorkspace`, `createInvite`, `acceptInvite` done (+ invite/active-workspace type facades)
- [x] `WorkspaceExportApi` helpers + Wave 1 ATCs; `WorkspaceExportSteps` (create/cleanup/prepareCompletedExport)
- [x] `tests/utils/archive.ts` + `fflate` devDependency (needed by BK-1019 body check) (pre-existing)
- [x] Wave 1 test files; run; `bun run kata:manifest`

**Wave 2**
- [x] `DataExportPage` + `UiFixture` registration
- [x] `viewDataExportSection` + `requestDataExport` test files (BK-995 is `test.fixme` until the product test hook exists; the BK-994 / BK-996 verdict assertions run inside their ATCs, 2026-10-20)
- [x] `config.roleUsers`, `roles-setup` project, BK-1001 ATC + test file (`bun run test:e2e:roles`). The API refusals and the Owner-side re-read run inside the single BK-1001 ATC (a failure outside it would write no row: false PASS risk), revised 2026-10-20

**Wave 3**
- [x] Seeding components + `WorkspaceExportSteps.seedWorkspaceContent` (pre-existing from BK-1015)
- [x] Archive ATCs + `inspectWorkspaceExportArchive.test.ts` (BK-1015 regression guard): BK-999, BK-1014, BK-1011, BK-1012, BK-1013 (2026-10-20)
- [x] `enforceSingleExportInFlight.test.ts` (product race, no DB writes per Q2): concurrent requests, BK-1002 20/20, BK-1000 20/20 (2026-10-20, pre JD round 2); re-run after JD round 2 (5 s per-call bounds): 10/10 each, all races won on attempt 1 (2026-10-21)
- [x] `showExpiredDataExport.test.ts` (clock control): BK-1003, BK-1006 (one test, 3 sequential rows; 2026-10-20)
- [x] TMS: move automated TCs to Pull Request on PR open (`create_pr`); Automated only after merge. N/A under `solo-main` (direct push, no PR): each wave went straight to AUTOMATED after its push, Wave 3 on 2026-10-23

#### Wave 3 deviations from this plan (2026-10-20)

- BK-1002 / BK-1000: the sequential design (first request, read-back guard, second request) lost the race 4 of 4 times on staging (seeded job ~0.75-1.05 s after the 202; one call from the runner ~0.5 s), and BK-1000 passed vacuously that way. Both ATCs now fire their two requests concurrently. BK-1002 passes only on [202, 409] (409 `conflict` / `export_in_progress`, the accepted job still the latest and never failed); [202, 202] is retried as a lost race (first job seen completed >= 250 ms before the second was created), ambiguous (inside that skew window) or suspected defect (first job never seen completed), and after 3 attempts fails as `suspected defect: ...` when any attempt was suspected, else as `race lost on all 3 attempts (inconclusive, not a product defect)`; no timestamp comparison is taken as proof of overlap. BK-1000 proves the overlap: min(completed_at) - max(created_at) > 250 ms (DB vs worker clock). No test.skip guard is needed. BK-1000 with an empty second workspace lost the overlap 1 in 20; both workspaces are now seeded (20 of 20). Signatures: `requestExportWhileOneInFlightRefused(workspaceId)`, `requestExportWhileOtherWorkspaceExporting({ workspaceId, busyWorkspaceId })`.
- 409 envelope: `error.code` is `conflict` with `details.reason: "export_in_progress"` (route source + staging), not `code: export_in_progress`.
- BK-1014: `generated_at` lower bound is `started_at` (same worker clock as `generated_at` and `completed_at`), not `created_at` (DB clock). Takes `{ workspaceId, completedExport }`; the projects / runs non-zero checks run inside the ATC.
- BK-1011 / BK-1012: take `{ workspaceId, token }` (masked key) and derive every form inside; PAT forms follow the product (`POST /tokens` hashes prefix + secret, no dot). BK-1012 drops `acceptUrls` (the URL embeds the raw token, covered by the raw scan).
- BK-1013: positive control moved inside the ATC (`ownMarkers`).
- BK-1003 / BK-1006: take the completed export job; the page-open read is guarded to that id and `expires_at`; the 168 h window check is inside BK-1006. Side-effect guard: with the browser clock days ahead, the page made 5 refresh-token calls in 4 s (measured), which would rotate the SHARED session's refresh token; the ATC aborts `/auth/v1/token?grant_type=refresh_token` on that page only. Not a state fake: export data comes from the real API.
- `inspectWorkspaceExportArchive.test.ts` hooks now use `WorkspaceExportSteps` (create / cleanup with the in-flight wait) instead of raw `WorkspacesApi` calls; BK-1015 test body and ATC unchanged.
- BK-1010: not created (OUT OF AUTOMATION, Q2).
- JD Wave 3 round 1 (2026-10-20): (a) BK-1006 is ONE test (one completed export, the 3 rows called sequentially) instead of 3 tests: the TMS sync is every(@atc row PASS) per TC, so a row whose test failed in its precondition wrote nothing and let the other rows sync a false PASS. `openAtBrowserTime` re-pins the clock per call and unroutes its refresh-token abort before routing it again. (b) BK-1002 / BK-1000 retry a LOST race inside the ATC (no overlap proven from the jobs' timestamps), up to `EXPORT_RACE_MAX_ATTEMPTS` = 3, on the already-seeded workspace(s) (no extra seeding: staging caps projects per workspace); every attempt lost fails with `race lost on all 3 attempts (inconclusive, not a product defect)`, never a PASS. BK-1002 can prove a lost race only when its back-to-back reads saw the first job completed before the second was enqueued (the API exposes only the latest job); an attempt where that was not observed is reported as unproven in the inconclusive message. Test timeouts computed and commented in the test file (BK-1002 190 s, BK-1000 335 s). (c) `cleanupSyntheticWorkspaces` and the archive `afterEach` throw an `AggregateError` when several cleanups fail. (d) `recordsOf` throws a `TypeError` on a non-array JSON entity file (was a silent `[]`). (e) Leak reports never print a file name that holds a credential form (`file #<index>: <label> (in file name)`); the BK-1011 /token|secret/i name check reports indexes only. (f) BK-1000 also asserts the busy job's 202 body `status: 'queued'`.
- JD Wave 3 round 2 (2026-10-21): (a) BK-1002 verdicts: the skew-only "proven overlap -> defect" branch is removed; `EXPORT_CLOCK_SKEW_TOLERANCE_MS` = 250 ms (worker JS clock vs DB `now()`) splits a lost race (`completed_at + 250 ms <= later.created_at`) from an ambiguous attempt; a first job never seen completed is a suspected defect, and the final failure says `suspected defect: ...` when any attempt was one, `race lost on all N attempts (inconclusive, not a product defect)` otherwise. BK-1000 needs an overlap larger than the same tolerance. (b) Every POST / GET inside the race attempts (reader reads, each settle-poll read) carries `EXPORT_RACE_CALL_TIMEOUT_MS` = 5 s; per-attempt worst cases 45 s (BK-1002) / 70 s (BK-1000); test timeouts recomputed in the test file: 245 s / 400 s (cleanup now budgets the soft-delete at its 30 s default timeout). (c) BK-1006 preconditions take an optional bounded timeout (`requestTimeoutMs` on `createSyntheticWorkspace` / `prepareCompletedExport`, `timeoutMs` on `WorkspacesApi.createWorkspace` / `setActiveWorkspace`, defaults unchanged) set to `EXPORT_PRECONDITION_CALL_TIMEOUT_MS` = 10 s; `test.setTimeout` = worst case 193 s x 1.25. (d) BK-1013 positive control scans content files only (`manifest.json` excluded); the other-workspace marker scan still covers every file.

### Fixture registration changes

| File | Change |
|------|--------|
| `tests/components/api/ApiBase.ts` | `RequestOptions.cookieOnly`; `buildHeaders` honours it |
| `tests/components/ApiFixture.ts` | register `activity: ActivityApi`, `tokens: TokensApi`, `projects`, `userStories`, `atcs`, `tests`, `runs`; propagate `setAuthToken` / `clearAuthToken` to each |
| `tests/components/UiFixture.ts` | register `dataExport: DataExportPage` |
| `tests/components/TestFixture.ts` | no change (inherits through `ApiFixture` / `UiFixture`) |
| `playwright.config.ts` | (BK-1001 only) `roles-setup` project producing `.auth/role-<role>.json`; new `e2e-roles` project (only `hideDataExportFromNonOwners.test.ts`) depends on it; both exist only when `--project=e2e-roles` is passed (script `test:e2e:roles`) or `RUN_ROLE_TESTS=1`, and `e2e` and `smoke-ui` ignore that file, so a default run never needs role creds. `roles-setup` signs in with a raw cookieless POST (no Owner PAT, not the BK-311 ATC) and revokes the minted PAT |
| `config/variables.ts` | (BK-1001 only) optional `config.roleUsers.{admin,member,viewer}` from `STAGING_ADMIN_*` / `STAGING_MEMBER_*` / `STAGING_VIEWER_*` (and `LOCAL_*` twins), failing by name when used and absent |
| `package.json` | devDependency `fflate` (Q8); script `test:e2e:roles` (`--project=e2e-roles`, BK-1001) |

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
| BK-1001 | High | second identity, invite/accept, 3 roles |
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

- [ ] All in-scope ACs covered, plus the risk-beyond-AC cases in `spec.md` (checklist P1). Open (2026-10-27): only BK-995, which is `test.fixme` until the product adds a test hook. AC-13 was scored Deferred (Q9); BK-1010 stays manual (Q2). Every other Candidate is automated
- [x] BVA on the 168 h window automated (UI three points; server pending Q2). UI three points in BK-1006; the server side stays manual (BK-1010, Q2)
- [x] KATA compliance (atomic ATCs, no ATC calling ATC, max 2 positional params, inline locators, alias imports). Checked by Judgment Day on all three waves
- [x] Fixture choice per file as in §5
- [x] No hardcoded waits; every async wait bounded and condition-based
- [x] Every test leaves no live synthetic workspace behind (soft-deleted)
- [x] Tests pass on staging, BK-1015 included (regression guard for BK-1025). Last full green run: 2026-10-21, Wave 3 Judgment Day round 3
- [x] TMS TCs moved to Pull Request on PR open, never Automated before merge. N/A under `solo-main`: no PR exists; TCs moved to AUTOMATED only after their wave was pushed to main

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
| Q9 | AC-13 ("an export changes nothing") has no Candidate TC. Add one (snapshot entity counts before/after an export on a seeded workspace) via `/test-documentation`? | none (gap) | ANSWERED 2026-10-27 by `/test-documentation`: Deferred, ROI 0.89 (band 0.5-1.5, no prior bug). The export worker only writes its own `workspace_exports` row and the archive in storage, never an entity table. No TC created; the verdict is recorded in the "Prioritization — Deferred scenarios" comment on BK-508. Revisit if the worker starts writing to an entity table |
| Q10 | Ask dev for `data-testid` on the status card states and the Download link? | none | Role/text locators |
| Q11 | BK-1004 Jira design says the PAT is "held by a non-Owner user". The plan uses the Owner's own `workspace:admin` PAT (stronger: highest identity + highest scope, still refused, so the gate is the auth mode, not the role). Add the admin-held PAT as a second data row once Q1 is answered? | none | Owner PAT only |
| Q12 | Measured export duration on staging for an empty vs seeded workspace (sets `EXPORT_SETTLE_TIMEOUT_MS` and the race window for BK-1002) | tuning | 30 s settle timeout, 10 s cleanup wait |
