/**
 * KATA Architecture - Layer 3: Workspaces API Component
 *
 * Helpers over the caller's workspaces. Other components use them to resolve a
 * workspace id (e.g. the one the caller owns) before acting on it, and suites
 * that need isolation create and soft-delete their own synthetic workspace.
 *
 * Endpoints:
 * - GET    /api/v1/workspaces      - List workspaces the caller belongs to (cookie or Bearer)
 * - POST   /api/v1/workspaces      - Create a workspace (sent cookie-only, see below)
 * - DELETE /api/v1/workspaces/{id} - Soft-delete an owned workspace (owner-only, session-only)
 *
 * Create and delete are sent WITHOUT the Bearer PAT the fixture propagates: the
 * delete route is session-only, and the seeding chain was proven on staging with
 * the session cookie alone. The list helper keeps the default headers.
 */

import type { APIResponse } from '@playwright/test';
import type {
  CreateWorkspacePayload,
  CreateWorkspaceResponse,
  DeleteWorkspacePayload,
  DeleteWorkspaceResponse,
  ListWorkspacesResponse,
  Workspace,
  WorkspaceWithRole,
} from '@schemas/workspaces.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { attachRequestResponseToAllure } from '@utils/allure';
import { step } from '@utils/decorators';

export type {
  CreateWorkspacePayload,
  CreateWorkspaceResponse,
  DeleteWorkspaceResponse,
  ListWorkspacesResponse,
  Workspace,
  WorkspaceWithRole,
} from '@schemas/workspaces.types';

export class WorkspacesApi extends ApiBase {
  private readonly endpoints = {
    list: '/workspaces',
    byId: (workspaceId: string) => `/workspaces/${workspaceId}`,
  };

  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // Helpers - Read-only operations (no @atc)
  // ============================================

  /**
   * Helper: List the workspaces the caller belongs to, with the caller's role.
   */
  @step
  async listWorkspaces(): Promise<[APIResponse, ListWorkspacesResponse]> {
    return this.apiGET<ListWorkspacesResponse>(this.endpoints.list);
  }

  /**
   * Helper: Return the first workspace the caller owns. Fails fast when none.
   */
  @step
  async getOwnedWorkspace(): Promise<WorkspaceWithRole> {
    const [response, body] = await this.listWorkspaces();
    expect(response.status()).toBe(200);
    const owned = body.workspaces.find(workspace => workspace.role === 'owner');
    if (!owned) {
      throw new Error('The authenticated user owns no workspace; owner-only flows cannot run.');
    }
    return owned;
  }

  // ============================================
  // Helpers - Test data setup / cleanup (no @atc)
  // ============================================

  /**
   * Helper: Create a workspace owned by the caller. Fails fast unless 201.
   */
  @step
  async createWorkspace(payload: CreateWorkspacePayload): Promise<Workspace> {
    const response = await this.request.post(this.apiEndpoint(this.endpoints.list), {
      headers: this.cookieOnlyHeaders(),
      data: payload,
    });
    const body = await this.getResponseJsonObject<CreateWorkspaceResponse>(response);
    await attachRequestResponseToAllure({ url: this.endpoints.list, method: 'POST', responseBody: body, requestBody: payload });

    expect(response.status(), 'workspace creation').toBe(201);
    return body.workspace;
  }

  /**
   * Helper: Soft-delete an owned workspace. The route requires the workspace
   * name as confirmation. Fails fast unless 200.
   */
  @step
  async deleteWorkspace(args: { workspaceId: string, confirmName: string }): Promise<DeleteWorkspaceResponse> {
    const endpoint = this.endpoints.byId(args.workspaceId);
    const payload: DeleteWorkspacePayload = { confirm_name: args.confirmName };
    const response = await this.request.delete(this.apiEndpoint(endpoint), {
      headers: this.cookieOnlyHeaders(),
      data: payload,
    });
    const body = await this.getResponseJsonObject<DeleteWorkspaceResponse>(response);
    await attachRequestResponseToAllure({ url: endpoint, method: 'DELETE', responseBody: body, requestBody: payload });

    expect(response.status(), 'workspace soft-delete').toBe(200);
    return body;
  }

  /** Default headers without the Bearer PAT (session cookie rides the request context). */
  private cookieOnlyHeaders(): Record<string, string> {
    return { ...this.requestHeaders };
  }
}
