import { Prisma } from '@prisma/client';

export class RegraSuperadminError extends Error {}

/** Only raw SQL is used, so this accepts the raw client's transaction and req.db's alike. */
type Sql = Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>;

/** Namespace (first key of pg_advisory_xact_lock(int, int)) of the U8 locks; the second key is the empresa. */
const LOCK_U8 = 1008;

/**
 * Rule U8 (spec 10): an action that takes an active superadmin away from empresas (deactivate,
 * change role, unlink) is refused if any of those empresas is left with no other active superadmin.
 * Call it only when `profileId` is currently an active superadmin, and always inside the
 * transaction that makes the change: it locks each empresa until that transaction ends, so two
 * concurrent changes (two superadmins removing each other) can't both pass the check.
 */
export async function assertNaoDeixaSemSuperadmin(tx: Sql, profileId: string, empresaIds: string[]): Promise<void> {
  // Sorted, so two transactions locking the same empresas can't deadlock.
  const ids = [...new Set(empresaIds)].sort();
  if (ids.length === 0) return;
  for (const id of ids) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_U8}::int, hashtext(${id}))`;
  }
  const semOutro = await tx.$queryRaw<{ nome_exibicao: string }[]>`
    SELECT e.nome_exibicao FROM empresas e
    WHERE e.id = ANY(${ids}::uuid[])
      AND NOT EXISTS (
        SELECT 1 FROM usuario_empresas ue JOIN profiles p ON p.id = ue.profile_id
        WHERE ue.empresa_id = e.id AND ue.profile_id <> ${profileId}::uuid
          AND p.role = 'superadmin' AND p.is_active
      )
    ORDER BY e.nome_exibicao
    LIMIT 1`;
  if (semOutro.length > 0) {
    throw new RegraSuperadminError(`Não é possível: é o último superadmin ativo da empresa ${semOutro[0].nome_exibicao}`);
  }
}
