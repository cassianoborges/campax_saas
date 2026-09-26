import { prisma } from '../prisma';

type Criador = { id: string; email: string; full_name: string | null };

/**
 * Name and e-mail of the creators of an empresa's velórios (audit). The ids must come from velórios
 * read through req.db, so they belong to the caller's empresa; the lookup ignores links on purpose,
 * so a creator who was later removed from the empresa still shows up.
 */
export async function criadoresPorId(ids: string[]): Promise<Map<string, Criador>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.profiles.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, full_name: true } });
  return new Map(rows.map((r) => [r.id, r]));
}
