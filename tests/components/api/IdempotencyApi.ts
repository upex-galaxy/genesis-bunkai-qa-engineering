import type {
  EarlierAdopterTarget,
  ExpiringKeyTarget,
  IdempotencyTarget,
  ParentScopedTarget,
} from '@data/constants';
import type { APIResponse } from '@playwright/test';
import type { ErrorEnvelope } from '@schemas/auth.types';
import type {
  AcceptanceCriterion,
  Atc,
  AtcSearchResponse,
  AtcUsageResponse,
  ListBugsResponse,
  ListProjectsResponse,
  ListUserStoriesResponse,
  ListWorkspaceRunsResponse,
  Module,
  Project,
  ProjectEnvironment,
  Test,
  UserStory,
} from '@schemas/workspace-content.types';
import type { CreateWorkspacePayload, ListWorkspacesResponse, Workspace, WorkspaceWithRole } from '@schemas/workspaces.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { atc, step } from '@utils/decorators';

export interface ParentChain {
  workspace: Workspace
  project: Project
  module: Module
  story: UserStory
  criterion: AcceptanceCriterion
}

export interface EarlierAdopterParents {
  chain: ParentChain
  environment: ProjectEnvironment
  atcForTest: Atc
  testForRun: Test
}

type CreateTarget = IdempotencyTarget | EarlierAdopterTarget;

type CreateBody = Record<string, unknown> & Partial<ErrorEnvelope>;

type CreateResult<TPayload = object> = [APIResponse, CreateBody, TPayload];

const RECORD_KEY: Record<CreateTarget, string> = {
  'workspaces': 'workspace',
  'projects': 'project',
  'user-stories': 'user_story',
  'atcs': 'atc',
  'bugs': 'bug',
  'tests': 'test',
  'runs': 'run',
};

const MISMATCH_MESSAGE = 'different request payload';
const MALFORMED_KEY = 'abc';

export class IdempotencyApi extends ApiBase {
  private readonly endpoints = {
    workspaces: '/workspaces',
    projectsOf: (workspaceId: string) => `/workspaces/${workspaceId}/projects`,
    storiesOf: (moduleId: string) => `/modules/${moduleId}/user-stories`,
    atcs: '/atcs',
    atcSearch: '/atcs/search',
    atcUsage: (atcId: string) => `/atcs/${atcId}/usage`,
    bugs: '/bugs',
    tests: '/tests',
    runs: '/runs',
    runsOf: (workspaceId: string) => `/workspaces/${workspaceId}/runs`,
  };

  constructor(options: TestContextOptions) {
    super(options);
  }

  @step
  async postCreate(args: { path: string, payload: object, key: string | null }): Promise<[APIResponse, CreateBody]> {
    const headers: Record<string, string> = args.key === null ? {} : { 'Idempotency-Key': args.key };
    const [response, body] = await this.apiPOST<CreateBody, object>(args.path, args.payload, { headers });
    return [response, body];
  }

  @step
  async countByMarker(args: { target: IdempotencyTarget, parents: ParentChain, marker: string }): Promise<number> {
    const { target, parents, marker } = args;
    switch (target) {
      case 'workspaces': {
        const [response, body] = await this.apiGET<ListWorkspacesResponse>(this.endpoints.workspaces);
        expect(response.status(), 'workspaces read-back').toBe(200);
        return body.workspaces.filter(item => item.slug === marker).length;
      }
      case 'projects': {
        const [response, body] = await this.apiGET<ListProjectsResponse>(this.endpoints.projectsOf(parents.workspace.id));
        expect(response.status(), 'projects read-back').toBe(200);
        return body.projects.filter(item => item.name === marker).length;
      }
      case 'user-stories': {
        const [response, body] = await this.apiGET<ListUserStoriesResponse>(this.endpoints.storiesOf(parents.module.id));
        expect(response.status(), 'user stories read-back').toBe(200);
        return body.user_stories.filter(item => item.title === marker).length;
      }
      case 'atcs': {
        const [response, body] = await this.apiGET<AtcSearchResponse>(this.endpoints.atcSearch, {
          params: { query: marker, project_id: parents.project.id, module_id: parents.module.id, limit: '50' },
        });
        expect(response.status(), 'ATCs read-back').toBe(200);
        return body.items.filter(item => item.title === marker).length;
      }
      case 'bugs': {
        const [response, body] = await this.apiGET<ListBugsResponse>(this.endpoints.bugs, {
          params: { project_id: parents.project.id, module_id: parents.module.id },
        });
        expect(response.status(), 'bugs read-back').toBe(200);
        return body.data.filter(item => item.title === marker).length;
      }
    }
  }

  @step
  async countEarlierAdopterRecords(args: { target: EarlierAdopterTarget, parents: EarlierAdopterParents }): Promise<number> {
    if (args.target === 'tests') {
      const [response, body] = await this.apiGET<AtcUsageResponse>(this.endpoints.atcUsage(args.parents.atcForTest.id));
      expect(response.status(), 'ATC usage read-back').toBe(200);
      return body.count;
    }
    const [response, body] = await this.apiGET<ListWorkspaceRunsResponse>(this.endpoints.runsOf(args.parents.chain.workspace.id));
    expect(response.status(), 'workspace runs read-back').toBe(200);
    return body.items.filter(item => item.test_id === args.parents.testForRun.id).length;
  }

  @step
  async listWorkspaces(): Promise<WorkspaceWithRole[]> {
    const [response, body] = await this.apiGET<ListWorkspacesResponse>(this.endpoints.workspaces);
    expect(response.status(), 'workspaces list').toBe(200);
    return body.workspaces;
  }

  @atc('BK-1690')
  async refuseCreateWithoutKey(args: {
    target: IdempotencyTarget
    parents: ParentChain
    onWorkspaceCreated?: (workspaceId: string) => void
  }): Promise<CreateResult> {
    const { target, parents, onWorkspaceCreated } = args;
    const marker = this.data.createIdempotencyMarker('tc1');
    const payload = this.buildPayload({ target, parents, marker });
    const path = this.pathOf(target, parents);

    const [refused, refusedBody] = await this.postCreate({ path, payload, key: null });
    expect(refused.status(), `${target}: create without Idempotency-Key`).toBe(400);
    expect(refusedBody.error?.code).toBe('idempotency_key_required');
    expect(refusedBody.error?.message?.toLowerCase()).toContain('idempotency-key');
    expect(await this.countByMarker({ target, parents, marker }), `${target}: nothing written by the refused create`).toBe(0);

    const [control, controlBody] = await this.postCreate({ path, payload, key: this.data.createIdempotencyKey('tc1') });
    expect(control.status(), `${target}: identical body with a fresh key (positive control)`).toBe(201);
    this.reportCreatedWorkspace({ target, recordId: this.recordIdOf(target, controlBody), onWorkspaceCreated });
    expect(await this.countByMarker({ target, parents, marker }), `${target}: only the control wrote`).toBe(1);
    return [refused, refusedBody, payload];
  }

  @atc('BK-1698')
  async replayCreateWithSameKey(args: {
    target: IdempotencyTarget
    parents: ParentChain
    onWorkspaceCreated?: (workspaceId: string) => void
  }): Promise<CreateResult> {
    const { target, parents, onWorkspaceCreated } = args;
    const marker = this.data.createIdempotencyMarker('tc9');
    const payload = this.buildPayload({ target, parents, marker });
    const path = this.pathOf(target, parents);
    const key = this.data.createIdempotencyKey('tc9');

    const [first, firstBody] = await this.postCreate({ path, payload, key });
    expect(first.status(), `${target}: first create`).toBe(201);
    this.reportCreatedWorkspace({ target, recordId: this.recordIdOf(target, firstBody), onWorkspaceCreated });

    const [retry, retryBody] = await this.postCreate({ path, payload, key });
    expect(retry.status(), `${target}: retry replays the first status`).toBe(first.status());
    expect(retryBody, `${target}: retry replays the first body`).toEqual(firstBody);
    expect(await this.countByMarker({ target, parents, marker }), `${target}: one record after the retry`).toBe(1);
    return [retry, retryBody, payload];
  }

  @atc('BK-1701')
  async refuseKeyReuseWithDifferentPayload(args: {
    target: IdempotencyTarget
    parents: ParentChain
    onWorkspaceCreated?: (workspaceId: string) => void
  }): Promise<CreateResult> {
    const { target, parents, onWorkspaceCreated } = args;
    const markerA = this.data.createIdempotencyMarker('tc12');
    const markerB = this.data.createIdempotencyMarker('tc12');
    const path = this.pathOf(target, parents);
    const key = this.data.createIdempotencyKey('tc12');

    const [first, firstBody] = await this.postCreate({ path, payload: this.buildPayload({ target, parents, marker: markerA }), key });
    expect(first.status(), `${target}: first create (payload A)`).toBe(201);
    this.reportCreatedWorkspace({ target, recordId: this.recordIdOf(target, firstBody), onWorkspaceCreated });

    const payloadB = this.buildPayload({ target, parents, marker: markerB });
    const [reuse, reuseBody] = await this.postCreate({ path, payload: payloadB, key });
    this.expectPayloadMismatch(target, [reuse, reuseBody]);
    expect(await this.countByMarker({ target, parents, marker: markerB }), `${target}: payload B not written`).toBe(0);
    expect(await this.countByMarker({ target, parents, marker: markerA }), `${target}: record A unchanged`).toBe(1);
    return [reuse, reuseBody, payloadB];
  }

  @atc('BK-1705')
  async refuseKeyReuseUnderAnotherParent(args: {
    target: ParentScopedTarget
    parentA: ParentChain
    parentB: ParentChain
  }): Promise<CreateResult> {
    const { target, parentA, parentB } = args;
    const marker = this.data.createIdempotencyMarker('tc16');
    const key = this.data.createIdempotencyKey('tc16');

    const [first, firstBody] = await this.postCreate({
      path: this.pathOf(target, parentA),
      payload: this.buildPayload({ target, parents: parentA, marker }),
      key,
    });
    expect(first.status(), `${target}: create under parent A`).toBe(201);
    const recordId = this.recordIdOf(target, firstBody);

    const payloadB = this.buildPayload({ target, parents: parentB, marker });
    const [reuse, reuseBody] = await this.postCreate({ path: this.pathOf(target, parentB), payload: payloadB, key });
    this.expectPayloadMismatch(target, [reuse, reuseBody]);
    expect(reuseBody.error, `${target}: the 409 carries the error envelope`).toBeDefined();
    expect(reuseBody[RECORD_KEY[target]], `${target}: the 409 carries no created record`).toBeUndefined();
    const leaked = [recordId, parentA.workspace.id, parentA.project.id, parentA.module.id, parentA.story.id, parentA.criterion.id]
      .filter(id => JSON.stringify(reuseBody).includes(id));
    expect(leaked, `${target}: the 409 leaks no id of parent A`).toEqual([]);
    expect(await this.countByMarker({ target, parents: parentB, marker }), `${target}: nothing created under parent B`).toBe(0);
    expect(await this.countByMarker({ target, parents: parentA, marker }), `${target}: the record under parent A stays single`).toBe(1);
    return [reuse, reuseBody, payloadB];
  }

  @atc('BK-1718')
  async verifyEarlierAdopterContractUnchanged(args: {
    target: EarlierAdopterTarget
    parents: EarlierAdopterParents
  }): Promise<CreateResult> {
    const { target, parents } = args;
    const path = target === 'tests' ? this.endpoints.tests : this.endpoints.runs;
    const { payload, otherPayload } = this.buildEarlierAdopterPayloads(target, parents);
    const key = this.data.createIdempotencyKey('tc29');

    const [missing, missingBody] = await this.postCreate({ path, payload, key: null });
    expect(missing.status(), `${target}: no key`).toBe(400);
    expect(missingBody.error?.code).toBe('idempotency_key_required');

    const [malformed, malformedBody] = await this.postCreate({ path, payload, key: MALFORMED_KEY });
    expect(malformed.status(), `${target}: malformed key`).toBe(400);
    expect(malformedBody.error?.code).toBe('idempotency_key_invalid');

    const [first, firstBody] = await this.postCreate({ path, payload, key });
    expect(first.status(), `${target}: first create`).toBe(201);
    this.recordIdOf(target, firstBody);

    const [retry, retryBody] = await this.postCreate({ path, payload, key });
    expect(retry.status(), `${target}: retry replays the first status`).toBe(first.status());
    expect(retryBody, `${target}: retry replays the first body`).toEqual(firstBody);

    const [reuse, reuseBody] = await this.postCreate({ path, payload: otherPayload, key });
    this.expectPayloadMismatch(target, [reuse, reuseBody]);

    expect(await this.countEarlierAdopterRecords({ target, parents }), `${target}: exactly one record written`).toBe(1);
    return [first, firstBody, payload];
  }

  @atc('BK-1715')
  async bootstrapFirstWorkspaceWithFreshPat(args: {
    payload: CreateWorkspacePayload
    userId: string
  }): Promise<CreateResult<CreateWorkspacePayload>> {
    const { payload, userId } = args;
    expect(await this.listWorkspaces(), 'precondition: the fresh-PAT account owns no workspace').toHaveLength(0);
    const key = this.data.createIdempotencyKey('tc26');

    const [created, createdBody] = await this.postCreate({ path: this.endpoints.workspaces, payload, key });
    expect(created.status(), 'first workspace created over the API').toBe(201);
    const workspace = createdBody.workspace as Workspace;
    expect(workspace.owner_user_id, 'owner is the PAT holder').toBe(userId);
    expect(workspace.slug).toBe(payload.slug);

    const afterCreate = await this.listWorkspaces();
    expect(afterCreate.map(item => ({ slug: item.slug, role: item.role })), 'one owned workspace')
      .toEqual([{ slug: payload.slug, role: 'owner' }]);

    const [retry, retryBody] = await this.postCreate({ path: this.endpoints.workspaces, payload, key });
    expect(retry.status(), 'retry replays the first status').toBe(201);
    expect((retryBody.workspace as Workspace | undefined)?.id, 'retry returns the same workspace').toBe(workspace.id);
    expect(await this.listWorkspaces(), 'still one workspace after the retry').toHaveLength(1);
    return [created, createdBody, payload];
  }

  @atc('BK-1700')
  async createNewRecordAfterKeyExpired(args: {
    target: ExpiringKeyTarget
    parents: ParentChain
    ageKey: (key: string) => Promise<number | null>
  }): Promise<CreateResult> {
    const { target, parents, ageKey } = args;
    const marker = this.data.createIdempotencyMarker('tc11');
    const payload = this.buildPayload({ target, parents, marker });
    const path = this.pathOf(target, parents);
    const key = this.data.createIdempotencyKey('tc11');

    const [first, firstBody] = await this.postCreate({ path, payload, key });
    expect(first.status(), `${target}: first create`).toBe(201);
    const firstId = this.recordIdOf(target, firstBody);

    const [live, liveBody] = await this.postCreate({ path, payload, key });
    expect(live.status(), `${target}: retry inside the window`).toBe(201);
    expect(this.recordIdOf(target, liveBody), `${target}: inside the window the key replays`).toBe(firstId);

    expect(await ageKey(key), `${target}: exactly one idempotency_keys row aged past its window`).toBe(1);

    const [afterWindow, afterWindowBody] = await this.postCreate({ path, payload, key });
    expect(afterWindow.status(), `${target}: same key and payload after the window`).toBe(201);
    expect(this.recordIdOf(target, afterWindowBody), `${target}: a new record, not a replay`).not.toBe(firstId);
    expect(await this.countByMarker({ target, parents, marker }), `${target}: two records after the window`).toBe(2);
    return [afterWindow, afterWindowBody, payload];
  }

  private reportCreatedWorkspace(args: { target: CreateTarget, recordId: string, onWorkspaceCreated?: (workspaceId: string) => void }): void {
    if (args.target === 'workspaces') {
      args.onWorkspaceCreated?.(args.recordId);
    }
  }

  private expectPayloadMismatch(target: CreateTarget, [response, body]: [APIResponse, CreateBody]): void {
    expect(response.status(), `${target}: key reused with a different payload`).toBe(409);
    expect(body.error?.code).toBe('conflict');
    expect(body.error?.message).toContain(MISMATCH_MESSAGE);
  }

  private pathOf(target: IdempotencyTarget, parents: ParentChain): string {
    switch (target) {
      case 'workspaces': return this.endpoints.workspaces;
      case 'projects': return this.endpoints.projectsOf(parents.workspace.id);
      case 'user-stories': return this.endpoints.storiesOf(parents.module.id);
      case 'atcs': return this.endpoints.atcs;
      case 'bugs': return this.endpoints.bugs;
    }
  }

  private buildPayload(args: { target: IdempotencyTarget, parents: ParentChain, marker: string }): object {
    const { target, parents, marker } = args;
    switch (target) {
      case 'workspaces': return { name: `QA Auto BK-667 ${marker}`, slug: marker };
      case 'projects': return { name: marker };
      case 'user-stories': return { title: marker };
      case 'atcs': return {
        title: marker,
        module_id: parents.module.id,
        user_story_id: parents.story.id,
        acceptance_criterion_ids: [parents.criterion.id],
        layer: 'API',
        steps: [{ position: 1, content: 'Send the create request', expected: 'The record is created once' }],
      };
      case 'bugs': return { project_id: parents.project.id, module_id: parents.module.id, title: marker, severity: 'P3' };
    }
  }

  private buildEarlierAdopterPayloads(target: EarlierAdopterTarget, parents: EarlierAdopterParents): { payload: object, otherPayload: object } {
    if (target === 'tests') {
      const base = { atc_ids: [parents.atcForTest.id], workspace_id: parents.chain.workspace.id };
      return {
        payload: { ...base, title: this.data.createIdempotencyMarker('tc29') },
        otherPayload: { ...base, title: this.data.createIdempotencyMarker('tc29') },
      };
    }
    const base = {
      test_id: parents.testForRun.id,
      environment_id: parents.environment.id,
      start_token: this.data.createIdempotencyKey('tc29-start'),
    };
    return { payload: base, otherPayload: { ...base, executor_mode: 'agent' } };
  }

  private recordIdOf(target: CreateTarget, body: CreateBody): string {
    const record = body[RECORD_KEY[target]] as { id?: string } | undefined;
    expect(record?.id, `${target}: response carries the created record id`).toBeTruthy();
    return record!.id!;
  }
}
