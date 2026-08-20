# ACCEPTANCE TEST PLAN (ATP): ATP: BK-337: TMS-Defect Detail | Open a defect and read its full record

**Jira Key:** [BK-516](https://jira.upexgalaxy.com/browse/BK-516)
**Status:** Listo
**Components:** None

> Run results / coverage are NOT synced — read those via xray-cli. This file mirrors the issue description.

---

## Description

_No description provided_

---

## Related Issues

- tests: [BK-337](https://jira.upexgalaxy.com/browse/BK-337) - TMS-Defect Detail | Open a defect and read its full record
- designs: [BK-519](https://jira.upexgalaxy.com/browse/BK-519) - BK-337: TC01: should render the full header for a run-linked defect
- designs: [BK-520](https://jira.upexgalaxy.com/browse/BK-520) - BK-337: TC02: should render description and steps with no Expected/Actual block
- designs: [BK-521](https://jira.upexgalaxy.com/browse/BK-521) - BK-337: TC03: should state Failed at step N in the Origin panel using stored position plus 1
- designs: [BK-522](https://jira.upexgalaxy.com/browse/BK-522) - BK-337: TC04: should link the Origin panel to both the originating ATC and the run
- designs: [BK-523](https://jira.upexgalaxy.com/browse/BK-523) - BK-337: TC05: should show the Filed-manually notice and exactly six Details fields for a standalone defect
- designs: [BK-524](https://jira.upexgalaxy.com/browse/BK-524) - BK-337: TC06: should show the evidence count 6 of 10 with six rows
- designs: [BK-525](https://jira.upexgalaxy.com/browse/BK-525) - BK-337: TC07: should read 0 of 10 with an empty state when no evidence was attached
- designs: [BK-526](https://jira.upexgalaxy.com/browse/BK-526) - BK-337: TC08: should read 10 of 10 at the hard cap with no truncation
- designs: [BK-527](https://jira.upexgalaxy.com/browse/BK-527) - BK-337: TC09: should render a non-http evidence URL as inert text, never an anchor
- designs: [BK-528](https://jira.upexgalaxy.com/browse/BK-528) - BK-337: TC10: should offer zero editable fields and zero lifecycle controls to an admin-role member
- designs: [BK-529](https://jira.upexgalaxy.com/browse/BK-529) - BK-337: TC11: should navigate from the defects-list Bug cell to the detail record
- designs: [BK-530](https://jira.upexgalaxy.com/browse/BK-530) - BK-337: TC12: should navigate from the defects-list Run cell to the same detail record, not the run report
- designs: [BK-531](https://jira.upexgalaxy.com/browse/BK-531) - BK-337: TC13: should resolve a bug notification deep link to the same detail record for both record shapes
- designs: [BK-532](https://jira.upexgalaxy.com/browse/BK-532) - BK-337: TC14: should answer 404 never 403 for a defect in a foreign workspace
- designs: [BK-533](https://jira.upexgalaxy.com/browse/BK-533) - BK-337: TC15: should answer 404 for an unknown identifier and 400 for a malformed one
- designs: [BK-534](https://jira.upexgalaxy.com/browse/BK-534) - BK-337: TC16: should answer 404 when the identifier is real but the URL names a different project
- designs: [BK-535](https://jira.upexgalaxy.com/browse/BK-535) - BK-337: TC17: should let a viewer-role member read the record with no controls
- designs: [BK-536](https://jira.upexgalaxy.com/browse/BK-536) - BK-337: TC18: should render a defect whose module was archived after filing
- designs: [BK-537](https://jira.upexgalaxy.com/browse/BK-537) - BK-337: TC19: should show the assignee read-only on the record
- designs: [BK-538](https://jira.upexgalaxy.com/browse/BK-538) - BK-337: TC20: should return 200 from GET bugs id matching the OpenAPI schema
- designs: [BK-539](https://jira.upexgalaxy.com/browse/BK-539) - BK-337: TC21: should return 401 from GET bugs id without credentials
- designs: [BK-540](https://jira.upexgalaxy.com/browse/BK-540) - BK-337: TC22: should render each status and severity with text plus colour, never colour alone

---

## Metadata

- **Created:** 18/8/2026
- **Updated:** 18/8/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_

---
_Source: Xray Test Plan [BK-516](https://jira.upexgalaxy.com/browse/BK-516) description · ATP · synced by sync-jira-issues_
