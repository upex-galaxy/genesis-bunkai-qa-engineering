/**
 * KATA Architecture - Layer 3: User Stories API Component
 *
 * Seeding helpers only (no ATCs): create a user story in a module and its
 * acceptance criteria.
 *
 * Cookie-only: the seeding chain is proven on staging with the session cookie
 * alone, so the Bearer PAT the fixture propagates is deliberately ignored.
 *
 * Endpoints:
 * - POST /api/v1/modules/{id}/user-stories              - Create a user story (Idempotency-Key per call)
 * - POST /api/v1/user-stories/{id}/acceptance-criteria  - Create an acceptance criterion
 */

import type {
  AcceptanceCriterion,
  CreateAcceptanceCriterionPayload,
  CreateAcceptanceCriterionResponse,
  CreateUserStoryPayload,
  CreateUserStoryResponse,
  UserStory,
} from '@schemas/workspace-content.types';
import type { TestContextOptions } from '@TestContext';

import { randomUUID } from 'node:crypto';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { step } from '@utils/decorators';

export class UserStoriesApi extends ApiBase {
  private readonly endpoints = {
    storiesOf: (moduleId: string) => `/modules/${moduleId}/user-stories`,
    criteriaOf: (userStoryId: string) => `/user-stories/${userStoryId}/acceptance-criteria`,
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

  /** Helper: Create a user story in a module. Fails fast unless 201. */
  @step
  async createUserStory(moduleId: string, payload: CreateUserStoryPayload): Promise<UserStory> {
    const [response, body] = await this.apiPOST<CreateUserStoryResponse, CreateUserStoryPayload>(
      this.endpoints.storiesOf(moduleId),
      payload,
      { headers: { 'Idempotency-Key': `qa-auto-${randomUUID()}` } },
    );
    expect(response.status(), 'user story creation').toBe(201);
    return body.user_story;
  }

  /** Helper: Create an acceptance criterion on a user story. Fails fast unless 201. */
  @step
  async createAcceptanceCriterion(
    userStoryId: string,
    payload: CreateAcceptanceCriterionPayload,
  ): Promise<AcceptanceCriterion> {
    const [response, body] = await this.apiPOST<CreateAcceptanceCriterionResponse, CreateAcceptanceCriterionPayload>(
      this.endpoints.criteriaOf(userStoryId),
      payload,
    );
    expect(response.status(), 'acceptance criterion creation').toBe(201);
    return body.acceptance_criterion;
  }
}
