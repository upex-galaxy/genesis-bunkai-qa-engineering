/**
 * KATA Architecture - Layer 3: Workspace Deletion API Component (BK-512)
 *
 * Owns the ATCs of "Delete a workspace I own" that run over the API: the
 * non-Owner refusal, the access cut at `deleted_at` (PATs, invites, every child
 * entity), the isolation of a second workspace and the restore.
 *
 * DELETE and restore are Owner-only and cookie-only (a Bearer PAT answers 403,
 * ADR-0018), and every read the ATCs make runs on a session cookie as well, so
 * this component never sends the PAT the fixture propagates (setAuthToken is a
 * no-op). The only Bearer calls are the negative PAT checks, which run on their
 * own cookieless context.
 *
 * Callbacks, not request contexts: the ATC step title prints its arguments, and
 * a Playwright request context is a circular object. Callers pass functions
 * that act on the other identity's own session (`deleteAsMember`,
 * `acceptAsInvitee`, ...).
 *
 * Endpoints:
 * - DELETE /api/v1/workspaces/{id}         - Soft-delete (Owner, session-only)
 * - POST   /api/v1/workspaces/{id}/restore - Restore (Owner, session-only)
 * - GET    /api/v1/workspaces/{id}         - Read one workspace
 * - GET    /api/v1/workspaces/{id}/{recent-projects,open-bugs,coverage} - content read-backs
 * - POST   /api/v1/invites/accept          - Invite redemption (envelope parity)
 * - per-entity probes (see ENTITY_PROBES)
 */

import type { DeletionEntityType } from '@data/constants';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { ErrorEnvelope } from '@schemas/auth.types';
import type {
  GetWorkspaceResponse,
  InviteRole,
  OpenBugs,
  RecentProjects,
  RestoreWorkspaceResponse,
  Workspace,
  WorkspaceCoverage,
} from '@schemas/workspaces.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { WorkspacesApi } from '@api/WorkspacesApi';
import { expect, request as playwrightRequest } from '@playwright/test';
import { atc, step } from '@utils/decorators';

/** What a content read-back keeps: counts and ids that only a real change can move. */
export interface ContentSnapshot {
  workspace: Pick<Workspace, 'id' | 'name' | 'slug' | 'plan' | 'owner_user_id'>
  projects: { id: string, name: string, module_count: number, atc_count: number }[]
  openBugs: { open_count: number, by_severity: OpenBugs['by_severity'] }
  coverage: { ac_total: number, ac_bound: number, ac_executed: number, ac_not_run: number }
}

/** One seeded entity BK-938 probes before and after the deletion. */
export interface EntityProbeTarget {
  entity: DeletionEntityType
  entityId: string
  /** Body of the non-destructive PATCH probe (own current values), for entities with no GET route. */
  patchBody?: Record<string, unknown>
}

/** Answer of one probe route: status plus the (error) body. */
export interface ProbeAnswer {
  status: number
  body: ErrorEnvelope
}

interface ProbeRoute {
  method: 'GET' | 'PATCH'
  path: string
}

/**
 * Entity -> routes that read it. Entities with no GET route use a PATCH that
 * re-sends the entity's own current values (non-destructive). Every route answers
 * 200 while the workspace is alive and must answer 404 once it is deleted.
 */
const ENTITY_PROBES: Record<DeletionEntityType, (id: string) => ProbeRoute[]> = {
  project: id => [{ method: 'GET', path: `/projects/${id}/coverage` }],
  module: id => [{ method: 'PATCH', path: `/modules/${id}` }],
  user_story: id => [{ method: 'GET', path: `/user-stories/${id}` }],
  acceptance_criterion: id => [{ method: 'GET', path: `/acceptance-criteria/${id}` }],
  atc: id => [{ method: 'GET', path: `/atcs/${id}` }, { method: 'GET', path: `/atcs/${id}/usage` }],
  test: id => [{ method: 'GET', path: `/tests/${id}` }],
  run: id => [{ method: 'GET', path: `/runs/${id}` }],
  bug: id => [{ method: 'GET', path: `/bugs/${id}` }],
  milestone: id => [{ method: 'PATCH', path: `/milestones/${id}` }],
  environment: id => [{ method: 'PATCH', path: `/environments/${id}` }],
};

/**
 * The only statuses a refused credential may answer (the product's error
 * envelope map, confirmed on staging). A 5xx or any other status is not a
 * refusal and fails the ATC.
 * - PAT: an unknown or dead Bearer token is `unauthorized` (401)
 * - Invite: an unknown invite token is `not_found` (404)
 */
const PAT_REFUSAL_STATUSES = [401];
const INVITE_REFUSAL_STATUSES = [404];

/** The refusal an anonymous or unknown credential gets, minus the per-request id. */
function refusalOf(response: APIResponse, body: ErrorEnvelope): { status: number, error: Record<string, unknown> } {
  const error = Object.fromEntries(Object.entries(body.error ?? {}).filter(([key]) => key !== 'request_id'));
  return { status: response.status(), error };
}

/** True when the serialized body names the workspace (id or name): the refusal must not disclose it. */
function discloses(body: unknown, workspace: { id: string, name: string }): boolean {
  const text = JSON.stringify(body).toLowerCase();
  return text.includes(workspace.id.toLowerCase()) || text.includes(workspace.name.toLowerCase());
}

export class WorkspaceDeletionApi extends ApiBase {
  private readonly endpoints = {
    byId: (workspaceId: string) => `/workspaces/${workspaceId}`,
    recentProjects: (workspaceId: string) => `/workspaces/${workspaceId}/recent-projects`,
    openBugs: (workspaceId: string) => `/workspaces/${workspaceId}/open-bugs`,
    coverage: (workspaceId: string) => `/workspaces/${workspaceId}/coverage`,
    invites: (workspaceId: string) => `/workspaces/${workspaceId}/invites`,
  };

  constructor(options: TestContextOptions) {
    super(options);
  }

  /** Cookie-only routes: the propagated PAT is deliberately ignored. */
  override setAuthToken(_token: string) {
    this.authToken = null;
  }

  // ============================================
  // Helpers (no @atc)
  // ============================================

  /**
   * Helper: Answer of every route that reads one seeded entity, on the caller's
   * session. Used to capture the reachable-before state, so a 404 after the
   * deletion cannot be a vacuous one.
   */
  @step
  async probeEntity(target: EntityProbeTarget): Promise<ProbeAnswer[]> {
    const answers: ProbeAnswer[] = [];
    for (const route of ENTITY_PROBES[target.entity](target.entityId)) {
      const [response, body] = route.method === 'GET'
        ? await this.apiGET<ErrorEnvelope>(route.path, { cookieOnly: true })
        : await this.apiPATCH<ErrorEnvelope, Record<string, unknown>>(route.path, target.patchBody ?? {}, { cookieOnly: true });
      answers.push({ status: response.status(), body });
    }
    return answers;
  }

  /**
   * Helper: Read back what a workspace holds (row, projects, open bugs, coverage),
   * stripped of volatile fields. Fails fast unless every read answers 200.
   */
  @step
  async captureContentSnapshot(workspaceId: string): Promise<ContentSnapshot> {
    const [workspaceResponse, workspace] = await this.apiGET<GetWorkspaceResponse>(
      this.endpoints.byId(workspaceId),
      { cookieOnly: true },
    );
    const [projectsResponse, projects] = await this.apiGET<RecentProjects>(
      this.endpoints.recentProjects(workspaceId),
      { cookieOnly: true },
    );
    const [bugsResponse, bugs] = await this.apiGET<OpenBugs>(this.endpoints.openBugs(workspaceId), { cookieOnly: true });
    const [coverageResponse, coverage] = await this.apiGET<WorkspaceCoverage>(
      this.endpoints.coverage(workspaceId),
      { cookieOnly: true },
    );
    expect(
      [workspaceResponse, projectsResponse, bugsResponse, coverageResponse].map(response => response.status()),
      'content snapshot: every read answers 200',
    ).toEqual([200, 200, 200, 200]);

    const { id, name, slug, plan, owner_user_id } = workspace.workspace;
    return {
      workspace: { id, name, slug, plan, owner_user_id },
      projects: projects.projects
        .map(({ id: projectId, name: projectName, module_count, atc_count }) => ({
          id: projectId,
          name: projectName,
          module_count,
          atc_count,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      openBugs: { open_count: bugs.open_count, by_severity: bugs.by_severity },
      coverage: {
        ac_total: coverage.ac_total,
        ac_bound: coverage.ac_bound,
        ac_executed: coverage.ac_executed,
        ac_not_run: coverage.ac_not_run,
      },
    };
  }

  /**
   * Helper: Derived status (`pending`, `accepted`, `revoked`, `expired`) of one
   * invite of a live workspace, read on the Owner's session; `null` when the
   * list does not hold it. The positive control of BK-956 (the invite was
   * redeemable before the deletion). Fails fast unless the list answers 200.
   */
  @step
  async readInviteStatus(args: { workspaceId: string, inviteId: string }): Promise<string | null> {
    const [response, body] = await this.apiGET<{ invites?: { id: string, status: string }[] }>(
      this.endpoints.invites(args.workspaceId),
      { cookieOnly: true },
    );
    expect(response.status(), 'invite list').toBe(200);
    return body.invites?.find(invite => invite.id === args.inviteId)?.status ?? null;
  }

  /**
   * Run `fn` on a fresh, cookieless request context that carries ONLY the given
   * Bearer PAT, so the call proves the PAT alone. Disposed in `finally`.
   */
  private async withPatOnlyContext<T>(
    token: string,
    fn: (context: APIRequestContext) => Promise<T>,
  ): Promise<T> {
    const context = await playwrightRequest.newContext({
      extraHTTPHeaders: { ...this.requestHeaders, Authorization: `Bearer ${token}` },
    });
    try {
      return await fn(context);
    }
    finally {
      await context.dispose();
    }
  }

  /**
   * Helper: `GET /workspaces/{id}` with a PAT alone on a cookieless context.
   * The positive control of BK-954 (the PAT worked before the deletion) and the
   * action of its ATC. The token travels under the `token` key, masked in step titles.
   */
  @step
  async readWorkspaceWithPat(args: {
    token: string
    workspaceId: string
  }): Promise<[APIResponse, GetWorkspaceResponse & ErrorEnvelope]> {
    return this.withPatOnlyContext(args.token, async (context) => {
      const response = await context.get(this.apiEndpoint(this.endpoints.byId(args.workspaceId)));
      return [response, await this.getResponseJsonObject<GetWorkspaceResponse & ErrorEnvelope>(response)] as [
        APIResponse,
        GetWorkspaceResponse & ErrorEnvelope,
      ];
    });
  }

  // ============================================
  // ATCs - Complete Test Cases (ACTION + VERIFICATION)
  // ============================================

  /**
   * ATC: A non-Owner (or a PAT) tries to delete a workspace - expects 403 and a workspace still alive
   *
   * Complete flow:
   * 1. DELETE on the role's own session (ACTION, via `deleteAsMember`): 403
   *    `forbidden` naming the Owner gate
   * 2. DELETE with the Owner's PAT alone on a cookieless context (ACTION): 403
   *    `forbidden` naming the session-only gate (the auth mode, not the role)
   * 3. Owner re-read (VERIFICATION): the workspace is still listed with the same
   *    name, role owner, and readable: neither refusal had a half-effect
   *
   * `token`: The Owner's PAT bound to the workspace (masked in step titles)
   * `deleteAsMember`: DELETE on the role account's own cookie session
   */
  @atc('BK-922')
  async rejectDeleteByNonOwner(args: {
    workspaceId: string
    workspaceName: string
    role: InviteRole
    token: string
    deleteAsMember: () => Promise<[APIResponse, ErrorEnvelope]>
  }): Promise<[APIResponse, ErrorEnvelope]> {
    const [response, body] = await args.deleteAsMember();
    expect(response.status(), `${args.role} DELETE`).toBe(403);
    expect(body.error?.code, `${args.role} DELETE: error code`).toBe('forbidden');
    expect(body.error?.message, `${args.role} DELETE: the Owner gate, not another 403`).toMatch(/only the workspace owner/i);

    const bearer = await this.withPatOnlyContext(args.token, async (context) => {
      const refused = await context.delete(this.apiEndpoint(this.endpoints.byId(args.workspaceId)));
      return [refused, await this.getResponseJsonObject<ErrorEnvelope>(refused)] as [APIResponse, ErrorEnvelope];
    });
    expect(bearer[0].status(), 'Bearer PAT DELETE').toBe(403);
    expect(bearer[1].error?.code, 'Bearer PAT DELETE: error code').toBe('forbidden');
    expect(bearer[1].error?.message, 'Bearer PAT DELETE: the session-only gate').toMatch(/browser session/i);

    const workspaces = new WorkspacesApi({ request: this.request });
    const [listResponse, list] = await workspaces.listWorkspaces();
    expect(listResponse.status(), 'Owner list').toBe(200);
    const listed = list.workspaces.find(item => item.id === args.workspaceId);
    expect(listed?.name, 'after the refusals the Owner still lists the workspace').toBe(args.workspaceName);
    expect(listed?.role, 'after the refusals the Owner is still its owner').toBe('owner');
    const [readResponse, read] = await workspaces.getWorkspaceById(args.workspaceId);
    expect(readResponse.status(), 'after the refusals the workspace is readable').toBe(200);
    expect(read.workspace.name).toBe(args.workspaceName);

    return [response, body];
  }

  /**
   * ATC: A PAT of a deleted workspace is used - expects the refusal of a token that never existed
   *
   * Precondition (test body): the PAT authenticated before the deletion, and the
   * Owner deleted the workspace.
   * 1. `GET /workspaces/{id}` with the PAT alone (ACTION) and with a random
   *    never-issued token (oracle)
   * 2. Verify a refusal (not 200) whose status, code, message and key set equal
   *    the oracle's, and that the body names neither the workspace id nor its name
   *
   * `token`: The PAT minted for the workspace before it was deleted (masked in step titles)
   */
  @atc('BK-954')
  async refuseDeletedWorkspacePat(args: {
    workspaceId: string
    workspaceName: string
    token: string
  }): Promise<[APIResponse, ErrorEnvelope]> {
    const [response, body] = await this.readWorkspaceWithPat({ token: args.token, workspaceId: args.workspaceId });
    const [unknownResponse, unknownBody] = await this.readWorkspaceWithPat({
      token: this.data.createUnknownPat(),
      workspaceId: args.workspaceId,
    });

    expect(PAT_REFUSAL_STATUSES, `deleted-workspace PAT is refused (got ${response.status()})`).toContain(response.status());
    expect(PAT_REFUSAL_STATUSES, `the oracle (never-issued token) is refused too (got ${unknownResponse.status()})`)
      .toContain(unknownResponse.status());
    expect(refusalOf(response, body), 'refused exactly like a token that never existed').toEqual(
      refusalOf(unknownResponse, unknownBody),
    );
    expect(discloses(body, { id: args.workspaceId, name: args.workspaceName }), 'the refusal names no workspace').toBe(false);

    return [response, body];
  }

  /**
   * ATC: An outstanding invite to a deleted workspace is redeemed - expects the refusal of an invite that never existed
   *
   * Precondition (test body): an invite was issued before the Owner deleted the workspace.
   * 1. Redeem the invite and a random never-issued token on the invitee's own
   *    session (ACTION, via `acceptAsInvitee`)
   * 2. Verify a refusal whose status, code, message and key set are identical,
   *    that names no workspace, and that the invitee's workspace list did not change
   *
   * `token`: The invite token issued before the deletion (masked in step titles)
   * `acceptAsInvitee`: POST /invites/accept on the invitee's own session
   * `listInviteeWorkspaceIds`: The invitee's workspace ids, read on their own session
   */
  @atc('BK-956')
  async refuseDeletedWorkspaceInvite(args: {
    workspaceId: string
    workspaceName: string
    token: string
    acceptAsInvitee: (token: string) => Promise<[APIResponse, ErrorEnvelope]>
    listInviteeWorkspaceIds: () => Promise<string[]>
  }): Promise<[APIResponse, ErrorEnvelope]> {
    const before = await args.listInviteeWorkspaceIds();
    const [response, body] = await args.acceptAsInvitee(args.token);
    const [unknownResponse, unknownBody] = await args.acceptAsInvitee(this.data.createUnknownInviteToken());

    expect(INVITE_REFUSAL_STATUSES, `deleted-workspace invite is refused (got ${response.status()})`).toContain(response.status());
    expect(INVITE_REFUSAL_STATUSES, `the oracle (never-issued invite) is refused too (got ${unknownResponse.status()})`)
      .toContain(unknownResponse.status());
    expect(refusalOf(response, body), 'refused exactly like an invite that never existed').toEqual(
      refusalOf(unknownResponse, unknownBody),
    );
    expect(discloses(body, { id: args.workspaceId, name: args.workspaceName }), 'the refusal names no workspace').toBe(false);

    const after = await args.listInviteeWorkspaceIds();
    expect(after.sort(), 'the invitee never joined the deleted workspace').toEqual(before.sort());
    expect(after).not.toContain(args.workspaceId);

    return [response, body];
  }

  /**
   * ATC: Another owned workspace after the first is deleted - expects it and its member untouched
   *
   * Precondition (test body): the Owner owns two workspaces, a member holds a
   * role in the second, `before` was captured, and the first was deleted.
   * 1. Re-read the second workspace on the Owner's session (VERIFICATION): same
   *    row and same content snapshot as `before`
   * 2. Re-read on the member's own session (via `readAsMember`): still listed
   *    with the same role and readable
   *
   * `before`: Snapshot of the second workspace taken before the deletion
   * `readAsMember`: The member's role in the second workspace and the status of reading it, on their own session
   */
  @atc('BK-960')
  async leaveOtherWorkspaceUntouched(args: {
    otherWorkspaceId: string
    before: ContentSnapshot
    memberRole: InviteRole
    readAsMember: () => Promise<{ role: string | null, readStatus: number }>
  }): Promise<ContentSnapshot> {
    const after = await this.captureContentSnapshot(args.otherWorkspaceId);
    expect(after, 'the second workspace and its content equal the snapshot taken before the deletion').toEqual(args.before);

    const member = await args.readAsMember();
    expect(member.role, 'the member still lists the second workspace with the same role').toBe(args.memberRole);
    expect(member.readStatus, 'the member can still read the second workspace').toBe(200);

    return after;
  }

  /**
   * ATC: One kind of content after its workspace is deleted - expects it unreachable (not found)
   *
   * Precondition (test body): the entity was seeded, its probe routes were read
   * BEFORE the deletion (`reachableBefore`), and the Owner deleted the workspace.
   * 1. Verify the entity was reachable before (a 404 now would prove nothing otherwise)
   * 2. Call each probe route of the entity (ACTION) and verify 404 `not_found`
   *    (405 or any other status is inconclusive and fails)
   *
   * Hard checks under `softFail`: a failing row records FAIL for BK-938 and
   * returns `undefined`, so the test checks all 10 rows and then fails naming them.
   *
   * Parameterized over the 10 entity types, called once per row in ONE test.
   */
  @atc('BK-938', { softFail: true })
  async verifyEntityUnreachableAfterDeletion(args: {
    target: EntityProbeTarget
    reachableBefore: boolean
  }): Promise<ProbeAnswer[] | undefined> {
    const { target } = args;
    expect(args.reachableBefore, `${target.entity}: reachable before the deletion (every probe route answered 200)`).toBe(true);

    const answers = await this.probeEntity(target);
    for (const answer of answers) {
      expect(answer.status, `${target.entity}: unreachable after the deletion`).toBe(404);
      expect(answer.body.error?.code, `${target.entity}: not_found envelope`).toBe('not_found');
    }
    return answers;
  }

  /**
   * ATC: The Owner restores a deleted workspace inside the grace window - expects it and its content back
   *
   * Complete flow:
   * 1. Verify the workspace is gone (404) before the restore
   * 2. POST restore (ACTION): 200 `{ workspaceId, workspaceName }`
   * 3. Verify (VERIFICATION): the workspace reads 200 with the same row, is
   *    listed again with role owner, and its content equals `contentBefore`
   *
   * Not asserted: PAT and invite state after the restore (Q7: not stated by the Story).
   *
   * `contentBefore`: Snapshot taken before the deletion
   */
  @atc('BK-981')
  async restoreDeletedWorkspace(args: {
    workspace: Workspace
    contentBefore: ContentSnapshot
  }): Promise<[APIResponse, RestoreWorkspaceResponse]> {
    const { workspace } = args;
    const workspaces = new WorkspacesApi({ request: this.request });

    const [goneResponse] = await workspaces.getWorkspaceById(workspace.id);
    expect(goneResponse.status(), 'precondition: the deleted workspace is not readable').toBe(404);

    const [response, body] = await workspaces.restoreWorkspace(workspace.id);
    expect(response.status(), 'restore').toBe(200);
    expect(body.workspaceId).toBe(workspace.id);
    expect(body.workspaceName).toBe(workspace.name);

    const [readResponse, read] = await workspaces.getWorkspaceById(workspace.id);
    expect(readResponse.status(), 'the restored workspace is readable again').toBe(200);
    expect(read.workspace, 'the restored workspace row is the one that was deleted').toEqual(workspace);

    const [listResponse, list] = await workspaces.listWorkspaces();
    expect(listResponse.status()).toBe(200);
    expect(list.workspaces.find(item => item.id === workspace.id)?.role, 'listed again, Owner role restored').toBe('owner');

    expect(await this.captureContentSnapshot(workspace.id), 'everything it held is back').toEqual(args.contentBefore);

    return [response, body];
  }
}
