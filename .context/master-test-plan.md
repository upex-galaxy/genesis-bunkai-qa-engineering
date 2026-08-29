# Master Test Plan — Bunkai

```
+------------------------------------------------------------------+
|                                                                    |
|   B U N K A I  —  M A S T E R   T E S T   P L A N                 |
|   What to test in this system, and why it matters                 |
|                                                                    |
+------------------------------------------------------------------+
```

> Sits on top of `.context/business/business-data-map.md`, `.context/business/business-feature-map.md`, and `.context/business/business-api-map.md`. It does not repeat their tables — it tells you where to spend your testing hours first and why, in the voice of a senior QA engineer walking a new teammate through the product's actual risk surface.

---

## 1. Executive Risk Map

Bunkai's core bet is that traceability is enforced at the schema level, not left to discipline — and that bet is exactly where you should point your first hours. The riskiest code in this product isn't the UI, it's the small number of RPC-guarded invariants (no-orphan ATC, forward-only bugs, run-snapshot freeze) that have zero E2E coverage today and would silently unravel the whole value proposition if a refactor loosened them. Layered on top of that is a genuinely two-gateway authorization model — page routes and API routes are checked by different code paths entirely — with a documented, still-open scoping gap (BK-499) covering about a quarter of the read surface. And underneath everything sits one shared Supabase project for local, staging, and production alike, which means "isolated test data" is a discipline you have to enforce yourself, not a guarantee the infrastructure gives you. None of this is theoretical: it's cited directly from the three maps below, plus a standing set of findings from earlier framework passes that this plan treats as already-proven risk, not hypotheses to re-check.

| Priority | Flow | Why it matters | Depends on / Affects |
|---|---|---|---|
| CRITICAL | ATC authoring & no-orphan anchoring | Product's core IP invariant, enforced only at the RPC layer (SQLSTATE `45020`), zero E2E coverage (`business-feature-map.md` §8 "High-risk gap") | Feeds every Test that chains this ATC; a silent break corrupts the reuse mechanic the whole product is sold on |
| CRITICAL | Test composition & Run execution | Every coverage/traceability number downstream depends on Run results being correct; realtime, stateful, multi-actor, zero E2E (`business-feature-map.md` §8) | Bug filing (Flow 4), Coverage, Traceability, Recovery-cycle metrics |
| CRITICAL | API authorization split (capability gate + RLS backstop) | Two structurally separate gateways for page vs. API routes; ~20 of 87 endpoints are `authenticated`-only, not capability-scoped (BK-499, known finding) | Every flow that reads through those 20 routes: identity, notifications, reporting, runs/tests reads, workspace membership |
| CRITICAL | PAT capability scoping | A PAT can be minted narrower than its holder's role; a scoping bug is a direct privilege-escalation path for CI/agent traffic | Every capability-gated route a Bearer caller reaches |
| HIGH | Bug lifecycle & failed-step filing | Forward-only status enforced procedurally (not a CHECK constraint) — "a reviewer, not the schema, must hold this invariant" | Defect-tracking integrity; anything that reports on bug status history |
| HIGH | Jira Import worker | Headline customer feature; async, partial-failure-tolerant, external dependency, its own concurrency lock, no webhook receiver anywhere in the product (known finding) | Story/AC authoring pipeline that ATC anchoring depends on |
| HIGH | Sign-Up & Workspace Onboarding | The only door into the product; owner-uniqueness is a load-bearing invariant for the whole tenancy model | Every subsequent flow — no workspace, no product |
| HIGH | Invite & membership governance | Privilege-grant surface; no discovered admin remove-member/change-role route (known finding) — a real gap or an undiscovered path, either way untested | Workspace access control for every non-owner user |

Everything scoring MEDIUM or below is listed briefly in §8 rather than given its own subsection.

---

## 2. What to Test First and Why

### 2.1 ATC Authoring & No-Orphan Anchoring

**Why it matters.** This is the one sentence the product's own marketing leads with: a test case cannot exist without a requirement behind it. If that guarantee breaks, Bunkai stops being different from "a spreadsheet with better formatting" — it's the entire pitch, not a feature among many.

**What commonly breaks.** The invariant is enforced inside a single RPC transaction (`p_ac_ids` must be non-empty and belong to the same User Story, SQLSTATE `45020`), which means it's only as strong as every future code path that calls that RPC correctly. A new "bulk create ATC" endpoint, an import shortcut, or an admin backfill script that bypasses the RPC and writes to `atcs`/`atc_acceptance_criterion` directly would create exactly the orphan window the transaction exists to prevent — and nothing in the UI would necessarily surface it.

**Dependencies.** Every `Test` that later chains this ATC inherits whatever state it was created in; the update-propagation mechanic ("edit once, every chaining Test sees it") is the product's own highest-risk regression surface by its own admission.

**What an experienced QA would check.**
- Attempt to anchor an ATC to acceptance criteria from a *different* User Story than the one being authored, and confirm the rejection is atomic — no partial row survives even under a retried or interrupted request.
- Edit an ATC that's already chained into three or four different Tests and verify every chaining Test reflects the edit, not just the one you edited from.
- Exercise the duplicate-ATC path (`POST /atcs/[id]/duplicate`) and confirm the duplicate does **not** silently inherit the original's AC anchoring in a way that lets it exist without its own valid binding.
- Check what happens when the User Story an ATC is anchored to gets its last AC deleted after the ATC already exists — does the ATC become orphaned retroactively, and is that state detectable?

### 2.2 Test Composition & Run Execution

**Why it matters.** This is where the product turns "we wrote some test cases" into "here is a comparable, reportable result." Every metric downstream — coverage, traceability, recovery-cycle time — is only as trustworthy as the Run data feeding it.

**What commonly breaks.** The chain-reorder handle is deliberately `TestStep.id`, not `atc_id`, because the same ATC can occupy multiple chain positions — a naive reorder implementation that keys off `atc_id` would silently scramble a chain with a repeated ATC. Separately, step marks are last-write-wins while a Run is `running`, which is exactly the kind of thing that looks fine in manual testing and breaks the moment two testers (or a human and an AI agent) mark the same step within the same second.

**Dependencies.** Bug filing (Flow 4) only exists downstream of a `failed` step; Coverage and Traceability views read Run history directly; the Home dashboard's "active runs" widget depends on Run status transitioning cleanly.

**What an experienced QA would check.**
- Build a Test chain that uses the same ATC twice, reorder it, and confirm both positions move independently and correctly.
- Race two sessions marking the same step at nearly the same moment and confirm the result is deterministic (last-write-wins as designed) rather than a lost update or a corrupted row.
- Attempt to mark a step after the parent Run has already reached a terminal status and confirm the structural rejection (SQLSTATE `45212`) holds under direct API calls, not just through the UI's disabled button.
- Verify that editing the source ATC *after* a Run completed does not retroactively change what that Run's history shows — the snapshot-freeze guarantee is easy to get right in the happy path and easy to violate in a refactor that "simplifies" the join.
- Abort a Run without a reason via a direct API call and confirm the requirement is enforced server-side, not just as a required form field.

### 2.3 API Authorization Split (Capability Gate + RLS Backstop)

**Why it matters.** Security and data-isolation bugs here have the widest blast radius in the product — a misconfigured policy on any new table is a direct cross-tenant leak, and there is no app-layer backstop on several routes to catch it (`business-data-map.md` §2 Rule 2). This is compounded by a live, self-identified gap: roughly a quarter of the product's `GET` endpoints check "is this caller logged in at all" rather than "does this caller hold the right capability" (BK-499).

**What commonly breaks.** The two gateways — `middleware.ts` for pages, `withApiHandler`/`resolveIdentity` for API routes — are structurally independent. A fix or a new check added to one is trivially forgotten on the other, and `middleware.test.ts` gives literally zero coverage of the API-route path. A capability check that's correct for the cookie-session caller (who implicitly holds all four capabilities) can still be wrong for a Bearer PAT caller holding a narrower scope, and the two paths are easy to test asymmetrically if you only ever test through the browser.

**Dependencies.** Every one of the 20 `authenticated`-only routes (identity, notifications, reporting reads, runs/tests reads, workspace membership) sits directly on this gap; RLS is the only thing currently standing behind it.

**What an experienced QA would check.**
- For each of the 20 BK-499-flagged routes, confirm that RLS alone is enough to block a cross-tenant read even though the capability layer isn't scoping it — don't assume RLS coverage, verify it per route.
- Confirm that a page-level fix (e.g., a redirect added to `PROTECTED_PREFIXES`) never gets assumed to also protect the corresponding API route, and vice versa.
- Test the same negative-authorization scenario twice — once via cookie session, once via a scoped PAT — and confirm identical behavior; any divergence is a real bug in the principal-resolution parity the product claims to guarantee.
- Look specifically for any new route added since this map was generated that reads or writes tenant data without an explicit `required:<capability>` posture — the codebase enforces posture as a compile-time-mandatory field, so a genuinely missing check should fail a build, not slip through; verify that gate still holds.

### 2.4 PAT Capability Scoping

**Why it matters.** This is the credential surface that lets a CI pipeline or an AI agent act as a member without ever holding a full browser session. If capability scoping is wrong in either direction, you either lock out legitimate automation or hand an narrowly-scoped token more access than its holder ever consented to grant it.

**What commonly breaks.** The `cookie-only` restriction on token issuance/revocation ("a PAT must not mint a PAT") is a deliberate rule with no schema-level enforcement beyond the posture check — a new endpoint added under `/tokens` that forgets this posture reopens a self-escalation path. Separately, `workspace:admin` scope requires admin/owner rank in that *specific* target workspace, while a global (no-workspace) token with non-admin scopes needs no membership check at all — a nuance that's easy to get backwards in a future refactor.

**Dependencies.** Every capability-gated route a Bearer caller reaches; the RLS impersonation-JWT mechanism that's supposed to make PAT and cookie callers behave identically underneath.

**What an experienced QA would check.**
- Attempt to use a Bearer token against `POST /tokens` and `DELETE /tokens/[id]` and confirm the 403 holds regardless of the token's own capability scopes.
- Mint a token scoped to only `atc:read` and confirm it is rejected on every `atc:write`, `run:execute`, and `workspace:admin` route — not just a sample of them.
- Mint a `workspace:admin`-scoped token as a `member`-rank user attempting to target a workspace where they don't hold admin/owner, and confirm the mint itself is rejected, not just downstream usage.
- Revoke a token mid-session (while a request using it may already be in flight) and confirm the revocation takes effect on the very next request, not after some caching delay.

### 2.5 Bug Lifecycle & Failed-Step Filing

**Why it matters.** The product's differentiator against a plain TMS is that a bug never loses the run context that produced it, and its status can only ever move forward. Both guarantees are things users will notice breaking — a bug that mysteriously reopens, or one that lost its link back to the failing step, undermines the entire "never lose QA context" pitch.

**What commonly breaks.** The forward-only lifecycle (`open → in_progress → resolved → closed`) is enforced by a Postgres function, not a CHECK constraint — the data map calls this out explicitly as something "a reviewer, not the database schema, must hold" on any new write path. Bug filing itself is double-gated (client hides the button unless the step is `failed`; server independently re-verifies), which is good defense-in-depth, but also means there are two places a future change could quietly diverge.

**Dependencies.** Anchored to Module + ATC + Run + RunStep — a bug that outlives any of those referenced rows being modified needs to still resolve correctly.

**What an experienced QA would check.**
- Attempt every backward transition and every multi-stage skip directly against the API (not through the UI) and confirm each is rejected with the documented SQLSTATEs.
- Change a step's status between opening the bug dialog and submitting it, and confirm the server's independent re-check catches the race (422 `run_step_not_failed`).
- File the maximum number of evidence links (10) and confirm the 11th is rejected cleanly, not silently dropped or silently accepted.
- Assign a bug to a `viewer`-role member and confirm the assignment is rejected — assignees must be active, non-viewer members.

### 2.6 Jira Import Worker

**Why it matters.** This is the headline customer-facing Jira feature and the single best candidate in the product for a bug nobody notices until a customer complains their requirements are duplicated or missing (`business-data-map.md` Flow 6 QA note).

**What commonly breaks.** It's async, partial-failure-tolerant, and idempotent-by-design — three properties that are each individually hard to get exactly right and that interact with each other. The one-active-import-per-project lock is enforced by both a fast read-check and a race-proof unique index, which is a strong design, but it's also exactly the kind of dual-enforcement that can drift out of sync if one side is changed without the other.

**Dependencies.** Feeds directly into the Story/AC authoring pipeline that ATC anchoring (§2.1) depends on — a corrupted import doesn't just create bad Jira data, it seeds bad requirements that a QA engineer might build ATCs against without realizing the source was already wrong.

**What an experienced QA would check.**
- Fire two import requests for the same project in rapid succession and confirm exactly one is accepted (201/202) and the other cleanly rejected (409) — never both queued.
- Re-run the identical JQL import twice and confirm no duplicate Story rows appear, and that a Story you manually moved to a different Module stays there after the re-import.
- Force a mid-run Jira 401 (revoke the credential partway through a large import) and confirm the job reaches `failed` with `jira_unauthorized` rather than being left stuck `running`.
- Import Jira issues where two components match Bunkai's module-routing rule and confirm the tie-break behavior is deterministic, not just "whatever happened to be first this time" (flagged as unverified in `business-data-map.md` §7).
- Import an issue whose description exceeds 50KB and confirm the truncation marker is genuinely visible to the end user, not silently swallowed.

### 2.7 Sign-Up & Workspace Onboarding

**Why it matters.** This is the only door into the product. If it breaks, nothing else you test matters, because nobody gets far enough to reach it.

**What commonly breaks.** Owner provisioning is a one-way door by design — the creator becomes `owner`, and invites can never grant that rank (enforced by a CHECK constraint). That's a strong guarantee, but it also means any bug in the "does this user already have an active membership" check has an outsized effect: false-negative sends an existing user through onboarding again, false-positive locks a legitimate new user out of ever creating their first workspace.

**Dependencies.** Every other flow in this document assumes a valid, active workspace membership already exists.

**What an experienced QA would check.**
- Sign up via each of the three identity paths (password, magic link, GitHub/Google OAuth) and confirm all three land in the same onboarding-or-projects branch consistently.
- Attempt to create a workspace with a slug that collides with an existing one and confirm the 409 is a clean, actionable message rather than a raw database error surfaced to the user.
- Confirm that a user who already holds an active membership in some workspace is never re-routed into `/onboarding` on a subsequent login.

### 2.8 Invite & Membership Governance

**Why it matters.** This is the only route by which anyone besides the workspace creator gets access at all — a security-relevant privilege grant, not a convenience feature.

**What commonly breaks.** The rules that exist are solid (owner rank structurally uninvitable, acceptance never demotes an existing higher-or-equal-rank membership), but the coverage gap sits one level up: no admin "remove member" or "change role" route was found anywhere in the API, meaning that half of ordinary workspace governance — the half after the invite is accepted — is either genuinely unbuilt or hiding behind an undiscovered Server Action. Either way, it's untested today.

**Dependencies.** Every non-owner user's access to a workspace originates here.

**What an experienced QA would check.**
- Invite the same email twice at different roles and confirm the accept flow resolves predictably (does the second invite override, get rejected, or coexist?).
- Attempt to accept an invite as a user who already holds a higher-ranked membership in that workspace and confirm `reject_already_member` fires rather than a silent demotion.
- Try to locate any working path — UI or API — for an admin to remove another member or change their role, and treat a genuine absence as a product gap to escalate, not a test you can mark passed by omission.
- Confirm an invite issued at `admin` cannot be manipulated client-side into an `owner` acceptance — the CHECK constraint should make this structurally impossible, but verify the API rejects a forged payload, not just that the UI never offers the option.

---

## 3. State Machines That Matter

Only the machines with real operational consequence are covered here — the display-only `AtcStatus` classification (`business-data-map.md` §4.6, explicitly "not a governed transition graph") is skipped as cosmetic.

### 3.1 UserStory Ready-to-Test Gate

**Why transitions matter.** This gate is what lets a Story become a valid anchor for ATC authoring — everything in §2.1 depends on a Story correctly reaching (and staying at) `ready_to_test` only when it genuinely has active acceptance criteria behind it.

**Most likely to break.** The reverse transition (`ready_to_test → draft`, "unmark") has a permission gate that was not independently verified in any pass — if unmarking is looser than marking, a Story could be sent back to `draft` and forward again without re-validating that it still has ≥1 active AC, or ATCs already anchored to it could be left in an inconsistent state relative to a since-unmarked Story.

**Terminal / forbidden states to guard.** There is no terminal state here — it's a two-state gate, not a workflow — but "AC count drops to zero while the Story is still `ready_to_test`" (via AC deletion after the gate was passed) is the forbidden condition worth actively probing for.

**How corruption would be detected — or not.** A Story sitting at `ready_to_test` with zero active ACs would not throw an error anywhere; it would just silently exist. Nothing re-validates the gate after the fact.

### 3.2 Bug Forward-Only Lifecycle

**Why transitions matter.** This is the guarantee that a bug's history can be trusted at a glance — no user should ever need to wonder whether a "resolved" bug secretly bounced back to "open" and forward again off-screen.

**Most likely to break.** Enforced by a Postgres function (`bunkai_transition_bug_status`), not a schema CHECK constraint — meaning a new write path that updates `bugs.status` directly (a bulk-edit feature, an import/export tool, an admin script) could bypass the invariant entirely without the database itself objecting.

**Terminal / forbidden states to guard.** `closed` is terminal; any write attempting `any → earlier/same` (SQLSTATE `45311`) or `any → >1 stage ahead` (SQLSTATE `45310`) must be rejected.

**How corruption would be detected — or not.** Only detectable today by directly re-testing the RPC path; there is no audit alert or reconciliation job that would catch a bug row whose status was mutated outside `bunkai_transition_bug_status`.

### 3.3 Run / RunAtc / RunStep Execution Grain

**Why transitions matter.** This is the actual pass/fail record the entire product reports on. `aborted` is deliberately run-grain-only and never appears at the step-position grain — a subtle distinction that's easy to get backwards in a refactor.

**Most likely to break.** The `pending → {passed|failed|blocked|skipped}` transition at RunStep grain being last-write-wins *while running* but structurally blocked once the parent Run closes (`45212`) is a boundary condition that only shows up under timing pressure — exactly the kind of thing that passes in every manual test session and fails once under real concurrent load.

**Terminal / forbidden states to guard.** A RunStep should never carry `aborted`; a Run should never accept a step mark once it has reached `passed`/`failed`/`aborted`.

**How corruption would be detected — or not.** Detectable via the SQLSTATE `45212` rejection if the write path is exercised correctly — but only if something is actually testing the closed-Run-write-attempt case. Nothing else in the product would surface a silently-accepted late write; it would just look like a normal, if surprising, result change.

### 3.4 ImportJob Lifecycle

**Why transitions matter.** This is the only asynchronous state machine in the product, and it governs whether a customer's Jira requirements land in Bunkai correctly, partially, or not at all.

**Most likely to break.** `running → completed` and `running → failed` are the only documented exits — there is no confirmed behavior for what happens if the underlying Vercel `after()` compute slot is killed mid-run rather than completing or hitting Jira's own error path (an explicit unconfirmed gap in `business-api-map.md` §7). That's a plausible third outcome — stuck `running` forever — that nothing in this pass could rule out.

**Terminal / forbidden states to guard.** A job should never remain `running` indefinitely; `completed` and `failed` are the only intended terminal states.

**How corruption would be detected — or not.** Today, most likely **not** — this is the exact profile of a silent killer (see §5): there's no evidence of a timeout, reaper, or stale-job sweep. A customer would notice their import "never finished," but nothing in the system would proactively flag it.

---

## 4. Silent Killers — Automated Processes

This is usually the most under-tested area of any system, and Bunkai is no exception — it has no cron jobs and no incoming webhooks at all (confirmed by grep, both maps), so its silent-failure surface is concentrated entirely in DB triggers, the one background worker, and one integration that's wired in the schema but not in code.

### 4.1 Notification Fan-Out Triggers (`activity_log_notify_bug_event` / `_run_event`)

**What it does.** Turns a Bug- or Run-domain row insert into `activity_log` into a `notifications` row for subscribed members — the entire mechanism behind "I got notified my bug was updated" or "the run I started just finished."

**What breaks if it misses, double-runs, or runs out of order.** A missed fire means a member never finds out their bug moved or their run finished — no error, no retry, nothing visibly wrong except a notification inbox that's quietly incomplete. A double-fire means duplicate notifications, which is annoying but at least visible. Out-of-order firing relative to the underlying event is unlikely given the trigger is `after insert`, but a batched/bulk insert path (if one is ever added) could change that assumption.

**How failure is detected today.** Not at all — there's no reconciliation between `activity_log` row count and `notifications` row count, no alert, no dashboard.

**Recommended QA strategy.** A scheduled audit query comparing `activity_log` bug/run events against corresponding `notifications` rows for subscribed members would catch drift that no user-facing test ever would. Until that exists, treat every bug/run status change as needing a manual "did the notification actually appear" check, not just "did the status change correctly."

### 4.2 Full-Text Search Vector Trigger (`atcs_refresh_tsv`)

**What it does.** Keeps the ATC search vector in sync with `title`/`tags` edits so `GET /atcs/search` stays current without an app-triggered reindex step.

**What breaks if it misses.** An ATC edit that isn't reflected in search — a user renames an ATC and then can't find it by its new name, with zero error anywhere. This degrades trust in the reuse mechanic (§2.1) without ever surfacing as a bug report that points at the right cause.

**How failure is detected today.** Not at all — nothing compares live `title`/`tags` values against the indexed vector.

**Recommended QA strategy.** After any ATC rename or retag, immediately search for the new value and confirm it surfaces — make this a standing regression check, not a one-off.

### 4.3 Jira Import Worker's Vercel `after()` Slot

**What it does.** Runs the entire Jira import worker after the `202` response is already flushed to the client — the mechanism that lets import feel instant while the actual paging-through-Jira work happens in the background.

**What breaks if it misses a run or is killed mid-flight.** As covered in §3.4, there's no confirmed behavior for a killed compute slot. Left unresolved, this is a job that could sit `running` forever, silently blocking any future import for that project (the concurrency lock treats `running` as active) with no user-facing error at all — just a spinner-that-never-finishes on the client's 2-second poll, which a user will eventually give up watching without ever filing the right bug report.

**How failure is detected today.** Only by the client's own poll timing out from a user's perspective — there is no server-side timeout or reaper.

**Recommended QA strategy.** This is worth a dedicated exploratory session (flagged as a gap in §11) specifically to force this condition — even an approximate reproduction (killing the request mid-flight in a local/staging environment) would tell you whether the job is left `running` forever or whether some undiscovered safeguard exists.

### 4.4 Dormant Email Notification Channel (Resend)

**What it does — or rather, doesn't.** `RESEND_API_KEY` is declared in `.env.example` and the notification-preferences data model fully supports an `email` channel choice per event type, but no Resend SDK call exists anywhere in the app code (confirmed independently by both `business-data-map.md` §6 and `business-feature-map.md` §9 — a known critical finding for this plan).

**What breaks.** A user sets their bug/run notification preference to `email`, believes they'll be emailed, and never is — with the UI showing their preference as successfully saved. This is silent by construction: the write to `notification_preferences` succeeds every time; it's the *delivery* that never happens.

**How failure is detected today.** Not at all from inside the product — a user would only notice by never receiving an email they expected.

**Recommended QA strategy.** Do not write any test that asserts an email was actually sent for an `email`-channel preference — none will ever pass, because nothing sends it. Instead, this belongs on the pre-release checklist as a product-truth check: does the UI make any claim (a success toast, a checkmark) that implies delivery is real? If so, that copy is misleading today and worth flagging as a product gap, not a test failure.

### 4.5 Bug Consistency Trigger (`bugs_check_consistency`)

**What it does.** Enforces cross-column invariants at write time (e.g., a Bug's anchor entities — Module, ATC, Run, RunStep — genuinely belong to the same Project) independent of whatever the calling RPC already checked.

**What breaks if it's silently weakened.** A future migration that alters this trigger's `WHEN`/body without full test coverage could let an inconsistent Bug row through — one anchored to entities from different projects, for instance — corrupting the very "never loses QA context" guarantee that's the product's stated differentiator.

**How failure is detected today.** Only by the RPC-level negative test cases that exercise it directly; there's no separate audit of existing Bug rows for anchor consistency.

**Recommended QA strategy.** Any migration touching `bugs_check_consistency` should be treated as touching a core invariant, not a housekeeping change — re-run the full negative-case suite for Bug creation against it explicitly, not just the migration's own scoped tests.

---

## 5. External Integrations — Failure Points

### Supabase (Postgres + RLS)

Sole database and sole tenant-isolation mechanism for all six business flows — there is no flow in this product that doesn't ultimately read or write through this one project. A policy misconfiguration on any new table is a direct cross-tenant leak with no app-layer backstop on several routes. Acceptable degradation: none — an outage here is a full outage, surfaced as a generic `500` with a request-id. Known quirk: **single project shared across local/staging/production** — the most consequential infrastructure fact in this whole plan; every test that mutates data must assume its writes are visible in every environment, forever, unless explicitly cleaned up.

### Supabase Auth

Sole identity provider for password, magic-link, and OAuth sign-in. Failure mode is a clean redirect to `/login` on an invalid/expired session — no silent partial-auth state was found. Known quirk: session refresh happens inside `middleware.ts`, which only covers page routes — an API-only test client manages its own session/token lifecycle and gets no help from this layer.

### Supabase Realtime

Backs the Runner view's live step-update channel. Acceptable degradation: a dropped WebSocket channel degrades to a stale view — step marks still succeed via REST underneath — but nothing in this pass confirmed there's an explicit reconnect-or-poll-fallback UX; if there isn't, a user watching a stale Runner view could believe a Run is stuck when it's actually progressing normally.

### Vercel `after()` Compute Slot

Executes the Jira import worker after the enqueue response is flushed — the sole asynchronous execution path in the entire product (no cron, no queue). As covered in §3.4/§4.3, its mid-run failure behavior is unconfirmed. This is the least-understood integration boundary in the product relative to how much a customer-facing feature depends on it.

### Atlassian Jira (customer-facing import)

Outbound-pull only — Jira never calls Bunkai, and no webhook receiver exists anywhere in the codebase (a known finding this plan weights heavily: the entire integration has exactly one failure-recovery pattern, the exponential backoff on `429 Retry-After`). Acceptable degradation: a missing/invalid credential fails the specific Import Job (`jira_unauthorized`), never the app boot — a genuinely good design choice. Known quirk: this credential is optional at the schema level, so a workspace can exist indefinitely without ever discovering its Jira credentials are wrong, until the first import attempt.

### GitHub / Google OAuth

Sign-in identity providers only, feeding Flow 1. The exact toast/redirect behavior on a provider denial or error was not independently verified in any pass to date — treat this as an open question, not a confirmed-safe path, until someone actually forces a provider-side denial and observes the result.

### Resend (declared, unwired)

Not a live integration at all today — see §4.4. Listed here only so it's not mistaken for a working failure point: there is no timeout, retry, or rate-limit to test, because there is no call being made.

---

## 6. Dependency Cascade Between Flows

```
Sign-Up/Onboarding ──► Story+AC+ATC Authoring ──► Test Composition ──► Run Execution ──┬──► Bug Filing ──► Notifications
        │                        ▲                                                     │
        │                        │                                                     └──► Coverage / Traceability / Recovery-Cycle Metrics
        │                 Jira Import (async)
        │
        └──► Invite & Membership ──► (gates every box above for every non-owner user)

API Authorization (capability gate + RLS) ──► underlies every arrow above
PAT Capability Scoping ──► underlies every arrow above, for non-browser callers only
```

**Chain 1 — Authorization is the root, not a branch.** Every flow above sits downstream of the capability-gate-plus-RLS model (§2.3) and, for automation traffic, PAT scoping (§2.4). Testing any single flow "in isolation" against a fixed, known-good session tells you nothing about whether a capability-scoping regression would have let an unauthorized caller reach it — you have to test the authorization boundary itself, independently, for every flow that matters.

**Chain 2 — Authoring feeds Execution feeds Reporting, and a silent break compounds.** A no-orphan-ATC failure (§2.1) doesn't just corrupt one ATC — it corrupts every Test that later chains it, every Run that executes that Test, and every Coverage/Traceability number computed from those Runs. Because none of these layers independently re-validates the layer beneath it, a single authoring-time bug can silently propagate three hops downstream before anyone notices a report looks wrong — and by then the root cause is buried under a week of otherwise-normal activity.

**Chain 3 — Jira Import quietly seeds the authoring pipeline.** Flow 6 isn't a dead-end integration; it's an alternate entry point into the exact same Story/AC pipeline that ATC anchoring depends on (§2.6). A reconciliation bug in the import worker doesn't look like an import bug to the QA engineer who later authors an ATC against that imported Story — it looks like a normal requirements-authoring session against subtly wrong requirements.

---

## 7. Edge Cases Developers Commonly Forget

**Concurrency.** Two testers (or a human and an AI agent) marking the same RunStep within the same second — last-write-wins is the documented design, but "documented" and "tested under real timing pressure" are different things (§2.2). The Jira Import one-active-per-project lock is dual-enforced (fast read-check + unique index) specifically because a single-layer check under load is exactly where this kind of bug lives (§2.6).

**Data limits.** The Jira ADF-to-Markdown conversion truncates at 50KB with a visible marker — verify the marker is actually visible, not just present in the raw response. Bug evidence links cap at 10 (§2.5). Module tree depth caps at 6. Import pagination caps at 1000 pages — a workspace importing a genuinely enormous JQL result set is the flow most at risk of silently hitting this ceiling without realizing its import is incomplete.

**Timezone / DST.** The Recovery-Cycle "time to green" metric (FEAT-035) and Milestone target dates are the two places timestamp arithmetic across a DST boundary or a distributed team's mixed timezones could produce a misleading number — neither map documents timezone handling explicitly, which itself is worth flagging (see §11).

**Permission boundaries.** The 20 BK-499 `authenticated`-only routes (§2.3) are the concentrated risk here — every read against them should be tested cross-tenant, not just cross-role. The PAT `workspace:admin` scope's workspace-specific admin/owner check (§2.4) is the other sharp edge: getting the "which workspace" scoping wrong is easy in a refactor that generalizes the check.

**Orphaned states.** A Module that's soft-deleted while it still has live Stories/ATCs/Runs underneath it — soft-delete is the right pattern, but verify the child entities remain reachable through Coverage/Traceability views rather than silently disappearing from reports. An ImportJob left `running` forever (§3.4/§4.3) is the clearest orphaned-state risk in the product.

**Idempotency.** Jira Import's `external_id`-keyed upsert is the one flow with a clearly documented idempotency contract (§2.6). The `IdempotencyKey` entity exists in the schema for "replay-safety" more broadly, but neither map documents which specific write paths actually consult it — worth confirming it's wired to the routes that most need it (Run start, Bug filing) rather than assumed.

---

## 8. Pre-Release Checklist

1. Verify creating an ATC with acceptance-criterion IDs outside its own User Story is rejected atomically, with no partial row surviving a retried or interrupted request.
2. Verify marking a Run step after the parent Run has reached a terminal status is rejected under a genuine race between two concurrent callers, not just sequential requests.
3. Verify a PAT minted with a single narrow capability scope is rejected on every route requiring a different capability — test the full matrix, not a sample.
4. Verify the 20 BK-499 "authenticated"-only routes still block cross-tenant reads correctly under RLS, tested per route, not assumed from one example.
5. Verify a Bearer PAT is rejected on cookie-only routes (token issuance/revocation) even when it holds an otherwise-valid capability.
6. Verify filing a bug from a run step whose status changed between page load and submission is rejected server-side (422 `run_step_not_failed`), not just blocked client-side.
7. Verify Bug status transitions reject every backward and multi-stage-skip attempt when called directly against the API, not only through the UI.
8. Verify starting a second Jira import for the same project while one is already queued or running returns a clean 409 under concurrent requests, never creating two active jobs.
9. Verify re-running an identical Jira JQL import does not duplicate Stories and does not silently merge two distinct-but-similarly-worded Acceptance Criteria.
10. Verify a workspace invite acceptance never demotes an existing higher-or-equal-rank membership, and that no payload manipulation can accept an invite at `owner` rank.
11. Verify a `viewer`-role caller cannot mark run steps, file bugs, or perform any write action via direct API calls, regardless of what the UI exposes.
12. Verify workspace-slug conflicts during onboarding surface a clean, actionable error rather than a raw database exception.
13. Verify deleting a Project Environment still referenced by an existing Run is blocked.
14. Verify test data created by any automated regression run is fully workspace-scoped and cleaned up, given the single Supabase project shared across local, staging, and production.
15. Verify the UI never implies an email was sent for an `email`-channel notification preference, given Resend is not wired to any code path.

---

## 9. What Is NOT in This Plan

| Topic | Lives instead in |
|---|---|
| Flow-level diagrams and full state-machine transition tables | `.context/business/business-data-map.md` |
| Feature catalog, CRUD matrix, feature flags, per-feature test-coverage matrix | `.context/business/business-feature-map.md` |
| Full 87-endpoint API inventory, auth posture per route, permission model detail | `.context/business/business-api-map.md` + `bun run api:sync` |
| Detailed test case definitions and US-ATP-ATR-TC traceability | TMS — see `/test-documentation` |
| Sprint-level execution order and per-ticket QA planning | `/sprint-testing` |

---

## 10. Discovery Gaps

- **WorkspaceMember has no discovered admin remove-member/change-role route** (carried from `business-feature-map.md` §9 / `business-api-map.md` §7) — only self-leave exists. Could not be resolved from a read-only pass whether this is a genuine product gap or an undiscovered Server Action; needs team clarification before a membership-governance test plan can be written with confidence.
- **Vercel `after()` compute-slot failure mode for the Jira import worker is unconfirmed** (carried from `business-api-map.md` §7) — no evidence describes what happens to an `ImportJob` if the compute slot is killed mid-run. Treated in this plan as the leading silent-killer candidate (§4.3) precisely because it's unverified, not because it's confirmed broken.
- **Page-route auth and API-route auth are two structurally separate gateways** with no shared test coverage (`middleware.test.ts` covers only the former) — this plan treats every authorization claim as needing independent verification on both sides, but a systematic side-by-side comparison has not been done.
- **Project has no Update or Delete route** in the 87-endpoint snapshot — unclear whether projects are immutable-by-design post-creation or this is an unimplemented gap; not resolvable from code alone.
- **OAuth callback error handling (GitHub/Google) was not independently verified** in any pass — the exact toast/redirect behavior on a provider denial is inferred, not confirmed.
- **ADR-0012 (RPC authorization invariant)** is cited by multiple domain error-mappers but the ADR file itself was not opened in any pass — worth reading before writing any RPC-adjacent negative-authorization test.
- **`run_abort`/`run_finish` exact SQLSTATE error-code range is not enumerated** the way Bug/ATC ranges were — migrations `0036`/`0037` were cited but not opened directly.
- **Jira Import's module-routing tie-break order (multiple matching component names) has not been stress-tested**, and whether `reconcileCriteria`'s case-insensitive de-dupe can silently merge two distinct-but-similarly-worded criteria on re-import is unverified.
- **No plain `GET /api/v1/atcs/[id]` or ATC list route exists** — an API-only test suite cannot currently fetch a single ATC by ID through `/api/v1` at all, only via the UI's SSR path or ATC search. This constrains what a pure-API automation suite can independently verify for FEAT-017.
- **Timezone/DST handling for Recovery-Cycle metrics and Milestone target dates is undocumented** in any upstream map — flagged here as a gap this plan surfaces itself, not carried from elsewhere.
- **`IdempotencyKey`'s actual enforcement points are not detailed** in any map beyond its existence as an entity — which specific write paths (Run start? Bug filing?) actually consult it is unconfirmed.
- **Estimated usage distribution across the four roles is unknown** — no telemetry exists, so any risk weighting that assumes "most traffic is `member`-role QA engineers" is a reasonable guess, not a measured fact.

---

*Master Test Plan complete. Built from `.context/business/business-data-map.md`, `.context/business/business-feature-map.md`, and `.context/business/business-api-map.md` — no source code re-derived directly. Next: `/test-documentation` to turn the flows above into TMS-tracked test cases, or `/sprint-testing` for per-ticket QA against the current sprint.*
