/**
 * KATA Architecture - Layer 3: Projects API Component
 *
 * Seeding helpers only (no ATCs): create a project in a workspace, plus the
 * environments and modules that hang from it.
 *
 * Cookie-only: the seeding chain is proven on staging with the session cookie
 * alone, so the Bearer PAT the fixture propagates is deliberately ignored.
 *
 * Endpoints:
 * - POST /api/v1/workspaces/{id}/projects  - Create a project
 * - POST /api/v1/projects/{id}/environments - Create an environment
 * - POST /api/v1/projects/{id}/modules     - Create a module
 */

import type {
  CreateEnvironmentPayload,
  CreateEnvironmentResponse,
  CreateModulePayload,
  CreateModuleResponse,
  CreateProjectPayload,
  CreateProjectResponse,
  Module,
  Project,
  ProjectEnvironment,
} from '@schemas/workspace-content.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { step } from '@utils/decorators';

export class ProjectsApi extends ApiBase {
  private readonly endpoints = {
    projectsOf: (workspaceId: string) => `/workspaces/${workspaceId}/projects`,
    environmentsOf: (projectId: string) => `/projects/${projectId}/environments`,
    modulesOf: (projectId: string) => `/projects/${projectId}/modules`,
  };

  constructor(options: TestContextOptions) {
    super(options);
  }

  /** Cookie-only: the propagated PAT is ignored. */
  override setAuthToken(_token: string) {
    this.authToken = null;
  }

  // ============================================
  // Helpers - Test data setup (no @atc)
  // ============================================

  /** Helper: Create a project in a workspace. Fails fast unless 201. */
  @step
  async createProject(workspaceId: string, payload: CreateProjectPayload): Promise<Project> {
    const [response, body] = await this.apiPOST<CreateProjectResponse, CreateProjectPayload>(
      this.endpoints.projectsOf(workspaceId),
      payload,
    );
    expect(response.status(), 'project creation').toBe(201);
    return body.project;
  }

  /** Helper: Create an environment in a project. Fails fast unless 201. */
  @step
  async createEnvironment(projectId: string, payload: CreateEnvironmentPayload): Promise<ProjectEnvironment> {
    const [response, body] = await this.apiPOST<CreateEnvironmentResponse, CreateEnvironmentPayload>(
      this.endpoints.environmentsOf(projectId),
      payload,
    );
    expect(response.status(), 'environment creation').toBe(201);
    return body.environment;
  }

  /** Helper: Create a module in a project. Fails fast unless 201. */
  @step
  async createModule(projectId: string, payload: CreateModulePayload): Promise<Module> {
    const [response, body] = await this.apiPOST<CreateModuleResponse, CreateModulePayload>(
      this.endpoints.modulesOf(projectId),
      payload,
    );
    expect(response.status(), 'module creation').toBe(201);
    return body.module;
  }
}
