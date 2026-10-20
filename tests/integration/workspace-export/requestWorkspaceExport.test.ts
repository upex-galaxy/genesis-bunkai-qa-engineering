/**
 * Workspace Data Export - Request and poll contract (BK-508, Wave 1)
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

test.describe('BK-508: Request a workspace data export', () => {
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

  test('BK-1017: should return a queued job id when the owner requests an export of an idle workspace', async ({ api }) => {
    const workspaceId = workspace!.id;

    const [, requested] = await api.workspaceExport.requestExportSuccessfully(workspaceId);

    const [, latest] = await api.workspaceExport.getExport(workspaceId);
    expect(latest.export?.id).toBe(requested.export_job_id);
  });

  test('BK-1018: should return a null export when the owner polls a never-exported workspace', async ({ api }) => {
    const [, body] = await api.workspaceExport.getExportStatusSuccessfully(workspace!.id);

    expect(body.export).toBeNull();
  });

  test('BK-1018: should return the lifecycle shape when the owner polls a requested export', async ({ api }) => {
    const workspaceId = workspace!.id;
    const [requestResponse, requested] = await api.workspaceExport.requestExport(workspaceId);
    expect(requestResponse.status(), 'precondition: export enqueued').toBe(202);

    const [, body] = await api.workspaceExport.getExportStatusSuccessfully(workspaceId);

    expect(body.export?.id).toBe(requested.export_job_id);
  });
});
