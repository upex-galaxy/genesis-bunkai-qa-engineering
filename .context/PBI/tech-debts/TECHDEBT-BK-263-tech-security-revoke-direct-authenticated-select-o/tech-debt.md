# Tech Debt: TECH-Security | Revoke direct authenticated SELECT on activity_log

**Jira Key:** [BK-263](https://jira.upexgalaxy.com/browse/BK-263)
**Status:** Tareas por hacer
**Type:** Tech Debt

---

## Description

## Context

`activity_log`'s Row-Level Security is row-scoped — it correctly confines each row to the workspace it belongs to — but it is not read-scoped: direct `SELECT` access to the raw table has never been `REVOKE`d from the `authenticated` role. Flagged as out of BK-49's scope during implementation and pre-existing since migration `0009` (`.context/orchestration/handoff/worker-b.md` line 32), but no ticket was ever opened to close it.

## Why this matters

BK-49 ("TMS-Activity | Stream a read-side feed over the existing activity log", Ready For QA) is about to ship a UI surface reading from this exact table, which raises `activity*log`'s visibility without fixing the grant gap. Once the feed ships, `activity*log` moves from an internal audit table nobody queries directly to a table backing a user-facing feature — the kind of table a signed-in user is more likely to probe directly via PostgREST once they know the feed exists. Same risk shape as BK-249's RPC actor-bind gap: a grant broader than the intended access path.

## Scope of this ticket

Audit the actual `REVOKE`/`GRANT` statements on `activity_log`, then either:

- add the missing `REVOKE` so `authenticated` loses direct table access, or
- if direct table access is genuinely needed somewhere, scope a view or RPC as the sole authorized read path and revoke the raw table grant.

Add a regression test proving direct `SELECT` against `activity_log` fails for the `authenticated` role while the intended read path (whatever BK-49's feed queries through) keeps working unchanged.

## Acceptance criteria

- A regression test proves direct `SELECT` against `activity_log` fails for the `authenticated` role.
- The intended read path used by BK-49's feed keeps working unchanged.
- Every `REVOKE`/`GRANT` change is captured in a migration file.

## Out of scope

- Changing BK-49's read-side feed implementation itself.
- Any RPC actor-bind work — that is BK-249's scope, not this one.

## References

- BK-49 — TMS-Activity | Stream a read-side feed over the existing activity log (raises this table's visibility)
- BK-249 — TECH-Security | Bind `p*actor*user*id` to `auth.uid()` across the `bunkai**` explicit-actor RPCs (same-shape precedent: a grant broader than the intended access path)
- `.context/orchestration/handoff/worker-b.md` line 32 — original flag of the gap
- Migration `0009` — where `activity_log` was first created without the table-level REVOKE

---

## Fields

### customfield_10000

{}

### Fix

Bugfix

### Rank

0|i0mbnj:

---

## Metadata

- **Created:** 2/8/2026
- **Updated:** 2/8/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
