# TEST: BK-497: TC-14: should issue a new PAT from Settings and see it listed

**Jira Key:** [BK-547](https://jira.upexgalaxy.com/browse/BK-547)
**Status:** MANUAL
**Components:** Bunkai API Tokens

---

## Test Description

## Related Story

BK-497 — PAT | Require every API route to declare its capability posture

## Priority / ROI

- Priority: High
- Outcome: Manual (UI flow, human-judgment / visual verification, low change frequency — not automated by this pass's ROI decision)

## Prior bugs covered

- (none) if first time

## Test Design

### Preconditions

- Staging session logged in
- Settings page reachable
- Tokens tab accessible

### Action

The user issues a new Personal Access Token from Settings → Tokens and verifies it appears listed.

### Expected Results (assertions of this TC — same precondition+action)

- The new token appears (masked) in the token list
- A new `access_tokens` row exists in the DB (DB-confirmed in Stage 2)

### Steps

| Step | Action | Expected |
| --- | --- | --- |
| 1 | Navigate to Settings → Tokens | Tokens tab loads, "New token" control visible |
| 2 | Click "New token", select scope `atc:read`, submit | "Token created" dialog appears showing the raw secret once |
| 3 | Close the dialog | New token row appears in the list (masked), matching the issued scope |

## Evidence

- `evidence/BK-497-tc14-issue-token-form.png`
- `evidence/BK-497-tc14-token-created-dialog.png`
- `evidence/BK-497-tc14-token-listed.png`

## Variables

| Variable | How to obtain |
| --- | --- |
| N/A | Manual TC — no runtime variables |

## Implementation Code (filled by test-automation)

| Layer | File |
| --- | --- |
| API component | N/A |
| UI component | N/A |
| Test file | N/A |
| Fixture | N/A |

## Architecture

UI (KATA L2/L3 `UiBase`/`SettingsPage` — component not yet created, `/test-automation` would need this only if this verdict changes).

## Available Test IDs (UI)

Not verified against DOM this session — Settings/Tokens page selectors were not inspected via source-code validation, since this TC's ROI verdict is Manual, not Candidate.

## Refinement Notes

(none)

---

## Related Issues

- tests: [BK-497](https://jira.upexgalaxy.com/browse/BK-497) - PAT | Require every API route to declare its capability posture

---

## Metadata

- **Created:** 19/8/2026
- **Updated:** 20/8/2026
- **Reporter:** Luis Eduardo Flores Villarroel
- **Assignee:** Luis Eduardo Flores Villarroel
- **Labels:** e2e, high, manual-only, regression

---

_Synced from Jira by sync-jira-issues_
