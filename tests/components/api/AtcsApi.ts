/**
 * KATA Architecture - Layer 3: ATCs API Component
 *
 * Seeding helper only (no ATCs of its own): create an ATC with steps.
 *
 * Cookie-only: the seeding chain is proven on staging with the session cookie
 * alone, so the Bearer PAT the fixture propagates is deliberately ignored.
 *
 * Endpoints:
 * - POST /api/v1/atcs - Create an ATC
 */

import type { Atc, CreateAtcPayload, CreateAtcResponse } from '@schemas/workspace-content.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { step } from '@utils/decorators';

export class AtcsApi extends ApiBase {
  private readonly endpoints = {
    atcs: '/atcs',
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

  /** Helper: Create an ATC. Fails fast unless 201. */
  @step
  async createAtc(payload: CreateAtcPayload): Promise<Atc> {
    const [response, body] = await this.apiPOST<CreateAtcResponse, CreateAtcPayload>(this.endpoints.atcs, payload);
    expect(response.status(), 'ATC creation').toBe(201);
    return body.atc;
  }
}
