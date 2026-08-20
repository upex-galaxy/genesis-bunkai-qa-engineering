# Comments for BK-444

[View in Jira](https://jira.upexgalaxy.com/browse/BK-444)

---

### Ely - 13/8/2026, 19:16:48

## Acceptance Criteria

```gherkin
Scenario: the skip link is the first keyboard stop on a shell page
  Given a signed-in user on any page rendered inside the app shell
  When they press Tab as the first interaction after the page loads
  Then the focused element is the skip-to-content link
  And the link is visible while focused
```

```gherkin
Scenario: activating the link moves focus into the page content
  Given the skip-to-content link has keyboard focus
  When the user activates it
  Then keyboard focus moves to the start of the page content region
  And the next Tab lands on the first interactive element inside that content, not on a sidebar control
```

```gherkin
Scenario: the link stays invisible for pointer users
  Given a user who has not moved focus to the skip-to-content link
  When the page renders
  Then the link is not visible
  And the page layout is identical to the layout before this change
```

```gherkin
Scenario: coverage across every shell-rendered route
  Given any route rendered by the app shell
  When the page loads
  Then a skip-to-content link is present as the first focusable element
```

```gherkin
Scenario: routes outside the shell are untouched
  Given a route that is not rendered by the app shell
  When the page loads
  Then its behaviour is unchanged by this ticket
```

---


_Synced from Jira by sync-jira-issues_
