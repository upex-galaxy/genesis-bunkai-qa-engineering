# Tech Story: Accessibility | Add a skip-to-content link to the app shell

**Jira Key:** [BK-444](https://jira.upexgalaxy.com/browse/BK-444)
**Status:** Tareas por hacer
**Type:** Tech Story

---

## Description

***Source spec******:*** `.context/SRS/non-functional-specs.md` §4 Accessibility, line 64.

## Context

The accessibility section of the SRS specifies, verbatim:

> ***Skip-to-content*** link on every shell-rendered page.

Nothing implements it. Verified absent at `origin/staging` on 2026-08-13: a case-insensitive search for `skip to content`, `skip-to-content`, `skipToContent`, `skip to main`, `skip-link` and `skipLink` across `app/`, `components/` and `lib/` returns zero hits.

The app shell (`app/(app)/layout.tsx`) renders a two-column grid with `AppSidebar` first and the page content column second. A keyboard or screen-reader user therefore tabs through the entire sidebar — workspace switcher, project tree, notification bell, account menu — on every navigation before reaching the content they came for.

## Already shipped, do not re-propose

`prefers-reduced-motion: reduce` is implemented and correct at `app/globals.css:119` (with a second supporting rule at line 242). It was flagged together with the skip link as a pair of accessibility gaps; the reduced-motion half is closed. This ticket is the last remaining gap of that pair.

## Landmark note for whoever picks this up

The global shell has no `<main>` element and no `id="main"` or `role="main"` anchor today. Two nested surfaces do render their own `<main>` — `app/(app)/projects/[projectSlug]/project-shell.tsx:152` and `app/(app)/projects/[projectSlug]/mind-map-view.tsx:139` — but neither covers every shell-rendered route, so the skip target needs one stable anchor owned by the shell itself.

---

## Fields

### customfield_10000

{}

### Fix

Bugfix

### Out Of Scope 🏴

- Routes rendered outside the app shell (`/about`, `/design-tokens`, `/qa`) — they have their own layouts and are not covered by the SRS line this ticket implements.
- Reduced motion — already shipped at `app/globals.css:119`. No work.
- A general accessibility audit. Contrast ratios, ARIA labelling of icon-only buttons, tree and table semantics, and command-palette roles are separate concerns; this ticket touches none of them.
- Any change to the sidebar's tab order or its internal focus management.
- Adding `<main>` landmarks to the nested project surfaces that already have one.

### Rank

0|i0md47:

### Scope ⛳

- A skip-to-content control rendered as the first focusable element of the app shell, on every route the shell renders.
- Visually hidden until it receives keyboard focus; visible and legible while focused.
- A single stable target region in the shell that the link moves keyboard focus to (moving focus, not only scroll position).
- Focus styling reuses the frozen focus-indicator treatment already specified for the product (accent outline on `:focus-visible`); no new visual tokens are introduced.
- Keyboard verification that the link is reachable, activatable, and lands focus inside the content region.

### Workflow 🧬

A signed-in user lands on any page inside the app shell and presses Tab as their first interaction. Instead of stepping into the sidebar, the first stop is a skip-to-content control that becomes visible on focus. Activating it drops keyboard focus straight into the page content, so the next Tab continues inside the content rather than restarting from the top of the sidebar. A user who never touches the keyboard never sees the control, and the layout is unchanged for them.

---

## Metadata

- **Created:** 13/8/2026
- **Updated:** 13/8/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** accessibility

---

_Synced from Jira by sync-jira-issues_
