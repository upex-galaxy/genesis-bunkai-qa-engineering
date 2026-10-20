/**
 * KATA Architecture - Layer 3: Activity Stream API Component
 *
 * Reads the workspace activity feed to verify audit entries. Calls are sent
 * cookie-only (`RequestOptions.cookieOnly`, ADR-0018): the propagated PAT is
 * bound to another workspace and would read a synthetic workspace's feed as an
 * empty page.
 *
 * Actions are asserted as raw strings: the generated `ActivityItem` union has no
 * `export.*` variant (BK-508 plan, Q5).
 *
 * Endpoints:
 * - GET /api/v1/activity?workspace_id= - Workspace activity feed, newest first
 */

import type { APIResponse } from '@playwright/test';
import type { ActivityEntry, ActivityFeedPage } from '@schemas/activity.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { atc, step } from '@utils/decorators';

export type { ActivityEntry, ActivityFeedPage } from '@schemas/activity.types';

/** Upper bound for an audit entry to show up in the feed. */
const AUDIT_VISIBLE_TIMEOUT_MS = 10_000;

/** Largest page the route accepts (1..50). */
const MAX_PAGE_SIZE = 50;

export interface AuditExpectation {
  workspaceId: string
  /** User id the entry must be attributed to (the workspace Owner). */
  actorId: string
  /** ISO timestamp from the server clock; only entries created at or after it count. */
  since: string
}

export class ActivityApi extends ApiBase {
  private readonly endpoints = {
    activity: '/activity',
  };

  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // Helpers - Read-only operations (no @atc)
  // ============================================

  /**
   * Helper: Read one page of a workspace's activity feed (newest first).
   */
  @step
  async listActivity(args: { workspaceId: string, limit?: number }): Promise<[APIResponse, ActivityFeedPage]> {
    return this.apiGET<ActivityFeedPage>(this.endpoints.activity, {
      params: { workspace_id: args.workspaceId, limit: String(args.limit ?? MAX_PAGE_SIZE) },
      cookieOnly: true,
    });
  }

  // ============================================
  // ATCs - Complete Test Cases (ACTION + VERIFICATION)
  // ============================================

  /**
   * ATC: An export request is audited - exactly one `export.requested` entry,
   * attributed to the Owner, created after `since`, with an empty payload.
   *
   * @returns Tuple with the feed response and the matching entry
   */
  @atc('BK-997')
  async verifyExportRequestedRecorded(expected: AuditExpectation): Promise<[APIResponse, ActivityEntry]> {
    const [response, [entry]] = await this.expectAuditEntries({ action: 'export.requested', count: 1, expected });
    return [response, entry];
  }

  /**
   * ATC: An archive download is audited - exactly one `export.downloaded` entry
   * per successful download (`count` = downloads made since `since`), each
   * attributed to the Owner, created after `since`, with an empty payload.
   *
   * @returns Tuple with the feed response and the matching entries
   */
  @atc('BK-998')
  async verifyExportDownloadedRecorded(
    expected: AuditExpectation & { count: number },
  ): Promise<[APIResponse, ActivityEntry[]]> {
    const { count, ...expectation } = expected;
    return this.expectAuditEntries({ action: 'export.downloaded', count, expected: expectation });
  }

  // ============================================
  // Private - shared fixed assertions of the audit ATCs
  // ============================================

  /**
   * Bounded poll until the feed holds `count` matching entries (fails fast on a
   * non-200 feed), then ONE more read asserting the exact count, so a late
   * duplicate entry is caught instead of slipping past the poll.
   */
  private async expectAuditEntries(args: {
    action: string
    count: number
    expected: AuditExpectation
  }): Promise<[APIResponse, ActivityEntry[]]> {
    const { action, count, expected } = args;
    const since = Date.parse(expected.since);
    const readMatches = async (): Promise<[APIResponse, ActivityEntry[]]> => {
      const [feedResponse, page] = await this.listActivity({ workspaceId: expected.workspaceId });
      const found = feedResponse.status() === 200
        ? (page.items ?? []).filter(entry => entry.action === action && Date.parse(entry.created_at) >= since)
        : [];
      return [feedResponse, found];
    };

    let feedStatus = 200;
    await expect.poll(async () => {
      const [feedResponse, found] = await readMatches();
      feedStatus = feedResponse.status();
      return feedStatus !== 200 || found.length >= count;
    }, {
      message: `activity feed should hold ${count} "${action}" entries`,
      timeout: AUDIT_VISIBLE_TIMEOUT_MS,
    }).toBe(true);
    expect(feedStatus, 'activity feed status').toBe(200);

    const [response, matches] = await readMatches();
    expect(response.status(), 'activity feed status (final read)').toBe(200);
    expect(matches, `exactly ${count} "${action}" entries`).toHaveLength(count);
    for (const entry of matches) {
      expect(entry.actor.user_id, 'entry attributed to the Owner').toBe(expected.actorId);
      expect(entry.payload, 'audit payload').toEqual({});
    }

    return [response, matches];
  }
}
