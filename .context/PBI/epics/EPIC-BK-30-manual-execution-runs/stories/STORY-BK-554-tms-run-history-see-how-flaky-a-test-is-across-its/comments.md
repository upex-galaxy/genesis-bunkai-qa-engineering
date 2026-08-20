# Comments for BK-554

[View in Jira](https://jira.upexgalaxy.com/browse/BK-554)

---

### Ely - 19/8/2026, 21:33:42

## AI Product Owner — Decision: what counts as a flip, over what window, with what minimum sample, and whether Aborted Runs take part

> ***INFO:**** This ruling was made by the ****AI Product Owner*** profile under Critical Rule #18 (AI-led decision authority), not by a human Product Owner. It is published here so any future agent run can see at a glance where the answer came from. It is a decision, not a sign-off, and it is reversible by a later ruling that says so explicitly.

The flakiness definition has never been ruled anywhere in this project — not in the PRD, not in the SRS, not in an ADR, not on any sibling ticket. BK-37's benefit line ("spot flaky areas") and PRD US 6.4 ("so I can spot flaky tests") both assume a definition neither of them supplies. This comment supplies it.

---

### The question, in four parts

1. What counts as a flip — a change of verdict between **consecutive** Runs, or any mixture of verdicts inside a window?
2. What is the window — the last N Runs, or a period of time?
3. Below what sample size is no signal shown at all?
4. Do Aborted Runs (and Blocked ones) take part?

Part 4 has a factual half that closes immediately: ***there is no Blocked outcome at the Run grain.*** The Run-grain enumeration is Running, Passed, Failed, Aborted; Blocked exists only on an individual step inside a Run. So part 4 reduces to Aborted alone.

---

### Candidates considered

| # | Candidate | How it computes flakiness |
| --- | --- | --- |
| A | ***Consecutive-verdict-flip rate*** | Order the Test's verdict-carrying Runs newest-first; count adjacent pairs whose verdicts differ; rate = flips ÷ pairs |
| B | ***Minority-verdict share*** | Over the same window, rate = the smaller of the pass count and the fail count, divided by the total |
| C | ***Rolling time window*** | The same arithmetic, but the window is a period (30 days) instead of a Run count |
| D | ***Boolean "has flipped"*** | A flag: the Test either changed verdict inside the window or it did not |

### Scoring

Criteria are the five this project scores product rulings on. 1 is worst, 5 is best.

| Criterion | A | B | C | D |
| --- | --- | --- | --- | --- |
| Product value — does it separate instability from a fixed regression? | 5 | 2 | 3 | 1 |
| Consistency with existing precedent in this codebase | 4 | 3 | 4 | 2 |
| Implementation cost (lower cost scores higher) | 4 | 5 | 3 | 5 |
| Reversibility | 5 | 5 | 4 | 5 |
| Risk of publishing a misleading number | 5 | 2 | 2 | 1 |
| ***Total**** | ****23**** | ****17**** | ****16**** | ****14*** |

***Product value.**** This is where B and D lose decisively. A Test that failed eleven times and has passed ever since is not flaky — it was broken and it was fixed. B scores that Test at up to 50% flaky, and D flags it outright. That single false positive is the most common shape in a manual TMS, and it is precisely the failure mode Elena Vargas names as her second pain point: a headline number that says nothing about whether the thing behind it is trustworthy. A scores the same Test at one flip out of nine pairs — 11%, correctly below the flaky band — because it counts **changes of state**, not **quantity of red*.

***Precedent.*** A walks the same newest-first ordering (start time, with the identifier as tie-break) that the Run history already pages by, so a reader can count the flips down the rows themselves and get the same answer. That auditability is not decoration: it is the difference between a number this team's own persona trusts and one more figure she does not. C matches the Defect Heatmap's rolling-window idiom (7d / 30d / 90d), which is real precedent — but it conflicts with the screen it would land on, whose totals are deliberately all-time and filter-invariant.

***Risk.*** C's flaw is fatal for a manual TMS specifically: manual execution cadence is irregular by nature. A Test run twice in thirty days would publish a rate drawn from one pair, and a Test run two hundred times would average away a burst of flapping that started yesterday. A run-count window is stable under any cadence; a date window is not.

***Cost.*** A is one pass over at most ten rows already served by the covering index that migration `0038*run*history.sql` added. C needs a date predicate whose result set is unbounded for a heavily-run Test.

---

### Ruling — Candidate A, with these constants

| # | Constant | Value |
| --- | --- | --- |
| 1 | Flip | Two ***consecutive*** verdict-carrying Runs of the same Test, in the history's own newest-first order, whose verdicts differ |
| 2 | Verdict-carrying | Passed or Failed only |
| 3 | Window | The ***10**** most recent verdict-carrying Runs → at most ****9*** consecutive pairs |
| 4 | Rate | flips ÷ pairs, decided on the exact fraction, displayed as a whole-number percentage |
| 5 | Minimum sample | ***5*** verdict-carrying Runs. Below it: no rate, no band, no zero — the signal says the Test cannot be judged yet and how many more Runs are needed |
| 6 | Aborted Runs | ***Skipped, not counted, not a break in the sequence.*** The verdicts either side of an abort remain consecutive. The number skipped is always disclosed |
| 7 | Runs in progress | Never participate, consistent with the history's existing rule that an in-progress Run is not a past Run |
| 8 | Bands | ***Stable**** (zero flips) · ****Occasionally flaky**** (≥1 flip, rate ≤ one third) · ****Flaky*** (rate > one third) |
| 9 | Environment scope | One signal per Test, across every Project Environment it ran in |
| 10 | Filter behaviour | Filter-invariant, like the all-time totals beside it |

***Why Aborted is skipped rather than counted (constant 6).*** An abort is the executor stopping — a blocked session, a shift ending, an environment that never came up. It is never the software's answer about itself. Counting it as a verdict would convert every interrupted session into flakiness and make the signal a measure of the team's day rather than the Test's stability. The glossary is explicit that Aborted names anomalous termination of the whole execution.

***Why Aborted does not break the sequence either.*** The alternative — treating an abort as a discontinuity, so the verdicts either side are no longer adjacent — was rejected because it lets a single abort silently swallow a genuine pass-to-fail flip. Skipping keeps every real change of verdict visible. The disclosure requirement is what stops the skip from being dishonest: the sample size on screen must always reconcile against the list below it.

***Why one third (constant 8).**** It is the three-in-nine boundary at a full window, and it puts the one-flip recovery case (a long red streak that was fixed) firmly in Occasionally flaky and never in Flaky. Three bands rather than the Defect Heatmap's four, because the heatmap's four buckets partition a **count** and this partitions a **rate*: there is no action a reader takes differently between two adjacent "quite flaky" bands, whereas the stable / sometimes / constantly distinction changes what she does next.

***Why five (constant 5).*** Four consecutive pairs is the smallest sample where a single flip reads as 25% rather than 33% or 100%. Below it, one unlucky Run produces a headline percentage nobody should act on, and this project has ruled the same way before: D19 refused per-project counts on the Projects index and D25 refused a readiness figure on the Milestones board, both on the grounds that no number beats a number with nothing behind it. Same instinct, same answer.

---

### What this ruling does ***not*** decide

- ***Why*** a Test flipped. Attribution — product regression, environment difference, or an edit to the Test's own chain — is out of scope and stays out. The signal asserts that the Test's verdict is not reproducible; it never claims to know the cause.
- Any step-grain or ATC-grain instability signal. That grain is unclaimed, and BK-442's open pairing question shows it is not cheap.
- Whether the window, the minimum, or the bands should ever become configurable. They ship as constants. Making them settings is a separate story with its own justification, and there is no evidence yet that anyone wants to tune them.

---


_Synced from Jira by sync-jira-issues_
