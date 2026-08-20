# Comments for BK-502

[View in Jira](https://jira.upexgalaxy.com/browse/BK-502)

---

### Automation for Jira - 18/8/2026, 18:35:13

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 18/8/2026, 18:47:51

✅ Pull Request is successfully MERGED and DEPLOYED on QA. 
It's Ready for Testing Phase! 
Dev Task is Done.

---

### Ely - 18/8/2026, 18:49:14

## Fixed and merged — root cause, not symptom

`--include-comments` is now honoured for `Bug` and `Improvement` (and `Test Case`, which had the same defect for the same reason).

### What was wrong

`scripts/sync-jira-issues.ts` -> `syncStandaloneIssue()` routes ***coverable**** work types to `syncCoverableStandalone()`, which honours `options.includeComments` and writes a sibling `comments.md` via `fetchComments()`. The ****non-coverable fall-through branch below it*** wrote the content file and never referenced `options.includeComments`, never called `fetchComments()`. The flag was parsed, accepted, and discarded — exit 0, no warning.

Which types land in that branch is decided by `.agents/jira-required.yaml`:

| Work type | `coverable:` | Before |
| --- | --- | --- |
| `defect` | `true` (explicit) | :white*check*mark: `comments.md` written |
| `story` / `epic` | routed separately | :white*check*mark: `comments.md` written |
| `bug` | `false` (explicit, line 534) | :x: comments dropped |
| `improvement` | key absent, coerced `false` | :x: comments dropped |
| `test_case` | key absent, coerced `false` | :x: comments dropped |

The ticket scoped this to `Bug`. `Improvement`*** was broken for exactly the same reason and is fixed in the same change*** — one defect, one branch. `Test Case` came along with it, since the fix is at the branch rather than per type.

### What changed

> ***INFO:**** `Bug` / `Improvement` / `Test Case` are `content: single` — one flat file, no folder to hold a sibling `comments.md`. The comment trail is therefore embedded ****inside that same file***, under a `## Comments` heading spliced above the sync footer.

That placement is a deliberate call. A sibling `BUG-<KEY>-<slug>.comments.md` would have been the smaller diff, but it reproduces the exact failure mode this ticket is about: a routine that opens the file it already knows about still sees nothing. Putting the trail in the one file every routine already reads closes the blind read instead of relocating it. This also matches the ticket's own suggested fix.

Per-comment rendering was extracted to a shared `renderCommentEntries()` so the folder layout and the flat layout cannot drift. `main()` is now guarded by `import.meta.main` and the routing entry point exported — the script previously ran the CLI on import, which is why it had no test coverage at all.

### Regression coverage

`scripts/sync-jira-issues.test.ts` (new) drives the ***real**** `routeIssueByKey()` -> `syncStandaloneIssue()` path against a throwaway HTTP server speaking the Jira REST shapes the script consumes, and against the ****real*** `.agents/jira-required.yaml` — so the `coverable:` flags that decide the routing are the project's own, not a fixture that could keep the suite green over a dead path.

Five cases: `Bug` embeds the trail · `Improvement` embeds the trail · no section without the flag · footer stays last and no duplicated rule · control, a `Defect` still gets its own `comments.md`.

***Against the pre-fix code******:****** 3 fail, 2 pass.**** (The two passing are the negative case and the `Defect` control, neither of which was ever broken.) ****After the fix******:****** 5 pass.***

### Verification

| Check | Result |
| --- | --- |
| `bun test` | 1560 pass, 1 fail |
| `bun run types:check` | clean |
| `bun run lint:check` | 0 errors |

The one failing test is `start-run.test.ts` "ATC-01" — pre-existing Supabase seed drift, unrelated to this ticket, already failing on `staging` before this branch, and still unticketed.

### Live proof

Reproduced before the fix on `BK-176` (a `Bug` with three real comments in Jira): the generated file contained zero comment content while `acli jira workitem comment list --key BK-176` returned `3`. After the fix the same command produces all three under `## Comments`. `BK-265` (`Improvement`) likewise. `BK-329` (`Defect`) still writes its own `comments.md` — the control path is untouched.

This very ticket is the dogfood case: `bun run jira:sync-issues get BK-502 --include-comments` now materializes this comment thread into `.context/PBI/bugs/BUG-BK-502-*.md`.

---

## Hand-off to QA

***Left deliberately unassigned.*** BK-502 never went through a Shift-Left QA phase — it was filed by the scheduled `bug` delivery routine on 2026-08-17, and its full changelog shows only `Sprint` assignment, `Open -> In Progress`, and the automation's `In Progress -> In Review`. No QA person ever held it and its only pre-existing comment is the automation's PR notice. Per the hand-off rule, an unidentifiable shift-left owner means unassigned rather than guessed, and never the developer.

***Whoever picks this up — to verify******:***

1. `bun run jira:sync-issues get BK-502 --include-comments`
2. Open `.context/PBI/bugs/BUG-BK-502-*.md` and confirm a `## Comments` section carrying this thread.
3. Repeat with an `Improvement` (e.g. `BK-265`) and confirm the same.
4. Control: `bun run jira:sync-issues get BK-329 --include-comments` still produces `defects/DEFECT-BK-329-*/comments.md`.

> ***NOTE:*** The 38 flat files already in `.context/PBI/bugs/` and the 3 in `improvements/` were written by the broken code and still carry no comments. They are re-materialized on the next sync — a full `bun run jira:sync-issues pull --include-comments` will backfill them. This fix does not retroactively rewrite them.

---


_Synced from Jira by sync-jira-issues_
