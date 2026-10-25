# ADR-0018 — Cookie-only requests are a request option of ApiBase, not a per-component override

- **Status:** Accepted (2026-10-25)
- **Date:** 2026-10-19
- **Deciders:** QA framework owner (BK-508 automation, Wave 1)
- **Tags:** auth-in-tests, api-components, kata-layer-2, fixtures
- **Supersedes:** —
- **Superseded by:** —

---

## Context

The `api` and `test` fixtures load the PAT that `api-setup` mints and propagate it to every API component through `ApiFixture.setAuthToken`, so by default every request carries `Authorization: Bearer <PAT>` on top of the session cookie that the integration `storageState` provides.

Several Bunkai routes are session-only. They answer 403 when a Bearer header is present, even with the session cookie also attached. This was measured on staging for the workspace data export routes, and the OpenAPI states it for `POST`/`DELETE /api/v1/tokens`, delete workspace and the active-workspace switch. A second effect matters too: the setup PAT is bound to a workspace, so a read such as `GET /api/v1/activity?workspace_id=<synthetic>` sent with it returns a valid but empty page. That is a silent false negative, not an error.

Before BK-508 Wave 1, the framework solved this three different ways: a no-op `setAuthToken` override (`WorkspaceExportApi`, the seeding components), a private `cookieOnlyHeaders()` copy (`WorkspacesApi`), and nothing at all for the new token and activity components. Every new cookie-only domain would have added a fourth copy.

## Decision

We will express "send this request with the session cookie only" in Layer 2 (`ApiBase`), in two forms that share one implementation:

- `RequestOptions.cookieOnly?: boolean`. Every `apiGET`/`apiPOST`/`apiPUT`/`apiPATCH`/`apiDELETE`/`apiPOSTForm` passes it to `buildHeaders(customHeaders, cookieOnly)`, which leaves out `Authorization` when it is set.
- `protected cookieOnlyHeaders(customHeaders?)` covers raw `this.request.*` calls (binary downloads, bodies that must not be attached to Allure verbatim, DELETE with a body).

Invariant: a call to a session-only route, or a workspace-scoped read on a synthetic workspace, MUST use one of these two forms. A component may still ignore the propagated PAT wholesale with a no-op `setAuthToken` override when EVERY route it owns is session-only; existing overrides stay (no churn). New components use the option.

A negative test that must prove "a PAT alone is refused" does not use either form. It runs on a fresh cookieless `APIRequestContext` that carries only the Bearer header (BK-1004, `WorkspaceExportApi.withPatOnlyContext`).

## Consequences

- **Positive:** one place decides how auth rides a request. The token and activity components and the future delete/restore workspace and active-workspace components need no override and no private header copy. `WorkspacesApi` keeps its mixed policy: the list call uses Bearer, while create and delete are cookie-only.
- **Negative / trade-offs:** the decision is per call, so a new call that forgets `cookieOnly` sends the PAT. On a session-only route that shows up as a loud 403. On a workspace-scoped read it shows up as an empty page, which is quiet. Reviewers must check the option on every workspace-scoped read.
- **Neutral / follow-ups:** `buildHeaders` gained a second positional parameter, so existing callers are unchanged. If the cookieless PAT context is needed by a second component, promote `withPatOnlyContext` from `WorkspaceExportApi` to `ApiBase` (plan D6).

## Alternatives considered

- **A no-op `setAuthToken` override per component.** Rejected as the general pattern. It drifts across copies, and it cannot express components with mixed routes, such as `WorkspacesApi.listWorkspaces`, which legitimately accepts Bearer.
- **Stop propagating the PAT from the fixture.** Rejected. Bearer-only routes and the existing AuthApi ATCs rely on it, and the change would move the decision away from the call that knows the route's auth mode.

## References

- `.context/PBI/epics/EPIC-BK-85-account-settings/test-specs/WE-T01-request-workspace-export/automation-plan.md` §2 (D1, D6), risk R6 in `spec.md`
- `tests/components/api/ApiBase.ts` (`RequestOptions.cookieOnly`, `buildHeaders`, `cookieOnlyHeaders`)
- `api/openapi.json`: `DELETE /api/v1/tokens/{id}` 403 ("session-only, `auth: 'cookie-only'`"), `GET /api/v1/activity` (`workspace_id` for Bearer callers)
- Numbering note: ADR-0010 to ADR-0017 are cited by upstream boilerplate files (for example ADR-0014 in `INSTALLER.md`). This project ADR takes the next number that is not cited.
