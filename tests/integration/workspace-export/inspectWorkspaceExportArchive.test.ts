/**
 * Workspace Data Export - Archive content (BK-508, Wave 3)
 *
 * Every test owns a synthetic workspace (shared Supabase across envs): created in
 * beforeEach, soft-deleted in afterEach even when the test fails. BK-1013 adds a
 * second one, registered for the same cleanup. A minted PAT is revoked first.
 * Runs on the session cookie (export and seeding calls never send the Bearer PAT).
 * Secrets (PAT, invite token) stay in memory: they reach the ATCs under the
 * `token` key (masked in step titles) and are never logged or attached.
 *
 * Project: integration (depends on api-setup)
 */

import type { Workspace } from '@schemas/workspaces.types';

import { WorkspaceExportSteps } from '@steps/WorkspaceExportSteps';
import { test } from '@TestFixture';

test.describe('BK-508: Workspace data export archive', () => {
  let workspaces: Workspace[] = [];
  let tokenId: string | null = null;

  test.beforeEach(async ({ request }) => {
    workspaces = [await new WorkspaceExportSteps({ request }).createSyntheticWorkspace()];
  });

  test.afterEach(async ({ api, request }) => {
    // Both steps always run; neither error hides the other (both -> AggregateError)
    const errors: unknown[] = [];
    if (tokenId) {
      try {
        // A PAT just minted: nothing else could have revoked it, so only 204 counts
        await api.tokens.revokeToken(tokenId, { requireRevoked: true });
      }
      catch (error) {
        errors.push(error);
      }
      tokenId = null;
    }
    const created = workspaces;
    workspaces = [];
    try {
      await new WorkspaceExportSteps({ request }).cleanupSyntheticWorkspaces(created);
    }
    catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, 'PAT revoke and workspace cleanup both failed');
    }
  });

  test('BK-999: should produce a valid archive with no content records when the workspace is empty', async ({ api, request }) => {
    const workspaceId = workspaces[0].id;
    await new WorkspaceExportSteps({ request }).prepareCompletedExport(workspaceId);

    await api.workspaceExport.downloadEmptyWorkspaceArchive(workspaceId);
  });

  test('BK-1014: should describe the archive in a manifest whose counts match its files when an export completes', async ({ api, request }) => {
    test.slow();
    const steps = new WorkspaceExportSteps({ request });
    const workspaceId = workspaces[0].id;

    await steps.seedWorkspaceContent(workspaceId, { withRunHistory: true });
    const completedExport = await steps.prepareCompletedExport(workspaceId);

    await api.workspaceExport.downloadArchiveWithConsistentManifest({ workspaceId, completedExport });
  });

  test('BK-1015: should encode run snapshots as NDJSON when the workspace has run history', async ({ api, request }) => {
    test.slow();
    const steps = new WorkspaceExportSteps({ request });
    const workspaceId = workspaces[0].id;

    await steps.seedWorkspaceContent(workspaceId, { withRunHistory: true });
    await steps.prepareCompletedExport(workspaceId);

    await api.workspaceExport.downloadArchiveWithNdjsonRunSnapshots(workspaceId);
  });

  test('BK-1011: should leave every PAT secret out of the archive when the workspace has issued tokens', async ({ api, request }) => {
    const workspaceId = workspaces[0].id;
    // Issued BEFORE the export request: that ordering is what makes the scan meaningful
    const pat = await api.tokens.issueToken({
      name: api.data.createTokenName(),
      scopes: ['workspace:admin'],
      workspaceId,
      expiresInDays: 1,
    });
    tokenId = pat.id;
    await new WorkspaceExportSteps({ request }).prepareCompletedExport(workspaceId);

    await api.workspaceExport.downloadArchiveExcludingPatSecrets({ workspaceId, token: pat.token });
  });

  test('BK-1012: should leave every invite token out of the archive when the workspace has pending invites', async ({ api, request }) => {
    const workspaceId = workspaces[0].id;
    // Synthetic invitee (example.com, never delivered); the pending invite dies with the workspace
    const invite = await api.workspaces.createInvite({
      workspaceId,
      email: api.data.createInviteEmail(),
      role: 'member',
    });
    await new WorkspaceExportSteps({ request }).prepareCompletedExport(workspaceId);

    await api.workspaceExport.downloadArchiveExcludingInviteTokens({ workspaceId, token: invite.token });
  });

  test('BK-1013: should contain only the exported workspace\'s records when the owner owns two workspaces', async ({ api, request }) => {
    test.slow();
    const steps = new WorkspaceExportSteps({ request });
    const [exported] = workspaces;
    const other = await steps.createSyntheticWorkspace();
    workspaces.push(other);

    const own = await steps.seedWorkspaceContent(exported.id, { withRunHistory: true });
    const foreign = await steps.seedWorkspaceContent(other.id, { withRunHistory: true });
    await steps.prepareCompletedExport(exported.id);

    await api.workspaceExport.downloadArchiveScopedToWorkspace({
      workspaceId: exported.id,
      // Ids only: no workspace row is exported, so the own name and slug are not expected in it
      ownMarkers: [exported.id, own.test.id, ...own.runs.map(run => run.id)],
      foreignMarkers: [other.id, other.name, other.slug, foreign.test.id, ...foreign.runs.map(run => run.id)],
    });
  });
});
