# Comments for BK-265

[View in Jira](https://jira.upexgalaxy.com/browse/BK-265)

---

### Ely - 4/8/2026, 01:08:35

## Scope

A sub-nav rendered inside the persistent Project shell, exposing the surfaces that belong to the currently open Project.

***Entries are derived from the routes that actually exist today*** — one entry per built surface, nothing invented:

| Entry | Destination | What it opens |
| --- | --- | --- |
| All ATCs | `/projects/{projectSlug}` | The Project workbench — the ATC and Test browser already reached on Project open. Matches the breadcrumb label the shell renders today. |
| Test Runs | `/projects/{projectSlug}/runs` | The Project's run report: run list with filters and pass/fail totals (BK-38). |
| Bug Reports | `/projects/{projectSlug}/bugs` | The Project's defect list with the per-Module defect heatmap (BK-41, BK-42). |
| Metrics | `/projects/{projectSlug}/metrics` | The Project's coverage view: untested Acceptance Criteria and Modules, not-run filter (BK-46). |

Also in scope:

- The sub-nav lives in the persistent Project shell, so it is present on every page inside a Project — the workbench, an open ATC, an open Test, and each of the three surfaces above.
- Active-entry indication: the entry matching the current location is marked as current, both visually and for assistive technology.
- Keyboard operation: every entry is reachable by Tab in reading order and shows a visible focus ring per the frozen design contract.
- Reuse of the existing shell chrome and frozen design tokens — no new colours, radii, fonts or spacing values.

---

### Ely - 4/8/2026, 01:08:36

## Out Of Scope

- ***Enabling the four global sidebar items.*** Home, ATC Library, Test Runs, Bug Reports and Metrics in the global sidebar stay marked `soon` and stay non-clickable. They point at workspace-wide aggregates, not at a single Project.
- ***Any workspace-level aggregate screen.*** A Workspace-wide ATC library, run list, defect list or metrics view is deferred to a future tech story. This item adds no such screen and no route for one.
- ***Any new API endpoint, data model change, or query.*** The three surfaces already load their own data; this item only adds the way to reach them.
- ***Any change to the Test Runs, Bug Reports or Metrics surfaces themselves.*** Their layout, filters, empty states and behaviour are untouched — they are the destinations, not the work.
- ***Entries for surfaces that do not exist.*** ATCs and Tests have no list route of their own (they are browsed from the workbench), so the sub-nav gets no entry for them. No entry is created for a route that is not built.
- ***Command palette entries*** for the three routes. Worth doing, but a separate concern from the sub-nav and not required to close this gap.
- ***Changing where a signed-in user lands.*** The post-sign-in destination stays as it is today.

---

### Ely - 4/8/2026, 01:08:37

## Acceptance Criteria

```gherkin
Feature: Reach a Project's own surfaces from a sub-nav in the Project shell

  Background:
    Given Elena is a QA Engineer signed in to a Workspace
    And the Workspace contains a Project named "Checkout" with slug "checkout"
    And Elena has opened the Project "Checkout"

  Scenario: Every built Project surface is one click away from the workbench
    Given Elena is on the Project workbench for "Checkout"
    When she looks at the Project shell
    Then she sees a sub-nav with the entries "All ATCs", "Test Runs", "Bug Reports" and "Metrics"
    And clicking "Test Runs" opens the Project's run report without any intermediate page
    And clicking "Bug Reports" opens the Project's defect list without any intermediate page
    And clicking "Metrics" opens the Project's coverage view without any intermediate page
    And clicking "All ATCs" returns her to the Project workbench

  Scenario: The sub-nav is reachable from a detail route, not only from the workbench
    Given Elena has an ATC open inside the Project "Checkout"
    When she looks at the Project shell
    Then the same four sub-nav entries are visible
    And clicking "Bug Reports" opens the Project's defect list in one click
    And she never has to return to the workbench first

  Scenario Outline: The sub-nav persists across every page inside the Project
    Given Elena is on the "<page>" page inside the Project "Checkout"
    When the page finishes loading
    Then the sub-nav is present with all four entries
    And the Project explorer is still visible alongside it

    Examples:
      | page        |
      | workbench   |
      | open ATC    |
      | open Test   |
      | Test Runs   |
      | Bug Reports |
      | Metrics     |

  Scenario Outline: The current surface is indicated visually and programmatically
    Given Elena has navigated to the "<entry>" surface of the Project "Checkout"
    When she looks at the sub-nav
    Then the "<entry>" entry is styled as the active entry
    And the "<entry>" entry exposes aria-current="page" to assistive technology
    And no other sub-nav entry exposes aria-current

    Examples:
      | entry       |
      | All ATCs    |
      | Test Runs   |
      | Bug Reports |
      | Metrics     |

  Scenario: The sub-nav is fully operable from the keyboard
    Given Elena is on the Project workbench for "Checkout"
    And she is navigating with the keyboard only
    When she moves focus forward with Tab
    Then each of the four sub-nav entries receives focus in reading order
    And the focused entry shows a visible 1px accent focus ring per the frozen design contract
    And pressing Enter on the focused entry opens that surface

  Scenario: Assistive technology announces the sub-nav as Project navigation
    Given Elena uses a screen reader inside the Project "Checkout"
    When she lists the navigation landmarks on the page
    Then the Project sub-nav is announced as a navigation region with an accessible name
    And that name distinguishes it from the global Workspace navigation

  Scenario: The global sidebar items remain unavailable and non-focusable
    Given Elena is anywhere inside the Project "Checkout"
    When she looks at the global sidebar
    Then the "Home", "ATC Library", "Test Runs", "Bug Reports" and "Metrics" items still show the "soon" tag
    And none of them is clickable
    And none of them receives focus when she tabs through the sidebar

  Scenario: A Project surface reached from the sub-nav is deep-linkable
    Given Elena has opened the Project's coverage view from the sub-nav
    When she copies the address and opens it in a new tab
    Then the same coverage view for the Project "Checkout" loads
    And the "Metrics" sub-nav entry is marked as the current entry

  Scenario: The sub-nav follows a Project switch
    Given Elena is on the Bug Reports surface of the Project "Checkout"
    When she switches to a different Project named "Billing"
    Then the sub-nav entries point at the "Billing" Project
    And no entry still points at "Checkout"
```

---

### Automation for Jira - 4/8/2026, 01:31:30

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 4/8/2026, 01:53:31

✅ Pull Request is successfully MERGED and DEPLOYED on QA. 
It's Ready for Testing Phase! 
Dev Task is Done.

---


_Synced from Jira by sync-jira-issues_
