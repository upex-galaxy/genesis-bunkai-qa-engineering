import { IDEMPOTENCY_SLUG_PREFIX } from '@data/constants';
import { config } from '@variables';
import postgres from 'postgres';

const EXPECTED_DB_ROLE = 'qa_inspector_rw';

class UnexpectedRowCount extends Error {
  constructor(readonly count: number) {
    super(`expected exactly 1 idempotency_keys row, matched ${count}`);
  }
}

class UnexpectedDbRole extends Error {
  constructor(role: string) {
    super(`Refusing to age the key: the connection runs as "${role}", expected "${EXPECTED_DB_ROLE}" (ADR-0030). Nothing was written.`);
  }
}

export async function ageIdempotencyKey(args: { userId: string, endpoint: string, key: string }): Promise<number | null> {
  const connection = config.idempotencyDb.connection;
  if (connection === null) {
    return null;
  }
  const keyGuard = `${IDEMPOTENCY_SLUG_PREFIX}tc11-%`;
  if (!args.key.startsWith(`${IDEMPOTENCY_SLUG_PREFIX}tc11-`)) {
    throw new Error(`Refusing to age a key outside the ${IDEMPOTENCY_SLUG_PREFIX}tc11- prefix.`);
  }

  const sql = postgres({
    ...connection,
    ssl: 'require',
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 5,
  });
  try {
    return await sql.begin(async (tx) => {
      const [{ role }] = await tx<{ role: string }[]>`select current_user as role`;
      if (role !== EXPECTED_DB_ROLE) {
        throw new UnexpectedDbRole(role);
      }
      const result = await tx`
        update public.idempotency_keys
        set created_at = now() - interval '48 hours', expires_at = now() - interval '1 second'
        where user_id = ${args.userId} and endpoint = ${args.endpoint} and key = ${args.key} and key like ${keyGuard}
      `;
      if (result.count !== 1) {
        throw new UnexpectedRowCount(result.count);
      }
      return result.count;
    });
  }
  catch (error) {
    if (error instanceof UnexpectedRowCount) {
      return error.count;
    }
    if (error instanceof UnexpectedDbRole) {
      throw error;
    }
    const code = (error as { code?: string }).code ?? 'unknown';
    throw new Error(`The idempotency_keys aging update failed (driver code: ${code}).`);
  }
  finally {
    await sql.end({ timeout: 5 });
  }
}
