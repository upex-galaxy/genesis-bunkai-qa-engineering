/**
 * KATA Architecture - Layer 3: Tests API Component
 *
 * Seeding helper only (no ATCs): create a Bunkai Test that chains ATCs.
 * The route requires an `Idempotency-Key` header; a fresh key is minted per call.
 *
 * Cookie-only: the seeding chain is proven on staging with the session cookie
 * alone, so the Bearer PAT the fixture propagates is deliberately ignored.
 *
 * Endpoints:
 * - POST /api/v1/tests - Create a test
 */

import type { CreateTestPayload, CreateTestResponse, Test } from '@schemas/workspace-content.types';
import type { TestContextOptions } from '@TestContext';

import { randomUUID } from 'node:crypto';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { step } from '@utils/decorators';

export class TestsApi extends ApiBase {
  private readonly endpoints = {
    tests: '/tests',
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

  /** Helper: Create a test. Fails fast unless 201. */
  @step
  async createTest(payload: CreateTestPayload): Promise<Test> {
    const [response, body] = await this.apiPOST<CreateTestResponse, CreateTestPayload>(this.endpoints.tests, payload, {
      headers: { 'Idempotency-Key': `qa-auto-${randomUUID()}` },
    });
    expect(response.status(), 'test creation').toBe(201);
    return body.test;
  }
}
