/**
 * KATA Architecture - Data Factory
 *
 * Generador centralizado de datos de prueba.
 * Regla de oro: NUNCA datos estáticos, siempre dinámicos con Faker.
 *
 * Acceso:
 *   - Desde componentes: this.data.createUser()
 *   - Import directo: import { DataFactory } from '@DataFactory'
 */

import type { TestCredentials, TestUser } from '@data/types';
import type { CreateWorkspacePayload } from '@schemas/workspaces.types';

import { SYNTHETIC_WORKSPACE_SLUG_PREFIX } from '@data/constants';
import { faker } from '@faker-js/faker';

export class DataFactory {
  // ============================================
  // HELPERS PRIVADOS
  // ============================================

  private static uniqueId(): string {
    return `${Date.now()}-${faker.string.alphanumeric(6)}`;
  }

  private static testEmail(prefix = 'test'): string {
    const id = faker.string.alphanumeric(6).toLowerCase();
    const name = faker.person.firstName().toLowerCase();
    return `${prefix}.${name}.${id}@example.com`;
  }

  private static securePassword(): string {
    return `Test${faker.string.alphanumeric(8)}!`;
  }

  // ============================================
  // GENERADORES PRINCIPALES
  // ============================================

  /**
   * Genera un usuario completo para testing
   * @param overrides - Propiedades a sobreescribir
   */
  static createUser(overrides?: Partial<TestUser>): TestUser {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    return {
      email: this.testEmail(),
      password: this.securePassword(),
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      ...overrides,
    };
  }

  /**
   * Genera solo credenciales (email + password)
   * @param overrides - Propiedades a sobreescribir
   */
  static createCredentials(overrides?: Partial<TestCredentials>): TestCredentials {
    return {
      email: this.testEmail(),
      password: this.securePassword(),
      ...overrides,
    };
  }

  /**
   * Payload for a synthetic workspace. Slug: `qa-auto-bk508-<ts>-<rand6>`
   * (matches `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`, <= 40 chars).
   */
  static createWorkspacePayload(overrides?: Partial<CreateWorkspacePayload>): CreateWorkspacePayload {
    const suffix = `${Date.now()}-${faker.string.alphanumeric({ length: 6, casing: 'lower' })}`;
    return {
      name: `QA Auto BK-508 ${suffix}`,
      slug: `${SYNTHETIC_WORKSPACE_SLUG_PREFIX}${suffix}`,
      ...overrides,
    };
  }

  /**
   * Label for a PAT minted by the BK-508 suite: `qa-auto-bk508-<rand6>`.
   */
  static createTokenName(): string {
    return `${SYNTHETIC_WORKSPACE_SLUG_PREFIX}${faker.string.alphanumeric({ length: 6, casing: 'lower' })}`;
  }

  /**
   * Synthetic invitee for a BK-508 pending invite: `qa-auto-bk508+<rand8>@example.com`
   * (reserved domain, never a real person; the MVP sends no invite email).
   */
  static createInviteEmail(): string {
    return `qa-auto-bk508+${faker.string.alphanumeric({ length: 8, casing: 'lower' })}@example.com`;
  }

  /**
   * Genera un ID único para identificar datos de test
   * Útil para cleanup y trazabilidad
   */
  static createTestId(prefix = 'test'): string {
    return `${prefix}-${this.uniqueId()}`;
  }
}

export default DataFactory;
