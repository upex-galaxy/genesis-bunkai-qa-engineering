/**
 * Workspace Data Export - Activity Stream audit trail (BK-508, Wave 1)
 *
 * Every test owns a synthetic workspace (shared Supabase across envs): created in
 * beforeEach, soft-deleted in afterEach even when the test fails.
 * The audit window starts at the workspace's server-side `created_at` (no local
 * clock skew) and the expected actor is the workspace's `owner_user_id`.
 *
 * Project: integration (depends on api-setup)
 */

import type { Workspace } from '@schemas/workspaces.types';

import { WorkspaceExportSteps } from '@steps/WorkspaceExportSteps';
import { test } from '@TestFixture';

test.describe('BK-508: Workspace data export audit trail', () => {
  let workspace: Workspace | null = null;

  test.beforeEach(async ({ request }) => {
    workspace = await new WorkspaceExportSteps({ request }).createSyntheticWorkspace();
  });

  test.afterEach(async ({ request }) => {
    if (workspace) {
      await new WorkspaceExportSteps({ request }).cleanupSyntheticWorkspace(workspace);
      workspace = null;
    }
  });

  test('BK-997: should record an export.requested entry attributed to the owner when an export is requested', async ({ api }) => {
    const { id: workspaceId, owner_user_id: actorId, created_at: since } = workspace!;

    await api.workspaceExport.requestExportSuccessfully(workspaceId);

    await api.activity.verifyExportRequestedRecorded({ workspaceId, actorId, since });
  });

  test('BK-998: should record one export.downloaded entry per download attributed to the owner when the archive is downloaded twice', async ({ api, request }) => {
    const { id: workspaceId, owner_user_id: actorId, created_at: since } = workspace!;
    await new WorkspaceExportSteps({ request }).prepareCompletedExport(workspaceId);

    await api.workspaceExport.downloadArchiveSuccessfully(workspaceId);
    await api.workspaceExport.downloadArchiveSuccessfully(workspaceId);

    await api.activity.verifyExportDownloadedRecorded({ workspaceId, actorId, since, count: 2 });
  });
});
