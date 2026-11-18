# ATC Spec: BK-941 — verifyDeletedWorkspaceScreensBlocked

> Ticket: BK-941 (TC26, prior bug BK-988)
> Component: WorkspacesSettingsPage (NEW)
> Type: UI + API read — Negative / security
> Parent Story: BK-512 · Wave 3 · Spec file: `tests/e2e/workspace-deletion/blockTeammateAfterDeletion.test.ts` (role-session project)

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Teammate blocked from deleted-workspace screens | Direct links to a deleted workspace render nothing for a former member | Teammate (`roleUsers.member`) is an active member and can open a workspace screen before deletion | AC-08 |

## 2. ATC Contract

```typescript
/**
 * ATC: A former member cannot reach any screen of the deleted workspace
 * Fixed assertions (on the teammate's page):
 *  - each screen in `screens` is opened by direct link and sends the teammate to the product's blocked destination (`blockedUrl`, `blockedMarker`)
 *  - the screen's `liveMarker` and every text in `hiddenTexts` are absent
 *  - the deleted URL is opened a second time with a fresh goto (not a reload, which would re-ask the redirect destination): same result, nothing served from cache
 *  - the restore page refuses the teammate and nothing is restored
 *  - callback: teammate API GET /workspaces/{id} -> 404
 */
@atc('BK-941')
async verifyDeletedWorkspaceScreensBlocked(
  args: { screens: WorkspaceScreen[], restoreUrl: string, hiddenTexts: string[], readDeletedWorkspaceStatus: () => Promise<number> },
): Promise<void>
```

## 4. Assertions Split

**Fixed**: as contract. **Test-level** (precondition): before deletion the teammate opens the same URLs and sees `hiddenTexts` (otherwise a blocked page proves nothing). `screens` and their live markers (read from the workspace's own content, scoped to a region so the app shell cannot satisfy them): project page (the seeded test title, in `explorer-panel`), bugs (the bug title, in `main`), milestones (the milestone name, in `main`), members (the workspace slug on the page header). `restoreUrl`: `/workspaces/<id>/restore` (Owner-only page; must not offer restore to a member). The test runs a positive control (`verifyWorkspaceScreensLive`) before the deletion.
Ex-bug BK-988 shape: UI-only masking of an API leak, hence the API callback.

## 6. Technique-derivation check

EP: screen kinds {project, runs, settings, restore page}. ST: `member -> evicted`.

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Workspace with a project | Generate | Steps | beforeEach | deleted by the test |
| Teammate | Discover | `grantTeammate({ role: 'member' })`, second browser context from `.auth/role-member.json` | test body | none possible after deletion: membership lingers until purge (R2). Context closed in `finally` |

## 9. Checklist

- [x] naming · [x] object param · [x] callback · [ ] file joins `roleSessionTests` regex
