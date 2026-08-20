# Non-Functional Specifications — Bunkai (upex-bunkai-tms)

> Discovery performed against `C:\Users\Genesis Ojose\Documents\Auto\Dojo 4\upex-bunkai-tms` (read-only). Cross-references `architecture.md` (this document's companion — security/performance mechanisms are described there in architectural terms; here they are restated as testable NFR entries) and the HIGH-risk findings already logged in this boilerplate's `CLAUDE.md` §Project Assessment (Phase 1): no CI/CD, tests ungated, single shared Supabase project across environments. Every numeric claim below carries an evidence path or is logged under Discovery Gaps — none are invented.

---

## NFR Summary

| Category | # Entries | Implemented | Partial | Not Implemented |
|---|---|---|---|---|
| Performance (NFR-PERF) | 5 | 3 | 1 | 1 |
| Security (NFR-SEC) | 6 | 5 | 1 | 0 |
| Reliability (NFR-REL) | 5 | 3 | 1 | 1 |
| Scalability (NFR-SCALE) | 3 | 1 | 1 | 1 |
| Observability (NFR-OBS) | 4 | 1 | 0 | 3 |
| **Total** | **23** | **13** | **4** | **6** |

---

## 1. Performance

### NFR-PERF-001: Home Dashboard Coverage Rollup Caching

| Aspect | Value |
|---|---|
| **Target** | 60,000 ms (60 s) TTL per `workspaceId:sortedProjectIds` cache key |
| **Implementation** | In-process `Map`-based memo, read/write functions `readCachedRollup`/`writeCachedRollup`; only a COMPLETE rollup is ever cached (a transient RPC error is never pinned into the cache) |
| **Evidence** | `lib/home/constants.ts:118` (`HOME_COVERAGE_CACHE_TTL_MS = 60_000`), `lib/home/coverage.ts:337-359` |

**Caveat (self-documented in source)**: this cache is explicitly **per-instance, not shared** across Vercel serverless invocations — the code comment states it is "deliberately NOT [Next's `unstable_cache`]... this repo has no data-cache layer" and flags that a shared cache (Redis or the Next Data Cache) is the natural next step if per-instance caching stops being sufficient. On Vercel's serverless model, this means cache-hit rate is effectively unpredictable across cold starts / concurrent instances.

### NFR-PERF-002: OpenAPI Spec HTTP Caching

| Aspect | Value |
|---|---|
| **Target** | `max-age=300, s-maxage=300` (5 minutes) |
| **Implementation** | `force-static` route reading `public/openapi.json` from disk at module load | 
| **Evidence** | `app/api/openapi/route.ts:14-25` |

### NFR-PERF-003: Cursor Pagination Page Sizes

| Aspect | Value |
|---|---|
| **Target** | 50 items/page (bugs, run history, reports) |
| **Implementation** | `BUGS_LIST_MAX_PAGE_SIZE = 50`, `RUN_HISTORY_PAGE_SIZE = 50`, `REPORT_PAGE_SIZE = 50` — cursor-based (`?limit`/`?before=<cursor>`), not offset-based |
| **Evidence** | `lib/bugs/constants.ts:36`, `lib/runs/history-constants.ts:17`, `lib/runs/report-constants.ts:20` |

### NFR-PERF-004: Documented API Rate Limits (drift from code)

| Aspect | Value |
|---|---|
| **Target** | 100 req/min/token for writes, 600 req/min for reads (per the OpenAPI spec's own `info.description`) |
| **Implementation** | **Not found in application code.** The only `rate_limited` (429) throws in this codebase are Supabase Auth's own native rate limits, surfaced through 5 auth routes (`check-email`, `confirm`, `magic-link`, `resend`, `signup`) — there is no general-purpose rate-limiting middleware in `lib/api/` gating the documented per-token numbers |
| **Evidence** | Documented: `upex-bunkai-tms/.context/SRS/api-contracts.yaml:12-13` (target repo's own generated spec). Code-verified absence of enforcement: `grep "'rate_limited'"` across `app/` and `lib/` matches only the 5 Supabase-Auth-surfaced routes plus the envelope's own type definition (`lib/api/error-envelope.ts:27`) |

**Verdict**: **Partial** — documented but not code-verified as enforced for the general API surface. Treat the 100/600 req/min figures as target/aspirational (possibly enforced at the Vercel edge, invisible to this codebase) rather than as a tested SLA. Do not write a load test asserting these numbers are enforced by application code; do write one asserting they are *not* silently bypassable if a future rate-limiter is added.

### NFR-PERF-005: Database Query Shape / Connection Pooling

| Aspect | Value |
|---|---|
| **Target** | Not verifiable from application code — no ORM, no connection-pool config file in the Next.js app itself |
| **Implementation** | Supabase manages pooling server-side (session pooler per `.context/project-config.md`, port 5432, distinct from the 6543 transaction pooler used by DBHub's read-only role). No `DATABASE_POOL_SIZE`-equivalent literal found in `lib/env.ts` |
| **Evidence** | `.context/project-config.md` (DBHub pooler note only — describes the QA read-only inspection path, not the app's own runtime connection strategy) |

**Verdict**: Discovery Gap — the app's own runtime pooling behavior (it calls Supabase via HTTP/PostgREST, not a raw Postgres driver, so "connection pool size" in the traditional sense may not apply) was not independently confirmed.

---

## 2. Security

### NFR-SEC-001: Row-Level Security as Sole Tenant-Isolation Boundary

| Aspect | Value |
|---|---|
| **Target** | Zero cross-tenant row visibility for any authenticated principal outside their own workspace memberships |
| **Implementation** | Every table's cross-tenant access is enforced by Postgres RLS policies keyed to `workspace_members.role` — not application code. A cookie session uses the SSR client directly; a Bearer PAT mints a short-lived per-request user JWT (`impersonatingClient()`) so RLS resolves identically for both |
| **Evidence** | `lib/api/principal.ts:38-127`; validated by `lib/api/rls-parity.test.ts` (mints a real JWT, asserts row-set parity); `.context/business/domain-glossary.md` §3 Rule 1 |

### NFR-SEC-002: Unified Cookie/PAT Authentication (ADR-0001)

| Aspect | Value |
|---|---|
| **Target** | Structurally impossible for a route to forget authentication — no default auth posture exists |
| **Implementation** | 4-value discriminated-union auth posture (`public`, `cookie-only`, `authenticated`, `required`) enforced at the TypeScript type level; `requires: []` does not compile | 
| **Evidence** | `lib/api/handler.ts:41-63` |

### NFR-SEC-003: Capability-Based Authorization (RBAC layer on RLS)

| Aspect | Value |
|---|---|
| **Target** | 4-value capability vocabulary (`atc:read`, `atc:write`, `run:execute`, `workspace:admin`), single source of truth |
| **Implementation** | Cookie sessions implicitly hold all 4; a PAT holds only its minted subset. `workspace:admin` cannot be minted via headless auth (`assertNoGlobalAdminScope`) | 
| **Evidence** | `lib/api/capabilities.ts:31`, `lib/api/pat.ts:22-38` (ADR-0005) |

### NFR-SEC-004: Secret Handling

| Aspect | Value |
|---|---|
| **Target** | `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` never reach the browser bundle |
| **Implementation** | Zod-validated `lib/env.ts` guarded by a `server-only` import; only `NEXT_PUBLIC_*`-prefixed vars are client-exposed, read via static member access (dynamic `process.env[name]` access would resolve `undefined` in the browser build — a Next.js inlining constraint the code comment explicitly documents) |
| **Evidence** | `lib/env.ts:1-13` |

**No hardcoded secrets found** in this pass — confirmed consistent with this boilerplate's own Phase 1 Project Assessment finding.

### NFR-SEC-005: Non-Disclosure Error Responses

| Aspect | Value |
|---|---|
| **Target** | No existence-leak side channel — "not found" and "exists but caller lacks access" return identical responses |
| **Implementation** | Bug detail (`bunkai_bug_json` returns NULL, never an exception), Run/Module-outside-project errors, and the ATC not-found path all collapse into a single non-disclosing shape |
| **Evidence** | `lib/bugs/errors.ts:123-134`, `lib/bugs/errors.ts:89-94` (run `45305` comment: "never confirm whether p_run_id exists at all") |

### NFR-SEC-006: Security Headers / CSP / HSTS

| Aspect | Value |
|---|---|
| **Target** | Not found |
| **Implementation** | `next.config.ts` defines no `headers()` function — no CSP, no `X-Frame-Options`, no `Strict-Transport-Security` set at the application level. No `helmet`-equivalent package in `package.json` |
| **Evidence** | `next.config.ts:1-13` (full file read — 13 lines, no `headers` key); grep for `Content-Security-Policy\|X-Frame-Options\|Strict-Transport-Security\|helmet` across the repo matched only unrelated community-skill reference files under `.agents/skills/`, none in application code |

**Verdict**: Not implemented at the application layer — recommend a security review to confirm whether Vercel's platform defaults supply any of these headers, and add an explicit `headers()` block in `next.config.ts` if not.

---

## 3. Reliability

### NFR-REL-001: Structured Request Logging

| Aspect | Value |
|---|---|
| **Target** | Every API request logged with `request_id`, `method`, `path`, `status`, `duration_ms` |
| **Implementation** | Single-line JSON logger, dependency-free, routed to `console.log`/`warn`/`error` by level — Vercel captures and indexes stdout | 
| **Evidence** | `lib/api/logging.ts:1-35`, called from `lib/api/handler.ts:103-124` |

### NFR-REL-002: Request-ID Propagation

| Aspect | Value |
|---|---|
| **Target** | Every response carries `x-request-id` (inbound header honored, or freshly minted UUID) |
| **Implementation** | `getRequestId()` + `REQUEST_ID_HEADER` set on every response, success or error, so a user can quote it in a bug report | 
| **Evidence** | `lib/api/handler.ts:79,102,115` |

### NFR-REL-003: Idempotency-Key Write Safety

| Aspect | Value |
|---|---|
| **Target** | A retried write with the same `Idempotency-Key` + payload replays the cached response rather than executing twice; concurrent duplicate requests resolve to exactly one winner |
| **Implementation** | SHA-256 payload hash keyed lookup against `idempotency_keys`; unique constraint + compare-and-set claim resolves races; a `failed`-status row permits exactly one retry | 
| **Evidence** | `lib/api/idempotency.ts` (full file, `beginIdempotentRequest`/`recordIdempotencyResult`/`discardIdempotencyResult`) |

### NFR-REL-004: Outbound Call Resilience (Jira only)

| Aspect | Value |
|---|---|
| **Target** | Exponential backoff on Jira REST API 429s, honoring `Retry-After` header when present |
| **Implementation** | `sleep()` + `retryDelayMs()` with an attempt-count-capped backoff schedule | 
| **Evidence** | `lib/jira/client.ts:78-151` |

**Scope note**: this is the **only** outbound-call resilience pattern found in the codebase — no retry/circuit-breaker logic exists for the app's own Supabase calls (which is defensible: Supabase Auth/RLS failures are typically not transient-retriable, but this was not independently confirmed as a deliberate design choice vs. an omission).

### NFR-REL-005: Error Boundaries / Health Endpoint

| Aspect | Value |
|---|---|
| **Target** | Not found for the general app; one API health route exists |
| **Implementation** | `app/api/v1/health` route segment exists (per the app-api route tree). Only one `not-found.tsx` was found (`app/(app)/projects/[projectSlug]/not-found.tsx`) — **no `error.tsx` files exist anywhere in `app/`**, meaning an unhandled render error in any route falls through to Next.js's default error UI, not a project-styled boundary | 
| **Evidence**: `find app -iname "error.tsx"` returned zero matches; `find app -iname "not-found.tsx"` returned exactly one match |

**Verdict**: Partial — a health endpoint exists (content/response shape not independently verified — Discovery Gap), but React error boundaries (`error.tsx`) are absent app-wide.

---

## 4. Scalability

### NFR-SCALE-001: Stateless Serverless Deployment Model

| Aspect | Value |
|---|---|
| **Target** | Horizontally scalable via Vercel's serverless/edge model |
| **Implementation** | Next.js 15 App Router on Vercel, zero-config Git-integrated deploy, no `vercel.json` (defaults). No in-memory session state relied upon for correctness — auth state lives in the Supabase-issued cookie/JWT, not server memory (the one exception being the explicitly per-instance, non-authoritative coverage cache, NFR-PERF-001) | 
| **Evidence** | `.context/project-config.md`; `lib/home/coverage.ts:319-333` (cache-scope caveat) |

### NFR-SCALE-002: Single Shared Supabase Project Across Environments

| Aspect | Value |
|---|---|
| **Target** | N/A — this is a risk, not a target |
| **Implementation** | Local, staging, and production all point at the **same** Supabase project (`fmbpikzpkafptqximhxn`) — confirmed by `.context/project-config.md`'s Environments table | 
| **Evidence** | `.context/project-config.md:36-42` |

**Cross-reference**: this is already logged as a **HIGH risk** in this boilerplate's own `CLAUDE.md` §Project Assessment (Phase 1). Restated here as an explicit scalability/isolation NFR because it directly bounds what automated testing can safely do — any test-data generation strategy must assume production-adjacent blast radius, not environment-level isolation. No RLS policy or schema mechanism partitions "staging data" from "production data" beyond application-level workspace scoping.

### NFR-SCALE-003: Async Processing / Background Jobs

| Aspect | Value |
|---|---|
| **Target** | Not found |
| **Implementation** | No queue library (`bullmq`, `pg-boss`, etc.) in `package.json`. The one asynchronous, long-running process — Jira Import — is implemented as a **polled** job (`import_jobs.status`, `next_page_token`), not a background worker/queue | 
| **Evidence** | `package.json` dependency list (no queue lib present); `.context/business/domain-glossary.md` §1 (`ImportJob` entity, "Asynchronous, one-way, polled import") |

**Verdict**: Not implemented as a general capability — the only async pattern in the app is the Jira import's own client-side polling loop, not a durable server-side job queue.

---

## 5. Observability

### NFR-OBS-001: Structured Access Logs (stdout only)

| Aspect | Value |
|---|---|
| **Target** | Every API request/error logged as one JSON line |
| **Implementation** | `logRequest()` — see NFR-REL-001. This is the **only** observability mechanism found in the codebase | 
| **Evidence** | `lib/api/logging.ts` |

### NFR-OBS-002: Application Performance Monitoring (APM)

| Aspect | Value |
|---|---|
| **Target** | Not implemented — recommend adding |
| **Implementation** | No `@sentry/*`, `@datadog/*`, `newrelic`, or `@opentelemetry/*` dependency found in `package.json` | 
| **Evidence** | `.context/project-config.md` (Phase 1 already confirmed this absence); `package.json` dependency list re-confirmed in this pass |

### NFR-OBS-003: Metrics / Dashboards

| Aspect | Value |
|---|---|
| **Target** | Not implemented — recommend adding |
| **Implementation** | No `prom-client` or custom counter/gauge/histogram library found. In-app "metrics" (`lib/metrics/`) are product-domain analytics (defect heatmap, trend direction) surfaced to end users, not operational/infra metrics for the engineering team | 
| **Evidence** | `lib/metrics/defect-heatmap.ts` (product feature, not ops tooling — do not conflate the two when scoping observability work) |

### NFR-OBS-004: Alerting

| Aspect | Value |
|---|---|
| **Target** | Not implemented — recommend adding |
| **Implementation** | No alerting mechanism found; no PagerDuty/Opsgenie integration, no threshold-based notification wired to the structured logs | 
| **Evidence** | Absence confirmed by the same `package.json` scan as NFR-OBS-002/003 |

**This entire category is mostly "Not implemented — recommend adding," stated plainly per doctrine.** The only real signal available today for production issues is manually reading Vercel's captured stdout logs (NFR-OBS-001) — there is no dashboard, no metric, no alert.

---

## 6. Compliance

**Needs Review.** No evidence either way was found for GDPR, SOC2, HIPAA, or PCI-DSS posture:

- No data-retention policy code found (though `workspaces.plan` tier descriptions in `domain-glossary.md` §2 mention retention windows — 30-day Community, 90-day Cloud — as **billing-tier marketing copy**, not a code-enforced deletion job; no cron/scheduled deletion job was found in this pass).
- No consent-management, cookie-banner, or data-export/right-to-erasure endpoint was found under `app/api/v1/`.
- No PCI scope applies directly (no payment processor integration found — see `architecture.md` Discovery Gaps).
- This is a Discovery Gap, not a finding of non-compliance or compliance — mark **Needs Review** and route to whoever owns the product's actual compliance posture before any claim is made either way.

---

## Discovery Gaps

- **NFR-PERF-005**: application-level DB connection/pooling strategy not independently confirmed (Supabase is accessed via HTTP/PostgREST client, not a raw driver — traditional "pool size" framing may not even apply; needs a security/infra-focused follow-up).
- **NFR-PERF-004**: whether the documented 100/600 req/min rate limits are enforced anywhere outside this codebase (e.g., Vercel Edge Config, a WAF, or Supabase's own API gateway) was not verified — only the absence of enforcement in *this* codebase is confirmed.
- **NFR-SEC-006**: whether Vercel's platform defaults supply any baseline security headers (some do, e.g. certain `X-*` headers on their edge) was not tested — this pass only confirms the application does not explicitly set them.
- **NFR-REL-005**: `app/api/v1/health` route's actual response shape/checks (DB connectivity? Supabase reachability? just a 200 OK?) were not opened in this pass.
- **Password hashing / storage**: Supabase Auth is a managed service; Bunkai's own code never handles raw passwords, so this repo cannot independently confirm bcrypt/argon2 usage (inherited, not implemented, here).
- **TLS/HSTS**: presumed inherited from Vercel's default HTTPS termination; not independently verified at the network level (out of scope for a read-only code discovery pass).
- **Compliance category**: no dedicated review was performed; "Needs Review" is the entire finding, not a placeholder for a future number.

---

## QA Relevance

| NFR | Testable? | Suggested Tool | Note |
|---|---|---|---|
| NFR-PERF-001 (coverage cache TTL) | Yes | Integration test asserting cache-hit within 60s window, miss after | Test the TTL boundary itself (59s vs 61s) as a BVA pair |
| NFR-PERF-002 (`/api/openapi` cache headers) | Yes | `curl -I` / Playwright API request assertion on `cache-control` header | Cheap, deterministic, worth a smoke check |
| NFR-PERF-003 (pagination limits) | Yes | API test: request `limit=51` on a 50-max endpoint, assert clamping/rejection behavior | Boundary-value candidate |
| NFR-PERF-004 (rate limits) | **Not testable as an enforced SLA today** | k6/Artillery **only** if/when a rate-limiter is actually added — testing against the documented-but-unenforced numbers now would produce a false "fails" against a spec that isn't live code | Flag to the team before writing any rate-limit test |
| NFR-SEC-001 (RLS isolation) | Yes | Playwright/API test mirroring `lib/api/rls-parity.test.ts`'s own pattern — mint two users, two workspaces, assert zero cross-visibility | Already has a reference implementation to copy the pattern from |
| NFR-SEC-002/003 (auth posture, capabilities) | Yes | API test matrix: every route × every capability-missing scenario → assert 403, not 200 | High ROI — the type-level posture requirement means every route already declares its expected gate |
| NFR-SEC-006 (security headers) | Yes | OWASP ZAP baseline scan against a deployed staging URL, or a simple header-assertion test | Currently would fail — expected, not a bug, until the recommendation is acted on |
| NFR-REL-003 (idempotency) | Yes | API test: same `Idempotency-Key` + same payload twice → same response; same key + different payload → 409 | Reference test already exists: `lib/api/idempotency.test.ts` |
| NFR-REL-004 (Jira retry/backoff) | Yes, with a mocked 429 | Unit/integration test mocking a 429 response with `Retry-After`, asserting the backoff delay | Reference: `lib/jira/client.ts:78-151` |
| NFR-REL-005 (error boundaries) | Yes | Manual/exploratory: force a render error on any route lacking `error.tsx`, confirm it falls to Next's default (undesirable) UI | Currently would "fail" as a UX finding, not a functional bug — file as an Improvement per defect-management doctrine, not a Bug |
| NFR-SCALE-002 (shared Supabase project) | Indirectly | N/A — process control, not a test | Every test-data strategy for this project must assume this constraint; document it in any test-automation implementation plan rather than trying to "test" it |
| NFR-OBS-* (all) | Not testable in the traditional sense | N/A | Nothing to assert against — these are "recommend adding" gaps, not regressions to catch |

**Overall testing posture**: Performance and Security NFRs above have concrete, evidence-backed hooks worth automating. Observability NFRs have nothing to test because nothing is implemented — do not manufacture synthetic "observability tests" against absent tooling; instead surface the gap as a process recommendation (already done above) and move on.
