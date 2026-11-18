/**
 * KATA Architecture - Deletion audit reader (BK-512 / BK-937)
 *
 * `workspace_deletions` has no API or RLS read surface, so the one way to prove
 * a deletion was recorded is a database read. This utility opens a READ-ONLY
 * connection (the `qa_inspector_ro` role: SELECT only, BYPASSRLS) from the
 * connection string named by `config.readOnlyDb`, runs ONE SELECT and closes.
 *
 * - Read only: the session is opened with `default_transaction_read_only=on`, and
 *   the only statement is a parameterized SELECT. Nothing is ever written.
 * - Unconfigured: returns `null` (the variable is unset). The caller decides what
 *   that means (BK-937 skips its audit assertions with a reason).
 * - The connection string never reaches a log, an attachment or an error message.
 */

import type { WorkspaceDeletionRecord } from '@schemas/workspaces.types';

import { config } from '@variables';
import postgres from 'postgres';

interface DeletionRow {
  workspace_id: string
  workspace_name: string
  workspace_slug: string
  requested_by: string
  requested_at: Date
  purge_deadline: Date
  purged_at: Date | null
  member_count: number
}

/**
 * Audit rows of a workspace deletion, oldest first. `null` when no read-only
 * connection is configured for the active environment.
 */
export async function readWorkspaceDeletions(workspaceId: string): Promise<WorkspaceDeletionRecord[] | null> {
  const url = config.readOnlyDb.url;
  if (url === null) {
    return null;
  }

  // `prepare: false` keeps it working behind a transaction-mode pooler.
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 5,
    connection: { default_transaction_read_only: true },
  });
  try {
    const rows = await sql<DeletionRow[]>`
      select workspace_id, workspace_name, workspace_slug, requested_by, requested_at,
             purge_deadline, purged_at, member_count
      from public.workspace_deletions
      where workspace_id = ${workspaceId}
      order by requested_at asc
    `;
    return rows.map(row => ({
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      workspaceSlug: row.workspace_slug,
      requestedBy: row.requested_by,
      requestedAt: new Date(row.requested_at),
      purgeDeadline: new Date(row.purge_deadline),
      purgedAt: row.purged_at === null ? null : new Date(row.purged_at),
      memberCount: row.member_count,
    }));
  }
  catch (error) {
    // Never echo the driver's message: it can carry connection details.
    const code = (error as { code?: string }).code ?? 'unknown';
    throw new Error(`The workspace_deletions read failed (driver code: ${code}).`);
  }
  finally {
    await sql.end({ timeout: 5 });
  }
}
