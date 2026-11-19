/**
 * KATA Architecture - Layer 4: UI Fixture
 *
 * Dependency Injection container for all UI components.
 * Provides unified access to UI testing capabilities.
 *
 * All UI components share the same page context from TestContext,
 * ensuring consistent browser state across components.
 *
 * HOW TO ADD NEW UI COMPONENTS:
 * 1. Create your component in tests/components/ui/YourPage.ts
 * 2. Import it here
 * 3. Add as readonly property
 * 4. Initialize in constructor passing the options
 */

import type { TestContextOptions } from '@TestContext';

import { DataExportPage } from '@ui/DataExportPage';
import { LoginPage } from '@ui/LoginPage';
import { OnboardingPage } from '@ui/OnboardingPage';
import { UiBase } from '@ui/UiBase';
import { WorkspacesSettingsPage } from '@ui/WorkspacesSettingsPage';

// ============================================
// UI Fixture Class
// ============================================

export class UiFixture extends UiBase {
  /** Login page component - handles authentication flows */
  readonly login: LoginPage;

  /** Settings > Data export (BK-508) */
  readonly dataExport: DataExportPage;

  /** Settings > Workspaces: list, delete confirmation (BK-512) */
  readonly workspacesSettings: WorkspacesSettingsPage;

  readonly onboarding: OnboardingPage;

  constructor(options: TestContextOptions) {
    super(options);

    // All components receive the same options (same page context)
    this.login = new LoginPage(options);
    this.dataExport = new DataExportPage(options);
    this.workspacesSettings = new WorkspacesSettingsPage(options);
    this.onboarding = new OnboardingPage(options);
  }
}
