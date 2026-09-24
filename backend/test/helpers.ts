import { randomBytes, randomUUID } from 'crypto';
import { user_role as UserRole } from '@prisma/client';
import { assertTestDatabase } from './testDb';
import { prisma } from '../src/prisma';
import { hashPassword } from '../src/auth/password';
import { signToken } from '../src/auth/jwt';

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

// Profiles of company roles need an empresa (CHECK profiles_empresa_platform_admin); one is
// created on the fly when not given. platform_admin never gets one.
export async function createProfile(
  overrides: { role?: UserRole; email?: string; is_active?: boolean; empresa_id?: string } = {},
) {
  const role = overrides.role ?? 'viewer';
  const empresa_id = role === 'platform_admin' ? null : (overrides.empresa_id ?? (await createEmpresa()).id);
  return prisma.profiles.create({
    data: {
      id: randomUUID(),
      email: overrides.email ?? `teste-${randomUUID()}@example.com`,
      password_hash: await hashedTestPassword(),
      role,
      is_active: overrides.is_active ?? true,
      empresa_id,
    },
  });
}

export function authHeader(profile: { id: string }) {
  return { Authorization: `Bearer ${signToken({ sub: profile.id })}` };
}
