# Bug Report — Format Reference

> Format-reference guide only. NOT a per-ticket authoring target — per-ticket content is synced from Jira (source of truth). Jira issue type: `Error` (BK project's localized name for Bug) for post-release defects on features already live above Staging; `Defect` for pre-release issues found during in-sprint QA. Classification doctrine: `agentic-qa-core/references/defect-management-doctrine.md`.

## Summary

One-line, specific: `[Component] — [what breaks] when [condition]`.

## Environment

| Environment | Browser | OS | User Type | Date/Time |
|---|---|---|---|---|
| Staging / Production / Local | | | owner/admin/member/viewer | |

## Steps to Reproduce

1. ...
2. ...
3. ...

## Expected vs Actual

- **Expected**: ...
- **Actual**: ... (maps to `actual_result` custom field, `🐞 Actual Result (Comportamiento)`, `customfield_10094`)

## Evidence

- Screenshots (see `bug-screenshot-annotation` skill for annotated evidence)
- Console logs
- Network requests
- Video (if applicable)

## Impact

- **Severity**: Critical / High / Medium / Low (see table below)
- **Users affected**: all / role-specific / edge case
- **Workaround**: exists / none
- **Frequency**: always / intermittent / once

## Regression Flag

- [ ] Worked before (regression)
- [ ] Never worked (defect, not regression)
- [ ] Unknown

## Related Issues

- Duplicate of: `BK-NNN`
- Blocks: `BK-NNN`

---

## Severity Guide

| Severity | Criteria | Example |
|----------|----------|---------|
| Critical | System down, data loss, security breach | Cannot log in, workspace data corrupted |
| High | Major feature broken, no workaround | Cannot create a Project or author an ATC |
| Medium | Feature impaired, workaround exists | Filter broken, manual search still works |
| Low | Cosmetic, minor | Typo, alignment, spacing |

Severity → Priority auto-derives per `defect-management-doctrine.md` — never set Priority independently of Severity.

## Where the real content lives (Bunkai / BK)

- Bug (`Error`) workflow: `Open → {Cannot Reproduce | Deferred | Duplicated | Rejected | In Progress | Enhancement}`, `In Progress → In Review → Ready For QA → Closed` (retest loop `Closed ⟷ Ready For QA`). Full diagram in `.context/PBI/README.md` §Project Structure.
- QA-process parenting: every `Error`/`Defect`/`Mejora` (Improvement) parents to the QA process epic "QA Defect Management" — NEVER a product/dev epic — with the source Story carried via issue-link and product area via `components` (see the 9 components already discovered on BK: "Account & Settings", "ATC Library", "Bugs & Defect Heatmap", "Coverage & Traceability", "Manual Execution & Runs", "Project & Module Hierarchy", "Tenancy & Identity", "Tests (chains of ATCs)", "User Stories & Acceptance Criteria").
- Per-ticket synced file: `.context/PBI/bugs/BUG-BK-<slug>/bug.md` (or nested under the source Story's `defects/` folder if linked as a Defect).
