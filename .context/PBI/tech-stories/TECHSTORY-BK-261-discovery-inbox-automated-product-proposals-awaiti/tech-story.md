# Tech Story: Discovery Inbox — automated product proposals awaiting your verdict

**Jira Key:** [BK-261](https://jira.upexgalaxy.com/browse/BK-261)
**Status:** AUTOMATED
**Type:** Tech Story

---

## Description

Automated inbox for the ***Product Discovery*** scheduled routine. This is not a unit of work — nothing here gets implemented. It is a mailbox with a protocol.

Once a day the discovery routine audits the roadmap, the open defects, the unaccepted ADRs and the screen map, then posts what it thinks the product needs next as comments on this ticket. It never writes code and never creates issues on its own. You approve or reject in a reply; the NEXT run reads your verdict and acts.

## Why a ticket and not Slack

The routine runs unattended and headless. Interactive chat connectors are not reliably available in that context, and a proposal nobody receives is worse than no proposal. Jira credentials work the same at 3am as at noon, comments already thread, and the whole trail stays next to the backlog it is about.

## How to reply

Every proposal opens with a machine-readable header:

`[PROPOSAL P-YYYY-MM-DD-NN | status: pending]`

Reply in a new comment and ***include the ID***. Comments here are flat, so the ID is the only thing tying your answer to a proposal.

| ***You write**** | ****What happens next run*** |
| --- | --- |
| `P-2026-08-01-02 yes` | The issue gets created, the header is edited to `status: approved -> BK-NNN` |
| `P-2026-08-01-02 no, <reason>` | Header edited to `status: rejected`, reason preserved, never re-proposed |
| `P-2026-08-01-02 later` | Stays pending, re-surfaced once more |
| nothing | Stays pending. After 7 runs it goes `status: stale` and stops being re-surfaced |

Free prose after the ID is fine and is read — the verdict word only has to be recognisable.

## What it will propose

New user stories, new epics, or a refinement of something that already exists. Each one carries the problem it solves, why now, a rough size and its dependencies. A proposal with no stated problem is a feature request, and the routine is told not to post those.

## Latency

Discovery runs daily, but the story and bug routines drain this inbox as their own first step, and those run every 8 hours. Worst case between your reply and the issue existing is about 8 hours, not 24.

## Turning it off

Set `autonomous*delivery.enabled` to `false` in `.agents/project.yaml`, or drop `discovery` from `autonomous*delivery.modes` to stop only this routine. Full configuration and the routine prompts live in `.context/orchestration/routines.md`.

---

## Fields

### customfield_10000

{pullrequest={dataType=pullrequest, state=MERGED, stateCount=6}, json={"cachedValue":{"errors":[],"summary":{"pullrequest":{"overall":{"count":6,"lastUpdated":"2026-08-04T03:05:23.000-0300","stateCount":6,"state":"MERGED","dataType":"pullrequest","open":false},"byInstanceType":{"oAuth-com.github.integration.production":{"count":3,"name":"GitHub"},"GitHub":{"count":3,"name":"GitHub"}}}}},"isStale":true}}

### customfield_10026

2026-08-03T06:45:58.966-0300

### customfield_10027

3_*:*_1_*:*_0_*|*_10027_*:*_1_*:*_64113

### customfield_10084

2026-08-03T06:45:58.966-0300

### customfield_10100

2026-08-03T06:45:58.966-0300

### Fix

Bugfix

### Rank

0|i0mbmv:

---

## Metadata

- **Created:** 1/8/2026
- **Updated:** 20/8/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** autonomous-delivery, discovery, inbox, not-a-work-item

---

_Synced from Jira by sync-jira-issues_
