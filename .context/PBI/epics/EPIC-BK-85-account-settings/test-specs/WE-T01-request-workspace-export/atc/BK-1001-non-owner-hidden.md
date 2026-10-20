# ATC Spec: BK-1001 — verifySectionHiddenForNonOwner

> Ticket: BK-1001 (TC08)
> Component: DataExportPage (tests/components/ui/DataExportPage.ts); the Owner-side re-read uses WorkspaceExportApi.getExport (helper) through a reader callback
> Type: UI Negative + API Negative / security
> Parent Story: BK-508 · Wave 2 · unblocked (Q1 answered 2026-10-19)

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| Non-Owner never sees or reaches the export | Section absent from the nav AND every export route refuses the role | Synthetic workspace owned by the Owner; the role account is an active `admin` / `member` / `viewer` member of it | AC-02, BR Owner-only, ATP Risk #1 |

One ATC covering both layers (API refusals + UI absence), one TMS ID: justification in `spec.md` "Multi-layer split". Every BK-1001 verification runs INSIDE the ATC, so any failure writes a FAIL row (revised 2026-10-20, Judgment Day round 2).

## 2. ATC Contracts

```typescript
interface NonOwnerExportCheck {
  workspaceId: string                                   // the active workspace (guard: the view reads THIS one)
  ownerExportId: string                                 // the Owner's completed export, prepared before the call
  readOwnerLatestExportId: () => Promise<string | null> // reads the latest export on the OWNER's session
}

/**
 * ATC (DataExportPage, on the role page): every export route refuses the non-Owner, nothing is
 * enqueued, and Settings shows no Data export section
 * Fixed assertions, in order:
 *  1. API on the role's own cookie session (page.request): POST, GET poll and GET download each answer
 *     403 with the `forbidden` envelope, the Owner-gate message
 *     (`^Only the workspace Owner can (request or )?download a data export.`), no ZIP content type
 *  2. Owner side: readOwnerLatestExportId() still equals ownerExportId (no job enqueued)
 *  3. UI: Settings nav visible (positive control: Account), no link named "Data export"
 *  4. UI: goto('/settings/data-export'): the view reads THIS workspace and gets 403, shows
 *     "Could not load the export status.", no lifecycle text, no request button, no download link
 */
@atc('BK-1001')
async verifySectionHiddenForNonOwner(args: NonOwnerExportCheck): Promise<void>
```

## 3. Multi-identity orchestration

```
Owner context (test fixture, .auth/user.json)          Role context (browser.newContext({ storageState: .auth/role-<role>.json }))
  createSyntheticWorkspace()                               |
  createInvite({ email: roleEmail, role })  -- token -->   acceptInvite(token)
                                                           setActiveWorkspace(syntheticId)   (page.request, sets bk_active_ws)
                                                           DataExportPage(rolePage).verifySectionHiddenForNonOwner({ workspaceId, ownerExportId, readOwnerLatestExportId })   (the @atc)
                                                             1. API refusals on rolePage.request
  getExport(id) via readOwnerLatestExportId  <---------      2. no job enqueued (Owner session)
                                                             3-4. UI nav + direct hit
                                                           leaveWorkspace(id)   (finally; 200 or 404)
  cleanupSyntheticWorkspace()   (afterEach; soft-delete)
```

- The role-side component instances are created over the role page/context (`new DataExportPage({ page: rolePage })`), the same pattern `TestFixture` uses internally; no new fixture.
- Grant step lives in `WorkspaceExportSteps.grantRoleInWorkspace({ workspaceId, email, role, memberRequest })` (object param; the Owner side is the Steps instance's own request).
- An Owner export is prepared first in the API row so a 403 on download cannot be a 404 in disguise.
- **All verifications inside the ATC (TMS sync)**: the @atc decorator writes one row per execution (PASS or FAIL) and `tests/utils/jiraSync.ts` marks BK-1001 PASSED only when every row is PASS. A check run OUTSIDE the ATC that fails writes no row for that role, so the other roles' PASS rows would sync as PASSED. The API refusals, the Owner-side re-read and the UI checks therefore all run inside the ATC; any failure writes a FAIL row. The Owner-side re-read comes in as a reader callback so the Page never depends on another component.
- **Time budget (TMS sync)**: if the test timeout fired while the ATC runs, Playwright would abandon the body: no FAIL row, and the `finally` leave would be skipped. Every wait inside the ATC therefore has an explicit timeout (worst case ~121 s: API calls 3 x 10 s, Owner re-read 30 s, navigation and visibility 15 + 5 + 5 + 15 + 5 s, absence checks 8 x 2 s) and the test sets `test.setTimeout(240_000)` (precondition ~60 s incl. the export settle up to 30 s, cleanup ~20 s), so slowness throws inside the ATC (FAIL row) first (revised 2026-10-20).
- **Membership cleanup**: a workspace soft-delete does NOT end memberships quietly; it emails every active member (Resend). The product has no Owner-side member removal route, so the role account leaves on its own session (`WorkspacesApi.leaveWorkspace`, `DELETE /workspaces/{id}/membership`, 404 tolerated) in `finally`, before the afterEach soft-delete. A leave error is logged as a short warning and never masks the test's own failure.
- **Owner-gate wording**: each 403 must carry `Only the workspace Owner can (request or )?download a data export.` (`assertExportAuthorized` for request and poll, the download route's 42501 mapping), so the cookie-only gate cannot pass for the role gate.
- Run with `bun run test:e2e:roles`: the `roles-setup` and `e2e-roles` projects exist only when that project is requested (or `RUN_ROLE_TESTS=1`), so a default run never needs role credentials.

## 4. Assertions Split

**Fixed**: as contracts.
**Test-level (precondition, outside the ATC on purpose)**: the role's `GET /api/v1/workspaces` lists the synthetic workspace with the expected role (proves the precondition really holds before asserting absence; absence on a non-member would prove nothing). A setup failure here is not a product verdict, so it writes no BK-1001 row (no false FAIL).

## 6. Technique-derivation check

| AC | Technique | ATCs |
|----|-----------|------|
| AC-02 | EP over roles: `owner` valid (BK-994) vs `admin`, `member`, `viewer` invalid. Each invalid role is its own row because the product's precedent capability (`workspace:admin`) is held by admin but not viewer: a capability-based bug would fail only some rows | 1 parameterized ATC x 3 rows |

## 7. Dependencies

- `.env` role accounts (`STAGING_ADMIN_*`, `STAGING_MEMBER_*`, `STAGING_VIEWER_*`, key names only) wired into `config.roleUsers`.
- New setup project `roles-setup` (headless sign-in per role -> `.auth/role-<role>.json`).
- `WorkspacesApi.createInvite`, `.acceptInvite`, `.setActiveWorkspace`.

## 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Role identity | Discover | `.env` role accounts | `roles-setup` | none |
| Membership with role | Generate | invite + accept | test body | role leaves on its own session (`leaveWorkspace`, finally), then the workspace soft-delete |

Invite-accept never demotes an existing member (`persona-owner` pain point), which is why a FRESH synthetic workspace per role row is required.

## 9. Checklist

- [x] naming · [x] object param · [x] void returns · [x] precondition proven before asserting absence · [x] every verification inside the ATC
