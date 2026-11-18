# BK-512: Delete a workspace I own

| Field | Value |
|-------|-------|
| **Priority** | P0 (non-Owner refusal, PAT/invite non-disclosure, isolation, cascade reach) / P1 (happy path, safeguards, restore) |
| **Phase** | Phase 1 plan only (no code). Ticket-driven, three coding waves |
| **Items** | 11 Candidate Tests -> 11 ATCs (merged TCs ride as Examples rows or in-ATC checks, see below) |
| **Dependencies** | BK-508 suite (reuse `WorkspaceExportSteps`, seeding components, role sessions). Needs the decisions in `automation-plan.md` §9 Q1 (audit read), Q2 (name gate), Q3 (lone account) before the affected waves |
| **Requires** | Owner account (`config.testUser`), role accounts admin/member/viewer (`config.roleUsers`), a synthetic workspace per test, read-only DB credential for the audit assertion (Q1), a one-workspace account for BK-946 (Q3) |
| **Source** | Story BK-512 (Epic BK-85). ATS BK-985, ATP BK-986, ATR BK-987. Governing decision: ADR-0015 (soft-delete, 30-day grace, access revoked at `deleted_at`). The Story's business-rules field still says "irreversible": ignored, the ACs and ADR-0015 win |

## Summary

Automates the 11 signed Candidates of BK-512 as four regression flows. The feature is the only purge-bound erasure of a whole tenant, on a Supabase project shared by local, staging and production, so the suite rule is the BK-508 rule: every test creates its own `qa-auto-bk512-*` workspace, and never mutates a workspace another session uses. For the tests whose subject IS the deletion, the deletion is the cleanup (soft-deleted workspaces linger 30 days, then the purge cron erases them).

Real behaviour verified in product source (`../upex-bunkai-tms`, read-only) and on the staging DB (SELECT only):
- `DELETE /api/v1/workspaces/{id}`: Owner-only, cookie-only (Bearer PAT = 403), 200 with `{workspaceId, wasActiveWorkspace, newActiveWorkspaceId, newActiveWorkspaceName, ...}`; the route does NOT read a `confirm_name` body, the name gate is UI-only (`DeleteWorkspaceModal`, `isLeaveConfirmEnabled`).
- `POST /api/v1/workspaces/{id}/restore`: Owner-only, cookie-only, 200 `{workspaceId, workspaceName}`; 409 `not_deleted`; 409 `restore_window_closed` after 30 days (BK-1735 fixed).
- `workspace_deletions` has NO API or RLS read surface. Columns: id, workspace_id (no FK), workspace_name, workspace_slug, requested_by, requested_at, purge_deadline, purged_at, member_count, row_count_digest. Readable only through a DB role (`qa_inspector_ro` has SELECT + BYPASSRLS).
- 26 tables carry an `ON DELETE CASCADE` FK to `workspaces` (purge time, not confirm time).

## Test Cases

Layer: `API` = `tests/integration/workspace-deletion/`, `UI` = `tests/e2e/workspace-deletion/`. Role = needs role sessions (`roles-setup`).

| TMS ID | TC | Title (short) | Flow | Type | Prio | Wave | Layer | Fixture | Target ATC (component.method) |
|--------|----|---------------|------|------|------|------|-------|---------|-------------------------------|
| BK-922 | TC07 | direct API DELETE refused for Admin/Member/Viewer | Safeguards | Negative / security | P0 | 1 | API (role) | `{ api }` | `WorkspaceDeletionApi.rejectDeleteByNonOwner` (3 roles) |
| BK-954 | TC39 (+TC40) | deleted-workspace PAT refused like an unknown token | Access revoked | Negative / security | P0 | 1 | API | `{ api }` | `WorkspaceDeletionApi.refuseDeletedWorkspacePat` |
| BK-956 | TC41 (+TC42) | deleted-workspace invite refused like an unknown invite | Access revoked | Negative / security (prior bug BK-988) | P0 | 1 | API | `{ api }` | `WorkspaceDeletionApi.refuseDeletedWorkspaceInvite` |
| BK-960 | TC45 (+TC46) | second owned workspace and its members untouched | Owner deletes | Isolation | P0 | 1 | API (role) | `{ api }` | `WorkspaceDeletionApi.leaveOtherWorkspaceUntouched` |
| BK-938 | TC23 | every child entity type unreachable (prior bug BK-991) | Owner deletes | Integration / matrix | P0 | 1 | API | `{ api }` | `WorkspaceDeletionApi.verifyEntityUnreachableAfterDeletion` (10 rows) |
| BK-981 | TC66 | restore inside 30 days brings everything back | Restores | Positive / recovery | P1 | 1 | API | `{ api }` | `WorkspaceDeletionApi.restoreDeletedWorkspace` |
| BK-926 | TC11 (+TC12, TC13) | confirm disabled until exact name | Safeguards | Negative / BVA | P1 | 2 | UI | `{ test }` | `WorkspacesSettingsPage.verifyConfirmGatedByExactName` (4 rows) |
| BK-930 | TC15 (+TC10, TC16) | dismissing changes nothing | Safeguards | Negative / state | P1 | 2 | UI + API read | `{ test }` | `WorkspacesSettingsPage.dismissDeleteConfirmationChangingNothing` |
| BK-937 | TC22 (+TC01/14/34/35/36/47/61) | Owner deletes one of several: lands in another, told which, audit written | Owner deletes | Positive / happy path | P1 | 3 | UI + DB read | `{ test }` | `WorkspacesSettingsPage.deleteOwnedWorkspaceAsOwner` |
| BK-946 | TC31 (+TC32, TC33) | only workspace deleted -> onboarding, signed in, create/join | Owner deletes | Positive / variant | P1 | 3 | UI | `{ test }` | `WorkspacesSettingsPage.deleteOnlyWorkspaceLandingOnOnboarding` |
| BK-941 | TC26 | teammate blocked from deleted-workspace URL (prior bug BK-988) | Access revoked | Negative / security | P0 | 3 | UI + API (role) | `{ test }` | `WorkspacesSettingsPage.verifyDeletedWorkspaceScreensBlocked` |

**Wave totals**: Wave 1 = 6 API ATCs (needs `integration-roles` project for 922, 960) · Wave 2 = 2 UI ATCs · Wave 3 = 3 ATCs (audit read, lone account, role teammate).

### Layer decisions (justified)

| TC | Choice | Why |
|----|--------|-----|
| BK-922 | API | The AC is "cannot reach by any route"; UI hiding is deferred (TC02/04-06). The API refusal is the real boundary. Both the cookie refusal (403, "Only the workspace Owner...") and the Owner-side re-read (workspace still listed, not deleted) run inside the ATC |
| BK-926, BK-930 | UI | The gate and the dismiss are modal behaviours. Server does not check the name, so API cannot prove them. BK-930's "contents intact" is read back through the API inside the ATC |
| BK-937, BK-946 | UI | The landing, toast and onboarding redirect are UI facts. BK-937 also asserts the audit row (DB read) because TC47/TC61 merged into it |
| BK-938, BK-954, BK-956, BK-960, BK-981 | API | Server contracts; UI add nothing |
| BK-941 | UI + API | Teammate opens the URL (UI); a direct API read of the same workspace returns not found (guard against UI-only masking, the BK-988 shape) |

## Excluded / deferred TCs

All other Tests are Deferred or merged by `/test-documentation` (see `.context/reports/PRIORITIZATION-BK-512.md`). Gaps with no regression TC (AC-06, 09, 12, 15, 18, 19, 20) are recorded in the Jira comment "Prioritization — Deferred scenarios". Not re-planned here.

## Automation Plan

**Order**: Wave 1 (API; needs only seeding + a new `WorkspaceDeletionApi`), then Wave 2 (UI safeguards, no deletion), then Wave 3 (blocked on Q1 and Q3 answers). Inside Wave 1: BK-954 and BK-956 first (no role sessions), BK-938 (needs bug and milestone seeding helpers), BK-981, then the role ones (BK-922, BK-960) once `integration-roles` exists.

**Shared preconditions**:
- Synthetic workspace: `WorkspaceExportSteps.createSyntheticWorkspace` (slug prefix parameterized to `qa-auto-bk512-`).
- Content: `WorkspaceExportSteps.seedWorkspaceContent` + new bug / milestone helpers.
- "Delete as Owner" (N=4+): `WorkspaceDeletionSteps.deleteAsOwner`.
- Teammate: `WorkspaceExportSteps.grantRoleInWorkspace`.

**Preconditions for the whole scope**: Owner session from `api-setup` / `ui-setup`; role sessions from `roles-setup` for BK-922, BK-960, BK-941; `DELETE` and `restore` reachable on the target env (verified live on staging, evidence 2026-09-10).

## Expected-fail tests

None planned. BK-988 (invite parity) and BK-991 (children reachable) were reported fixed: ATR BK-987 shows 67 of 69 PASSED including TC23, TC41, TC42. If a run proves otherwise, tag the ATC `@blocked` with the defect key, never leave it red silently.

## Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R1 | Shared Supabase across envs; a test that deletes the wrong workspace is real data loss | High | Delete only the id returned by this test's own `createWorkspace`; Steps `deleteAsOwner` refuses a workspace whose slug lacks the `qa-auto-bk512-` prefix (fail fast) |
| R2 | Soft-deleted workspaces linger 30 days; every delete emails the Owner and all active members (role accounts are real mailboxes) | Medium | Accept, report volume after first full run (Q6). Members that are not the subject leave before cleanup |
| R3 | `workspace_deletions` unreadable through any API | High | Q1: read-only DB role |
| R4 | UI name gate trims whitespace (`typed.trim() === name`), contradicting the TC11 "whitespace-padded" row and AC-04 "differs in any way" | Medium | Q2 |
| R5 | Landing workspace after deletion is the OLDEST remaining membership (BR-1), not the one the test created | Medium | Assert membership of the remaining set + toast name = `/me` active; do not assert a specific workspace |
| R6 | Concurrent suites touching the landed (possibly shared) workspace make "contents unchanged" flaky | Low | Snapshot is two stable reads of immutable-ish counts; discover-only, never mutate |
| R7 | Staging caps projects per workspace (BK-508 finding) | Low | One seed round per workspace |
| R8 | Role sessions exist only under `roles-setup` projects | Medium | New `integration-roles` project (Q4) |
| R9 | 60 s default timeout vs seed + delete + invites | Low | `test.slow()` on BK-938, BK-960, BK-941, never raise global timeout |

## Test-Design Checklist (test-design-doctrine.md Part 3)

| Check | Result |
|-------|--------|
| P1 risk beyond AC | YES. Beyond AC: BK-922 asserts workspace NOT deleted and still listed for the Owner after each refusal (no half-effect) and covers the PAT-bearing variant (Bearer = different 403 message); BK-954/956 compare the full error envelope, not just status; BK-938 asserts reachable-before so a vacuous 404 cannot pass; BK-960 asserts the other workspace's member still reads it |
| P2 AC as floor | YES. AC-02, 04, 05, 07, 10, 11, 13, 14, 16, 17 each get at least their literal scenarios plus the checks above |
| P3 concrete exploration | YES. Each ATC names its data (synthetic workspace, seeded ids, minted PAT, issued invite, role account) |
| P4 1:N per AC | YES. AC-02 -> 3 roles; AC-04 -> 4 typed-name partitions; AC-07 -> 10 entity types; AC-13/14 -> deleted vs never-existed. Merged TCs stay as rows, never collapsed to one assertion |
| P5 anomalies | PARTIAL by design: double-submit (TC63/64), concurrent write (TC56/57), failed deletion (TC48-50), in-flight run (TC43/44) are Deferred by ROI; the in-flight Run rides inside BK-938's seed (an open run is seeded). Purge-time behaviour (TC62, TC67) NOT automatable without a dev hook |
| EP | YES. Roles {owner} valid vs {admin, member, viewer}; credential {PAT, invite} x {deleted workspace, never existed}; typed name {empty, prefix, other case, padded, exact}; workspace count {only, one of several} |
| BVA | YES for the name gate (empty, N-1 chars prefix, case-flipped, padded, exact). Restore window 30 days: NOT automatable (needs backdated `deleted_at`, a DB write; Q2 of BK-508 forbids). In-window restore (BK-981) only |
| BVA-D | N/A |
| ST | YES. `active -> soft-deleted -> restored -> soft-deleted (cleanup)` (BK-981); invalid `restore of a non-deleted workspace` is Deferred. `owner -> deleted` UI landing (BK-937/946) |
| DT | YES, small: delete allowed iff `Owner AND cookie session AND not already deleted`. Covered: non-owner (BK-922), PAT bearer (BK-922 Bearer row), all true (BK-937) |
| PW | N/A |
| PARAM | YES. BK-922 (3 roles), BK-926 (4 partitions), BK-938 (10 entities), BK-954/956 (deleted vs unknown inside one ATC) |
| RISK | YES. P0 = refusals, isolation, cascade reach; drops logged in "Excluded" |
| OBS | Reachable: everything except the audit row (needs Q1), the lone-account onboarding path (needs Q3), the 30-day boundary (blocked) |
| SEED | YES. Deleted state comes from the real `DELETE`; no backdating, no DB writes |

## Merged TCs (already merged upstream; no new proposals)

BK-926 carries TC12/TC13; BK-930 carries TC10/TC16; BK-937 carries TC01/14/34/35/36/47/61; BK-946 carries TC32/TC33; BK-954 carries TC40; BK-956 carries TC42; BK-960 carries TC46. Merge candidate not applied: BK-954 and BK-956 share the "refused like an unknown X" pattern but are different credentials and different endpoints, kept separate (two Jira Tests).

## Acceptance Criteria

- [ ] 11 TCs automated as 11 ATCs across 3 waves, each test on its own `qa-auto-bk512-*` workspace
- [ ] No test deletes a workspace it did not create
- [ ] No fixed sleeps; every async wait is `expect.poll` / web-first assertion, bounded
- [ ] `workspace_deletions` asserted through a read-only DB role (or the TC47 portion explicitly moved out, per Q1)
- [ ] Tests pass on staging
