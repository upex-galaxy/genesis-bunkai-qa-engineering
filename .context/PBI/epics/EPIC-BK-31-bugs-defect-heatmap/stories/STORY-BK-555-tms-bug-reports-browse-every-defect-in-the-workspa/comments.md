# Comments for BK-555

[View in Jira](https://jira.upexgalaxy.com/browse/BK-555)

---

### Ely - 19/8/2026, 21:34:36

## AI Product Owner — Decision: four open product questions on the workspace-wide defect index

Raised and decided during authoring of this Story, under Critical Rule #18. Consolidated into one comment rather than four scattered ones, following the precedent the Product Owner set on BK-337 (design plan §5 D32). Each question enumerates its candidates, scores them against explicit criteria, and states the winner with the reasoning. Nothing here waited on a human, and nothing here is a human sign-off.

Scoring criteria, applied to all four: ***(C1) consistency with shipped precedent****, ****(C2) product value to the persona (QA Lead / Quality Engineering Manager)****, ****(C3) implementation cost****, ****(C4) reversibility****, ****(C5) risk of blurring the boundary with BK-41***.

---

### Q1 — What is this Story called, given BK-41 already owns `TMS-Defect List`?

| Candidate | C1 | C2 | C3 | C4 | C5 | Total |
| --- | --- | --- | --- | --- | --- | --- |
| A. `TMS-Defect List | Browse every defect in the workspace from one index` | 1 | 2 | 3 | 3 | ***0*** | 9 |
| B. `TMS-Defect Index | Browse every defect in the workspace from one index` | 3 | 2 | 3 | 3 | 1 | 12 |
| C. `TMS-Bug Reports | Browse every defect in the workspace from one index` | 3 | 3 | 3 | 3 | 3 | ***15*** |

***Winner******:****** C.*** The two Stories this one is modelled on both take their `{Feature}` prefix from the destination surface they light up, not from the entity: BK-439 is `TMS-ATC Library` (the sidebar entry it makes live) and BK-513 is `TMS-Run History` (the runs surface family), and each then spawns siblings that share that prefix — BK-440 and BK-441 for ATC Library, BK-442 for Run History. "Bug Reports" is the same kind of name: it is the shipped sidebar label in `AppSidebar.tsx`, the §3 nav destination, and the §4.6 screen name, so it is sourced rather than invented, and it is absent from the `domain-glossary.md` anti-glossary. Candidate A scores zero on C5 — reusing BK-41's exact prefix would assert that the two Stories are the same feature at a different scope, which is the one confusion this Story most needs to prevent. Candidate B avoids the collision but "List" versus "Index" is a weak discriminator on a board card, and it leaves the eventual workspace-scoped siblings (search, facets) with no natural family name.

### Q2 — What does the count beside the "Bug Reports" sidebar entry count?

| Candidate | C1 | C2 | C3 | C4 | Total |
| --- | --- | --- | --- | --- | --- |
| A. Every defect in the workspace, all statuses, unfiltered | 3 | 2 | 3 | 3 | ***11*** |
| B. Only outstanding defects (open plus in progress) | 0 | 3 | 3 | 3 | 9 |
| C. No count at all | 1 | 0 | 3 | 3 | 7 |

***Winner******:****** A.*** Every sidebar badge in this shell already means one thing — the size of the unfiltered destination. `Projects` carries `projects.length`; BK-439 specifies "an unfiltered count badge of every ATC the caller can read"; BK-513's AC-02 states the count "matches the number of Runs the unfiltered index lists" and "does not change when I apply a filter". Candidate B reads better in isolation and is the more actionable number, but it would make one badge in a column of four mean something different from its neighbours, and the workspace-wide outstanding-defect figure is already delivered, by severity, on the Home OPEN BUGS card (BK-258) — so B buys a duplicate at the cost of an inconsistency. C throws away a real signal for no gain. A is the ruling: the badge counts what the index shows when you arrive on it, which is the only promise a badge can keep.

### Q3 — Which filters does the workspace index ship, and in what order does it sort?

***Filters.*** Candidates: (A) Project, status, severity. (B) A plus a module filter over project-qualified module paths across the whole workspace. (C) A plus a module filter that only becomes selectable once a Project is chosen.

| Candidate | C1 | C2 | C3 | C4 | C5 | Total |
| --- | --- | --- | --- | --- | --- | --- |
| A. Project, status, severity | 3 | 3 | 3 | 3 | 3 | ***15*** |
| B. Plus a workspace-wide module picker | 1 | 2 | 0 | 2 | 1 | 6 |
| C. Plus a module picker gated on a Project choice | 1 | 2 | 1 | 2 | 1 | 7 |

***Winner******:****** A.*** BK-41's module filter is inseparable from one Project's tree: it rolls a chosen module up over its whole subtree by path prefix, and module names repeat across Projects, so a workspace-wide picker would have to list every module of every Project qualified by its Project — an option list that grows with projects multiplied by tree depth, in a control nobody has drawn. Candidate C invents a conditional-enable state with no precedent in this shell, and once a caller has filtered to one Project the Project-scoped list already does module triage better. So module-tree triage stays on BK-41 and is written into this Story's Out Of Scope with that reasoning attached, which also keeps the two screens' jobs distinct (C5). Assignee is excluded on the same scope-discipline grounds: it is a filter neither the Project-scoped list nor any sibling index ships today, so adding it here would be new capability smuggled into an index Story.

***Ordering.*** Candidates: (A) most severe first, then most recently filed. (B) most recently filed first, as BK-513 ruled for Runs. (C) caller-selectable sort.

***Winner******:****** A.*** BK-513 chose recency because a Run is an event and the question it answers is "what did we execute". A defect is a debt, and the question this screen answers is "what hurts most". The Project-scoped list already orders the same entity severity-first — its keyset cursor is `(severity, created_at, id)` — so A is also the only option that lets a reader move between the two screens without the ordering changing underneath them. C is a control no sibling index ships and is straightforwardly out of scope for a first slice.

### Q4 — Does the workspace index carry severity and status counts, given BK-513 explicitly refused workspace-wide totals?

| Candidate | C1 | C2 | C3 | C4 | Total |
| --- | --- | --- | --- | --- | --- |
| A. Severity and status counts over the whole filtered set | 3 | 3 | 2 | 3 | ***11*** |
| B. No counts, matching BK-513's refusal | 2 | 1 | 3 | 3 | 9 |
| C. Counts over the loaded page only | 0 | 0 | 3 | 3 | 6 |

***Winner******:****** A.*** BK-513 refused aggregates because pass/fail totals over a run list are a rate, and rates are the Metrics destination's job. Defect counts are not a rate — they are the current inventory, they are exactly what BK-41 already computes over its own filtered set, and a workspace-wide severity breakdown is already shipped on Home (BK-258), so this is not new capability being invented at the index. The refusal that carries over from BK-513 is trend, ageing and time-to-resolve, and those are written into Out Of Scope here. Candidate C is rejected outright: a count that describes the loaded page changes as the caller scrolls, which makes it a number nobody can quote.

---

### Ely - 19/8/2026, 21:34:36

## AI Tech Lead — Decision: how a workspace-wide defect listing gets its data, given `bunkai*list*bugs` pins `p*project*id`

Raised and decided during authoring of this Story, under Critical Rule #18. Recorded here rather than in the Story's fields, because the Story's Acceptance Criteria, Scope and Out Of Scope describe what the persona observes, never how it is served.

***The constraint.**** `public.bunkai*list*bugs` (`0051*bugs*list.sql`, last redefined in `0054*bug*assignment*status.sql`) declares `p*project_id uuid` as its first parameter with ****no default***, and its `revoke` / `grant` pair is bound to the exact signature `(uuid, uuid, text[], text[], int, text, timestamptz, uuid)`. A workspace-wide listing cannot call it as it stands, and changing its parameter list changes the signature that grant names.

Criteria: ***(C1) blast radius on BK-41, which is In Test****, ****(C2) reuse of logic already solved once****, ****(C3) authorization-surface change****, ****(C4) reversibility****, ****(C5) migration shape***.

| Candidate | C1 | C2 | C3 | C4 | C5 | Total |
| --- | --- | --- | --- | --- | --- | --- |
| A. A new sibling function keyed on the workspace, additive, with its own grant | 3 | 3 | 3 | 3 | 3 | ***15*** |
| B. Widen `bunkai*list*bugs` — make `p*project*id` nullable and add a workspace parameter | 0 | 3 | 1 | 1 | 1 | 6 |
| C. Query `bugs` directly from the route through the caller's RLS-scoped client, no function | 3 | 0 | 3 | 3 | 3 | 12 |

***Winner******:****** A — a new, additive sibling function keyed on the workspace, with its own revoke/grant pair, and the route that calls it modelled on ****`GET /api/v1/workspaces/[id]/open-bugs`****.***

Candidate B is rejected on C1 and C5 together: adding or defaulting a parameter produces a new signature, which means the existing `revoke` / `grant` lines no longer name the live function, and the old signature keeps existing alongside it unless it is explicitly dropped — a migration shape with a real window in which one of the two overloads is ungranted or, worse, granted when it should not be. Doing that to the function BK-41 depends on while BK-41 sits In Test is an avoidable risk for no gain, since nothing about the Project-scoped path needs to change.

Candidate C scores well on safety and would work — every read would run through the caller's own RLS-scoped client, so isolation stays Postgres's rather than the handler's, the same property `open-bugs` relies on. It loses on C2, and that loss is the whole decision: `0051` already solved the full module path composition, the archived-module exclusion, the keyset cursor over `(severity, created_at, id)`, and the aggregate recomputation over the filtered rather than the paged set. Re-deriving those in TypeScript would give this screen a second, independently drifting implementation of rules the Project-scoped list already enforces, and the first time the two disagreed the archived-module exclusion would be the thing that broke.

***What follows from A, for the implementing run to honour rather than re-decide******:***

- The new function is ***SECURITY INVOKER***, exactly as `bunkai*list*bugs` is, so workspace and project isolation stays with RLS and this Story adds no new authorization surface. `bugs.workspace*id` already exists as a `not null` column with its own index (`bugs*workspace*id*idx`, `0046_bugs.sql`), so the workspace filter needs no new join and no new table read.
- The archived-module exclusion is carried over verbatim from `0051`'s Decision 12, not re-derived — the workspace index must not surface defects the Project-scoped list hides.
- Aggregates are recomputed over the full filtered set, matching `0051`'s existing behaviour, so the two screens cannot disagree about how many Critical defects a Project has.
- The migration is purely additive: one new function plus its own `revoke` / `grant`. `bunkai*list*bugs` is not touched, not overloaded, and not dropped.
- No ADR. No schema change, no auth-model change, no cross-cutting invariant, and the whole thing is reversible by dropping one function — it fails ADR gate 1, the same test D19, D25, D31, D32 and D33 each failed.

---


_Synced from Jira by sync-jira-issues_
