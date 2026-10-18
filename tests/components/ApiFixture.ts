/**
 * KATA Architecture - Layer 4: API Fixture
 *
 * Dependency Injection container for all API components.
 * Provides unified access to API testing capabilities.
 *
 * All API components share the same request context from TestContext,
 * ensuring consistent authentication and request configuration.
 *
 * HOW TO ADD NEW API COMPONENTS:
 * 1. Create your component in tests/components/api/YourApi.ts
 * 2. Import it here
 * 3. Add as readonly property
 * 4. Initialize in constructor passing the options
 */

import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { AtcsApi } from '@api/AtcsApi';
import { AuthApi } from '@api/AuthApi';
import { ProjectsApi } from '@api/ProjectsApi';
import { RunsApi } from '@api/RunsApi';
import { TestsApi } from '@api/TestsApi';
import { UserStoriesApi } from '@api/UserStoriesApi';
import { WorkspaceExportApi } from '@api/WorkspaceExportApi';
import { WorkspacesApi } from '@api/WorkspacesApi';

// ============================================
// API Fixture Class
// ============================================

export class ApiFixture extends ApiBase {
  /** Auth component - handles login and token management */
  readonly auth: AuthApi;

  /** Workspaces component - list / resolve the caller's workspaces */
  readonly workspaces: WorkspacesApi;

  /** Workspace data export component (BK-508) - cookie-only routes */
  readonly workspaceExport: WorkspaceExportApi;

  /** Content seeding helpers (cookie-only): projects, environments, modules */
  readonly projects: ProjectsApi;

  /** Content seeding helpers (cookie-only): user stories, acceptance criteria */
  readonly userStories: UserStoriesApi;

  /** Content seeding helpers (cookie-only): ATCs */
  readonly atcs: AtcsApi;

  /** Content seeding helpers (cookie-only): tests */
  readonly tests: TestsApi;

  /** Content seeding helpers (cookie-only): runs */
  readonly runs: RunsApi;

  constructor(options: TestContextOptions) {
    super(options);

    // All components receive the same options (same request context)
    this.auth = new AuthApi(options);
    this.workspaces = new WorkspacesApi(options);
    this.workspaceExport = new WorkspaceExportApi(options);
    this.projects = new ProjectsApi(options);
    this.userStories = new UserStoriesApi(options);
    this.atcs = new AtcsApi(options);
    this.tests = new TestsApi(options);
    this.runs = new RunsApi(options);
  }

  // ============================================
  // Token Propagation to Child Components
  // ============================================

  /**
   * Set authentication token for all API components.
   * This ensures all components use the same token for authenticated requests.
   */
  override setAuthToken(token: string) {
    super.setAuthToken(token);
    this.auth.setAuthToken(token);
    this.workspaces.setAuthToken(token);
    this.workspaceExport.setAuthToken(token);
    this.projects.setAuthToken(token);
    this.userStories.setAuthToken(token);
    this.atcs.setAuthToken(token);
    this.tests.setAuthToken(token);
    this.runs.setAuthToken(token);
  }

  /**
   * Clear authentication token from all API components.
   */
  override clearAuthToken() {
    super.clearAuthToken();
    this.auth.clearAuthToken();
    this.workspaces.clearAuthToken();
    this.workspaceExport.clearAuthToken();
    this.projects.clearAuthToken();
    this.userStories.clearAuthToken();
    this.atcs.clearAuthToken();
    this.tests.clearAuthToken();
    this.runs.clearAuthToken();
  }
}
