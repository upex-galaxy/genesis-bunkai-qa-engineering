# Risk Assessment — Phase 1

> Generated from the Phase 1 testing-maturity / documentation / code-quality / CI-CD assessment of the target repo `upex-bunkai-tms` (Bunkai). See `CLAUDE.md` → `## Project Assessment (Phase 1)` for the full assessment this file was derived from. This file covers only the HIGH-severity risks; MEDIUM/LOW risks are tracked in the CLAUDE.md risk table only.

Assessment Date: 2026-08-19

---

## HIGH-1: No CI/CD pipeline

**Severity**: HIGH

**Description**: The target repo has no `.github/workflows/` directory. There is no GitHub Actions (or any other CI provider) configuration. Confirmed via direct directory listing at repo root.

**Impact**: Lint, type-check, and test failures can be pushed to `main` and deployed (Vercel deploys directly off `main`/`staging` via Git integration, per `.context/project-config.md`) without any automated gate catching them first. Quality is currently enforced only by local Husky git hooks (`pre-commit`, `pre-push`), which are bypassable (`--no-verify`) and only run on the machine of whoever is committing — they provide no protection against a contributor who skips hooks, force-pushes, or commits from an environment where hooks weren't installed.

**Recommendation**: Add a GitHub Actions workflow that runs `bun run repo:check` (format, lint, types, vars, skills checks) and `bun test` on every pull request and on push to `main`, with branch protection requiring the workflow to pass before merge.

**Owner**: Discovery Gap — assign at Phase 1 review

---

## HIGH-2: Test suite exists but is not wired into any automated gate

**Severity**: HIGH

**Description**: The repo has 145 `*.test.ts` files using `bun:test`, including meaningful integration-style coverage (cross-tenant RLS-parity tests, RPC tests, isolation tests). However, neither `.husky/pre-commit` nor `.husky/pre-push` runs `bun test` — pre-commit runs `lint-staged` + `types:check` + `vars:check` + `skills:check`; pre-push runs `format:check` + `lint:check` + `vars:env:check` + `skills:registry:check`. `test` exists only as a standalone `bun run test` script, not part of `repo:check`/`repo:fix` either. Combined with HIGH-1 (no CI), this means the test suite currently has **no automated trigger at all** — it only runs when a developer remembers to run it manually.

**Impact**: A substantial, well-designed test investment (isolation guards, RLS-parity regression tests explicitly tied to an ADR — see `lib/api/rls-parity.test.ts` referencing ADR-0001) provides zero regression protection in practice, because nothing forces it to run. A change that breaks cross-tenant isolation could merge and deploy silently.

**Recommendation**: At minimum, add `bun test` to the CI workflow proposed in HIGH-1. Additionally consider adding it to `.husky/pre-push` (mirroring how `format:check`/`lint:check` already run there) for local enforcement before code leaves the developer's machine.

**Owner**: Discovery Gap — assign at Phase 1 review

---

## HIGH-3: Single Supabase project shared across all environments (no environment/data isolation)

**Severity**: HIGH

**Description**: Per `.context/project-config.md` (lines 27-41), the target repo uses a single Supabase project/tenancy (project ref `fmbpikzpkafptqximhxn`) shared across local, staging, and production environments. Staging (`https://staging-upexbunkai.vercel.app`) points at the same database as production.

**Impact**: Any testing activity against staging — manual QA, automated regression suites, or exploratory testing — reads and writes the same database production traffic depends on. There is no environment boundary to prevent test data from corrupting production records, or production data from leaking into a test run's assertions. This risk compounds directly with HIGH-1 and HIGH-2: once a CI pipeline exists and starts running tests automatically against staging, it will be running against production data with no safety net.

**Recommendation**: Provision a separate Supabase project per environment (or, as a lower-cost interim step, enforce strictly isolated schemas/seed data scoped to test runs) before any automated regression suite is pointed at staging. This should be resolved, or explicitly accepted as a scoped risk with compensating controls, before Phase 5/6 (test-automation, regression-testing) begin executing against staging.

**Owner**: Discovery Gap — assign at Phase 1 review
