import type { Response } from '@playwright/test';
import type { CreateWorkspaceResponse } from '@schemas/workspaces.types';
import type { TestContextOptions } from '@TestContext';

import { IDEMPOTENCY_KEY_PATTERN } from '@data/constants';
import { expect } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc } from '@utils/decorators';

export class OnboardingPage extends UiBase {
  constructor(options: TestContextOptions) {
    super(options);
  }

  @atc('BK-1714')
  async completeOnboardingCreatingFirstWorkspace(args: {
    name: string
    slug: string
    onCreated?: (workspaceId: string) => void
  }): Promise<{ workspaceId: string, landingPath: string }> {
    await expect(this.page, 'after the sign-up code is verified the product lands on /onboarding').toHaveURL(/\/onboarding/);
    const landingPath = new URL(this.page.url()).pathname;

    const refused: string[] = [];
    const collectRefused = (response: Response) => {
      if (response.url().includes('/api/v1/') && response.status() >= 400) {
        refused.push(`${response.request().method()} ${new URL(response.url()).pathname} ${response.status()}`);
      }
    };
    this.page.on('response', collectRefused);
    try {
      await this.page.getByRole('textbox', { name: /Workspace name/ }).fill(args.name);
      await this.page.getByRole('textbox', { name: /URL slug/ }).fill(args.slug);
      const createResponse = this.page.waitForResponse(response =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/workspaces');
      await this.page.getByRole('button', { name: /Create workspace/ }).click();
      const response = await createResponse;
      const created = response.status() === 201 ? (await response.json()) as CreateWorkspaceResponse : null;
      if (created) {
        args.onCreated?.(created.workspace.id);
      }

      expect(response.request().headers()['idempotency-key'], 'the onboarding form sends an Idempotency-Key').toMatch(IDEMPOTENCY_KEY_PATTERN);
      expect(response.status(), 'first workspace created').toBe(201);

      await this.page.waitForURL(/\/projects/);
      expect(refused, 'no refused /api/v1/ request during onboarding').toEqual([]);
      return { workspaceId: created!.workspace.id, landingPath };
    }
    finally {
      this.page.off('response', collectRefused);
    }
  }
}
