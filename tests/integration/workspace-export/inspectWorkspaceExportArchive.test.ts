/**
 * Workspace Data Export - Archive content (BK-508, Wave 3)
 *
 * Every test owns a synthetic workspace (shared Supabase across envs): created in
 * beforeEach, soft-deleted in afterEach even when the test fails.
 * Runs on the session cookie (export and seeding calls never send the Bearer PAT).
 *
 * Project: integration (depends on api-setup)
 */

import type { Workspace } from '@schemas/workspaces.types';

import { WorkspaceExportSteps } from '@steps/WorkspaceExportSteps';
import { test } from '@TestFixture';

test.describe('BK-508: Workspace data export archive', () => {
  let workspace: Workspace | null = null;

  test.beforeEach(async ({ api }) => {
    workspace = await api.workspaces.createWorkspace(api.data.createWorkspacePayload());
  });

  test.afterEach(async ({ api }) => {
    if (workspace) {
      await api.workspaces.deleteWorkspace({ workspaceId: workspace.id, confirmName: workspace.name });
      workspace = null;
    }
  });

  test('BK-1015: should encode run snapshots as NDJSON when the workspace has run history', async ({ api, request }) => {
    test.slow();
    const steps = new WorkspaceExportSteps({ request });
    const workspaceId = workspace!.id;

    await steps.seedWorkspaceContent(workspaceId, { withRunHistory: true });
    await steps.prepareCompletedExport(workspaceId);

    await api.workspaceExport.downloadArchiveWithNdjsonRunSnapshots(workspaceId);
  });
});
