# Tech Story: QA Engineering Support — Complete Summary (Jun 2026)

**Jira Key:** [BK-188](https://jira.upexgalaxy.com/browse/BK-188)
**Status:** Completado
**Type:** Tech Story

---

## Description

## QA Engineering Support — Complete Summary

### Coverage by ticket

| ***Ticket**** | ****Type**** | ****Status**** | ****QA Work*** |
| --- | --- | --- | --- |
| [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4) | Story | Ready For Release | Sprint-testing: full ATP/ATR, QA Approved |
| [https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5](https://jira.upexgalaxy.com/browse/BK-5#icft=BK-5) | Story | QA Approved | Sprint-testing: 3 critical bugs found |
| [https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8](https://jira.upexgalaxy.com/browse/BK-8#icft=BK-8) | Story | Ready For Release | Sprint-testing: full ATP/ATR |
| [https://jira.upexgalaxy.com/browse/BK-11#icft=BK-11](https://jira.upexgalaxy.com/browse/BK-11#icft=BK-11) | Story | Ready For Release | Sprint-testing: full ATP/ATR |
| [https://jira.upexgalaxy.com/browse/BK-13#icft=BK-13](https://jira.upexgalaxy.com/browse/BK-13#icft=BK-13) | Epic | Planning | ATC Library — epic context; automation scaffolding for all 12 TCs |
| [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18) | Story | QA Approved | Full API automation: 12 TC outlines covered, 18 Playwright tests |
| [https://jira.upexgalaxy.com/browse/BK-43#icft=BK-43](https://jira.upexgalaxy.com/browse/BK-43#icft=BK-43) | Story | Backlog | Shift-left refinement: defect sync requirements analysis |
| [https://jira.upexgalaxy.com/browse/BK-47#icft=BK-47](https://jira.upexgalaxy.com/browse/BK-47#icft=BK-47) | Story | Shift-Left QA | Shift-left refinement: time-to-green metric analysis |
| [https://jira.upexgalaxy.com/browse/BK-147#icft=BK-147](https://jira.upexgalaxy.com/browse/BK-147#icft=BK-147) | Story | Ready For Release | Sprint-testing: app-shell tab workbench, 10/11 PASS |
| [https://jira.upexgalaxy.com/browse/BK-149#icft=BK-149](https://jira.upexgalaxy.com/browse/BK-149#icft=BK-149) | Test | Candidate | POST /atcs create ATC 201 — automated |
| [https://jira.upexgalaxy.com/browse/BK-150#icft=BK-150](https://jira.upexgalaxy.com/browse/BK-150#icft=BK-150) | Test | Candidate | POST /atcs auth rejection 401/403 — automated (403 blocked) |
| [https://jira.upexgalaxy.com/browse/BK-151#icft=BK-151](https://jira.upexgalaxy.com/browse/BK-151#icft=BK-151) | Test | Candidate | POST /atcs AC outside user_story → 422 — automated |
| [https://jira.upexgalaxy.com/browse/BK-152#icft=BK-152](https://jira.upexgalaxy.com/browse/BK-152#icft=BK-152) | Test | Candidate | POST /atcs module outside subtree → 404 — automated |
| [https://jira.upexgalaxy.com/browse/BK-153#icft=BK-153](https://jira.upexgalaxy.com/browse/BK-153#icft=BK-153) | Test | Candidate | POST /atcs step position validation → 422 — automated |
| [https://jira.upexgalaxy.com/browse/BK-154#icft=BK-154](https://jira.upexgalaxy.com/browse/BK-154#icft=BK-154) | Test | Candidate | POST /atcs body boundaries → 422 — automated |
| [https://jira.upexgalaxy.com/browse/BK-155#icft=BK-155](https://jira.upexgalaxy.com/browse/BK-155#icft=BK-155) | Test | Candidate | POST /atcs non-existent user_story → 404 — automated |
| [https://jira.upexgalaxy.com/browse/BK-156#icft=BK-156](https://jira.upexgalaxy.com/browse/BK-156#icft=BK-156) | Test | Candidate | PATCH /atcs version bump + cascade — automated |
| [https://jira.upexgalaxy.com/browse/BK-157#icft=BK-157](https://jira.upexgalaxy.com/browse/BK-157#icft=BK-157) | Test | Candidate | PATCH /atcs optimistic locking — automated |
| [https://jira.upexgalaxy.com/browse/BK-158#icft=BK-158](https://jira.upexgalaxy.com/browse/BK-158#icft=BK-158) | Test | Candidate | PATCH /atcs non-existent id → 404 — automated |
| [https://jira.upexgalaxy.com/browse/BK-159#icft=BK-159](https://jira.upexgalaxy.com/browse/BK-159#icft=BK-159) | Test | Candidate | PATCH /atcs identical payload → 200 — automated |
| [https://jira.upexgalaxy.com/browse/BK-160#icft=BK-160](https://jira.upexgalaxy.com/browse/BK-160#icft=BK-160) | Test | Candidate | PATCH /atcs immutable fields — automated |

### Automated tests (12/12 TC outlines covered)

> ***SUCCESS:**** ****Framework:*** Playwright + TypeScript + KATA architecture
***Project:*** bunkai-qa-engineering (separate QA repo)
***CI/CD:*** GitHub Actions — build.yml (PR gate), regression.yml (nightly), sanity.yml (manual), smoke.yml (daily)
***Reporting:*** Allure reports deployed to GitHub Pages
***Reports URL:*** [https://nelgoez.github.io/bunkai-qa-engineering/staging/sanity/](https://nelgoez.github.io/bunkai-qa-engineering/staging/sanity/)

All 18 tests pass in CI. They use a Personal Access Token (PAT) for API auth, bypassing the broken /auth/login endpoint ([https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177](https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177) REJECTED).

### Known blocks / gaps

| ***Issue**** | ****Blocked on**** | ****Severity*** |
| --- | --- | --- |
| [https://jira.upexgalaxy.com/browse/BK-150#icft=BK-150](https://jira.upexgalaxy.com/browse/BK-150#icft=BK-150): 403 scope test | STAGING*USER*READONLY_PAT — need a token without atc:write scope | Medium |
| Tests not in `integration` project | [https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177](https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177) — /auth/login REJECTED, can't use api-setup dependency | Low |
| Sandbox tests not in nightly regression yet | Currently only in build.yml (PR) and sanity.yml (manual) | Low |
| Allure gh-pages first-deploy git error | No history branch; self-heals after first successful deploy | Cosmetic |

### CI/CD pipeline status

| ***Workflow**** | ****Trigger**** | ****Status*** |
| --- | --- | --- |
| build.yml | PR to main | Compile + lint + sandbox tests |
| regression.yml | Daily midnight + manual | Integration (broken — [https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177](https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177)) → E2E → Allure |
| smoke.yml | Daily 2AM + manual | @critical tests → Allure |
| sanity.yml | Manual dispatch | Targeted execution, supports sandbox project |

### Recommendations

1. Fix [https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177](https://jira.upexgalaxy.com/browse/BK-177#icft=BK-177) (/auth/login) to unblock `integration` project and enable full regression suite
2. Create a restricted-scope PAT to test [https://jira.upexgalaxy.com/browse/BK-150#icft=BK-150](https://jira.upexgalaxy.com/browse/BK-150#icft=BK-150) 403 scenario
3. Add sandbox tests to nightly regression.yml once CI credentials are stable
4. Set up cross-repo CI trigger: app repo deploy → QA repo test run

---

## Fields

### customfield_10000

{pullrequest={dataType=pullrequest, state=MERGED, stateCount=6}, json={"cachedValue":{"errors":[],"summary":{"pullrequest":{"overall":{"count":6,"lastUpdated":"2026-08-06T19:26:04.000-0300","stateCount":6,"state":"MERGED","dataType":"pullrequest","open":false},"byInstanceType":{"GitHub":{"count":3,"name":"GitHub"},"oAuth-com.github.integration.production":{"count":3,"name":"GitHub"}}}}},"isStale":true}}

### Fix

Bugfix

### QA Assignee

Nahuel Gomez

### Rank

0|i0mad3:

---

## Metadata

- **Created:** 30/6/2026
- **Updated:** 5/8/2026
- **Reporter:** Nahuel Gomez
- **Assignee:** Ely

---

_Synced from Jira by sync-jira-issues_
