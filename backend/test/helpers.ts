import { randomBytes, randomUUID } from 'crypto';
import { user_role as UserRole } from '@prisma/client';
import { assertTestDatabase } from './testDb';
import { prisma } from '../src/prisma';
import { hashPassword } from '../src/auth/password';
import { signToken, tokenFor } from '../src/auth/jwt';

export const TEST_PASSWORD = 'senha-de-teste-123';

// bcrypt takes ~1s per hash; every test user shares the same password, so hash it once.
let testPasswordHash: Promise<string> | undefined;
const hashedTestPassword = () => (testPasswordHash ??= hashPassword(TEST_PASSWORD));

export async function resetDb() {
  assertTestDatabase();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

const randomToken = (length: number) => randomBytes(length).toString('hex').slice(0, length);

export async function createEmpresa(overrides: { nome?: string; ativo?: boolean } = {}) {
  const suffix = randomToken(8);
  return prisma.empresas.create({
    data: {
      nome: overrides.nome ?? `Funerária ${suffix}`,
      nome_exibicao: overrides.nome ?? `Funerária ${suffix}`,
      slug: `funeraria-${suffix}`,
      hash_publico: randomToken(8),
      ativo: overrides.ativo ?? true,
    },
  });
}

// Company roles get a link to an empresa: `empresa_id` undefined → a new empresa is created;
// null → no link (a registered user without empresa). platform_admin never gets one (trigger).
export async function createProfile(
  overrides: { role?: UserRole; email?: string; is_active?: boolean; empresa_id?: string | null } = {},
) {
  const role = overrides.role ?? 'viewer';
  const empresa_id =
    role === 'platform_admin' ? null : overrides.empresa_id === undefined ? (await createEmpresa()).id : overrides.empresa_id;
  const profile = await prisma.profiles.create({
    data: {
      id: randomUUID(),
      email: overrides.email ?? `teste-${randomUUID()}@example.com`,
      password_hash: await hashedTestPassword(),
      role,
      is_active: overrides.is_active ?? true,
      vinculos: empresa_id ? { create: { empresa_id } } : undefined,
    },
  });
  return { ...profile, empresa_id };
}

export function vincular(profileId: string, empresaId: string) {
  return prisma.usuario_empresas.create({ data: { profile_id: profileId, empresa_id: empresaId } });
}

/** Token without an active empresa (like the ones issued before spec 10, or a provisional login). */
export function authHeader(profile: { id: string }) {
  return { Authorization: `Bearer ${signToken({ sub: profile.id })}` };
}

/** Token acting for a given empresa (as issued by login or POST /auth/empresa). */
export function authHeaderEmpresa(profile: { id: string; senha_alterada_em?: Date | null }, empresaId?: string) {
  return { Authorization: `Bearer ${tokenFor({ id: profile.id, senha_alterada_em: profile.senha_alterada_em ?? null }, empresaId)}` };
}
