/**
 * Workspace Data Export - Personal Access Tokens are refused (BK-508, Wave 1)
 *
 * The PAT is the Owner's own `workspace:admin` token bound to the synthetic
 * workspace (highest identity + highest scope), sent alone on a cookieless
 * context: the refusal proves the gate is the auth mode, not the role. It also
 * carries `atc:read` for the ATC's positive control (`GET /workspaces/{id}`).
 *
 * Every test owns a synthetic workspace (created in beforeEach, soft-deleted in
 * afterEach) and revokes the PAT it minted, even when the test fails.
 *
 * Project: integration / smoke (depends on api-setup)
 */

import type { ExportEndpoint } from '@api/WorkspaceExportApi';
import type { Workspace } from '@schemas/workspaces.types';

import { WorkspaceExportSteps } from '@steps/WorkspaceExportSteps';
import { test } from '@TestFixture';

const ENDPOINTS: ExportEndpoint[] = ['request', 'poll', 'download'];

test.describe('BK-508: Export routes refuse Personal Access Tokens', { tag: ['@critical'] }, () => {
  let workspace: Workspace | null = null;
  let tokenId: string | null = null;

  test.beforeEach(async ({ request }) => {
    workspace = await new WorkspaceExportSteps({ request }).createSyntheticWorkspace();
  });

  test.afterEach(async ({ api, request }) => {
    try {
      if (tokenId) {
        await api.tokens.revokeToken(tokenId);
      }
    }
    finally {
      tokenId = null;
      if (workspace) {
        await new WorkspaceExportSteps({ request }).cleanupSyntheticWorkspace(workspace);
        workspace = null;
      }
    }
  });

  for (const endpoint of ENDPOINTS) {
    test(`BK-1004: should reject a personal access token when it calls the export ${endpoint} endpoint`, async ({ api, request }) => {
      const workspaceId = workspace!.id;
      if (endpoint === 'download') {
        await new WorkspaceExportSteps({ request }).prepareCompletedExport(workspaceId);
      }
      const pat = await api.tokens.issueToken({
        name: api.data.createTokenName(),
        scopes: ['atc:read', 'workspace:admin'],
        workspaceId,
        expiresInDays: 1,
      });
      tokenId = pat.id;

      await api.workspaceExport.rejectPatOnExportEndpoint({ workspaceId, token: pat.token, endpoint });
    });
  }
});
