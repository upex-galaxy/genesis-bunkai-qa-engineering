# WE-T01: Request an export of my workspace data

| Field | Value |
|-------|-------|
| **Priority** | P0 (Owner-only gate, credential exclusion, tenant isolation) / P1 (lifecycle, audit) / P2 (encoding, boundaries) |
| **Phase** | Standalone (ticket-driven, three coding waves) |
| **Items** | 22 TCs -> 23 ATCs (BK-1001 is split across UI + API, justified below) |
| **Dependencies** | None upstream. Needs the cookie-only request option and the archive utility from `automation-plan.md` §2 before Wave 1 code starts |
| **Requires** | Owner account (`config.testUser`), synthetic workspace per test, non-Owner role accounts for BK-1001, a zip reader dev dependency for Wave 3, a decision on forced-state mechanism for BK-1002 / BK-1000 / BK-1010 |
| **Source** | Story: BK-508 (Epic BK-85). ATS BK-1022, ATP BK-1023, ATR BK-1024, Defect BK-1025 |

## Summary

Automates the Candidate test cases of BK-508: the Owner-only Data export section in Settings, the async export job (`queued -> running -> completed | failed`, 168 h download window), the cookie-only export API, the Activity Stream audit trail, and the content guarantees of the downloaded ZIP (one workspace, no credential, machine-readable, manifest). The feature is a compliance surface on a shared Supabase project, so the suite is built around one rule: every test creates and soft-deletes its own synthetic workspace, and nothing ever exports, mutates or reads a workspace another session uses.

## Test Cases

> Bodies live in Jira. Synced copies sit under the covering Story's `test-cases/`;
> run `bun run jira:sync-issues get BK-508` if they are not on disk.

Layer: `API` = `tests/integration/workspace-export/`, `UI` = `tests/e2e/workspace-export/`.

| TMS ID | TC | Title (short) | Type | Prio | Wave | Layer | Fixture | Target ATC (component.method) |
|--------|----|---------------|------|------|------|-------|---------|-------------------------------|
| BK-1017 | TC24 | should return the status shape when requesting an export | Positive / contract | P1 | 1 | API | `{ api }` | `WorkspaceExportApi.requestExportSuccessfully` |
| BK-1018 | TC25 | should return the status shape when polling export state | Positive / contract | P1 | 1 | API | `{ api }` | `WorkspaceExportApi.getExportStatusSuccessfully` (EXISTS, reuse) |
| BK-1019 | TC26 | should return the correct response when downloading a ready archive | Positive / contract | P1 | 1 | API | `{ api }` | `WorkspaceExportApi.downloadArchiveSuccessfully` |
| BK-1004 | TC11 | should reject a PAT calling the export request or download endpoint | Negative / security | P0 | 1 | API | `{ api }` | `WorkspaceExportApi.rejectPatOnExportEndpoint` (parameterized: request, poll, download) |
| BK-997 | TC04 | should record an activity entry for the export request | Positive / audit | P1 | 1 | API | `{ api }` | `ActivityApi.verifyExportRequestedRecorded` |
| BK-998 | TC05 | should record an activity entry for the archive download | Positive / audit | P1 | 1 | API | `{ api }` | `ActivityApi.verifyExportDownloadedRecorded` |
| BK-1009 | TC16 | should keep only the newest archive offered after a fresh export completes | Boundary / state | P2 | 1 | API | `{ api }` | `WorkspaceExportApi.supersedePriorArchiveWithNewest` |
| BK-994 | TC01 | should show the Data export section to the Owner | Positive / smoke | P0 | 2 | UI | `{ test }` | `DataExportPage.openDataExportSectionAsOwner` |
| BK-995 | TC02 | should acknowledge an export request immediately | Positive | P1 | 2 | UI | `{ test }` | `DataExportPage.requestExportAcknowledged` |
| BK-996 | TC03 | should offer a single-archive download once ready | Positive | P1 | 2 | UI | `{ test }` | `DataExportPage.downloadReadyArchive` |
| BK-1001 | TC08 | should not show the Data export section to non-Owner roles | Negative / security | P0 | 2 | UI + API | `{ test }` | `DataExportPage.verifySectionHiddenForNonOwner` + `WorkspaceExportApi.rejectNonOwnerOnExportEndpoints` (parameterized: admin, member, viewer) |
| BK-999 | TC06 | should produce a valid archive for an empty workspace | Boundary | P2 | 3 | API | `{ api }` | `WorkspaceExportApi.downloadEmptyWorkspaceArchive` |
| BK-1014 | TC21 | should include a manifest.json with workspace id, generated-at and counts | Integration | P1 | 3 | API | `{ api }` | `WorkspaceExportApi.downloadArchiveWithConsistentManifest` |
| BK-1015 | TC22 | should encode Run snapshots as NDJSON while other entities stay JSON | Integration / regression guard | P2 | 3 | API | `{ api }` | `WorkspaceExportApi.downloadArchiveWithNdjsonRunSnapshots` (regression guard for BK-1025, closed) |
| BK-1011 | TC18 | should exclude every PAT secret from the archive | Negative / security | P0 | 3 | API | `{ api }` | `WorkspaceExportApi.downloadArchiveExcludingPatSecrets` |
| BK-1012 | TC19 | should exclude every pending invite or magic-link token from the archive | Negative / security | P0 | 3 | API | `{ api }` | `WorkspaceExportApi.downloadArchiveExcludingInviteTokens` |
| BK-1013 | TC20 | should scope the archive to the active workspace only | Negative / isolation | P0 | 3 | API | `{ api }` | `WorkspaceExportApi.downloadArchiveScopedToWorkspace` |
| BK-1000 | TC07 | should allow a concurrent export request for a different workspace | Positive / isolation | P1 | 3 | API | `{ api }` | `WorkspaceExportApi.requestExportWhileOtherWorkspaceExporting` |
| BK-1002 | TC09 | should refuse a second request while one is preparing | Negative / state | P1 | 3 | API | `{ api }` | `WorkspaceExportApi.requestExportWhileOneInFlightRefused` |
| BK-1010 | TC17 | should reject a download whose window has elapsed even when hit directly | Boundary / security | P1 | 3 | API | `{ api }` | `WorkspaceExportApi.downloadExpiredArchiveRefused` |
| BK-1003 | TC10 | should not allow download via an expired link | Negative / state | P1 | 3 | UI | `{ test }` | `DataExportPage.verifyExpiredArchiveNotOffered` |
| BK-1006 | TC13 | should mark the archive expired exactly at the window boundary | Boundary (BVA) | P1 | 3 | UI | `{ test }` | `DataExportPage.verifyStateAtExpiryBoundary` (parameterized: -1 s, 0, +1 s) |

**Wave totals**: Wave 1 = 7 TCs (6 new ATCs + 1 reused) · Wave 2 = 4 TCs (5 ATCs) · Wave 3 = 11 TCs (11 ATCs). 22 TCs, 23 ATC methods, 22 new.

### Multi-layer split (justified)

| TC | ATCs | Why one TC becomes two ATCs |
|----|------|-----------------------------|
| BK-1001 (TC08) | UI `DataExportPage.verifySectionHiddenForNonOwner` + API `WorkspaceExportApi.rejectNonOwnerOnExportEndpoints` | AC-02 says the section is absent AND unreachable "by any route". Nav absence is a UI fact; the security boundary is the route's inline Owner check (`assertExportAuthorized`). ATP Risk #1 is exactly "nav hidden, API open": a single UI ATC would stay green while the API leaks. Different layer, different failure mode, same TMS ID (`className` disambiguates per `atc-tracing.md`). |

Every other TC whose truth spans two layers is already split across two TMS IDs, so no second ATC is needed: TC02 (UI) / TC24 (API) for the request, TC03 (UI) / TC26 (API) for the download, TC10 (UI) / TC17 (API) for expiry.

## Excluded TCs

| TMS ID | TC | Reason |
|--------|----|--------|
| BK-1005 | TC12 never-requested empty state | ROI verdict **Manual** (copy-clarity judgment). Note: the "never requested" body (`export: null`) is still asserted at API level by BK-1018 and implicitly by the first poll of every synthetic workspace. |
| BK-1007 | TC14 failed export reported with retry | ROI verdict **Manual**: no product-level failure-injection hook; forcing `status='failed'` needs a direct DB write. |
| BK-1008 | TC15 fresh request after a failed export | ROI verdict **Manual**: same blocker as BK-1007. |
| BK-1016 | TC23 direct storage-bucket access refused | ROI verdict **Manual**: needs a Supabase anon key the QA repo does not hold; verified by code review in ATR BK-1024. |
| BK-1020 | TC27 loading state | No ROI verdict and empty description in Jira. Not plannable until `/test-documentation` gives it a body and a verdict. |
| BK-1021 | TC28 error state | Same as BK-1020. |

## Automation Plan

**Order**: Wave 1 -> Wave 2 -> Wave 3. Inside Wave 1, BK-1017 first: its ATC (`requestExportSuccessfully`) and the settle-polling helper are the preconditions every later TC reuses. BK-1019 second: its download ATC plus the archive utility feed TC05 and the whole of Wave 3. Wave 2 starts with BK-994 (smoke, no export needed). Wave 3 starts with the archive-parsing ATCs that need no forced state (BK-999, BK-1014, BK-1011, BK-1012, BK-1013, BK-1015), then the forced-state ones once the mechanism question is answered (BK-1002, BK-1000, BK-1010), and the clock-mocked UI ones (BK-1003, BK-1006) last.

**Shared fixtures**:
- Synthetic workspace (create -> optional set-active -> soft-delete in `afterEach`): `WorkspaceExportSteps.createSyntheticWorkspace` / `.cleanupSyntheticWorkspace`, every TC.
- Completed export: `WorkspaceExportSteps.prepareCompletedExport` (request + bounded poll until `completed`), used by BK-1019, BK-998, BK-1009, BK-996 and all of Wave 3.
- Extracted archive (`unzip` -> `{ path: text }`): `tests/utils/archive.ts`, used inside every Wave 3 archive ATC.
- Seeded content incl. Run history: `WorkspaceExportSteps.seedWorkspaceContent`, used by BK-1015, BK-1013, BK-1014.

**Blocked by**:
- BK-1001: non-Owner role accounts are not wired (see Blockers).
- BK-1010 (and the deterministic variant of BK-1002 / BK-1000): forced DB state needs a decision (see Blockers).
- Wave 3 archive TCs: zip-reader dev dependency approval.

**Preconditions for the whole scope**: Owner account signed in by `api-setup` (cookie in `.auth/api-session.json`) and `ui-setup` (`.auth/user.json`); `POST /api/v1/workspaces` and `DELETE /api/v1/workspaces/{id}` reachable on the target env; export worker (`after()`) running on the target deployment.

## Expected-fail tests

None remain. BK-1015 was planned as expected-fail on BK-1025; the defect was fixed and closed on 2026-10-18 (ReTest BK-1167 PASSED), so BK-1015 now runs as a regular regression guard with no `test.fail` and no `@blocked` tag.

## Risks

| # | Risk | Impact | Mitigation in this plan |
|---|------|--------|-------------------------|
| R1 | Shared Supabase across local / staging / production: a test that touches a real workspace exports or audits real tenant data | High | Every test owns a synthetic workspace (`qa-auto-bk508-*` slug), never `getOwnedWorkspace()` for mutations; forced-state writes, if approved, are scoped `WHERE workspace_id = <synthetic id>` only |
| R2 | Soft-delete is the only cleanup: deleted workspaces linger 30 days (pg_cron purge), their ZIPs stay in the `workspace-exports` bucket (no purge job, dev plan "Known limitations"), and each delete emails the Owner | Medium | Distinctive slug prefix for manual purge; report volume after the first full run; open question Q7 |
| R3 | Export job completes asynchronously via Vercel `after()`; on a cold or killed function it can stay `running` | Medium | Bounded condition-based poll (`expect.poll`, no sleeps); a stuck job only blocks its own synthetic workspace; `failed` fails fast with `error_message` |
| R4 | Product race on BK-1002 / BK-1000: an empty workspace may export faster than the second request lands, making "in flight" unreachable without a DB write | Medium | Product-path variant asserts on the 409 oracle and fails with an explicit "precondition not reached" message instead of passing vacuously; DB-forced variant proposed as Q2 |
| R5 | OpenAPI `ActivityItem` union (`api/openapi.json`) has no `export.requested` / `export.downloaded` variant: either the local spec is stale or the contract drifted from `bunkai_list_activity` (ATP Risk #4, the documented allowlist-drift precedent) | Medium | Run `bun run api:sync` before Wave 1; ActivityApi asserts on the raw `action` string, not on the generated union; open question Q5 |
| R6 | Bearer PAT from `api-setup` rides every component (`TestFixture` propagates it); cookie-only routes answer 403 when a Bearer header is present, and a workspace-bound PAT reads a synthetic workspace's activity as an empty page | High (false negatives) | Cookie-only request option in `ApiBase` (automation-plan §2, ADR candidate) used by every call in this suite |
| R7 | UI derives `expired` client-side (`DataExportView`, `deriveState`, strict `expires_at > Date.now()`); the download route re-checks server-side with the DB clock | Medium | UI boundary tested with Playwright clock control (BK-1006, BK-1003); server boundary tested separately (BK-1010) |
| R8 | Archive file naming for "Run snapshots" was ambiguous (dev plan: `run_steps`; BK-1025: `runs.json`) | Low | Resolved (Q6) by the BK-1025 retest: only `runs.ndjson` is NDJSON, `runs.json` is absent, every other entity file is a JSON array. BK-1015 asserts exactly that |
| R9 | Global test timeout is 60 s; TCs with two completed exports (BK-1009) or full content seeding (BK-1015) can exceed it | Low | `test.slow()` on those tests, never a raised global timeout |

## Blockers

| Blocker | Affects | What unblocks it |
|---------|---------|------------------|
| Non-Owner credentials: `.env.example` lists `STAGING_ADMIN_*`, `STAGING_MEMBER_*`, `STAGING_VIEWER_*` only as commented keys, and `config/variables.ts` exposes `config.testUser` only | BK-1001 (both ATCs) | Real role accounts in `.env` + a `config.roleUsers` block (fails by name at the point of use) + per-role session setup |
| Forced DB state: no DB client in `package.json`, no service-role key in the variables module; `workspace_exports` has no client UPDATE policy | BK-1010 (hard), BK-1002 / BK-1000 (deterministic variant) | User decision Q2. Without it BK-1010 is `BLOCKED — unreachable precondition: completed export past expires_at` |
| ~~No zip reader in the test toolchain~~ RESOLVED: `fflate` approved and added as a devDependency (Q8) | All Wave 3 archive ATCs, BK-1019 body check | - |

## Test-Design Checklist (test-design-doctrine.md Part 3)

| Check | Result |
|-------|--------|
| P1 risk beyond AC | YES. Added beyond the ACs: PAT rejection on the GET poll route too (BK-1004 third row); credential exclusion checked for the raw value AND its SHA-256 hash (the form the server stores) (BK-1011, BK-1012); refused download writes no `export.downloaded` audit row (BK-1010 test-level); manifest counts must equal real file line/array lengths (BK-1014); non-Owner API refusal, not just nav absence (BK-1001 API ATC); 202 job id must match the next poll's id (BK-1017). |
| P2 AC as floor | YES. Contract (TC24-26), boundary (TC13 three points), isolation (TC07, TC20) go above AC wording. |
| P3 concrete exploration | YES. Each ATC names its data: synthetic workspace, minted PAT, issued invite, seeded Run. |
| P4 1:N per AC | YES. AC-02 -> 3 roles x 2 layers; AC-07 -> UI expired (TC10), server expired (TC17), boundary (TC13); AC-15 -> 3 endpoints; AC-10 -> PAT vs invite partitions. No AC collapsed to one case. |
| P5 anomalies | YES. Double request race (TC09), concurrent cross-workspace (TC07), empty workspace (TC06), stale UI vs server (TC17). DEFERRED with reason: failed-export path (BK-1007/1008 Manual, no fault-injection hook); stuck-in-running past any bound (no product timeout exists to assert against; noted for `/sprint-testing` exploratory charter). |
| EP | YES. Roles {owner} valid vs {admin, member, viewer} invalid; auth {cookie} valid vs {Bearer PAT} invalid; credential type {PAT, invite}; workspace content {empty, seeded}. Magic-link tokens: no capturable value exists (user-scoped, emailed), so TC19 asserts on invite tokens and on the absence of any `bk_pat_` / token-table export; magic-link partition is DEFERRED with this reason. |
| BVA | YES. 168 h window: UI at `expires_at - 1 s`, `expires_at`, `expires_at + 1 s` (BK-1006); window length `expires_at - completed_at == 168 h` exactly (BK-1006 test-level); server side one point each side of `now()` (BK-1010, if Q2 approved). One-in-flight limit: 1 accepted, 2nd refused (BK-1002). |
| BVA-D | N/A: nothing is rounded or truncated; timestamps compare at millisecond precision. |
| ST | YES. `export: null -> queued/running -> completed -> (expired by time)` and `completed -> new request` (BK-1009). Invalid transition `in flight -> second request` (BK-1002). `failed` transitions DEFERRED (Manual TCs). |
| DT | YES, small: download allowed iff `owner AND cookie AND status=completed AND expires_at > now()`. Covered rules: non-owner (BK-1001), PAT (BK-1004), not ready (implicit in poll-before-complete, BK-1017 test-level), expired (BK-1010), all true (BK-1019). |
| PW | N/A: fewer than 3 independent combinable factors per ATC. |
| PARAM | YES. BK-1004 (3 endpoints), BK-1001 (3 roles), BK-1006 (3 offsets) are one parameterized ATC each. BK-1011 / BK-1012 stay separate only because Jira holds two Test issues (merge candidate listed below). |
| RISK | YES. P0 = Owner gate, credential exclusion, isolation; drops logged in "Excluded TCs". |
| OBS | Reachable: empty workspace (fresh synthetic, BK-999). NOT reachable without a decision: expired-on-server (BK-1010) and guaranteed in-flight (BK-1002/1000), declared under Blockers with what it takes. |
| SEED | YES. Every completed/ready state comes from the real request -> worker path. The expired UI state reads a real `expires_at` and only moves the browser clock. The only seeded value would be a backdated `expires_at` (BK-1010, if approved), and its real-path sibling is BK-1006. |

## Merged TCs (proposals only, not applied)

| Candidate | Merge into | Reason |
|-----------|-----------|--------|
| BK-1012 | BK-1011 | Same behavior (no credential string anywhere in the archive), different credential type: one parameterized ATC would do. Kept separate because Jira holds two Tests; raise with `/test-documentation` if the team wants one. |

## Acceptance Criteria

- [ ] 22 TCs automated as 23 ATCs across 3 waves, each test on its own synthetic workspace with cleanup
- [ ] BK-1015 runs as a regular regression guard for BK-1025 (closed, no expected-fail markers)
- [ ] No fixed sleeps: every async wait is `expect.poll` / web-first assertion with a bounded timeout
- [ ] Tests pass on staging (and local when the local stack has the export worker)
