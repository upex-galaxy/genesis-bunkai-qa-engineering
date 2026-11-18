# ATC Spec: BK-946 — deleteOnlyWorkspaceLandingOnOnboarding

> Ticket: BK-946 (TC31, merges TC32, TC33)
> Component: WorkspacesSettingsPage (NEW)
> Type: UI — Positive / variant
> Parent Story: BK-512 · Wave 3 · Spec file: `tests/e2e/workspace-deletion/deleteOwnedWorkspace.test.ts`

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Only workspace deleted | Owner is sent to onboarding, stays signed in, can create or join | Account that belongs to exactly ONE workspace: the synthetic one it just created | AC-10 |

## 2. ATC Contract

```typescript
/**
 * ATC: Deleting the only workspace lands the Owner on onboarding, still signed in
 * Fixed assertions:
 *  - precondition guard: GET /me lists exactly this workspace
 *  - confirm with exact name -> URL /onboarding
 *  - create-workspace and join-workspace actions are offered (locators decided at Code time, Q9)
 *  - still signed in: GET /me 200 with workspaces [] (readMe callback), page not redirected to sign-in
 */
@atc('BK-946')
async deleteOnlyWorkspaceLandingOnOnboarding(
  args: { workspace: Workspace, readMe: () => Promise<{ status: number, workspaceIds: string[] }> },
): Promise<void>
```

## 4. Assertions Split

**Fixed**: as contract. Blocked on Q3: no available account has a single workspace (Acme QA membership everywhere; signup needs an emailed code). Dedicated account `STAGING_LONE_OWNER_*` ends every run with zero workspaces, so it is re-runnable. Needs its own storageState (setup step in `tests/setup`, project `e2e-lone`), never the shared Owner session.

## 6. Technique-derivation check

EP: workspace count {only, several} (several = BK-937). ST: `1 workspace -> 0 workspaces -> onboarding`.

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Lone account session | Discover | `config.loneOwner`, setup project | suite | none |
| Workspace | Generate | create via lone session, `makeActive` | beforeEach | deletion IS cleanup |

## 9. Checklist

- [x] naming · [x] object param · [ ] Q3 · [ ] Q9
