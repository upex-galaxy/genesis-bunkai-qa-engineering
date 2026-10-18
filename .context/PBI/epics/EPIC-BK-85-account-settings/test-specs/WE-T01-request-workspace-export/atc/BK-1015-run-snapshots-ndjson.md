# ATC Spec: BK-1015 — downloadArchiveWithNdjsonRunSnapshots

> Ticket: BK-1015 (TC22)
> Component: WorkspaceExportApi (tests/components/api/WorkspaceExportApi.ts)
> Type: API — Verification (archive parsing) / regression guard
> Parent Story: BK-508 · Wave 3 · Regression guard for BK-1025 (fixed and closed 2026-10-18, ReTest BK-1167 PASSED)

## 1. Test Case Summary

| Name | Objective | Precondition | Acceptance Criteria |
|------|-----------|--------------|---------------------|
| Run snapshots encoded as NDJSON | Guard the ratified Tech Lead decision (2026-08-28) and catch any regression of BK-1025 | Synthetic workspace with at least one finished Run (so `runs.ndjson` is non-empty) plus other content | ATP E5; no AC names the encoding (BK-1025 Impact) |

## 2. ATC Contract

```typescript
/**
 * ATC: Run snapshot files in the archive are NDJSON; every other entity file is a JSON array
 * Fixed assertions:
 *  - runs.ndjson: present, non-empty, every non-blank line JSON.parse-s to a non-array object, first char is not '['
 *  - runs.json: absent
 *  - each other *.json entity file (excluding manifest.json): JSON.parse -> Array
 */
@atc('BK-1015')
async downloadArchiveWithNdjsonRunSnapshots(workspaceId: string): Promise<[APIResponse, Record<string, string>]>
```

## 3A. API Details

Private `downloadArchive` -> `extractArchive` (`tests/utils/archive.ts`, `fflate.unzipSync`) -> line-by-line `JSON.parse` / array check. NDJSON file set (Q6 resolved by the BK-1025 retest, ReTest BK-1167): `runs.ndjson` ONLY. `run_steps.json` and `run_atcs.json` are JSON arrays like every other entity file, and an empty workspace exports `runs.ndjson` as 0 bytes.

## 4. Assertions Split

**Fixed**: as contract.
**Test-level**: `test.slow()` (seeding chain + export). No `test.fail`, no `@blocked` tag: BK-1025 is closed.

## 5. Regression guard (formerly expected-fail)

- BK-1025 was fixed and closed on 2026-10-18; ReTest BK-1167 PASSED (only `runs.ndjson` is NDJSON, `runs.json` absent, the other entity files are JSON arrays, manifest counts match).
- The test therefore runs as a regular regression guard: a failure now means BK-1025 regressed. Never `test.skip` it.

## 6. Technique-derivation check

| AC | Technique | ATCs |
|----|-----------|------|
| E5 | EP: run snapshot files (NDJSON partition) vs other entity files (JSON array partition), asserted in one ATC because both are halves of one encoding rule | 1 |

Data condition: `runs.ndjson` must be non-empty; an empty NDJSON file and an empty JSON array `[]` are indistinguishable in intent, so an empty workspace cannot test this (that is BK-999's partition).

## 7. Dependencies

`WorkspaceExportSteps.seedWorkspaceContent(workspaceId, { withRunHistory: true })` (project -> module -> user story -> AC -> ATC -> test -> environment -> run -> finish), `prepareCompletedExport`.

## 8. Data Context

| Precondition | Pattern | Source | Placement | Cleanup |
|--------------|---------|--------|-----------|---------|
| Run history | Generate | seeding chain (`automation-plan.md` §4); alternative Q4 | test body | workspace soft-delete |
| Completed export | Generate | request + poll | test body | same |

## 9. Checklist

- [x] naming · [x] 1 positional param · [x] tuple return · [x] regression guard for BK-1025 (no expected-fail markers)
