# Test Plan — Format Reference

> Format-reference guide only. NOT a per-ticket authoring target — per-ticket ATP/ATR content is synced from Jira/Xray (source of truth). TMS modality on this project is **A (Xray on Jira)** — canonical ATP/ATR source is a linked Xray `Test Plan` / `Test Execution` description, overriding the Story custom-field copy when present. See `.context/PBI/README.md` §Project Structure for the Xray issue types in use.

## Header

- Story key: `BK-NNN`
- Title: (from linked `Historia`)
- Sprint: `Bunkai (<N>) Sprint <n>`

## AC → TC Mapping

| AC | TC(s) | Priority |
|---|---|---|
| AC1 | TC-001, TC-002 | P0 |

Per `test-design-doctrine.md`: one AC often maps to multiple TCs (1:N default) — collapse to one only with a written "trivially atomic" justification.

## Scope

**In-scope**: ...
**Out-of-scope**: ...

## Test Types

| Type | Required | Reason |
|---|---|---|
| Functional | Yes/No | |
| UI | Yes/No | |
| API | Yes/No | |
| Performance | Yes/No | |
| Security | Yes/No | |
| Accessibility | Yes/No | |

## Test Environments

- Local / Staging / Production-smoke — see `.context/infrastructure/infrastructure.md` for the environment matrix (note: Bunkai currently shares ONE Supabase project across all three — flagged as a HIGH risk in `.context/risk-assessment.md`, plan test data accordingly to avoid cross-environment contamination).

## Test Data Requirements

Per-role test accounts needed (owner/admin/member/viewer) — see `.context/PRD/user-personas.md` §QA Relevance. **Discovery Gap carried forward**: no per-role test accounts currently provisioned in `.env`.

## Test Cases

| TC | Priority | Type | AC Ref | Automatable |
|---|---|---|---|---|
| TC-001 | P0 | Functional | AC1 | Yes |

## Edge Cases and Negative Tests

- ...

## Dependencies / Blockers / Risks

- ...

## Execution Checklist

- [ ] Environment ready
- [ ] Test data seeded
- [ ] All P0 TCs executed
- [ ] Defects filed for failures (see `bug-report.md` format reference)

## Sign-off

- [ ] QA sign-off — transitions `Historia` `In Test → QA Approved`

---

## Where the real content lives (Bunkai / BK)

- Custom field slugs: `acceptance_test_plan` (`🧪 Acceptance Test Plan (ATP)`, `customfield_10067`), `acceptance_test_results` (`🧪 Acceptance Test Results (ATR)`, `customfield_10124`) — fallback only; Xray Test Plan/Execution description wins when linked.
- Per-ticket synced files: `.context/PBI/epics/EPIC-BK-<slug>/stories/STORY-BK-<slug>/acceptance-test-plan.md` + `acceptance-test-results.md`, or `.context/PBI/test-plans/` / `test-executions/` for standalone Xray container issues.
