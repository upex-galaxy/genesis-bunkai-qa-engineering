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
 * - POST /api/v1/workspaces/{id}/projects  - Create a project (Idempotency-Key per call)
 * - POST /api/v1/projects/{id}/environments - Create an environment
 * - POST /api/v1/projects/{id}/modules     - Create a module
 * - POST /api/v1/projects/{id}/milestones  - Create a milestone
 */

import type {
  CreateEnvironmentPayload,
  CreateEnvironmentResponse,
  CreateMilestonePayload,
  CreateMilestoneResponse,
  CreateModulePayload,
  CreateModuleResponse,
  CreateProjectPayload,
  CreateProjectResponse,
  Milestone,
  Module,
  Project,
  ProjectEnvironment,
} from '@schemas/workspace-content.types';
import type { TestContextOptions } from '@TestContext';

import { randomUUID } from 'node:crypto';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { step } from '@utils/decorators';

export class ProjectsApi extends ApiBase {
  private readonly endpoints = {
    projectsOf: (workspaceId: string) => `/workspaces/${workspaceId}/projects`,
    environmentsOf: (projectId: string) => `/projects/${projectId}/environments`,
    modulesOf: (projectId: string) => `/projects/${projectId}/modules`,
    milestonesOf: (projectId: string) => `/projects/${projectId}/milestones`,
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
      { headers: { 'Idempotency-Key': `qa-auto-${randomUUID()}` } },
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

  /** Helper: Create a milestone in a project (seed only). Fails fast unless 201. */
  @step
  async createMilestone(projectId: string, payload: CreateMilestonePayload): Promise<Milestone> {
    const [response, body] = await this.apiPOST<CreateMilestoneResponse, CreateMilestonePayload>(
      this.endpoints.milestonesOf(projectId),
      payload,
    );
    expect(response.status(), 'milestone creation').toBe(201);
    return body.milestone;
  }
}
