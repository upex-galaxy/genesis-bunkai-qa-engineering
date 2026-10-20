/**
 * KATA Architecture - Playwright Configuration
 *
 * Comprehensive configuration for E2E and Integration testing
 * with Allure reporting and multi-environment support.
 *
 * IMPORTANT: All environment variables come from @variables.ts
 * This file should NOT read process.env directly (single source of truth).
 */

import { defineConfig, devices } from '@playwright/test';
import { config, env } from '@variables';

// Use values from centralized config (no direct process.env access)
const baseURL = config.baseUrl;

// Tests that need the non-Owner role sessions from roles-setup (BK-1001). They
// run ONLY in the e2e-roles project, so e2e and smoke-ui never need role creds.
const roleSessionTests = /hideDataExportFromNonOwners\.test\.ts$/;

// roles-setup + e2e-roles exist only when asked for, so a plain run never needs
// the role accounts. Asked for = RUN_ROLE_TESTS=1, or `--project=e2e-roles` on
// the command line (what the `test:e2e:roles` script passes). The argv match is
// written back to the env flag so worker processes, which inherit the env but
// not the argv, load the same project list.
// Case-insensitive, like Playwright's own --project filter.
const roleProjectRequested = process.argv.some((arg, i, argv) =>
  arg.toLowerCase() === '--project=e2e-roles'
  || (arg === '--project' && argv[i + 1]?.toLowerCase() === 'e2e-roles'));
if (roleProjectRequested) {
  process.env.RUN_ROLE_TESTS = '1';
}
const includeRoleProjects = process.env.RUN_ROLE_TESTS === '1';

/**
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.test\.ts/,
  // Exclude example files - they are reference templates, not functional tests

  fullyParallel: false,
  forbidOnly: !!process.env.CI,

  // KATA Recommendation: Avoid retries - tests should be deterministic
  // If a test fails, investigate immediately rather than masking with retries
  retries: 0,

  // Single worker for now - increase when tests are stable and parallelizable
  workers: 1,

  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  reporter: [
    // KataReporter: Rich terminal output with step-by-step logging
    // Always active for better debugging in both local and CI environments
    ['./tests/KataReporter.ts'],

    // HTML Report: Visual report with screenshots and traces
    ['html', { outputFolder: 'playwright-report', open: 'never' }],

    // JSON Report: Machine-readable results for CI integrations
    ['json', { outputFile: 'test-results/results.json' }],

    // JUnit Report: XML format for CI tools (Jenkins, Azure DevOps, etc.)
    ['junit', { outputFile: 'test-results/junit.xml' }],

    // Allure Report: Comprehensive test reporting with history and trends
    // See: https://allurereport.org/docs/playwright-configuration
    [
      'allure-playwright',
      {
        resultsDir: config.reporting.allureResultsDir,
        detail: true,
        suiteTitle: true,
        categories: [
          { name: 'Outdated tests', messageRegex: '.*test is outdated.*' },
          { name: 'Product defects', messageRegex: '.*Expect.*', matchedStatuses: ['failed'] },
        ],
        environmentInfo: {
          Environment: env.current,
          BaseURL: baseURL,
          CI: env.isCI ? 'Yes' : 'No',
          NodeVersion: process.version,
        },
      },
    ],

    // GitHub Reporter (optional): Generates annotations in GitHub Actions UI
    // Uncomment to enable inline error annotations in PR file views
    // Note: Not recommended with matrix strategies (errors multiply in UI)
    // See: https://playwright.dev/docs/test-reporters#github-actions-annotations
    // ...(env.isCI ? [['github'] as const] : []),
  ],

  use: {
    baseURL,
    trace: env.isCI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: config.reporting.screenshotOnFailure ? 'only-on-failure' : 'off',
    video: env.isCI && config.reporting.videoOnFailure ? 'retain-on-failure' : 'off',
    headless: env.isCI || config.browser.headless,
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    actionTimeout: config.browser.defaultTimeout / 2,
    navigationTimeout: config.browser.defaultTimeout,
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en',
    },
  },

  projects: [
    // ============================================
    // Global Setup - Runs FIRST (creates dirs, validates env)
    // ============================================
    {
      name: 'global-setup',
      testMatch: /global\.setup\.ts/,
      testDir: './tests/setup',
      teardown: 'global-teardown',
    },

    // ============================================
    // Auth Setup Projects - Run after global-setup
    // ============================================
    {
      name: 'ui-setup',
      testMatch: /ui-auth\.setup\.ts/,
      testDir: './tests/setup',
      dependencies: ['global-setup'],
    },
    {
      name: 'api-setup',
      testMatch: /api-auth\.setup\.ts/,
      testDir: './tests/setup',
      dependencies: ['global-setup'],
    },
    // Non-Owner role sessions (.auth/role-<role>.json); needs the role accounts in .env.
    // Only when the role projects are requested (see includeRoleProjects above).
    ...(includeRoleProjects
      ? [{
          name: 'roles-setup',
          testMatch: /roles-auth\.setup\.ts/,
          testDir: './tests/setup',
          dependencies: ['global-setup'],
          // The sign-in carries role passwords and mints PATs: record nothing a CI artifact could keep
          use: { trace: 'off' as const, video: 'off' as const, screenshot: 'off' as const },
        }]
      : []),

    // ============================================
    // E2E Tests - UI + API with authenticated session
    // ============================================
    {
      name: 'e2e',
      use: {
        ...devices['Desktop Chrome'],
        storageState: config.auth.storageStatePath,
      },
      testMatch: '**/e2e/**/*.test.ts',
      testIgnore: roleSessionTests,
      // api-setup too: E2E tests also call the API with the stored PAT
      dependencies: ['ui-setup', 'api-setup'],
    },

    // ============================================
    // E2E Tests with a second, non-Owner identity (role sessions from roles-setup)
    // Usage: the `test:e2e:roles` script in package.json
    // ============================================
    ...(includeRoleProjects
      ? [{
          name: 'e2e-roles',
          use: {
            ...devices['Desktop Chrome'],
            storageState: config.auth.storageStatePath,
          },
          testMatch: roleSessionTests,
          dependencies: ['ui-setup', 'api-setup', 'roles-setup'],
        }]
      : []),

    // ============================================
    // Integration Tests - API only. The request context carries the session
    // cookie from api-setup (cookie-only routes); the PAT rides as Bearer.
    // ============================================
    {
      name: 'integration',
      testMatch: '**/integration/**/*.test.ts',
      dependencies: ['api-setup'],
      use: {
        storageState: config.auth.apiSessionPath,
      },
    },

    // ============================================
    // Smoke Tests - @critical tagged tests from any suite
    // Usage: bun run test:smoke
    // ============================================
    {
      name: 'smoke-ui',
      grep: /@critical/,
      testMatch: '**/e2e/**/*.test.ts',
      testIgnore: roleSessionTests, // runs in e2e-roles (needs roles-setup)
      // api-setup too: E2E tests also call the API with the stored PAT
      dependencies: ['ui-setup', 'api-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: config.auth.storageStatePath,
      },
    },
    {
      name: 'smoke-api',
      grep: /@critical/,
      testMatch: '**/integration/**/*.test.ts',
      dependencies: ['api-setup'],
      use: {
        storageState: config.auth.apiSessionPath,
      },
    },

    // ============================================
    // Global Teardown - Runs LAST (reports, TMS sync)
    // Activated by `teardown` property on global-setup, NOT by dependencies
    // ============================================
    {
      name: 'global-teardown',
      testMatch: /global\.teardown\.ts/,
      testDir: './tests/teardown',
    },

    // ============================================
    // Sandbox - Isolated tests without dependencies (for debugging/experiments)
    // Usage: bun playwright test --project=sandbox
    // ============================================
    {
      name: 'sandbox',
      testMatch: /.*\.sandbox\.ts/,
      // No dependencies - runs completely isolated
    },
  ],

  // Artifacts directory (add to .gitignore)
  // Contains: screenshots, videos, traces, test results
  outputDir: 'test-results',
});
