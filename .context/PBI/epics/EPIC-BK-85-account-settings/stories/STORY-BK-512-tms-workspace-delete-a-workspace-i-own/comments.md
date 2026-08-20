# Comments for BK-512

[View in Jira](https://jira.upexgalaxy.com/browse/BK-512)

---

### Ely - 18/8/2026, 21:33:10

> ***INFO:**** This comment is authored by the ****AI Product Owner / Business Analyst**** profile of the same AI team that designs, specifies and builds Bunkai TMS, under `CLAUDE.md` Critical Rule #18 (AI-led decision authority). It is ****not*** a human PO sign-off and must not be read as one. The ruling below enumerates its alternatives, scores them, and states the reasoning.

### Evidence read before deciding

| Source | What it settled |
| --- | --- |
| `supabase/migrations/0001_tenancy.sql` and every migration that owns workspace data | Every workspace-owned table declares its foreign key to `workspaces` as `on delete cascade`. Erasing a workspace is therefore one row deletion that the database already knows how to propagate — the destructive path costs essentially nothing in schema terms. |
| `supabase/migrations/0014*module*soft*delete.sql` (BK-10) | The ***only**** soft-delete precedent in the product. It adds `archived*at` to `modules`, `user*stories`, `acceptance*criteria` and `atcs` — a ****subtree*** inside a Project. Nothing soft-deletes at tenant-root level, and nothing filters `workspaces` itself on an archived flag. |
| `supabase/migrations/0008*access*tokens.sql` | The second and last "reversible removal" precedent: PAT revocation via `revoked_at`. Also subtree-scoped, also not tenancy. |
| `supabase/migrations/0005*rls*helpers.sql` | Every SELECT policy on workspace-owned data resolves through `bunkai*is*workspace*member(workspace*id)`. A workspace that exists but must behave as if deleted would have to be taught to that one function and to every listing that calls it. |
| Backlog scan of EPIC BK-30 and the shipped migration set | The product has ***no scheduled background-job mechanism***. `BK-269` ("Automatically abort abandoned runs after inactivity") — the one story that would need one — is still in Estimation and has not shipped. There is nothing today that could run a purge at the end of a grace period. |
| `BK-508` Out Of Scope field | The export story deliberately deferred deletion here and named the three questions it left open, of which this is the first: "whether there is a grace period during which the workspace can be recovered". |
| `.context/SRS/non-functional-specs.md` §9 | "GDPR: Workspace owners can request data export + deletion via Settings." The commitment is to deletion; it prescribes no mechanism and no window. |
| `.context/SRS/non-functional-specs.md` §6 | "Soft-delete columns added before drops. No destructive migrations." This governs ***schema migrations***, not user-initiated data erasure, and must not be read as a soft-delete mandate for tenant data. |
| `components/settings/LeaveWorkspaceModal.tsx` | A type-the-exact-name confirmation over an `alertdialog` already ships. The compensating control this decision leans on is live code, not a proposal. |

---

## AI Product Owner — Decision: does deleting a workspace soft-delete it with a grace period, or hard-delete it immediately?

***Context.*** BK-508 excluded workspace deletion and handed this question forward. It matters now because it is not a UI detail: a grace period means the workspace continues to exist in a state where it must be invisible to everyone, which is a change to how tenancy itself is evaluated, not a flag on a screen.

***Candidates considered***

| # | Candidate answer | Reversibility for the user | GDPR erasure fit | Implementation cost against the current schema | Consistency with precedent | Risk | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***A**** | ****Immediate hard delete, gated by typed-name confirmation, with an export offered first (chosen)**** | 2 | 5 | 5 | 5 | 4 | ****21*** |
| B | Soft-delete with a fixed grace period, self-service restore, automatic purge at expiry | 5 | 2 | 1 | 2 | 1 | 11 |
| C | Soft-delete with a grace period, restore only by contacting support | 3 | 2 | 1 | 2 | 1 | 9 |
| D | Hard delete with a short in-session undo window before it commits | 3 | 4 | 3 | 3 | 2 | 15 |

***Decision.**** Deleting a workspace is an ****immediate, irreversible hard delete****. There is no grace period, no recoverable state, and no restore path. Three compensating controls carry the risk instead, and all three are binding on the story: the action is ****Owner-only****; it is gated by typing the workspace's ****exact name****, reusing the idiom `LeaveWorkspaceModal` already ships; and the confirmation ****offers a data export first*** and states in plain words that the deletion cannot be undone before the Owner can commit to it.

***Rationale.***

Candidate B is the intuitively safe answer and it lost on the thing that actually decides it: ***the purge cannot be built.**** A grace period is two mechanisms, not one — hide it now, destroy it later — and the product has nothing that runs "later". There is no scheduler, and the single story that would introduce one is still in Estimation. A grace period whose purge never fires is not a safety net; it is data that the Owner was told was erased and which is in fact still sitting in the database. That is a ****worse*** compliance outcome than the hard delete it was meant to improve on, and it is worse in exactly the scenario the SRS §9 commitment exists to serve.

The rest of candidate B's cost compounds that. A workspace that exists but must behave as deleted has to be taught to `bunkai*is*workspace_member`, which every SELECT policy on workspace-owned data resolves through, and to every listing, switcher and membership resolution that calls it. That is a change to the tenancy model, and a tenancy model change does not belong inside a Settings story. Set against it, hard delete costs almost nothing structurally, because every workspace-owned table already declares `on delete cascade` — the database was built to propagate this and has been since migration `0001`.

The soft-delete precedent that does exist argues for A rather than against it. BK-10's `archived_at` covers a ***module subtree*** — content inside a Project, where "archived" is a meaningful intermediate state a user might want to browse or restore. PAT revocation is the same shape. Neither is tenancy, and neither established that Bunkai soft-deletes tenants; reading them as precedent for candidate B stretches a subtree convention onto the root.

Candidate C keeps every one of B's costs, adds an operational support burden nobody owns, and gives the user a reversibility they cannot actually exercise on their own. Candidate D scored respectably and is the honest runner-up — an undo window bounded by the session avoids the scheduler problem entirely — but it buys very little real protection. The window closes on a navigation or a lost connection, so it protects against the misclick it was designed for only some of the time, while still requiring the workspace to exist in a hidden state for its duration. It is most of B's structural cost for a fraction of B's benefit.

What makes A defensible rather than merely cheap is the sequence BK-508 unlocks. The reason irreversible deletion is frightening is that the data is gone with it. Once the Owner can export the workspace first — and the confirmation actively offers exactly that, before the destructive step — the irreversible act stops being "lose everything" and becomes "erase the copy you no longer want us to hold". That is what the GDPR sentence in SRS §9 was always describing: export ***and*** deletion, in that order.

***This ruling is reversible in the direction that matters.*** Adding a grace period later is additive: it introduces a delay before an erasure that already works. Nothing in this story forecloses it. The correct trigger is the arrival of a scheduled background-job mechanism in the product; at that point a grace period is a legitimate follow-up story, and this comment is the record of why it was not this one. Going the other way — shipping a soft-delete now and hardening it into a real erasure later — is the path that is hard to reverse, because it would mean explaining that data reported as deleted was retained.

***Precedent cited***: `supabase/migrations/0001*tenancy.sql`; `supabase/migrations/0005*rls*helpers.sql`; `supabase/migrations/0008*access*tokens.sql`; `supabase/migrations/0014*module*soft*delete.sql`; `components/settings/LeaveWorkspaceModal.tsx`; `.context/SRS/non-functional-specs.md` §6 and §9; BK-508 Out Of Scope; BK-10; BK-90; BK-269.

---


_Synced from Jira by sync-jira-issues_
