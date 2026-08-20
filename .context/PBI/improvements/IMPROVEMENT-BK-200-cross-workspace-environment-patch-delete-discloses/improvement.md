# IMPROVEMENT: Cross-workspace environment PATCH/DELETE discloses existence via 403 instead of non-disclosing 404

**Jira Key:** [BK-200](https://jira.upexgalaxy.com/browse/BK-200)
**Priority:** Medium
**Status:** Ready For QA
**Components:** None

---

## Description

## Summary

Cross-workspace `PATCH`/`DELETE` on an existing project environment returns ***403 forbidden****, disclosing that the environment exists in another workspace, where a non-disclosing ****404 not_found*** is the intended contract.

## Context

Found during [https://jira.upexgalaxy.com/browse/BK-148#icft=BK-148](https://jira.upexgalaxy.com/browse/BK-148#icft=BK-148) test-documentation (Stage 4), while source-validating the ATP against deployed staging code (`origin/staging` @ `c79c564`).

## Expected (the code's own stated contract)

The RPC comments explicitly document non-disclosure:

> "A missing / cross-workspace env id resolves to no project -> P0002 (not*found, ***non-disclosing***)." — `supabase/migrations/0032*project*environments*crud.sql:145-146,163`

A member of workspace B targeting an environment id that lives in workspace A should be unable to distinguish "exists but forbidden" from "does not exist". Both should return ***404 not_found***.

## Actual

The request returns ***403 forbidden*** / `not*a*member`, revealing the environment exists.

## Root cause

The environment-mutating RPCs (`bunkai*rename*environment`, `bunkai*delete*environment`) are `SECURITY DEFINER` and run as the function owner. `project_environments` has ***no**** `FORCE ROW LEVEL SECURITY`, so the owner ****bypasses RLS***. The resolution query

```sql
select project*id into v*project_id
  from public.project_environments
  where id = p*environment*id;   -- sees the cross-workspace row (RLS bypassed)
```

finds the foreign row, so `v*project*id` is non-null and the `P0002` (404) branch is skipped. Control reaches `bunkai*assert*actor*can*write_project`, which raises `42501` for the non-member → mapped to ***403*** (`lib/environments/errors.ts:39-44`). The intended 404 path fires only when the id genuinely does not exist.

## Impact

- ***Severity:**** ****low.**** The mutation itself IS blocked — no cross-tenant write occurs (AC #2 holds). The leak is limited to ****existence disclosure*** (403 vs 404) of an environment id in another workspace.
- Not a violation of any written acceptance criterion (no AC mandated non-disclosure), hence filed as an ***Improvement***, not a Bug — but it violates the contract the code's own comments state.

## Suggested fix (for PO/Dev to weigh)

Make the non-member path indistinguishable from not-found: either (a) enable `FORCE ROW LEVEL SECURITY` on `project*environments` so the DEFINER resolution query is RLS-filtered and a foreign row yields NULL → P0002, or (b) have `bunkai*assert*actor*can*write*project` raise `P0002` (404) instead of `42501` (403) when the actor is not a member of the resolved workspace.

## Traceability

- Story: [https://jira.upexgalaxy.com/browse/BK-148#icft=BK-148](https://jira.upexgalaxy.com/browse/BK-148#icft=BK-148)
- Regression test asserting the ACTUAL 403 behavior: [https://jira.upexgalaxy.com/browse/BK-191#icft=BK-191](https://jira.upexgalaxy.com/browse/BK-191#icft=BK-191) (`BK-148: TC#2`)
- Evidence: deployed code `origin/staging` @ `c79c564`, files `0032*project*environments_crud.sql`, `lib/environments/errors.ts`.

---

## Related Issues

- relates to: [BK-148](https://jira.upexgalaxy.com/browse/BK-148) - TMS-Project Environments | List, add, rename and remove environments
- relates to: [BK-191](https://jira.upexgalaxy.com/browse/BK-191) - BK-148: TC#2: should reject environment writes with 403 when the actor is a non-member or viewer

---

## Metadata

- **Created:** 10/7/2026
- **Updated:** 3/8/2026
- **Reporter:** micaelavirgagarcia
- **Assignee:** micaelavirgagarcia
- **Labels:** qa-found, security, test-documentation

---

_Synced from Jira by sync-jira-issues_
