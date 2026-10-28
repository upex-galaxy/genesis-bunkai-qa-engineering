/**
 * KATA Architecture - Layer 3: Workspaces API Component
 *
 * Helpers over the caller's workspaces. Other components use them to resolve a
 * workspace id (e.g. the one the caller owns) before acting on it, and suites
 * that need isolation create and soft-delete their own synthetic workspace.
 *
 * Endpoints:
 * - GET    /api/v1/workspaces      - List workspaces the caller belongs to (cookie or Bearer)
 * - POST   /api/v1/workspaces      - Create a workspace (sent cookie-only, see below, with an Idempotency-Key)
 * - DELETE /api/v1/workspaces/{id} - Soft-delete an owned workspace (owner-only, session-only)
 * - POST   /api/v1/me/active-workspace     - Switch the active workspace (cookie-only, sets `bk_active_ws`)
 * - POST   /api/v1/workspaces/{id}/invites - Invite an email with a role (admin/owner)
 * - POST   /api/v1/invites/accept          - Redeem an invite token (the invitee's own session)
 * - DELETE /api/v1/workspaces/{id}/membership - Leave a workspace (the member's own session, cookie-only)
 *
 * Create and delete are sent WITHOUT the Bearer PAT the fixture propagates: the
 * delete route is session-only, and the seeding chain was proven on staging with
 * the session cookie alone. The list helper keeps the default headers.
 * Cookie-only headers come from ApiBase (`cookieOnlyHeaders`, ADR-0018).
 */

import type { APIResponse } from '@playwright/test';
import type {
  AcceptInvitePayload,
  AcceptInviteResponse,
  CreateInvitePayload,
  CreateInviteResponse,
  CreateWorkspacePayload,
  CreateWorkspaceResponse,
  DeleteWorkspacePayload,
  DeleteWorkspaceResponse,
  InviteRole,
  ListWorkspacesResponse,
  SetActiveWorkspacePayload,
  SetActiveWorkspaceResponse,
  Workspace,
  WorkspaceWithRole,
} from '@schemas/workspaces.types';
import type { TestContextOptions } from '@TestContext';

import { randomUUID } from 'node:crypto';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { attachRequestResponseToAllure } from '@utils/allure';
import { step } from '@utils/decorators';

export type {
  CreateWorkspacePayload,
  CreateWorkspaceResponse,
  DeleteWorkspaceResponse,
  InviteRole,
  ListWorkspacesResponse,
  Workspace,
  WorkspaceWithRole,
} from '@schemas/workspaces.types';

export class WorkspacesApi extends ApiBase {
  private readonly endpoints = {
    list: '/workspaces',
    byId: (workspaceId: string) => `/workspaces/${workspaceId}`,
    activeWorkspace: '/me/active-workspace',
    invitesOf: (workspaceId: string) => `/workspaces/${workspaceId}/invites`,
    acceptInvite: '/invites/accept',
    membershipOf: (workspaceId: string) => `/workspaces/${workspaceId}/membership`,
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
   * `timeoutMs` bounds the request (default: the request context's timeout).
   */
  @step
  async createWorkspace(payload: CreateWorkspacePayload, timeoutMs?: number): Promise<Workspace> {
    const response = await this.request.post(this.apiEndpoint(this.endpoints.list), {
      headers: this.cookieOnlyHeaders({ 'Idempotency-Key': `qa-auto-${randomUUID()}` }),
      data: payload,
      timeout: timeoutMs,
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

  /**
   * Helper: Make a workspace the caller's active one. Cookie-only route: it
   * answers by setting the `bk_active_ws` cookie on the request context that
   * sent it, so in a browser test call it on `page.request` (the page's own
   * cookie jar). Fails fast unless 200. `timeoutMs` bounds the request
   * (default: the request context's timeout).
   */
  @step
  async setActiveWorkspace(workspaceId: string, timeoutMs?: number): Promise<void> {
    const payload: SetActiveWorkspacePayload = { workspace_id: workspaceId };
    const response = await this.request.post(this.apiEndpoint(this.endpoints.activeWorkspace), {
      headers: this.cookieOnlyHeaders(),
      data: payload,
      timeout: timeoutMs,
    });
    const body = await this.getResponseJsonObject<SetActiveWorkspaceResponse>(response);
    await attachRequestResponseToAllure({
      url: this.endpoints.activeWorkspace,
      method: 'POST',
      responseBody: body,
      requestBody: payload,
    });

    expect(response.status(), 'active workspace switch').toBe(200);
    expect(body.id, 'active workspace switch: the requested workspace').toBe(workspaceId);
  }

  /**
   * Helper: Invite an email into a workspace with a role (the caller must be
   * admin or owner). Returns the raw invite token, which the API returns once;
   * it never reaches a step title or an attachment. Fails fast unless 201.
   */
  @step
  async createInvite(args: {
    workspaceId: string
    email: string
    role: InviteRole
  }): Promise<{ inviteId: string, token: string }> {
    const endpoint = this.endpoints.invitesOf(args.workspaceId);
    const payload: CreateInvitePayload = { email: args.email, role: args.role };
    const response = await this.request.post(this.apiEndpoint(endpoint), {
      headers: this.cookieOnlyHeaders(),
      data: payload,
    });
    const body = await this.getResponseJsonObject<CreateInviteResponse>(response);
    await attachRequestResponseToAllure({
      url: endpoint,
      method: 'POST',
      responseBody: { invite: body.invite, token: '***', accept_url: '***' },
      requestBody: payload,
    });

    expect(response.status(), 'invite creation').toBe(201);
    expect(body.invite?.role, 'invite creation: the requested role').toBe(args.role);
    return { inviteId: body.invite.id, token: body.token };
  }

  /**
   * Helper: Redeem an invite token on the invitee's own session (call it on
   * the invitee's request context). The token travels under the `token` key,
   * which the step title masks. Fails fast unless 200.
   */
  @step
  async acceptInvite(args: { token: string }): Promise<AcceptInviteResponse> {
    const payload: AcceptInvitePayload = { token: args.token };
    const response = await this.request.post(this.apiEndpoint(this.endpoints.acceptInvite), {
      headers: this.cookieOnlyHeaders(),
      data: payload,
    });
    const body = await this.getResponseJsonObject<AcceptInviteResponse>(response);
    await attachRequestResponseToAllure({
      url: this.endpoints.acceptInvite,
      method: 'POST',
      responseBody: body,
      requestBody: { token: '***' },
    });

    expect(response.status(), 'invite acceptance').toBe(200);
    return body;
  }

  /**
   * Helper: The caller leaves a workspace (removes their OWN membership; call it
   * on the member's request context). The product has no Owner-side member
   * removal route, so this is how a granted role is ended before the Owner
   * soft-deletes the workspace: a soft-delete emails every active member.
   * Idempotent cleanup: 200 (left) and 404 (not an active member, e.g. the
   * invite was never accepted) both count as success; anything else fails.
   */
  @step
  async leaveWorkspace(workspaceId: string): Promise<void> {
    const [response] = await this.apiDELETE(this.endpoints.membershipOf(workspaceId), { cookieOnly: true });
    expect([200, 404], 'leave workspace').toContain(response.status());
  }
}
