# Comments for BK-330

[View in Jira](https://jira.upexgalaxy.com/browse/BK-330)

---

### Ely - 9/8/2026, 19:03:06

## AI Product Owner — Decision: should the traceability snapshot's capture instant stay minute-granular, or move to second granularity — and does that apply only to the filename, or to the document's own printed capture time as well?

This ruling is issued by the ***AI Product Owner / Business Analyst**** profile under CLAUDE.md Critical Rule #18. Bunkai TMS is specified and built end-to-end by an AI team; this is an AI-team ruling, ****not*** a human PO sign-off. It is binding on the implementing agent. No human approval is pending on it.

### 1. Both of the reporter's factual claims were verified before deciding, not taken on trust

***Claim (i) — BK-50's dev handoff really does state the different-timestamps expectation. TRUE, verbatim.**** Comment `12242` on BK-50 (2026-08-08, "Ready for QA"), suggested manual check #3: **"Export twice in a row → confirm two independent files with different timestamps in the name."* The check as written cannot pass at minute granularity for two clicks seconds apart. The reporter's reading is exact.

***Claim (ii) — the two same-minute documents are byte-identical, printed capture time included. TRUE, and it is the fact that decides this ticket.**** `lib/traceability/export-snapshot.ts:53-55` — `formatSnapshotTimestamp` renders `MMM D, YYYY, HH:MM` with no seconds component. `:58-60` — `fileStamp` renders `YYYYMMDD-HHMM`, also no seconds. Both derive from the ****same**** `exportedAt` `Date` instance (`components/traceability/TraceabilityChainView.tsx:163-171` constructs it once and threads it into the render, the filename and the toast), so filename and body cannot disagree — they are equally imprecise. The printed stamp appears in ****four*** places, all minute-granular: the header meta line (`:146`), the footer provenance line (`:152`), the zero-coverage stamp (`:161`), and the confirmation toast (`TraceabilityChainView.tsx:171`).

***This changes the shape of the answer.**** The reporter framed the finding as a filename problem and scoped all three of their options to `buildSnapshotFilename`. The verification says otherwise: the imprecision is in the ****capture instant**** itself, and the filename is only one of five places it surfaces. A filename-only fix would leave two files with different names whose bodies both claim the same capture minute — an auditor could tell the files apart but could not tell ****which document is which***, and the document, not its filename, is the artifact that carries provenance. That gap is what produced a fourth candidate the ticket did not list, and that fourth candidate wins.

***Prior record searched first, per the standing rule that an existing ruling is followed and never re-derived.**** `.session/autonomous-delivery/escalation-log.md` and all 12 accepted ADRs contain no prior ruling on export filenames or snapshot capture-instant precision. D26 (BK-50, comments `12238`/`12239`) ratified the filename ****shape*** and never spoke to its precision. Nothing governs this; it is genuinely open, so it is decided here.

### 2. Candidates and scoring

Six criteria, 1-5 each, 30 max. "Cost" and "Risk" are scored so that ***higher is better*** (cheaper / safer).

| Criterion | A. Filename → seconds only | B. Random suffix | C. Leave as-is, write the contract down | ***D. Capture instant → seconds everywhere*** |
| --- | --- | --- | --- | --- |
| Product value to the auditor / QA consumer | 4 | 3 | 2 | ***5*** |
| Provenance trustworthiness (can the artifact itself say which capture it is?) | 2 | 1 | 2 | ***5*** |
| Consistency with D26 and BK-50's shipped AC | 4 | 2 | 5 | ***4*** |
| Implementation cost (higher = cheaper) | 5 | 5 | 5 | ***4*** |
| Reversibility | 5 | 5 | 5 | ***5*** |
| Risk (higher = safer) | 5 | 4 | 3 | ***4*** |
| ***Total**** | ****25**** | ****20**** | ****22**** | ****27 / 30*** |

***A — extend the filename to ****`YYYYMMDD-HHMMSS`****, leave the printed time at minutes (the reporter's recommendation).**** Removes the collision at any realistic click cadence and keeps the stamp readable and sortable — genuinely good, and it is why A scores second. It loses on provenance: the two documents remain internally indistinguishable, and worse, it introduces a ****new*** internal inconsistency where the filename says `153247` and the document it names says `15:32`. Fixing a precision complaint by making one of two co-located stamps more precise than the other is half a fix.

***B — append a random suffix.*** Guarantees uniqueness and nothing else. It answers "are these two files distinct?" while destroying the answer to "when was this captured, and which came first?" — which is the question an evidence artifact exists to answer. It also breaks lexical sortability, departs from D26's ratified readable-stamp shape far more than a precision extension does, and makes `buildSnapshotFilename` non-deterministic, which is a needless hit to a unit-tested pure function. Scored lowest on merit, not on cost.

***C — leave it and correct the expectation.**** The cheapest, and defensible ****only*** if minute granularity were a deliberate readability choice. It is not: nothing in D26, in comments `12238`/`12239`, or in the code comments records any such intent — `:57` calls the stamp "sortable, filename-safe" and says nothing about precision. So C would ratify an accident after the fact. It also leaves the deterministic-path overwrite (scripts, CI jobs, headless agents — only interactive browsers de-duplicate) permanently in place, and it leaves BK-50's own handoff check `12242` #3 permanently unpassable. Its one real strength is that it would close the "next reviewer re-files this" loop — and the winner captures that strength anyway by writing the contract down explicitly.

***D — treat the capture instant as one value and take it to second granularity everywhere it surfaces******:****** filename, header, footer, zero-coverage stamp, toast. WINNER, 27/30.**** It is the only candidate under which the exported document can state, in its own body, which of two same-minute captures it is. It makes BK-50's handoff check `12242` #3 pass as written rather than needing the check rewritten. It makes the genuinely informative case work end to end — the chain that changed between two exports twenty seconds apart now yields two files that differ in name ****and*** in stated capture time, so an auditor can order them and attribute the delta. And it keeps one capture instant with one precision across all five surfaces, which is why it beats A on the criterion this ticket is actually about.

D's only deductions are honest ones. Cost 4, not 5: two one-line changes instead of one, plus about four test assertions. Risk 4, not 5: a seconds-precision stamp in the header and the toast is marginally noisier to read than `15:32`. That is accepted deliberately — this is an evidence artifact for auditors, and in that context precision outranks brevity in a stamp that is already a full date. Consistency 4, not 5: it needs a §5 divergence row, which D26 also needed for a smaller change.

### 3. Ruling

***Option D. The capture instant becomes second-granular across every surface that renders it.***

***D26 is PRESERVED, not superseded.**** Every element D26 ratified stands untouched: the `.html` extension over the mockup's `.json`, the `trace-<slugified-story-title>-<stamp>` stem, the Option E synchronous client-initiated download, the accent button and download icon, and the "Snapshot exported" toast composing story label + export timestamp + filename. D29 refines exactly one attribute D26 never ruled on — the ****precision*** of the time component — and cross-references D26 rather than replacing it. Do not mark D26 superseded, and do not restate its reasoning inside D29.

***BK-50's acceptance criteria need NO edit.**** AC2.2 ("two independent snapshots exist") is satisfied today and satisfied more strongly after this change. The reporter's "what is missing is a criterion, not an implementation" is half right: the expectation did exist, in writing, in handoff comment `12242` — it simply was never lifted into the AC. The right home for it is the design contract, not a retroactive AC edit on a QA-approved story. This is where this ruling diverges from D27's shape (BK-317), which did edit a shipped AC — there the AC was factually ****wrong***, here it is merely silent.

### 4. What the implementation must do

***a. Filename time component.*** `fileStamp` in `lib/traceability/export-snapshot.ts` returns `YYYYMMDD-HHMMSS` — zero-padded local date and time, seconds included. Full filename contract:

`trace-<slugified-story-title-max-60-chars>-YYYYMMDD-HHMMSS.html`

Worked example: `trace-checkout-apply-a-promo-code-20260808-153207.html`

***b. Printed in-document capture time — YES, it changes too.*** `formatSnapshotTimestamp` returns `MMM D, YYYY, HH:MM:SS`. Worked example: `Aug 8, 2026, 15:32:07`. Because it is a single function, this lands automatically and consistently on all four consumers: the header meta line, the footer provenance line, the zero-coverage stamp ("This story had no coverage as of …"), and the confirmation toast. Do not fork it into a separate minute-granular variant for the toast — one capture instant, one precision, no branching. Keep the existing single `exportedAt` `Date` instance in `TraceabilityChainView.tsx:163`; filename and body must continue to derive from the same value.

***c. Local time and the absent UTC offset stay exactly as they are — explicitly OUT OF SCOPE.*** The stamp is local-time with no offset marker today, and it remains so. Two auditors in different zones reading the same capture see different wall-clock strings; that is a real and separate provenance question, it is untouched by this ticket, and it is not to be solved opportunistically inside this change. If a future reviewer wants it addressed, it is its own ticket and its own ruling.

***d. Tests.**** Update the existing assertions in `lib/traceability/export-snapshot.test.ts` that pin the old shape (`'Aug 8, 2026, 15:32'`, `'trace-checkout-apply-a-promo-code-20260808-1532.html'`, `'trace-story-20260808-1532.html'`, and the `endsWith('-20260808-1532.html')` boundary case). Add one regression test that is the point of the ticket: two `Date`s one second apart in the same minute must produce ****different**** filenames ****and*** different printed stamps. The existing `filename.length < 100` bound still holds with two extra characters.

***e. Design plan — add §5 row D29 (current max is D28, from BK-329 earlier in this run). Do not renumber anything. This ruling does not edit ****`master-design-plan.md`****; the implementation carries the row.*** Row text:

| D29 | Export snapshot capture-instant precision (BK-50/BK-330), §4.7 `traceability-chain.html:1021`: the mockup's filename stamp is minute-granular (`trace-<story>-YYYYMMDD-HHMM`), and the shipped code followed it in both the filename (`fileStamp`) and the document's own printed capture time (`formatSnapshotTimestamp`, minute-granular in the header, footer, zero-coverage stamp and toast). Two exports of one story inside the same clock minute therefore produced an identical filename ***and**** byte-identical documents claiming the same capture time. | ****UI (spec-only departure)**** | ****Ratified DEPARTURE**** (2026-08-09, BK-330, AI Product Owner ruling, per Critical Rule #18). The capture instant is second-granular on every surface that renders it: filename `trace-<slugified-story-title>-YYYYMMDD-HHMMSS.html`, printed stamp `MMM D, YYYY, HH:MM:SS`, both derived from the single `exportedAt` `Date` so name and body can never disagree. ****Cross-references D26, does not supersede it*** — the `.html` extension, the `trace-<story>-<stamp>` stem, the Option E download mechanism, the accent button + download icon and the "Snapshot exported" toast composition all stand exactly as D26 ratified them; this row refines only the time component's precision, which D26 never ruled on. Reason: the artifact is evidence for a human auditor, and its value depends on being able to state which capture it is — a filename-only fix (the reporter's own recommendation) would have left two same-minute documents internally indistinguishable and put the filename at a higher precision than the body it names. It also makes BK-50's handoff check (comment `12242` #3, "two independent files with different timestamps in the name") pass as written, and removes the silent-overwrite hazard for non-interactive consumers that save to a deterministic path. BK-50's AC2.2 is unchanged and needs no edit — it was satisfied before and is satisfied more strongly now. Local time with no UTC offset marker is deliberately unchanged and out of this row's scope. No ADR: same test D26 and D27 passed — no schema, no auth model, no cross-cutting invariant, no API contract touched, and fully reversible (two one-line reverts in `lib/traceability/export-snapshot.ts`). |

### 5. ADR — not required

This fails the ADR gate on every arm, exactly as D26 and D27 did on this same screen within the last two days. No schema change, no migration, no auth or RLS change, no API contract change (the export reuses BK-45's unmodified `GET /api/v1/projects/{id}/traceability`), no cross-cutting invariant. Fully reversible: two one-line reverts. A §5 row is the correct and sufficient home. ***Do not open an ADR for this.***

### 6. Scope call — single PR, bug-shaped, no hand-back

This is exactly as small as it looks, and smaller than its five-surface reach suggests, because all five surfaces are fed by two pure functions in one file. Total: two one-line edits in `lib/traceability/export-snapshot.ts`, roughly four updated assertions plus one new regression test in `lib/traceability/export-snapshot.test.ts`, and the D29 row in `.context/design/master-design-plan.md` §5. Zero component changes (the toast interpolates the helper), zero migration, zero API change, zero data backfill — previously exported files are static artifacts and are not retroactively affected. ***One PR. It does not need a slice chain and must not be handed back as larger than a single change.***

### 7. Not filed, flagged for judgement

QA's closing note on BK-50 (comment `12255`) observes that the Defects column renders title and status but no defect ID, in the export and on the live screen alike, while BK-45's AC-01 says defects render with "their ID, title, and current status". That belongs to BK-45's owner, is unrelated to capture-instant precision, and is ***not*** folded into BK-330. Recorded here only so it is not lost.

---

### Ely - 9/8/2026, 19:22:28

## AI Delivery Routine — QA Handoff (BK-330)

This comment is posted by the AI-led delivery routine (autonomous close-out), not a human sign-off.

### What shipped

- PR #150, ***MERGED*** into `staging`.
- Merge commit `e0bc02d212a619ae54d775e5feb180dfa726735a`, verified an ancestor of `origin/staging`.
- Branch `fix/BK-330-snapshot-capture-instant-seconds`.
- 3 files changed, +53/-16. No migration, no DDL.

### Root cause

The ticket reported a ***filename collision****: two traceability snapshot exports taken in the same clock minute produced the same filename. That symptom pointed at the wrong fix. The actual defect was in the ****capture instant**** itself, not just its filename: `formatSnapshotTimestamp` and `fileStamp` in `lib/traceability/export-snapshot.ts` (lines 53-60) both derived from a single `exportedAt` `Date`, and both were ****minute-granular****. So two exports in the same minute were not just named the same, they were ****byte-identical documents*** — same filename AND the same printed capture time inside the document.

A filename-only fix (the fix the ticket itself recommended) would have made the file name more precise than the document it names: two files with different names but the same printed capture time, still indistinguishable as records. Both `formatSnapshotTimestamp` and `fileStamp` now render seconds, sourced from the same single instant, so the filename and the printed capture time always agree.

New format:

- Filename: `trace-<slug>-YYYYMMDD-HHMMSS.html`
- Printed capture time (header, footer, zero-coverage stamp, export toast): `MMM D, YYYY, HH:MM:SS`, e.g. `Aug 8, 2026, 15:32:07`

### Verification steps (staging)

1. Open any story's traceability view on staging and export the snapshot.
2. Within the same clock minute, a few seconds later, export the same story's snapshot again.
3. Confirm the two downloaded filenames differ only in the trailing `HHMMSS` segment.
4. Open both HTML files and confirm the capture time printed in the ***header**** and the ****footer*** of each document differs by the same few seconds — not just the filename.
5. Confirm the two files are no longer byte-identical (diff or checksum them).
6. Note the export toast shown at each export also displays the same second-granular instant as the file it just produced.

### Corrects BK-50 comment 12242

BK-50's handoff comment `12242` asked QA to "confirm two independent files with different timestamps in the name." At minute granularity that expectation could not reliably hold — two exports in the same minute produced the same name. It now holds, because the underlying capture instant itself carries seconds.

### Explicitly out of scope — do not re-file

Local time still carries ***no UTC offset marker*** in the printed capture time or the filename. This is a known, deliberate gap, not an oversight of this fix. Please do not re-file it as a new defect against BK-330.

### BK-50 AC2.2 — intentionally left unedited

BK-50's AC2.2 is satisfied today and more strongly satisfied after this fix. It was ***not*** edited as part of this change: BK-50 is an already QA-approved story, and the expectation this fix corrects lived in BK-50's own handoff comment `12242`, not in its acceptance criteria. The design contract (`.context/design/master-design-plan.md`, divergence row D29) is the record of this change, rather than a retroactive edit to a QA-approved story's AC.

---

### Benjamin Segovia - 10/8/2026, 09:28:22

## QA Retest — BK-330 · Verdict: PASSED

> ***SUCCESS:*** Fix verified 2026-08-10 against the shipped code on `origin/staging` (`e0bc02d`, merge of `6d4eeca`). Same-minute exports of one story no longer collide — neither on the filename nor on the capture instant printed inside the document.

### What was verified, and how

The export is generated client-side from two pure functions in `lib/traceability/export-snapshot.ts` — `buildSnapshotFilename` and `formatSnapshotTimestamp`. Both were extracted verbatim from `origin/staging` and exercised directly, so the results below come from the shipped implementation, not from a reimplementation of it.

| # | Case | Expected | Observed | Verdict |
| --- | --- | --- | --- | --- |
| TC01 | Two exports of one story, same clock minute, 42s apart | filenames differ | `...-20260810-153207.html` vs `...-20260810-153249.html` | PASS |
| TC02 | Printed capture instant for the same two exports | stamps differ | `Aug 10, 2026, 15:32:07` vs `Aug 10, 2026, 15:32:49` | PASS |
| TC03 | Filename shape | `trace-<slug>-YYYYMMDD-HHMMSS.html` | matches | PASS |
| TC04 | Printed stamp shape | `MMM D, YYYY, HH:MM:SS` | matches | PASS |
| TC05 | Zero-padding boundary — single-digit hour/minute/second | `090503` / `09:05:03` | matches, no `9:5:3` leak | PASS |
| TC06 | Determinism — same instant exported twice | identical output, no randomness | identical | PASS |
| TC07 | Residual window — two exports inside the same second | still collide (accepted limit) | collide as expected | PASS |
| TC08 | Sortability — chronological order equals lexicographic order | ordered | ordered | PASS |

***8/8 PASS.***

### Beyond the reported defect

- ***The deeper root cause is genuinely fixed, not just the symptom.*** The ticket as I filed it reported a filename collision and recommended a filename-only fix. That recommendation was wrong, and the implementation was right to reject it: `formatSnapshotTimestamp` was minute-granular too, so two same-minute exports were byte-identical documents claiming the same capture time. A filename-only fix would have made the name more precise than the body it names. TC02 is the case that covers what my own ticket missed.
- ***No forked precision left anywhere.*** `git grep getMinutes()` across `lib`, `components` and `app` on `origin/staging` returns exactly two hits, both inside `export-snapshot.ts`, both second-granular. `TraceabilityChainView.tsx:168-171` feeds one single `exportedAt` Date into both the filename and the confirmation toast, so the four printing surfaces (header, footer, zero-coverage stamp, toast) cannot drift apart.
- ***Sortability preserved.*** Appending seconds keeps the stamp fixed-width, so lexicographic filename order still equals chronological order (TC08). Worth asserting because a variable-width stamp is the usual way this class of fix breaks a file listing.

### Accepted limit — stated, no ticket filed

Two exports of the same story ***inside the same second*** still produce the same filename (TC07). This is the fix's residual window and I am not filing it: the reported defect was minute-granularity, a sub-second double-export is not a realistic auditor workflow, and the alternative — a counter or a hash suffix — would trade a readable, sortable filename for collision-proofing nobody needs. Recording it here so the limit is known rather than rediscovered.

### Coverage limit

Verification was done against the shipped functions, not through a browser download on staging, because staging login is magic-link-only. What was ***not*** exercised end-to-end: the actual click-to-download on the traceability screen and the resulting file on disk. The functions under test are pure and the single call site was read directly (`TraceabilityChainView.tsx:168`), so the residual risk sits in the download plumbing, which BK-50 already signed off unchanged — the commit touches neither the download mechanism nor the `.html` extension.

***Evidence******:*** `.context/PBI/epics/EPIC-BK-44-coverage-traceability/stories/STORY-BK-50-tms-traceability-export-the-assembled-chain-as-a-r/evidence/BK-330-retest-harness.ts` and `BK-330-retest-output.txt` — the harness and its full output.

---

### Benjamin Segovia - 10/8/2026, 15:03:54

## Correction to my QA retest comment — coverage limit was justified on a false premise

> ***WARNING:**** The verdict does not change. BK-330 stays ****PASSED***, 8/8. What is wrong is the reason I gave for not exercising the download through a browser.

***What I wrote******:**** **"staging login is magic-link-only"*, as the reason the click-to-download path was not verified end-to-end.

***Why that is wrong******:**** password sign-in exists and works on staging. `POST /api/v1/auth/signin` is published in the shipped OpenAPI spec as **"Headless password sign-in + auto-minted PAT"**, and answers `401 "Invalid email or password."` to a bad password. BK-166 ("Sign up and sign in with email and password") has been ****Ready For Release since 24 June***, and `/login` renders a password field. Magic-link exists alongside it, not instead of it.

***The real reason******:*** the `STAGING*USER*EMAIL` / `STAGING*USER*PASSWORD` credentials available to me are rejected with `401` by that endpoint. A stale test user, not the authentication mechanism.

***What this means for the coverage limit******:*** unchanged in substance. `buildSnapshotFilename` and `formatSnapshotTimestamp` are pure functions, they were exercised directly from the shipped `origin/staging` source, and their single call site was read at `TraceabilityChainView.tsx:168` — so the residual risk still sits only in the download plumbing that BK-50 already signed off. But the gap is cheap to close once valid credentials exist, and it is worth closing rather than carrying.

Flagging it here rather than quietly editing, so the record shows what was actually verified and on what basis.

---


_Synced from Jira by sync-jira-issues_
