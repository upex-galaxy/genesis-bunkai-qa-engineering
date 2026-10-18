# ATC Spec: BK-1001 — verifySectionHiddenForNonOwner + rejectNonOwnerOnExportEndpoints

> Ticket: BK-1001 (TC08)
> Components: DataExportPage (tests/components/ui/DataExportPage.ts) + WorkspaceExportApi (tests/components/api/WorkspaceExportApi.ts)
> Type: UI Negative + API Negative / security
> Parent Story: BK-508 · Wave 2 · **BLOCKED until role accounts exist (Q1)**

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| Non-Owner never sees or reaches the export | Section absent from the nav AND every export route refuses the role | Synthetic workspace owned by the Owner; the role account is an active `admin` / `member` / `viewer` member of it | AC-02, BR Owner-only, ATP Risk #1 |

Two ATCs, one TMS ID: justification in `spec.md` "Multi-layer split".

## 2. ATC Contracts

```typescript
/**
 * UI ATC (DataExportPage): Settings nav has no Data export entry and a direct hit shows no export data
 * Fixed assertions:
 *  - Settings navigation visible, no link named "Data export"
 *  - after goto('/settings/data-export'): none of the lifecycle texts, no "Download archive" link,
 *    no "Request export" button (page shell only: the codebase's non-disclosure convention, ATR note)
 */
@atc('BK-1001')
async verifySectionHiddenForNonOwner(): Promise<void>

/**
 * API ATC (WorkspaceExportApi): every export route refuses a non-Owner cookie session
 * Fixed assertions: POST, GET poll and GET download each answer 403 with the error envelope
 */
@atc('BK-1001')
async rejectNonOwnerOnExportEndpoints(workspaceId: string): Promise<void>
```

## 3. Multi-identity orchestration

```
Owner context (test fixture, .auth/user.json)          Role context (browser.newContext({ storageState: .auth/role-<role>.json }))
  createSyntheticWorkspace()                               |
  createInvite({ email: roleEmail, role })  -- token -->   acceptInvite(token)
                                                           setActiveWorkspace(syntheticId)   (page.request, sets bk_active_ws)
                                                           DataExportPage(rolePage).verifySectionHiddenForNonOwner()
                                                           WorkspaceExportApi({ request: rolePage.request }).rejectNonOwnerOnExportEndpoints(id)
  cleanupSyntheticWorkspace()   (removes the membership too)
```

- The role-side component instances are created over the role page/context (`new DataExportPage({ page: rolePage })`), the same pattern `TestFixture` uses internally; no new fixture.
- Grant step lives in `WorkspaceExportSteps.grantRoleInWorkspace({ ownerRequest, roleRequest, workspaceId, role, email })` (object param, 5 inputs).
- An Owner export is prepared first in the API row so a 403 on download cannot be a 404 in disguise.

## 4. Assertions Split

**Fixed**: as contracts.
**Test-level**: the role's `GET /api/v1/workspaces` lists the synthetic workspace with the expected role (proves the precondition really holds before asserting absence; absence on a non-member would prove nothing).

## 6. Technique-derivation check

| AC | Technique | ATCs |
|----|-----------|------|
| AC-02 | EP over roles: `owner` valid (BK-994) vs `admin`, `member`, `viewer` invalid. Each invalid role is its own row because the product's precedent capability (`workspace:admin`) is held by admin but not viewer: a capability-based bug would fail only some rows | 2 parameterized ATCs x 3 rows |

## 7. Dependencies

- `.env` role accounts (`STAGING_ADMIN_*`, `STAGING_MEMBER_*`, `STAGING_VIEWER_*`, key names only) wired into `config.roleUsers`.
- New setup project `roles-setup` (headless sign-in per role -> `.auth/role-<role>.json`).
- `WorkspacesApi.createInvite`, `.acceptInvite`, `.setActiveWorkspace`.

## 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Role identity | Discover | `.env` role accounts | `roles-setup` | none |
| Membership with role | Generate | invite + accept | test body | workspace soft-delete ends it |

Invite-accept never demotes an existing member (`persona-owner` pain point), which is why a FRESH synthetic workspace per role row is required.

## 9. Checklist

- [x] naming · [x] max 1 positional param · [x] void returns · [x] precondition proven before asserting absence
