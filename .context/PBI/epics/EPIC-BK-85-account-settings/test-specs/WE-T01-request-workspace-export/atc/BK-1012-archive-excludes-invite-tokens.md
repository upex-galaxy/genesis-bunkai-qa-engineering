# ATC Spec: BK-1012 — downloadArchiveExcludingInviteTokens

> Ticket: BK-1012 (TC19)
> Component: WorkspaceExportApi (tests/components/api/WorkspaceExportApi.ts)
> Type: API — Negative / security (archive parsing)
> Parent Story: BK-508 · Wave 3

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| No invite / magic-link token in the archive | A pending invite's one-time token never appears in the ZIP | Synthetic workspace with one pending invite issued by the test (raw token returned once by `POST /workspaces/{id}/invites`) | AC-10 |

## 2. ATC Contract

```typescript
/**
 * ATC: The archive contains no invite token in any form
 * Fixed assertions (over every file):
 *  - raw invite token absent
 *  - sha256(token) hex absent
 *  - the accept_url (which embeds the token) absent
 */
@atc('BK-1012')
async downloadArchiveExcludingInviteTokens(
  args: { workspaceId: string, inviteTokens: string[], acceptUrls: string[] },
): Promise<[APIResponse, Record<string, string>]>
```

## 4. Assertions Split

**Fixed**: as contract. Invitee email presence is NOT asserted either way (not a credential; out of AC-10).
**Test-level**: invite issued before the export request.

## 6. Technique-derivation check

Same partition table as BK-1011 §6 (this ATC = invite-token partition). Magic-link tokens: DEFERRED, no test-capturable value (user-scoped, delivered by email); the archive's entity list (`collect.ts`) never reads the token-secret tables, recorded as code-review evidence in the ATR.

Merge candidate with BK-1011 (one parameterized ATC) is listed in `spec.md`; kept separate because Jira holds two Tests.

## 7. Dependencies / 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Pending invite | Generate | `WorkspacesApi.createInvite({ email: DataFactory.createInviteEmail(), role: 'member' })` (MVP sends no email) | test body | revoked by the workspace soft-delete |
| Completed export | Generate | request + poll | test body | same |

## 9. Checklist

- [x] naming · [x] object param · [x] tuple return · [x] token never logged

## 10. Implemented (Wave 3, 2026-10-20)

Signature: `downloadArchiveExcludingInviteTokens({ workspaceId, token })`. Forms: raw `bk_inv_<secret>` token, the secret part, SHA-256(token) hex (`workspace_invites.token_hash`, per `lib/api/invite-tokens.ts`). `accept_url` is `.../invites/accept?token=<encodeURIComponent(token)>` and base64url is URL-safe, so the raw-token scan covers it; `acceptUrls` was dropped (`createInvite` does not return the URL). Invitee: `DataFactory.createInviteEmail()` (`qa-auto-bk508+<rand>@example.com`).
