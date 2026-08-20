# TEST: BK-497: TC-15: should reject a revoked PAT on subsequent use given it was revoked from Settings

**Jira Key:** [BK-549](https://jira.upexgalaxy.com/browse/BK-549)
**Status:** MANUAL
**Components:** Bunkai API Tokens

---

## Test Description

## Related Story

BK-497 — PAT | Require every API route to declare its capability posture

## Priority / ROI

- Priority: Critical
- Outcome: Manual (UI+API integration flow, same rationale as TC-14)

## Prior bugs covered

- (none) if first time

## Test Design

### Preconditions

- An issued PAT exists (from TC-14's flow or a fresh one), visible in Settings → Tokens

### Action

The user revokes the token from Settings, then attempts a Bearer API call using the now-revoked raw secret.

### Expected Results (assertions of this TC — same precondition+action)

- UI reflects revoked state after confirmation
- The API call with the revoked secret returns a 401/403 rejection (not treated as valid) — confirmed via `GET /api/v1/tokens` → 401 "Invalid token." in Stage 2 Execution

### Steps

| Step | Action | Expected |
| --- | --- | --- |
| 1 | On an existing token row, click "Revoke" | Confirmation dialog appears |
| 2 | Confirm revocation | Dialog closes, token row now shows revoked state |
| 3 | Attempt `GET /api/v1/tokens` (or any authenticated route) using the revoked raw secret as Bearer auth | Response is 401 "Invalid token." — the revoked token is rejected |

## Evidence

- `evidence/BK-497-tc15-revoke-confirm-dialog.png`
- `evidence/BK-497-tc15-token-revoked.png`

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

UI + API (integration) — KATA L2/L3 component not yet created; only needed if this verdict changes.

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
- **Labels:** critical, e2e, manual-only, regression

---

_Synced from Jira by sync-jira-issues_
