# Usuários globais e vínculo com várias empresas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar `profiles.empresa_id` por uma tabela de vínculos (`usuario_empresas`), permitindo que um usuário esteja em zero, uma ou várias empresas, com escolha/troca da empresa ativa e um cadastro global de usuários na plataforma.

**Architecture:** A empresa ativa vai no JWT (`emp`) e é revalidada contra `usuario_empresas` a cada requisição em `requireAuth`, que continua sendo o único ponto que preenche `req.empresa` — todo o isolamento existente (`requireTenant`, `prismaForEmpresa`) parte dele. `prismaForEmpresa` passa a filtrar `profiles` pelos vínculos. Rotas novas: `POST /auth/empresa`, `DELETE /users/:id/vinculo`, `/platform/usuarios/*`.

**Tech Stack:** PostgreSQL 17 (script SQL numerado), Prisma 5, Express + TypeScript, Vitest + supertest (`campax_test`), React 18 + TanStack Query + shadcn/ui.

**Spec:** `docs/multiempresa/10-usuarios-globais.md`

## Global Constraints

- Papel é da pessoa: `profiles.role` vale em todas as empresas (U2). Não criar papel por vínculo.
- Só a plataforma vincula e desvincula (U3). `req.db` nunca cria vínculo com outra empresa.
- `platform_admin` nunca tem vínculo (U5), garantido por trigger.
- Superadmin, com usuário que também está em outra empresa: senha, papel e ativo → **403** "Este usuário também atende outra empresa; fale com o suporte da Campax" (U4). Ele vê só a quantidade (`outras_empresas`), nunca quais.
- Regra U8: desativar, mudar papel e desvincular não podem deixar nenhuma empresa da pessoa sem superadmin ativo → 400.
- Sem vínculo e sem `emp`: 401 "Nenhuma empresa vinculada a este usuário". `emp` sem vínculo: 401 "Você não tem mais acesso a esta empresa". Empresa ativa suspensa: 403 "Empresa suspensa".
- No subdomínio (`empresa_slug`), usuário sem vínculo com aquela empresa → 401 "Credenciais inválidas" (igual a senha errada).
- Tokens de antes da implantação (sem `emp`) continuam valendo para quem tem um vínculo só.
- Só os arquivos de `backend/test/no-raw-prisma.test.ts` importam o `prisma` cru (`tenant/` e `scripts/` inclusos).
- Corpos de requisição passam por validação explícita; erros por `handleError`.
- Todo texto de interface em português do Brasil.

## Review Focus

- **Trocar de empresa não pode deixar na tela dados da empresa anterior** (cache do TanStack Query) — Task 5 limpa o cache; Task 9 confere no navegador.
- **Um login do endereço geral aberto no subdomínio** (provisório ou de outra empresa) deve ser descartado e o login no subdomínio entrar direto na funerária do endereço — Task 9 confere no navegador.
- **Trocar a própria senha com o login provisório** (antes de escolher a empresa) precisa funcionar — teste na Task 2.
- **Superadmin editando nome/WhatsApp de um usuário compartilhado** continua permitido (só senha, papel e ativo são barrados) — teste na Task 3.
- **Vincular duas vezes o mesmo usuário à mesma empresa** é idempotente, e desvincular um vínculo que não existe → 404 — testes na Task 4.

## File Structure

Backend (`backend/`):
- Create `prisma/sql/003_usuario_empresas.sql` — tabela, triggers, cópia dos vínculos, remoção da coluna.
- Modify `prisma/schema.prisma` — modelo `usuario_empresas`, relações; sai `profiles.empresa_id`.
- Create `src/auth/empresaAtiva.ts` — `resolverEmpresaAtiva()` (puro).
- Modify `src/auth/jwt.ts` — `emp` no payload, `tokenFor(profile, empresaId?)`.
- Modify `src/auth/middleware.ts` — `requireAuth` resolve a empresa ativa pelos vínculos; `req.vinculos`.
- Modify `src/tenant/prismaForEmpresa.ts` — `profiles` filtrado por vínculo; `usuario_empresas` só leitura/remoção.
- Create `src/tenant/criadores.ts` — nomes dos criadores para a auditoria.
- Create `src/tenant/superadmins.ts` — regra U8 (`assertNaoDeixaSemSuperadmin`, `RegraSuperadminError`).
- Modify `src/lib/empresa.ts` — `toEmpresaResumo`.
- Modify `src/lib/http.ts` — `isTenantRole`, `EMAIL_RE`, `handleError` trata `RegraSuperadminError`.
- Modify `src/routes/auth.ts` — login com vínculos, `/auth/me` com `empresas`, `POST /auth/empresa`.
- Modify `src/routes/users.ts` — `outras_empresas`, 403 em compartilhados, U8, `DELETE /:id/vinculo`.
- Modify `src/routes/platform.ts` — rotas por empresa usam vínculos; uso por empresa; U8.
- Create `src/routes/platformUsuarios.ts` — cadastro global (`/platform/usuarios`).
- Modify `src/routes/velorios.ts` — auditoria usa `criadoresPorId`.
- Modify `src/app.ts` — monta `platformUsuariosRouter`.
- Modify `src/scripts/createPlatformAdmin.ts` — sem `empresa_id`.
- Tests: modify `test/helpers.ts`, `test/schema.test.ts`, `test/no-raw-prisma.test.ts`; create `test/vinculos/{base,login,superadmin,plataforma}.test.ts`.

Frontend (`src/`):
- Modify `types/empresa.ts` — `EmpresaResumo`.
- Modify `hooks/useAuth.ts` — `empresas`, `precisaEscolherEmpresa`, `trocarEmpresa`.
- Create `components/EmpresaEscolha.tsx` — lista de cartões de empresa (usada na página e no diálogo).
- Create `pages/EscolherEmpresa.tsx` — `/admin/escolher-empresa`.
- Create `components/TrocarEmpresaDialog.tsx` — "Trocar empresa" na barra lateral.
- Modify `components/ProtectedRoute.tsx`, `pages/AdminLogin.tsx`, `components/AdminLayout.tsx`, `App.tsx`.
- Modify `hooks/useUsers.ts`, `pages/UserManagement.tsx`, `components/EditUserDialog.tsx` — limites do superadmin.
- Create `hooks/usePlatformUsuariosGlobais.ts`, `pages/platform/PlatformUsuarios.tsx`, `pages/platform/PlatformUsuarioNovo.tsx`, `pages/platform/PlatformUsuarioDetalhe.tsx`.
- Modify `components/PlatformLayout.tsx` (item "Usuários"), `hooks/usePlatform.ts` e `pages/platform/PlatformEmpresaDetalhe.tsx` (aba Usuários).

Docs: `CLAUDE.md`, `docs/multiempresa/10-usuarios-globais.md` (notas), `docs/multiempresa/00-planejamento.md`.

**Desvio da spec, registrado de propósito:** a spec pede um teste Vitest da migração. O `campax_test` é recriado a partir do schema do `campax_dev` já migrado, então não há banco pré-migração para o Vitest rodar o script. A migração é verificada pela checagem de contagem dentro do próprio script (aborta se não bater), rodando em `campax_dev` (cópia com dados reais) antes de `campax`, e pelo teste de "rodar de novo é recusado" feito à mão na Task 1. Anotar isso nas notas da spec (Task 9).

---

### Task 1: Tabela de vínculos, empresa ativa em `requireAuth` e o resto do backend adaptado

Troca o modelo sem mudar o comportamento para quem tem um vínculo só (todos hoje). Ao final, a suíte inteira passa.

**Files:**
- Create: `backend/prisma/sql/003_usuario_empresas.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/auth/empresaAtiva.ts`
- Modify: `backend/src/auth/jwt.ts`, `backend/src/auth/middleware.ts`
- Modify: `backend/src/tenant/prismaForEmpresa.ts`
- Create: `backend/src/tenant/criadores.ts`
- Modify: `backend/src/routes/auth.ts`, `backend/src/routes/platform.ts`, `backend/src/routes/velorios.ts`, `backend/src/scripts/createPlatformAdmin.ts`
- Modify: `backend/test/helpers.ts`, `backend/test/schema.test.ts`
- Create: `backend/test/vinculos/base.test.ts`

**Interfaces:**
- Produces:
  - Prisma: modelo `usuario_empresas { profile_id, empresa_id, created_at, created_by }`, relações `profiles.vinculos`, `profiles.vinculos_criados`, `empresas.usuario_empresas`, `usuario_empresas.profile`, `.empresa`, `.criador`; chave composta `profile_id_empresa_id`.
  - `resolverEmpresaAtiva(vinculos: { empresa: Empresa }[], emp?: string): EmpresaAtiva` com `EmpresaAtiva = { tipo: 'empresa'; empresa: Empresa } | { tipo: 'provisorio' } | { tipo: 'sem-vinculo' } | { tipo: 'sem-acesso' }` (`src/auth/empresaAtiva.ts`).
  - `JwtPayload { sub: string; sv?: number; emp?: string }`; `tokenFor(profile: { id: string; senha_alterada_em: Date | null }, empresaId?: string): string` (`src/auth/jwt.ts`).
  - `VINCULOS_INCLUDE` (include de `profiles` com `vinculos → empresa`, ordenado por `created_at`) exportado de `src/auth/middleware.ts`.
  - `req.vinculos?: Empresa[]` (todas as empresas da pessoa; vazio para `platform_admin`).
  - `criadoresPorId(ids: string[]): Promise<Map<string, { id: string; email: string; full_name: string | null }>>` (`src/tenant/criadores.ts`).
  - Test helpers: `createProfile({ role?, email?, is_active?, empresa_id?: string | null })` retorna o perfil + `empresa_id` (`undefined` → empresa nova; `null` → sem vínculo); `vincular(profileId, empresaId)`; `authHeaderEmpresa(profile, empresaId?)`.

- [ ] **Step 1: Backup do banco de produção (antes de qualquer coisa)**

Run: `bash /root/campax/scripts/backup-db.sh`
Expected: `backup ok: /root/backups/campax/campax-<data>.dump`

- [ ] **Step 2: Escrever o script SQL**

Create `backend/prisma/sql/003_usuario_empresas.sql`:

```sql
-- ============================================================================
-- 003_usuario_empresas — spec docs/multiempresa/10-usuarios-globais.md
-- Um usuário pode estar em zero, uma ou várias empresas: profiles.empresa_id vira a tabela
-- usuario_empresas. platform_admin nunca tem vínculo (triggers no lugar do CHECK antigo).
-- Execução: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/prisma/sql/003_usuario_empresas.sql
-- ============================================================================

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_scripts WHERE name = '003_usuario_empresas') THEN
    RAISE EXCEPTION '003_usuario_empresas já foi aplicado neste banco — nada a fazer.';
  END IF;
END $$;

BEGIN;

CREATE TABLE usuario_empresas (
  profile_id uuid NOT NULL,
  empresa_id uuid NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  created_by uuid NULL,
  CONSTRAINT usuario_empresas_pkey PRIMARY KEY (profile_id, empresa_id),
  CONSTRAINT usuario_empresas_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT usuario_empresas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT,
  CONSTRAINT usuario_empresas_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);
CREATE INDEX idx_usuario_empresas_empresa ON usuario_empresas (empresa_id);

CREATE FUNCTION usuario_empresas_sem_platform_admin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.profile_id AND role = 'platform_admin') THEN
    RAISE EXCEPTION 'usuario_empresas_sem_platform_admin: platform_admin não pode ser vinculado a empresas';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER usuario_empresas_sem_platform_admin
  BEFORE INSERT OR UPDATE ON usuario_empresas
  FOR EACH ROW EXECUTE FUNCTION usuario_empresas_sem_platform_admin();

CREATE FUNCTION profiles_platform_admin_sem_vinculo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'platform_admin' AND EXISTS (SELECT 1 FROM usuario_empresas WHERE profile_id = NEW.id) THEN
    RAISE EXCEPTION 'profiles_platform_admin_sem_vinculo: usuário com empresa não pode virar platform_admin';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_platform_admin_sem_vinculo
  BEFORE UPDATE OF role ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_platform_admin_sem_vinculo();

INSERT INTO usuario_empresas (profile_id, empresa_id, created_at)
SELECT id, empresa_id, created_at FROM profiles WHERE empresa_id IS NOT NULL;

DO $$
DECLARE
  vinculos int;
  perfis int;
BEGIN
  SELECT count(*) INTO vinculos FROM usuario_empresas;
  SELECT count(*) INTO perfis FROM profiles WHERE empresa_id IS NOT NULL;
  IF vinculos <> perfis THEN
    RAISE EXCEPTION '003: % vínculos criados para % perfis com empresa — abortando', vinculos, perfis;
  END IF;
  RAISE NOTICE '003: % vínculos criados', vinculos;
END $$;

ALTER TABLE profiles DROP CONSTRAINT profiles_empresa_platform_admin;
ALTER TABLE profiles DROP CONSTRAINT profiles_empresa_id_fkey;
DROP INDEX IF EXISTS idx_profiles_empresa;
ALTER TABLE profiles DROP COLUMN empresa_id;

INSERT INTO schema_scripts (name) VALUES ('003_usuario_empresas');
COMMIT;
```

- [ ] **Step 3: Aplicar em `campax_dev` e recriar `campax_test`**

`refresh-dev-db.sh dev` recria `campax_dev` a partir de `campax` e aplica os scripts pendentes (o 003 entra aqui, com `SET ROLE campax_local`).

Run: `cd /root/campax/backend && bash scripts/refresh-dev-db.sh all 2>&1 | tail -5`
Expected: `→ aplicando 003_usuario_empresas`, `✓ campax_dev pronto`, `✓ campax_test pronto`

Run: `sudo -u postgres psql -d campax_dev -tAc "select count(*) from usuario_empresas"; sudo -u postgres psql -d campax -tAc "select count(*) from profiles where empresa_id is not null"`
Expected: os dois números iguais (hoje, 5 e 5).

Run (rodar de novo é recusado): `sudo -u postgres psql -d campax_dev -v ON_ERROR_STOP=1 -f - < prisma/sql/003_usuario_empresas.sql 2>&1 | grep -o "já foi aplicado"`
Expected: `já foi aplicado`

- [ ] **Step 4: Ajustar `schema.prisma` e conferir contra `campax_dev`**

In `backend/prisma/schema.prisma`, model `empresas`: replace the line `  profiles             profiles[]` with:

```prisma
  usuario_empresas     usuario_empresas[]
```

In model `profiles`: remove the lines

```prisma
  /// NULL só para platform_admin (CHECK profiles_empresa_platform_admin, só no banco).
  empresa_id      String?   @db.Uuid
  empresa         empresas? @relation(fields: [empresa_id], references: [id], onDelete: Restrict, onUpdate: NoAction)
```

and `  @@index([empresa_id], map: "idx_profiles_empresa")`, and add before the `@@index` lines:

```prisma
  /// Empresas da pessoa (spec 10). platform_admin nunca tem vínculo (triggers do 003, só no banco).
  vinculos         usuario_empresas[] @relation("vinculos")
  vinculos_criados usuario_empresas[] @relation("vinculos_criados")
```

Add the new model after `profiles`:

```prisma
/// Vínculo usuário ↔ empresa (spec 10). O papel continua em profiles.role, igual em todas as empresas.
model usuario_empresas {
  profile_id String    @db.Uuid
  empresa_id String    @db.Uuid
  created_at DateTime  @default(now()) @db.Timestamptz(6)
  created_by String?   @db.Uuid
  profile    profiles  @relation("vinculos", fields: [profile_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  empresa    empresas  @relation(fields: [empresa_id], references: [id], onDelete: Restrict, onUpdate: NoAction)
  criador    profiles? @relation("vinculos_criados", fields: [created_by], references: [id], onDelete: SetNull, onUpdate: NoAction)

  @@id([profile_id, empresa_id])
  @@index([empresa_id], map: "idx_usuario_empresas_empresa")
}
```

Run: `cd /root/campax/backend && npx prisma migrate diff --from-url "$(grep ^DATABASE_URL .env.development | cut -d= -f2- | tr -d '"')" --to-schema-datamodel prisma/schema.prisma --script && npx prisma generate | grep Generated`
Expected: `-- This is an empty migration.` and `✔ Generated Prisma Client`. If the diff is not empty, adjust the model (names/actions) until it is — never change the SQL already applied.

- [ ] **Step 5: Escrever os testes que falham**

Replace in `backend/test/helpers.ts` the imports and `createProfile`/`authHeader` section:

```ts
import { randomBytes, randomUUID } from 'crypto';
import { user_role as UserRole } from '@prisma/client';
import { assertTestDatabase } from './testDb';
import { prisma } from '../src/prisma';
import { hashPassword } from '../src/auth/password';
import { signToken, tokenFor } from '../src/auth/jwt';
```

```ts
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
```

In `backend/test/schema.test.ts`, replace the test `'platform_admin não pode ter empresa; papéis de empresa precisam de uma'` with:

```ts
  it('platform_admin nunca tem vínculo (triggers do 003)', async () => {
    const a = await createEmpresa();
    const plat = await createProfile({ role: 'platform_admin' });
    await expect(prisma.usuario_empresas.create({ data: { profile_id: plat.id, empresa_id: a.id } })).rejects.toThrow(
      /usuario_empresas_sem_platform_admin/,
    );
    const admin = await createProfile({ role: 'admin', empresa_id: a.id });
    await expect(prisma.profiles.update({ where: { id: admin.id }, data: { role: 'platform_admin' } })).rejects.toThrow(
      /profiles_platform_admin_sem_vinculo/,
    );
    const semEmpresa = await createProfile({ role: 'admin', empresa_id: null });
    await expect(prisma.usuario_empresas.count({ where: { profile_id: semEmpresa.id } })).resolves.toBe(0);
  });

  it('empresa com usuário vinculado não pode ser apagada; apagar o usuário apaga o vínculo', async () => {
    const a = await createEmpresa();
    const user = await createProfile({ role: 'viewer', empresa_id: a.id });
    await expect(prisma.empresas.delete({ where: { id: a.id } })).rejects.toThrow();
    await prisma.profiles.delete({ where: { id: user.id } });
    await expect(prisma.usuario_empresas.count({ where: { empresa_id: a.id } })).resolves.toBe(0);
  });
```

Create `backend/src/auth/empresaAtiva.ts` **only after** writing its test. First create `backend/test/vinculos/base.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { resolverEmpresaAtiva } from '../../src/auth/empresaAtiva';
import { authHeader, authHeaderEmpresa, createEmpresa, createProfile, resetDb, vincular } from '../helpers';

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

describe('resolverEmpresaAtiva', () => {
  const A = { id: 'a' } as any;
  const B = { id: 'b' } as any;
  it.each([
    ['um vínculo, sem emp', [A], undefined, { tipo: 'empresa', empresa: A }],
    ['vários, sem emp', [A, B], undefined, { tipo: 'provisorio' }],
    ['nenhum, sem emp', [], undefined, { tipo: 'sem-vinculo' }],
    ['emp com vínculo', [A, B], 'b', { tipo: 'empresa', empresa: B }],
    ['emp sem vínculo', [A], 'b', { tipo: 'sem-acesso' }],
    ['emp e nenhum vínculo', [], 'a', { tipo: 'sem-acesso' }],
  ])('%s', (_nome, empresas, emp, esperado) => {
    expect(resolverEmpresaAtiva(empresas.map((empresa) => ({ empresa })), emp)).toEqual(esperado);
  });
});

describe('requireAuth com vínculos', () => {
  it('token antigo (sem emp) de quem tem um vínculo continua valendo', async () => {
    const user = await createProfile({ role: 'admin' });
    const res = await request(app).get('/cameras').set(authHeader(user));
    expect(res.status).toBe(200);
  });

  it('sem nenhum vínculo → 401 "Nenhuma empresa vinculada"', async () => {
    const user = await createProfile({ role: 'admin', empresa_id: null });
    const res = await request(app).get('/auth/me').set(authHeader(user));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Nenhuma empresa vinculada a este usuário');
  });

  it('vários vínculos sem emp: /auth/me responde, rotas de empresa → 403', async () => {
    const [a, b] = [await createEmpresa(), await createEmpresa()];
    const user = await createProfile({ role: 'admin', empresa_id: a.id });
    await vincular(user.id, b.id);
    expect((await request(app).get('/auth/me').set(authHeader(user))).status).toBe(200);
    expect((await request(app).get('/cameras').set(authHeader(user))).status).toBe(403);
  });

  it('emp de empresa sem vínculo → 401 "Você não tem mais acesso a esta empresa"', async () => {
    const outra = await createEmpresa();
    const user = await createProfile({ role: 'admin' });
    const res = await request(app).get('/cameras').set(authHeaderEmpresa(user, outra.id));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Você não tem mais acesso a esta empresa');
  });
});

describe('req.db e vínculos', () => {
  it('superadmin cria usuário já vinculado à empresa dele', async () => {
    const superadmin = await createProfile({ role: 'superadmin' });
    const res = await request(app).post('/users').set(authHeader(superadmin))
      .send({ email: 'novo@example.com', password: 'senha-forte-1', role: 'viewer' });
    expect(res.status).toBe(200);
    const vinculos = await prisma.usuario_empresas.findMany({ where: { profile_id: res.body.data.id } });
    expect(vinculos.map((v) => v.empresa_id)).toEqual([superadmin.empresa_id]);
  });

  it('auditoria mostra o criador mesmo depois de desvinculado', async () => {
    const superadmin = await createProfile({ role: 'superadmin' });
    const empresaId = superadmin.empresa_id!;
    const criador = await createProfile({ role: 'operador', empresa_id: empresaId });
    const sala = await prisma.sala_velorio.create({ data: { nome_sala_velorio: 'Sala', slug: 'sala-1', empresa_id: empresaId } });
    await prisma.velorios.create({
      data: {
        nome_falecido: 'Fulano', data_inicio: new Date(), data_fim: new Date(Date.now() + 3600_000),
        token_acesso: 'ABC123', sala_velorio_id: sala.id, empresa_id: empresaId, created_by: criador.id,
      },
    });
    await prisma.usuario_empresas.deleteMany({ where: { profile_id: criador.id } });
    const res = await request(app).get('/velorios/audit').set(authHeader(superadmin));
    expect(res.status).toBe(200);
    expect(res.body.data[0].created_by_email).toBe(criador.email);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd /root/campax/backend && npx vitest run test/vinculos/base.test.ts test/schema.test.ts 2>&1 | tail -15`
Expected: FAIL — `Cannot find module '../../src/auth/empresaAtiva'` (and TS errors in `src/` that still use `empresa_id`/`empresa` on `profiles`).

- [ ] **Step 7: Implementar**

Create `backend/src/auth/empresaAtiva.ts`:

```ts
import { empresas as Empresa } from '@prisma/client';

export type EmpresaAtiva =
  | { tipo: 'empresa'; empresa: Empresa }
  /** Vários vínculos e nenhum escolhido: login provisório (só /auth/me, /auth/senha, /auth/empresa). */
  | { tipo: 'provisorio' }
  | { tipo: 'sem-vinculo' }
  /** O token aponta para uma empresa com a qual a pessoa não tem (mais) vínculo. */
  | { tipo: 'sem-acesso' };

/** Which empresa a token acts for (spec 10). `emp` is the token's claim; without it, a single link is used. */
export function resolverEmpresaAtiva(vinculos: { empresa: Empresa }[], emp?: string): EmpresaAtiva {
  if (emp) {
    const vinculo = vinculos.find((v) => v.empresa.id === emp);
    return vinculo ? { tipo: 'empresa', empresa: vinculo.empresa } : { tipo: 'sem-acesso' };
  }
  if (vinculos.length === 0) return { tipo: 'sem-vinculo' };
  if (vinculos.length === 1) return { tipo: 'empresa', empresa: vinculos[0].empresa };
  return { tipo: 'provisorio' };
}
```

Replace `backend/src/auth/jwt.ts` payload and `tokenFor`:

```ts
export interface JwtPayload {
  sub: string;
  /** profiles.senha_alterada_em (ms) when the token was issued; absent = never changed. */
  sv?: number;
  /** Active empresa (spec 10); absent = the only link, or a provisional login with several. */
  emp?: string;
}
```

```ts
export function tokenFor(profile: { id: string; senha_alterada_em: Date | null }, empresaId?: string): string {
  return signToken({ sub: profile.id, sv: sessaoVersao(profile), emp: empresaId });
}
```

In `backend/src/auth/middleware.ts`: add the import `import { resolverEmpresaAtiva } from './empresaAtiva';`, add to the `Request` interface:

```ts
      /** Every empresa the user is linked to (spec 10); empty for platform_admin. */
      vinculos?: Empresa[];
```

and replace the body of `requireAuth` from `const payload = verifyToken(token);` to `next();` with:

```ts
    const payload = verifyToken(token);
    // Links and empresas come from the DB on every request (not from the JWT), so unlinking a
    // user, suspending an empresa or changing the password takes effect immediately.
    const profile = await prisma.profiles.findUnique({ where: { id: payload.sub }, include: VINCULOS_INCLUDE });
    if (!profile || !profile.is_active) {
      return res.status(401).json({ success: false, error: 'Sessão inválida' });
    }
    if (payload.sv !== sessaoVersao(profile)) {
      return res.status(401).json({ success: false, error: 'Sessão encerrada: a senha foi alterada' });
    }

    const { vinculos, ...rest } = profile;
    req.profile = rest;
    req.vinculos = vinculos.map((v) => v.empresa);
    if (rest.role === 'platform_admin') {
      req.empresa = null;
      return next();
    }

    const ativa = resolverEmpresaAtiva(vinculos, payload.emp);
    if (ativa.tipo === 'sem-vinculo') {
      return res.status(401).json({ success: false, error: 'Nenhuma empresa vinculada a este usuário' });
    }
    if (ativa.tipo === 'sem-acesso') {
      return res.status(401).json({ success: false, error: 'Você não tem mais acesso a esta empresa' });
    }
    if (ativa.tipo === 'empresa' && !ativa.empresa.ativo) {
      return res.status(403).json({ success: false, error: 'Empresa suspensa' });
    }
    req.empresa = ativa.tipo === 'empresa' ? ativa.empresa : null;
    next();
```

and export, above `requireAuth`:

```ts
/** profiles include with every linked empresa, oldest link first. */
export const VINCULOS_INCLUDE = {
  vinculos: { include: { empresa: true }, orderBy: { created_at: 'asc' } },
} satisfies Prisma.profilesInclude;
```

(add `Prisma` to the `@prisma/client` import in that file).

In `backend/src/tenant/prismaForEmpresa.ts`:
- Remove `'profiles'` from `DIRECT_MODELS`.
- Below `const TEMPLATES = ...` add:

```ts
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
```

- In `filterFor`, first lines:

```ts
  if (model === PROFILES) return { vinculos: { some: { empresa_id: empresaId } } };
  if (model === VINCULOS) return VINCULOS_OPS.has(operation) ? { empresa_id: empresaId } : undefined;
```

- In `$allOperations`, right after the `if (UNIQUE_WHERE_OPS...) ... else if (MANY_WHERE_OPS...)` block, add:

```ts
          if (model === PROFILES) {
            if (['delete', 'deleteMany', 'createMany', 'upsert'].includes(operation)) {
              throw new Error(`profiles.${operation} não é permitido pelo client da empresa`);
            }
            if (operation === 'create') a.data = { ...semVinculos(a.data), vinculos: { create: { empresa_id: empresaId } } };
            if (operation === 'update' || operation === 'updateMany') a.data = semVinculos(a.data);
          }
```

(`filterFor` returning `undefined` for `usuario_empresas` with any other operation already throws "não pode ser acessado".)

Create `backend/src/tenant/criadores.ts`:

```ts
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
```

In `backend/src/routes/velorios.ts` (audit route), replace

```ts
    const creators = creatorIds.length
      ? await req.db!.profiles.findMany({ where: { id: { in: creatorIds } }, select: { id: true, email: true, full_name: true } })
      : [];
    const creatorMap = new Map(creators.map((c) => [c.id, c]));
```

with `const creatorMap = await criadoresPorId(creatorIds);` and add `import { criadoresPorId } from '../tenant/criadores';`.

In `backend/src/routes/auth.ts`, login (interim — Task 2 rewrites it): replace the lookup and the checks up to the response with:

```ts
    const profile = await prisma.profiles.findUnique({ where: { email }, include: VINCULOS_INCLUDE });
    if (!profile || !profile.password_hash || !profile.is_active) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }

    const valid = await comparePassword(password, profile.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
    const empresa = profile.vinculos[0]?.empresa ?? null;
    if (typeof empresa_slug === 'string' && empresa_slug && empresa?.slug !== empresa_slug.toLowerCase()) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
    if (empresa && !empresa.ativo) {
      return res.status(403).json({ success: false, error: 'Empresa suspensa' });
    }

    const token = tokenFor(profile, empresa?.id);
    const { password_hash, vinculos, ...safeProfile } = profile;
    res.json({ success: true, token, profile: safeProfile, empresa: toEmpresaPublica(empresa) });
```

with `import { VINCULOS_INCLUDE, requireAuth } from '../auth/middleware';` (replacing the `requireAuth` import).

In `backend/src/routes/platform.ts`:
- `usuarioDaEmpresa`: `return prisma.profiles.findFirstOrThrow({ where: { id: userId, vinculos: { some: { empresa_id: empresaId } } } });`
- `GET /empresas/:id/usuarios`: `where: { vinculos: { some: { empresa_id: req.params.id } } }`.
- `POST /empresas/:id/usuarios`: in `data`, replace `empresa_id: req.params.id` with `vinculos: { create: { empresa_id: req.params.id, created_by: req.profile!.id } }`.
- `POST /empresas` (transaction): in `tx.profiles.create`, replace `empresa_id: created.id` with `vinculos: { create: { empresa_id: created.id, created_by: req.profile!.id } }`.
- `PATCH /empresas/:id/usuarios/:uid/ativo`: the `outros` count `where` becomes `{ vinculos: { some: { empresa_id: req.params.id } }, role: 'superadmin', is_active: true, id: { not: user.id } }` (Task 4 replaces it with U8).
- `usoPorEmpresa`: replace the `prisma.profiles.groupBy(...)` line with

```ts
    prisma.usuario_empresas.groupBy({ by: ['empresa_id'], where, _count: true }),
```

In `backend/src/scripts/createPlatformAdmin.ts`: remove the line `      empresa_id: null,`.

- [ ] **Step 8: Rodar a suíte inteira**

Run: `cd /root/campax/backend && npx tsc --noEmit && npm test 2>&1 | grep -E "×|Test Files|Tests"`
Expected: no TS errors; all tests pass (184 existing, minus the replaced schema test, plus the new ones). If `extendedWhereUnique` rejects the relation filter on `update`/`findUnique` for `profiles`, change `UNIQUE_WHERE_OPS` handling for `PROFILES` only: before `query(a)`, run `const ok = await prisma.profiles.count({ where: { id: a.where.id, ...filter } }); if (!ok) throw new NotFoundError();` and keep `a.where` as the caller sent it.

- [ ] **Step 9: Commit**

```bash
cd /root/campax
git add backend/prisma backend/src backend/test
git commit -m "feat(usuarios): vínculos usuário↔empresa no lugar de profiles.empresa_id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Login com vários vínculos, `/auth/me` com empresas e `POST /auth/empresa`

**Files:**
- Modify: `backend/src/lib/empresa.ts`, `backend/src/routes/auth.ts`
- Create: `backend/test/vinculos/login.test.ts`

**Interfaces:**
- Consumes: `VINCULOS_INCLUDE`, `tokenFor(profile, empresaId?)`, `req.vinculos`, helpers da Task 1.
- Produces:
  - `EmpresaResumo = EmpresaPublica & { ativo: boolean }`, `toEmpresaResumo(empresa): EmpresaResumo` (`src/lib/empresa.ts`).
  - `POST /auth/login` → `{ success, token, profile, empresa: EmpresaPublica | null, empresas: EmpresaResumo[], escolher_empresa?: true }`.
  - `GET /auth/me` → `{ success, profile, empresa, empresas: EmpresaResumo[] }`.
  - `POST /auth/empresa` `{ empresa_id }` → `{ success, token, empresa: EmpresaPublica }`.

- [ ] **Step 1: Escrever os testes que falham**

Create `backend/test/vinculos/login.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { authHeader, createEmpresa, createProfile, resetDb, TEST_PASSWORD, vincular } from '../helpers';
import { duasEmpresas, idsIn, idsOf } from '../isolamento/fixture';

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const login = (email: string, extra: Record<string, unknown> = {}) =>
  request(app).post('/auth/login').send({ email, password: TEST_PASSWORD, ...extra });

async function usuarioEmDuas() {
  const [a, b, c] = [await createEmpresa(), await createEmpresa(), await createEmpresa()];
  const user = await createProfile({ role: 'admin', empresa_id: a.id });
  await vincular(user.id, b.id);
  return { a, b, c, user };
}

describe('login', () => {
  it('um vínculo: entra direto, com a empresa e a lista', async () => {
    const user = await createProfile({ role: 'admin' });
    const res = await login(user.email);
    expect(res.status).toBe(200);
    expect(res.body.empresa.id).toBe(user.empresa_id);
    expect(res.body.empresas).toHaveLength(1);
    expect(res.body.escolher_empresa).toBeUndefined();
    expect((await request(app).get('/cameras').set(bearer(res.body.token))).status).toBe(200);
  });

  it('sem vínculo → 403', async () => {
    const user = await createProfile({ role: 'admin', empresa_id: null });
    const res = await login(user.email);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Nenhuma empresa vinculada a este usuário');
  });

  it('vários vínculos: login provisório com a lista para escolher', async () => {
    const { a, b, user } = await usuarioEmDuas();
    const res = await login(user.email);
    expect(res.status).toBe(200);
    expect(res.body.escolher_empresa).toBe(true);
    expect(res.body.empresa).toBeNull();
    expect(res.body.empresas.map((e: { id: string }) => e.id).sort()).toEqual([a.id, b.id].sort());
    expect((await request(app).get('/cameras').set(bearer(res.body.token))).status).toBe(403);
  });

  it('vários vínculos, uma suspensa: aparece como inativa na lista', async () => {
    const { b, user } = await usuarioEmDuas();
    await prisma.empresas.update({ where: { id: b.id }, data: { ativo: false } });
    const res = await login(user.email);
    expect(res.body.empresas.find((e: { id: string }) => e.id === b.id).ativo).toBe(false);
  });

  it('vários vínculos, todas suspensas → 403 Empresa suspensa', async () => {
    const { a, b, user } = await usuarioEmDuas();
    await prisma.empresas.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { ativo: false } });
    const res = await login(user.email);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Empresa suspensa');
  });

  it('subdomínio de uma das empresas: entra direto nela', async () => {
    const { b, user } = await usuarioEmDuas();
    const res = await login(user.email, { empresa_slug: b.slug });
    expect(res.status).toBe(200);
    expect(res.body.empresa.id).toBe(b.id);
  });

  it('subdomínio de outra empresa → 401 igual a senha errada', async () => {
    const { c, user } = await usuarioEmDuas();
    const res = await login(user.email, { empresa_slug: c.slug });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciais inválidas');
  });
});

describe('POST /auth/empresa', () => {
  it('escolhe a empresa a partir do login provisório', async () => {
    const { b, user } = await usuarioEmDuas();
    const provisorio = (await login(user.email)).body.token;
    const res = await request(app).post('/auth/empresa').set(bearer(provisorio)).send({ empresa_id: b.id });
    expect(res.status).toBe(200);
    expect(res.body.empresa.id).toBe(b.id);
    const me = await request(app).get('/auth/me').set(bearer(res.body.token));
    expect(me.body.empresa.id).toBe(b.id);
    expect(me.body.empresas).toHaveLength(2);
  });

  it('empresa sem vínculo → 404; suspensa → 403', async () => {
    const { b, c, user } = await usuarioEmDuas();
    const provisorio = (await login(user.email)).body.token;
    expect((await request(app).post('/auth/empresa').set(bearer(provisorio)).send({ empresa_id: c.id })).status).toBe(404);
    await prisma.empresas.update({ where: { id: b.id }, data: { ativo: false } });
    expect((await request(app).post('/auth/empresa').set(bearer(provisorio)).send({ empresa_id: b.id })).status).toBe(403);
  });

  it('platform_admin → 403', async () => {
    const plat = await createProfile({ role: 'platform_admin' });
    const empresa = await createEmpresa();
    const res = await request(app).post('/auth/empresa').set(authHeader(plat)).send({ empresa_id: empresa.id });
    expect(res.status).toBe(403);
  });

  it('trocar a senha funciona com o login provisório', async () => {
    const { user } = await usuarioEmDuas();
    const provisorio = (await login(user.email)).body.token;
    const res = await request(app).post('/auth/senha').set(bearer(provisorio))
      .send({ senha_atual: TEST_PASSWORD, nova_senha: 'outra-senha-99' });
    expect(res.status).toBe(200);
  });

  it('desvinculado da empresa ativa: 401 na próxima requisição', async () => {
    const { a, user } = await usuarioEmDuas();
    const provisorio = (await login(user.email)).body.token;
    const token = (await request(app).post('/auth/empresa').set(bearer(provisorio)).send({ empresa_id: a.id })).body.token;
    expect((await request(app).get('/cameras').set(bearer(token))).status).toBe(200);
    await prisma.usuario_empresas.delete({ where: { profile_id_empresa_id: { profile_id: user.id, empresa_id: a.id } } });
    expect((await request(app).get('/cameras').set(bearer(token))).status).toBe(401);
  });
});

describe('isolamento com usuário em duas empresas', () => {
  const LISTAGENS = ['/cameras', '/salas', '/velorios', '/velorios/audit', '/access-logs', '/visitantes', '/terms-acceptances', '/users', '/homenagens-templates'];

  it.each(LISTAGENS)('GET %s agindo por A não mostra nada de B, e vice-versa', async (rota) => {
    const f = await duasEmpresas();
    const compartilhado = await createProfile({ role: 'superadmin', empresa_id: f.A.empresa.id });
    await vincular(compartilhado.id, f.B.empresa.id);
    const provisorio = (await login(compartilhado.email)).body.token;
    for (const [agindo, outra] of [[f.A, f.B], [f.B, f.A]] as const) {
      const token = (await request(app).post('/auth/empresa').set(bearer(provisorio)).send({ empresa_id: agindo.empresa.id })).body.token;
      const res = await request(app).get(rota).set(bearer(token));
      expect(res.status).toBe(200);
      const vistos = idsIn(res.body.data);
      for (const id of idsOf(outra)) expect(vistos, `id vazou em ${rota}`).not.toContain(id);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /root/campax/backend && npx vitest run test/vinculos/login.test.ts 2>&1 | grep -E "×|✓|Tests"`
Expected: most FAIL (no `empresas` in the response, `/auth/empresa` 404, multi-link login returns the first empresa).

- [ ] **Step 3: Implementar**

In `backend/src/lib/empresa.ts` add:

```ts
/** An empresa in a user's list (login, /auth/me): public fields plus whether it can be chosen. */
export type EmpresaResumo = EmpresaPublica & { ativo: boolean };

export function toEmpresaResumo(empresa: Record<string, unknown> & { ativo: boolean }): EmpresaResumo {
  return { ...(toEmpresaPublica(empresa) as EmpresaPublica), ativo: empresa.ativo };
}
```

In `backend/src/routes/auth.ts`, imports:

```ts
import { toEmpresaPublica, toEmpresaResumo } from '../lib/empresa';
```

Replace the login handler body after the password check (from `const empresa = profile.vinculos[0]...` to the `res.json(...)`) with:

```ts
    const { password_hash, vinculos, ...safeProfile } = profile;
    const empresas = vinculos.map((v) => v.empresa);
    const slug = typeof empresa_slug === 'string' && empresa_slug ? empresa_slug.toLowerCase() : null;

    if (profile.role === 'platform_admin') {
      // On a funerária's subdomain only its own users may log in (spec 08): same answer as a wrong password.
      if (slug) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
      return res.json({ success: true, token: tokenFor(profile), profile: safeProfile, empresa: null, empresas: [] });
    }

    let escolhida = slug ? empresas.find((e) => e.slug === slug) : empresas.length === 1 ? empresas[0] : undefined;
    // Checked only after the password, so these answers reveal nothing about which e-mails exist.
    if (slug && !escolhida) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    if (empresas.length === 0) {
      return res.status(403).json({ success: false, error: 'Nenhuma empresa vinculada a este usuário' });
    }
    const lista = empresas.map(toEmpresaResumo);

    if (escolhida) {
      if (!escolhida.ativo) return res.status(403).json({ success: false, error: 'Empresa suspensa' });
      return res.json({
        success: true, token: tokenFor(profile, escolhida.id), profile: safeProfile,
        empresa: toEmpresaPublica(escolhida), empresas: lista,
      });
    }
    // Several links on the generic address: provisional login, the user picks one (POST /auth/empresa).
    if (!empresas.some((e) => e.ativo)) return res.status(403).json({ success: false, error: 'Empresa suspensa' });
    res.json({ success: true, token: tokenFor(profile), profile: safeProfile, empresa: null, empresas: lista, escolher_empresa: true });
```

(`let escolhida` → `const escolhida`.)

Replace `GET /auth/me`:

```ts
authRouter.get('/me', requireAuth, async (req, res) => {
  const { password_hash, ...safeProfile } = req.profile!;
  res.json({
    success: true, profile: safeProfile, empresa: toEmpresaPublica(req.empresa),
    empresas: (req.vinculos ?? []).map(toEmpresaResumo),
  });
});
```

Append:

```ts
// Picks the active empresa after a provisional login, or switches it ("Trocar empresa").
authRouter.post('/empresa', requireAuth, async (req, res) => {
  const profile = req.profile!;
  if (profile.role === 'platform_admin') {
    return res.status(403).json({ success: false, error: 'Rota disponível apenas para usuários de uma empresa' });
  }
  const empresa = (req.vinculos ?? []).find((e) => e.id === req.body?.empresa_id);
  if (!empresa) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
  if (!empresa.ativo) return res.status(403).json({ success: false, error: 'Empresa suspensa' });
  console.log(`[auth] trocar-empresa usuario=${profile.id} empresa=${empresa.id}`);
  res.json({ success: true, token: tokenFor(profile, empresa.id), empresa: toEmpresaPublica(empresa) });
});
```

In `POST /auth/senha`, keep the active empresa in the new token: `res.json({ success: true, token: tokenFor(updated, req.empresa?.id) });`.

- [ ] **Step 4: Rodar os testes**

Run: `cd /root/campax/backend && npx tsc --noEmit && npm test 2>&1 | grep -E "×|Test Files|Tests"`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /root/campax
git add backend/src backend/test
git commit -m "feat(auth): login com várias empresas, escolha e troca da empresa ativa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Regra do último superadmin (U8) e os limites do superadmin (`/users`)

**Files:**
- Create: `backend/src/tenant/superadmins.ts`
- Modify: `backend/src/lib/http.ts`, `backend/src/routes/users.ts`, `backend/src/routes/platform.ts` (só para usar `isTenantRole`/`EMAIL_RE` de `lib/http`)
- Create: `backend/test/vinculos/superadmin.test.ts`

**Interfaces:**
- Consumes: `req.db` (Task 1: `profiles` por vínculo, `usuario_empresas` leitura/remoção), `createProfile`, `vincular`, `authHeader`.
- Produces:
  - `RegraSuperadminError extends Error`; `assertNaoDeixaSemSuperadmin(profileId: string, empresaIds: string[]): Promise<void>` (`src/tenant/superadmins.ts`).
  - `isTenantRole(role: unknown): role is TenantRole`, `EMAIL_RE` (`src/lib/http.ts`); `handleError` → 400 para `RegraSuperadminError`.
  - `GET /users` → cada item com `outras_empresas: number`; `DELETE /users/:id/vinculo`.
  - Constante `MSG_COMPARTILHADO = 'Este usuário também atende outra empresa; fale com o suporte da Campax'` (em `src/routes/users.ts`).

- [ ] **Step 1: Escrever os testes que falham**

Create `backend/test/vinculos/superadmin.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { authHeader, createEmpresa, createProfile, resetDb, vincular } from '../helpers';

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

const MSG = 'Este usuário também atende outra empresa; fale com o suporte da Campax';

async function cenario() {
  const [a, b] = [await createEmpresa(), await createEmpresa()];
  const superadmin = await createProfile({ role: 'superadmin', empresa_id: a.id });
  const compartilhado = await createProfile({ role: 'operador', empresa_id: a.id });
  await vincular(compartilhado.id, b.id);
  const soDeA = await createProfile({ role: 'viewer', empresa_id: a.id });
  return { a, b, superadmin, compartilhado, soDeA, h: authHeader(superadmin) };
}

describe('superadmin e usuário compartilhado', () => {
  it('GET /users mostra outras_empresas (quantas, não quais)', async () => {
    const { b, compartilhado, soDeA, h } = await cenario();
    const res = await request(app).get('/users').set(h);
    const porId = new Map(res.body.data.map((u: any) => [u.id, u]));
    expect((porId.get(compartilhado.id) as any).outras_empresas).toBe(1);
    expect((porId.get(soDeA.id) as any).outras_empresas).toBe(0);
    expect(JSON.stringify(res.body)).not.toContain(b.id);
  });

  it.each([
    ['senha', (id: string) => ['patch', `/users/${id}`, { password: 'nova-senha-123' }]],
    ['papel', (id: string) => ['patch', `/users/${id}/role`, { role: 'admin' }]],
    ['ativo', (id: string) => ['patch', `/users/${id}/active`, { is_active: false }]],
  ] as const)('%s de compartilhado → 403', async (_nome, rota) => {
    const { compartilhado, h } = await cenario();
    const [, url, body] = rota(compartilhado.id);
    const res = await request(app).patch(url).set(h).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(MSG);
  });

  it('nome e WhatsApp de compartilhado continuam editáveis', async () => {
    const { compartilhado, h } = await cenario();
    const res = await request(app).patch(`/users/${compartilhado.id}`).set(h).send({ full_name: 'Novo', numero_whatsapp: '62999990000' });
    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe('Novo');
  });

  it('com usuário só da empresa, tudo continua como antes', async () => {
    const { soDeA, h } = await cenario();
    expect((await request(app).patch(`/users/${soDeA.id}/role`).set(h).send({ role: 'admin' })).status).toBe(200);
    expect((await request(app).patch(`/users/${soDeA.id}/active`).set(h).send({ is_active: false })).status).toBe(200);
  });

  it('DELETE /users/:id/vinculo tira só da empresa dele', async () => {
    const { a, b, compartilhado, h } = await cenario();
    const res = await request(app).delete(`/users/${compartilhado.id}/vinculo`).set(h);
    expect(res.status).toBe(200);
    const restantes = await prisma.usuario_empresas.findMany({ where: { profile_id: compartilhado.id } });
    expect(restantes.map((v) => v.empresa_id)).toEqual([b.id]);
    expect((await request(app).get('/users').set(h)).body.data.map((u: any) => u.id)).not.toContain(compartilhado.id);
    expect(a.id).not.toBe(b.id);
  });

  it('remover a si mesmo → 400; usuário de outra empresa → 404', async () => {
    const { superadmin, h } = await cenario();
    expect((await request(app).delete(`/users/${superadmin.id}/vinculo`).set(h)).status).toBe(400);
    const deOutra = await createProfile({ role: 'viewer' });
    expect((await request(app).delete(`/users/${deOutra.id}/vinculo`).set(h)).status).toBe(404);
  });
});

describe('regra do último superadmin (U8) no painel', () => {
  // In /users the caller is always an active superadmin of the empresa, so the target is never the
  // last one (self-demote/deactivate/remove are refused by their own checks). The U8 call there is
  // defensive; its refusals are exercised through /platform (Task 4). Here: the normal path still works.
  it('com dois superadmins, um rebaixa, desativa e remove o outro', async () => {
    const a = await createEmpresa();
    const s1 = await createProfile({ role: 'superadmin', empresa_id: a.id });
    const h1 = authHeader(s1);
    const s2 = await createProfile({ role: 'superadmin', empresa_id: a.id });
    expect((await request(app).patch(`/users/${s2.id}/role`).set(h1).send({ role: 'admin' })).status).toBe(200);
    const s3 = await createProfile({ role: 'superadmin', empresa_id: a.id });
    expect((await request(app).patch(`/users/${s3.id}/active`).set(h1).send({ is_active: false })).status).toBe(200);
    const s4 = await createProfile({ role: 'superadmin', empresa_id: a.id });
    expect((await request(app).delete(`/users/${s4.id}/vinculo`).set(h1)).status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /root/campax/backend && npx vitest run test/vinculos/superadmin.test.ts 2>&1 | grep -E "×|✓|Tests"`
Expected: FAIL (no `outras_empresas`, no 403, `DELETE /users/:id/vinculo` 404).

- [ ] **Step 3: Implementar**

Create `backend/src/tenant/superadmins.ts`:

```ts
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
```

In `backend/src/lib/http.ts`:
- `import { RegraSuperadminError } from '../tenant/superadmins';`
- In `handleError`, first lines: `if (error instanceof RegraSuperadminError) return res.status(400).json({ success: false, error: error.message });`
- Add below `TENANT_ROLES`:

```ts
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isTenantRole(role: unknown): role is (typeof TENANT_ROLES)[number] {
  return typeof role === 'string' && (TENANT_ROLES as readonly string[]).includes(role);
}
```

In `backend/src/routes/platform.ts`: delete the local `EMAIL_RE` and `isTenantRole`, import them from `../lib/http`.

Replace `backend/src/routes/users.ts` from `function omitPasswordHash` to the end with:

```ts
const MSG_COMPARTILHADO = 'Este usuário também atende outra empresa; fale com o suporte da Campax';
const COM_VINCULOS = { _count: { select: { vinculos: true } } } as const;

function serializar<T extends { password_hash?: string | null; _count: { vinculos: number } }>(profile: T) {
  const { password_hash, _count, ...rest } = profile;
  // How many other empresas this user serves — never which ones (spec 10, U4).
  return { ...rest, outras_empresas: _count.vinculos - 1 };
}

/** The user as seen by this empresa (404 if not linked to it), with the number of links. */
function usuario(req: Request, id: string) {
  return req.db!.profiles.findUniqueOrThrow({ where: { id }, include: COM_VINCULOS });
}

usersRouter.get('/', async (req, res) => {
  try {
    const users = await req.db!.profiles.findMany({ orderBy: { created_at: 'desc' }, include: COM_VINCULOS });
    res.json({ success: true, data: users.map(serializar) });
  } catch (error) {
    handleError(res, error);
  }
});

usersRouter.post('/', async (req, res) => {
  try {
    const { email, password, role, full_name, numero_whatsapp, agente_ia } = req.body as Record<string, any>;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email e senha são obrigatórios' });
    }
    if (role !== undefined && !isTenantRole(role)) {
      return res.status(400).json({ success: false, error: 'Papel inválido' });
    }

    const password_hash = await hashPassword(password);
    const user = await req.db!.profiles.create({
      data: { id: randomUUID(), email, password_hash, role: role || 'viewer', full_name, numero_whatsapp, agente_ia: !!agente_ia } as any,
      include: COM_VINCULOS,
    });
    res.json({ success: true, data: serializar(user) });
  } catch (error) {
    handleError(res, error, { conflict: 'Já existe um usuário com esse email' });
  }
});

usersRouter.patch('/:id', async (req, res) => {
  try {
    const { password, full_name, numero_whatsapp, agente_ia } = req.body as Record<string, any>;
    const data: Record<string, any> = { full_name, numero_whatsapp, agente_ia };
    if (password) {
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ success: false, error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` });
      }
      if (serializar(await usuario(req, req.params.id)).outras_empresas > 0) {
        return res.status(403).json({ success: false, error: MSG_COMPARTILHADO });
      }
      Object.assign(data, await novaSenha(password));
    }

    const user = await req.db!.profiles.update({ where: { id: req.params.id }, data, include: COM_VINCULOS });
    res.json({ success: true, data: serializar(user) });
  } catch (error) {
    handleError(res, error);
  }
});

usersRouter.patch('/:id/role', async (req, res) => {
  try {
    if (!isTenantRole(req.body.role)) {
      return res.status(400).json({ success: false, error: 'Papel inválido' });
    }
    // Demoting yourself could leave the empresa without any superadmin.
    if (req.params.id === req.profile!.id && req.body.role !== 'superadmin') {
      return res.status(400).json({ success: false, error: 'Você não pode rebaixar o próprio papel' });
    }
    const atual = await usuario(req, req.params.id);
    if (serializar(atual).outras_empresas > 0) return res.status(403).json({ success: false, error: MSG_COMPARTILHADO });
    if (atual.role === 'superadmin' && atual.is_active && req.body.role !== 'superadmin') {
      await assertNaoDeixaSemSuperadmin(atual.id, [req.empresa!.id]);
    }
    const user = await req.db!.profiles.update({ where: { id: req.params.id }, data: { role: req.body.role }, include: COM_VINCULOS });
    res.json({ success: true, data: serializar(user) });
  } catch (error) {
    handleError(res, error);
  }
});

usersRouter.patch('/:id/active', async (req, res) => {
  try {
    const is_active = !!req.body.is_active;
    if (req.params.id === req.profile!.id && !is_active) {
      return res.status(400).json({ success: false, error: 'Você não pode desativar o próprio usuário' });
    }
    const atual = await usuario(req, req.params.id);
    if (serializar(atual).outras_empresas > 0) return res.status(403).json({ success: false, error: MSG_COMPARTILHADO });
    if (!is_active && atual.role === 'superadmin' && atual.is_active) {
      await assertNaoDeixaSemSuperadmin(atual.id, [req.empresa!.id]);
    }
    const user = await req.db!.profiles.update({ where: { id: req.params.id }, data: { is_active }, include: COM_VINCULOS });
    res.json({ success: true, data: serializar(user) });
  } catch (error) {
    handleError(res, error);
  }
});

// Removes the user from this empresa only (spec 10, U4). With no link left, they can't log in.
usersRouter.delete('/:id/vinculo', async (req, res) => {
  try {
    if (req.params.id === req.profile!.id) {
      return res.status(400).json({ success: false, error: 'Você não pode remover o próprio usuário da empresa' });
    }
    const atual = await usuario(req, req.params.id);
    if (atual.role === 'superadmin' && atual.is_active) {
      await assertNaoDeixaSemSuperadmin(atual.id, [req.empresa!.id]);
    }
    await req.db!.usuario_empresas.deleteMany({ where: { profile_id: atual.id } });
    console.log(`[users] remover-da-empresa usuario=${atual.id} empresa=${req.empresa!.id} por=${req.profile!.id}`);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});
```

Update the imports at the top of `users.ts`:

```ts
import { randomUUID } from 'crypto';
import { Request, Router } from 'express';
import { tenantGuard } from '../auth/middleware';
import { hashPassword, MIN_PASSWORD_LENGTH, novaSenha } from '../auth/password';
import { handleError, isTenantRole } from '../lib/http';
import { assertNaoDeixaSemSuperadmin } from '../tenant/superadmins';
```

(delete the local `isTenantRole` and the old `omitPasswordHash`).

- [ ] **Step 4: Rodar os testes**

Run: `cd /root/campax/backend && npx tsc --noEmit && npm test 2>&1 | grep -E "×|Test Files|Tests"`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /root/campax
git add backend/src backend/test
git commit -m "feat(users): limites do superadmin com usuário compartilhado e regra do último superadmin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cadastro global na plataforma (`/platform/usuarios`) e U8 nas rotas por empresa

**Files:**
- Create: `backend/src/routes/platformUsuarios.ts`
- Modify: `backend/src/app.ts`, `backend/src/routes/platform.ts`, `backend/test/no-raw-prisma.test.ts`
- Create: `backend/test/vinculos/plataforma.test.ts`

**Interfaces:**
- Consumes: `assertNaoDeixaSemSuperadmin`, `isTenantRole`, `EMAIL_RE`, `novaSenha`, `MIN_PASSWORD_LENGTH`, `requirePlatformAdmin`.
- Produces (all `requirePlatformAdmin`), `UsuarioGlobal = { id, email, full_name, role, is_active, created_at, updated_at, numero_whatsapp, agente_ia, empresas: { id, nome_exibicao, slug, ativo }[] }`:
  - `GET /platform/usuarios?busca=&empresa_id=<uuid|nenhuma>` → `{ data: UsuarioGlobal[] }`
  - `POST /platform/usuarios` `{ email, password, role, full_name?, empresa_ids?: string[] }` → `{ data: UsuarioGlobal }`
  - `GET /platform/usuarios/:id` → `{ data: UsuarioGlobal }`
  - `PATCH /platform/usuarios/:id` `{ full_name?, role? }`, `PATCH /:id/senha` `{ password }`, `PATCH /:id/ativo` `{ is_active }`
  - `PUT /platform/usuarios/:id/empresas/:empresaId`, `DELETE /platform/usuarios/:id/empresas/:empresaId` → `{ data: UsuarioGlobal }`
  - `GET /platform/empresas/:id/usuarios` items gain `outras_empresas: number`.

- [ ] **Step 1: Escrever os testes que falham**

Create `backend/test/vinculos/plataforma.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { authHeader, createEmpresa, createProfile, resetDb, TEST_PASSWORD, vincular } from '../helpers';

beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

async function cenario() {
  const plat = await createProfile({ role: 'platform_admin' });
  const [a, b] = [await createEmpresa({ nome: 'Funerária Alfa' }), await createEmpresa({ nome: 'Funerária Beta' })];
  return { a, b, plat, h: authHeader(plat) };
}

describe('/platform/usuarios', () => {
  it('só platform_admin', async () => {
    const superadmin = await createProfile({ role: 'superadmin' });
    expect((await request(app).get('/platform/usuarios').set(authHeader(superadmin))).status).toBe(403);
  });

  it('cria sem empresa, vincula a duas, e o usuário escolhe ao entrar', async () => {
    const { a, b, h } = await cenario();
    const criado = await request(app).post('/platform/usuarios').set(h)
      .send({ email: 'Tecnico@Example.com', password: 'senha-forte-1', role: 'admin', full_name: 'Técnico' });
    expect(criado.status).toBe(200);
    expect(criado.body.data).toMatchObject({ email: 'tecnico@example.com', empresas: [] });
    expect(criado.body.data.password_hash).toBeUndefined();
    const id = criado.body.data.id;

    expect((await request(app).post('/auth/login').send({ email: 'tecnico@example.com', password: 'senha-forte-1' })).status).toBe(403);

    await request(app).put(`/platform/usuarios/${id}/empresas/${a.id}`).set(h);
    const duas = await request(app).put(`/platform/usuarios/${id}/empresas/${b.id}`).set(h);
    expect(duas.body.data.empresas.map((e: any) => e.id).sort()).toEqual([a.id, b.id].sort());

    const login = await request(app).post('/auth/login').send({ email: 'tecnico@example.com', password: 'senha-forte-1' });
    expect(login.body.escolher_empresa).toBe(true);
  });

  it('cria já com empresas; empresa inexistente → 400 e nada criado', async () => {
    const { a, h } = await cenario();
    const ok = await request(app).post('/platform/usuarios').set(h)
      .send({ email: 'x@example.com', password: 'senha-forte-1', role: 'viewer', empresa_ids: [a.id] });
    expect(ok.body.data.empresas.map((e: any) => e.id)).toEqual([a.id]);
    const ruim = await request(app).post('/platform/usuarios').set(h)
      .send({ email: 'y@example.com', password: 'senha-forte-1', role: 'viewer', empresa_ids: ['00000000-0000-0000-0000-000000000000'] });
    expect(ruim.status).toBe(400);
    expect(await prisma.profiles.count({ where: { email: 'y@example.com' } })).toBe(0);
  });

  it('valida e-mail, senha, papel; e-mail repetido → 409; nunca cria platform_admin', async () => {
    const { h } = await cenario();
    const base = { email: 'z@example.com', password: 'senha-forte-1', role: 'viewer' };
    expect((await request(app).post('/platform/usuarios').set(h).send({ ...base, email: 'sem-arroba' })).status).toBe(400);
    expect((await request(app).post('/platform/usuarios').set(h).send({ ...base, password: 'curta' })).status).toBe(400);
    expect((await request(app).post('/platform/usuarios').set(h).send({ ...base, role: 'platform_admin' })).status).toBe(400);
    expect((await request(app).post('/platform/usuarios').set(h).send(base)).status).toBe(200);
    expect((await request(app).post('/platform/usuarios').set(h).send(base)).status).toBe(409);
  });

  it('lista com busca e filtros (empresa, sem empresa); nunca lista platform_admin', async () => {
    const { a, plat, h } = await cenario();
    const maria = await createProfile({ role: 'admin', empresa_id: a.id, email: 'maria@example.com' });
    const solto = await createProfile({ role: 'viewer', empresa_id: null, email: 'solto@example.com' });
    const todos = (await request(app).get('/platform/usuarios').set(h)).body.data.map((u: any) => u.id);
    expect(todos).toEqual(expect.arrayContaining([maria.id, solto.id]));
    expect(todos).not.toContain(plat.id);
    expect((await request(app).get('/platform/usuarios?busca=MARIA').set(h)).body.data.map((u: any) => u.id)).toEqual([maria.id]);
    expect((await request(app).get(`/platform/usuarios?empresa_id=${a.id}`).set(h)).body.data.map((u: any) => u.id)).toEqual([maria.id]);
    expect((await request(app).get('/platform/usuarios?empresa_id=nenhuma').set(h)).body.data.map((u: any) => u.id)).toEqual([solto.id]);
  });

  it('vincular é idempotente; desvincular o que não existe → 404; platform_admin → 404', async () => {
    const { a, b, plat, h } = await cenario();
    const user = await createProfile({ role: 'viewer', empresa_id: a.id });
    expect((await request(app).put(`/platform/usuarios/${user.id}/empresas/${a.id}`).set(h)).status).toBe(200);
    expect(await prisma.usuario_empresas.count({ where: { profile_id: user.id } })).toBe(1);
    expect((await request(app).delete(`/platform/usuarios/${user.id}/empresas/${b.id}`).set(h)).status).toBe(404);
    expect((await request(app).put(`/platform/usuarios/${plat.id}/empresas/${a.id}`).set(h)).status).toBe(404);
  });

  it('senha derruba sessões; papel e ativo', async () => {
    const { a, h } = await cenario();
    const user = await createProfile({ role: 'viewer', empresa_id: a.id });
    const antigo = authHeader(user);
    expect((await request(app).patch(`/platform/usuarios/${user.id}/senha`).set(h).send({ password: 'nova-senha-123' })).status).toBe(200);
    expect((await request(app).get('/auth/me').set(antigo)).status).toBe(401);
    const papel = await request(app).patch(`/platform/usuarios/${user.id}`).set(h).send({ role: 'operador', full_name: 'Ana' });
    expect(papel.body.data).toMatchObject({ role: 'operador', full_name: 'Ana' });
    expect((await request(app).patch(`/platform/usuarios/${user.id}`).set(h).send({ role: 'platform_admin' })).status).toBe(400);
    expect((await request(app).patch(`/platform/usuarios/${user.id}/ativo`).set(h).send({ is_active: false })).body.data.is_active).toBe(false);
    expect((await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(401);
  });

  it('U8 olha todas as empresas da pessoa', async () => {
    const { a, b, h } = await cenario();
    const dono = await createProfile({ role: 'superadmin', empresa_id: a.id });
    await vincular(dono.id, b.id);
    await createProfile({ role: 'superadmin', empresa_id: a.id }); // A has another one; B doesn't
    const desativar = await request(app).patch(`/platform/usuarios/${dono.id}/ativo`).set(h).send({ is_active: false });
    expect(desativar.status).toBe(400);
    expect(desativar.body.error).toContain('Funerária Beta');
    expect((await request(app).patch(`/platform/usuarios/${dono.id}`).set(h).send({ role: 'admin' })).status).toBe(400);
    expect((await request(app).delete(`/platform/usuarios/${dono.id}/empresas/${b.id}`).set(h)).status).toBe(400);
    expect((await request(app).delete(`/platform/usuarios/${dono.id}/empresas/${a.id}`).set(h)).status).toBe(200);
  });

  it('aba da empresa mostra outras_empresas', async () => {
    const { a, b, h } = await cenario();
    const user = await createProfile({ role: 'viewer', empresa_id: a.id });
    await vincular(user.id, b.id);
    const res = await request(app).get(`/platform/empresas/${a.id}/usuarios`).set(h);
    expect(res.body.data.find((u: any) => u.id === user.id).outras_empresas).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /root/campax/backend && npx vitest run test/vinculos/plataforma.test.ts 2>&1 | grep -E "×|✓|Tests"`
Expected: FAIL (`/platform/usuarios` 404).

- [ ] **Step 3: Implementar**

Create `backend/src/routes/platformUsuarios.ts`:

```ts
import { randomUUID } from 'crypto';
import { Request, Response, Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requirePlatformAdmin } from '../auth/middleware';
import { hashPassword, MIN_PASSWORD_LENGTH, novaSenha } from '../auth/password';
import { EMAIL_RE, handleError, isTenantRole, TENANT_ROLES } from '../lib/http';

type TenantRole = (typeof TENANT_ROLES)[number];
import { assertNaoDeixaSemSuperadmin } from '../tenant/superadmins';

// Global user registry of the platform (spec docs/multiempresa/10-usuarios-globais.md). Only
// platform_admin; raw prisma on purpose (works across empresas). platform_admin accounts are never
// listed, edited or linked here.
export const platformUsuariosRouter = Router();

platformUsuariosRouter.use(...requirePlatformAdmin);

const USUARIO_INCLUDE = {
  vinculos: {
    include: { empresa: { select: { id: true, nome_exibicao: true, slug: true, ativo: true } } },
    orderBy: { created_at: 'asc' },
  },
} satisfies Prisma.profilesInclude;
type UsuarioComVinculos = Prisma.profilesGetPayload<{ include: typeof USUARIO_INCLUDE }>;

function serializar(user: UsuarioComVinculos) {
  const { password_hash, senha_alterada_em, vinculos, ...rest } = user;
  return { ...rest, empresas: vinculos.map((v) => v.empresa) };
}

function bad(res: Response, error: string) {
  return res.status(400).json({ success: false, error });
}

function log(req: Request, acao: string, usuarioId: string, extra = '') {
  console.log(`[platform] ${acao} usuario=${usuarioId}${extra ? ` ${extra}` : ''} por=${req.profile!.id}`);
}

const NAO_PLATFORM_ADMIN = { role: { not: 'platform_admin' } } satisfies Prisma.profilesWhereInput;

function carregar(id: string) {
  return prisma.profiles.findFirstOrThrow({ where: { id, ...NAO_PLATFORM_ADMIN }, include: USUARIO_INCLUDE });
}

/** Empresas where this user is the active superadmin that U8 must protect (all of them). */
const empresasDe = (user: UsuarioComVinculos) => user.vinculos.map((v) => v.empresa_id);
const ehSuperadminAtivo = (user: UsuarioComVinculos) => user.role === 'superadmin' && user.is_active;

platformUsuariosRouter.get('/', async (req, res) => {
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    const empresaId = typeof req.query.empresa_id === 'string' ? req.query.empresa_id : '';
    const where: Prisma.profilesWhereInput = {
      ...NAO_PLATFORM_ADMIN,
      ...(busca && {
        OR: [
          { email: { contains: busca, mode: 'insensitive' } },
          { full_name: { contains: busca, mode: 'insensitive' } },
        ],
      }),
      ...(empresaId === 'nenhuma' ? { vinculos: { none: {} } } : empresaId ? { vinculos: { some: { empresa_id: empresaId } } } : {}),
    };
    const users = await prisma.profiles.findMany({ where, include: USUARIO_INCLUDE, orderBy: { created_at: 'asc' } });
    res.json({ success: true, data: users.map(serializar) });
  } catch (error) {
    handleError(res, error);
  }
});

platformUsuariosRouter.post('/', async (req, res) => {
  try {
    const { email: rawEmail, password, role, full_name, empresa_ids } = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) return bad(res, 'E-mail inválido');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return bad(res, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
    }
    if (!isTenantRole(role)) return bad(res, 'Papel inválido');
    if (empresa_ids !== undefined && (!Array.isArray(empresa_ids) || empresa_ids.some((id) => typeof id !== 'string'))) {
      return bad(res, 'Lista de empresas inválida');
    }
    const ids = [...new Set((empresa_ids as string[] | undefined) ?? [])];
    if (ids.length && (await prisma.empresas.count({ where: { id: { in: ids } } })) !== ids.length) {
      return bad(res, 'Empresa não encontrada');
    }

    const user = await prisma.profiles.create({
      data: {
        id: randomUUID(), email, password_hash: await hashPassword(password), role,
        full_name: typeof full_name === 'string' && full_name.trim() ? full_name.trim() : null,
        vinculos: { create: ids.map((empresa_id) => ({ empresa_id, created_by: req.profile!.id })) },
      },
      include: USUARIO_INCLUDE,
    });
    log(req, 'criar-usuario-global', user.id, `papel=${role} empresas=${ids.join(',') || '-'}`);
    res.json({ success: true, data: serializar(user) });
  } catch (error) {
    handleError(res, error, { conflict: 'Já existe um usuário com esse e-mail' });
  }
});

platformUsuariosRouter.get('/:id', async (req, res) => {
  try {
    res.json({ success: true, data: serializar(await carregar(req.params.id)) });
  } catch (error) {
    handleError(res, error);
  }
});

platformUsuariosRouter.patch('/:id', async (req, res) => {
  try {
    const { full_name, role } = (req.body ?? {}) as Record<string, unknown>;
    if (role !== undefined && !isTenantRole(role)) return bad(res, 'Papel inválido');
    const user = await carregar(req.params.id);
    if (role !== undefined && role !== 'superadmin' && ehSuperadminAtivo(user)) {
      await assertNaoDeixaSemSuperadmin(user.id, empresasDe(user));
    }
    const data: Prisma.profilesUpdateInput = {};
    if (typeof full_name === 'string') data.full_name = full_name.trim() || null;
    if (role !== undefined) data.role = role as TenantRole;
    const updated = await prisma.profiles.update({ where: { id: user.id }, data, include: USUARIO_INCLUDE });
    log(req, 'editar-usuario', user.id, role !== undefined ? `papel=${role}` : '');
    res.json({ success: true, data: serializar(updated) });
  } catch (error) {
    handleError(res, error);
  }
});

platformUsuariosRouter.patch('/:id/senha', async (req, res) => {
  try {
    const password = String(req.body?.password ?? '');
    if (password.length < MIN_PASSWORD_LENGTH) return bad(res, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
    const user = await carregar(req.params.id);
    await prisma.profiles.update({ where: { id: user.id }, data: await novaSenha(password) });
    log(req, 'redefinir-senha', user.id);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});

platformUsuariosRouter.patch('/:id/ativo', async (req, res) => {
  try {
    const is_active = !!req.body?.is_active;
    const user = await carregar(req.params.id);
    if (!is_active && ehSuperadminAtivo(user)) await assertNaoDeixaSemSuperadmin(user.id, empresasDe(user));
    const updated = await prisma.profiles.update({ where: { id: user.id }, data: { is_active }, include: USUARIO_INCLUDE });
    log(req, is_active ? 'ativar-usuario' : 'desativar-usuario', user.id);
    res.json({ success: true, data: serializar(updated) });
  } catch (error) {
    handleError(res, error);
  }
});

platformUsuariosRouter.put('/:id/empresas/:empresaId', async (req, res) => {
  try {
    const user = await carregar(req.params.id);
    await prisma.empresas.findUniqueOrThrow({ where: { id: req.params.empresaId }, select: { id: true } });
    await prisma.usuario_empresas.upsert({
      where: { profile_id_empresa_id: { profile_id: user.id, empresa_id: req.params.empresaId } },
      create: { profile_id: user.id, empresa_id: req.params.empresaId, created_by: req.profile!.id },
      update: {},
    });
    log(req, 'vincular', user.id, `empresa=${req.params.empresaId}`);
    res.json({ success: true, data: serializar(await carregar(user.id)) });
  } catch (error) {
    handleError(res, error);
  }
});

platformUsuariosRouter.delete('/:id/empresas/:empresaId', async (req, res) => {
  try {
    const user = await carregar(req.params.id);
    if (!user.vinculos.some((v) => v.empresa_id === req.params.empresaId)) {
      return res.status(404).json({ success: false, error: 'Não encontrado' });
    }
    if (ehSuperadminAtivo(user)) await assertNaoDeixaSemSuperadmin(user.id, [req.params.empresaId]);
    await prisma.usuario_empresas.delete({
      where: { profile_id_empresa_id: { profile_id: user.id, empresa_id: req.params.empresaId } },
    });
    log(req, 'desvincular', user.id, `empresa=${req.params.empresaId}`);
    res.json({ success: true, data: serializar(await carregar(user.id)) });
  } catch (error) {
    handleError(res, error);
  }
});
```

In `backend/src/app.ts`: `import { platformUsuariosRouter } from './routes/platformUsuarios';` and, **before** `app.use('/platform', platformRouter);`, add `app.use('/platform/usuarios', platformUsuariosRouter);`.

In `backend/test/no-raw-prisma.test.ts` add `'routes/platformUsuarios.ts',` to `ALLOWED`.

In `backend/src/routes/platform.ts`:
- `GET /empresas/:id/usuarios`: fetch with `include: { _count: { select: { vinculos: true } } }` and map `({ password_hash, _count, ...u }) => ({ ...u, outras_empresas: _count.vinculos - 1 })`.
- `PATCH /empresas/:id/usuarios/:uid/ativo`: replace the `outros` block with

```ts
    if (!is_active && user.role === 'superadmin' && user.is_active) {
      const vinculos = await prisma.usuario_empresas.findMany({ where: { profile_id: user.id }, select: { empresa_id: true } });
      await assertNaoDeixaSemSuperadmin(user.id, vinculos.map((v) => v.empresa_id));
    }
```

and import `assertNaoDeixaSemSuperadmin` from `../tenant/superadmins`. The existing test `'não desativa o último superadmin ativo'` must keep passing (400).

- [ ] **Step 4: Rodar os testes**

Run: `cd /root/campax/backend && npx tsc --noEmit && npm test 2>&1 | grep -E "×|Test Files|Tests"`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /root/campax
git add backend/src backend/test
git commit -m "feat(platform): cadastro global de usuários e vínculos com empresas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — escolha e troca da empresa ativa

**Files:**
- Modify: `src/types/empresa.ts`, `src/hooks/useAuth.ts`, `src/components/ProtectedRoute.tsx`, `src/pages/AdminLogin.tsx`, `src/components/AdminLayout.tsx`, `src/App.tsx`
- Create: `src/components/EmpresaEscolha.tsx`, `src/pages/EscolherEmpresa.tsx`, `src/components/TrocarEmpresaDialog.tsx`

**Interfaces:**
- Consumes: `POST /auth/login` (`empresas`, `escolher_empresa`), `GET /auth/me` (`empresas`), `POST /auth/empresa` (Task 2).
- Produces:
  - `EmpresaResumo extends EmpresaPublica { ativo: boolean }` (`src/types/empresa.ts`).
  - `useAuth()` adds `empresas: EmpresaResumo[]`, `precisaEscolherEmpresa: boolean`, `trocarEmpresa(empresaId: string): Promise<void>`; `signIn` returns `{ data: { profile, escolherEmpresa: boolean } | null, error }`.
  - `<EmpresaEscolha empresas atualId? onEscolher(id) carregando? />`.
  - Route `/admin/escolher-empresa`.

There is no frontend test runner in this repo: each step is checked with `tsc`, `eslint` and `vite build`; behavior is checked in the browser in Task 9.

- [ ] **Step 1: Tipos e `useAuth`**

`src/types/empresa.ts`, append:

```ts
/** An empresa in the logged-in user's list (spec 10): public fields plus whether it can be chosen. */
export interface EmpresaResumo extends EmpresaPublica {
    ativo: boolean;
}
```

`src/hooks/useAuth.ts`:
- Import `EmpresaResumo` too: `import { EmpresaPublica, EmpresaResumo } from '@/types/empresa';`
- Remove `empresa_id: string | null;` from `Profile`.
- `Session` becomes:

```ts
/** The logged-in user, the empresa they act for (null for platform_admin or before choosing) and all their empresas. */
interface Session {
    profile: Profile;
    empresa: EmpresaPublica | null;
    empresas: EmpresaResumo[];
}
```

- `queryFn`:

```ts
        queryFn: async (): Promise<Session | null> => {
            const { profile, empresa, empresas } = await apiClient.get<Session>('/auth/me');
            // On a funerária's subdomain only its own users have a session (spec 08): a token from
            // another empresa, a provisional one or platform_admin's (copied between addresses) is dropped.
            if (HOST_SLUG && empresa?.slug !== HOST_SLUG) {
                clearToken();
                return null;
            }
            return { profile, empresa, empresas: empresas ?? [] };
        },
```

- `signIn`:

```ts
    const signIn = async (email: string, password: string) => {
        try {
            const { token, profile, empresa, empresas, escolher_empresa } = await apiClient.post<
                Session & { token: string; escolher_empresa?: boolean }
            >('/auth/login', { email, password, empresa_slug: HOST_SLUG ?? undefined });
            storeToken(token);
            queryClient.setQueryData<Session>(['profile'], { profile, empresa, empresas: empresas ?? [] });
            toast({ title: "Login realizado", description: "Bem-vindo de volta!" });
            return { data: { profile, escolherEmpresa: !!escolher_empresa }, error: null };
        } catch (error) {
            const err = error as Error;
            toast({
                title: "Erro ao fazer login",
                description: err.message || "Credenciais inválidas",
                variant: "destructive",
            });
            return { data: null, error: err };
        }
    };

    /** Chooses (after a provisional login) or switches the empresa; drops every cached query of the previous one. */
    const trocarEmpresa = async (empresaId: string) => {
        const { token, empresa } = await apiClient.post<{ token: string; empresa: EmpresaPublica }>('/auth/empresa', { empresa_id: empresaId });
        storeToken(token);
        const atual = queryClient.getQueryData<Session>(['profile']);
        queryClient.clear();
        if (atual) queryClient.setQueryData<Session>(['profile'], { ...atual, empresa });
    };
```

- Return object adds:

```ts
        empresas: session?.empresas ?? [],
        precisaEscolherEmpresa: !!profile && role !== 'platform_admin' && !session?.empresa,
        trocarEmpresa,
```

- [ ] **Step 2: `EmpresaEscolha`, página e diálogo**

Create `src/components/EmpresaEscolha.tsx`:

```tsx
import { EmpresaLogo } from '@/components/EmpresaLogo';
import { EmpresaResumo } from '@/types/empresa';

interface EmpresaEscolhaProps {
    empresas: EmpresaResumo[];
    /** The empresa already active (shown as "Atual" and not clickable). */
    atualId?: string;
    onEscolher: (empresaId: string) => void;
    carregando?: boolean;
}

/** Cards of the user's empresas, for the post-login choice and "Trocar empresa" (spec 10). */
export function EmpresaEscolha({ empresas, atualId, onEscolher, carregando }: EmpresaEscolhaProps) {
    return (
        <div className="grid gap-3">
            {empresas.map((empresa) => {
                const atual = empresa.id === atualId;
                const disabled = carregando || atual || !empresa.ativo;
                return (
                    <button
                        key={empresa.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onEscolher(empresa.id)}
                        className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-gold hover:bg-gold/5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-card"
                    >
                        <div className="w-12 h-12 shrink-0 rounded-full bg-white p-1 shadow-sm flex items-center justify-center">
                            <EmpresaLogo empresa={empresa} className="w-full h-full object-contain" />
                        </div>
                        <span className="flex-1 min-w-0 font-medium text-foreground truncate">{empresa.nome_exibicao}</span>
                        {atual && <span className="text-xs text-gold">Atual</span>}
                        {!empresa.ativo && <span className="text-xs text-muted-foreground">Suspensa</span>}
                    </button>
                );
            })}
        </div>
    );
}
```

Create `src/pages/EscolherEmpresa.tsx`:

```tsx
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmpresaEscolha } from '@/components/EmpresaEscolha';
import { useAuth } from '@/hooks/useAuth';
import { homePathFor } from '@/hooks/useRole';
import { useToast } from '@/hooks/use-toast';

/** After a provisional login (several empresas, generic address): pick the empresa to act for. */
const EscolherEmpresa = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user, loading, role, empresas, precisaEscolherEmpresa, trocarEmpresa, signOut } = useAuth();
    const [carregando, setCarregando] = useState(false);

    if (loading) return null;
    if (!user) return <Navigate to="/admin" replace />;
    if (!precisaEscolherEmpresa) return <Navigate to={homePathFor(role)} replace />;

    const escolher = async (empresaId: string) => {
        setCarregando(true);
        try {
            await trocarEmpresa(empresaId);
            navigate('/admin/dashboard');
        } catch (error) {
            toast({ title: 'Não foi possível entrar nessa empresa', description: (error as Error).message, variant: 'destructive' });
            setCarregando(false);
        }
    };

    return (
        <div className="min-h-screen gradient-soft flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-md animate-fade-in">
                <h1 className="font-heading text-2xl text-foreground text-center mb-2">Escolha a empresa</h1>
                <p className="text-muted-foreground text-center mb-8">Você tem acesso a mais de uma funerária.</p>
                <EmpresaEscolha empresas={empresas} onEscolher={escolher} carregando={carregando} />
                <div className="mt-6 text-center">
                    <Button
                        variant="link"
                        className="text-muted-foreground hover:text-gold"
                        onClick={async () => {
                            await signOut();
                            navigate('/admin');
                        }}
                    >
                        Sair
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default EscolherEmpresa;
```

Create `src/components/TrocarEmpresaDialog.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { EmpresaEscolha } from '@/components/EmpresaEscolha';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

/** "Trocar empresa" in the admin sidebar — only rendered for users with more than one empresa. */
export function TrocarEmpresaDialog() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { empresa, empresas, trocarEmpresa } = useAuth();
    const [open, setOpen] = useState(false);
    const [carregando, setCarregando] = useState(false);

    const escolher = async (empresaId: string) => {
        setCarregando(true);
        try {
            await trocarEmpresa(empresaId);
            setOpen(false);
            navigate('/admin/dashboard');
        } catch (error) {
            toast({ title: 'Não foi possível trocar de empresa', description: (error as Error).message, variant: 'destructive' });
        } finally {
            setCarregando(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" className="w-full justify-start text-cream/50 hover:bg-gold/10 hover:text-gold">
                    <ArrowLeftRight className="w-4 h-4 mr-3" />
                    Trocar empresa
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Trocar empresa</DialogTitle>
                    <DialogDescription>Escolha por qual funerária você quer trabalhar agora.</DialogDescription>
                </DialogHeader>
                <EmpresaEscolha empresas={empresas} atualId={empresa?.id} onEscolher={escolher} carregando={carregando} />
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 3: Ligar nas rotas, login, `ProtectedRoute` e barra lateral**

`src/App.tsx`: `import EscolherEmpresa from "./pages/EscolherEmpresa";` and, next to the `/admin` login route, `<Route path="/admin/escolher-empresa" element={<EscolherEmpresa />} />`.

`src/components/ProtectedRoute.tsx`: read `precisaEscolherEmpresa` from `useAuth()` and, right after the `if (!user)` block:

```tsx
    if (scope === 'empresa' && precisaEscolherEmpresa) {
        return <Navigate to="/admin/escolher-empresa" replace />;
    }
```

`src/pages/AdminLogin.tsx`: get `precisaEscolherEmpresa` from `useAuth()`; the redirect effect and the submit become:

```tsx
  useEffect(() => {
    if (user) {
      navigate(precisaEscolherEmpresa ? '/admin/escolher-empresa' : homePathFor(role));
    }
  }, [user, role, precisaEscolherEmpresa, navigate]);
```

```tsx
    const { data, error } = await signIn(email, password);

    if (!error) {
      navigate(data?.escolherEmpresa ? '/admin/escolher-empresa' : homePathFor(data?.profile.role));
    }
```

`src/components/AdminLayout.tsx`: `import { TrocarEmpresaDialog } from '@/components/TrocarEmpresaDialog';`, read `empresas` from `useAuth()`, and before `<AlterarSenhaDialog />`:

```tsx
            {empresas.length > 1 && <TrocarEmpresaDialog />}
```

- [ ] **Step 4: Verificar**

Run: `cd /root/campax && npx tsc --noEmit -p tsconfig.app.json && npx eslint src/hooks/useAuth.ts src/components/EmpresaEscolha.tsx src/components/TrocarEmpresaDialog.tsx src/pages/EscolherEmpresa.tsx src/pages/AdminLogin.tsx src/components/ProtectedRoute.tsx src/components/AdminLayout.tsx src/App.tsx && npm run build 2>&1 | grep -E "built in|error"`
Expected: no errors, `✓ built in`. Fix any use of `profile.empresa_id` that `tsc` reports (it no longer exists).

- [ ] **Step 5: Commit**

```bash
cd /root/campax
git add src
git commit -m "feat(frontend): escolha e troca da empresa ativa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — limites do superadmin em `/admin/usuarios`

**Files:**
- Modify: `src/hooks/useUsers.ts`, `src/pages/UserManagement.tsx`, `src/components/EditUserDialog.tsx`

**Interfaces:**
- Consumes: `GET /users` (`outras_empresas`), `DELETE /users/:id/vinculo` (Task 3).
- Produces: `ProfileRow = Profile & { outras_empresas: number }`; `useUsers()` adds `removerDaEmpresa` mutation (`(userId: string) => Promise`).

- [ ] **Step 1: Hook**

`src/hooks/useUsers.ts`: `export type ProfileRow = Profile & { outras_empresas: number };` and add before the `return`:

```ts
    const removerDaEmpresa = useMutation({
        mutationFn: async (userId: string) => {
            await apiClient.delete(`/users/${userId}/vinculo`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    });
```

and return it: `return { users, isLoading, updateRole, toggleActive, createUser, updateUser, removerDaEmpresa };`.

- [ ] **Step 2: Página**

In `src/pages/UserManagement.tsx`:
- `const { users, isLoading, updateRole, toggleActive, removerDaEmpresa } = useUsers();`
- Add the constant near `ROLES`:

```tsx
const DICA_COMPARTILHADO = 'Este usuário também atende outra empresa; fale com o suporte da Campax';
```

- Add the handler next to `handleToggleActive`:

```tsx
    const handleRemover = async (u: ProfileRow) => {
        try {
            await removerDaEmpresa.mutateAsync(u.id);
            toast({ title: 'Usuário removido da empresa', description: `${u.email} não tem mais acesso a esta empresa.` });
        } catch (error) {
            toast({ title: 'Erro ao remover', description: (error as Error).message, variant: 'destructive' });
        }
    };
```

- Inside the row map, after `const RoleIcon = ...`: `const compartilhado = u.outras_empresas > 0;`
- Under the e-mail line (`<p className="text-sm text-muted-foreground truncate">{u.email}</p>`), add:

```tsx
                                                {compartilhado && (
                                                    <p className="text-xs text-muted-foreground mt-0.5">Também atende outra empresa</p>
                                                )}
```

- Pass it to the edit dialog: `<EditUserDialog user={u} permitirSenha={!compartilhado} />`.
- Replace `{!isCurrentUser && (<> ... </>)}` with: when `compartilhado`, render the role `Select` and the activate button with `disabled` and `title={DICA_COMPARTILHADO}`, plus a "Remover da empresa" confirmation; otherwise the current markup. Concretely, add `disabled={updateRole.isPending || compartilhado}` to the `Select`, wrap the `SelectTrigger` with `title={compartilhado ? DICA_COMPARTILHADO : undefined}`, add `disabled={compartilhado}` and the same `title` to the activate/deactivate trigger `Button`, and after the activate `AlertDialog` add:

```tsx
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" title="Remover da empresa">
                                                                <UserMinus className="w-4 h-4" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Remover da empresa?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    {u.email} perderá o acesso a esta empresa imediatamente.
                                                                    {compartilhado ? ' O acesso às outras empresas continua.' : ' Ele não terá mais acesso a nenhuma empresa.'}
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleRemover(u)} className="bg-destructive hover:bg-destructive/90">
                                                                    Remover
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
```

- Add `UserMinus` to the `lucide-react` import.

- [ ] **Step 3: Diálogo de edição**

`src/components/EditUserDialog.tsx`: add the prop `permitirSenha = true` (`{ user, permitirSenha = true }: { user: ProfileRow; permitirSenha?: boolean }` — keep the existing prop type name if it differs) and wrap the whole "Nova senha" block (label, input, generate button and hint) in `{permitirSenha ? ( ...existing block... ) : (<p className="text-xs text-muted-foreground">A senha deste usuário só pode ser redefinida pelo suporte da Campax, porque ele também atende outra empresa.</p>)}`. `password` stays `''`, so the request omits it.

- [ ] **Step 4: Verificar**

Run: `cd /root/campax && npx tsc --noEmit -p tsconfig.app.json && npx eslint src/hooks/useUsers.ts src/pages/UserManagement.tsx src/components/EditUserDialog.tsx && npm run build 2>&1 | grep -E "built in|error"`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /root/campax
git add src
git commit -m "feat(frontend): superadmin com usuário que atende outra empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — cadastro global na plataforma

**Files:**
- Create: `src/hooks/usePlatformUsuariosGlobais.ts`, `src/pages/platform/PlatformUsuarios.tsx`, `src/pages/platform/PlatformUsuarioNovo.tsx`, `src/pages/platform/PlatformUsuarioDetalhe.tsx`
- Modify: `src/components/PlatformLayout.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `/platform/usuarios*` (Task 4); `usePlatformEmpresas()` (existing, `src/hooks/usePlatform.ts`); `TenantRole` (`src/hooks/useRole.ts`); `generatePassword` (`src/lib/generatePassword.ts`); `PlatformLayout`.
- Produces:
  - `UsuarioGlobal` type; hooks `usePlatformUsuariosGlobais(filtros: { busca: string; empresaId: string })`, `usePlatformUsuarioGlobal(id)` (with `update`, `resetSenha`, `setAtivo`, `vincular`, `desvincular` mutations), `useCreateUsuarioGlobal()`.
  - `PlatformSection` gains `'usuarios'`.
  - Routes `/platform/usuarios`, `/platform/usuarios/novo`, `/platform/usuarios/:id`.
  - `ROLE_LABELS: Record<TenantRole, string>` moves from `PlatformEmpresaDetalhe.tsx` to `src/lib/roleLabels.ts`; that page and the new ones import it from there.

- [ ] **Step 1: `ROLE_LABELS` compartilhado e hooks**

Run: `grep -n "ROLE_LABELS" /root/campax/src/pages/platform/PlatformEmpresaDetalhe.tsx | head -3` and move that constant verbatim to `src/lib/roleLabels.ts`:

```ts
import { TenantRole } from '@/hooks/useRole';

export const ROLE_LABELS: Record<TenantRole, string> = {
  // (paste the four entries exactly as they are in PlatformEmpresaDetalhe.tsx)
};
```

then `import { ROLE_LABELS } from '@/lib/roleLabels';` in `PlatformEmpresaDetalhe.tsx` and delete the local copy.

Create `src/hooks/usePlatformUsuariosGlobais.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useToast } from './use-toast';
import { TenantRole } from './useRole';

export interface EmpresaDoUsuario {
    id: string;
    nome_exibicao: string;
    slug: string;
    ativo: boolean;
}

export interface UsuarioGlobal {
    id: string;
    email: string;
    full_name: string | null;
    role: TenantRole;
    is_active: boolean;
    created_at: string;
    empresas: EmpresaDoUsuario[];
}

const KEY = ['platform', 'usuarios'] as const;

function useErrorToast() {
    const { toast } = useToast();
    return (title: string) => (error: Error) => toast({ title, description: error.message, variant: 'destructive' });
}

export function usePlatformUsuariosGlobais({ busca, empresaId }: { busca: string; empresaId: string }) {
    const params = new URLSearchParams();
    if (busca.trim()) params.set('busca', busca.trim());
    if (empresaId) params.set('empresa_id', empresaId);
    const qs = params.toString();
    return useQuery({
        queryKey: [...KEY, 'lista', qs],
        queryFn: async () => (await apiClient.get<{ data: UsuarioGlobal[] }>(`/platform/usuarios${qs ? `?${qs}` : ''}`)).data,
    });
}

export function useCreateUsuarioGlobal() {
    const queryClient = useQueryClient();
    const onError = useErrorToast();
    return useMutation({
        mutationFn: async (input: { email: string; password: string; role: TenantRole; full_name?: string; empresa_ids: string[] }) =>
            (await apiClient.post<{ data: UsuarioGlobal }>('/platform/usuarios', input)).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
        onError: onError('Erro ao criar usuário'),
    });
}

export function usePlatformUsuarioGlobal(id: string | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const onError = useErrorToast();
    const base = `/platform/usuarios/${id}`;
    const atualizar = (data?: UsuarioGlobal) => {
        if (data) queryClient.setQueryData([...KEY, id], data);
        queryClient.invalidateQueries({ queryKey: KEY });
        // Link counts in the empresa pages ("Usuários" tab, usage numbers) change too.
        queryClient.invalidateQueries({ queryKey: ['platform', 'empresas'] });
    };

    const query = useQuery({
        queryKey: [...KEY, id],
        queryFn: async () => (await apiClient.get<{ data: UsuarioGlobal }>(base)).data,
        enabled: !!id,
    });

    const update = useMutation({
        mutationFn: async (data: { full_name?: string | null; role?: TenantRole }) =>
            (await apiClient.patch<{ data: UsuarioGlobal }>(base, data)).data,
        onSuccess: (data) => {
            atualizar(data);
            toast({ title: 'Usuário atualizado' });
        },
        onError: onError('Erro ao salvar'),
    });
    const resetSenha = useMutation({
        mutationFn: (password: string) => apiClient.patch(`${base}/senha`, { password }),
        onError: onError('Erro ao redefinir a senha'),
    });
    const setAtivo = useMutation({
        mutationFn: async (is_active: boolean) => (await apiClient.patch<{ data: UsuarioGlobal }>(`${base}/ativo`, { is_active })).data,
        onSuccess: atualizar,
        onError: onError('Erro ao alterar o usuário'),
    });
    const vincular = useMutation({
        mutationFn: async (empresaId: string) => (await apiClient.put<{ data: UsuarioGlobal }>(`${base}/empresas/${empresaId}`)).data,
        onSuccess: atualizar,
        onError: onError('Erro ao vincular'),
    });
    const desvincular = useMutation({
        mutationFn: async (empresaId: string) => (await apiClient.delete<{ data: UsuarioGlobal }>(`${base}/empresas/${empresaId}`)).data,
        onSuccess: atualizar,
        onError: onError('Erro ao remover da empresa'),
    });

    return { ...query, update, resetSenha, setAtivo, vincular, desvincular };
}
```

`apiClient` has no `put`: in `src/lib/apiClient.ts` add, next to `patch`:

```ts
  put: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
```

- [ ] **Step 2: Lista**

Create `src/pages/platform/PlatformUsuarios.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlatformLayout } from '@/components/PlatformLayout';
import { usePlatformEmpresas } from '@/hooks/usePlatform';
import { usePlatformUsuariosGlobais } from '@/hooks/usePlatformUsuariosGlobais';
import { ROLE_LABELS } from '@/lib/roleLabels';
import { Search, UserPlus } from 'lucide-react';

const TODAS = 'todas';

const PlatformUsuarios = () => {
    const navigate = useNavigate();
    const [busca, setBusca] = useState('');
    const [empresaId, setEmpresaId] = useState(TODAS);
    const { data: empresas = [] } = usePlatformEmpresas();
    const { data: usuarios = [], isLoading } = usePlatformUsuariosGlobais({ busca, empresaId: empresaId === TODAS ? '' : empresaId });

    return (
        <PlatformLayout activeSection="usuarios">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h1 className="font-heading text-3xl text-foreground">Usuários</h1>
                <Button variant="gold" onClick={() => navigate('/platform/usuarios/novo')}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Novo usuário
                </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-4 max-w-4xl">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-10" placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                <Select value={empresaId} onValueChange={setEmpresaId}>
                    <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={TODAS}>Todas as empresas</SelectItem>
                        <SelectItem value="nenhuma">Sem empresa</SelectItem>
                        {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome_exibicao}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            <Card className="shadow-soft max-w-4xl">
                <CardContent className="p-0 divide-y divide-border">
                    {isLoading && <p className="p-6 text-muted-foreground">Carregando…</p>}
                    {!isLoading && usuarios.length === 0 && <p className="p-6 text-muted-foreground">Nenhum usuário encontrado.</p>}
                    {usuarios.map((u) => (
                        <button
                            key={u.id}
                            type="button"
                            onClick={() => navigate(`/platform/usuarios/${u.id}`)}
                            className="w-full p-4 flex flex-col sm:flex-row sm:items-center gap-2 text-left hover:bg-gold/5"
                        >
                            <div className="flex-1 min-w-0">
                                <p className={`font-medium truncate ${u.is_active ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                                    {u.full_name || u.email}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {u.email} · {ROLE_LABELS[u.role]}{!u.is_active && ' · desativado'}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-1 sm:justify-end sm:max-w-[50%]">
                                {u.empresas.length === 0 ? (
                                    <span className="text-xs px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground">Sem empresa</span>
                                ) : (
                                    u.empresas.map((e) => (
                                        <span key={e.id} className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-foreground">{e.nome_exibicao}</span>
                                    ))
                                )}
                            </div>
                        </button>
                    ))}
                </CardContent>
            </Card>
        </PlatformLayout>
    );
};

export default PlatformUsuarios;
```

- [ ] **Step 3: Novo usuário**

Create `src/pages/platform/PlatformUsuarioNovo.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlatformLayout } from '@/components/PlatformLayout';
import { usePlatformEmpresas } from '@/hooks/usePlatform';
import { useCreateUsuarioGlobal, UsuarioGlobal } from '@/hooks/usePlatformUsuariosGlobais';
import { TenantRole } from '@/hooks/useRole';
import { generatePassword } from '@/lib/generatePassword';
import { ROLE_LABELS } from '@/lib/roleLabels';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <label className="block">
            <span className="block text-sm text-muted-foreground mb-2">{label}</span>
            {children}
            {hint && <span className="block text-xs text-muted-foreground mt-1">{hint}</span>}
        </label>
    );
}

const PlatformUsuarioNovo = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const create = useCreateUsuarioGlobal();
    const { data: empresas = [] } = usePlatformEmpresas();
    const [form, setForm] = useState({ full_name: '', email: '', role: 'admin' as TenantRole, password: generatePassword(12) });
    const [empresaIds, setEmpresaIds] = useState<string[]>([]);
    const [criado, setCriado] = useState<UsuarioGlobal | null>(null);

    const alternar = (id: string, marcado: boolean) =>
        setEmpresaIds((ids) => (marcado ? [...ids, id] : ids.filter((x) => x !== id)));

    const salvar = async (event: React.FormEvent) => {
        event.preventDefault();
        const user = await create.mutateAsync({
            email: form.email.trim(), password: form.password, role: form.role,
            full_name: form.full_name.trim() || undefined, empresa_ids: empresaIds,
        });
        setCriado(user);
    };

    if (criado) {
        // Credentials are shown only here, once — there is no e-mail sending in the system.
        const copiar = (texto: string) => {
            navigator.clipboard.writeText(texto);
            toast({ title: 'Copiado' });
        };
        return (
            <PlatformLayout activeSection="usuarios">
                <Card className="shadow-soft max-w-2xl border-gold/40">
                    <CardContent className="p-6 grid gap-4">
                        <h1 className="font-heading text-2xl">Usuário criado</h1>
                        <p className="text-sm text-muted-foreground">Envie os dados abaixo para a pessoa. A senha não será mostrada de novo.</p>
                        <div className="flex items-center gap-2"><code className="flex-1 font-mono text-sm">{criado.email}</code><Button variant="outline" size="sm" onClick={() => copiar(criado.email)}>Copiar</Button></div>
                        <div className="flex items-center gap-2"><code className="flex-1 font-mono text-sm">{form.password}</code><Button variant="outline" size="sm" onClick={() => copiar(form.password)}>Copiar</Button></div>
                        {criado.empresas.length === 0 && (
                            <p className="text-sm text-muted-foreground">Sem empresa vinculada: ele só consegue entrar depois de ser vinculado a uma.</p>
                        )}
                        <div className="flex justify-end">
                            <Button variant="gold" onClick={() => navigate(`/platform/usuarios/${criado.id}`)}>Ir para o usuário</Button>
                        </div>
                    </CardContent>
                </Card>
            </PlatformLayout>
        );
    }

    return (
        <PlatformLayout activeSection="usuarios">
            <Button variant="ghost" className="mb-4 -ml-2" onClick={() => navigate('/platform/usuarios')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Usuários
            </Button>
            <h1 className="font-heading text-3xl text-foreground mb-6">Novo usuário</h1>
            <form onSubmit={salvar} className="grid gap-6 max-w-3xl">
                <Card className="shadow-soft">
                    <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
                        <Field label="Nome"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
                        <Field label="E-mail (login) *"><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                        <Field label="Papel" hint="Vale em todas as empresas do usuário">
                            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as TenantRole })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(ROLE_LABELS) as TenantRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Senha inicial *" hint="Mínimo de 8 caracteres">
                            <div className="flex gap-2">
                                <Input required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                                <Button type="button" variant="outline" onClick={() => setForm({ ...form, password: generatePassword(12) })}>Gerar</Button>
                            </div>
                        </Field>
                    </CardContent>
                </Card>
                <Card className="shadow-soft">
                    <CardContent className="p-6 grid gap-3">
                        <h2 className="font-heading text-lg">Empresas</h2>
                        <p className="text-xs text-muted-foreground">Opcional. Sem nenhuma, o usuário fica cadastrado mas não consegue entrar.</p>
                        {empresas.map((e) => (
                            <label key={e.id} className="flex items-center gap-3 text-sm">
                                <Checkbox checked={empresaIds.includes(e.id)} onCheckedChange={(v) => alternar(e.id, v === true)} />
                                {e.nome_exibicao}
                                {!e.ativo && <span className="text-xs text-muted-foreground">(suspensa)</span>}
                            </label>
                        ))}
                    </CardContent>
                </Card>
                <div className="flex justify-end">
                    <Button type="submit" variant="gold" disabled={create.isPending || !form.email || form.password.length < 8}>
                        Criar usuário
                    </Button>
                </div>
            </form>
        </PlatformLayout>
    );
};

export default PlatformUsuarioNovo;
```

(Check `src/components/ui/checkbox.tsx` exists: `ls /root/campax/src/components/ui/checkbox.tsx`. If it doesn't, use `<input type="checkbox" className="h-4 w-4 accent-[hsl(var(--gold))]" checked=... onChange={(ev) => alternar(e.id, ev.target.checked)} />` instead.)

- [ ] **Step 4: Detalhe**

Create `src/pages/platform/PlatformUsuarioDetalhe.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlatformLayout, StatusBadge } from '@/components/PlatformLayout';
import { usePlatformEmpresas } from '@/hooks/usePlatform';
import { usePlatformUsuarioGlobal } from '@/hooks/usePlatformUsuariosGlobais';
import { TenantRole } from '@/hooks/useRole';
import { generatePassword } from '@/lib/generatePassword';
import { ROLE_LABELS } from '@/lib/roleLabels';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, KeyRound, Link2, Trash2, UserCheck, UserX } from 'lucide-react';

const PlatformUsuarioDetalhe = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { data: usuario, isLoading, update, resetSenha, setAtivo, vincular, desvincular } = usePlatformUsuarioGlobal(id);
    const { data: empresas = [] } = usePlatformEmpresas();
    const [nome, setNome] = useState('');
    const [novaEmpresa, setNovaEmpresa] = useState('');
    const [senhaGerada, setSenhaGerada] = useState<string | null>(null);

    useEffect(() => setNome(usuario?.full_name ?? ''), [usuario?.full_name]);

    if (isLoading || !usuario) {
        return <PlatformLayout activeSection="usuarios"><p className="text-muted-foreground">{isLoading ? 'Carregando…' : 'Usuário não encontrado.'}</p></PlatformLayout>;
    }

    const vinculadas = new Set(usuario.empresas.map((e) => e.id));
    const disponiveis = empresas.filter((e) => !vinculadas.has(e.id));

    return (
        <PlatformLayout activeSection="usuarios">
            <Button variant="ghost" className="mb-4 -ml-2" onClick={() => navigate('/platform/usuarios')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Usuários
            </Button>
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <h1 className="font-heading text-3xl text-foreground">{usuario.full_name || usuario.email}</h1>
                <StatusBadge ativo={usuario.is_active} />
            </div>

            <div className="grid gap-6 max-w-3xl">
                <Card className="shadow-soft">
                    <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
                        <label className="block">
                            <span className="block text-sm text-muted-foreground mb-2">Nome</span>
                            <div className="flex gap-2">
                                <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                                <Button variant="outline" disabled={update.isPending || nome === (usuario.full_name ?? '')} onClick={() => update.mutate({ full_name: nome.trim() || null })}>
                                    Salvar
                                </Button>
                            </div>
                        </label>
                        <label className="block">
                            <span className="block text-sm text-muted-foreground mb-2">Papel (vale em todas as empresas)</span>
                            <Select value={usuario.role} onValueChange={(v) => update.mutate({ role: v as TenantRole })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(ROLE_LABELS) as TenantRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </label>
                        <p className="text-sm text-muted-foreground sm:col-span-2">E-mail (login): <span className="text-foreground">{usuario.email}</span></p>
                        <div className="sm:col-span-2 flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                onClick={async () => {
                                    const password = generatePassword(12);
                                    await resetSenha.mutateAsync(password);
                                    setSenhaGerada(password);
                                }}
                            >
                                <KeyRound className="w-4 h-4 mr-2" />
                                Nova senha
                            </Button>
                            <Button variant="ghost" onClick={() => setAtivo.mutate(!usuario.is_active)}>
                                {usuario.is_active ? <UserX className="w-4 h-4 mr-2" /> : <UserCheck className="w-4 h-4 mr-2" />}
                                {usuario.is_active ? 'Desativar' : 'Ativar'}
                            </Button>
                        </div>
                        {senhaGerada && (
                            <div className="sm:col-span-2 rounded-lg border border-gold/40 bg-gold/5 p-3 text-sm flex flex-wrap items-center gap-3">
                                <span className="flex-1">Nova senha: <code className="font-mono">{senhaGerada}</code> <span className="block text-xs text-muted-foreground">Mostrada só agora. Os acessos abertos com a senha antiga foram encerrados.</span></span>
                                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(senhaGerada); toast({ title: 'Senha copiada' }); }}>Copiar</Button>
                                <Button variant="ghost" size="sm" onClick={() => setSenhaGerada(null)}>Fechar</Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="shadow-soft">
                    <CardContent className="p-6 grid gap-4">
                        <h2 className="font-heading text-lg">Empresas</h2>
                        {usuario.empresas.length === 0 && (
                            <p className="text-sm text-muted-foreground">Sem empresa vinculada: o usuário não consegue entrar.</p>
                        )}
                        {usuario.empresas.map((e) => (
                            <div key={e.id} className="flex items-center gap-3">
                                <button type="button" className="flex-1 text-left hover:text-gold" onClick={() => navigate(`/platform/empresas/${e.id}`)}>
                                    {e.nome_exibicao}
                                    {!e.ativo && <span className="ml-2 text-xs text-muted-foreground">(suspensa)</span>}
                                </button>
                                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" disabled={desvincular.isPending} onClick={() => desvincular.mutate(e.id)}>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Remover
                                </Button>
                            </div>
                        ))}
                        {disponiveis.length > 0 && (
                            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
                                <Select value={novaEmpresa} onValueChange={setNovaEmpresa}>
                                    <SelectTrigger className="sm:flex-1"><SelectValue placeholder="Escolha uma empresa" /></SelectTrigger>
                                    <SelectContent>
                                        {disponiveis.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome_exibicao}{!e.ativo ? ' (suspensa)' : ''}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="gold"
                                    disabled={!novaEmpresa || vincular.isPending}
                                    onClick={async () => {
                                        await vincular.mutateAsync(novaEmpresa);
                                        setNovaEmpresa('');
                                    }}
                                >
                                    <Link2 className="w-4 h-4 mr-2" />
                                    Vincular empresa
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </PlatformLayout>
    );
};

export default PlatformUsuarioDetalhe;
```

(Check `StatusBadge`'s prop name: `grep -n "export function StatusBadge" -A2 /root/campax/src/components/PlatformLayout.tsx` — use whatever it takes, e.g. `ativo`.)

- [ ] **Step 5: Menu e rotas**

`src/components/PlatformLayout.tsx`: `type PlatformSection = 'empresas' | 'usuarios' | 'modelos';`, import `Users` from `lucide-react`, and in the `nav` between empresas and modelos:

```tsx
                {navItem('usuarios', 'Usuários', '/platform/usuarios', Users)}
```

`src/App.tsx`: import the three pages and add, inside the same block as the other `/platform` routes (the generic-address branch):

```tsx
                <Route path="/platform/usuarios" element={<ProtectedRoute scope="platform"><PlatformUsuarios /></ProtectedRoute>} />
                <Route path="/platform/usuarios/novo" element={<ProtectedRoute scope="platform"><PlatformUsuarioNovo /></ProtectedRoute>} />
                <Route path="/platform/usuarios/:id" element={<ProtectedRoute scope="platform"><PlatformUsuarioDetalhe /></ProtectedRoute>} />
```

- [ ] **Step 6: Verificar**

Run: `cd /root/campax && npx tsc --noEmit -p tsconfig.app.json && npx eslint src/hooks/usePlatformUsuariosGlobais.ts src/pages/platform src/components/PlatformLayout.tsx src/lib/roleLabels.ts src/lib/apiClient.ts src/App.tsx && npm run build 2>&1 | grep -E "built in|error"`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /root/campax
git add src
git commit -m "feat(platform): telas do cadastro global de usuários

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Frontend — aba "Usuários" da empresa (vincular existente, "+N empresas")

**Files:**
- Modify: `src/hooks/usePlatform.ts`, `src/pages/platform/PlatformEmpresaDetalhe.tsx`

**Interfaces:**
- Consumes: `GET /platform/empresas/:id/usuarios` (`outras_empresas`), `usePlatformUsuariosGlobais`, `PUT /platform/usuarios/:id/empresas/:empresaId` (Tasks 4, 7).
- Produces: `UsuarioEmpresa.outras_empresas: number`; `usePlatformUsuarios(empresaId)` adds `vincularExistente` mutation (`(userId: string) => Promise`).

- [ ] **Step 1: Hook**

`src/hooks/usePlatform.ts`: add `outras_empresas: number;` to `UsuarioEmpresa`, and in `usePlatformUsuarios` before the `return`:

```ts
    const vincularExistente = useMutation({
        mutationFn: (userId: string) => apiClient.put(`/platform/usuarios/${userId}/empresas/${empresaId}`),
        onSuccess: () => {
            invalidate();
            queryClient.invalidateQueries({ queryKey: ['platform', 'usuarios'] });
            toast({ title: 'Usuário vinculado' });
        },
        onError: onError('Erro ao vincular'),
    });
```

and `return { ...query, create, resetSenha, setAtivo, vincularExistente };`.

- [ ] **Step 2: Aba**

In `src/pages/platform/PlatformEmpresaDetalhe.tsx`, `UsuariosTab`:
- `const { data: usuarios = [], create, resetSenha, setAtivo, vincularExistente } = usePlatformUsuarios(empresaId);`
- `const navigate = useNavigate();` and `const [busca, setBusca] = useState('');`
- `const { data: encontrados = [] } = usePlatformUsuariosGlobais({ busca, empresaId: '' });` with `import { usePlatformUsuariosGlobais } from '@/hooks/usePlatformUsuariosGlobais';`, and `const candidatos = busca.trim().length >= 2 ? encontrados.filter((u) => !u.empresas.some((e) => e.id === empresaId)).slice(0, 8) : [];`
- In each user row, after the e-mail/role line:

```tsx
                {u.outras_empresas > 0 && (
                  <button type="button" className="text-xs text-gold hover:underline" onClick={() => navigate(`/platform/usuarios/${u.id}`)}>
                    +{u.outras_empresas} {u.outras_empresas === 1 ? 'empresa' : 'empresas'}
                  </button>
                )}
```

- Before the "Novo usuário" card, add:

```tsx
      <Card className="shadow-soft">
        <CardContent className="p-6 grid gap-3">
          <h3 className="font-heading text-lg">Vincular usuário existente</h3>
          <Input placeholder="Buscar por nome ou e-mail (mínimo 2 letras)" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {candidatos.map((u) => (
            <div key={u.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-0 truncate">
                {u.full_name || u.email} <span className="text-muted-foreground">· {u.email} · {ROLE_LABELS[u.role]}</span>
              </span>
              <Button variant="outline" size="sm" disabled={vincularExistente.isPending} onClick={() => vincularExistente.mutate(u.id)}>
                <Link2 className="w-4 h-4 mr-2" />
                Vincular
              </Button>
            </div>
          ))}
          {busca.trim().length >= 2 && candidatos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum usuário encontrado fora desta empresa.</p>
          )}
        </CardContent>
      </Card>
```

- Add `Link2` to the `lucide-react` import (and `useNavigate` is already imported in this file).

- [ ] **Step 3: Verificar**

Run: `cd /root/campax && npx tsc --noEmit -p tsconfig.app.json && npx eslint src/hooks/usePlatform.ts src/pages/platform/PlatformEmpresaDetalhe.tsx && npm run build 2>&1 | grep -E "built in|error"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /root/campax
git add src
git commit -m "feat(platform): vincular usuário existente pela aba da empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificação no navegador, implantação e documentação

**Files:**
- Modify: `CLAUDE.md`, `docs/multiempresa/10-usuarios-globais.md`, `docs/multiempresa/00-planejamento.md`
- Scratch (not committed): `<scratchpad>/e2e-usuarios.mjs`

- [ ] **Step 1: Subir backend (campax_dev) e frontend de desenvolvimento**

The production frontend uses port 8080, so the dev frontend runs on 5174 pointing at the dev backend.

`backend/src/env.ts` loads `.env.development` with `override: true`, so a `FRONTEND_ORIGIN` passed on the command line is ignored: append the dev frontend to the file instead (it is not committed):

Run: `cd /root/campax/backend && grep -q "localhost:5174" .env.development || sed -i 's#^FRONTEND_ORIGIN=\(.*\)#FRONTEND_ORIGIN=\1,http://localhost:5174#' .env.development && grep ^FRONTEND_ORIGIN .env.development`
Expected: `FRONTEND_ORIGIN=http://localhost:8080,http://localhost:5174`

Run (background): `cd /root/campax/backend && npm run dev`
Run (background): `cd /root/campax && VITE_API_URL=http://localhost:3003 npx vite --port 5174`
Expected: backend `listening on 3003`, Vite `Local: http://localhost:5174/`.

Prepare data in `campax_dev`: through `http://localhost:3003` with the platform login, create a user in two empresas (`POST /platform/usuarios` with both `empresa_ids`).

- [ ] **Step 2: Roteiro no navegador (Playwright, Chrome do sistema)**

Write `<scratchpad>/e2e-usuarios.mjs` with Playwright (`import { chromium } from 'playwright'`, `chromium.launch({ executablePath: '/usr/bin/google-chrome' })`) that, against `http://localhost:5174`:

1. logs in as the two-empresa user → lands on `/admin/escolher-empresa`, sees both names;
2. picks empresa A → `/admin/dashboard`, the sidebar shows A's name, `/admin/cameras` lists A's cameras;
3. "Trocar empresa" → B → the sidebar shows B, `/admin/cameras` lists **no** camera of A (Review Focus: stale cache);
4. reloads the page on `/admin/escolher-empresa` with the provisional token — stays on the choice page;
5. opens `http://localhost:5174/admin?empresa=<slug de A>` (dev simulation of the subdomain) with the token from step 3 in `localStorage` → the session is dropped and a fresh login there enters A directly, without the choice page (Review Focus: token from the generic address on the subdomain);
6. logs in as platform admin → `/platform/usuarios` lists the user with both empresas; the detail page unlinks B; the user's next request in the other browser context (acting as B) gets sent back to login.

Take a screenshot at each step (`page.screenshot`) and look at them.

Run: `cd /root/campax && node <scratchpad>/e2e-usuarios.mjs`
Expected: every step passes; screenshots show the right empresa name. Fix anything that fails in the owning task's files and commit the fix there before moving on.

Stop both dev servers afterwards.

- [ ] **Step 3: Implantar em `campax`**

```bash
bash /root/campax/scripts/backup-db.sh
bash /root/campax/scripts/restore-check.sh | tail -3
cd /root/campax/backend
sudo -u postgres psql -d campax -v ON_ERROR_STOP=1 -c "SET ROLE campax_local" -f - < prisma/sql/003_usuario_empresas.sql
npx prisma migrate diff --from-url "$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"')" --to-schema-datamodel prisma/schema.prisma --script
npm run build && cd .. && npm run build && pm2 restart campax-backend-velorio campax-frontend-velorio
bash backend/scripts/refresh-dev-db.sh all
```

Expected: backup ok; restore-check identical counts; `NOTICE: 003: 5 vínculos criados`; empty migration; builds ok; both services `online`.

- [ ] **Step 4: Conferir em produção (sem alterar dados)**

Run:

```bash
curl -s -o /dev/null -w "health %{http_code}\n" http://localhost:3013/health
TOKEN=$(curl -s -X POST http://localhost:3013/auth/login -H 'Content-Type: application/json' -d '{"email":"cvsuporte+plataforma@gmail.com","password":"<senha atual da plataforma>"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
curl -s http://localhost:3013/platform/usuarios -H "Authorization: Bearer $TOKEN" | node -pe "JSON.parse(require('fs').readFileSync(0)).data.map(u=>u.email+' → '+u.empresas.map(e=>e.nome_exibicao).join(', ')).join('\n')"
```

Expected: `health 200`; 5 users, each with exactly one empresa. Ask the user for the platform password instead of guessing it if it was changed. Also ask the user to confirm that the Senap superadmin still enters `senap.campax.com.br` normally (their token from before the deploy keeps working).

- [ ] **Step 5: Documentação**

- `CLAUDE.md`, section "Database Schema": in the **empresas** bullet, replace "`cameras`, `sala_velorio`, … have `empresa_id NOT NULL`" context so that it no longer lists profiles, and replace the **profiles** bullet with: "`email` (globally unique), `password_hash` (bcrypt), `role` (platform_admin/superadmin/admin/operador/viewer — the same in every empresa of the user), `is_active`, `senha_alterada_em`. Empresas come from **usuario_empresas** (`profile_id`, `empresa_id`, `created_by`): zero, one or several per user; `platform_admin` never has one (triggers from `003_usuario_empresas.sql`). Only the platform links/unlinks (`/platform/usuarios`, spec 10)."
- `CLAUDE.md`, section "Auth & access control": add "The JWT carries the active empresa (`emp`); `requireAuth` re-checks the link on every request (`src/auth/empresaAtiva.ts`). A user with several empresas gets a provisional login on the generic address and picks one (`POST /auth/empresa`, `/admin/escolher-empresa`); on a subdomain, the empresa is the one of the address. `req.db` filters `profiles` through `usuario_empresas`. A superadmin can't change password/role/active of a user who also serves another empresa (403), only remove them from their own (`DELETE /users/:id/vinculo`); no action may leave an empresa without an active superadmin (`src/tenant/superadmins.ts`)."
- `CLAUDE.md`, "Frontend Routes": add `/admin/escolher-empresa`, `/platform/usuarios`, `/platform/usuarios/novo`, `/platform/usuarios/:id`.
- `docs/multiempresa/10-usuarios-globais.md`: status line → "**implementada e no ar em 2026-MM-DD**"; add a section "## Notas da implementação" with: the migration-test deviation (verified by the script's own count check on `campax_dev` + manual re-run refusal), the `prismaForEmpresa` rules for `profiles`/`usuario_empresas`, the `platform_admin` link attempt answering 404 (not 400, the user isn't found among linkable users), and the final test count.
- `docs/multiempresa/00-planejamento.md`: F9 row → "— **no ar em 2026-MM-DD**".

- [ ] **Step 6: Suíte final e commit**

Run: `cd /root/campax/backend && npm test 2>&1 | grep -E "×|Test Files|Tests"`
Expected: all pass.

```bash
cd /root/campax
git add CLAUDE.md docs/multiempresa
git commit -m "docs: usuários globais no ar (spec 10)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Do not push without the user's go-ahead (scan the diff for secrets first, as in previous pushes).
