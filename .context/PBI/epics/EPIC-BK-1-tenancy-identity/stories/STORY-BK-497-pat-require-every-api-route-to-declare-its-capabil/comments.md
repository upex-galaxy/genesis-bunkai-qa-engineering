# Comments for BK-497

[View in Jira](https://jira.upexgalaxy.com/browse/BK-497)

---

### Automation for Jira - 18/8/2026, 15:24:00

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 18/8/2026, 16:13:21

✅ Pull Request is successfully MERGED and DEPLOYED on QA. 
It's Ready for Testing Phase! 
Dev Task is Done.

---

### Ely - 18/8/2026, 16:15:18

## Ready for QA — merged to `staging`

@@Luis Eduardo Flores Villarroel — assigning to you as the QA owner of the `shift-left-2026-08-14` refinement this Story inherits from BK-262.

|  |  |
|  |
| PR | [#182](https://github.com/upex-galaxy/upex-bunkai-tms/pull/182) — merged |
| Branch | `feature/BK-497-route-capability-posture` (deleted after merge) |
| Merge commit | `ce9a38d7` |
| CI | Vercel deploy passed |

### What to expect on staging: nothing

This is the Foundation slice, and it is ***behaviour-neutral by design****. No capability was assigned to any previously-ungated route, no gate changed, and no database migration ran. A functional retest is not the right shape here — the QA question is **"is everything still exactly as it was"**, not **"does a new rule work"*.

The gate at the API gateway is purely subtractive: it can only turn a 2xx into a 403 for an under-scoped token, never grant access that did not exist. This PR adds zero new capability requirements, so no existing token's behaviour changes at all. Browser sessions are structurally unaffected.

### Evidence

| Check | Result |
| --- | --- |
| Full suite | 1555 pass / 1 fail |
| Types | clean |
| Lint | 0 errors |

> ***NOTE:**** The 1 failure is ****pre-existing and unrelated*** — `lib/runs/start-run.test.ts:129` (BK-34, run-steps chain order, `Expected: 1 / Received: 2`). It fails identically on the untouched `staging` tip; the baseline before any edit was 1546 pass / the same 1 fail. The delta is exactly the 9 tests this Story adds.

***AC-04 / AC-05 / AC-06 were genuinely exercised, not skipped.**** Those are non-regression guards, and the suites carrying them (`rls-parity`, `auth-coexistence`, `workspace-context`, `pat`) are `describe.skip` without live Supabase credentials. All four credentials were present in this run, so those 17 tests executed with ****zero skips***.

### The one behavioural change, and how it was proven

The hand-rolled bearer rejection in the two token routes moved into the gateway as a `cookie-only` posture. `app/api/v1/tokens/cookie-only-posture.test.ts` drives the ***real exported handlers with a real minted token****: POST `/tokens` and DELETE `/tokens/{id}` return 403 with their pre-lift messages preserved ****verbatim***, and the database confirms no token was minted and the target token is still unrevoked. GET `/tokens` with the same token returns 200 — the positive control, without which the two 403s would be satisfied by any failure at all.

Worth a manual smoke on staging even so: ***issue a PAT from Settings, and revoke one.*** Those are the only two user-facing paths whose enforcement moved.

### Note for shift-left on the successors

The AI Product Owner's split ruling flagged that this Story's headline property — **a new route cannot compile without declaring a posture** — has ***no acceptance criterion*** among BK-262's nine. It is tested but never stated as a criterion, and authoring one during delivery would have been inventing refinement. Recorded here for you rather than invented. It is a legitimate reason to pull this back to `Shift-Left QA` if you want the criterion written before sign-off.

Two findings for BK-499's shift-left, both from the adversarial review of this PR:

1. The coverage check is scoped to `app/api`, which is what BK-497 ratified. Two bare gateway-free handlers exist ***outside*** that root — `app/auth/callback/route.ts` and `app/auth/oauth/[provider]/route.ts`. They are deliberately not covered and are recorded in-code; widening the walk was declined here as out of scope.
2. `POST /invites/accept` keeps its deferred-debt justification. Its posture question is genuinely open and has never been through shift-left.

### Unblocked by this

BK-498 (authoring domain) and BK-499 (reads, identity, notifications) both `depends on` this Story and are now unblocked. The 46 handlers awaiting a real capability carry a greppable `BK-498 pending` / `BK-499 pending` justification, and the committed snapshot at `lib/api/route-capability-coverage.snapshot.json` lists all 87 handlers and their postures in one file.

---

### Luis Eduardo Flores Villarroel - 19/8/2026, 20:58:11

QA Testing Complete - BK-497

Environment: Staging
Result: PASSED WITH ISSUES (15/17 TCs — 1 BLOCKED with substitute coverage, 1 non-blocking finding)

TEST DATA USED:

- PAT: `atc:read`-only, `atc:write`+`run:execute`, `workspace:admin` (bound), all minted/revoked live against `BK-264 QA Sandbox`
- 1 pending invite created and revoked for the invite-revoke scenario

VERIFIED BEHAVIORS:

- AC-04: `atc:read`-only PAT rejected creating an invite (403, no invite created) - VERIFIED
- AC-05: PAT missing `workspace:admin` rejected revoking an invite (403, invite unchanged) - VERIFIED
- The one real behavioural change in this Story — the `cookie-only` lift on the two token-management routes — VERIFIED with real handlers and real minted tokens: Bearer PATs correctly rejected from issuing/revoking tokens (verbatim pre-lift messages, DB-confirmed no-op), session cookies correctly allowed
- Manual smoke: issuing and revoking a PAT from Settings both work end-to-end (UI); a revoked token is rejected by the API (401)
- Compile-time property ("a route with no declared posture fails to compile") holds today, verified via a scratch fixture
- No regression across the 86 behaviour-neutral handlers (zero-skip run of the full credential-gated suite corroborated independently)

NOT FULLY VERIFIED — non-blocking:

- AC-06 (token with no resolvable workspace context rejected on a workspace-admin action): the exact "unbound token" precondition could not be minted or simulated live this session (issuance guard blocks it by design, DB role is read-only, no spare admin identity available to route around the sole-owner membership block). A closely related branch of the same guard (cross-workspace admin PAT) was exercised instead and passed. AC-06's literal scenario is already covered by the dev's own automated `workspace-context` suite (0 skips). This is a QA-process/tooling gap for this session only, not an unverified product behaviour — does not block sign-off.

FINDING (non-blocking, filed as Improvement):

- [BK-542: PAT/API Auth: route-capability-coverage.test.ts crashes ungracefully when auth options are fully omitted](https://jira.upexgalaxy.com/browse/BK-542) — the coverage-check test crashes the whole file instead of failing gracefully on one specific input shape. Fully defended in depth today by `types:check` running before `bun test`; not a live risk. Severity Minor.

Artifacts: ATP (customfield*10067), ATR (customfield*10124)

---


_Synced from Jira by sync-jira-issues_
