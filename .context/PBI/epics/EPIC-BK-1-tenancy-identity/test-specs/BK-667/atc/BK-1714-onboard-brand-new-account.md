# ATC Spec: BK-1714 — completeOnboardingCreatingFirstWorkspace

> Ticket: BK-1714 (TC25)
> Component: OnboardingPage (NEW, `tests/components/ui/OnboardingPage.ts`); precondition helper on LoginPage (EXISTS)
> Type: UI — Positive / end-to-end journey
> Parent Story: BK-667 · Wave 3 · Spec file: `tests/e2e/onboarding/onboardNewAccount.test.ts` · Fixture `{ ui }`, clean storage

## 1. Test Case Summary

| Name | Objective | Precondition | AC |
|------|-----------|--------------|----|
| Brand-new account reaches a usable product | The signup path is not bricked by the required header | Account just created and confirmed through `/login` with the code from a real inbox (Q3) | AC-06 |

## 2. ATC Contract

```typescript
@atc('BK-1714')
async completeOnboardingCreatingFirstWorkspace(args: { name: string, slug: string, onCreated?: (workspaceId: string) => void }): Promise<{ workspaceId: string, landingPath: string }>
```

Fixed assertions:
- Page is `/onboarding` (R9, review decision 2026-11-19): the ATC asserts the post-verify landing is `/onboarding` and fails otherwise; it never opens `/onboarding` itself. `onCreated(workspaceId)` fires as soon as the 201 is parsed so the spec cleans up even when a later check fails
- Fill name and slug, click "Create workspace"; the captured `POST **/api/v1/workspaces` request carries `idempotency-key` matching `^[\w-]{8,128}$`; its response is 201
- No `/api/v1/` response with status >= 400 between submit and landing (collector on `page.on('response')`)
- Lands on `/projects`
- Test level (fixture `{ test }`): `AuthApi.getCurrentUser()` on an `ApiFixture` built over `page.request` (the new account's session) -> 200, exactly 1 workspace, named `name`, owned by this user

## 3B. UI Details

Locators (the onboarding form has no test ids): role textbox `/Workspace name/`, role textbox `/URL slug/`, role button `/Create workspace/`. Signup helper `LoginPage.createAccountThroughSignup({ email, password, readCode })`: placeholder `qa@your-org.dev` -> "Continue" -> `At least 8 characters` -> "Create account" -> `Verification code` -> "Verify and continue". `readCode` = `waitForSignupOtp(email, { timeoutMs: 90_000 })`; `null` -> `test.skip` naming `RESEND_API_KEY` (`config.qaInbox.apiKeyVarName`); the receiving domain is `config.qaInbox.domain`.

## 4. Assertions Split

**Fixed**: as contract. **Test-level**: the signup precondition (helper, no `@atc`).

## 7-8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Brand-new account | Generate | UI signup, email `qa-auto-bk667-<ts>-<rand>@<config.qaInbox.domain>`, password from `DataFactory` | test body | auth user persists (no admin API, R7) |
| OTP | Discover | Resend receiving API | test body | none; email content is data only |
| First workspace | Generate | the ATC | in ATC | `afterEach` soft-delete via `page.request` |

Feasibility: NEEDS-INBOX (Q3). Never admin API, service role, magic link or DB session rows.
