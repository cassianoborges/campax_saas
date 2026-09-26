import { prisma } from '../prisma';

export class RegraSuperadminError extends Error {}

/**
 * Rule U8 (spec 10): an action that takes an active superadmin away from empresas (deactivate,
 * change role, unlink) is refused if any of those empresas is left with no other active superadmin.
 * Call it only when `profileId` is currently an active superadmin.
 */
export async function assertNaoDeixaSemSuperadmin(profileId: string, empresaIds: string[]): Promise<void> {
  for (const empresa_id of empresaIds) {
    const outros = await prisma.usuario_empresas.count({
      where: { empresa_id, profile_id: { not: profileId }, profile: { role: 'superadmin', is_active: true } },
    });
    if (outros === 0) {
      const empresa = await prisma.empresas.findUnique({ where: { id: empresa_id }, select: { nome_exibicao: true } });
      throw new RegraSuperadminError(`Não é possível: é o último superadmin ativo da empresa ${empresa?.nome_exibicao ?? ''}`.trim());
    }
  }
}
