import type { EarlierAdopterParents, ParentChain } from '@api/IdempotencyApi';
import type { APIRequestContext } from '@playwright/test';
import type { SignInPayload, SignInResponse } from '@schemas/auth.types';
import type { TestContextOptions } from '@TestContext';

import { IdempotencyApi } from '@api/IdempotencyApi';
import { TokensApi } from '@api/TokensApi';
import { ApiFixture } from '@ApiFixture';
import { IDEMPOTENCY_LEFTOVER_MIN_AGE_MS, IDEMPOTENCY_SLUG_PREFIX } from '@data/constants';
import { expect, request as playwrightRequest } from '@playwright/test';
import { WorkspaceExportSteps } from '@steps/WorkspaceExportSteps';
import { TestContext } from '@TestContext';
import { config, env } from '@variables';

export interface FreshPatContext {
  request: APIRequestContext
  patRequest: APIRequestContext
  idempotency: IdempotencyApi
  patId: string
  userId: string
}

export class IdempotencySteps extends TestContext {
  private readonly api: ApiFixture;
  private readonly exportSteps: WorkspaceExportSteps;

  constructor(options: TestContextOptions = {}) {
    super(options);
    this.api = new ApiFixture(options);
    this.exportSteps = new WorkspaceExportSteps(options);
  }

  static async openSetupSession(): Promise<APIRequestContext> {
    return playwrightRequest.newContext({ baseURL: config.baseUrl, storageState: config.auth.apiSessionPath });
  }

  static async settleAll(label: string, tasks: Array<() => Promise<unknown>>): Promise<void> {
    const errors: unknown[] = [];
    for (const task of tasks) {
      try {
        await task();
      }
      catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, `${errors.length} ${label} failed`);
    }
  }

  async createParentChain(): Promise<ParentChain> {
    const workspace = await this.exportSteps.createSyntheticWorkspace({ slugPrefix: IDEMPOTENCY_SLUG_PREFIX });
    try {
      const project = await this.api.projects.createProject(workspace.id, { name: 'QA Auto BK-667 parent project' });
      const module = await this.api.projects.createModule(project.id, { name: 'Idempotency' });
      const story = await this.api.userStories.createUserStory(module.id, { title: 'QA Auto BK-667 parent story' });
      const criterion = await this.api.userStories.createAcceptanceCriterion(story.id, { title: 'A retry never writes twice' });
      return { workspace, project, module, story, criterion };
    }
    catch (error) {
      await this.api.workspaces.deleteWorkspace({ workspaceId: workspace.id, confirmName: workspace.name })
        .catch(() => undefined);
      throw error;
    }
  }

  async seedEarlierAdopterParents(chain: ParentChain): Promise<EarlierAdopterParents> {
    const environment = await this.api.projects.createEnvironment(chain.project.id, { name: 'staging' });
    const atcPayload = (title: string) => ({
      title,
      module_id: chain.module.id,
      user_story_id: chain.story.id,
      acceptance_criterion_ids: [chain.criterion.id],
      layer: 'API' as const,
      steps: [{ position: 1, content: 'Send the request', expected: 'It is accepted' }],
    });
    const atcForTest = await this.api.atcs.createAtc(atcPayload('QA Auto BK-667 ATC chained by the tests row'));
    const atcForRun = await this.api.atcs.createAtc(atcPayload('QA Auto BK-667 ATC of the runs row'));
    const testForRun = await this.api.tests.createTest({
      title: 'QA Auto BK-667 test of the runs row',
      atc_ids: [atcForRun.id],
      workspace_id: chain.workspace.id,
    });
    return { chain, environment, atcForTest, testForRun };
  }

  async cleanupWorkspaces(workspaceIds: string[]): Promise<void> {
    await IdempotencySteps.settleAll('BK-667 workspace cleanups', workspaceIds.map(workspaceId => async () => {
      const [response, body] = await this.api.workspaces.getWorkspaceById(workspaceId);
      if (response.status() === 404) {
        return;
      }
      expect(body.workspace.slug.startsWith(IDEMPOTENCY_SLUG_PREFIX), 'cleanup only touches BK-667 workspaces').toBe(true);
      await this.api.workspaces.deleteWorkspace({ workspaceId, confirmName: body.workspace.name });
    }));
  }

  async cleanupStaleWorkspacesWithSlugPrefix(args: { slugPrefix: string, runStartedAt: number }): Promise<void> {
    const cutoff = args.runStartedAt - IDEMPOTENCY_LEFTOVER_MIN_AGE_MS;
    const [response, body] = await this.api.workspaces.listWorkspaces();
    expect(response.status(), 'workspaces list before cleanup').toBe(200);
    const stale = body.workspaces.filter(item => item.slug.startsWith(args.slugPrefix) && Date.parse(item.created_at) < cutoff);
    await this.cleanupWorkspaces(stale.map(item => item.id));
  }

  async openFreshPatContext(): Promise<FreshPatContext> {
    const account = config.bootstrapUser;
    const payload: SignInPayload = {
      email: account.email,
      password: account.password,
      pat_name: `${IDEMPOTENCY_SLUG_PREFIX}tc26`,
      pat_expires_in_days: 1,
    };
    const response = await fetch(`${config.apiUrl}${config.auth.loginEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(response.status, 'bootstrap account sign-in').toBe(200);
    const body = (await response.json()) as SignInResponse;
    const sessionCookie = response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
    const request = await playwrightRequest.newContext({ baseURL: config.baseUrl, extraHTTPHeaders: { Cookie: sessionCookie } });
    const patRequest = await playwrightRequest.newContext({ baseURL: config.baseUrl });
    const idempotency = new IdempotencyApi({ request: patRequest });
    idempotency.setAuthToken(body.pat.token);
    const fresh: FreshPatContext = { request, patRequest, idempotency, patId: body.pat.id, userId: body.user.id };
    try {
      await this.cleanupBootstrapLeftovers(fresh);
      const remaining = await idempotency.listWorkspaces();
      if (remaining.length > 0) {
        throw new Error(
          `The bootstrap account (${config.bootstrapUserVarNames[env.current]?.email ?? 'its email variable'}) must own no workspace, `
          + `but it belongs to ${remaining.length}. Remove them by hand; the test only cleans ${IDEMPOTENCY_SLUG_PREFIX}* leftovers.`,
        );
      }
      return fresh;
    }
    catch (error) {
      await IdempotencySteps.settleAll('BK-667 bootstrap releases', [
        async () => new TokensApi({ request }).revokeToken(fresh.patId),
        async () => request.dispose(),
        async () => patRequest.dispose(),
      ]).catch(() => undefined);
      throw error;
    }
  }

  async releaseFreshPatContext(fresh: FreshPatContext): Promise<void> {
    await IdempotencySteps.settleAll('BK-667 bootstrap releases', [
      async () => this.cleanupBootstrapLeftovers(fresh),
      async () => new TokensApi({ request: fresh.request }).revokeToken(fresh.patId),
      async () => fresh.request.dispose(),
      async () => fresh.patRequest.dispose(),
    ]);
  }

  private async cleanupBootstrapLeftovers(fresh: FreshPatContext): Promise<void> {
    const leftovers = (await fresh.idempotency.listWorkspaces()).filter(item => item.slug.startsWith(IDEMPOTENCY_SLUG_PREFIX));
    await new IdempotencySteps({ request: fresh.request }).cleanupWorkspaces(leftovers.map(item => item.id));
  }
}
