# Tech Story: Add data-testid attributes to WorkspaceSwitcher component (unblocks BK-253 automation)

**Jira Key:** [BK-328](https://jira.upexgalaxy.com/browse/BK-328)
**Status:** Tareas por hacer
**Type:** Tech Story

---

## Description

## Goal

Add `data-testid` attributes to the workspace switcher component so QA can automate BK-253 (header switcher e2e coverage) reliably.

## Why

`components/layout/WorkspaceSwitcher.tsx` currently has zero `data-testid` attributes. QA is blocked on automating ***BK-253*** (TC4: "header switcher reflects newly active workspace after reload") — the component only exposes text-based selectors, which are fragile against copy changes and don't reliably disambiguate list items.

## Where

File: `components/layout/WorkspaceSwitcher.tsx`

## Requested attributes

| Element | Line (approx) | Suggested `data-testid` |
| --- | --- | --- |
| Trigger button (workspace/project chip) | 81 | `workspace-switcher-trigger` |
| Dropdown container | 94 | `workspace-switcher-dropdown` |
| Each workspace item `<li><button>` | 101 | `workspace-switcher-item` (with `data-workspace-id={w.id}` alongside, so tests can target a specific workspace without relying on name text) |
| Active-workspace check icon | 107 | `workspace-switcher-item-active` (or a `data-active="true"` attribute on the item button itself) |

## Acceptance Criteria

- [ ] Trigger button carries `data-testid="workspace-switcher-trigger"`
- [ ] Dropdown container carries `data-testid="workspace-switcher-dropdown"`
- [ ] Each workspace list item carries `data-testid="workspace-switcher-item"` and `data-workspace-id={workspace.id}`
- [ ] The active workspace's item is identifiable programmatically (e.g. `data-active="true"` or a distinct testid on the check icon) without depending on visual-only cues
- [ ] No visual or behavioral change — attributes only

## References

- Blocked test case: BK-253 (`.context/PBI/epics/EPIC-BK-1-tenancy-identity/stories/STORY-BK-6-tms-workspace-switch-between-workspaces/test-cases/BK-253-tc4-ui-switcher-reload.md`)
- Source story: BK-6 (TMS-Workspace | Switch between workspaces)

---

## Fields

### customfield_10000

{repository={count=1, dataType=repository}, json={"cachedValue":{"errors":[],"summary":{"repository":{"overall":{"count":1,"lastUpdated":"2026-08-17T12:34:05.000-0300","dataType":"repository"},"byInstanceType":{"oAuth-com.github.integration.production":{"count":1,"name":"GitHub"},"GitHub":{"count":1,"name":"GitHub"}}}}},"isStale":true}}

### Epic Link

BK-1

### Fix

Bugfix

### QA Assignee

Luis Eduardo Flores Villarroel

### Rank

0|i0mccv:

---

## Metadata

- **Created:** 8/8/2026
- **Updated:** 8/8/2026
- **Reporter:** Luis Eduardo Flores Villarroel
- **Assignee:** Ely

---

_Synced from Jira by sync-jira-issues_
