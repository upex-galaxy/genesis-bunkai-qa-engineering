# Comments for BK-542

[View in Jira](https://jira.upexgalaxy.com/browse/BK-542)

---

### Ely - 20/8/2026, 18:30:15

## Fixed & deployed to staging — handoff to QA

@Luis Eduardo Flores Villarroel — assigning to you as the shift-left QA owner. Identified from BK-497's comment trail (`shift-left-2026-08-14` refinement, inherited from BK-262), which is where this finding was filed from, rather than from this ticket's reporter field.

Delivered unattended by the scheduled `bug` delivery routine (`autonomous-delivery`, `bug` mode), session `ff6aa288`, 2026-08-20.

***PR:*** https://github.com/upex-galaxy/upex-bunkai-tms/pull/190 — merged to `staging` as `323b01c`, ancestry-verified against `origin/staging`.

### Root cause

Not the symptom. `scanRoutePostures` is called at `describe` ***body*** level in `lib/api/route-capability-coverage.test.ts`, so anything it throws escapes before a single `it()` is registered — hence 0 pass / 0 fail / 1 error with no route named.

`postureAt` threw on two shapes, both justified by an inline comment claiming the `WithApiHandlerOptions` union made them unreachable:

- `withApiHandler(handler)` with the options argument omitted (the one this ticket reports)
- `auth: 'required'` with no `requires` list (the same class, one branch further down)

That comment is the defect. `bun test` does not type-check, so any run reaching the scan without `types:check` first — a reordered CI, a bypassed pre-commit hook, a cast — meets both. An assumption about the compiler was encoded as a hard failure inside a tool the compiler does not gate. Fixed at `postureAt`'s contract, not by wrapping the call site in a `try`.

### What changed

Both shapes now return a row the coverage suite's ***existing*** assertions already look for, so the offending handler is named instead of the file dying:

| Shape | Now reports | Caught by |
| --- | --- | --- |
| missing `auth` | `UNDECLARED_POSTURE` — deliberately falsy `''` | `it('leaves no handler without a posture')`, which filters on `!row.posture` |
| `required` with no capabilities | `'required:'` | `it('declares at least one capability wherever the posture is required')` |

Falsy rather than a word like `'undeclared'` is load-bearing: the existing assertion filters on falsiness, so a truthy sentinel would pass it vacuously and re-open the fail-open the scan exists to close.

The ***unbalanced-paren throw is deliberately left as a throw*** — it is a syntax error, not a type error, so it cannot reach `bun test` through a skipped type check. Different class, out of scope, recorded rather than silently changed.

### Regression test

New `lib/api/route-posture-scan.test.ts` — 7 tests, driving the scan over throwaway route files in an OS temp dir so the failing shapes are exercised without committing a broken route to `app/api`. Verified in both directions:

| Source | Result |
| --- | --- |
| pre-fix `route-posture-scan.ts` | ***0 pass / 7 fail***, reproducing the exact original `error: withApiHandler call at offset 0 declares no auth posture` |
| post-fix | ***7 pass / 0 fail*** |

### Verification

- `bun test lib/api/route-posture-scan.test.ts` — 7 pass / 0 fail
- `bun test lib/api/route-capability-coverage.test.ts` — 7 pass / 0 fail, 108 expect() — the suite this protects is unaffected
- `bun run types:check` — clean
- `bun run lint:check` — 0 errors
- `bun test` (full, 146 files) — 1614 pass / 1 fail

### What to check, and one thing that is NOT this ticket

Suggested retest: add a throwaway `app/api/v1/*scratch/route.ts` with `export const POST = withApiHandler(handler)` (no second argument), run `bun test lib/api/route-capability-coverage.test.ts`, and confirm you get ***named per-handler failures*** naming `*scratch` rather than `0 pass / 0 fail / 1 error`. Delete the scratch file afterwards.

***The single full-suite failure is pre-existing and unrelated to this change:**** `lib/runs/start-run.test.ts` ATC-01 (BK-34) asserts `run.step_count` is 1 and gets 2 — shared-instance test-data drift, the fixture picks an ATC whose executable-step count changed underneath it. Proven pre-existing by checking `lib/api/route-posture-scan.ts` back out from `origin/staging`, removing the new test file and re-running: identical failure. Reported separately on BK-261; ****do not hold this ticket's sign-off on it.***

---


_Synced from Jira by sync-jira-issues_
