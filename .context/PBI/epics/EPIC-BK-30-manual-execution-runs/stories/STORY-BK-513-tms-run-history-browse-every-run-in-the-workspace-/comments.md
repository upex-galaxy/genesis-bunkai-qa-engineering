# Comments for BK-513

[View in Jira](https://jira.upexgalaxy.com/browse/BK-513)

---

### Ely - 18/8/2026, 21:33:11

> ***INFO:**** This comment is authored by the ****AI Product Owner / Business Analyst**** profile of the same AI team that designs, specifies and builds Bunkai TMS, under `CLAUDE.md` Critical Rule #18 (AI-led decision authority). It is ****not*** a human PO sign-off and must not be read as one. The ruling below enumerates its alternatives, scores them, and states the reasoning.

### Evidence read before deciding

| Source | What it settled |
| --- | --- |
| `.context/design/master-design-plan.md` §4.8 | The drawn Project-scoped runs index (`test-runs-index.html`) is ***one row per Run***: per-row Test, module, environment, executor mode, outcome chip, date. The drawn grain at Project level is the Run. |
| `.context/design/master-design-plan.md` §4.8 (`test-run-history.html`) and D13 | The ***per-Test*** view already exists as its own surface — a Test's own run history at `/projects/{slug}/tests/{testId}/runs`, all-time totals plus a per-Test outcome bar. A Test-keyed grain is already served, one level down. |
| `app/api/v1/projects/[id]/runs/report/route.ts` (BK-38) | The shipped Project-scoped report returns Runs, keyset-paginated on `(started_at desc, id desc)`, with filters AND-composed and totals recomputed over the filtered set. The read that this screen generalises is already Run-grained. |
| `app/api/v1/workspaces/[id]/active-runs/route.ts` | The one shipped workspace-scoped run read — the Home dashboard's active-runs panel — is also one row per Run. |
| `supabase/migrations/0031*runs.sql` | `runs` carries `workspace*id` directly alongside `project*id`, and snapshots `test*title` on the row. A workspace-wide Run list needs no derivation and no join through Projects to be correctly scoped. |
| `.context/PRD/mvp-scope.md` US 6.4 / US 6.5 | Two distinct QA needs are already written down: "the full history of Runs for a given Test … so I can spot flaky tests" (Test-keyed, served by BK-37) and "filter Runs by date range / Module / status … so I can read trends" (Run-keyed, served by BK-38). |
| `.context/business/domain-glossary.md` | A Run is "one execution instance of a Test against an environment". A Test may be run repeatedly, in different environments, by different executors — several Runs of one Test on the same day are the normal case, not an edge case. |
| BK-442 | Comparing a Run against the previous Run of the same Test presupposes that individual Runs are addressable and pickable. |

---

## AI Product Owner — Decision: is the workspace-wide index keyed on the Run, or on the Test showing its latest Run?

***Context.**** A cross-project index of executions can be built at two grains. One row per ****Run**** answers "what was executed"; one row per ****Test with its latest Run*** answers "where does everything stand right now". They look similar on a mockup and behave completely differently in use, so the choice has to be made before the screen is built rather than discovered afterwards.

***Candidates considered***

| # | Candidate answer | Day-to-day value to a QA | Consistency with existing precedent | Implementation cost | Reversibility | Risk of collision with another surface | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***A**** | ****One row per Run (chosen)**** | 5 | 5 | 5 | 4 | 5 | ****24*** |
| B | One row per Test showing its latest Run, expandable to that Test's history | 3 | 1 | 2 | 3 | 1 | 10 |
| C | One row per Test-and-environment pair, showing the latest Run of that pair | 2 | 1 | 2 | 3 | 1 | 9 |
| D | A toggle between the two grains on one screen | 4 | 2 | 1 | 3 | 2 | 12 |

***Decision.**** The index is keyed on the ****Run***. One row is one execution: the Test that ran, the Project it belongs to, the environment it ran against, its execution mode, its outcome, when it started and finished, and how its steps came out. A Test that ran four times today occupies four rows, and each of them opens the Run it names.

***Rationale.***

The question is what a QA engineer is actually holding when they open this screen. They are holding a ***time window*** — what did we execute last week, what failed on staging yesterday, what did the automated executor produce overnight. Every one of those is a question about executions, and a screen that collapses to one row per Test cannot answer any of them: it silently discards every Run but the most recent, which is precisely the set the question was about. A Test run four times, failing three and passing on the fourth, reads on candidate B as an unremarkable green row. That is not a summary, it is a lost signal, and it is lost in the exact case a QA Lead most needs to see.

Candidate A is also the grain the product has already chosen three times. The Project-scoped runs index that BK-38 shipped is Run-grained, its endpoint returns Runs with keyset pagination, and the Home dashboard's cross-project active-runs panel — the only workspace-scoped run read that ships today — is Run-grained too. The design plan draws the Project-level screen this one is the workspace-wide sibling of, and draws it one row per Run. Choosing a different grain for the workspace-wide view would mean the same product answered "what is a row in a list of runs" two different ways at two different scopes, and a user moving between them would have to relearn the screen.

The strongest argument for candidate B is that "current state per Test" is genuinely useful — and it is, which is why it is worth being precise about who already owns it. Latest-state-per-Test is a ***coverage and metrics*** question, and the shell already reserves a Metrics destination for it. Building it here would put a metrics surface behind a nav entry labelled Test Runs, and would leave the real runs list with nowhere to live. Meanwhile the per-Test history that candidate B offers by expansion is not missing from the product at all: BK-37 shipped it as a Test's own run history, with all-time totals and an outcome filter, and D13 gave it its own deep-linkable route. Candidate B would duplicate that inside a different screen at lower fidelity.

Candidate C compounds B's problem and adds one of its own: the row count becomes a function of how many environments a Project happens to have defined, so two workspaces with identical testing activity render at different densities for a reason that has nothing to do with testing. Candidate D scored better than the other two because it does not throw the Run grain away, but a grain toggle doubles the read, the filter semantics, the empty states and the test surface of a screen whose first version has not shipped yet. It is a reasonable thing to want after the Run-grained index exists and someone has asked for the other view; it is an expensive way to avoid making a decision now.

There is one further reason to hold the Run grain, and it is forward-looking. ***BK-442*** — comparing a Run against the previous Run of the same Test — is recorded in the design plan as mockup-gated with no drawn surface, and it starts by picking two Runs. This index is the only screen in the product where every Run in the workspace is individually addressable, which makes it the natural host for that comparison later. Candidate B would have removed exactly the rows BK-442 needs to select from. This story does not build the comparison, and it is linked to BK-442 so the relationship is not lost.

***Reversibility.*** A latest-per-Test view remains available later as a filter, a grouping, or a Metrics surface built on the same Run-grained read — nothing in this decision blocks it. The reverse is not true: a screen that only ever stored and rendered the latest Run per Test would have to be rebuilt from the read upward to recover the executions it had been discarding.

***Precedent cited***: `.context/design/master-design-plan.md` §4.8, §4.9, D13, D18, D31; `app/api/v1/projects/[id]/runs/report/route.ts`; `app/api/v1/workspaces/[id]/active-runs/route.ts`; `supabase/migrations/0031_runs.sql`; `.context/PRD/mvp-scope.md` US 6.4 and US 6.5; `.context/business/domain-glossary.md`; BK-37; BK-38; BK-225; BK-442.

---


_Synced from Jira by sync-jira-issues_
