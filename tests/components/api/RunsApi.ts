/**
 * KATA Architecture - Layer 3: Runs API Component
 *
 * Seeding helpers only (no ATCs): start a run of a test and finish it with a
 * verdict. Starting a run requires an `Idempotency-Key` header; a fresh key is
 * minted per call.
 *
 * Cookie-only: the seeding chain is proven on staging with the session cookie
 * alone, so the Bearer PAT the fixture propagates is deliberately ignored.
 *
 * Endpoints:
 * - POST /api/v1/runs             - Start a run
 * - POST /api/v1/runs/{id}/finish - Finish a run with a verdict
 */

import type {
  CreateRunPayload,
  CreateRunResponse,
  FinishRunPayload,
  FinishRunResponse,
  Run,
  RunVerdict,
} from '@schemas/workspace-content.types';
import type { TestContextOptions } from '@TestContext';

import { randomUUID } from 'node:crypto';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { step } from '@utils/decorators';

export class RunsApi extends ApiBase {
  private readonly endpoints = {
    runs: '/runs',
    finish: (runId: string) => `/runs/${runId}/finish`,
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

  /** Helper: Start a run. Fails fast unless 200/201. */
  @step
  async startRun(payload: CreateRunPayload): Promise<Run> {
    const [response, body] = await this.apiPOST<CreateRunResponse, CreateRunPayload>(this.endpoints.runs, payload, {
      headers: { 'Idempotency-Key': `qa-auto-${randomUUID()}` },
    });
    expect([200, 201], 'run start').toContain(response.status());
    return body.run;
  }

  /** Helper: Finish a run with a verdict. Fails fast unless 200. */
  @step
  async finishRun(runId: string, verdict: RunVerdict): Promise<Run> {
    const [response, body] = await this.apiPOST<FinishRunResponse, FinishRunPayload>(
      this.endpoints.finish(runId),
      { verdict },
    );
    expect(response.status(), 'run finish').toBe(200);
    return body.run;
  }
}
