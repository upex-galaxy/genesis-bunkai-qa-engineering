# Comments for BK-188

[View in Jira](https://jira.upexgalaxy.com/browse/BK-188)

---

### Nahuel Gomez - 30/6/2026, 22:13:53

****Updated****: [https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166](https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166) automated (8 tests). Key discovery: /api/v1/auth/signin works on staging. This supersedes the old /auth/login endpoint ([https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177](https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177)). Full details in [https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166](https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166) comments.

---

### Nahuel Gomez - 30/6/2026, 22:27:49

## Automation Complete — Combined Summary

All tests pass in CI. Framework: Playwright + TypeScript + KATA, sandbox project (no auth dependency).

### Reports

| ***Report**** | ****URL*** |
| --- | --- |
| Allure (latest) | [https://nelgoez.github.io/bunkai-qa-engineering/staging/sanity/](https://nelgoez.github.io/bunkai-qa-engineering/staging/sanity/) |

### [https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166](https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166) — Auth email+password sign-in API (8 tests)

CI run: [https://github.com/nelgoez/bunkai-qa-engineering/actions/runs/28486452620](https://github.com/nelgoez/bunkai-qa-engineering/actions/runs/28486452620)

| ***Scenario**** | ****Status*** |
| --- | --- |
| Sign in with valid credentials → 200 (user+session+PAT) | ✅ |
| Sign in with wrong password → 401 | ✅ |
| Sign in with non-existent email → 401 | ✅ |
| Check email (existing) → {exists:true, confirmed:true} | ✅ |
| Check email (unknown) → {exists:false} | ✅ |
| GET /me with valid PAT → 200 | ✅ |
| GET /me without auth → 401 | ✅ |
| Sign-in PAT authenticates subsequent calls | ✅ |

### [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4) — Workspace CRUD (4 tests)

CI run: [https://github.com/nelgoez/bunkai-qa-engineering/actions/runs/28487034357](https://github.com/nelgoez/bunkai-qa-engineering/actions/runs/28487034357)

| ***Scenario**** | ****Status*** |
| --- | --- |
| Create workspace with name+slug → 201 | ✅ |
| Name < 3 chars → 422 | ✅ |
| Reserved slug → 422 | ✅ |
| Duplicate slug → 409 | ✅ |

### [https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8](https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8) — Project CRUD (4 tests)

| ***Scenario**** | ****Status*** |
| --- | --- |
| Create project in workspace → 201 | ✅ |
| Name < 3 chars → 422 | ✅ |
| Duplicate slug → 409 | ✅ |
| Non-member → 403 | ✅ |

### [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18) — ATC API (17 tests + 1 fixme)

Verified locally and in CI (sandbox project).

| ***Coverage**** | ****Status*** |
| --- | --- |
| 12/12 TC outlines automated | ✅ |
| 17 tests pass, 1 fixme (403 scope) | ✅ |

### Known gaps

- [https://jira.upexgalaxy.com/browse/BK-150#icft=BK-150](https://jira.upexgalaxy.com/browse/BK-150#icft=BK-150) 403 scope test blocked on STAGING*USER*READONLY_PAT
- Sandbox tests not promoted to integration project (blocked on [https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177](https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177): old /auth/login 404s)
- Key discovery: /api/v1/auth/signin works — loginEndpoint config can be updated to fix this

---

### Nahuel Gomez - 30/6/2026, 23:14:29

## QA Automation Session — Complete Report (2026-06-30)

### Tally

| ***Ticket**** | ****Tests**** | ****Status*** |
| --- | --- | --- |
| [https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166](https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166) | 8 | ✅ PASS |
| [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4) | 4 | ✅ PASS |
| [https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8](https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8) | 4 | ✅ PASS |
| [https://jira.upexgalaxy.com/browse/BK-17#icft=BK-17](https://jira.upexgalaxy.com/browse/BK-17#icft=BK-17) | 6 | ✅ PASS |
| [https://jira.upexgalaxy.com/browse/BK-14#icft=BK-14](https://jira.upexgalaxy.com/browse/BK-14#icft=BK-14) | 5 | ✅ PASS |
| [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18) (prev) | 17 | ✅ PASS |
| ***Total**** | ****44 + 1 fixme*** |  |

### Infrastructure changes

- ***loginEndpoint**** fixed: `/auth/login` → `/api/v1/auth/signin`. The old endpoint 404s ([https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177](https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177)). The [https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166](https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166) endpoint works. ****Integration project is now unblocked.***
- ***AuthApi*** updated to use sign-in PAT (not session token) for API auth — matches [https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166](https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166) coexistence pattern.
- ***meEndpoint*** fixed to `/api/v1/me` (actual path).
- ***auth.types.ts*** updated to match real API response shapes.
- ***jira-attach-evidence.ts*** script created for attaching screenshots to Jira tickets via REST API.

### CI/CD

- All tests pass in sandbox project. Allure reports at:

[https://nelgoez.github.io/bunkai-qa-engineering/staging/sanity/](https://nelgoez.github.io/bunkai-qa-engineering/staging/sanity/)

### Known gaps (unchanged)

- [https://jira.upexgalaxy.com/browse/BK-150#icft=BK-150](https://jira.upexgalaxy.com/browse/BK-150#icft=BK-150) 403 scope test — blocked on restricted-scope PAT
- Sandbox → `.test.ts` promotion — now feasible since api-setup works
- Nightly regression doesn't include sandbox tests yet (PR gate + manual only)

### Next-step candidates

| ***Priority**** | ****Ticket**** | ****Summary**** | ****Est. time*** |
| --- | --- | --- | --- |
| 1 | [https://jira.upexgalaxy.com/browse/BK-182#icft=BK-182](https://jira.upexgalaxy.com/browse/BK-182#icft=BK-182) | Bearer run can't resolve active workspace | ~15 min |
| 2 | [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) | ATC "Used in N tests" report | ~15 min |
| 3 | [https://jira.upexgalaxy.com/browse/BK-57#icft=BK-57](https://jira.upexgalaxy.com/browse/BK-57#icft=BK-57) | PATCH /modules/{id} atomicity | ~20 min |
| 4 | [https://jira.upexgalaxy.com/browse/BK-36#icft=BK-36](https://jira.upexgalaxy.com/browse/BK-36#icft=BK-36) | Abort a run in progress | ~20 min |

---

### Nahuel Gomez - 3/7/2026, 17:30:10

## Phase 1 Complete — Moved to Shift-Left QA

QA Engineering Support summary populated with all 18 tickets, 44 automated tests, CI/CD status, known gaps, and next-step recommendations. Ready for PO review.

---

### Nahuel Gomez - 10/7/2026, 20:26:38

1. 

****Reviewer:**** Nahuel Gomez
****Verdict:**** Complete and accurate as of Jul 10, 2026

1. 

- ****BK-3**** (OAuth GitHub/Google): QA completed, QA Approved
- ****BK-43**** (Defect Sync): Estimated 1 SP, moved to Ready For Dev
- ****BK-182**** (Bearer workspace bug): Still Open, Ely assigned

1. 

---

### Nahuel Gomez - 10/7/2026, 20:57:56

## Shift-Left QA Review — 2026-07-10

***Reviewer:*** Nahuel Gomez
***Verdict:*** Complete and accurate as of Jul 10

***Updates since June summary:***

- ***BK-3*** (OAuth): QA completed, QA Approved
- ***BK-43*** (Defect Sync): Estimated 1 SP, Ready For Dev
- ***BK-182*** (Bearer bug): Still Open, Ely assigned

***Ready for estimation and pipeline progression.***

---


_Synced from Jira by sync-jira-issues_
