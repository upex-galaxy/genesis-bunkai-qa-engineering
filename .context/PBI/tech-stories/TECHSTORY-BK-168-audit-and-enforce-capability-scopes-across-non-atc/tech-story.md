# Tech Story: Audit and enforce capability scopes across non-ATC write endpoints

**Jira Key:** [BK-168](https://jira.upexgalaxy.com/browse/BK-168)
**Status:** ABORTED
**Type:** Tech Story

---

## Description

The ATC domain enforces capabilities via requires:[] on withApiHandler (atc:read/atc:write/run:execute on ~10 routes). Non-ATC write endpoints (projects, environments, modules, user stories, acceptance criteria, tests beyond search, etc. — ~15-20 routes) have NO capability gate; they rely on RLS + manual workspace*members role checks. A PAT therefore is not constrained by its scopes outside the ATC domain. This ticket is DESIGN-FIRST: audit which operations require which scope, decide whether new scopes are needed (e.g. projects:write) or the existing vocabulary suffices, then apply capability gates + the workspace*id context match generally. Depends on the enforcement model from Ticket A / ADR-0006. Also consolidate the scope vocabulary, currently duplicated in lib/api/pat.ts, lib/api/principal.ts, app/api/v1/tokens/route.ts and migration 0008.

## Acceptance Criteria (Gherkin)

### Scenario: capability mapping defined

Given the non-ATC write endpoints
When the audit is complete
Then each endpoint has a documented required capability (or a justified exemption) and the scope vocabulary has a single source of truth

### Scenario: read-scoped PAT cannot write (non-ATC)

Given a PAT with read-only scopes
When it calls a non-ATC write endpoint
Then the API returns 403 Forbidden

## Priority

Medium. Design-first; do not implement before Ticket A / ADR-0006 land.

---

## Fields

### customfield_10000

{}

### Fix

Bugfix

### Rank

0|i0m9x3:

---

## Metadata

- **Created:** 21/6/2026
- **Updated:** 21/6/2026
- **Reporter:** Ely
- **Assignee:** Ely

---

_Synced from Jira by sync-jira-issues_
