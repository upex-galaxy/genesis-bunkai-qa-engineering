# Comments for BK-507

[View in Jira](https://jira.upexgalaxy.com/browse/BK-507)

---

### Ely - 18/8/2026, 16:58:58

## AI Tech Lead — Decision: which ATC surface hosts bulk-edit

***Question.*** PRD US 8.2 commits to bulk-edit on "a table view of any entity type". Two ATC table surfaces are in play: the Project-scoped ATC list that ships today (`AtcTable` on a Project's page), and the workspace-wide ATC index that BK-439 / BK-440 / BK-441 will build. Which one does this story target, and does it wait for BK-439?

***State of the ground, verified against ****`origin/staging@c5cb0fe`****.*** The Project ATC list exists and already renders ID, Title, Layer, Module path, Status and Tags columns. It has no selection control of any kind — no row checkbox, no selection state, no batch write path. BK-439 is in `Backlog` and unbuilt, so the workspace-wide index has no surface to attach a selection to. `master-implementation-plan.md` gap G9 records the batching capability as declared but never specified, which is consistent: nothing has been built against it.

***Alternatives scored.***

| # | Option | Product value | Consistency with precedent | Cost | Reversibility | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Gate this story on BK-439 and build bulk-edit only on the workspace index | Low — parks a written PRD promise behind unbuilt work of unknown date | Neutral | Low now, unbounded later | High — the wait is the cost | Highest: a committed MVP capability sits blocked on a Backlog ticket |
| 2 | Build the workspace index and bulk-edit together as one ticket | High eventually | Poor — BK-267 was already split into three slices precisely to avoid this shape | Highest | Poor — a large ticket is hard to unwind | High: oversized, breaks the definition cap the epic's other stories hold to |
| 3 | ***Scope to the live Project ATC list; BK-439 inherits the selection component when it lands**** | ****High and immediate — the promise ships against a real surface now**** | ****Strong — matches the slice granularity of BK-439/440/441**** | ****Lowest**** | ****Best — a self-contained slice on an existing screen**** | ****Lowest******:****** independently shippable, no dependency on unbuilt work*** |

***Decision******:****** option 3.*** Bulk-edit is scoped to the ATC list that already exists inside a Project. The selection affordance and the batch-write semantics built here are surface-agnostic; when BK-439 delivers the workspace-wide index, it reuses them rather than reinventing them. Option 3 wins on reversibility and cost without conceding any product value, because the Project ATC list is where a QA Engineer doing a module refactor is already standing.

***Consequence for the backlog.*** No dependency link to BK-439 is created — this story does not depend on it. When BK-439 is built, extending bulk-edit to it is a follow-up slice, not a rework.

---

**Decided by the AI Tech Lead profile per CLAUDE.md Rule #18. This is an AI decision, not a human product-owner sign-off.**

---

### Ely - 18/8/2026, 16:58:59

## AI Product Owner — Decision: which ATC fields are bulk-editable

***Question.*** PRD US 8.2 names the bulk-editable fields as "(status, tags, module)". On an ATC, is `status` one of them?

***Why this is not a mechanical read of the PRD.**** An ATC's `status` is not an authored attribute. The shipped schema constrains it to `pass | fail | blocked | skipped | running | unrun` — the ****Execution Status*** set, produced by Runs. `.context/business/domain-glossary.md` is explicit on this point and its anti-glossary specifically bans reading an ATC's status as an authoring lifecycle (`draft` / `ready` / `automated` / `deprecated`), a misreading that already blocked BK-20 for five weeks. So the PRD's field list, written generically across four entity types, does not survive contact with the ATC entity as literally as it reads.

***Alternatives scored.***

| # | Option | Product value | Consistency with the domain | Cost | Reversibility | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Take the PRD literally and make `status` bulk-editable | Negative — lets a user hand-write an execution outcome with no Run behind it | Breaks the glossary outright, and destroys the uncovered-vs-not-run distinction the Coverage screen depends on | Low | ***Poor — fabricated evidence is written data*** | Highest: corrupts the traceability chain, the product's whole differentiator |
| 2 | Ship `tags` + `Module` only, silently dropping the third field | Moderate — honest, but delivers less density than promised | Good | Lowest | Good | Moderate: looks like an unexplained shortfall against the PRD |
| 3 | ***Ship ****`tags`**** + ****`Module`**** + ****`layer`****, substituting layer for status**** | ****High — three fields, the promised density, all of them genuinely authored**** | ****Strong — layer is an ATC's real classification and already a column on the live list**** | ****Low — same surface, same batch path**** | ****Good — a field can be added later without unwinding anything**** | ****Lowest*** |
| 4 | Substitute ATC Priority for status | High eventually | Good | Blocked | n/a | High: ATC Priority is not shipped (BK-399), so this re-introduces the dependency-on-unbuilt-work failure mode |

***Decision******:****** option 3.**** This story ships bulk-edit of ****tags, Module and layer***. `status` is explicitly out of scope, recorded in the Out Of Scope field with its reason, so the omission reads as deliberate rather than as an oversight against PRD US 8.2. ATC Priority is the natural fourth field once BK-399 ships, and adding it then is additive.

***Consequence for the PRD.**** US 8.2's parenthetical "(status, tags, module)" is generic across ATCs, Tests, Runs and Bugs. It holds for the entities whose status **is* authored — a Bug's status lifecycle is authored, for instance. It does not hold for ATCs. No PRD edit is proposed here; this decision records the per-entity reading so the next agent does not re-litigate it.

---

**Decided by the AI Product Owner / Business Analyst profile per CLAUDE.md Rule #18. This is an AI decision, not a human product-owner sign-off.**

---


_Synced from Jira by sync-jira-issues_
