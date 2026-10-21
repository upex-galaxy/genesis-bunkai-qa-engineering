# ATC Spec: BK-1011 — downloadArchiveExcludingPatSecrets

> Ticket: BK-1011 (TC18)
> Component: WorkspaceExportApi (tests/components/api/WorkspaceExportApi.ts)
> Type: API — Negative / security (archive parsing)
> Parent Story: BK-508 · Wave 3

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| No PAT secret in the archive | No form of a live PAT credential leaves the product inside the ZIP | Synthetic workspace with a freshly minted `workspace:admin` PAT bound to it (raw value known to the test) | AC-10, BR "no credential of any kind" |

## 2. ATC Contract

```typescript
/**
 * ATC: The archive contains no Personal Access Token secret in any form
 * Fixed assertions (over the concatenated text of EVERY file, not only a tokens file):
 *  - raw token `bk_pat_<prefix>.<secret>` absent
 *  - `<secret>` part absent
 *  - sha256(<secret>) hex absent (the form the server stores)
 *  - no file name matching /token|secret/i
 */
@atc('BK-1011')
async downloadArchiveExcludingPatSecrets(
  args: { workspaceId: string, patTokens: string[] },
): Promise<[APIResponse, Record<string, string>]>
```

Hashing uses `node:crypto` `createHash('sha256')` inside the component (no new dependency).

## 4. Assertions Split

**Fixed**: as contract. The `<prefix>` part is NOT asserted absent: it is a non-secret lookup key that may legitimately appear in token metadata.
**Test-level**: the PAT was issued AFTER the workspace existed and BEFORE the export request (ordering is what makes the scan meaningful).

## 6. Technique-derivation check

| AC | Technique | ATCs |
|----|-----------|------|
| AC-10 | EP over credential types: PAT (this) / invite token (BK-1012) / magic-link (DEFERRED: no capturable value, user-scoped and emailed) | 1 |

Error guessing: hash form and split form added beyond the AC (a leak via `activity_log` payload or a `select('*')` on a future token table would expose the hash, not the raw value).

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| PAT bound to the synthetic workspace | Generate | `TokensApi.issueToken({ scopes: ['workspace:admin'], workspaceId })` | test body | `revokeToken` in `afterEach` (also revoked by workspace delete) |
| Completed export | Generate | request + poll | test body | workspace soft-delete |

The raw token is held only in memory, never logged or attached to Allure (Critical Rule #1 spirit: secrets never printed).

## 9. Checklist

- [x] naming · [x] object param · [x] tuple return · [x] whole-archive scan, not one file

## 10. Implemented (Wave 3, 2026-10-20)

Signature: `downloadArchiveExcludingPatSecrets({ workspaceId, token })`: the raw PAT travels under the `token` key (masked by the step decorator) and every form is derived inside the ATC. Forms scanned (content and file names): raw token, secret part after the dot, full secret `prefix + secret` (what `POST /tokens` hashes, per the product source), SHA-256 hex of the full secret (stored in `access_token_secrets.hash`) and of the secret part. Failure output lists `<file>: <form label>` only, never a value. The PAT carries `workspace:admin` only and is revoked in afterEach with `requireRevoked`.
