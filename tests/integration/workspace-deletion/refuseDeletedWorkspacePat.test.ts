/**
 * Workspace Deletion - A PAT of a deleted workspace is refused (BK-512, Wave 1)
 *
 * The PAT is the Owner's own `workspace:admin` token bound to the synthetic
 * workspace, sent alone on a cookieless context. A positive control in the test
 * body proves it authenticated BEFORE the deletion, so the refusal afterwards is
 * the deletion's effect and not a token that never worked. The ATC then compares
 * the refusal with the one a random, never-issued token gets.
 *
 * The deletion is the cleanup (a second DELETE would 404); the PAT is revoked in
 * afterEach even when the test fails.
 *
 * Project: integration / smoke (depends on api-setup)
 */

import type { Workspace } from '@schemas/workspaces.types';

import { WorkspaceDeletionSteps } from '@steps/WorkspaceDeletionSteps';
import { expect, test } from '@TestFixture';

test.describe('BK-512: A deleted workspace refuses its personal access tokens', { tag: ['@critical'] }, () => {
  let workspace: Workspace | null = null;
  let deleted = false;
  let tokenId: string | null = null;

  test.beforeEach(async ({ request }) => {
    deleted = false;
    workspace = await new WorkspaceDeletionSteps({ request }).createOwnedWorkspace();
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
        await new WorkspaceDeletionSteps({ request }).cleanupDeletionWorkspace({ workspace, deleted });
        workspace = null;
      }
    }
  });

  test('BK-954: should refuse a personal access token of a deleted workspace exactly like a token that never existed', async ({ api, request }) => {
    const steps = new WorkspaceDeletionSteps({ request });
    const pat = await api.tokens.issueToken({
      name: api.data.createTokenName(),
      scopes: ['atc:read', 'workspace:admin'],
      workspaceId: workspace!.id,
      expiresInDays: 1,
    });
    tokenId = pat.id;

    const [control] = await api.workspaceDeletion.readWorkspaceWithPat({ token: pat.token, workspaceId: workspace!.id });
    expect(control.status(), 'positive control: the PAT authenticates before the deletion').toBe(200);

    await steps.deleteAsOwner(workspace!);
    deleted = true;

    await api.workspaceDeletion.refuseDeletedWorkspacePat({
      token: pat.token,
      workspaceId: workspace!.id,
      workspaceName: workspace!.name,
    });
  });
});
