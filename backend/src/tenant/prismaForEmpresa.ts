import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

// A Prisma client that can only see and change one empresa's data. Company routes use it as
// req.db (set by tenantGuard) — never the raw `prisma` (test/no-raw-prisma.test.ts enforces it).
//
// Prisma 5 accepts non-unique fields in findUnique/update/delete `where` (extendedWhereUnique),
// so the empresa filter is merged straight in: a record of another empresa is simply "not found"
// (null / P2025 → 404), which also avoids revealing that the id exists.
//
// Not covered here, by design:
//   - nested include/select: relations only point inside the same empresa (composite FKs from
//     001_multiempresa.sql + assertPertence on camera links), so they can't leak — EXCEPT
//     profiles.vinculos (the `usuario_empresas` relation): a shared user's other empresas would
//     be visible through it. Routes must never `include`/`select` vinculos through req.db; only
//     `_count` on it is used (see PROFILES below).
//   - create/createMany on child models: routes call assertPertence on the parent first.

type Filter = (empresaId: string) => Record<string, unknown>;

/** Models with their own empresa_id column. */
const DIRECT_MODELS = new Set(['cameras', 'sala_velorio', 'velorios', 'velorio_access_logs', 'terms_acceptances']);

/** Models without empresa_id: filtered through the parent relation. */
const CHILD_FILTERS: Record<string, Filter> = {
  velorio_homenagens: (empresa_id) => ({ velorios: { empresa_id } }),
  velorio_visitantes: (empresa_id) => ({ velorios: { empresa_id } }),
  velorio_cameras: (empresa_id) => ({ velorios: { empresa_id } }),
  sala_velorio_cameras: (empresa_id) => ({ sala_velorio: { empresa_id } }),
};

// homenagens_templates: an empresa reads its own templates plus the global ones (empresa_id NULL,
// D6) but can only change its own — so global templates are read-only from company routes.
const TEMPLATES = 'homenagens_templates';

// profiles have no empresa_id since spec 10: an empresa sees the users linked to it. Through req.db
// a user is created already linked to the caller's empresa, links can't be changed by data, and a
// user can't be deleted (that would remove them from every empresa).
const PROFILES = 'profiles';
// usuario_empresas through req.db: read and remove this empresa's links only — linking is a
// platform action (spec 10, U3).
const VINCULOS = 'usuario_empresas';
const VINCULOS_OPS = new Set(['findMany', 'findFirst', 'count', 'delete', 'deleteMany']);

function semVinculos(data: unknown): Record<string, unknown> {
  const { vinculos: _v, vinculos_criados: _c, ...rest } = (data ?? {}) as Record<string, unknown>;
  return rest;
}

const UNIQUE_WHERE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert']);
const MANY_WHERE_OPS = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany',
]);
const READ_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']);

function filterFor(model: string, operation: string, empresaId: string): Record<string, unknown> | undefined {
  if (model === PROFILES) return { vinculos: { some: { empresa_id: empresaId } } };
  if (model === VINCULOS) return VINCULOS_OPS.has(operation) ? { empresa_id: empresaId } : undefined;
  if (DIRECT_MODELS.has(model)) return { empresa_id: empresaId };
  if (CHILD_FILTERS[model]) return CHILD_FILTERS[model](empresaId);
  if (model === TEMPLATES) {
    return READ_OPS.has(operation) ? { OR: [{ empresa_id: empresaId }, { empresa_id: null }] } : { empresa_id: empresaId };
  }
  return undefined;
}

function scopeData(data: unknown, empresaId: string, mode: 'create' | 'update'): unknown {
  if (Array.isArray(data)) return data.map((item) => scopeData(item, empresaId, mode));
  if (!data || typeof data !== 'object') return data;
  // Never let the caller pick the empresa, neither by scalar nor by relation connect.
  const { empresa_id: _ignored, empresa: _ignoredRelation, ...rest } = data as Record<string, unknown>;
  return mode === 'create' ? { ...rest, empresa_id: empresaId } : rest;
}

export function prismaForEmpresa(empresaId: string) {
  return prisma.$extends({
    name: 'tenant',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const filter = filterFor(model, operation, empresaId);
          if (!filter) {
            throw new Error(`Modelo "${model}" não pode ser acessado pelo client da empresa`);
          }

          const a = (args ?? {}) as Record<string, any>;
          if (UNIQUE_WHERE_OPS.has(operation)) {
            a.where = { ...a.where, ...filter };
          } else if (MANY_WHERE_OPS.has(operation)) {
            a.where = a.where ? { AND: [a.where, filter] } : filter;
          }

          if (model === PROFILES) {
            if (['delete', 'deleteMany', 'createMany', 'upsert'].includes(operation)) {
              throw new Error(`profiles.${operation} não é permitido pelo client da empresa`);
            }
            if (operation === 'create') a.data = { ...semVinculos(a.data), vinculos: { create: { empresa_id: empresaId } } };
            if (operation === 'update' || operation === 'updateMany') a.data = semVinculos(a.data);
          }

          const ownsEmpresaColumn = DIRECT_MODELS.has(model) || model === TEMPLATES;
          if (ownsEmpresaColumn) {
            if (operation === 'create' || operation === 'createMany') a.data = scopeData(a.data, empresaId, 'create');
            if (operation === 'update' || operation === 'updateMany') a.data = scopeData(a.data, empresaId, 'update');
            if (operation === 'upsert') {
              a.create = scopeData(a.create, empresaId, 'create');
              a.update = scopeData(a.update, empresaId, 'update');
            }
          }

          return query(a);
        },
      },
    },
  });
}

export type TenantPrisma = ReturnType<typeof prismaForEmpresa>;

/** Throws NotFoundError unless every id belongs to the empresa behind `db`. */
export async function assertPertence(
  db: TenantPrisma,
  model: 'velorios' | 'sala_velorio' | 'cameras',
  ids: string[],
): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const delegate = db[model] as unknown as { count(args: { where: { id: { in: string[] } } }): Promise<number> };
  const found = await delegate.count({ where: { id: { in: unique } } });
  if (found !== unique.length) throw new NotFoundError();
}

export class NotFoundError extends Error {
  constructor(message = 'Não encontrado') {
    super(message);
  }
}

export function isNotFound(error: unknown): boolean {
  return (
    error instanceof NotFoundError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') ||
    // Malformed UUID in a route param: treat like any other id that doesn't exist.
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2023')
  );
}
