/**
 * Workspace Data Export - Smoke (BK-508)
 *
 * Read-only: the owner polls the latest export of a workspace they own.
 * Runs on the session cookie (export routes reject Bearer PATs).
 *
 * Project: integration / smoke (depends on api-setup)
 */

import { test } from '@TestFixture';

test.describe('BK-508: Workspace data export', { tag: ['@critical'] }, () => {
  test('BK-1018: should return the export status shape when the owner polls it', async ({ api }) => {
    const workspace = await api.workspaces.getOwnedWorkspace();

    await api.workspaceExport.getExportStatusSuccessfully(workspace.id);
  });
});
