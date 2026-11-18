/**
 * Workspace Deletion - The confirm action is gated by the exact name (BK-512, Wave 2)
 *
 * One row per typed-name partition (empty, prefix, other case, whitespace-padded).
 * The deletion is never confirmed here (BK-937 owns it), so the workspace made
 * for the test is soft-deleted in afterEach.
 *
 * The padded row is a normal passing check: a whitespace-padded exact name keeps
 * the confirm action DISABLED (AC-04).
 *
 * Project: e2e / smoke (depends on ui-setup, api-setup)
 */

import type { Workspace } from '@schemas/workspaces.types';

import { WorkspaceDeletionSteps } from '@steps/WorkspaceDeletionSteps';
import { test } from '@TestFixture';

interface TypedNamePartition {
  label: string
  typed: (name: string) => string
}

const PARTITIONS: TypedNamePartition[] = [
  { label: 'empty', typed: () => '' },
  { label: 'a prefix of the name', typed: name => name.slice(0, -1) },
  { label: 'the name in a different case', typed: name => name.toUpperCase() },
  { label: 'the exact name padded with spaces', typed: name => ` ${name} ` },
];

test.describe('BK-512: Confirming a workspace deletion needs the exact name', { tag: ['@critical'] }, () => {
  let workspace: Workspace | null = null;

  test.beforeEach(async ({ page, request }) => {
    workspace = await new WorkspaceDeletionSteps({ page, request }).createOwnedWorkspace({ makeActive: true });
  });

  test.afterEach(async ({ request }) => {
    if (workspace) {
      await new WorkspaceDeletionSteps({ request }).cleanupDeletionWorkspace({ workspace, deleted: false });
      workspace = null;
    }
  });

  for (const partition of PARTITIONS) {
    test(`BK-926: should keep the confirm action unavailable when the typed name is ${partition.label}`, async ({ test: fixture }) => {
      await fixture.ui.workspacesSettings.verifyConfirmGatedByExactName({
        workspace: workspace!,
        typed: partition.typed(workspace!.name),
      });
    });
  }
});
