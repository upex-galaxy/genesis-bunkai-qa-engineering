/**
 * KATA Framework - Type Facade: Activity Stream Domain
 *
 * The generated `ActivityItem` union lists only the documented MVP actions; it has
 * no `export.requested` / `export.downloaded` variant (BK-508 plan, Q5). Tests
 * therefore read entries through a loose shape that keeps every common field and
 * types `action` / `entity_type` / `payload` as raw values.
 *
 * Consumed by: tests/components/api/ActivityApi.ts
 */

import type { components } from '@openapi';

// ============================================================================
// Schema Types (from components.schemas)
// ============================================================================

/** Documented activity entry union (generated). */
export type ActivityItem = components['schemas']['ActivityItem'];

/** Resolved actor of an activity entry (`user_id` null for system events). */
export type ActivityActor = components['schemas']['ActivityActor'];

/** An activity entry with the action read as a raw string (see header). */
export type ActivityEntry = Omit<ActivityItem, 'action' | 'entity_type' | 'payload'> & {
  action: string
  entity_type: string
  payload: unknown
};

// ============================================================================
// Endpoint Types - GET /api/v1/activity
// ============================================================================

/** 200 body: one keyset page, newest first. */
export interface ActivityFeedPage {
  items: ActivityEntry[]
  next_cursor: string | null
}
