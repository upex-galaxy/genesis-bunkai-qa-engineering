/**
 * Workspace Data Export - Download contract and supersession (BK-508, Wave 1)
 *
 * Every test owns a synthetic workspace (shared Supabase across envs): created in
 * beforeEach, soft-deleted in afterEach even when the test fails.
 * Runs on the session cookie (export routes reject Bearer PATs).
 *
 * Project: integration (depends on api-setup)
 */

import type { Workspace } from '@schemas/workspaces.types';

import { WorkspaceExportSteps } from '@steps/WorkspaceExportSteps';
import { expect, test } from '@TestFixture';

test.describe('BK-508: Download a workspace data export', () => {
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

  test('BK-1019: should stream a zip attachment when the owner downloads a ready archive', async ({ api, request }) => {
    const workspaceId = workspace!.id;
    await new WorkspaceExportSteps({ request }).prepareCompletedExport(workspaceId);

    const [, bytes] = await api.workspaceExport.downloadArchiveSuccessfully(workspaceId);

    expect(bytes.length).toBeGreaterThan(0);
  });

  test('BK-1009: should offer only the newest archive when a fresh export completes after a ready one', async ({ api, request }) => {
    test.slow();
    const workspaceId = workspace!.id;
    const prior = await new WorkspaceExportSteps({ request }).prepareCompletedExport(workspaceId);

    const [, newest] = await api.workspaceExport.supersedePriorArchiveWithNewest({ workspaceId, priorExport: prior });

    const [, latest] = await api.workspaceExport.getExport(workspaceId);
    expect(latest.export?.id, 'the poll should offer only the newest archive').toBe(newest.id);
  });
});
