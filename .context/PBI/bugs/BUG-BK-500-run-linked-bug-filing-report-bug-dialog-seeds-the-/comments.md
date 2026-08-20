# Comments for BK-500

[View in Jira](https://jira.upexgalaxy.com/browse/BK-500)

---

### Automation for Jira - 18/8/2026, 19:08:09

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 18/8/2026, 19:08:28

✅ Pull Request is successfully MERGED and DEPLOYED on QA. 
It's Ready for Testing Phase! 
Dev Task is Done.

---

### Ely - 18/8/2026, 19:09:28

## Ready For QA — BK-500 fixed and merged to `staging`

|  |  |
|  |
| PR | [#184](https://github.com/upex-galaxy/upex-bunkai-tms/pull/184) |
| Branch | `fix/BK-500-prefill-evidence-scheme-allowlist` |
| Merge commit | `a30dfad62f2fb3ce96cbf443a52b16b1caf5f947` |
| Environment | Staging |

### What changed

`buildReportBugPrefill` (`lib/runs/report-bug-view.ts`) now routes the failing step's stored `evidence_url` through the existing `isHttpUrl` allowlist (`lib/utils/url.ts`) before seeding it as the first evidence row. That is the same helper the typed-input path already applies in `BugFormDialog.addEvidence`, and the same one the filing-time Zod schema agrees with.

The value is trimmed before it is both checked and seeded, so what got validated is exactly what gets posted.

The header comment above the function described the old unconditional seeding and has been corrected to state the gate.

### Direction of the fix

This ***tightens the client to match the server***. `BugRunLinkedCreateBodySchema` is untouched — it was not loosened to admit the bad value. No migration, no schema change, no `CHECK` constraint on the column.

### What QA should see

1. On a run step whose stored `evidence*url` is ***not**** `http(s)` — file a bug from the failed step. The dialog now opens with an ****empty*** evidence row, and the submit succeeds without touching that field. Previously it opened pre-filled with the unusable value and 422'd on `evidence*urls`.
2. On a run step whose stored `evidence_url` ***is*** `http(s)` — unchanged. The link is still seeded as the first evidence row and still files cleanly. This is the regression to watch.
3. Pasting an invalid link by hand is unchanged: `addEvidence` still rejects it with "Evidence link must be a valid URL."

### Verification performed

Reproduced first against the real `buildReportBugPrefill` + `BugRunLinkedCreateBodySchema` — the same units the runner and the API route use, no mocks — and confirmed the 422 on `evidence_urls.0` before any code changed, with an `https:` control passing through the identical path.

| Check | Result |
| --- | --- |
| Regression test before the fix | 8 fail — every new assertion red |
| Regression test after the fix | 16 pass / 0 fail |
| Full suite (`bun test`) | 1569 pass / 1 fail |
| Types (`bun run types:check`) | clean |
| Lint (`bun run lint:check`) | 0 errors |

The single full-suite failure is `start-run.test.ts` "ATC-01", a ***pre-existing*** Supabase seed-drift failure unrelated to this change and not caused by it. It is currently unticketed.

The regression test feeds the real prefill output into the real filing schema, so it fails if client and server ever disagree again — not merely if this one helper changes shape.

### Assignment

Left ***unassigned***. BK-500 carried no comment trail and went through no shift-left refinement phase, so no QA owner could be identified. Per the hand-off rule the assignee was cleared rather than defaulted to the reporter or left on the developer.

### Notes

- BK-501 is a duplicate of this defect and is already closed as `Duplicated`. No action needed there.
- Story ***BK-465**** (Backlog) touches the same filing surface. It was deliberately ****not*** pulled into this PR; whoever claims BK-465 should read this ticket first, per `.context/dev-roadmap.md`.

---


_Synced from Jira by sync-jira-issues_
