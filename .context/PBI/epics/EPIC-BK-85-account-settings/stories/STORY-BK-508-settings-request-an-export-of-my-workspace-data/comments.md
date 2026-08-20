# Comments for BK-508

[View in Jira](https://jira.upexgalaxy.com/browse/BK-508)

---

### Ely - 18/8/2026, 16:59:01

## AI Tech Lead — Decision: request-and-collect versus a direct download

***Question.*** Should the Settings data export hand the Owner a file on the spot, or acknowledge a request and make the archive available afterwards?

***State of the ground.*** A workspace's data spans essentially the whole schema — Projects, Modules, User Stories, Acceptance Criteria, ATCs with their steps and assertions, Tests and their chains, Runs with their snapshotted step content, Bugs, Activity events, memberships. Run snapshots in particular grow without bound over a workspace's life, because that is the point of them. The size of a real workspace's export is therefore unbounded and unknowable at request time. The product already has one asynchronous, polled long-running operation with an established shape: the Import Job (`queued → running → completed | failed`).

***Alternatives scored.***

| # | Option | Product value | Consistency with precedent | Cost | Reversibility | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Assemble and stream the archive within the request | Fine for a toy workspace | None — nothing else in the product does long work inline | Lowest to write | Poor — the failure only shows up on the biggest, most important workspaces | Highest: times out exactly for the Owner with the most data, which is the Owner most likely to face a compliance request |
| 2 | ***Acknowledge the request, prepare the archive out of band, offer it for download when ready**** | ****High — works at any workspace size, and the Owner is not held on the screen**** | ****Strong — mirrors the Import Job lifecycle already shipped**** | ****Moderate**** | ****Good — the states are observable and a failure is reportable rather than a hung page**** | ****Lowest*** |
| 3 | Option 2 plus emailing the archive to the Owner | Marginally higher convenience | Weak — no export path in the product mails data today | Higher: adds a delivery channel and puts workspace data in a mailbox | Poor — data sent by mail cannot be recalled | Elevated: widens where the archive can end up, for little gain |

***Decision******:****** option 2.*** The export is requested, prepared out of band, and collected from the Settings section when ready, with an expiry on the download. This is what makes AC-04, AC-05, AC-07 and AC-08 the shape they are: an acknowledged request, a single in-flight request per workspace, an expiring download, and a failure that reports itself.

***Left to the implementation plan, deliberately.*** The concrete archive format is not fixed here. The story requires only that it be structured and machine-readable, which is the property that makes it usable as a data-portability answer; picking the encoding is an implementation call, not a product commitment.

---

**Decided by the AI Tech Lead profile per CLAUDE.md Rule #18. This is an AI decision, not a human product-owner sign-off.**

---


_Synced from Jira by sync-jira-issues_
