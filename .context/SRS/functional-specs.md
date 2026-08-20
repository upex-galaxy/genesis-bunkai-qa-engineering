# Functional Specifications — Bunkai (upex-bunkai-tms)

> Discovery performed against `C:\Users\Genesis Ojose\Documents\Auto\Dojo 4\upex-bunkai-tms` (read-only). FR entries below are derived from the route-handler + domain-module + RPC triad described in `architecture.md` §1, for the 5 critical flows already mapped in `.context/PRD/user-journeys.md`. State machines and enumerations reuse `.context/business/domain-glossary.md` §2/§6 by citation — not rebuilt here. Business rules already numbered BR-001 through BR-006 (with full Given/When/Then) in `domain-glossary.md` §3 are cross-referenced by that numbering; only rules not already covered there receive new BR IDs.

---

## Specification Index

| FR | Feature | Category | Priority | Journey |
|---|---|---|---|---|
| FR-001 | Create Workspace (onboarding) | Workspace | P0 | Journey 1 |
| FR-002 | Create User Story | Authoring | P0 | Journey 2 |
| FR-003 | Mark User Story `ready_to_test` | Authoring / Gate | P0 | Journey 2 |
| FR-004 | Create ATC anchored to Acceptance Criteria | Authoring | P0 | Journey 2 |
| FR-005 | Compose a Test (ATC chain) | Test Composition | P1 | Journey 3 |
| FR-006 | Start a Run | Execution | P0 | Journey 3 |
| FR-007 | Mark a Run Step | Execution | P0 | Journey 3 |
| FR-008 | File a Bug from a Failed Step | Defect Capture | P0 | Journey 4 |
| FR-009 | Transition Bug Status | Defect Lifecycle | P1 | Journey 4 |
| FR-010 | Issue a Workspace Invite | Team Management | P1 | Journey 5 |
| FR-011 | Accept a Workspace Invite | Team Management | P0 | Journey 5 |

---

## FR-001: Create Workspace (Onboarding)

| Field | Value |
|---|---|
| **Related PRD section** | `.context/PRD/user-journeys.md` §2, Journey 1 |
| **Route** | `POST /api/v1/workspaces` |
| **UI entry** | `app/(app)/onboarding/onboarding-form.tsx` |
| **Auth posture** | `authenticated` (no capability — a signed-in user with zero memberships may always create their first workspace) |
| **Evidence** | `app/(app)/onboarding/onboarding-form.tsx:59-110`, `app/(app)/onboarding/page.tsx:14-24` |

**Functional Requirement**: A signed-in user with zero active workspace memberships must be able to create a new Workspace by supplying a name (slug auto-derived, editable), becoming its `owner`.

### Input Specification

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Workspace display name |
| `slug` | string | yes (auto-derived from `name`, user-editable) | URL-safe identifier |

### Validation Rules

| Rule | Evidence |
|---|---|
| Name must not be empty — client-side toast `"Enter a workspace name."`, focuses field | `onboarding-form.tsx:76-79` |
| Slug must match `SLUG_REGEX` (at least 3 letters/digits) — toast `"Use at least 3 letters or digits — they become the URL slug."` | `onboarding-form.tsx:81-84` |
| Slug must be unique — server-side 409, mapped to toast `"Slug \"<slug>\" is taken — try another."` | `onboarding-form.tsx:97-98` |

### Processing Logic

1. User authenticates (`/login`) — any method (password/magic-link/OAuth).
2. Server checks `workspace_members` for an active membership on the landing page (`/projects`); zero memberships redirects to `/onboarding`.
3. User submits `{ slug, name }`.
4. `POST /api/v1/workspaces` creates the Workspace row and an active `workspace_members` row with `role = owner`.
5. On 2xx, client redirects to `/projects`.

Evidence: `onboarding-form.tsx:89-110`.

### Output Specification

| Outcome | Response |
|---|---|
| Success | 2xx, Workspace created, redirect to `/projects` |
| Slug conflict | 409 `conflict`, friendly toast (not raw API error) |
| Network error | Toast shows caught error message or `"Network error."` |

### Business Rules

| BR | Rule | Cross-ref |
|---|---|---|
| BR-007 | The creating user becomes `owner` of exactly the one Workspace they create at onboarding — `owner` is otherwise ungranted by invite (see FR-010) | `.context/PRD/user-journeys.md` §2; `.context/business/domain-glossary.md` §2 (`workspace_invites.role` CHECK excludes `owner`) |

### Edge Cases

| Case | Expected Behavior | Evidence |
|---|---|---|
| Duplicate slug submitted twice in a race | Second request 409s, first wins | `onboarding-form.tsx:97-98` (client handling only; server-side race resolution not independently verified — Discovery Gap) |
| User already has an active membership, hits `/onboarding` directly | Not explicitly re-verified in this pass — the guard is enforced on the `/projects`/`/home` redirect path, not confirmed idempotent if `/onboarding` is visited directly by an already-onboarded user | Discovery Gap |

---

## FR-002: Create User Story

| Field | Value |
|---|---|
| **Related PRD section** | `.context/PRD/user-journeys.md` §3, Journey 2 |
| **Route** | `POST /api/v1/user-stories` (project-scoped) or flat mutate route |
| **UI entry** | `app/(app)/projects/[projectSlug]/user-story-form.tsx` |
| **Domain module** | `lib/user-stories/errors.ts` |
| **Evidence** | `user-story-form.tsx:130-188`, `lib/user-stories/errors.ts:1-33` |

**Functional Requirement**: A `member`+ user must be able to create a User Story with a title, optional Markdown description, and an optional Jira key, defaulting to `draft` status.

### Input Specification

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | 3–200 chars |
| `description` | string (Markdown) | no | Free text |
| `external_id` (Jira key) | string | no | e.g. `BK-42`; once set, immutable via UI ("locked" hint) |
| `module_id` | uuid | yes | Story anchors to a Module |

### Validation Rules

| Rule | Error message | Evidence |
|---|---|---|
| Title required | `"Title is required."` | `lib/user-stories/errors.ts:24-25` |
| Title ≥ 3 chars | `"Title must be at least 3 characters."` | `lib/user-stories/errors.ts:26-27` |
| Title ≤ 200 chars | `"Title must be at most 200 characters."` | `lib/user-stories/errors.ts:28-29` |
| `external_id` unique per project (partial unique index) | `"This Jira issue is already linked to a story in this project."` (23505) | `lib/user-stories/errors.ts:9-13` |
| Caller must be a project member | `"You must be a member of this project."` (RLS 42501) | `lib/user-stories/errors.ts:14-18` |

### Processing Logic

1. User opens "New user story" form from the project explorer.
2. Submits Title (required, 3–200 chars), Description (optional Markdown), Jira key (optional).
3. Write goes through `mapStoryWriteError()` on failure; success creates the row in `draft` status.

Evidence: `user-story-form.tsx:130-188`; `lib/user-stories/errors.ts`.

### Output Specification

| Outcome | Response |
|---|---|
| Success | Story row created, `status = draft` |
| Duplicate Jira key in project | 409 `conflict`, `reason: external_id_duplicate` |
| Not a project member | 403 `forbidden`, `reason: not_a_member` |

### Business Rules

Cross-references domain-glossary.md §3 rule "A User Story cannot be marked `ready_to_test` with zero active Acceptance Criteria" (see FR-003) — creation itself carries no such gate; only the status transition does.

### Edge Cases

| Case | Expected Behavior | Evidence |
|---|---|---|
| Title exactly 3 or exactly 200 chars (boundary) | Accepted (bounds are inclusive per the mirrored client/RPC bound check) | `lib/user-stories/errors.ts:22-33` — exact inclusivity not independently confirmed by a boundary test in this pass; flagged as BVA candidate |
| Jira key set, then edit attempted | UI shows "locked" hint — the Jira link cannot be changed once set | `user-story-form.tsx` (per field table, "locked hint") |

---

## FR-003: Mark User Story `ready_to_test`

| Field | Value |
|---|---|
| **Related PRD section** | `.context/PRD/user-journeys.md` §3, Journey 2 |
| **RPC** | `bunkai_set_user_story_status` |
| **Evidence** | `supabase/migrations/0018_ready_to_test_gate_fn.sql:47-52` (per domain-glossary §3) |

**Functional Requirement**: A User Story may transition `draft → ready_to_test` only when it has at least one non-archived Acceptance Criterion.

### Validation Rules

| Rule | Error | Evidence |
|---|---|---|
| ≥1 active AC required for `ready_to_test` | SQLSTATE `45010`, exception code `ac_required_for_ready_to_test` | `.context/business/domain-glossary.md` §3, Rule "A User Story cannot be marked ready_to_test with zero active Acceptance Criteria" (= **BR-004** in that document's own numbering — cross-referenced here, not renumbered) |

### Processing Logic

1. User adds ≥1 orderable Acceptance Criterion to a `draft` Story.
2. User requests `status = ready_to_test`.
3. RPC counts active (non-archived) ACs; zero → reject with `45010`; ≥1 → transition succeeds.

### State Machine

Reuses `.context/business/domain-glossary.md` §6 "UserStory (`user_stories.status`) — Ready-to-Test gate" `stateDiagram-v2` verbatim (2 states, no intermediate).

| From | To | Trigger | Guard | Side Effects |
|---|---|---|---|---|
| `draft` | `ready_to_test` | "Mark ready to test" action | ≥1 active AC (SQLSTATE `45010` otherwise) | ATC authoring becomes semantically meaningful against this Story (no DB-level gate blocks ATC creation on story status, but see FR-004's own AC-anchoring rule) |
| `ready_to_test` | `draft` | "Unmark" (if permitted) | Not independently verified — role/permission gate on the reverse transition not read in this pass | Discovery Gap |

### Edge Cases

| Case | Expected Behavior | Evidence |
|---|---|---|
| All ACs archived, zero active remain, story already `ready_to_test` | Not verified whether the story is force-reverted or stays `ready_to_test` with stale ACs — the gate is confirmed only on the forward transition | Discovery Gap |
| Exactly 1 active AC (boundary) | Transition succeeds — boundary is inclusive (`>= 1`) | `.context/business/domain-glossary.md` §3 |

---

## FR-004: Create ATC Anchored to Acceptance Criteria

| Field | Value |
|---|---|
| **Related PRD section** | `.context/PRD/user-journeys.md` §3, Journey 2 |
| **Route** | `POST /api/v1/atcs` |
| **RPC** | `bunkai_create_atc` |
| **UI entry** | `app/(app)/projects/[projectSlug]/atcs/new/page.tsx` |
| **Evidence** | `supabase/migrations/0021_atc_create_update.sql:158-168,295-305`, `lib/atcs/errors.ts:1-54` |

**Functional Requirement**: An ATC cannot be created without `p_ac_ids` being a non-empty array whose every element belongs to the ATC's own User Story.

### Input Specification

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | |
| `layer` | enum | yes | `UI` \| `API` \| `Unit` — see `domain-glossary.md` §2 `AtcLayer` |
| `module_id` | uuid | yes | Must be the Story's own module or a descendant in the same project |
| `user_story_id` | uuid | yes | |
| `p_ac_ids` | uuid[] | yes, non-empty | Every id must belong to `user_story_id`'s own ACs |
| `steps` | ordered array | yes (≥1 implied by ATC semantics — not independently re-verified) | content, optional input_data, expected |
| `assertions` | ordered array | recommended | |
| `tags` | string[] | no | Max 10 (client Zod `.max(MAX_ATC_TAGS)` primary; RPC `45024` backstop) |

### Validation Rules

| Rule | SQLSTATE / error | Evidence |
|---|---|---|
| `p_ac_ids` non-empty | `45020` — `"Every acceptance criterion must belong to the given user story."` | `lib/atcs/errors.ts:16-19` |
| Every AC id belongs to the target Story | same `45020` | ditto |
| Module must be the Story's module or a descendant in the same project | `45021` | `lib/atcs/errors.ts:20-23` |
| Caller must be a workspace member with write access | `42501` → `forbidden` | `lib/atcs/errors.ts:8-11` |
| Tags ≤ 10 | `45024` (RPC backstop; Zod is primary) | `lib/atcs/errors.ts:43-50` |
| Slug uniqueness per project | `23505` → `slug_collision`, auto-retry | `lib/atcs/errors.ts:39-42` |

### Processing Logic

1. User clicks "Create ATC" deep-link (`?story=<id>&ac=<id>`) from the explorer or Story detail — pre-anchors the new-ATC form.
2. ATC editor pre-selects the Story/AC from the deep-link query params.
3. User fills steps + assertions.
4. Submits with `p_ac_ids` non-empty, all belonging to the Story.
5. `bunkai_create_atc` validates atomically; on success writes the ATC row + `atc_acceptance_criteria` link rows in the same transaction — no orphan-ATC window exists.

Evidence: `app/(app)/projects/[projectSlug]/atcs/new/page.tsx:79-88`; `.context/PRD/user-journeys.md` §3.

### Output Specification

| Outcome | Response |
|---|---|
| Success | 2xx, ATC row + AC links created |
| Empty or foreign `p_ac_ids` | 422 `ac_outside_user_story` |
| Foreign module | 422 `module_outside_project_subtree` |
| Duplicate slug | 409 `slug_collision` (client auto-retries with a new slug) |

### Business Rules

| BR | Rule | Cross-ref |
|---|---|---|
| BR-003 | An ATC cannot exist without at least one bound Acceptance Criterion (no orphan ATCs) | `.context/business/domain-glossary.md` §3 — reused verbatim, this document's own BR-003 numbering preserved |

### Edge Cases

| Case | Expected Behavior | Evidence |
|---|---|---|
| Deep-link points at a foreign/stale story or AC id | Silently ignored — `initialStoryId`/`initialAcIds` only resolve against RLS-narrowed, in-project data; falls back to an empty picker, not an error | `app/(app)/projects/[projectSlug]/atcs/new/page.tsx:79-88` |
| `p_ac_ids` contains exactly 1 valid AC (boundary of "non-empty") | Accepted | `supabase/migrations/0021_atc_create_update.sql:158-168` |
| Tags array at exactly 10 (boundary) | Accepted; 11th rejected client-side, RPC backstop only fires for a caller that skips the route (e.g. direct PostgREST) | `lib/atcs/errors.ts:43-50` |

---

## FR-005: Compose a Test (ATC Chain)

| Field | Value |
|---|---|
| **Related PRD section** | `.context/PRD/user-journeys.md` §4, Journey 3 |
| **Route** | Test builder (`NewTestBuilder`) → `tests` + `test_steps` insert |
| **UI entry** | `app/(app)/projects/[projectSlug]/tests/new/page.tsx` |
| **Evidence** | `app/(app)/projects/[projectSlug]/tests/new/page.tsx:42-63`, `supabase/migrations/0024_tests.sql` |

**Functional Requirement**: A `member`+ user must be able to assemble an ordered chain of ATCs — pulled from the entire workspace's ATC library, not just the current project — into a named, reusable Test.

### Input Specification

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | |
| `tags` | string[] | no | Free text; reserved subset `smoke`/`sanity`/`regression` case-normalized (per `domain-glossary.md` §2) |
| `chain` | ordered array of `{ atc_id }` | yes, non-empty | Same `atc_id` may repeat at multiple positions |

### Validation Rules

| Rule | Evidence |
|---|---|
| Tests are workspace-scoped, ATCs are project-scoped — the picker deliberately spans the whole workspace | `tests/new/page.tsx:42-63` (comment: "Tests are WORKSPACE-scoped while ATCs are project-scoped") |
| Chain reorder addresses rows by the surrogate `test_steps.id`, never by `atc_id` | `.context/business/domain-glossary.md` §3 "Additional rules" table |
| An empty chain is rejected | `CHAIN_EMPTY` error code exists in the API error envelope | `lib/api/error-envelope.ts:38` (`CHAIN_EMPTY: 'chain_empty'`) |
| Reorder submission must match the Test's exact step set | `CHAIN_MISMATCH` (`details.missing`/`details.extra`) or `CHAIN_INVALID` (empty or duplicate step ids) | `lib/api/error-envelope.ts:40-44` |

### Processing Logic

1. User picks ATCs from the workspace-wide, non-archived ATC library.
2. `NewTestBuilder` submits the ordered chain.
3. Server writes `tests` row + `test_steps` rows (one per chain position).

### Output Specification

| Outcome | Response |
|---|---|
| Success | Test created with its ordered ATC chain |
| Empty chain | `chain_empty` |
| Reorder desyncs from actual step set | `chain_mismatch` / `chain_invalid` |

### Edge Cases

| Case | Expected Behavior | Evidence |
|---|---|---|
| Same ATC selected twice in the chain | Allowed — each occupies its own `test_steps.id` position | `.context/business/domain-glossary.md` §1 (`TestStep` entity note) |
| Chain of exactly 1 ATC (boundary of non-empty) | Accepted | Inferred from `chain_empty` being the only floor-guard found; not independently boundary-tested in this pass |

---

## FR-006: Start a Run

| Field | Value |
|---|---|
| **Related PRD section** | `.context/PRD/user-journeys.md` §4, Journey 3 |
| **Route** | `POST /api/v1/runs` |
| **UI entry** | `components/tests/StartRunButton.tsx` |
| **Evidence** | `components/tests/StartRunButton.tsx:57,132`, `lib/api/error-envelope.ts:47-50` |

**Functional Requirement**: Starting a Run requires the caller to pick a Project Environment, and the Test must have at least one executable step.

### Validation Rules

| Rule | Error | Evidence |
|---|---|---|
| Test must have ≥1 executable step | `no_executable_steps` (422) | `lib/api/error-envelope.ts:49` |
| Chosen environment must belong to the Test's Project | `environment_invalid` (422) | `lib/api/error-envelope.ts:50` |

### Processing Logic

1. From `/tests/[testId]`, user clicks "Start run" in the header, picks an environment.
2. `POST /api/v1/runs` creates the Run (`status = running`) plus snapshot `run_atcs` rows (freezing ATC title/status at run time) and `run_steps` rows (`status = pending`).
3. Runner view opens; realtime channel subscribed for live updates.

Evidence: `.context/PRD/user-journeys.md` §4 step table; `.context/business/domain-glossary.md` §1 (`RunAtc` snapshot rationale).

### State Machine

Reuses `.context/business/domain-glossary.md` §6 "Run (`runs.status`) — run grain" `stateDiagram-v2`.

| From | To | Trigger | Guard | Side Effects |
|---|---|---|---|---|
| — | `running` | Start run | Environment selected, ≥1 executable step | `run_atcs`/`run_steps` snapshot rows created, all `pending` |
| `running` | `passed` | Finish (all steps passed) | Verdict recomputed from step statuses | Run reaches terminal state |
| `running` | `failed` | Finish (≥1 step failed) | ditto | Terminal |
| `running` | `aborted` | Abort | Reason required | Terminal; `abort_reason` populated |

### Edge Cases

| Case | Expected Behavior | Evidence |
|---|---|---|
| Removing an Environment still referenced by a Run | Blocked, preserving run history | `.context/business/domain-glossary.md` §3 "Additional rules" table |
| Test with 0 executable steps | Run start rejected `no_executable_steps` | `lib/api/error-envelope.ts:49` |

---

## FR-007: Mark a Run Step

| Field | Value |
|---|---|
| **Related PRD section** | `.context/PRD/user-journeys.md` §4, Journey 3 |
| **Route** | `POST /api/v1/runs/[id]/steps/[stepId]/mark` |
| **Domain module** | `lib/runs/mark-step-view.ts` |
| **Evidence** | `lib/runs/mark-step-view.ts:16-189` |

**Functional Requirement**: A `member`+ actor may mark a Run Step `passed`/`failed`/`blocked`/`skipped` while the Run is `running`; marking is last-write-wins (re-marking always allowed) and structurally blocked once the Run is closed.

### Input Specification

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | enum | yes | `passed` \| `failed` \| `blocked` \| `skipped` (never `aborted` — run-grain only) |
| `note` | string | no | Max length enforced (`N` not captured in this pass as a literal constant — see Discovery Gaps) |
| `evidence_url` | string (URL) | no | Must be http(s); length-bounded |

### Validation Rules

| Rule | Error | Evidence |
|---|---|---|
| Run must not be closed | `"This run is already closed and cannot accept new step results."` (also RPC SQLSTATE `45212`) | `lib/runs/mark-step-view.ts:22-26` |
| Caller must not be `viewer` | Controls structurally absent (`showControls: false`), not merely disabled | `lib/runs/mark-step-view.ts:67-68` |
| Note length bound | `"Note must be at most <N> characters."` | `lib/runs/mark-step-view.ts:176-178` |
| Evidence link must be http(s) | `"Evidence link must be a valid URL."` | `lib/runs/mark-step-view.ts:184-186` |
| Evidence link length bound | `"Evidence link must be at most <N> characters."` | `lib/runs/mark-step-view.ts:187-189` |

### State Machine

Reuses `.context/business/domain-glossary.md` §6 "RunAtc / RunStep — position grain" `stateDiagram-v2`.

| From | To | Trigger | Guard | Side Effects |
|---|---|---|---|---|
| `pending` | `passed`/`failed`/`blocked`/`skipped` | Mark step | Run must be `running`, caller not `viewer` | Enables "Report bug" affordance when `status = failed` (see FR-008) |
| any terminal mark | any other mark | Re-mark | Run still `running` | Last-write-wins, overwrites prior verdict |

Note: `aborted` never appears at this grain — run-grain-only terminal outcome (`domain-glossary.md` §6).

### Edge Cases

| Case | Expected Behavior | Evidence |
|---|---|---|
| Marking a step after the run just finished (race) | Frozen guard copy shown, mark rejected | `lib/runs/mark-step-view.ts:22-26` |
| Note at exactly the max length (boundary) | Accepted — boundary not independently confirmed inclusive/exclusive | Discovery Gap (literal `N` not read) |

---

## FR-008: File a Bug from a Failed Step

| Field | Value |
|---|---|
| **Related PRD section** | `.context/PRD/user-journeys.md` §5, Journey 4 |
| **Route** | `POST /api/v1/bugs` |
| **RPC** | `bunkai_create_bug` |
| **Domain module** | `lib/runs/report-bug-view.ts`, `lib/bugs/errors.ts` |
| **Evidence** | `lib/runs/report-bug-view.ts:14-76`, `app/api/v1/bugs/route.ts`, `lib/bugs/errors.ts:1-134` |

**Functional Requirement**: A `member`+ actor may file a Bug only from a step whose status is (still, independently re-verified server-side) `failed`; the Bug is pre-filled with title, default severity `P3`, repro steps, and evidence, and anchored to Module + ATC + Run + Run Step.

### Input Specification

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | Pre-filled `"<ATC title> failed"`, editable; 5–200 chars |
| `severity` | enum | yes | `P1`\|`P2`\|`P3`\|`P4`, default `P3` |
| `steps_to_reproduce` | string | yes | Pre-filled from the executed step's content |
| `evidence_urls` | string[] | no | Max 10; pre-seeded from the step's evidence URL only if it passes `isHttpUrl` |
| `module_id`, `atc_id`, `run_id`, `run_step_id` | uuid | implicit from context | Anchors |

### Validation Rules

| Rule | Error / SQLSTATE | Evidence |
|---|---|---|
| Step must be (re-verified) `failed` at submit time | `run_step_not_failed` (422) — independent server-side re-check even though the client button already gated it | `lib/runs/report-bug-view.ts:14-17` |
| Title 5–200 chars | `45301` → `"Title must be between 5 and 200 characters."` | `lib/bugs/errors.ts:103-109` |
| Severity ∈ {P1,P2,P3,P4} | `45302` → `"Severity must be one of P1, P2, P3, or P4."` | `lib/bugs/errors.ts:110-113` |
| Evidence links ≤ 10 | `45303` → `"Evidence links cannot exceed 10."` | `lib/bugs/errors.ts:114-117` |
| Module must belong to current project | `45300` | `lib/bugs/errors.ts:85-88` |
| Run must belong to current project | `45305` (non-disclosing — never confirms whether `p_run_id` exists at all) | `lib/bugs/errors.ts:89-94` |
| Run step must belong to current run | `45306` | `lib/bugs/errors.ts:95-98` |
| ATC must belong to current project | `45307` | `lib/bugs/errors.ts:99-102` |
| Caller must be workspace member with write access | `42501` → `forbidden` | `lib/bugs/errors.ts:25-28` |

### Processing Logic

1. A step is marked `failed` in the Runner view.
2. `shouldShowReportBugButton` gates the "Report bug" affordance to `member`+ and `status === failed`.
3. Bug dialog opens pre-filled (title, `P3` severity, repro steps from the step content, evidence from the step's own evidence URL if it passes the http(s) gate — a legacy non-http(s) stored URL is silently dropped from prefill rather than seeding an unusable value, BK-500).
4. User may edit any field, submits.
5. `POST /api/v1/bugs` independently re-verifies the step is `failed` server-side.
6. `bunkai_create_bug` writes the Bug row, `status = open`, anchored to module/ATC/run/run_step.

Evidence: `lib/runs/report-bug-view.ts` (full logic read); `.context/PRD/user-journeys.md` §5.

### Output Specification

| Outcome | Response |
|---|---|
| Success | 201, Bug created `status = open` |
| Step not actually failed | 422 `run_step_not_failed` |
| Any anchor entity outside project/run | 422, entity-specific code (see Validation Rules) |

### Business Rules

| BR | Rule | Cross-ref |
|---|---|---|
| BR-005 (new, not previously in domain-glossary Given/When/Then set) | Bug filing is gated to `failed`-status steps only, enforced independently client- and server-side (defense in depth against a stale client) | `lib/runs/report-bug-view.ts:14-17` |
| — | Bug evidence links capped at 10 | `.context/business/domain-glossary.md` §3 "Additional rules" table — reused |

### Edge Cases

| Case | Expected Behavior | Evidence |
|---|---|---|
| Step re-marked `passed` between button-render and dialog-submit | Server 422s `run_step_not_failed` even though the button rendered | `lib/runs/report-bug-view.ts:14-17` |
| Legacy stored evidence URL is not http(s) | Prefill silently drops it (empty row) instead of seeding an unusable value | `lib/runs/report-bug-view.ts:53-65` (BK-500) |
| Exactly 10 evidence links (boundary) | Accepted; 11th rejected `45303` | `lib/bugs/errors.ts:114-117` |
| Title at exactly 5 or 200 chars (boundary) | Accepted per the inclusive-bound wording ("between 5 and 200") | `lib/bugs/errors.ts:107-109` |

---

## FR-009: Transition Bug Status

| Field | Value |
|---|---|
| **Related PRD section** | `.context/PRD/user-journeys.md` §5, Journey 4 |
| **RPC** | `bunkai_transition_bug_status` |
| **Evidence** | `lib/bugs/errors.ts:41-72`, `supabase/migrations/0054_bug_assignment_status.sql` |

**Functional Requirement**: A Bug's status advances exactly one lifecycle stage forward at a time (`open → in_progress → resolved → closed`); backward moves and stage-skips are rejected.

### Validation Rules

| Rule | SQLSTATE | Error | Evidence |
|---|---|---|---|
| Cannot skip a stage forward | `45310` | `"A bug must move to '<nextStage>' first."` (client re-derives `<nextStage>` from `BUG_STATUS_VALUES` array order since the RPC exception carries no DETAIL payload) | `lib/bugs/errors.ts:41-65` |
| Cannot move backward or no-op to the same status | `45311` | `"A bug's status cannot move backward."` | `lib/bugs/errors.ts:66-72` |

### State Machine

Reuses `.context/business/domain-glossary.md` §6 "Bug (`bugs.status`) — forward-only lifecycle" `stateDiagram-v2`.

| From | To | Trigger | Guard | Side Effects |
|---|---|---|---|---|
| `open` | `in_progress` | "Start progress" | Must be the immediate next stage | — |
| `in_progress` | `resolved` | "Mark resolved" | ditto | — |
| `resolved` | `closed` | "Close" | ditto | Terminal |
| any | any earlier or same | (rejected) | N/A | `45311`, no write |
| any | any stage >1 ahead | (rejected) | N/A | `45310`, no write |

Cross-reference: this is the same rule as `.context/business/domain-glossary.md` §3's own Given/When/Then ("A Bug's status can only advance one lifecycle stage at a time, never backward") — not renumbered here.

### Edge Cases

| Case | Expected Behavior | Evidence |
|---|---|---|
| `open → resolved` (skip `in_progress`) | `45310`, message names `in_progress` as the required next stage | `lib/bugs/errors.ts:41-65`; domain-glossary §3 Given/When/Then |
| `in_progress → open` (backward) | `45311` | `lib/bugs/errors.ts:66-72` |
| `closed → closed` (no-op resubmit) | `45311` (treated as non-forward) | `lib/bugs/errors.ts:66-72` |

---

## FR-010: Issue a Workspace Invite

| Field | Value |
|---|---|
| **Related PRD section** | `.context/PRD/user-journeys.md` §6, Journey 5 |
| **UI entry** | `app/(app)/workspaces/[id]/members/page.tsx` |
| **Evidence** | `supabase/migrations/0010_workspace_invites.sql:18` |

**Functional Requirement**: An `admin`/`owner` may issue an invite (email + role) to join their Workspace; the role may never be `owner`.

### Validation Rules

| Rule | Evidence |
|---|---|
| `role` CHECK excludes `owner` — structurally impossible to invite at owner rank | `supabase/migrations/0010_workspace_invites.sql:18` |
| Only `admin`/`owner` may issue invites | `.context/PRD/user-journeys.md` §6 step table |

### Processing Logic

1. `admin`/`owner` opens `/workspaces/[id]/members`, issues an invite: email + role (`viewer`/`member`/`admin`).
2. Invite row created; status derived client-side as `pending`/`accepted`/`revoked`/`expired` from `accepted_at`/`revoked_at`/`expires_at`.

Evidence: `app/(app)/workspaces/[id]/members/page.tsx:68-73` (`derivedStatus`).

### Edge Cases

| Case | Expected Behavior | Evidence |
|---|---|---|
| Attempt to invite at `owner` rank | Structurally impossible (CHECK constraint) | `supabase/migrations/0010_workspace_invites.sql:18` |
| Invite token expires before acceptance | Derived `expired` status shown in list; accept-endpoint behavior on an actually-expired token not independently verified | Discovery Gap (also flagged in `user-journeys.md` §10) |

---

## FR-011: Accept a Workspace Invite

| Field | Value |
|---|---|
| **Related PRD section** | `.context/PRD/user-journeys.md` §6, Journey 5 |
| **Route** | `POST /api/v1/invites/accept` |
| **Domain module** | `lib/workspaces/invites.ts` (`inviteAcceptAction`) |
| **UI entry** | `app/invites/accept/page.tsx` |
| **Evidence** | `lib/workspaces/invites.ts:1-42` |

**Functional Requirement**: Accepting an invite must never demote an existing higher-or-equal-rank active membership; it upserts the membership at the invited role otherwise.

### Validation Rules

| Rule | Logic | Evidence |
|---|---|---|
| No existing active membership, or existing but not `active` status | `upsert` — activates at the invited role | `lib/workspaces/invites.ts:29-41` |
| Existing active membership, invited role strictly higher rank | `upsert` — legitimate promotion | ditto |
| Existing active membership, invited role ≤ current rank | `reject_already_member` — never demotes | ditto |

Role rank order (`ROLE_RANK`): `viewer:1 < member:2 < admin:3 < owner:4` — mirrors the `workspace_members.role` CHECK constraint.

### Processing Logic

1. Invitee (may be signed out) opens `/invites/accept?token=...`.
2. `AcceptClient` reads the token as a prop.
3. Client posts to `/api/v1/invites/accept`.
4. `inviteAcceptAction()` decides `upsert` vs `reject_already_member` per the rank comparison above.
5. On success, redirect to `next` (defaults to `/projects`), invitee lands at the invited role.

Evidence: `lib/workspaces/invites.ts:29-40`; `app/invites/accept/page.tsx:1-19`.

### Edge Cases

| Case | Expected Behavior | Evidence |
|---|---|---|
| Invitee already `admin`, invite is for `member` | Rejected `reject_already_member` — never demotes | `lib/workspaces/invites.ts:33-40` |
| Invitee has a non-active row (e.g. `status = invited` from a prior invite) | Treated as no existing membership — `upsert` activates at the new invited role | `lib/workspaces/invites.ts:33` |
| Invitee not signed in when opening the accept link | Internal sign-in-then-accept handling not read in this pass | Discovery Gap (also flagged in `user-journeys.md` §10) |
| Invite already expired at accept time | Accept-endpoint's own behavior on an expired token not independently verified (only the list-display derivation was confirmed) | Discovery Gap |

---

## State Machines (Consolidated)

All 6 `stateDiagram-v2` blocks are defined once, code-verified, in `.context/business/domain-glossary.md` §6 — cited by FR above rather than reproduced:

1. UserStory Ready-to-Test gate (FR-003)
2. Bug forward-only lifecycle (FR-009)
3. Run — run grain (FR-006)
4. RunAtc/RunStep — position grain (FR-007)
5. ImportJob status (not covered by an FR above — Jira import flow was deliberately excluded from the 5-journey PRD cap per `user-journeys.md` §10; recommend a dedicated FR-012 in a follow-up pass if the Jira import flow becomes in-scope for automation)
6. AtcStatus display classification (not a strict lifecycle — informational only)

---

## Business Rules Summary

| BR | Rule | Source |
|---|---|---|
| BR-001 | RLS is the sole tenant-isolation boundary | `domain-glossary.md` §3 (reused, not renumbered) |
| BR-002 | A Bug's status can only advance one stage at a time, never backward | `domain-glossary.md` §3 = this doc's FR-009 |
| BR-003 | An ATC cannot exist without ≥1 bound Acceptance Criterion | `domain-glossary.md` §3 = this doc's FR-004 |
| BR-004 | A User Story cannot be `ready_to_test` with zero active ACs | `domain-glossary.md` §3 = this doc's FR-003 |
| BR-005 | Bug filing is gated to `failed`-status steps, double-enforced client+server | New — identified in this pass, FR-008 |
| BR-006 | Billing meter crosses `warning` at ≥80%, `limit-reached` at ≥100%; unlimited never warns | `domain-glossary.md` §3 (reused; not exercised by any FR above — billing is display-only, no FR derived since no PRD journey covers it) |
| BR-007 | Onboarding-time Workspace creator becomes `owner`; `owner` otherwise ungranted by invite | New — identified in this pass, FR-001/FR-010 |

**Reuse count**: 5 of 7 BRs above are cross-referenced from `domain-glossary.md` §3 without renumbering (BR-001 through BR-004, BR-006); 2 are newly identified in this pass (BR-005, BR-007).

---

## Validation Rules Catalog

| Entity | Field | Rules | Error Message | Evidence |
|---|---|---|---|---|
| Workspace | `slug` | Unique, matches `SLUG_REGEX` (≥3 alnum) | `"Use at least 3 letters or digits..."` / `"Slug \"<slug>\" is taken..."` | `onboarding-form.tsx:81-98` |
| Workspace | `name` | Required | `"Enter a workspace name."` | `onboarding-form.tsx:76-79` |
| UserStory | `title` | 3–200 chars, required | `titleMessage()` switch | `lib/user-stories/errors.ts:22-33` |
| UserStory | `external_id` | Unique per project (partial index) | `"This Jira issue is already linked..."` | `lib/user-stories/errors.ts:9-13` |
| Atc | `p_ac_ids` | Non-empty, all belong to Story | `ac_outside_user_story` | `lib/atcs/errors.ts:16-19` |
| Atc | `module_id` | Story's module or descendant, same project | `module_outside_project_subtree` | `lib/atcs/errors.ts:20-23` |
| Atc | `tags` | ≤10 | `tags_limit_exceeded` (RPC backstop; Zod primary) | `lib/atcs/errors.ts:43-50` |
| Atc | `slug` | Unique per project | `slug_collision` (auto-retry) | `lib/atcs/errors.ts:39-42` |
| Bug | `title` | 5–200 chars | `title_invalid` | `lib/bugs/errors.ts:103-109` |
| Bug | `severity` | ∈ {P1,P2,P3,P4} | `severity_invalid` | `lib/bugs/errors.ts:110-113` |
| Bug | `evidence_urls` | ≤10 items | `evidence_limit_exceeded` | `lib/bugs/errors.ts:114-117` |
| Bug | `status` | Forward-only, one stage at a time | `status_transition_skipped` / `status_transition_backward` | `lib/bugs/errors.ts:41-72` |
| RunStep | `note` | Max length (literal not captured this pass) | `"Note must be at most <N> characters."` | `lib/runs/mark-step-view.ts:176-178` |
| RunStep | `evidence_url` | http(s) only, length-bounded | `"Evidence link must be a valid URL."` / length message | `lib/runs/mark-step-view.ts:184-189` |
| AccessToken (PAT) | `scopes` | Subset of 4-value CHECK; `workspace:admin` excluded from headless defaults | `assertNoGlobalAdminScope` | `lib/api/pat.ts:22-38` |
| WorkspaceInvite | `role` | CHECK excludes `owner` | Structural (DB rejects at write) | `supabase/migrations/0010_workspace_invites.sql:18` |

---

## Discovery Gaps

- **`RUN_HISTORY`/`REPORT` field-length literals** (`note`, `evidence_url` max chars) — the exact numeric bound for `mark-step-view.ts`'s note/evidence validation was not captured as a literal constant in this pass (only the message template `<N>` was seen); a follow-up grep of the constants file backing those messages is needed before writing precise boundary tests.
- **`run_abort`/`run_finish` full validation surface** — FR-006's state table is derived from `domain-glossary.md`'s stateDiagram and `user-journeys.md`'s step table, not from directly reading `supabase/migrations/0036_run_abort.sql` / `0037_run_finish.sql`.
- **ImportJob (Jira) flow** — deliberately out of scope for FR derivation in this pass, mirroring `user-journeys.md`'s own explicit exclusion (the file it's documented in step-by-step was "located but not read" per that document's own Discovery Gaps). Recommend a dedicated FR-012+ pass if Jira import becomes an automation target.
- **User Story `ready_to_test → draft` reverse transition** — permission/role gate on "unmark" not independently verified (FR-003 edge case).
- **`/onboarding` direct-visit-when-already-onboarded** behavior not independently verified (FR-001 edge case).
- **Invite accept when invitee is signed out**, and **accept-time behavior on an already-expired token** — both carried over unresolved from `user-journeys.md` §10 (FR-011 edge cases).

---

## QA Relevance

- **Boundary Value Analysis is mandatory, not optional**, for every numeric bound in the Validation Rules Catalog above (title 3–200, 5–200; tags ≤10; evidence ≤10; slug ≥3 chars) — each is a documented inclusive/exclusive edge worth a dedicated BVA pair per `agentic-qa-core/references/test-design-doctrine.md`.
- **State-Transition technique applies to FR-003, FR-006, FR-007, FR-009** — all four have an enforced (not merely documented) state machine; negative tests for "skip a stage" / "go backward" are mandatory coverage, not optional, per both this document and `domain-glossary.md` §9.
- **Decision-Table technique applies to FR-011** (`inviteAcceptAction`) — 3 inputs (existing membership presence, existing status, rank comparison) interact to produce 2 outcomes; a decision table, not ad hoc cases, is the right technique here.
- **Every FR above needing a Postgres RPC has a near-complete SQLSTATE-to-negative-test mapping already** in its `errors.ts` — these translate directly into API-level negative test cases without needing to read the migration SQL.
- **FR-008 (bug filing) is the best candidate for a defense-in-depth test** — it has both a client-side gate (`shouldShowReportBugButton`) and an independent server-side re-check (`run_step_not_failed`); a proper test suite should attempt to bypass the client gate (direct API call) to confirm the server re-check actually fires, not just trust the UI affordance.
