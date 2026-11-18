/**
 * KATA Architecture - Layer 3: Bugs API Component
 *
 * Seeding helper only (no ATCs): file a standalone bug in a project so a
 * workspace holds one of every child entity (BK-512, BK-938). Filing a bug
 * requires an `Idempotency-Key` header; a fresh key is minted per call.
 *
 * Cookie-only: the seeding chain is proven on staging with the session cookie
 * alone, so the Bearer PAT the fixture propagates is deliberately ignored.
 *
 * Endpoints:
 * - POST /api/v1/bugs - File a standalone bug (project + module + title + severity)
 */

import type { Bug, CreateBugPayload, CreateBugResponse } from '@schemas/workspace-content.types';
import type { TestContextOptions } from '@TestContext';

import { randomUUID } from 'node:crypto';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { step } from '@utils/decorators';

export class BugsApi extends ApiBase {
  private readonly endpoints = {
    bugs: '/bugs',
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

  /** Helper: File a standalone bug. Fails fast unless 201. */
  @step
  async createBug(payload: CreateBugPayload): Promise<Bug> {
    const [response, body] = await this.apiPOST<CreateBugResponse, CreateBugPayload>(this.endpoints.bugs, payload, {
      headers: { 'Idempotency-Key': `qa-auto-${randomUUID()}` },
    });
    expect(response.status(), 'bug creation').toBe(201);
    return body.bug;
  }
}
