# Subdomínio por funerária — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada funerária acessa o Campax por `<slug>.campax.com.br`, com a marca dela em todas as telas, restrito à empresa dela.

**Architecture:** O frontend lê o slug do `location.hostname` uma vez (`HOST_SLUG`) e o manda ao backend onde importa (login, token). O backend só usa o slug para restringir. CORS/Socket.IO passam a aceitar `https://<slug>.<BASE_DOMAIN>` de empresas ativas (cache de 60 s). Infra: registro `*` na Cloudflare + certificado curinga e host curinga no nginx-proxy-manager.

**Tech Stack:** Express + Prisma + Vitest/supertest (backend), React 18 + React Router v6 + TanStack Query (frontend), mediamtx-sync (Node + pg + Vitest).

**Spec:** `docs/multiempresa/08-subdominio-dominio-proprio.md`

## Global Constraints

- Domínio base vem de `BASE_DOMAIN` (backend) e `VITE_BASE_DOMAIN` (frontend); vazio/ausente = recurso desligado, comportamento idêntico ao atual.
- Slugs reservados (mesma lista no backend e no frontend): `app`, `app2`, `backend`, `media`, `media2`, `apicam`, `api`, `www`, `admin`, `platform`, `check`, `mail`, `smtp`, `ftp`, `status`, `static`, `cdn`, `painel`, `suporte`.
- Slugs de sala proibidos: `admin`, `velorio`, `platform`.
- Origem aceita só no formato exato `https://<slug>.<BASE_DOMAIN>` (sem porta, sem caminho, um nível), empresa **ativa**.
- Login recusado por empresa: **401 `Credenciais inválidas`** (mesma resposta de senha errada), checado depois da senha.
- Token de outra empresa com `?empresa=`: **404 `Velório não encontrado`** (mesma resposta de token inexistente).
- Empresa inexistente/suspensa/reservada nas rotas por slug: 404.
- Arquivos que importam o `prisma` cru precisam estar em `ALLOWED` de `backend/test/no-raw-prisma.test.ts`.
- Mensagens de UI em português; comentários no estilo do código vizinho (inglês, curtos).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Backend: `cd backend && npm test` (roda contra `campax_test`). Frontend: não há testes; verificar com `npx tsc --noEmit -p tsconfig.app.json` e `npm run build` (o `npm run lint` já tem 51 problemas antigos — rodar `npx eslint <arquivos tocados>` e não introduzir novos).

## Review Focus

1. **Slug com maiúsculas no endereço** (`Funeraria-X.campax.com.br`): navegadores já mandam o host em minúsculas, mas o `?empresa=` de desenvolvimento e o `Origin` forjado não — `parseEmpresaOrigin` e `slugFromHostname` normalizam para minúsculas (testado na Task 1).
2. **Sessão de outra empresa ou de `platform_admin` aberta no subdomínio** (token colado, ou `/admin` → `/platform` → `/admin` em loop): `useAuth` descarta a sessão quando `empresa.slug !== HOST_SLUG` (Task 8, verificação manual do loop).
3. **Sufixos enganosos no `Origin`** (`https://x.campax.com.br.evil.com`, `https://xcampax.com.br`, `https://a.b.campax.com.br`, `http://`, porta): recusados (Task 1).
4. **Empresa suspensa depois do cache**: CORS pode continuar aceitando por até 60 s, mas as rotas públicas já devolvem 404 e `requireAuth` 403 — testado nas rotas por slug (Task 3).
5. **Rota `/:salaSlug` no `app2`**: não deve existir sem `HOST_SLUG` (continua `NotFound`) — verificação manual na Task 9.

---

## File Structure

**Backend**
- Create `backend/src/lib/empresaHost.ts` — domínio base, slugs reservados, parse/validação de origem com cache, função `corsOrigin` para Express e Socket.IO.
- Modify `backend/src/app.ts` — CORS usa `corsOrigin`.
- Modify `backend/src/index.ts` + `backend/src/realtime/socket.ts` — Socket.IO usa `corsOrigin`.
- Modify `backend/src/routes/public.ts` — rotas por slug, `?empresa=` no token.
- Modify `backend/src/routes/auth.ts` — `empresa_slug` no login.
- Modify `backend/src/routes/platform.ts`, `backend/src/routes/salas.ts` — slugs reservados.
- Tests: `backend/test/subdominio/empresaHost.test.ts`, `backend/test/subdominio/rotas.test.ts`; modify `backend/test/no-raw-prisma.test.ts`.

**mediamtx-sync**
- Modify `mediamtx-sync/src/paths.ts` (`needsRotation`), `mediamtx-sync/src/db.ts`, `mediamtx-sync/src/scripts/rotatePaths.ts`; test em `mediamtx-sync/test/plan.test.ts`.

**Frontend**
- Create `src/lib/hostEmpresa.ts` — `HOST_SLUG`, `slugFromHostname`, `empresaOrigin`.
- Create `src/hooks/useHostEmpresa.ts` — marca da empresa do endereço.
- Create `src/components/HostEmpresaGate.tsx`, `src/pages/EnderecoNaoEncontrado.tsx`.
- Modify `src/App.tsx`, `src/hooks/useAuth.ts`, `src/pages/PublicAccess.tsx`, `src/pages/AdminLogin.tsx`, `src/hooks/useSalaPublicLink.ts`, `src/pages/SalaPublicLink.tsx`, `src/pages/SalaManagement.tsx`, `src/pages/platform/PlatformEmpresaDetalhe.tsx`, `src/vite-env.d.ts`.

**Docs/config**: `backend/.env.example`, `backend/.env.test.example`, `CLAUDE.md`, spec 08 (notas da implementação).

---

### Task 1: `empresaHost` — slugs reservados e validação de origem

**Files:**
- Create: `backend/src/lib/empresaHost.ts`
- Create: `backend/test/subdominio/empresaHost.test.ts`
- Modify: `backend/test/no-raw-prisma.test.ts` (adicionar `'lib/empresaHost.ts'` em `ALLOWED`)

**Interfaces:**
- Produces:
  - `baseDomain(): string` — `process.env.BASE_DOMAIN` normalizado (minúsculas, sem ponto inicial/final), `''` se ausente. Lido a cada chamada (os testes mudam o valor).
  - `RESERVED_SLUGS: ReadonlySet<string>`, `isReservedSlug(slug: string): boolean`
  - `RESERVED_SALA_SLUGS: ReadonlySet<string>` (`admin`, `velorio`, `platform`)
  - `parseEmpresaOrigin(origin: string): string | null` — puro; slug candidato ou null.
  - `isEmpresaOrigin(origin: string): Promise<boolean>` — com cache de 60 s por slug.
  - `clearEmpresaOriginCache(): void` — para testes.

- [ ] **Step 1: Escrever os testes**

`backend/test/subdominio/empresaHost.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/prisma';
import { resetDb, createEmpresa } from '../helpers';
import {
  clearEmpresaOriginCache, isEmpresaOrigin, isReservedSlug, parseEmpresaOrigin,
} from '../../src/lib/empresaHost';

beforeEach(async () => {
  process.env.BASE_DOMAIN = 'campax.com.br';
  clearEmpresaOriginCache();
  await resetDb();
});
afterAll(() => prisma.$disconnect());

describe('parseEmpresaOrigin', () => {
  it('aceita https://<slug>.<base> e devolve o slug em minúsculas', () => {
    expect(parseEmpresaOrigin('https://funeraria-x.campax.com.br')).toBe('funeraria-x');
    expect(parseEmpresaOrigin('https://Funeraria-X.Campax.com.br')).toBe('funeraria-x');
  });

  it.each([
    'http://funeraria-x.campax.com.br',
    'https://funeraria-x.campax.com.br:8443',
    'https://funeraria-x.campax.com.br/admin',
    'https://a.b.campax.com.br',
    'https://x.campax.com.br.evil.com',
    'https://xcampax.com.br',
    'https://campax.com.br',
    'https://app2.campax.com.br',
    'https://-x.campax.com.br',
    'https://x_y.campax.com.br',
    'null',
    '',
  ])('recusa %s', (origin) => {
    expect(parseEmpresaOrigin(origin)).toBeNull();
  });

  it('BASE_DOMAIN vazio recusa tudo', () => {
    process.env.BASE_DOMAIN = '';
    expect(parseEmpresaOrigin('https://funeraria-x.campax.com.br')).toBeNull();
  });
});

describe('isReservedSlug', () => {
  it('reconhece nomes de infraestrutura', () => {
    for (const s of ['app2', 'backend', 'media2', 'apicam', 'www', 'admin', 'platform']) expect(isReservedSlug(s)).toBe(true);
    expect(isReservedSlug('funeraria-x')).toBe(false);
  });
});

describe('isEmpresaOrigin', () => {
  it('empresa ativa → true; inexistente ou suspensa → false', async () => {
    const ativa = await createEmpresa();
    const suspensa = await createEmpresa({ ativo: false });
    expect(await isEmpresaOrigin(`https://${ativa.slug}.campax.com.br`)).toBe(true);
    expect(await isEmpresaOrigin(`https://${suspensa.slug}.campax.com.br`)).toBe(false);
    expect(await isEmpresaOrigin('https://naoexiste.campax.com.br')).toBe(false);
  });

  it('guarda o resultado em cache (suspender só vale depois do cache expirar)', async () => {
    const empresa = await createEmpresa();
    const origin = `https://${empresa.slug}.campax.com.br`;
    expect(await isEmpresaOrigin(origin)).toBe(true);
    await prisma.empresas.update({ where: { id: empresa.id }, data: { ativo: false } });
    expect(await isEmpresaOrigin(origin)).toBe(true);
    clearEmpresaOriginCache();
    expect(await isEmpresaOrigin(origin)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run test/subdominio/empresaHost.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/empresaHost'`.

- [ ] **Step 3: Implementar**

`backend/src/lib/empresaHost.ts`:

```ts
import { prisma } from '../prisma';

// Each funerária is reachable at https://<empresa slug>.<BASE_DOMAIN> (spec 08). The frontend
// tells the backend which slug it is on; the backend only uses it to narrow results down, so it
// never has to trust it. An empty BASE_DOMAIN turns subdomains off.

/** Subdomains taken by infrastructure; no empresa may use them as slug. Mirrored in src/lib/hostEmpresa.ts (frontend). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'app', 'app2', 'backend', 'media', 'media2', 'apicam', 'api', 'www', 'admin', 'platform',
  'check', 'mail', 'smtp', 'ftp', 'status', 'static', 'cdn', 'painel', 'suporte',
]);

/** A sala slug becomes /<sala> on the subdomain, so it can't shadow a first-level route. */
export const RESERVED_SALA_SLUGS: ReadonlySet<string> = new Set(['admin', 'velorio', 'platform']);

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function baseDomain(): string {
  return (process.env.BASE_DOMAIN ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

/** The empresa slug of an exact `https://<slug>.<BASE_DOMAIN>` origin, or null. Pure — no DB. */
export function parseEmpresaOrigin(origin: string): string | null {
  const base = baseDomain();
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port || url.origin.toLowerCase() !== origin.toLowerCase()) return null;
  const host = url.hostname.toLowerCase();
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  if (!SLUG_RE.test(slug) || isReservedSlug(slug)) return null;
  return slug;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { ok: boolean; at: number }>();

export function clearEmpresaOriginCache() {
  cache.clear();
}

/** True for the subdomain of an active empresa. Cached per slug for a minute (positive and negative). */
export async function isEmpresaOrigin(origin: string): Promise<boolean> {
  const slug = parseEmpresaOrigin(origin);
  if (!slug) return false;
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok;
  const empresa = await prisma.empresas.findUnique({ where: { slug }, select: { ativo: true } });
  const ok = !!empresa?.ativo;
  cache.set(slug, { ok, at: Date.now() });
  return ok;
}
```

Notas: `url.origin` de `https://x.campax.com.br/admin` é `https://x.campax.com.br`, diferente do texto de entrada → recusado (sem caminho). `'null'` e `''` caem no `catch`.

Em `backend/test/no-raw-prisma.test.ts`, adicionar `'lib/empresaHost.ts',` depois de `'lib/token.ts',`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run test/subdominio/empresaHost.test.ts test/no-raw-prisma.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/empresaHost.ts backend/test/subdominio/empresaHost.test.ts backend/test/no-raw-prisma.test.ts
git commit -m "feat(backend): valida origem de subdomínio de empresa (spec 08)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: CORS e Socket.IO aceitam subdomínios de empresas ativas

**Files:**
- Modify: `backend/src/lib/empresaHost.ts` (adicionar `corsOrigin`)
- Modify: `backend/src/app.ts:27-33`
- Modify: `backend/src/index.ts:4,9`
- Modify: `backend/src/realtime/socket.ts:44-45`
- Create: `backend/test/subdominio/rotas.test.ts`

**Interfaces:**
- Consumes: `isEmpresaOrigin` (Task 1).
- Produces: `corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void` em `empresaHost.ts`; `initRealtime(server, corsOrigin)` passa a receber a função.

- [ ] **Step 1: Escrever os testes**

`backend/test/subdominio/rotas.test.ts` (este arquivo cresce nas Tasks 3–5):

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/prisma';
import { clearEmpresaOriginCache } from '../../src/lib/empresaHost';
import { resetDb } from '../helpers';
import { duasEmpresas, Fixture } from '../isolamento/fixture';

let f: Fixture;

beforeEach(async () => {
  process.env.BASE_DOMAIN = 'campax.com.br';
  clearEmpresaOriginCache();
  await resetDb();
  f = await duasEmpresas();
});
afterAll(() => prisma.$disconnect());

const ACAO = 'access-control-allow-origin';

describe('CORS', () => {
  it('aceita o subdomínio de uma empresa ativa', async () => {
    const origin = `https://${f.A.empresa.slug}.campax.com.br`;
    const res = await request(app).get('/health').set('Origin', origin);
    expect(res.headers[ACAO]).toBe(origin);
  });

  it('continua aceitando FRONTEND_ORIGIN', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:8080');
    expect(res.headers[ACAO]).toBe('http://localhost:8080');
  });

  it('recusa slug inexistente, empresa suspensa e http://', async () => {
    await prisma.empresas.update({ where: { id: f.B.empresa.id }, data: { ativo: false } });
    for (const origin of [
      'https://naoexiste.campax.com.br',
      `https://${f.B.empresa.slug}.campax.com.br`,
      `http://${f.A.empresa.slug}.campax.com.br`,
    ]) {
      const res = await request(app).get('/health').set('Origin', origin);
      expect(res.headers[ACAO]).toBeUndefined();
    }
  });

  it('preflight de subdomínio válido responde com os cabeçalhos', async () => {
    const origin = `https://${f.A.empresa.slug}.campax.com.br`;
    const res = await request(app).options('/auth/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers[ACAO]).toBe(origin);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run test/subdominio/rotas.test.ts`
Expected: FAIL — o primeiro teste e o preflight não recebem `access-control-allow-origin`.

- [ ] **Step 3: Implementar**

Em `backend/src/lib/empresaHost.ts`, acrescentar no fim (o import de `FRONTEND_ORIGIN` criaria ciclo com `app.ts`, por isso a lista fixa é lida do env aqui e `app.ts` passa a reexportá-la daqui):

```ts
// Comma-separated list, e.g. "https://app2.campax.com.br,http://2.29.41.124:8080"
export const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || 'http://localhost:8080')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Origin check shared by Express (cors) and Socket.IO: the fixed FRONTEND_ORIGIN list, plus the
 * subdomain of any active empresa. Requests without Origin (same-origin, curl) pass, as before.
 */
export function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin || FRONTEND_ORIGIN.includes(origin)) return callback(null, true);
  isEmpresaOrigin(origin).then(
    (ok) => callback(null, ok),
    () => callback(null, false),
  );
}
```

Em `backend/src/app.ts`, substituir o bloco das linhas 27–33:

```ts
// Comma-separated list, e.g. "http://app2.campax.com.br,http://2.29.41.124:8080"
export const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || 'http://localhost:8080')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({ origin: FRONTEND_ORIGIN }));
```

por:

```ts
// FRONTEND_ORIGIN plus the subdomains of active empresas (spec 08).
app.use(cors({ origin: corsOrigin }));
```

e adicionar `import { corsOrigin } from './lib/empresaHost';` junto dos outros imports de `./lib`. Conferir com `grep -rn "FRONTEND_ORIGIN" backend/src backend/test` que ninguém mais importa `FRONTEND_ORIGIN` de `./app` além de `index.ts`.

`backend/src/index.ts`:

```ts
import { app } from './app';
import { corsOrigin } from './lib/empresaHost';
import { initRealtime } from './realtime/socket';

const server = http.createServer(app);

initRealtime(server, corsOrigin);
```

`backend/src/realtime/socket.ts`, linhas 44–45:

```ts
export function initRealtime(server: HttpServer, corsOrigin: CorsOrigin) {
  io = new SocketIOServer(server, { cors: { origin: corsOrigin } });
```

com, no topo do arquivo, `import type { CorsOrigin } from '../lib/empresaHost';` — e em `empresaHost.ts`, logo antes de `corsOrigin`:

```ts
export type CorsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
```

(declarar `export const corsOrigin: CorsOrigin = (origin, callback) => { … }` ou manter a `function` com a mesma assinatura).

- [ ] **Step 4: Rodar e ver passar; rodar a suíte toda e o build**

Run: `cd backend && npx vitest run test/subdominio && npm test && npx tsc --noEmit`
Expected: tudo PASS, sem erro de tipos.

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/test/subdominio/rotas.test.ts
git commit -m "feat(backend): CORS e Socket.IO aceitam subdomínios de empresas ativas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rotas públicas por slug e filtro de empresa no token

**Files:**
- Modify: `backend/src/routes/public.ts:89-155`
- Modify: `backend/test/subdominio/rotas.test.ts`

**Interfaces:**
- Consumes: `isReservedSlug` (Task 1).
- Produces:
  - `GET /public/empresas/slug/:slug` → `{ success, data: EmpresaPublica }` | 404 `Empresa não encontrada`
  - `GET /public/empresas/slug/:slug/salas/:salaSlug` → mesmo corpo de `/public/empresas/:hash/salas/:slug` (`{ sala, atual, proximo, empresa }`) | 404 `Sala não encontrada`
  - `GET /public/velorios/:token?empresa=<slug>` → 404 se o velório não for da empresa.

- [ ] **Step 1: Escrever os testes** (acrescentar em `rotas.test.ts`)

```ts
describe('rotas públicas por slug', () => {
  it('marca da empresa por slug: mesmos campos da rota por hash', async () => {
    const porSlug = await request(app).get(`/public/empresas/slug/${f.A.empresa.slug}`);
    const porHash = await request(app).get(`/public/empresas/${f.A.empresa.hash_publico}`);
    expect(porSlug.status).toBe(200);
    expect(porSlug.body.data).toEqual(porHash.body.data);
  });

  it('empresa suspensa, inexistente ou slug reservado → 404', async () => {
    await prisma.empresas.update({ where: { id: f.B.empresa.id }, data: { ativo: false } });
    for (const slug of [f.B.empresa.slug, 'naoexiste', 'app2']) {
      expect((await request(app).get(`/public/empresas/slug/${slug}`)).status).toBe(404);
      expect((await request(app).get(`/public/empresas/slug/${slug}/salas/sala-1`)).status).toBe(404);
    }
  });

  it('sala por slug da empresa: cada empresa vê a sua sala-1', async () => {
    const a = await request(app).get(`/public/empresas/slug/${f.A.empresa.slug}/salas/sala-1`);
    const b = await request(app).get(`/public/empresas/slug/${f.B.empresa.slug}/salas/sala-1`);
    expect(a.status).toBe(200);
    expect(a.body.data.sala.id).toBe(f.A.sala.id);
    expect(a.body.data.atual.id).toBe(f.A.velorio.id);
    expect(b.body.data.sala.id).toBe(f.B.sala.id);
  });

  it('sala inexistente na empresa → 404', async () => {
    expect((await request(app).get(`/public/empresas/slug/${f.A.empresa.slug}/salas/nao-existe`)).status).toBe(404);
  });
});

describe('token com ?empresa=', () => {
  it('mesma empresa → 200; outra empresa → 404 igual a token inexistente; sem parâmetro → como antes', async () => {
    const token = f.A.velorio.token_acesso;
    expect((await request(app).get(`/public/velorios/${token}?empresa=${f.A.empresa.slug}`)).status).toBe(200);
    const outra = await request(app).get(`/public/velorios/${token}?empresa=${f.B.empresa.slug}`);
    const inexistente = await request(app).get('/public/velorios/ZZZZZZ');
    expect(outra.status).toBe(404);
    expect(outra.body).toEqual(inexistente.body);
    expect((await request(app).get(`/public/velorios/${token}`)).status).toBe(200);
  });

  it('slug em maiúsculas é normalizado', async () => {
    const res = await request(app).get(`/public/velorios/${f.A.velorio.token_acesso}?empresa=${f.A.empresa.slug.toUpperCase()}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run test/subdominio/rotas.test.ts`
Expected: FAIL — rotas por slug respondem 404 em todos os casos; `?empresa=` de outra empresa responde 200.

- [ ] **Step 3: Implementar**

Em `backend/src/routes/public.ts`:

1. Import: `import { isReservedSlug } from '../lib/empresaHost';`
2. Helper novo, junto de `isUuid`:

```ts
/** `?empresa=<slug>` sent by the subdomain frontend (spec 08): narrows results, never widens them. */
function empresaSlugFilter(value: unknown): string | null {
  return typeof value === 'string' && value ? value.toLowerCase() : null;
}
```

3. Na rota `GET /velorios/:token`, trocar `sendPublicVelorio(res, velorio);` por:

```ts
    const empresaSlug = empresaSlugFilter(req.query.empresa);
    if (velorio && empresaSlug && velorio.empresa.slug !== empresaSlug) return notFound(res);
    sendPublicVelorio(res, velorio);
```

4. Extrair o corpo da rota `/empresas/:hash/salas/:slug` para uma função e criar as duas rotas por slug. O trecho das linhas 112–155 fica:

```ts
type EmpresaRow = Parameters<typeof publicEmpresa>[0];

async function findEmpresaBySlug(slug: string): Promise<EmpresaRow> {
  const s = slug.toLowerCase();
  if (isReservedSlug(s)) return null;
  return prisma.empresas.findUnique({ where: { slug: s }, ...EMPRESA_PUBLIC_WITH_STATUS });
}

function sendEmpresa(res: Response, empresaRow: EmpresaRow) {
  const data = publicEmpresa(empresaRow);
  if (!data) return notFound(res, 'Empresa não encontrada');
  res.json({ success: true, data });
}

// Fixed public link of a sala: current velório (or the next one) of a sala of this empresa.
async function sendSalaPublicLink(res: Response, empresaRow: EmpresaRow, salaSlug: string) {
  const empresa = publicEmpresa(empresaRow);
  if (!empresa) return notFound(res, 'Sala não encontrada');

  const sala = await prisma.sala_velorio.findUnique({
    where: { empresa_id_slug: { empresa_id: empresa.id, slug: salaSlug } },
    select: { id: true, nome_sala_velorio: true, cidade: true, estado: true },
  });
  if (!sala) return notFound(res, 'Sala não encontrada');

  const velorios = await prisma.velorios.findMany({
    where: { sala_velorio_id: sala.id },
    select: { id: true, nome_falecido: true, data_inicio: true, data_fim: true, data_sepultamento: true },
  });

  const now = new Date();
  const aoVivos = velorios.filter((v) => now >= v.data_inicio && now <= v.data_fim);
  const atual = aoVivos.length
    ? aoVivos.reduce((maisRecente, v) => (v.data_inicio > maisRecente.data_inicio ? v : maisRecente))
    : null;
  const proximo = atual
    ? null
    : velorios.filter((v) => v.data_inicio > now).sort((a, b) => a.data_inicio.getTime() - b.data_inicio.getTime())[0] ?? null;

  res.json({ success: true, data: { sala, atual, proximo, empresa } });
}

// Subdomain frontend (spec 08): the empresa comes from <slug>.campax.com.br. Registered before
// '/empresas/:hash' routes only for readability — the paths don't overlap.
publicRouter.get('/empresas/slug/:slug', async (req, res) => {
  try {
    sendEmpresa(res, await findEmpresaBySlug(req.params.slug));
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

publicRouter.get('/empresas/slug/:slug/salas/:salaSlug', async (req, res) => {
  try {
    await sendSalaPublicLink(res, await findEmpresaBySlug(req.params.slug), req.params.salaSlug);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

publicRouter.get('/empresas/:hash', async (req, res) => {
  try {
    sendEmpresa(res, await prisma.empresas.findUnique({ where: { hash_publico: req.params.hash }, ...EMPRESA_PUBLIC_WITH_STATUS }));
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fixed public link of a sala: /:hashEmpresa/:salaSlug in the frontend. Replaces the old
// GET /public/salas/:slug, which relied on slugs being unique across the whole system.
publicRouter.get('/empresas/:hash/salas/:slug', async (req, res) => {
  try {
    const empresaRow = await prisma.empresas.findUnique({ where: { hash_publico: req.params.hash }, ...EMPRESA_PUBLIC_WITH_STATUS });
    await sendSalaPublicLink(res, empresaRow, req.params.slug);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

Se `Parameters<typeof publicEmpresa>[0]` não inferir bem (a função é genérica), declarar explicitamente:
`type EmpresaRow = Prisma.empresasGetPayload<typeof EMPRESA_PUBLIC_WITH_STATUS> | null;` (importar `Prisma` de `@prisma/client`).

- [ ] **Step 4: Rodar e ver passar; suíte toda**

Run: `cd backend && npx vitest run test/subdominio && npm test`
Expected: PASS (inclusive `test/isolamento/publico.test.ts`, que cobre a rota por hash).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/public.ts backend/test/subdominio/rotas.test.ts
git commit -m "feat(backend): rotas públicas por slug da empresa e filtro ?empresa= no token

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Login restrito à empresa do subdomínio

**Files:**
- Modify: `backend/src/routes/auth.ts:10-35`
- Modify: `backend/test/subdominio/rotas.test.ts`

**Interfaces:**
- Produces: `POST /auth/login` aceita `{ email, password, empresa_slug? }`.

- [ ] **Step 1: Escrever os testes** (acrescentar em `rotas.test.ts`; importar `TEST_PASSWORD` de `../helpers`)

```ts
describe('login com empresa_slug', () => {
  const login = (email: string, empresa_slug?: string) =>
    request(app).post('/auth/login').send({ email, password: TEST_PASSWORD, empresa_slug });

  it('usuário da mesma empresa entra', async () => {
    const res = await login(f.A.users.admin.email, f.A.empresa.slug);
    expect(res.status).toBe(200);
    expect(res.body.empresa.id).toBe(f.A.empresa.id);
  });

  it('usuário de outra empresa e platform_admin: 401 igual a senha errada', async () => {
    const senhaErrada = await request(app).post('/auth/login').send({ email: f.A.users.admin.email, password: 'errada', empresa_slug: f.A.empresa.slug });
    for (const email of [f.B.users.admin.email, f.platformAdmin.email]) {
      const res = await login(email, f.A.empresa.slug);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(senhaErrada.body);
    }
  });

  it('senha errada continua 401 mesmo com a empresa certa', async () => {
    const res = await request(app).post('/auth/login').send({ email: f.A.users.admin.email, password: 'errada', empresa_slug: f.A.empresa.slug });
    expect(res.status).toBe(401);
  });

  it('sem empresa_slug: como antes (qualquer empresa e platform_admin)', async () => {
    expect((await login(f.B.users.admin.email)).status).toBe(200);
    expect((await login(f.platformAdmin.email)).status).toBe(200);
  });

  it('empresa_slug em maiúsculas é normalizado', async () => {
    expect((await login(f.A.users.admin.email, f.A.empresa.slug.toUpperCase())).status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run test/subdominio/rotas.test.ts -t "login com empresa_slug"`
Expected: FAIL — usuário de B e platform_admin recebem 200.

- [ ] **Step 3: Implementar**

Em `backend/src/routes/auth.ts`:

```ts
    const { email, password, empresa_slug } = req.body as { email?: string; password?: string; empresa_slug?: unknown };
```

e, logo depois do bloco `if (!valid) { ... }` (antes do teste de empresa suspensa):

```ts
    // On a funerária's subdomain (spec 08) only its own users may log in. Same answer as a wrong
    // password, and only after checking it, so this reveals nothing about the e-mail.
    if (typeof empresa_slug === 'string' && empresa_slug && profile.empresa?.slug !== empresa_slug.toLowerCase()) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run test/subdominio && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/auth.ts backend/test/subdominio/rotas.test.ts
git commit -m "feat(backend): login no subdomínio aceita só usuários da empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Slugs reservados na criação de empresa e de sala

**Files:**
- Modify: `backend/src/routes/platform.ts:133-136`
- Modify: `backend/src/routes/salas.ts:37-80`
- Modify: `backend/test/subdominio/rotas.test.ts`

**Interfaces:**
- Consumes: `isReservedSlug`, `RESERVED_SALA_SLUGS` (Task 1).

- [ ] **Step 1: Escrever os testes** (acrescentar em `rotas.test.ts`)

```ts
describe('slugs reservados', () => {
  const novaEmpresa = (slug: string) => ({
    empresa: { nome: 'Funerária Nova', nome_exibicao: 'Nova', slug },
    superadmin: { email: `dono-${slug}@example.com`, password: 'senha-forte-1' },
  });

  it('empresa com slug reservado → 400 e nada é criado', async () => {
    const res = await request(app).post('/platform/empresas').set(f.as(f.platformAdmin)).send(novaEmpresa('app2'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Esse identificador é reservado');
    expect(await prisma.empresas.count({ where: { slug: 'app2' } })).toBe(0);
  });

  it.each(['admin', 'velorio', 'platform'])('sala com slug %s → 400 (criar e editar)', async (slug) => {
    const criar = await request(app).post('/salas').set(f.as(f.A.users.operador)).send({ nome_sala_velorio: 'Sala X', slug });
    expect(criar.status).toBe(400);
    const editar = await request(app).patch(`/salas/${f.A.sala.id}`).set(f.as(f.A.users.operador)).send({ slug });
    expect(editar.status).toBe(400);
    expect((await prisma.sala_velorio.findUnique({ where: { id: f.A.sala.id } }))!.slug).toBe('sala-1');
  });

  it('sala com slug comum continua funcionando', async () => {
    const res = await request(app).post('/salas').set(f.as(f.A.users.operador)).send({ nome_sala_velorio: 'Sala Y', slug: 'sala-y' });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run test/subdominio/rotas.test.ts -t "slugs reservados"`
Expected: FAIL — empresa `app2` criada (200) e salas `admin`/`velorio`/`platform` aceitas.

- [ ] **Step 3: Implementar**

`backend/src/routes/platform.ts` — import `import { isReservedSlug } from '../lib/empresaHost';` e, logo depois da validação de `SLUG_RE`:

```ts
    if (isReservedSlug(slug)) return bad(res, 'Esse identificador é reservado');
```

`backend/src/routes/salas.ts` — import `import { RESERVED_SALA_SLUGS } from '../lib/empresaHost';`, helper:

```ts
const RESERVED_SALA_SLUG = 'Esse identificador é reservado (admin, velorio e platform são endereços do sistema)';

/** A sala slug becomes /<sala> on the empresa's subdomain (spec 08). */
function reservedSalaSlug(body: unknown): boolean {
  const slug = (body as { slug?: unknown })?.slug;
  return typeof slug === 'string' && RESERVED_SALA_SLUGS.has(slug.trim().toLowerCase());
}
```

e no início do `try` do `POST /` e do `PATCH /:id`:

```ts
    if (reservedSalaSlug(req.body)) return res.status(400).json({ success: false, error: RESERVED_SALA_SLUG });
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/platform.ts backend/src/routes/salas.ts backend/test/subdominio/rotas.test.ts
git commit -m "feat(backend): recusa slugs reservados de empresa e de sala

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `rotate-paths` troca caminhos cujo prefixo não é o slug atual

**Files:**
- Modify: `mediamtx-sync/src/paths.ts`
- Modify: `mediamtx-sync/src/db.ts:29-36`
- Modify: `mediamtx-sync/src/scripts/rotatePaths.ts`
- Test: `mediamtx-sync/test/plan.test.ts`

**Interfaces:**
- Produces: `needsRotation(path: string, empresaSlug: string): boolean` em `paths.ts`; `getCamerasToRotate()` em `db.ts` (substitui `getCamerasWithLegacyPaths`).

- [ ] **Step 1: Escrever o teste** (acrescentar em `mediamtx-sync/test/plan.test.ts`, importando `needsRotation` de `../src/paths`)

```ts
describe('needsRotation', () => {
    it('nome antigo (fora do formato) precisa trocar', () => {
        expect(needsRotation('santana', 'campax')).toBe(true);
    });

    it('prefixo de outro slug (empresa renomeada) precisa trocar', () => {
        expect(needsRotation('campax-abcdefghij', 'funeraria-x')).toBe(true);
    });

    it('prefixo que só começa igual não engana', () => {
        expect(needsRotation('funeraria-xyz-abcdefghij', 'funeraria-x')).toBe(true);
    });

    it('prefixo correto não troca', () => {
        expect(needsRotation(generatePathName('funeraria-x'), 'funeraria-x')).toBe(false);
    });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd mediamtx-sync && npx vitest run`
Expected: FAIL — `needsRotation` não existe.

- [ ] **Step 3: Implementar**

`mediamtx-sync/src/paths.ts`, no fim:

```ts
/**
 * A camera's path must be regenerated when it isn't in the managed format (legacy names) or its
 * prefix isn't the empresa's current slug (the slug was changed by hand before go-live — spec 08).
 */
export function needsRotation(path: string, empresaSlug: string): boolean {
    if (!MANAGED_PATH.test(path)) return true;
    const prefix = path.slice(0, -(RANDOM_LENGTH + 1));
    return prefix !== empresaSlug;
}
```

`mediamtx-sync/src/db.ts` — renomear e usar o filtro novo (importar `needsRotation` de `./paths`):

```ts
/** Cameras whose MediaMTX path must be regenerated (legacy name or stale empresa prefix). */
export async function getCamerasToRotate(): Promise<(Camera & { ativo: boolean; empresa_ativa: boolean })[]> {
    const { rows } = await pool.query<Camera & { ativo: boolean; empresa_ativa: boolean }>(`
        SELECT c.id, c.nome, c.rtsp_url, c.mediamtx_path, c.webrtc_url, c.ativo, e.slug AS empresa_slug, e.ativo AS empresa_ativa
        FROM cameras c JOIN empresas e ON e.id = c.empresa_id
        WHERE c.mediamtx_path IS NOT NULL
        ORDER BY c.created_at`);
    return rows.filter((c) => needsRotation(c.mediamtx_path!, c.empresa_slug));
}
```

`mediamtx-sync/src/scripts/rotatePaths.ts`:
- import: `import { getCamerasToRotate, updateCameraUrls, closePool } from '../db';` e `import { generatePathName } from '../paths';`
- `const cameras = await getCamerasToRotate();`
- log: `` console.log(`${cameras.length} câmera(s) com caminho a trocar${apply ? '' : ' — simulação, use --apply para aplicar'}`); ``
- Atualizar o comentário do topo: "replaces guessable legacy path names … and paths whose prefix is not the empresa's current slug (spec 08, slug change before go-live)".

- [ ] **Step 4: Rodar e ver passar; build**

Run: `cd mediamtx-sync && npm test && npm run build`
Expected: PASS; `tsc` sem erros.

- [ ] **Step 5: Commit**

```bash
git add mediamtx-sync/src mediamtx-sync/test
git commit -m "feat(mediamtx-sync): rotate-paths também troca caminhos com prefixo de slug antigo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — empresa do endereço, porteiro e rotas

**Files:**
- Create: `src/lib/hostEmpresa.ts`
- Create: `src/hooks/useHostEmpresa.ts`
- Create: `src/components/HostEmpresaGate.tsx`
- Create: `src/pages/EnderecoNaoEncontrado.tsx`
- Modify: `src/vite-env.d.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces:
  - `HOST_SLUG: string | null` (calculado uma vez ao carregar a página)
  - `slugFromHostname(hostname: string, baseDomain: string): string | null`
  - `empresaOrigin(slug: string): string | null` → `https://<slug>.<VITE_BASE_DOMAIN>` ou null
  - `useHostEmpresa(): { slug: string | null; empresa: EmpresaPublica | null; isLoading: boolean; notFound: boolean }`

- [ ] **Step 1: `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** e.g. "campax.com.br": each empresa is served at <slug>.<VITE_BASE_DOMAIN> (spec 08). Empty = off. */
  readonly VITE_BASE_DOMAIN?: string;
}
```

- [ ] **Step 2: `src/lib/hostEmpresa.ts`**

```ts
// Which funerária this page belongs to, from the address: https://<slug>.<VITE_BASE_DOMAIN>
// (spec 08). app2.campax.com.br, a raw IP and localhost have none. The backend only uses the
// slug to narrow results down (login, token lookup), so nothing here is trusted.

/** Same list as backend/src/lib/empresaHost.ts. */
const RESERVED_SLUGS = new Set([
  'app', 'app2', 'backend', 'media', 'media2', 'apicam', 'api', 'www', 'admin', 'platform',
  'check', 'mail', 'smtp', 'ftp', 'status', 'static', 'cdn', 'painel', 'suporte',
]);
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DEV_KEY = 'campax:dev-empresa';

const BASE_DOMAIN = (import.meta.env.VITE_BASE_DOMAIN ?? '').trim().toLowerCase();

export function slugFromHostname(hostname: string, baseDomain: string): string | null {
  if (!baseDomain) return null;
  const host = hostname.toLowerCase();
  const suffix = `.${baseDomain}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug) ? slug : null;
}

function readHostSlug(): string | null {
  // Development only: ?empresa=<slug> simulates the subdomain and sticks for the tab's session.
  if (import.meta.env.DEV) {
    try {
      const param = new URLSearchParams(window.location.search).get('empresa');
      if (param !== null) {
        if (param) sessionStorage.setItem(DEV_KEY, param.toLowerCase());
        else sessionStorage.removeItem(DEV_KEY);
      }
      const saved = sessionStorage.getItem(DEV_KEY);
      if (saved) return saved;
    } catch {
      // sessionStorage unavailable: fall through to the real hostname
    }
  }
  return slugFromHostname(window.location.hostname, BASE_DOMAIN);
}

/** The empresa slug of this address, or null on the generic address. Fixed for the page's lifetime. */
export const HOST_SLUG: string | null = readHostSlug();

/** https://<slug>.<VITE_BASE_DOMAIN>, or null when subdomains are off. */
export function empresaOrigin(slug: string): string | null {
  return BASE_DOMAIN ? `https://${slug}.${BASE_DOMAIN}` : null;
}
```

- [ ] **Step 3: `src/hooks/useHostEmpresa.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/apiClient';
import { HOST_SLUG } from '@/lib/hostEmpresa';
import { EmpresaPublica } from '@/types/empresa';

/** Branding of the funerária this address belongs to (spec 08). slug null = generic address. */
export function useHostEmpresa() {
  const query = useQuery({
    queryKey: ['host_empresa', HOST_SLUG],
    queryFn: async (): Promise<EmpresaPublica | null> => {
      try {
        const { data } = await apiClient.get<{ data: EmpresaPublica }>(`/public/empresas/slug/${encodeURIComponent(HOST_SLUG!)}`);
        return data;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: !!HOST_SLUG,
    staleTime: 10 * 60_000,
  });
  return {
    slug: HOST_SLUG,
    empresa: query.data ?? null,
    isLoading: !!HOST_SLUG && query.isLoading,
    notFound: !!HOST_SLUG && query.isSuccess && query.data === null,
  };
}
```

- [ ] **Step 4: `src/pages/EnderecoNaoEncontrado.tsx`**

```tsx
import { CrossIcon } from '@/components/icons/MemorialIcons';

/** Subdomain of an empresa that doesn't exist or is suspended (spec 08). No branding on purpose. */
const EnderecoNaoEncontrado = () => (
  <div className="min-h-screen gradient-soft flex flex-col items-center justify-center p-6 text-center">
    <img src="/logo-campax.png" alt="Logo Campax" className="w-32 h-32 object-contain mb-6" />
    <div className="mb-4"><CrossIcon /></div>
    <h1 className="font-heading text-2xl text-foreground mb-2">Endereço não encontrado</h1>
    <p className="text-muted-foreground max-w-sm">
      Confira o endereço recebido da funerária. Se o problema continuar, entre em contato com ela.
    </p>
  </div>
);

export default EnderecoNaoEncontrado;
```

- [ ] **Step 5: `src/components/HostEmpresaGate.tsx`**

```tsx
import { ReactNode } from 'react';
import { useHostEmpresa } from '@/hooks/useHostEmpresa';
import EnderecoNaoEncontrado from '@/pages/EnderecoNaoEncontrado';

/** On a funerária's subdomain, waits for its branding and blocks unknown or suspended ones. */
export function HostEmpresaGate({ children }: { children: ReactNode }) {
  const { slug, isLoading, notFound } = useHostEmpresa();
  if (!slug) return <>{children}</>;
  if (isLoading) {
    return (
      <div className="min-h-screen gradient-soft flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (notFound) return <EnderecoNaoEncontrado />;
  return <>{children}</>;
}
```

- [ ] **Step 6: `src/App.tsx`**

- Imports: `import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";`, `import { HostEmpresaGate } from "./components/HostEmpresaGate";`, `import { HOST_SLUG } from "./lib/hostEmpresa";`
- Envolver `<Routes>` com `<HostEmpresaGate>` … `</HostEmpresaGate>` (dentro do `<BrowserRouter>`).
- Depois de `<Route path="/:hashEmpresa/:salaSlug" …/>`, adicionar:

```tsx
          {/* Subdomain only (spec 08): /<sala> without the hash. On app2 a one-segment URL stays NotFound. */}
          {HOST_SLUG && <Route path="/:salaSlug" element={<SalaPublicLink />} />}
```

- Substituir as 4 rotas `/platform…` por:

```tsx
          {/* Platform (platform_admin only) — generic address only; a subdomain sends it to its own login */}
          {HOST_SLUG ? (
            <Route path="/platform/*" element={<Navigate to="/admin" replace />} />
          ) : (
            <>
              <Route path="/platform" element={<ProtectedRoute scope="platform"><PlatformEmpresas /></ProtectedRoute>} />
              <Route path="/platform/empresas/nova" element={<ProtectedRoute scope="platform"><PlatformEmpresaNova /></ProtectedRoute>} />
              <Route path="/platform/empresas/:id" element={<ProtectedRoute scope="platform"><PlatformEmpresaDetalhe /></ProtectedRoute>} />
              <Route path="/platform/modelos-homenagem" element={<ProtectedRoute scope="platform"><PlatformModelos /></ProtectedRoute>} />
            </>
          )}
```

(React Router v6 aceita fragmentos com `<Route>` dentro de `<Routes>`.)

- [ ] **Step 7: Verificar tipos e build**

Run: `cd /root/campax && npx tsc --noEmit -p tsconfig.app.json && npx eslint src/lib/hostEmpresa.ts src/hooks/useHostEmpresa.ts src/components/HostEmpresaGate.tsx src/pages/EnderecoNaoEncontrado.tsx src/App.tsx && npm run build`
Expected: sem erros novos; build OK.

- [ ] **Step 8: Commit**

```bash
git add src/lib/hostEmpresa.ts src/hooks/useHostEmpresa.ts src/components/HostEmpresaGate.tsx src/pages/EnderecoNaoEncontrado.tsx src/vite-env.d.ts src/App.tsx
git commit -m "feat(frontend): identifica a empresa pelo subdomínio e bloqueia endereços desconhecidos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Frontend — token, login e sessão no subdomínio

**Files:**
- Modify: `src/pages/PublicAccess.tsx:67-70,193-208`
- Modify: `src/pages/AdminLogin.tsx:1-55`
- Modify: `src/hooks/useAuth.ts:37-58`

**Interfaces:**
- Consumes: `HOST_SLUG` (Task 7), `useHostEmpresa` (Task 7), `?empresa=` e `empresa_slug` (Tasks 3–4).

- [ ] **Step 1: `PublicAccess.tsx`**

- Imports: `import { useHostEmpresa } from '@/hooks/useHostEmpresa';` e `import { HOST_SLUG } from '@/lib/hostEmpresa';`
- Dentro do componente: `const { empresa: hostEmpresa } = useHostEmpresa();`
- Busca do token (linha ~69):

```tsx
        const filtro = HOST_SLUG ? `?empresa=${encodeURIComponent(HOST_SLUG)}` : '';
        const res = await apiClient.get<{ data: Velorio }>(`/public/velorios/${token.toUpperCase()}${filtro}`);
```

- Linha ~195: trocar `const empresa = step === 'token' ? null : pendingEmpresa;` por:

```tsx
  // Token step: the address's funerária on its subdomain, Campax on the generic address (B5);
  // later steps use the velório's funerária.
  const empresa = step === 'token' ? hostEmpresa : pendingEmpresa;
```

- Atualizar o comentário junto de `pendingEmpresa` (linhas 32–33) para não afirmar mais que o passo do token é sempre Campax.

- [ ] **Step 2: `useAuth.ts`**

- Import: `import { HOST_SLUG } from '@/lib/hostEmpresa';`
- `queryFn` da sessão:

```ts
        queryFn: async (): Promise<Session | null> => {
            const { profile, empresa } = await apiClient.get<Session>('/auth/me');
            // On a funerária's subdomain only its own users have a session (spec 08): a token from
            // another empresa or from platform_admin (copied between addresses) is dropped.
            if (HOST_SLUG && empresa?.slug !== HOST_SLUG) {
                clearToken();
                return null;
            }
            return { profile, empresa };
        },
```

- `signIn`: `apiClient.post<Session & { token: string }>('/auth/login', { email, password, empresa_slug: HOST_SLUG ?? undefined })`.
- Conferir que os usos de `session` aceitam `null` (`session?.profile` já é opcional).

- [ ] **Step 3: `AdminLogin.tsx`**

- Imports: `import { EmpresaLogo } from '@/components/EmpresaLogo';`, `import { useHostEmpresa } from '@/hooks/useHostEmpresa';`
- `const { empresa: hostEmpresa } = useHostEmpresa();`
- Trocar o `<img src="/logo-campax.png" …/>` por:

```tsx
            <EmpresaLogo empresa={hostEmpresa} className="w-full h-full object-contain drop-shadow-lg" />
```

- Abaixo do `<h1>Área Administrativa</h1>`:

```tsx
          {hostEmpresa && <p className="text-muted-foreground mt-1">{hostEmpresa.nome_exibicao}</p>}
```

(Cores continuam Campax: não chamar `useBranding` aqui — S2/B5 da spec.)

- [ ] **Step 4: Verificar tipos e build**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx eslint src/pages/PublicAccess.tsx src/pages/AdminLogin.tsx src/hooks/useAuth.ts && npm run build`
Expected: sem erros novos.

- [ ] **Step 5: Verificação manual (dev)**

Com `backend` em `npm run dev` e frontend em `npm run dev`, com `VITE_BASE_DOMAIN` vazio:
1. `http://localhost:8080/?empresa=<slug de uma empresa do campax_dev>` → tela do token com logo/cores da empresa.
2. Token de velório dessa empresa → segue; token inexistente → "Token inválido".
3. `/admin` → logo + nome da empresa; login de usuário da empresa entra; `platform_admin` recebe "Credenciais inválidas".
4. Sem loop: logado como `platform_admin` em `/?empresa=` vazio (`?empresa=` limpa), depois abrir `/admin?empresa=<slug>` → sessão descartada, tela de login (não fica alternando entre `/platform` e `/admin`).
5. `/?empresa=` (vazio) volta ao comportamento Campax.

- [ ] **Step 6: Commit**

```bash
git add src/pages/PublicAccess.tsx src/pages/AdminLogin.tsx src/hooks/useAuth.ts
git commit -m "feat(frontend): token, login e sessão restritos à empresa do subdomínio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Frontend — página da sala sem hash e links no painel

**Files:**
- Modify: `src/hooks/useSalaPublicLink.ts`
- Modify: `src/pages/SalaPublicLink.tsx:16-19`
- Modify: `src/pages/SalaManagement.tsx:53-54,167-169,320-330`
- Modify: `src/pages/platform/PlatformEmpresaDetalhe.tsx:71-76`

**Interfaces:**
- Consumes: `HOST_SLUG`, `empresaOrigin` (Task 7); `GET /public/empresas/slug/:slug/salas/:salaSlug` (Task 3).
- Produces: `useSalaPublicLink(empresaRef: { hash: string } | { slug: string } | null, salaSlug: string | undefined)`.

- [ ] **Step 1: `useSalaPublicLink.ts`**

```ts
export type EmpresaRef = { hash: string } | { slug: string };

/** Public per-sala link: the empresa by its public hash (/:hash/:sala) or its subdomain slug (/:sala). 404 → null. */
export function useSalaPublicLink(empresaRef: EmpresaRef | null, salaSlug: string | undefined) {
  const prefix = !empresaRef
    ? null
    : 'hash' in empresaRef
      ? `/public/empresas/${encodeURIComponent(empresaRef.hash)}`
      : `/public/empresas/slug/${encodeURIComponent(empresaRef.slug)}`;
  return useQuery({
    queryKey: ['sala_public_link', prefix, salaSlug],
    queryFn: async (): Promise<SalaPublicLinkData | null> => {
      try {
        const { data } = await apiClient.get<{ data: SalaPublicLinkData }>(`${prefix}/salas/${encodeURIComponent(salaSlug!)}`);
        return data;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: !!prefix && !!salaSlug,
  });
}
```

- [ ] **Step 2: `SalaPublicLink.tsx`**

- Import `import { HOST_SLUG } from '@/lib/hostEmpresa';`
- Linhas 16–19:

```tsx
  const { hashEmpresa, salaSlug } = useParams<{ hashEmpresa?: string; salaSlug: string }>();
  const navigate = useNavigate();
  // /:hash/:sala works everywhere (printed QR codes); /:sala only on a subdomain (spec 08).
  const empresaRef = hashEmpresa ? { hash: hashEmpresa } : HOST_SLUG ? { slug: HOST_SLUG } : null;
  // Unknown hash, a sala of another empresa and a suspended empresa all come back as 404 → NotFound.
  const { data, isLoading } = useSalaPublicLink(empresaRef, salaSlug);
```

- `grep -rn "useSalaPublicLink(" src` — atualizar qualquer outro chamador para a assinatura nova.

- [ ] **Step 3: `SalaManagement.tsx`**

- Import `import { empresaOrigin } from '@/lib/hostEmpresa';`
- Linhas 53–54:

```tsx
  // Fixed public links of the logged-in user's empresa: /<sala> on its subdomain (spec 08), and
  // /<hash>/<sala> on the generic address — still valid, it's in QR codes already handed out.
  const empresaHash = empresa?.hash_publico ?? '';
  const salaLinkBase = (empresa && empresaOrigin(empresa.slug)) ?? `${window.location.origin}/${empresaHash}`;
```

- Linha ~168 (prévia no formulário): `{salaLinkBase}/{formData.slug || '...'}`
- Linhas ~322–326 (lista): mostrar `{salaLinkBase}/{sala.slug}` e copiar `` `${salaLinkBase}/${sala.slug}` ``. Logo abaixo da `div` do link, quando `salaLinkBase` for o subdomínio, uma linha menor com o link antigo:

```tsx
                      {empresa && empresaOrigin(empresa.slug) && (
                        <p className="text-[11px] text-muted-foreground/70 truncate">
                          Link antigo (QR codes já impressos): {window.location.origin}/{empresaHash}/{sala.slug}
                        </p>
                      )}
```

Nota: no painel aberto pelo `app2`, `window.location.origin` é `app2`; no subdomínio, o link antigo sai como `https://<slug>.campax.com.br/<hash>/<sala>`, que também funciona.

- [ ] **Step 4: `PlatformEmpresaDetalhe.tsx`**

- Import `import { empresaOrigin } from '@/lib/hostEmpresa';`
- Depois do `Field` do "Hash público":

```tsx
        {empresaOrigin(empresa.slug) && (
          <Field label="Endereço da funerária" hint="Página do token e login do painel com a marca dela.">
            <Input value={empresaOrigin(empresa.slug)!} readOnly />
          </Field>
        )}
```

- Atualizar o `hint` do `Slug` para: "Usado no endereço da funerária e nos das câmeras; não pode ser alterado."

- [ ] **Step 5: Verificar tipos, lint e build**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx eslint src/hooks/useSalaPublicLink.ts src/pages/SalaPublicLink.tsx src/pages/SalaManagement.tsx src/pages/platform/PlatformEmpresaDetalhe.tsx && npm run build`
Expected: sem erros novos.

- [ ] **Step 6: Verificação manual (dev)**

1. `http://localhost:8080/<sala>?empresa=<slug>` → página da sala com a marca da empresa.
2. `http://localhost:8080/<hash>/<sala>` → continua funcionando.
3. Em outra aba sem `?empresa` (limpar com `?empresa=`), `http://localhost:8080/<sala>` → `NotFound` (Review Focus 5).
4. `/platform?empresa=<slug>` → redireciona para `/admin`.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useSalaPublicLink.ts src/pages/SalaPublicLink.tsx src/pages/SalaManagement.tsx src/pages/platform/PlatformEmpresaDetalhe.tsx
git commit -m "feat(frontend): página da sala sem hash no subdomínio e links novos no painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Configuração, documentação e implantação no VPS (sem DNS)

**Files:**
- Modify: `backend/.env.example`, `backend/.env.test.example`
- Modify: `backend/.env`, `backend/.env.development`, `.env` (não versionados)
- Modify: `CLAUDE.md`, `docs/multiempresa/08-subdominio-dominio-proprio.md`, `docs/multiempresa/00-planejamento.md`

- [ ] **Step 1: Exemplos de env** — em `backend/.env.example` e `backend/.env.test.example`, acrescentar:

```
# Subdomínios por funerária (spec 08): https://<slug>.<BASE_DOMAIN>. Vazio = desligado.
BASE_DOMAIN=campax.com.br
```

(no `.env.test.example`, deixar `BASE_DOMAIN=` vazio — os testes definem o valor sozinhos.)

- [ ] **Step 2: Envs reais** — `BASE_DOMAIN=campax.com.br` em `backend/.env` e `backend/.env.development`; `VITE_BASE_DOMAIN="campax.com.br"` no `.env` da raiz. Conferir com `grep -n BASE_DOMAIN backend/.env backend/.env.development .env`.

- [ ] **Step 3: Docs**
- `CLAUDE.md`: em Environment Variables, `BASE_DOMAIN` (backend) e `VITE_BASE_DOMAIN` (frontend); em Frontend Routes, `/:salaSlug` (só no subdomínio) e o redirecionamento de `/platform*`; em Auth & access control, uma frase sobre `empresa_slug` no login e `?empresa=` no token; em Public domains, a linha `https://<slug>.campax.com.br` (curinga → 8080) — marcar "pendente" até a Task 11.
- Spec 08: status "implementada em <data>" e seção "Notas da implementação" com o que divergiu do desenho (se nada, dizer isso).
- `00-planejamento.md`: status da F7.

- [ ] **Step 4: Verificação completa**

Run: `cd backend && npm test && npm run build && cd ../mediamtx-sync && npm test && npm run build && cd .. && npm run build`
Expected: tudo PASS / build OK. Anotar a contagem de testes (antes: backend 132, mediamtx-sync 16).

- [ ] **Step 5: Implantar (dev VPS)**

```bash
pm2 restart campax-backend-velorio campax-sync-velorio campax-frontend-velorio
curl -s -o /dev/null -w '%{http_code}\n' https://backend.campax.com.br/health
curl -s https://backend.campax.com.br/public/empresas/slug/campax | head -c 200; echo
curl -s -D - -o /dev/null -H 'Origin: https://campax.campax.com.br' https://backend.campax.com.br/health | grep -i access-control-allow-origin
curl -s -D - -o /dev/null -H 'Origin: https://app2.campax.com.br' https://backend.campax.com.br/health | grep -i access-control-allow-origin
```

Expected: `200`; JSON da empresa; os dois `access-control-allow-origin` presentes. Abrir `https://app2.campax.com.br` e conferir que token, sala por hash, login e `/platform` continuam como antes (critério 5).

- [ ] **Step 6: Commit**

```bash
git add backend/.env.example backend/.env.test.example CLAUDE.md docs/multiempresa
git commit -m "docs: subdomínio por funerária — configuração e notas da implementação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Operação — troca do slug inicial, DNS e certificado (depende do usuário)

Não é código; cada passo espera uma ação ou decisão do usuário. Não executar os passos 2–4 sem o novo slug confirmado por ele.

- [ ] **Step 1: Usuário informa o novo slug** (nome real da funerária; `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 40, fora de `RESERVED_SLUGS`) e confirma um horário sem velório ao vivo.

- [ ] **Step 2: Backup e troca**

```bash
/root/campax/scripts/backup-db.sh
psql "<DATABASE_URL de backend/.env, sem ?schema>" -c "UPDATE empresas SET slug = '<novo>' WHERE slug = 'campax' RETURNING id, slug, hash_publico;"
```

Expected: 1 linha, `hash_publico` inalterado (`d2788b07`).

- [ ] **Step 3: Caminhos do MediaMTX**

```bash
cd /root/campax/mediamtx-sync && npm run rotate-paths
```

Conferir a lista (todas as câmeras `campax-…` → `<novo>-…`), depois `npm run rotate-paths -- --apply` e `curl -s -X POST http://127.0.0.1:3002/sync`. Abrir um velório de teste e ver a imagem.

- [ ] **Step 4: Nome exibido** — usuário renomeia `nome`/`nome_exibicao` em `/platform/empresas/<id>`.

- [ ] **Step 5: Cloudflare (usuário)** — token de API *Zone → DNS → Edit* só na zona `campax.com.br`; registro `*` A → `2.29.41.124`, *DNS only*. Verificar: `dig +short A teste123.campax.com.br` → `2.29.41.124`.

- [ ] **Step 6: nginx-proxy-manager** — certificado Let's Encrypt `*.campax.com.br` + `campax.com.br` por desafio DNS (Cloudflare, token colado direto na interface do NPM pelo usuário); host `*.campax.com.br` → `http://2.29.41.124:8080`, *Force SSL*, *HTTP/2*, *Websockets Support*.

- [ ] **Step 7: Critérios de aceite da spec (1–7)** em `https://<novo>.campax.com.br`, anotando o resultado na seção "Notas da implementação" da spec 08; marcar a linha de domínio do `CLAUDE.md` como ativa; commit.

---

## Self-review (feito)

- Cobertura da spec: S1–S7 → Tasks 1–11; seção 1 (backend) → 1–5; seção 2 (frontend) → 7–9; seção 3 (infra) → 11; seção 4 (ordem) → 10–11; seção 5 (slug) → 6 + 11; testes → 1–6; critérios de aceite → 10 (5) e 11 (todos).
- Nomes consistentes: `HOST_SLUG`, `empresaOrigin`, `useHostEmpresa`, `useSalaPublicLink(empresaRef, salaSlug)`, `needsRotation`, `getCamerasToRotate`, `corsOrigin`, `isEmpresaOrigin`, `clearEmpresaOriginCache`, `RESERVED_SALA_SLUGS`.
