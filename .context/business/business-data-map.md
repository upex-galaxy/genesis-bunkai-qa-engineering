# Business Data Map — Bunkai (upex-bunkai-tms)

> Discovery performed against `C:\Users\Genesis Ojose\Documents\Auto\Dojo 4\upex-bunkai-tms` (read-only). This is a **synthesis** document — it composes `domain-glossary.md` (entities/enums/rules/ERD/state machines), `business-model.md` (positioning), `user-journeys.md` (5 mapped flows), `user-personas.md` (4 roles), `architecture.md` (system shape), `functional-specs.md` (11 FRs), and `infrastructure/backend.md` (runtime/env), plus one dedicated spot-check of `lib/jira/import-runner.ts` + `app/api/v1/imports/route.ts` for the Jira-import flow that PRD discovery deliberately deferred. It does not re-derive facts already established in those files — every section cites its source.

```
+------------------------------------------------------------------+
|                                                                    |
|   B U N K A I                                                     |
|   Test Management System — puts QA discipline into the data       |
|   model itself: "un ATC sin historia de usuario no puede existir" |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 1. Executive Summary

Bunkai is a multi-tenant **Test Management System (TMS)**, the commercial productization of the KATA (Component Action Test Architecture) methodology this very QA-engineering boilerplate is built on — the Jira ticket ID is the literal join key between the two products (`business-model.md` §Problem Statement). Its pitch, stated on its own public `/about` page, is a direct complaint about the category it competes in: *"Test management tools store documents. They don't teach how to test."* Bunkai's structural answer is to make traceability non-optional at the schema level rather than a feature you can skip — an Acceptance Test Case (ATC) cannot exist without being bound to an Acceptance Criterion, an Acceptance Criterion cannot exist without a User Story, and every Run and Bug carry their originating ATC forward rather than losing it the moment a defect crosses into an external tracker.

The product's core mechanic is **ATC reuse**: a QA engineer authors one Acceptance Test Case once, and any number of Tests (ordered ATC chains) can reference it. Editing the ATC propagates to every chaining Test — the product's own capability matrix marks this "listo" (shipped), and this discovery treats update-propagation correctness as the single highest-risk regression surface in the whole product (`business-model.md` §Value Propositions). Around that mechanic sits a full execution and defect lifecycle: Tests are composed from the ATC library, Runs execute them (manually, by an AI agent via a Personal Access Token, or from CI), each step gets a verdict, and a failed step can become a Bug in one click without re-typing what already happened.

Access is governed entirely by Postgres Row-Level Security keyed to a four-role hierarchy (`viewer < member < admin < owner`) inside a Workspace — the tenancy root. Revenue is a three-tier per-seat SaaS ladder (Community/Cloud/Enterprise) that is fully defined in code but **not yet wired to a payment processor** — billing today is a read-only usage overview, not a checkout flow (`business-model.md` §Revenue Streams). This asymmetry — rich, code-enforced product mechanics vs. an intentionally deferred commercial layer — is the most important shape to carry into any test plan: build QA depth around traceability, execution, and defect flows; do not test payment flows that do not exist yet.

```
        OWNER                    ADMIN                   MEMBER (QA Engineer)              VIEWER
   +----------------+     +------------------+     +---------------------------+     +------------------+
   | Governs the     |     | Runs QA process  |     | Authors Stories/ACs/ATCs, |     | Read-only: sees   |
   | tenant: creates  |     | day-to-day:      |     | composes Tests, executes  |     | coverage, run      |
   | the Workspace,   |     | members, invites,|     | Runs, files Bugs from a   |     | history, bug       |
   | sole leave-with- |     | workspace:admin  |     | failed step               |     | status — cannot    |
   | transfer role    |     | PATs             |     |                           |     | mutate anything    |
   +----------------+     +------------------+     +---------------------------+     +------------------+
   Value: accountable      Value: onboarding        Value: the actual QA loop —       Value: release-
   tenant control,          without owner              write once, reuse everywhere,    readiness visibility
   billing visibility       bottleneck                 lose no context on failure       without edit risk
```

*Source: `.context/business/business-model.md` (positioning, revenue), `.context/PRD/user-personas.md` (role definitions, permission matrix).*

---

## 2. Entity Map

The 28 entities documented exhaustively in `domain-glossary.md` §1 (full attribute tables, JSON examples, file citations) group into five subsystems. This map shows how they connect; it does not repeat their attributes.

```
 TENANCY                          AUTHORING                        TESTING / EXECUTION
 +-----------+                    +--------------+                 +------------------+
 | Workspace |--owns--+           | Module (tree)|--anchors--+     | Test             |
 +-----------+        |           +--------------+           |     | (ATC chain)      |
   |    |   \          |                  |                  |     +------------------+
   |    |    \         v                  v                  v          |    |
   |    |     \  +----------+     +--------------+   +--------------+   |    |
   |    |      \ | Project  |---->| UserStory    |-->| Atc          |<--+    |
   |    |       \+----------+     +--------------+   | (steps +     |        |
   |    |          |                    |            | assertions)  |        v
   |    |          v                    v            +--------------+   +---------+
   |    |   +-----------------+  +--------------------+     |          | Run     |
   |    |   | ProjectEnviron- |  | AcceptanceCriterion |     |          | (per    |
   |    |   | ment            |  +--------------------+     |          | Test x  |
   |    |   +-----------------+          ^                  |          | Env)    |
   |    |          ^                     |  (M:N via         |          +---------+
   |    |          |                     |   AtcAcceptance-  |            |    |
   |    |          |                     |   Criterion)      |            v    v
   |    |          +-- executed against -+-------------------+     +---------+ +---------+
   |    |                                                          | RunAtc  | |  ...    |
   |    |                                                          | (snap-  |
   |    |                                                          | shot)   |
   |    |                                                          +---------+
   |    |                                                               |
   |    |                                                               v
   |    |                                                          +---------+
   |    |                                                          | RunStep |
   |    |                                                          +---------+
   |    |                                                               |
   |    +----------------------- BUGS -------------------------------- +
   |                        +-----------+
   |                        |   Bug     |  (anchored to Module + ATC + Run + RunStep)
   |                        +-----------+
   |
   |   BILLING / ACCESS
   |   +-------------------+   +-----------------+   +----------------+   +-------------+
   +-->| WorkspaceMember   |   | AccessToken(PAT)|   | WorkspaceInvite|   | plan (enum) |
       | (role/status)     |   +-----------------+   +----------------+   | on Workspace|
       +-------------------+                                              +-------------+

   CROSS-CUTTING (not tenancy-owned, but workspace-scoped)
   Notification, NotificationPreference, ActivityLogEntry, FeatureFlag, IdempotencyKey,
   ImportJob (Jira), Milestone, UserViewState, MagicLinkToken
```

| Entity | Business Role | Why it exists |
|---|---|---|
| Workspace | Multi-tenant root | Every other row hangs off it; billing tier lives here |
| WorkspaceMember | User↔Workspace + role | The unit RLS keys every policy to |
| WorkspaceInvite | Pending role grant | Lets an admin/owner provision access without a shared password |
| Project | Container inside a Workspace | Groups Modules/Stories/ATCs/Runs/Bugs by product area |
| ProjectEnvironment | Named deploy target | What a Run actually executes against (e.g. Staging) |
| Module | Tree node (depth ≤ 6) | Coverage/defect rollups aggregate here; also the Jira-import routing target |
| UserStory | Requirement | Carries the Ready-to-Test gate; anchors ACs |
| AcceptanceCriterion | Atomic testable condition | What an ATC must bind to — no floating tests |
| Atc | Reusable test unit | The product's core IP: precondition + action + assertions, write-once |
| AtcStep / AtcAssertion | ATC internals | Ordered execution content for one ATC |
| AtcAcceptanceCriterion | ATC↔AC join | Enforces the "no orphan ATC" invariant (BR-003) |
| Test | Named ATC chain | "One-edit-many-tests" — the propagation surface |
| TestStep (chain step) | One chain position | Stable reorder handle, distinct from `atc_id` (same ATC can repeat) |
| Run | One Test execution | Comparable result regardless of executor (human/agent/CI) |
| RunAtc | Frozen chain-position snapshot | Later ATC edits never corrupt a Run's history |
| RunStep | Frozen per-step outcome | The actual pass/fail/blocked/skipped verdict |
| Bug | Native defect | Anchored to Module+ATC+Run+RunStep — never loses QA context |
| Milestone | Dated goal | Post-MVP grouping; Test Plan rollup not yet wired |
| ImportJob | Async Jira→Story import | Brings existing requirements in instead of re-authoring |
| AccessToken (PAT) | Bearer credential | Lets a CLI/AI agent act as a member, never beyond that member's own rights |
| MagicLinkToken | Passwordless login | Distinct credential family from PAT/invite |
| Notification / NotificationPreference | Event delivery + opt-in | In-app/email awareness of run/bug/mention events |
| ActivityLogEntry | Audit trail | Finer-grained `entity.verb` log, also the trigger source for notifications (see §6) |
| FeatureFlag | Global/workspace toggle | Progressive rollout mechanism |
| IdempotencyKey | Replay-safety ledger | Makes retried writes (e.g. flaky network) safe |
| UserViewState | Per-user UI state | e.g. persisted mind-map layout |

*Full attribute tables, JSON examples and `Found In` citations: `.context/business/domain-glossary.md` §1 and §4 (Mermaid `erDiagram`, 15 entity blocks).*

**Key relationships, narrated:**

1. **ATC reuse across Tests is the product's structural core.** An `Atc` is created once, mandatorily bound to ≥1 `AcceptanceCriterion` of its own `UserStory` (BR-003, enforced transactionally — no orphan-ATC window exists). Any number of `Test` rows can then chain that same `Atc` via `TestStep`, and the same `atc_id` may occupy multiple positions in the same chain. This is why `TestStep.id` (not `atc_id`) is the reorder handle — the join is many-to-many by design, not an oversight.
2. **Workspace is the tenancy root everything else answers to.** RLS policies chain back to `workspace_members.role` for every child table — Project, Module, Atc, Test, Run, Bug included. There is no app-layer role-check backstop on several routes; RLS *is* the authorization boundary, not a defense-in-depth layer on top of one (`domain-glossary.md` §3 Rule 1).
3. **Run snapshots (`RunAtc`/`RunStep`) intentionally decouple execution history from the live ATC.** Because an ATC can be edited after a Run that used it, the Run freezes the ATC's title/status at execution time. This is what lets "ATC update propagates to all chaining Tests" (value prop #1) coexist with "past Run results never silently change" — two guarantees that would otherwise conflict.

---

## 3. Business Flows

Flows 1–5 reuse the step tables, Mermaid diagrams, and evidence already fully mapped in `.context/PRD/user-journeys.md` — reproduced here as ASCII with citations, not re-derived. Flow 6 (Jira Import) was deliberately excluded from that document's 5-journey PRD cap (`user-journeys.md` §10 Discovery Gaps: "worth a dedicated follow-up journey") and is added here from a fresh spot-check of `lib/jira/import-runner.ts` + `app/api/v1/imports/route.ts` + `import-from-jira-dialog.tsx`.

### Flow 1 — Sign-Up & Workspace Onboarding

```
/login (sign in/up) --> has active workspace membership? --No--> /onboarding (create workspace)
                              |                                        |
                             Yes                                POST /api/v1/workspaces
                              |                                        |
                              v                                  success / slug conflict
                          /projects  <-----------------------------+
```

1. User authenticates via password, magic link, or GitHub/Google OAuth.
2. Server checks `workspace_members` for an active membership; zero → redirect to `/onboarding`.
3. User submits `{ name, slug }` (slug auto-derives from name, editable).
4. `POST /api/v1/workspaces` creates the Workspace + an active `owner`-role membership.
5. Redirect to `/projects`, now populated (empty) for the new tenant.

**Business rules**: BR-007 (creator becomes `owner`; `owner` is otherwise ungranted by invite — `functional-specs.md` FR-001). **Code**: `app/(auth)/login/page.tsx`, `app/(app)/onboarding/page.tsx` + `onboarding-form.tsx`, `app/page.tsx`.

### Flow 2 — Author a User Story and Anchor an ATC to It

```
Create User Story (title, Markdown, optional Jira key)
        |
        v
Add ordered Acceptance Criteria
        |
        v
Mark ready_to_test? --0 active AC--> blocked: ac_required_for_ready_to_test
        | >=1 active AC
        v
Story: ready_to_test
        |
        v
Create ATC (deep-linked to Story+AC) --p_ac_ids empty/foreign--> rejected: ac_outside_user_story
        | valid, non-empty, same-story ACs
        v
ATC created, anchored to AC (atomic — no orphan window)
```

**Business rules**: BR-004 (Story needs ≥1 active AC to reach `ready_to_test`, SQLSTATE `45010`); BR-003 (ATC needs ≥1 bound AC from its own Story, SQLSTATE `45020`). **Code**: `app/(app)/projects/[projectSlug]/user-story-form.tsx`, `app/(app)/projects/[projectSlug]/atcs/new/page.tsx`, `supabase/migrations/0017_acceptance_criteria_ordering.sql`, `0018_ready_to_test_gate_fn.sql`, `0021_atc_create_update.sql`.

### Flow 3 — Compose a Test Chain and Execute a Run

```
/tests/new — pick ATCs from WORKSPACE-wide library (not just this project)
        |
        v
Test created (ordered ATC chain, test_steps)
        |
        v
Test detail — "Start run" (pick Project Environment)
        |
        v
POST /api/v1/runs --> Runner view: running (realtime channel)
        |
        v
Mark each step: passed / failed / blocked / skipped (last-write-wins while running)
        |                                   |
        v                                   v
  Finish (verdict recomputed)        Abort (reason required)
        |                                   |
        +----------------> terminal status (passed/failed/aborted) <---+
```

**Business rules**: chain reorder addressed by `TestStep.id`, never `atc_id`; removing an Environment still referenced by a Run is blocked; marking on a closed Run is structurally rejected (SQLSTATE `45212`). **Code**: `app/(app)/projects/[projectSlug]/tests/new/page.tsx`, `components/tests/StartRunButton.tsx`, `components/runs/RunnerView.tsx`, `lib/runs/mark-step-view.ts`, `supabase/migrations/0024_tests.sql`, `0031_runs.sql`, `0036_run_abort.sql`, `0037_run_finish.sql`.

### Flow 4 — File a Bug from a Failed Run Step

```
Runner view — a step marked failed
        |
        v
canReportBug (member+) AND stepStatus === failed? --No--> button structurally absent
        | Yes
        v
Bug dialog pre-filled: title "<ATC title> failed", severity P3 default,
repro steps = executed step content, evidence pre-seeded (http/https only)
        |
        v
POST /api/v1/bugs --> server independently re-verifies step is still failed
        | (422 run_step_not_failed if not)
        v
Bug created: status = open, anchored to module+atc+run+run_step
        |
        v
open -> in_progress -> resolved -> closed   (forward-only, never backward, never skips)
```

**Business rules**: BR-005 (bug filing double-gated client+server to `failed` steps only); BR-002 (forward-only status, SQLSTATE `45310`/`45311`); evidence links capped at 10 (SQLSTATE `45303`). **Code**: `lib/runs/report-bug-view.ts`, `app/api/v1/bugs/route.ts`, `lib/bugs/errors.ts`, `supabase/migrations/0046_bugs.sql`, `0054_bug_assignment_status.sql`.

### Flow 5 — Invite and Onboard a Team Member

```
/workspaces/:id/members (admin/owner) — issue invite: email + role (never owner)
        |
        v
Invitee opens /invites/accept?token=... (may be signed out)
        |
        v
POST /api/v1/invites/accept
        |
        v
existing active membership at >= invited rank? --Yes--> rejected: reject_already_member
        | No
        v
Membership upserted at invited role --> redirect to next (default /projects)
```

**Business rules**: `workspace_invites.role` CHECK excludes `owner` (structurally impossible to invite at owner rank); accept never demotes an existing higher-or-equal-rank membership. **Code**: `app/(app)/workspaces/[id]/members/page.tsx`, `app/invites/accept/page.tsx`, `lib/workspaces/invites.ts` (`inviteAcceptAction`), `supabase/migrations/0010_workspace_invites.sql`.

### Flow 6 — Import User Stories from Jira (async, poll-based)

The headline customer-facing Jira feature (BK-17), distinct from this boilerplate's own dev-tooling `scripts/sync-jira-issues.ts`. Not covered in `user-journeys.md`'s 5 mapped flows — added here via a direct read of `lib/jira/import-runner.ts`, `app/api/v1/imports/route.ts`, and `import-from-jira-dialog.tsx`.

```
Project explorer — "Import from Jira" dialog: user enters a JQL string
        |
        v
POST /api/v1/imports { project_id, jql }   (member+ only, requires atc:write)
        |
        +-- another import already queued/running for this project? --Yes--> 409 import_in_progress
        |
        v (201 -> 202)
import_jobs row inserted (status=queued) --> after() background slot fires runImportJob(jobId)
        |
        v
Client polls GET /api/v1/imports/{id} every 2s
        |
        v
Worker atomically claims the job (queued->running, race-proof) and pages Jira by nextPageToken:
   for each issue:
     - ADF description -> Markdown (truncated at 50KB with a visible marker)
     - extract Acceptance Criteria from the Markdown body
     - resolve target Module: first matching Jira component name, else auto-created "Inbox"
     - upsert user_stories keyed on external_id (existing: update title/description only,
       leave module placement + status untouched; new: insert + route to Module)
     - reconcile acceptance_criteria: append only titles not already present (case-insensitive),
       never touch existing criteria text
     - per-issue failure --> appended to errors[], job continues (skipped_count++)
        |
        v
job reaches its last page / null cursor / 1000-page ceiling --> status=completed
        |                                                            |
   (any fatal error mid-run, e.g. Jira 401)                          v
        |                                                    stories now visible in the tree,
        v                                                    router.refresh() + toast
   status=failed (jira_unauthorized | job_failed), never left stuck "running"
```

**Business rules**:
- At most one active (`queued`/`running`) import per project — enforced by both a fast-path read check and a race-proof partial unique index (migration `0020`), so the client-visible 409 always matches DB-level truth.
- Import is idempotent per `external_id`: re-running the same JQL never duplicates a Story, and a manual module move survives re-import (module placement is untouched on update).
- Jira REST calls carry genuine exponential backoff honoring `Retry-After` on 429 — the only outbound-resilience pattern in the codebase (`architecture.md` §7).
- A missing/invalid Jira credential fails the Import Job (`jira_unauthorized`), never the app boot — `ATLASSIAN_URL`/`ATLASSIAN_EMAIL`/`ATLASSIAN_API_TOKEN` are all optional at the schema level (`infrastructure/backend.md`).

**Code**: `lib/jira/import-runner.ts` (full worker, `runImportJob`/`executeImport`/`importIssue`/`reconcileCriteria`), `lib/jira/client.ts` (`searchIssues`, backoff), `lib/jira/adf-to-markdown.ts`, `lib/jira/extract-acceptance-criteria.ts`, `app/api/v1/imports/route.ts` (enqueue, 202), `app/(app)/projects/[projectSlug]/import-from-jira-dialog.tsx` (2s poll UI).

**QA note**: this is the best candidate in the whole product for async/eventual-consistency test design — job-status polling, partial-failure handling (per-issue `errors[]` without failing the whole job), the one-active-import-per-project race, and idempotent re-import on `external_id` — none of that is simple request/response assertion (`business-model.md` §QA Relevance).

---

## 4. State Machines

All 6 `stateDiagram-v2` blocks are defined once, code-verified, in `.context/business/domain-glossary.md` §6 — cited here by reference rather than reproduced graphically a second time, per this skill's "never duplicate across files" rule. ASCII summaries + transition tables below add the "why" and business-rule linkage that the Mermaid blocks alone don't carry.

### 4.1 UserStory (`user_stories.status`) — Ready-to-Test gate

```
[*] --> draft --> ready_to_test
           ^______________|   (unmark, if permitted — Discovery Gap on the reverse guard)
```

| From | To | Trigger | Effects |
|---|---|---|---|
| — | `draft` | Story created | Default state; ACs may still be incomplete |
| `draft` | `ready_to_test` | "Mark ready to test" | Requires ≥1 active AC (SQLSTATE `45010` otherwise, BR-004) |
| `ready_to_test` | `draft` | "Unmark" | Reverse-transition permission gate not independently verified (`functional-specs.md` FR-003 edge case) |

Exactly two states, no intermediate — a gate, not a workflow.

### 4.2 Bug (`bugs.status`) — forward-only lifecycle

```
[*] --> open --> in_progress --> resolved --> closed
        (backward and stage-skipping rejected — no reverse arrows exist in the real system)
```

| From | To | Trigger | Effects |
|---|---|---|---|
| `open` | `in_progress` | "Start progress" | — |
| `in_progress` | `resolved` | "Mark resolved" | — |
| `resolved` | `closed` | "Close" | Terminal |
| any | earlier/same | (rejected) | SQLSTATE `45311`, no write |
| any | >1 stage ahead | (rejected) | SQLSTATE `45310`, no write |

BR-002. Enforced procedurally by `bunkai_transition_bug_status`, not a CHECK constraint — a reviewer, not the database schema, must hold this invariant on any new write path.

### 4.3 Run (`runs.status`) — run grain

```
[*] --> running --> passed
              \--> failed
              \--> aborted (reason required; run-grain-only, never appears at position grain)
```

| From | To | Trigger | Effects |
|---|---|---|---|
| — | `running` | Start run | Environment selected, ≥1 executable step; `run_atcs`/`run_steps` snapshot rows created (`pending`) |
| `running` | `passed` | Finish, all steps passed | Terminal |
| `running` | `failed` | Finish, ≥1 step failed | Terminal |
| `running` | `aborted` | Abort | `abort_reason` populated, terminal |

### 4.4 RunAtc / RunStep (position grain)

```
[*] --> pending --> passed / failed / blocked / skipped
        (aborted never appears here — run-grain-only terminal outcome)
```

| From | To | Trigger | Effects |
|---|---|---|---|
| `pending` | any of passed/failed/blocked/skipped | Mark step | Run must be `running`, caller not `viewer`; `failed` enables "Report bug" (Flow 4) |
| any mark | any other mark | Re-mark | Last-write-wins while `running`; structurally blocked once Run closes (SQLSTATE `45212`) |

### 4.5 ImportJob (`import_jobs.status`)

```
[*] --> queued --> running --> completed
                        \----> failed
```

| From | To | Trigger | Effects |
|---|---|---|---|
| `queued` | `running` | Worker claims job (atomic, race-proof) | `started_at` set |
| `running` | `completed` | Last page reached, cursor exhausted, or 1000-page ceiling hit | Stories/ACs upserted; per-issue errors may still be present |
| `running` | `failed` | Fatal error (e.g. Jira auth) | `errors[]` carries `jira_unauthorized`/`job_failed`; never left stuck `running` |

Newly narrated for this document — see Flow 6.

### 4.6 AtcStatus — execution-status display classification (not an enforced lifecycle)

```
[*] --> unrun --> running --> pass / fail / blocked / skipped
```

Written from the most recent Run's outcome, not walked through its own state machine — included for completeness, not a governed transition graph.

*Source for all 6: `.context/business/domain-glossary.md` §6. Business-rule cross-references: `.context/SRS/functional-specs.md` FR-003/FR-006/FR-007/FR-009.*

---

## 5. Automatic Processes

### Triggers (Postgres, confirmed by grep across `supabase/migrations/`)

| Trigger | Table | Fires | Function | Why it exists |
|---|---|---|---|---|
| `tests_set_updated_at` | `tests` | `before update` | `bunkai_set_updated_at()` | Auto-maintains `updated_at` without app-layer discipline |
| `bugs_set_updated_at` | `bugs` | `before update` | `bunkai_set_updated_at()` | Same pattern, Bug entity |
| `bugs_check_consistency` | `bugs` | `before insert or update` | `bunkai_bugs_check_consistency()` | Enforces cross-column invariants (e.g. anchor entities belong to the same project) at write time, not just at RPC-call time |
| `atcs_set_updated_at` | `atcs` | `before update` | `bunkai_set_updated_at()` | Same pattern, ATC entity |
| `atcs_refresh_tsv` | `atcs` | `before insert or update of title, tags` | `bunkai_atcs_refresh_tsv()` | Maintains a full-text-search vector so ATC search stays in sync with title/tag edits without an app-triggered reindex step |
| `activity_log_notify_bug_event` | `activity_log` | `after insert`, conditional (`when`) | (notification fan-out) | Turns a Bug-domain activity-log row into a `notifications` row for subscribed members — the mechanism behind Flow 4's "bug filed" awareness |
| `activity_log_notify_run_event` | `activity_log` | `after insert`, conditional (`when`) | (notification fan-out) | Same pattern for Run lifecycle events (start/finish/abort) — backs Flow 3 |
| `notification_preferences_set_updated_at` | `notification_preferences` | `before update` | `bunkai_set_updated_at()` | Same housekeeping pattern |
| `runs_set_updated_at` | `runs` | `before update` | `bunkai_set_updated_at()` | Same housekeeping pattern |
| `milestones_set_updated_at` | `milestones` | `before update` | `bunkai_set_updated_at()` | Same housekeeping pattern |

Business-invariant enforcement itself (the "no orphan ATC" rule, the Bug forward-only lifecycle, the Ready-to-Test gate) lives in the `bunkai_*` **RPC functions** called explicitly from `lib/<domain>/errors.ts`, not in triggers — see `.context/SRS/architecture.md` §5 RPC inventory for that catalog; this table only covers genuine `CREATE TRIGGER` definitions, which are narrower and mostly either housekeeping (`updated_at`) or the notification fan-out from `activity_log` insert.

### Cron jobs

| Job | Schedule | Why |
|---|---|---|
| — none found — | — | No `vercel.json` exists in the target repo (confirmed absent by glob), and no `cron`/`schedule` string appears in any config file. Per `.context/SRS/architecture.md` §7 and this pass's own check, Bunkai has zero scheduled background work — the only asynchronous processing is the Jira Import worker (Flow 6), which is **request-triggered** (`after()`, fired once per `POST /api/v1/imports`), not time-triggered. |

### Incoming webhooks

| Webhook | Source | Why |
|---|---|---|
| — none found — | — | `grep -i webhook` across the target repo's `.ts`/`.tsx` files returns no matches. The Jira integration is strictly **pull-based** — Bunkai polls Jira via `searchIssues()` inside the Import Job worker; Jira never pushes into Bunkai. No Stripe/payment webhook exists either (consistent with `business-model.md`'s finding that billing has no payment processor wired). |

---

## 6. External Integrations

### Supabase

```
   Bunkai (Next.js app)
        |
        |--- lib/supabase/client.ts  (browser, RLS-scoped) -----+
        |--- lib/supabase/server.ts  (SSR cookie session) ------+---> Postgres 16
        |--- lib/supabase/admin.ts   (service-role, bypasses RLS, --> (single project,
        |     used ONLY for idempotency ledger + PAT-secret writes)   fmbpikzpkafptqximhxn,
        |--- lib/supabase/rpc.ts     (typed bunkai_* RPC caller) ---> shared across
        |                                                              local/staging/prod)
        +--- Supabase Auth (password / magic-link / GitHub+Google OAuth; issues session JWT)
        +--- Supabase Realtime (WebSocket; RunnerView subscribes to the run channel for live step updates)
```

**What it does**: sole database, sole auth provider, sole tenancy-isolation mechanism (RLS), and the live-update channel for Flow 3's Runner view. **Which flows depend on it**: all six flows in §3 — there is no flow in this product that does not ultimately read/write through this one Supabase project. **Single-shared-project caveat**: local, staging, and production all point at the same Supabase project (`architecture.md` §11, `infrastructure/backend.md`) — there is no environment-level data isolation; every automated test that mutates data must be strictly workspace-scoped and cleanup-aware, in every environment including local dev.

*Source: `.context/SRS/architecture.md` §7 External Services, §8 Security Architecture; `.context/infrastructure/backend.md` Database Configuration.*

### Vercel

Hosting + zero-config Git-integrated deploy (no `vercel.json`), and the execution host for the Jira Import worker's `after()` background slot (Vercel Fluid Compute) — the mechanism that lets `POST /api/v1/imports` return 202 immediately while the actual page-through-Jira work continues after the response is flushed (Flow 6). No cron/scheduled functions are configured on this host (§5).

*Source: `.context/SRS/architecture.md` §7; `.context/business/business-model.md` §Key Partners.*

### Atlassian Jira — two distinct roles, do not conflate

```
   Customer-facing product feature                    This boilerplate's own dev tooling
   (Flow 6 in this document)                           (unrelated to the Bunkai product)
   +---------------------------+                        +------------------------------+
   | lib/jira/import-runner.ts |  Bunkai polls the       | scripts/sync-jira-issues.ts   |
   | lib/jira/client.ts        |  CUSTOMER's own Jira    | (this repo's own AI-workflow   |
   | app/api/v1/imports/*      |  via JQL, pulls issues  | sync of Bunkai's OWN backlog   |
   +---------------------------+  into their Workspace   | into .context/PBI/)           |
                                                          +------------------------------+
```

The product feature (left) authenticates with `ATLASSIAN_URL`/`ATLASSIAN_EMAIL`/`ATLASSIAN_API_TOKEN` — all optional at the schema level; a missing/invalid credential fails the Import Job (`jira_unauthorized`), never the app boot. It is strictly outbound/pull (Bunkai calls Jira; Jira never calls Bunkai) and is the only outbound call in the codebase with genuine retry/backoff (honors `Retry-After` on 429).

*Source: `.context/SRS/architecture.md` §7, §9; this document's own Flow 6 spot-check of `lib/jira/import-runner.ts`.*

### GitHub / Google (OAuth)

Sign-in identity providers only (`lib/auth/oauth.ts`, `OAUTH_PROVIDERS = ['github', 'google']`) — feeds into Flow 1, not a separate data-flow integration.

*Source: `.context/business/business-model.md` §Key Partners.*

### Confirmed absent

No payment processor (Stripe/PayPal — no billing SDK in `package.json`), no email-delivery vendor (Resend/SendGrid — declared in `.env.example` but unwired to app code), no APM/observability SDK, no queue/worker system, no Redis/cache service beyond an in-process 60s TTL memo on the Home dashboard rollup. Confirmed by dependency-list read, not assumed (`architecture.md` §7, §9).

---

## 7. Discovery Gaps

Carried forward from upstream discovery where they materially affect how these flows behave, plus this document's own:

- **Single shared Supabase project across local/staging/production** (HIGH risk, `architecture.md` §11): every flow in §3 behaves identically in shape across environments, but there is no environment-level data isolation — a bug in test cleanup in one environment can pollute another. This is the single fact most likely to bite an automated-test suite built against this data map.
- **No CI/CD gate exists** (`architecture.md` §11, `infrastructure/backend.md`): 145+ co-located `.test.ts` files exist repo-wide but nothing runs them automatically — `bun test` is wired into no script, no Husky hook, no workflow. Do not assume any flow above is regression-protected by an automated gate today.
- **RPC authorization invariant (ADR-0012)** — cited by multiple domain error-mappers across Flows 2–5 but the ADR file itself was not opened in this pass; worth reading before writing any RPC-adjacent negative-authorization test (`architecture.md` §11).
- **`run_abort` / `run_finish` exact RPC error-code range** (Flow 3, §4.3) — migrations `0036`/`0037` were cited but not opened directly in any upstream pass; the Run-grain SQLSTATE range was not enumerated the way Bug/ATC ranges were.
- **Jira Import module-routing edge cases not independently verified in this pass**: what happens when an issue has multiple matching component names (first match wins per code, but tie-break order not stress-tested), and whether `reconcileCriteria`'s case-insensitive de-dupe against title text alone can silently merge two distinct-but-similarly-worded criteria on re-import.
- **Billing/payment collection is designed in code but not wired** (`business-model.md` §Revenue Streams, carried forward because it affects Flow interpretation): do not write test plans against a checkout/invoice flow — none exists yet (tracked as a future story, `BK-231`).
- **Trigger inventory in §5 is a grep-confirmed floor, not a ceiling**: the 10 `CREATE TRIGGER` statements found are all `bunkai_*`-prefixed and migration-scoped; a `RETURNS trigger`-style function defined but never attached via `CREATE TRIGGER` (if any exists) would not surface in this pass's grep and was not separately searched for.
- **Estimated usage distribution across the 4 roles** is unknown — no telemetry exists (`user-personas.md` §8), so §1's actor diagram is qualitative, not weighted by actual usage.

---

*Business Data Map complete. Next: `/master-test-plan` (reads this file — hard requirement) and, optionally, `/business-feature-map` (feature catalog / CRUD matrix, out of scope here per this skill's doctrine).*
