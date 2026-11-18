/**
 * Workspace Deletion - A teammate is locked out of the deleted workspace (BK-512, Wave 3)
 *
 * Two identities: the Owner (the `request` fixture) creates a workspace with a
 * project and invites the `member` role account; the teammate (own browser
 * context from .auth/role-member.json) first opens every screen and sees its
 * live marker (positive control: an absence afterwards is not vacuous), the
 * Owner deletes the workspace and the teammate opens the same direct links. The
 * teammate API read runs inside the ATC (a UI-only masking of an API leak was
 * the BK-988 shape).
 *
 * Blocked states observed on staging (2026-11-17): the project screens send a
 * former member to `/home` of another workspace, the members screen to
 * `/projects`; the restore page holds no workspace content, so its block is the
 * refused restore.
 *
 * Cleanup: the deletion IS the cleanup. The teammate cannot leave a soft-deleted
 * workspace, so its membership lingers until the 30-day purge (R2). afterEach
 * reads the workspace, so a workspace still (or again) alive is always deleted.
 *
 * Project: e2e-roles (depends on ui-setup, api-setup, roles-setup).
 * Run with `bun run test:e2e:roles`.
 */

import type { OwnedWorkspaceWithContent } from '@steps/WorkspaceDeletionSteps';
import type { WorkspaceScreen } from '@ui/WorkspacesSettingsPage';

import { WorkspacesApi } from '@api/WorkspacesApi';
import { WorkspaceDeletionSteps } from '@steps/WorkspaceDeletionSteps';
import { config, expect, test } from '@TestFixture';
import { WorkspacesSettingsPage } from '@ui/WorkspacesSettingsPage';

test.describe('BK-512: A deleted workspace is closed to its teammates', { tag: ['@critical'] }, () => {
  let seeded: OwnedWorkspaceWithContent | null = null;

  test.beforeEach(async ({ request }) => {
    // withEverything: the bugs and milestones screens need an item of their own as live marker
    seeded = await new WorkspaceDeletionSteps({ request }).createOwnedWorkspaceWithContent({ withEverything: true });
  });

  test.afterEach(async ({ api, request }) => {
    if (seeded) {
      const steps = new WorkspaceDeletionSteps({ request });
      try {
        const gone = await steps.isWorkspaceGone(seeded.workspace.id).catch(() => null);
        if (gone === null) {
          // The read threw: treat it as "not gone" and still delete, tolerating a 404
          const [response] = await api.workspaces.deleteWorkspaceRaw(seeded.workspace.id);
          expect([200, 404], `cleanup delete of ${seeded.workspace.id}`).toContain(response.status());
        }
        else {
          await steps.cleanupDeletionWorkspace({ workspace: seeded.workspace, deleted: gone });
        }
      }
      finally {
        seeded = null;
      }
    }
  });

  test('BK-941: should block a teammate from any screen of a deleted workspace when they open it by direct link', async ({ browser, request }) => {
    test.slow();
    const { workspace, content, bug, milestone } = seeded!;
    const steps = new WorkspaceDeletionSteps({ request });
    const teammateContext = await browser.newContext({
      baseURL: config.baseUrl,
      storageState: config.auth.roleStatePath('member'),
    });
    const teammatePage = await teammateContext.newPage();
    const teammateSettings = new WorkspacesSettingsPage({ page: teammatePage });
    const slug = content.project.slug;
    const toHome = { blockedUrl: /\/home$/, blockedMarker: /Welcome back/ };
    // Live markers come from the workspace's own content, scoped away from the app
    // sidebar and its workspace switcher (which list workspace and project names)
    const screens: WorkspaceScreen[] = [
      // Default Tree view: the main area is a placeholder and the project name is also
      // pinned in the sidebar, so the marker is the seeded test listed in the project explorer
      { url: `/projects/${slug}`, liveMarker: content.test.title, liveRegion: '[data-testid="explorer-panel"]', ...toHome },
      { url: `/projects/${slug}/bugs`, liveMarker: bug!.title, liveRegion: 'main', ...toHome },
      { url: `/projects/${slug}/milestones`, liveMarker: milestone!.name, liveRegion: 'main', ...toHome },
      {
        // The page header names the workspace slug; the shell never shows a workspace slug
        url: `/workspaces/${workspace.id}/members`,
        liveMarker: workspace.slug,
        blockedUrl: /\/projects$/,
        blockedMarker: /in this workspace, oldest first/,
      },
    ];
    try {
      await steps.grantTeammate({
        workspaceId: workspace.id,
        role: 'member',
        roleUser: 'member',
        memberRequest: teammatePage.request,
      });

      // Positive control: for a live member every screen renders the workspace
      await teammateSettings.verifyWorkspaceScreensLive(screens);

      await steps.deleteAsOwner(workspace);

      await teammateSettings.verifyDeletedWorkspaceScreensBlocked({
        screens,
        restoreUrl: `/workspaces/${workspace.id}/restore`,
        hiddenTexts: [content.project.name, workspace.name],
        readDeletedWorkspaceStatus: async () => {
          const [response] = await new WorkspacesApi({ request: teammatePage.request }).getWorkspaceById(workspace.id);
          return response.status();
        },
      });
    }
    finally {
      await teammateContext.close();
    }
  });
});
