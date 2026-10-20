/**
 * Workspace Data Export - Settings section for the Owner (BK-508, Wave 2)
 *
 * The test owns a synthetic workspace (shared Supabase across envs), made the
 * browser's active workspace so Settings resolves the Owner role on it; it is
 * soft-deleted in afterEach even when the test fails.
 *
 * Project: e2e (depends on ui-setup, api-setup)
 */

import type { Workspace } from '@schemas/workspaces.types';

import { WorkspaceExportSteps } from '@steps/WorkspaceExportSteps';
import { test } from '@TestFixture';

test.describe('BK-508: View the Data export section', { tag: ['@critical', '@smoke'] }, () => {
  let workspace: Workspace | null = null;

  test.beforeEach(async ({ page, request }) => {
    workspace = await new WorkspaceExportSteps({ page, request }).createSyntheticWorkspace({ makeActive: true });
  });

  test.afterEach(async ({ request }) => {
    if (workspace) {
      await new WorkspaceExportSteps({ request }).cleanupSyntheticWorkspace(workspace);
      workspace = null;
    }
  });

  test('BK-994: should list the Data export section and explain it when the owner opens Settings', async ({ test: fixture }) => {
    // The fresh workspace was never exported: the ATC also checks the first request is offered
    await fixture.ui.dataExport.openDataExportSectionAsOwner();
  });
});
