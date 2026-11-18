# Test Automation Plan: BK-512

> Ticket: BK-512 — TMS-Workspace | Delete a workspace I own
> Type: integration + e2e (hybrid, three waves)
> Created: 2026-11-14 (Phase 1, plan only)
> Spec: `spec.md` (same folder). Open questions are Q1..Qn in §9.

## 1. Ticket Summary

- **What to test**: Owner-only "Delete workspace" in Settings > Workspaces (type-the-name gate, dismiss), `DELETE /api/v1/workspaces/{id}` and `POST /api/v1/workspaces/{id}/restore` (cookie-only), the access cut at `deleted_at` (children, PATs, invites, teammates), isolation, the landing, and the `workspace_deletions` tombstone.
- **ACs reached by the 11 Candidates**: AC-01, 02, 04, 05, 07, 08, 10, 11, 13, 14, 16, 17, plus the restore scenario (ADR-0015 point 10, no standalone AC) and N4 (tombstone). Uncovered by regression, by decision: AC-06, 09, 12, 15, 18, 19, 20.
- **Dependencies**: BK-508 suite (components, Steps, role sessions). BK-508's cleanup already relies on `WorkspacesApi.deleteWorkspace`.

### Verified facts the plan rests on

| Fact | Source | Consequence |
|------|--------|-------------|
| DELETE ignores any body; name gate is UI-only | `app/api/v1/workspaces/[id]/route.ts`, `DeleteWorkspaceModal.tsx` | `WorkspacesApi.deleteWorkspace` sends `confirm_name` harmlessly; its JSDoc ("the route requires the name") is stale. API tests cannot prove the gate |
| Gate is `typed.trim() === name` | `lib/account/leave-workspace.ts` | "whitespace-padded" is a distinct row of the name gate (Q2) |
| Modal has stable `data-testid`s | `delete-workspace-modal`, `-input`, `-confirm`, `-cancel`, `-export-link`; row `workspace-row-<slug>`, `workspace-delete-<slug>`, `workspace-leave-<slug>` | Role/testid locators, no text scraping |
| Success toast: `<name> was deleted. <new> is now your active workspace.`; no workspace left -> `router.push('/onboarding')` | `DeleteWorkspaceModal.tsx` | BK-937 / BK-946 assertions |
| Delete only re-points when the deleted one was ACTIVE (`wasActiveWorkspace`) | same | Tests set the synthetic workspace active first (`createSyntheticWorkspace({ makeActive: true })`) |
| Landing = oldest remaining membership (BR-1, `resolveActiveWorkspaceId`) | ADR-0015 / ruling 2026-08-23 | Never assert a specific destination |
| `workspace_deletions`: RLS on, no policy; `qa_inspector_ro` has SELECT + BYPASSRLS | staging DB (SELECT only) | Only a DB connection can read it (Q1) |
| 26 child tables FK-cascade to `workspaces` (purge time) | `pg_constraint` read | TC23 matrix is about RLS/RPC gates, not the physical cascade |
| Restore: 409 `not_deleted`, 409 `restore_window_closed`, 404 purged/non-member | route + 0125 | BK-981 only exercises the 200 path |
| Evidence of reachable-after-delete bug class: tests/runs/ATCs/environments used admin client + DEFINER RPCs that ignored `deleted_at` (BK-991) | evidence 2026-09-10 | BK-938 reachable-before check is mandatory |

## 2. Architecture Decisions

| # | Decision | Value | Rationale |
|---|----------|-------|-----------|
| D1 | Cookie-only everywhere | Reuse `RequestOptions.cookieOnly` / `cookieOnlyHeaders` (ADR-0018) | DELETE and restore answer 403 to Bearer. The Bearer-PAT row of BK-922 uses a cookieless context deliberately |
| D2 | Synthetic workspace | `createWorkspace` in `beforeEach`, soft-delete in `afterEach` unless the test already deleted it | Same rule as BK-508 D2. Slug prefix `qa-auto-bk512-` (DataFactory takes a prefix) |
| D3 | Deletion IS the cleanup | Tests that delete mark the workspace `deleted` in a local flag; `afterEach` skips a second DELETE (would 404) and, for BK-981, deletes again after the restore | Avoids a noisy 404 and a second email |
| D4 | New API component `WorkspaceDeletionApi` | Owns DELETE/restore ATCs and the post-deletion effect ATCs | Same split as `WorkspaceExportApi` vs `WorkspacesApi` (helpers stay in `WorkspacesApi`) |
| D5 | New UI component `WorkspacesSettingsPage` | `/settings/workspaces`; the confirmation modal is private locators inside it | One page, one component. The modal is used by 4 ATCs, so its locators are extracted to private getters (2+ uses rule) |
| D6 | New Steps `WorkspaceDeletionSteps` | "delete a workspace as its Owner" + seeded-workspace and teammate chains. Composes `WorkspaceExportSteps` (create, seed, grantRole, cleanup) | N=5 consumers (BK-938, 954, 956, 960, 981 + UI via the page) above the 3+ threshold |
| D7 | Role sessions for API tests | New Playwright project `integration-roles` (storageState `apiSessionPath`, depends on `api-setup` + `roles-setup`), script `test:integration:roles`; specs BK-922 and BK-960 are `testIgnore`d from `integration` / `smoke-api` and the BK-941 spec joins the `e2e-roles` regex | Mirrors the BK-508 `roleSessionTests` pattern. A plain run never needs role credentials |
| D8 | Teammate / non-Owner request contexts | `playwright.request.newContext({ storageState: config.auth.roleStatePath(role), baseURL })` created in the test, disposed in `finally`; passed into component calls as `{ request }` | Same shape as `grantRoleInWorkspace` memberRequest |
| D9 | Audit read | `tests/utils/deletionAudit.ts`: `readWorkspaceDeletions(workspaceId): Promise<DeletionRecord[] \| null>` over a read-only Postgres connection (new devDependency `postgres`), credential `config.readOnlyDb.url` (variable `STAGING_DB_RO_URL`; staging is the only environment mapped to one, local has none), fails by name at point of use | Utility returns `null` when unconfigured. BK-937 then runs its whole UI part first (every UI assertion), and only at the end calls `test.skip` INSIDE the ATC with a reason naming `STAGING_DB_RO_URL` / `qa_inspector_ro`: Playwright reports the test skipped, the `@atc` decorator records BK-937 as SKIP, and the result records (`reports/atc_results.json`, `reports/test-outcomes.json`) show NOT RUN, never PASS. The UI step results stay visible in the report |
| D10 | Unknown-token / unknown-invite oracles | Generated in-ATC: PAT `bk_pat_` + random base64url of the same length; invite `bk_inv_` + random | Needs no persisted fixture; "never existed" is guaranteed by randomness |
| D11 | Entity probes (BK-938) | One probe table in the ATC, verified on staging at Code time (§5 BK-938) | Evidence 2026-09-10 shows some entity routes have no GET |

### Component Strategy

| Decision | Value | Rationale |
|----------|-------|-----------|
| API: workspaces | `WorkspacesApi.ts` (EXISTS) | Extend helpers only: `deleteWorkspaceRaw`, `restoreWorkspace`, `getWorkspaceById` |
| API: deletion | `WorkspaceDeletionApi.ts` (NEW) | ATCs for BK-922, 938, 954, 956, 960, 981 |
| API: seeding gaps | `BugsApi.ts` (NEW, helper only), `ProjectsApi.createMilestone` (extend) | BK-938 needs a Bug and a Milestone. Standalone bug body `BugStandaloneCreateBody`; milestone `{name, target_date}` (today or later) |
| API: reuse | `TokensApi.issueToken`, `WorkspacesApi.createInvite/acceptInvite/leaveWorkspace/setActiveWorkspace`, `ProjectsApi`, `UserStoriesApi`, `AtcsApi`, `TestsApi`, `RunsApi`, `AuthApi.getCurrentUser` | Already in manifest |
| UI | `WorkspacesSettingsPage.ts` (NEW) | ATCs for BK-926, 930, 937, 946, 941 |
| Steps | `WorkspaceDeletionSteps.ts` (NEW) | D6 |
| Fixture (API TCs) | `{ api }` | API only |
| Fixture (UI TCs) | `{ test }` | UI flows need API setup in the same test |
| Test files | `tests/integration/workspace-deletion/*.test.ts`, `tests/e2e/workspace-deletion/*.test.ts` | camelCase verb names |
| ApiFixture / UiFixture | register `workspaceDeletion`, `bugs`; register `workspacesSettings` in `UiFixture` | follows existing registration |

### [E2E ONLY] UI Elements (`/settings/workspaces`)

| Element | Strategy | Value |
|---------|----------|-------|
| Workspaces card | testid | `workspaces-list`; rows `workspace-row-<slug>` |
| Delete action | testid | `workspace-delete-<slug>` (only Owner rows) |
| Leave action | testid | `workspace-leave-<slug>` |
| Active marker | testid | `workspace-active-<slug>` |
| Modal | testid | `delete-workspace-modal` (role `alertdialog`) |
| Name field | testid | `delete-workspace-input` |
| Confirm / Cancel | testid | `delete-workspace-confirm`, `delete-workspace-cancel` |
| Export offer | testid | `delete-workspace-export-link` |
| Success / error toast | role | `getByText('<name> was deleted.')` (Sonner), prefix match |
| Onboarding | URL + role | `/onboarding`; create / join actions located inline at Code time (product screen not yet inspected, §9 Q9) |
| Teammate dead screens | URL | `/projects/<slug>/...` of the deleted workspace, plus `/workspaces/<id>/restore` (Owner-only page, must not render for a member) |

### [INTEGRATION ONLY] API Details

| Aspect | Value |
|--------|-------|
| Endpoints | `DELETE /api/v1/workspaces/{id}`, `POST /api/v1/workspaces/{id}/restore`, `GET /api/v1/workspaces`, `GET /api/v1/workspaces/{id}`, `GET /api/v1/me`, `POST /api/v1/tokens`, `POST /api/v1/workspaces/{id}/invites`, `POST /api/v1/invites/accept`, seeding chain, per-entity probes (§5 BK-938) |
| Types | `DeleteWorkspaceResponse`, `WorkspaceWithRole`, `CreateInviteResponse`; add `@schemas/workspaces.types` facades `RestoreWorkspaceResponse`, `WorkspaceDeletionRecord` (hand-written, not in OpenAPI) |
| Auth | Owner cookie (api-setup); role cookies for BK-922/960 |
| Return pattern | helpers return `[APIResponse, TBody]`; ATCs return the minimal evidence tuple |
| Status map | DELETE: 200 ok · 401 · 403 non-Owner or Bearer · 404 not member / already deleted. Restore: 200 · 403 · 404 · 409 `not_deleted` / `restore_window_closed` |

## 3. ATC Registry

### Existing ATCs (Reuse)

None of the 25 manifest ATCs is reused. No BK-512 @atc id exists in `kata-manifest.json` (checked: ids BK-311..314, 994..1019 only). None of the 11 ids below collides.

### New ATCs (Create)

| ATC ID | Wave | Component | Method | Description |
|--------|------|-----------|--------|-------------|
| BK-922 | 1 | WorkspaceDeletionApi | `rejectDeleteByNonOwner({ workspaceId, role, memberRequest })` | Role cookie DELETE -> 403 `forbidden` "Only the workspace Owner..."; Bearer variant 403 session-only message; Owner re-read: still listed, same `name`, not deleted; row per role (admin, member, viewer) |
| BK-954 | 1 | WorkspaceDeletionApi | `refuseDeletedWorkspacePat({ token })` | Same PAT worked before (positive control, in the test body via `tokenWorkedBefore`) and is refused after; refusal envelope equals the one for a random never-issued token (status, `error.code`, `error.message`, key set); no workspace name/id in the body |
| BK-956 | 1 | WorkspaceDeletionApi | `refuseDeletedWorkspaceInvite({ token, inviteeRequest })` | Accept of the deleted-workspace invite and of a random token return the identical envelope; no workspace name/id; invitee session never joins (list unchanged) |
| BK-960 | 1 | WorkspaceDeletionApi | `leaveOtherWorkspaceUntouched({ otherWorkspaceId, before, memberRequest })` | After deleting the first: second workspace row identical, content probes equal `before` snapshot, member still lists it with the same role and can read it |
| BK-938 | 1 | WorkspaceDeletionApi | `verifyEntityUnreachableAfterDeletion({ target, reachableBefore })` (`softFail`) | Asserts `reachableBefore === true` (observed pre-delete), then every probe route of the entity answers 404 `not_found` (405 is inconclusive and fails). A failing row records FAIL and returns `undefined`; the test runs the 10 rows sequentially in ONE test, asserts the failed-entity list is empty, and asserts `GET /workspaces/{id}` answers 404 for the workspace itself |
| BK-981 | 1 | WorkspaceDeletionApi | `restoreDeletedWorkspace({ workspace, contentBefore })` | Restore 200 with `{workspaceId, workspaceName}`; `GET /workspaces/{id}` 200 identical row; listed again; membership role restored; content probes equal `contentBefore`. PAT / invite revocation NOT asserted (Q7) |
| BK-926 | 2 | WorkspacesSettingsPage | `verifyConfirmGatedByExactName({ workspace, typed })` | Open modal, type `typed`, confirm disabled; workspace still listed; 4 rows: empty, prefix, case-flipped, padded (padded is a normal passing row, Q2). Final control row inside the ATC: exact name enables the button, then closes the modal WITHOUT confirming |
| BK-930 | 2 | WorkspacesSettingsPage | `dismissDeleteConfirmationChangingNothing({ workspace, readContentSnapshot })` | Modal names exactly this workspace, nothing deleted yet; type exact name; Cancel; back on list, row present; snapshot before == after; reopen shows empty field. Escape and overlay click are NOT in scope (TC16 covers the dismiss path it merged) |
| BK-937 | 3 | WorkspacesSettingsPage | `deleteOwnedWorkspaceAsOwner({ workspace, memberOnly, remaining, snapshotsBefore, readSnapshot, ownerUserId, readDeletionAudit })` | Owner row has Delete, member-only row has none; confirm; row gone; toast names a workspace in the remaining set and `/me.active_workspace_id` equals it; destination snapshot unchanged; `workspace_deletions` row: name at the time, `requested_by` = Owner, `requested_at` within [start, end], exactly 1 row (Q1). Without the read-only DB the UI part runs first, then the ATC calls `test.skip` (SKIP / NOT RUN) |
| BK-946 | 3 | WorkspacesSettingsPage | `deleteOnlyWorkspaceLandingOnOnboarding({ workspace })` | Confirm; URL `/onboarding`; page offers the create-workspace form; `GET /me` 200 (still signed in) with `workspaces: []` (Q3) |
| BK-941 | 3 | WorkspacesSettingsPage | `verifyDeletedWorkspaceScreensBlocked({ screens, restoreUrl, hiddenTexts, readDeletedWorkspaceStatus })` | Teammate page, after a positive control (`verifyWorkspaceScreensLive`): each deleted-workspace URL is opened and re-opened with a fresh `goto` (not a reload), lands on the product's redirect destination, and shows neither the screen's live marker nor any hidden text; the restore page refuses the teammate; callback does teammate API `GET /workspaces/{id}` -> 404 |

### New Helpers (No @atc)

| Component | Method | Returns | Description |
|-----------|--------|---------|-------------|
| WorkspacesApi | `deleteWorkspaceRaw(workspaceId)` | `[APIResponse, DeleteWorkspaceResponse]` | Cookie-only DELETE, no assertion (race / refusal callers) |
| WorkspacesApi | `restoreWorkspace(workspaceId)` | `[APIResponse, RestoreWorkspaceResponse]` | Cookie-only POST restore, no assertion |
| WorkspacesApi | `getWorkspaceById(workspaceId)` | `[APIResponse, Workspace]` | GET one workspace (cookie) |
| ProjectsApi | `createMilestone(projectId, payload)` | `Milestone` | Seed only, `target_date` = today + 30 d |
| BugsApi | `createBug(payload)` | `Bug` | Standalone bug, seed only |
| WorkspaceDeletionApi | `probeEntity({ entity, entityId, workspaceId? })` | `[APIResponse, unknown]` | Entity -> route table (private); non-ATC helper used for the reachable-before capture |
| WorkspaceDeletionApi | `captureContentSnapshot(workspaceId)` | `ContentSnapshot` | `GET /workspaces/{id}` + `/recent-projects` + `/open-bugs` + `/coverage`, normalized and stripped of volatile fields |
| utils/deletionAudit | `readWorkspaceDeletions(workspaceId)` | `DeletionRecord[] \| null` | D9 |
| DataFactory | `createWorkspacePayload({ prefix })` | payload | add prefix param (`qa-auto-bk512`) |
| DataFactory | `createUnknownPat()`, `createUnknownInviteToken()` | string | D10 |

### Steps (Layer 3.5)

`tests/components/steps/WorkspaceDeletionSteps.ts` (extends `TestContext`, `{ page?, request }`, composes `WorkspaceExportSteps`):

| Method | Composes | Used by |
|--------|----------|---------|
| `createOwnedWorkspaceWithContent({ makeActive?, withEverything? })` | `createSyntheticWorkspace` + `seedWorkspaceContent` (+ bug, milestone when `withEverything`) | BK-938, 960, 981, 930, 937 |
| `deleteAsOwner(workspace)` | `WorkspacesApi.deleteWorkspace` after a prefix guard (R1); returns the 200 receipt and records `deleted` | BK-938, 954, 956, 960, 981, 941 |
| `grantTeammate({ workspaceId, role, memberRequest })` | `WorkspaceExportSteps.grantRoleInWorkspace` | BK-941, 960 |
| `cleanupDeletionWorkspace({ workspace, deleted })` | skips DELETE when `deleted`; otherwise `cleanupSyntheticWorkspace` | every `afterEach` |

## 4. Test Data Strategy

| Data | Pattern | Source | Lifecycle |
|------|---------|--------|-----------|
| Owner identity | Discover | `config.testUser` | Suite |
| Subject workspace | Generate | `POST /workspaces`, slug `qa-auto-bk512-<ts>-<rand6>` | `beforeEach`; deleted by the test itself or by `afterEach` |
| Content (project..run, bug, milestone, environment) | Generate | `WorkspaceDeletionSteps.createOwnedWorkspaceWithContent` (one seed round) | dies with the workspace |
| Non-Owner / teammate | Discover (real accounts) | `config.roleUsers.{admin,member,viewer}` + `grantRoleInWorkspace` | role session via `.auth/role-<role>.json`; member membership lingers in the soft-deleted workspace (cannot leave after deletion), erased at purge |
| Member-only workspace for BK-937 | Generate | created by `config.roleUsers.admin` (own session), Owner invited as `member` and accepts | Owner leaves, admin deletes in `afterEach` |
| Second owned workspace + second member (BK-960) | Generate | same chain; member = `config.roleUsers.member` | member leaves, then Owner deletes it in `afterEach` |
| PAT (BK-954) | Generate | `TokensApi.issueToken` bound to subject workspace, scopes `atc:read` + `workspace:admin`, `expiresInDays: 1` | revoked by the delete |
| Invite (BK-956) | Generate | `createInvite` role `member`, email `DataFactory.createInviteEmail()` | revoked by the delete |
| Unknown PAT / invite token | Generate | D10 | none |
| Typed names (BK-926) | Modify | derived from the workspace name: `slice(0, n-1)`, case-swap, `' ' + name + ' '`, `''` | none |
| Lone-workspace account (BK-946) | Discover | `STAGING_LONE_OWNER_*` (new, Q3) | account ends with zero workspaces; each run creates then deletes its own |
| Audit row (BK-937) | Discover (read) | `workspace_deletions` via read-only role | none; row persists by design |
| Restored state (BK-981) | Generate | real DELETE then real restore | `afterEach` deletes again |

### DataFactory additions

```typescript
// tests/data/DataFactory.ts
static createWorkspacePayload(overrides?: Partial<CreateWorkspacePayload> & { prefix?: string }): CreateWorkspacePayload
static createUnknownPat(): string            // `bk_pat_` + 43 random base64url chars
static createUnknownInviteToken(): string    // `bk_inv_` + 43 random base64url chars
static createMilestonePayload(): { name: string, target_date: string }
```

### Constants additions

```typescript
// tests/data/constants.ts
export const DELETION_SLUG_PREFIX = 'qa-auto-bk512';
export const DELETION_ENTITY_TYPES = ['project', 'module', 'user_story', 'acceptance_criterion', 'atc', 'test', 'run', 'bug', 'milestone', 'environment'] as const;
```

## 5. Test Scenarios

Every file: `beforeEach` creates its synthetic workspace through Steps; `afterEach` calls `cleanupDeletionWorkspace` (skips the DELETE if already deleted).

### Wave 1: API (no browser)

#### `tests/integration/workspace-deletion/refuseDeletedWorkspacePat.test.ts` · `{ api, request }` · `@critical`
- `BK-954: should refuse a personal access token of a deleted workspace exactly like a token that never existed`. Body: issue PAT -> positive control `GET /workspaces/{id}` 200 with that PAT (cookieless context) -> `deleteAsOwner` -> `refuseDeletedWorkspacePat`.

#### `tests/integration/workspace-deletion/refuseDeletedWorkspaceInvite.test.ts` · `{ api, request }` · `@critical`
- `BK-956: should refuse an outstanding invite to a deleted workspace exactly like an invite that never existed`. Invitee request = role `viewer` session (accept of both tokens is refused; the real invite would otherwise make that account a member, so nothing is cleaned).

#### `tests/integration/workspace-deletion/unreachableAfterDeletion.test.ts` · `{ api, request }` · `@critical` · `test.slow()`
- `BK-938: should make every kind of content unreachable when the Owner deletes the workspace`. ONE test (BK-1006 precedent: a failing precondition in a per-row test writes no row, and the other rows would sync a false PASS): seed everything, capture `reachableBefore` per entity with `probeEntity`, delete once, then call the ATC 10 times sequentially.

| Entity | Probe (verify on staging at Code time) | Note |
|--------|----------------------------------------|------|
| project | `GET /projects/{id}/coverage` | project has no direct GET; evidence showed 405 on `/modules` |
| module | `PATCH /modules/{id}` with its own current name | no GET route |
| user_story | `GET /user-stories/{id}` | |
| acceptance_criterion | `GET /acceptance-criteria/{id}` | |
| atc | `GET /atcs/{id}` (and `/usage`) | BK-991 class |
| test | `GET /tests/{id}` | BK-991 class |
| run | `GET /runs/{id}` (seeded open Run, covers TC43/44 shape) | BK-991 class |
| bug | `GET /bugs/{id}` | |
| milestone | `PATCH /milestones/{id}` with its own name | |
| environment | `PATCH /environments/{id}` with its own name | evidence used DELETE; PATCH is non-destructive |

#### `tests/integration/workspace-deletion/isolateOtherWorkspace.test.ts` · `{ api, request }` · role session
- `BK-960: should leave a second owned workspace and its members untouched when the first is deleted`. Two workspaces, member role in the second; `captureContentSnapshot` both before; delete first; ATC on the second.

#### `tests/integration/workspace-deletion/restoreDeletedWorkspace.test.ts` · `{ api, request }`
- `BK-981: should bring the workspace and everything it held back when the Owner restores it inside the 30-day window`.

#### `tests/integration/workspace-deletion/rejectDeleteByNonOwner.test.ts` · `{ api, request }` · role session · `@critical`
- `BK-922: should refuse a direct delete request when the caller is an <role>` x3 (admin, member, viewer). Role grant via `grantTeammate`; role leaves in `finally` before Owner cleanup (a refused delete means the workspace is alive, so leaving is allowed).

### Wave 2: UI safeguards (no deletion)

#### `tests/e2e/workspace-deletion/gateWorkspaceDeletionByName.test.ts` · `{ test }` · `@critical`
- `BK-926: should keep the confirm action unavailable when the typed name is <partition>` x4.

#### `tests/e2e/workspace-deletion/dismissWorkspaceDeletion.test.ts` · `{ test }`
- `BK-930: should leave the workspace and its contents intact when the Owner dismisses the confirmation after typing the exact name`.

### Wave 3: UI deletion flows and audit

#### `tests/e2e/workspace-deletion/deleteOwnedWorkspace.test.ts` · `{ test }`
- `BK-937: should remove the workspace, land the Owner in another one they are told about and record the deletion`. Blocked on Q1 for the audit lines; everything else runnable.
- `BK-946: should take the Owner to onboarding, still signed in, when their only workspace is deleted`. Runs in a describe that signs in as the lone account (own `storageState` created by a setup step, Q3).

#### `tests/e2e/workspace-deletion/blockTeammateAfterDeletion.test.ts` · `{ test }` · role session (joins `roleSessionTests` regex)
- `BK-941: should block a teammate from any screen of a deleted workspace when they open it by direct link`.

## 6. Implementation Order (one commit per box)

**Wave 1**
- [ ] `DataFactory` prefix + unknown-token generators, `constants.ts` additions
- [ ] `WorkspacesApi` helpers (`deleteWorkspaceRaw`, `restoreWorkspace`, `getWorkspaceById`), `@schemas/workspaces.types` facades
- [ ] `ProjectsApi.createMilestone`, `BugsApi.createBug`, register in `ApiFixture`
- [ ] `WorkspaceDeletionApi` (+ `ApiFixture` registration), `WorkspaceDeletionSteps`
- [ ] BK-954, BK-956, BK-938, BK-981 test files; run on staging; `bun run kata:manifest`
- [ ] `playwright.config.ts` `integration-roles` project, `package.json` `test:integration:roles`; BK-922, BK-960

**Wave 2**
- [ ] `WorkspacesSettingsPage` + `UiFixture` registration
- [ ] BK-926, BK-930 test files

**Wave 3** (after Q1, Q3 answers)
- [ ] `tests/utils/deletionAudit.ts`, `config.readOnlyDb`, `postgres` devDependency
- [ ] Lone-account setup; BK-937, BK-946
- [ ] BK-941

### Fixture registration changes

| File | Change |
|------|--------|
| `tests/components/ApiFixture.ts` | register `workspaceDeletion: WorkspaceDeletionApi`, `bugs: BugsApi`; propagate `setAuthToken` / `clearAuthToken` |
| `tests/components/UiFixture.ts` | register `workspacesSettings: WorkspacesSettingsPage` |
| `playwright.config.ts` | `integration-roles` project; extend `roleSessionTests` regex with the BK-941 file; `testIgnore` the two role integration specs from `integration` and `smoke-api` |
| `config/variables.ts` | `config.readOnlyDb` (name-validated getter), optional `config.loneOwner` (Q3) |
| `package.json` | `test:integration:roles`; devDependency `postgres` (Q1) |

### Complexity per ATC

| ATC | Complexity | Driver |
|-----|-----------|--------|
| BK-954, BK-956 | Medium | envelope parity vs never-existed oracle |
| BK-938 | High | 10 entity probes, 4 non-GET |
| BK-981 | Medium | snapshot equality |
| BK-922 | Medium | role sessions, 3 rows |
| BK-960 | High | two workspaces + member session + snapshots |
| BK-926, BK-930 | Low-Medium | modal |
| BK-937 | High | landing non-determinism, DB read |
| BK-946 | Medium | lone account |
| BK-941 | Medium | role page + URL set |

## 7. Success Criteria

- [ ] All in-scope ACs covered plus the beyond-AC checks in `spec.md`
- [ ] KATA compliance (atomic ATCs, no ATC calling ATC, max 2 positional params, inline locators except the 2+ use modal getters, alias imports)
- [ ] Fixture choice per file as in §5
- [ ] No hardcoded waits; every async wait bounded and condition-based
- [ ] Every test leaves no live synthetic workspace behind
- [ ] Tests pass on staging

## 8. Dependency graph

```
DataFactory/consts --> WorkspacesApi helpers --> WorkspaceDeletionApi --> WorkspaceDeletionSteps --> Wave 1 tests
BugsApi + createMilestone ------------------------------------------------> BK-938
integration-roles project (roles-setup) -----------------------------------> BK-922, BK-960
WorkspacesSettingsPage ----------------------------------------------------> Wave 2, Wave 3
Q1 read-only DB role + deletionAudit.ts ----------------------------------> BK-937 (audit lines)
Q3 lone account ------------------------------------------------------------> BK-946
roles-setup + e2e-roles regex ----------------------------------------------> BK-941
```

## 9. Open questions: Resolved (2026-11-15)

| # | Resolution | Applied in |
|---|------------|------------|
| Q1 | RESOLVED, approved read-only. `postgres` devDependency, `tests/utils/deletionAudit.ts` (one parameterized SELECT, session opened `default_transaction_read_only=on`), `config.readOnlyDb` from `STAGING_DB_RO_URL` (`@sensitive`, optional, must be the `qa_inspector_ro` role; declared in `.env.schema`, commented name in `.env.example`). Unset = the utility returns `null`; BK-937 runs its whole UI part, then `test.skip`s inside the ATC naming `STAGING_DB_RO_URL` / `qa_inspector_ro`, so the run reports skipped and BK-937 syncs as NOT RUN (never a PASS for the merged audit TCs TC47/TC61). The user writes the value in `.env`. | `tests/utils/deletionAudit.ts`, `config/variables.ts`, `WorkspacesSettingsPage.deleteOwnedWorkspaceAsOwner` |
| Q2 | RESOLVED. Padded row kept (4 rows) as a normal passing check: on staging (2026-11-15) the padded value keeps the button disabled, so the planned `knownDefect` marker for the BK-1918 report was never needed and the row carries no annotation or blocked state. Re-add a marker on that row only if the behaviour resurfaces. | `gateWorkspaceDeletionByName.test.ts` |
| Q3 | RESOLVED. Lone-owner account via `STAGING_LONE_OWNER_EMAIL` / `STAGING_LONE_OWNER_PASSWORD` (`config.loneOwner`, validated by name at the point of use). The test signs in on demand (no setup project), creates its own workspace, deletes it from the UI and ends with the account at zero workspaces. | `config/variables.ts`, `WorkspaceDeletionSteps.openLoneOwnerContext`, BK-946 |
| Q4 | RESOLVED, approved. `integration-roles` Playwright project + `test:integration:roles` script, same opt-in pattern as `e2e-roles`. BK-956 also needs a role session (the invitee is the `viewer` account), so it joins `integration-roles`; BK-922 and BK-960 as planned. | `playwright.config.ts`, `package.json` |
| Q5 | RESOLVED. BK-937 member-only workspace is created by the `admin` role account, the Owner is invited as `member`. | `WorkspaceDeletionSteps.createMemberOnlyWorkspace` |
| Q6 | RESOLVED, accepted (email volume). | all |
| Q7 | RESOLVED. BK-981 asserts only content, memberships and listing; PAT and invite state after restore are NOT asserted. | `WorkspaceDeletionApi.restoreDeletedWorkspace` |
| Q8 | RESOLVED. BK-988 and BK-991 are closed: no expected-fail markers (BK-938 and BK-956 pass on staging). | BK-938, BK-956 |
| Q9 | RESOLVED. Onboarding inspected in the product source and live: it offers ONLY the create-workspace form (name field, slug field, "Create workspace" button); no "join" action exists on that screen (joining is by invite link). BK-946 asserts the create form; the plan's "create and join" is not asserted. | `WorkspacesSettingsPage.deleteOnlyWorkspaceLandingOnOnboarding` |
| Q10 | RESOLVED. Stale JSDoc of `WorkspacesApi.deleteWorkspace` fixed (the route ignores the body; the name gate is UI-only). | `WorkspacesApi.ts` |
