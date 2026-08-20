# IMPROVEMENT: Traceability export: snapshot filename is minute-granular, so same-minute exports of one story collide

**Jira Key:** [BK-330](https://jira.upexgalaxy.com/browse/BK-330)
**Priority:** Lowest
**Status:** Cerrada
**Components:** Bunkai Traceability

---

## Description

***SUMMARY***

The exported snapshot filename is minute-granular — `trace-<story>-YYYYMMDD-HHMM.html`. Two exports of the same story inside the same clock minute therefore produce the ***identical*** filename, and the two documents are byte-for-byte identical, including the timestamp printed in the header and footer.

This is filed as an ***Improvement, not a Defect***: AC2.2 asks only that "two independent downloaded files exist", and they do — the browser's own download de-duplication appends a numeric suffix, so nothing is lost. Nothing in the acceptance criteria is violated. What is missing is a criterion, not an implementation.

---

***STEPS TO REPRODUCE***

#### Step 1 - Precondition

Authenticated on staging, viewing the traceability chain for a story with stable state (used: `d57804e8-d614-445e-b707-8c25d9ca5dac`).

#### Step 2 - Action

Click "Export snapshot" twice in quick succession — both clicks landing inside the same clock minute.

#### Step 3 - Observe

Both downloads are offered under the same suggested filename:

```
trace-as-a-qa-reviewer-i-want-the-full-5-layer-evidence-chain-to-r-20260809-1120.html
trace-as-a-qa-reviewer-i-want-the-full-5-layer-evidence-chain-to-r-20260809-1120.html
```

Saved side by side, the two files diff clean — identical content, identical stated capture time.

---

***WHY IT IS WORTH A TICKET***

The dev handoff comment on BK-50 asks QA to "export twice in a row → confirm two independent files ***with different timestamps in the name***". That expectation does not hold, and cannot hold, at minute granularity. Whoever wrote the check assumed second-level precision. The gap between the stated expectation and the shipped behaviour is the finding.

Practical consequences, all mild:

- An auditor handed two same-minute exports cannot tell them apart by filename, and gains nothing by opening them — the contents are identical.
- Any consumer that saves to a deterministic path (a script, a CI job, a headless download agent) silently overwrites the first file. Only interactive browsers de-duplicate.
- The one scenario where a same-minute pair is genuinely informative — a chain that changed between two exports 20 seconds apart — is exactly the case the current filename cannot express.

---

***SUGGESTED OPTIONS***

Ordered cheapest first; all are one-line changes in `buildSnapshotFilename` (`lib/traceability/export-snapshot.ts`).

1. ***Extend to seconds*** — `YYYYMMDD-HHMMSS`. Removes the collision for any realistic click cadence and keeps the name human-readable and sortable. Recommended.
2. Append a short random suffix. Guarantees uniqueness but makes the name less readable and no longer meaningfully sortable.
3. Leave as is and correct the expectation. Acceptable if minute granularity is a deliberate readability choice — but then D26's filename contract should say so explicitly, so the next reviewer does not re-file this.

Option 1 is the recommendation: it preserves everything D26 ratified about the filename stem and costs nothing.

---

***RELATED STORIES***

- Found during: BK-50 (Export the assembled chain as a read-only snapshot)
- Context: divergence D26 in `.context/design/master-design-plan.md` §5 ratified the `.html` extension and the `trace-<story>-YYYYMMDD-HHMM` stem; this proposal touches only the time component of that stem
- Blocks: none — BK-50 sign-off is not gated on this

---

## Related Issues

- relates to: [BK-50](https://jira.upexgalaxy.com/browse/BK-50) - TMS-Traceability | Export the assembled chain as a read-only snapshot

---

## Metadata

- **Created:** 9/8/2026
- **Updated:** 10/8/2026
- **Reporter:** Benjamin Segovia
- **Assignee:** Benjamin Segovia
- **Labels:** exploratory-testing, improvement, traceability

---

_Synced from Jira by sync-jira-issues_
