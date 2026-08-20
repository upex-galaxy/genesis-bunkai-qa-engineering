# Tech Debt: TECH-Security | Bind p_actor_user_id to auth.uid() across the bunkai_* explicit-actor RPCs

**Jira Key:** [BK-249](https://jira.upexgalaxy.com/browse/BK-249)
**Status:** Tareas por hacer
**Type:** Tech Debt

---

## Description

## Context

Surfaced by the Stage 3 adversarial review of ***BK-37*** (run history) on 2026-07-31.

Every `bunkai***` read RPC in this codebase follows an ****explicit-actor contract***: the caller passes `p*actor*user*id` and the `SECURITY DEFINER` function uses that parameter as the identity when it re-checks workspace membership. The contract exists because API route handlers run on the service-role client, where `auth.uid()` is NULL and the RLS SELECT policies would return zero rows.

The gap: ***the parameter is trusted without ever being bound to the caller's own JWT.***

## Why this matters

These functions carry `grant execute on function ... to authenticated`. The Supabase anon key is `NEXT*PUBLIC***` by design, so any signed-in user holds a JWT for the `authenticated` role and can call PostgREST's `/rest/v1/rpc/<fn>` directly, outside our API routes. Passing another user's uuid makes the membership gate evaluate ****as that user***, and the function returns data scoped to their workspaces.

The only thing standing between a signed-in user and another tenant's data is knowing two uuids. Uuids are not a secret: they travel in shared links, screenshots, support threads, and exported payloads. This is an authorization gap, not an obscurity trade-off.

Nothing suggests this has been exploited. Impact is read-only disclosure across workspace boundaries; no write path is affected (writes go through separate member-gated RPCs that have the same parameter shape and should be audited on the same pass).

## Already fixed (the pattern to replicate)

`BK-37` shipped migration `0039*run*history*actor*guard.sql`, which adds one guard to `bunkai*list*test_runs`:

```sql
if auth.uid() is not null and auth.uid() <> p*actor*user_id then
  raise exception 'test*not*found' using errcode = 'P0002';
end if;
```

Why this shape:

- `auth.uid()` is NULL for the service-role / admin client, so API routes are unaffected.
- `auth.uid()` equals the actor for the cookie client, so server components are unaffected.
- A mismatch means the parameter is not the caller — raise.
- It reuses `P0002`, the same code a missing row raises, so a spoof attempt stays ***indistinguishable from a nonexistent record*** (INV-3 non-disclosure). It must never raise `42501`, which would confirm the record exists.

Verified live against the deployed function: an attacker's JWT calling with a victim's uuid returns `P0002 test*not*found`; the legitimate call is unchanged.

## Scope of this ticket

Apply the same guard to every remaining `bunkai**` function that takes `p*actor*user*id` and is granted to `authenticated`. Known instances:

| ***Function**** | ****Migration**** | ****Notes*** |
| --- | --- | --- |
| `bunkai*get*test*expanded` | `0025*test_read.sql` | Powers the Test detail page + `GET /api/v1/tests/{id`} |
| `bunkai*get*run*expanded` | `0031*runs.sql` | Powers the runner + `GET /api/v1/runs/{id`} |
| **(audit the rest)** | — | Enumerate with `pg_proc` rather than by grep, so nothing is missed |

Enumeration query to start from:

```sql
select p.proname, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'bunkai\_%'
  and pg*get*function*arguments(p.oid) like '%p*actor*user*id%'
order by p.proname;
```

## Acceptance criteria

- Every `bunkai**` function taking `p*actor*user*id` and granted to `authenticated` binds that parameter to `auth.uid()` when a JWT is present.
- Both existing caller shapes keep working unchanged: the service-role client (uid NULL) and the cookie client (uid equals actor).
- Every guard raises the SAME code its missing-row path raises. Never `42501`.
- A regression test per function proves the spoof is blocked and the legitimate call is not.
- Write-path RPCs with the same parameter shape are audited and either guarded or explicitly justified in the ticket.

## Out of scope

- Changing the explicit-actor contract itself (that would be an ADR, not a fix).
- Revoking the `authenticated` grant — server components call these RPCs on the cookie client, so the grant is load-bearing.

## References

- `.context/PBI/epics/EPIC-BK-30-manual-execution-runs/stories/STORY-BK-37-.../review.md` — finding #4 and its adjudication
- `supabase/migrations/0039*run*history*actor*guard.sql` — the reference implementation

---

## Fields

### customfield_10000

{}

### Fix

Bugfix

### Rank

0|i0mbhj:

---

## Metadata

- **Created:** 31/7/2026
- **Updated:** 2/8/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** security, surfaced-by-BK-37, tech-debt

---

_Synced from Jira by sync-jira-issues_
