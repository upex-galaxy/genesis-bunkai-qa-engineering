# User Story — Format Reference

> Format-reference guide only. NOT a per-ticket authoring target — per-ticket content is synced from Jira (source of truth) by `/sprint-testing` via `bun run jira:sync-issues`. Jira issue type: `Historia` (BK project's localized name for Story).

## Canonical Shape

**Title**: `[persona] can [action]`

**Narrative**:
```
As a [persona]
I want to [action]
So that [benefit]
```

## Acceptance Criteria

One per AC, numbered, Given/When/Then:

```
### AC1: [short title]
Given [precondition]
When [action]
Then [expected outcome]
```

**AC checklist to enforce** (per `agentic-qa-core/references/test-design-doctrine.md` — AC-verify is the floor, not the ceiling):

- [ ] Specific and measurable
- [ ] Testable (can be automated)
- [ ] Independent (doesn't assume other ACs)
- [ ] Business-focused (not implementation detail)

## Technical Notes

- [ ] API changes required
- [ ] DB / schema changes required
- [ ] UI changes required
- [ ] Dependencies on other stories/epics

## Out of Scope

Explicit list of what this story does NOT cover — prevents scope creep during test design.

## Design / Mockups

Link to Figma / design doc, if any.

## Related Stories

- Blocked by: `BK-NNN`
- Related to: `BK-NNN`

---

## Where the real content lives (Bunkai / BK)

- Custom field slugs: `acceptance_criteria` (`✅ Acceptance Criteria (Gherkin)`, `customfield_10097`) — see `.agents/jira-fields.json` for the full catalog, never hardcode the numeric ID.
- Per-ticket synced file: `.context/PBI/epics/EPIC-BK-<slug>/stories/STORY-BK-<slug>/story.md` + `acceptance-criteria.md` (materialized by `bun run jira:sync-issues get <KEY> --include-comments`, read-only cache).
- Workflow: `Backlog → Shift-Left QA → Estimation → Ready For Dev → In Progress → In Review → Ready For QA → In Test → QA Approved → Ready For Release → Deployed to Production` (full transition graph in `.context/PBI/README.md` §Project Structure).
