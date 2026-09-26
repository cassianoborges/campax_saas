# Nota de falecimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um botão "Nota de falecimento" em cada velório do painel abre um formulário preenchido com os dados do
velório, salva o que for completado (incluindo o campo novo `familiares`) e gera um PNG 1080×1350 a partir de um
de 3 modelos prontos, com a foto do falecido e a logo da funerária, para compartilhar no WhatsApp.

**Architecture:** Backend ganha só a coluna `velorios.familiares` (validada, fora da resposta pública). No
frontend, uma função pura `montarNota` transforma velório + empresa nos textos da nota; cada modelo é um
componente React de 1080×1350 px que recebe esses dados; o diálogo mostra a pré-visualização (o mesmo componente,
reduzido com `transform: scale`) e exporta uma cópia fora da tela com `html-to-image`.

**Tech Stack:** Express + Prisma 5 + Vitest/supertest (backend); React 18 + Vite 5 + Tailwind/shadcn +
TanStack Query (frontend); `html-to-image` (novo); Vitest 3 no frontend (novo).

**Spec:** `docs/superpowers/specs/2026-09-26-nota-falecimento-design.md`

## Global Constraints

- Imagem: PNG vertical 4:5, **1080×1350**, `pixelRatio: 1`.
- `familiares`: texto livre, opcional, **máximo 400 caracteres**; vazio/só espaços → `null`; erro do backend:
  `Familiares: máximo de 400 caracteres` (HTTP 400).
- `GET /public/velorios/:token` e `GET /public/velorios/id/:id` **não** devolvem `familiares`.
- Sem logo → nome da funerária em texto; **nunca** a logo da Campax na nota.
- Cores: `cor_primaria`/`cor_secundaria` da empresa; nulas ou inválidas → `#d99726` (dourado Campax, `--gold`
  38 70% 50%) e `#212c45` (azul-marinho Campax, `--navy` 222 35% 20%). Texto sobre cada cor: `foregroundFor`.
- Transmissão ao vivo: opcional, caixa desmarcada por padrão, **não salva**.
- Modelo lembrado em `localStorage` na chave `campax_nota_modelo` (leitura/escrita em `try/catch`), padrão
  `classico`.
- Arquivo: `nota-falecimento-<nome-em-slug>.png`.
- Botão visível para `isOperador` (operador ou acima), igual ao botão Editar.
- Código e comentários em inglês, textos da interface em português (padrão do repo). Company routers usam
  `req.db`; corpo da requisição passa por `pick(body, VELORIO_FIELDS)`.

## Review Focus

- **Datas só-dia deslocadas pelo fuso** — `data_nascimento`/`data_falecimento` chegam como
  `"1941-03-12T00:00:00.000Z"`; formatar em hora local no Brasil daria 11/03. Esperado: 12/03/1941 (teste na
  Task 2).
- **Tudo preenchido no máximo** (nome longo, 400 caracteres de familiares, foto, sepultamento, transmissão) —
  esperado: nada sai cortado nem transborda 1350 px; fontes encolhem (teste de `tamanhoNome`/
  `tamanhoFamiliares` na Task 2; conferência visual na Task 6).
- **Foto/logo que não carregam** (arquivo apagado, CORS) — esperado: a nota sai na variação sem foto / com o nome
  da funerária e um aviso, sem quebrar a exportação (teste de modelo sem imagens na Task 4; `paraDataUrl`
  devolve `null` na Task 3).
- **Cor da empresa inválida** (`"azul"`, `"#FFF"`) — esperado: cai no padrão Campax em vez de CSS inválido
  (teste na Task 2).
- **Salvar vazio apaga** — limpar sepultamento/familiares no formulário deve gravar `null`, não manter o valor
  antigo (teste de `familiares: ''` → `null` na Task 1; o diálogo envia `null` na Task 5).

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `backend/prisma/schema.prisma` | `familiares String?` em `velorios` |
| `backend/src/lib/http.ts` | `familiares` em `VELORIO_FIELDS` |
| `backend/src/routes/velorios.ts` | normalização/validação de `familiares` em `velorioFields` |
| `backend/src/routes/public.ts` | tira `familiares` da resposta pública |
| `backend/test/velorios-familiares.test.ts` | testes do campo |
| `vitest.config.ts` (raiz, novo) | Vitest do frontend (ambiente node, alias `@`) |
| `src/lib/datetimeLocal.ts` (novo) | `toDatetimeLocalValue`/`fromDatetimeLocalValue` (saem de `VelorioManagement.tsx`) |
| `src/lib/notaFalecimento.ts` (novo) | `montarNota`, `tamanhoNome`, `tamanhoFamiliares`, `nomeArquivoNota` (puros) |
| `src/lib/notaFalecimento.test.ts` (novo) | testes das funções puras |
| `src/lib/imagemNota.ts` (novo) | `paraDataUrl`, `gerarPng`, `compartilhar`, `baixar`, `copiar` (navegador) |
| `src/components/nota-falecimento/partes.tsx` (novo) | peças comuns dos modelos (logo/nome, datas, blocos de informação, rodapé) |
| `src/components/nota-falecimento/ModeloClassico.tsx`, `ModeloSereno.tsx`, `ModeloModerno.tsx` (novos) | os 3 modelos |
| `src/components/nota-falecimento/modelos.ts` (novo) | `MODELOS_NOTA`, `modeloPorId` |
| `src/components/nota-falecimento/modelos.test.tsx` (novo) | render estático dos modelos |
| `src/components/nota-falecimento/NotaFalecimentoDialog.tsx` (novo) | formulário, pré-visualização, salvar, gerar, compartilhar |
| `src/hooks/useVelorios.ts` | `familiares` nos tipos |
| `src/lib/hostEmpresa.ts` | exporta `BASE_DOMAIN` |
| `src/pages/VelorioManagement.tsx` | botão + diálogo; usa `src/lib/datetimeLocal.ts` |

---

### Task 1: Backend — coluna `familiares`, validação e fora da resposta pública

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `velorios`, depois de `google_maps_url_sepultamento`)
- Modify: `backend/src/lib/http.ts:48-52`
- Modify: `backend/src/routes/velorios.ts:44-53`
- Modify: `backend/src/routes/public.ts:73-77`
- Test: `backend/test/velorios-familiares.test.ts`

**Interfaces:**
- Produces: coluna `velorios.familiares` (TEXT NULL); `POST /velorios` e `PATCH /velorios/:id` aceitam
  `familiares: string | null`; respostas autenticadas de velório incluem `familiares`; públicas não.

- [ ] **Step 1: Add the column to the schema and to the dev/test databases**

Em `backend/prisma/schema.prisma`, no `model velorios`, depois da linha `google_maps_url_sepultamento String?`:

```prisma
  familiares                   String?
```

Conferir que o diff contra o banco de teste é só esta coluna, e aplicar em `campax_test` e `campax_dev`
(produção fica para a Task 6):

```bash
cd /root/campax/backend
for envfile in .env.test .env.development; do
  url=$(grep -E '^DATABASE_URL=' "$envfile" | cut -d= -f2- | tr -d '"')
  DATABASE_URL="$url" npx prisma migrate diff --from-url "$url" --to-schema-datamodel prisma/schema.prisma --script
  DATABASE_URL="$url" npx prisma db push --skip-generate
done
npx prisma generate
```

Expected: cada `migrate diff` imprime só `ALTER TABLE "public"."velorios" ADD COLUMN "familiares" TEXT;`
(se imprimir qualquer outra coisa, PARAR e investigar — `db push` apagaria o que não está no schema). `db push`
termina com "Your database is now in sync with your Prisma schema".

- [ ] **Step 2: Write the failing tests**

Criar `backend/test/velorios-familiares.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { resetDb } from './helpers';
import { duasEmpresas, Fixture } from './isolamento/fixture';

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await duasEmpresas();
});
afterAll(() => prisma.$disconnect());

const patch = (id: string, body: object, user = f.A.users.operador) =>
  request(app).patch(`/velorios/${id}`).set(f.as(user)).send(body);

describe('velorios.familiares', () => {
  it('PATCH grava e devolve familiares (sem espaços nas pontas)', async () => {
    const res = await patch(f.A.velorio.id, { familiares: '  Deixa a esposa Maria e os filhos João e Ana.  ' });
    expect(res.status).toBe(200);
    expect(res.body.data.familiares).toBe('Deixa a esposa Maria e os filhos João e Ana.');
    const lista = await request(app).get('/velorios').set(f.as(f.A.users.viewer));
    expect(lista.body.data.find((v: any) => v.id === f.A.velorio.id).familiares).toBe('Deixa a esposa Maria e os filhos João e Ana.');
  });

  it('vazio ou só espaços apaga (null)', async () => {
    await patch(f.A.velorio.id, { familiares: 'Texto' });
    const res = await patch(f.A.velorio.id, { familiares: '   ' });
    expect(res.status).toBe(200);
    expect(res.body.data.familiares).toBeNull();
    expect((await patch(f.A.velorio.id, { familiares: null })).body.data.familiares).toBeNull();
  });

  it('400 caracteres passa; 401 → 400', async () => {
    expect((await patch(f.A.velorio.id, { familiares: 'a'.repeat(400) })).status).toBe(200);
    const res = await patch(f.A.velorio.id, { familiares: 'a'.repeat(401) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Familiares: máximo de 400 caracteres');
  });

  it('tipo errado → 400', async () => {
    const res = await patch(f.A.velorio.id, { familiares: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Familiares: máximo de 400 caracteres');
  });

  it('POST aceita familiares', async () => {
    const res = await request(app).post('/velorios').set(f.as(f.A.users.operador)).send({
      nome_falecido: 'Fulano', data_inicio: new Date().toISOString(),
      data_fim: new Date(Date.now() + 3600_000).toISOString(), sala_velorio_id: f.A.sala.id, familiares: 'Deixa filhos.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.familiares).toBe('Deixa filhos.');
  });

  it('respostas públicas não trazem familiares', async () => {
    await patch(f.A.velorio.id, { familiares: 'Deixa a esposa Maria.' });
    const porToken = await request(app).get(`/public/velorios/${f.A.velorio.token_acesso}`);
    expect(porToken.status).toBe(200);
    expect(porToken.body.data).not.toHaveProperty('familiares');
    const porId = await request(app).get(`/public/velorios/id/${f.A.velorio.id}`);
    expect(porId.status).toBe(200);
    expect(porId.body.data).not.toHaveProperty('familiares');
  });

  it('usuário de A não altera familiares de velório de B → 404', async () => {
    const res = await patch(f.B.velorio.id, { familiares: 'hackeado' });
    expect(res.status).toBe(404);
    expect((await prisma.velorios.findUnique({ where: { id: f.B.velorio.id } }))!.familiares).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /root/campax/backend && npx vitest run test/velorios-familiares.test.ts`
Expected: FAIL — `familiares` volta `undefined` (campo ignorado pelo `pick`), 401 caracteres passa com 200, e
as respostas públicas contêm `familiares`.

- [ ] **Step 4: Implement**

`backend/src/lib/http.ts` — acrescentar `'familiares'` no fim de `VELORIO_FIELDS`:

```ts
export const VELORIO_FIELDS = [
  'nome_falecido', 'data_inicio', 'data_fim', 'sala_velorio_id', 'status', 'responsavel_velorio_nome',
  'contato_whatsapp_responsavel', 'data_nascimento', 'data_falecimento', 'mensagem_homenagem',
  'data_sepultamento', 'local_sepultamento', 'google_maps_url_sepultamento', 'familiares',
] as const;
```

`backend/src/routes/velorios.ts` — logo depois de `DATE_ONLY_FIELDS`, acrescentar a classe de erro e a
normalização, e chamar em `velorioFields`:

```ts
export const FAMILIARES_MAX = 400;
const MSG_FAMILIARES = `Familiares: máximo de ${FAMILIARES_MAX} caracteres`;

class CampoInvalidoError extends Error {}

// Free text for the death notice ("Deixa a esposa…"). Blank means "remove it".
function normalizarFamiliares(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') throw new CampoInvalidoError(MSG_FAMILIARES);
  const texto = value.trim();
  if (texto.length > FAMILIARES_MAX) throw new CampoInvalidoError(MSG_FAMILIARES);
  return texto || null;
}

function velorioFields(body: unknown) {
  // token_acesso, created_by, foto_falecido and empresa_id never come from the client.
  const fields = pick(body, VELORIO_FIELDS);
  for (const field of DATE_ONLY_FIELDS) {
    const value = fields[field];
    if (value === '') fields[field] = null;
    else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) fields[field] = new Date(`${value}T00:00:00.000Z`);
  }
  if ('familiares' in fields) fields.familiares = normalizarFamiliares(fields.familiares);
  return fields;
}
```

Nas rotas `POST /` e `PATCH /:id`, tratar o erro antes do `handleError` (o `catch` de cada uma):

```ts
  } catch (error) {
    if (error instanceof CampoInvalidoError) return res.status(400).json({ success: false, error: error.message });
    handleError(res, error, SALA_INVALIDA);
  }
```

`backend/src/routes/public.ts` — em `sendPublicVelorio`, tirar `familiares` antes de responder:

```ts
function sendPublicVelorio(res: Response, velorio: PublicVelorio | null) {
  const empresa = velorio ? publicEmpresa(velorio.empresa) : null;
  if (!velorio || !empresa) return notFound(res);
  // familiares is for the death notice the family chooses to share, not for the public page.
  const { familiares: _familiares, ...publico } = velorio;
  res.json({ success: true, data: { ...publico, empresa, sala: withStreamUrls(velorio) } });
}
```

- [ ] **Step 5: Run the new tests and the whole backend suite**

Run: `cd /root/campax/backend && npx vitest run test/velorios-familiares.test.ts && npm test`
Expected: PASS — 7 testes novos; suíte completa verde (hoje 247 + 7).

- [ ] **Step 6: Commit**

```bash
cd /root/campax
git add backend/prisma/schema.prisma backend/src/lib/http.ts backend/src/routes/velorios.ts backend/src/routes/public.ts backend/test/velorios-familiares.test.ts
git commit -m "feat(velorios): campo familiares para a nota de falecimento"
```

---

### Task 2: Vitest no frontend + funções puras da nota

**Files:**
- Modify: `package.json` (devDependency `vitest`, script `test`)
- Create: `vitest.config.ts`
- Create: `src/lib/datetimeLocal.ts`
- Modify: `src/pages/VelorioManagement.tsx:236-250` (remove as duas funções locais e importa de `@/lib/datetimeLocal`)
- Modify: `src/lib/hostEmpresa.ts` (exporta `BASE_DOMAIN`)
- Modify: `src/hooks/useVelorios.ts` (`familiares` em `Velorio` e `VelorioFormData`)
- Create: `src/lib/notaFalecimento.ts`
- Test: `src/lib/notaFalecimento.test.ts`

**Interfaces:**
- Produces (usados nas Tasks 4 e 5):

```ts
// src/lib/datetimeLocal.ts
export function toDatetimeLocalValue(isoString: string): string;   // ISO → "YYYY-MM-DDTHH:mm" local
export function fromDatetimeLocalValue(localValue: string): string; // "YYYY-MM-DDTHH:mm" local → ISO

// src/lib/notaFalecimento.ts
export const FAMILIARES_MAX = 400;
export const COR_PRIMARIA_PADRAO = '#d99726';
export const COR_SECUNDARIA_PADRAO = '#212c45';
export interface NotaVelorio {
  nome_falecido: string;
  foto_falecido?: string | null;
  data_nascimento?: string | null;   // "YYYY-MM-DD" or ISO of a date-only column
  data_falecimento?: string | null;
  data_inicio: string;               // ISO
  data_fim: string;                  // ISO
  data_sepultamento?: string | null; // ISO
  local_sepultamento?: string | null;
  familiares?: string | null;
  token_acesso: string;
  sala?: { nome_sala_velorio: string } | null;
}
export type NotaEmpresa = Pick<EmpresaPublica,
  'nome_exibicao' | 'slug' | 'logo_url' | 'cor_primaria' | 'cor_secundaria' | 'whatsapp_contato' | 'email_contato'>;
export interface NotaOpcoes { incluirTransmissao: boolean; baseDomain: string; hostAtual: string }
export interface NotaFalecimentoDados {
  nome: string;
  fotoUrl: string | null;
  nascimento: string | null;
  falecimento: string | null;
  velorio: { sala: string; quando: string } | null;
  sepultamento: { quando: string | null; local: string | null } | null;
  familiares: string | null;
  transmissao: { endereco: string; codigo: string } | null;
  empresa: {
    nome: string; logoUrl: string | null; contato: string | null;
    corPrimaria: string; corSecundaria: string;
    textoSobrePrimaria: string; textoSobreSecundaria: string; // CSS colors, e.g. "hsl(40 30% 95%)"
  };
}
export function montarNota(velorio: NotaVelorio, empresa: NotaEmpresa, opcoes: NotaOpcoes): NotaFalecimentoDados;
export function tamanhoNome(nome: string): number;            // px
export function tamanhoFamiliares(texto: string | null): number; // px
export function nomeArquivoNota(nome: string): string;
```

- [ ] **Step 1: Install Vitest and add the config**

```bash
cd /root/campax && npm install -D vitest@^3.2.7
```

Em `package.json`, dentro de `"scripts"`, acrescentar `"test": "vitest run"`.

Criar `vitest.config.ts` na raiz:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// Frontend unit tests: pure functions and static renders only, so the node environment is enough.
// TZ is pinned so date formatting is the same on any machine (the funerárias are in Brazil).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    env: { TZ: 'America/Sao_Paulo' },
  },
});
```

- [ ] **Step 2: Move the datetime-local helpers out of VelorioManagement**

Criar `src/lib/datetimeLocal.ts` com as duas funções que hoje estão em `src/pages/VelorioManagement.tsx`
(linhas 236-250), exportadas e com os comentários traduzidos:

```ts
// An <input type="datetime-local"> holds LOCAL time with no timezone. toISOString() would give UTC digits.
export function toDatetimeLocalValue(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The input's local value → ISO with the right offset (a bare string would be stored as if it were UTC).
export function fromDatetimeLocalValue(localValue: string): string {
  return new Date(localValue).toISOString();
}
```

Em `VelorioManagement.tsx`, apagar as duas funções locais (e seus comentários) e acrescentar
`import { fromDatetimeLocalValue, toDatetimeLocalValue } from '@/lib/datetimeLocal';` junto dos outros imports
de `@/lib`/`@/services`.

Em `src/lib/hostEmpresa.ts`, trocar `const BASE_DOMAIN =` por `export const BASE_DOMAIN =`.

Em `src/hooks/useVelorios.ts`, acrescentar `familiares?: string | null;` em `Velorio` (depois de
`google_maps_url_sepultamento`) e `familiares?: string | null;` em `VelorioFormData` (idem); em
`VelorioFormData`, trocar os tipos de `data_sepultamento` e `local_sepultamento` para `string | null` (o diálogo
da nota envia `null` para apagar).

- [ ] **Step 3: Write the failing tests**

Criar `src/lib/notaFalecimento.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  COR_PRIMARIA_PADRAO, COR_SECUNDARIA_PADRAO, montarNota, nomeArquivoNota, NotaEmpresa, NotaVelorio,
  tamanhoFamiliares, tamanhoNome,
} from './notaFalecimento';

const velorio: NotaVelorio = {
  nome_falecido: 'José da Silva',
  foto_falecido: 'https://backend.campax.com.br/files/falecido-fotos/x.jpg',
  data_nascimento: '1941-03-12T00:00:00.000Z',
  data_falecimento: '2026-09-25T00:00:00.000Z',
  data_inicio: '2026-09-26T11:00:00.000Z', // 08:00 em São Paulo (sábado)
  data_fim: '2026-09-26T19:30:00.000Z',    // 16:30
  data_sepultamento: '2026-09-26T20:00:00.000Z',
  local_sepultamento: 'Cemitério Municipal',
  familiares: 'Deixa a esposa Maria e os filhos João e Ana.',
  token_acesso: 'ABC123',
  sala: { nome_sala_velorio: 'Sala 1' },
};
const empresa: NotaEmpresa = {
  nome_exibicao: 'Senap', slug: 'senap', logo_url: 'https://backend.campax.com.br/files/logos/senap.png',
  cor_primaria: '#C9A227', cor_secundaria: '#1B2A4A', whatsapp_contato: '62999990000', email_contato: 'contato@senap.com.br',
};
const opcoes = { incluirTransmissao: false, baseDomain: 'campax.com.br', hostAtual: 'app2.campax.com.br' };

describe('montarNota', () => {
  it('monta todos os campos', () => {
    const nota = montarNota(velorio, empresa, opcoes);
    expect(nota.nome).toBe('José da Silva');
    expect(nota.fotoUrl).toBe(velorio.foto_falecido);
    expect(nota.nascimento).toBe('12/03/1941');
    expect(nota.falecimento).toBe('25/09/2026');
    expect(nota.velorio).toEqual({ sala: 'Sala 1', quando: '26/09 (sábado), das 8h às 16h30' });
    expect(nota.sepultamento).toEqual({ quando: '26/09 (sábado), às 17h', local: 'Cemitério Municipal' });
    expect(nota.familiares).toBe('Deixa a esposa Maria e os filhos João e Ana.');
    expect(nota.transmissao).toBeNull();
    expect(nota.empresa).toMatchObject({
      nome: 'Senap', logoUrl: empresa.logo_url, contato: '+55 62 99999-0000', corPrimaria: '#C9A227', corSecundaria: '#1B2A4A',
    });
    expect(nota.empresa.textoSobreSecundaria).toBe('hsl(40 30% 95%)');
  });

  it('datas só-dia não mudam de dia com o fuso', () => {
    const nota = montarNota({ ...velorio, data_nascimento: '1941-03-12', data_falecimento: '2026-09-25T00:00:00.000Z' }, empresa, opcoes);
    expect(nota.nascimento).toBe('12/03/1941');
    expect(nota.falecimento).toBe('25/09/2026');
  });

  it('velório que termina em outro dia', () => {
    const nota = montarNota({ ...velorio, data_inicio: '2026-09-26T11:00:00.000Z', data_fim: '2026-09-27T13:00:00.000Z' }, empresa, opcoes);
    expect(nota.velorio!.quando).toBe('26/09, 8h, a 27/09, 10h');
  });

  it('campos vazios viram null', () => {
    const nota = montarNota(
      { ...velorio, foto_falecido: null, data_nascimento: null, data_falecimento: '', data_sepultamento: null, local_sepultamento: '  ', familiares: '  ', sala: null },
      { ...empresa, logo_url: null, whatsapp_contato: null, email_contato: null },
      opcoes,
    );
    expect(nota).toMatchObject({ fotoUrl: null, nascimento: null, falecimento: null, sepultamento: null, familiares: null });
    expect(nota.velorio).toEqual({ sala: '', quando: '26/09 (sábado), das 8h às 16h30' });
    expect(nota.empresa.logoUrl).toBeNull();
    expect(nota.empresa.contato).toBeNull();
  });

  it('sepultamento só com local ou só com data', () => {
    expect(montarNota({ ...velorio, data_sepultamento: null }, empresa, opcoes).sepultamento).toEqual({ quando: null, local: 'Cemitério Municipal' });
    expect(montarNota({ ...velorio, local_sepultamento: null }, empresa, opcoes).sepultamento).toEqual({ quando: '26/09 (sábado), às 17h', local: null });
  });

  it('transmissão com subdomínio e sem', () => {
    expect(montarNota(velorio, empresa, { ...opcoes, incluirTransmissao: true }).transmissao).toEqual({ endereco: 'senap.campax.com.br', codigo: 'ABC123' });
    expect(montarNota(velorio, empresa, { ...opcoes, incluirTransmissao: true, baseDomain: '' }).transmissao).toEqual({ endereco: 'app2.campax.com.br', codigo: 'ABC123' });
  });

  it('cores nulas ou inválidas caem no padrão Campax', () => {
    for (const cor of [null, 'azul', '#FFF']) {
      const nota = montarNota(velorio, { ...empresa, cor_primaria: cor, cor_secundaria: cor }, opcoes);
      expect(nota.empresa.corPrimaria).toBe(COR_PRIMARIA_PADRAO);
      expect(nota.empresa.corSecundaria).toBe(COR_SECUNDARIA_PADRAO);
    }
  });

  it('contato: WhatsApp, senão e-mail', () => {
    expect(montarNota(velorio, { ...empresa, whatsapp_contato: null }, opcoes).empresa.contato).toBe('contato@senap.com.br');
  });
});

describe('tamanhos e nome do arquivo', () => {
  it('nome encolhe conforme o tamanho', () => {
    expect(tamanhoNome('José da Silva')).toBe(84);
    expect(tamanhoNome('Maria Aparecida dos Santos')).toBe(72);
    expect(tamanhoNome('Maria Aparecida dos Santos Oliveira Pereira')).toBe(52);
    expect(tamanhoNome('x'.repeat(33))).toBe(60);
  });

  it('familiares encolhe conforme o tamanho', () => {
    expect(tamanhoFamiliares(null)).toBe(32);
    expect(tamanhoFamiliares('a'.repeat(150))).toBe(32);
    expect(tamanhoFamiliares('a'.repeat(280))).toBe(28);
    expect(tamanhoFamiliares('a'.repeat(400))).toBe(24);
  });

  it('nome do arquivo sem acentos nem espaços', () => {
    expect(nomeArquivoNota('José da Silva Júnior')).toBe('nota-falecimento-jose-da-silva-junior.png');
    expect(nomeArquivoNota('  ')).toBe('nota-falecimento.png');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd /root/campax && npm test`
Expected: FAIL — `Failed to resolve import "./notaFalecimento"`.

- [ ] **Step 5: Implement `src/lib/notaFalecimento.ts`**

```ts
import { foregroundFor } from '@/lib/branding';
import { formatWhatsapp } from '@/lib/phoneMask';
import type { EmpresaPublica } from '@/types/empresa';

// Everything the death notice shows, already formatted — the templates (src/components/nota-falecimento)
// only lay it out. Pure: no DOM, no env, so it's unit-tested (notaFalecimento.test.ts).

export const FAMILIARES_MAX = 400;
/** Campax gold and navy (src/index.css --gold / --navy), for empresas without brand colors. */
export const COR_PRIMARIA_PADRAO = '#d99726';
export const COR_SECUNDARIA_PADRAO = '#212c45';

export interface NotaVelorio {
  nome_falecido: string;
  foto_falecido?: string | null;
  data_nascimento?: string | null;
  data_falecimento?: string | null;
  data_inicio: string;
  data_fim: string;
  data_sepultamento?: string | null;
  local_sepultamento?: string | null;
  familiares?: string | null;
  token_acesso: string;
  sala?: { nome_sala_velorio: string } | null;
}

export type NotaEmpresa = Pick<
  EmpresaPublica,
  'nome_exibicao' | 'slug' | 'logo_url' | 'cor_primaria' | 'cor_secundaria' | 'whatsapp_contato' | 'email_contato'
>;

export interface NotaOpcoes {
  incluirTransmissao: boolean;
  /** VITE_BASE_DOMAIN ('' = no subdomains). */
  baseDomain: string;
  /** location.host, used when there are no subdomains. */
  hostAtual: string;
}

export interface NotaFalecimentoDados {
  nome: string;
  fotoUrl: string | null;
  nascimento: string | null;
  falecimento: string | null;
  velorio: { sala: string; quando: string } | null;
  sepultamento: { quando: string | null; local: string | null } | null;
  familiares: string | null;
  transmissao: { endereco: string; codigo: string } | null;
  empresa: {
    nome: string;
    logoUrl: string | null;
    contato: string | null;
    corPrimaria: string;
    corSecundaria: string;
    textoSobrePrimaria: string;
    textoSobreSecundaria: string;
  };
}

const texto = (value: string | null | undefined) => value?.trim() || null;
const pad = (n: number) => String(n).padStart(2, '0');
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Date-only columns ("YYYY-MM-DD" or its midnight-UTC ISO): read the digits, never convert timezones. */
function dataSoDia(value: string | null | undefined): string | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

const diaMes = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const hora = (d: Date) => (d.getMinutes() ? `${d.getHours()}h${pad(d.getMinutes())}` : `${d.getHours()}h`);
const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function quandoVelorio(inicioIso: string, fimIso: string): string {
  const inicio = new Date(inicioIso);
  const fim = new Date(fimIso);
  if (mesmoDia(inicio, fim)) return `${diaMes(inicio)} (${DIAS[inicio.getDay()]}), das ${hora(inicio)} às ${hora(fim)}`;
  return `${diaMes(inicio)}, ${hora(inicio)}, a ${diaMes(fim)}, ${hora(fim)}`;
}

function quandoSepultamento(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${diaMes(d)} (${DIAS[d.getDay()]}), às ${hora(d)}`;
}

const HEX = /^#[0-9a-f]{6}$/i;
const cor = (value: string | null, padrao: string) => (value && HEX.test(value.trim()) ? value.trim() : padrao);

export function montarNota(velorio: NotaVelorio, empresa: NotaEmpresa, opcoes: NotaOpcoes): NotaFalecimentoDados {
  const sepultamentoQuando = quandoSepultamento(velorio.data_sepultamento);
  const sepultamentoLocal = texto(velorio.local_sepultamento);
  const corPrimaria = cor(empresa.cor_primaria, COR_PRIMARIA_PADRAO);
  const corSecundaria = cor(empresa.cor_secundaria, COR_SECUNDARIA_PADRAO);
  const whatsapp = texto(empresa.whatsapp_contato);

  return {
    nome: velorio.nome_falecido.trim(),
    fotoUrl: texto(velorio.foto_falecido),
    nascimento: dataSoDia(velorio.data_nascimento),
    falecimento: dataSoDia(velorio.data_falecimento),
    velorio: { sala: velorio.sala?.nome_sala_velorio ?? '', quando: quandoVelorio(velorio.data_inicio, velorio.data_fim) },
    sepultamento: sepultamentoQuando || sepultamentoLocal ? { quando: sepultamentoQuando, local: sepultamentoLocal } : null,
    familiares: texto(velorio.familiares),
    transmissao: opcoes.incluirTransmissao
      ? { endereco: opcoes.baseDomain ? `${empresa.slug}.${opcoes.baseDomain}` : opcoes.hostAtual, codigo: velorio.token_acesso }
      : null,
    empresa: {
      nome: empresa.nome_exibicao,
      logoUrl: texto(empresa.logo_url),
      contato: whatsapp ? formatWhatsapp(whatsapp) : texto(empresa.email_contato),
      corPrimaria,
      corSecundaria,
      textoSobrePrimaria: `hsl(${foregroundFor(corPrimaria)})`,
      textoSobreSecundaria: `hsl(${foregroundFor(corSecundaria)})`,
    },
  };
}

/** Font size (px) of the deceased's name, so long names still fit in two lines. */
export function tamanhoNome(nome: string): number {
  const n = nome.trim().length;
  if (n <= 18) return 84;
  if (n <= 28) return 72;
  if (n <= 36) return 60;
  return 52;
}

/** Font size (px) of the family text (up to FAMILIARES_MAX characters). */
export function tamanhoFamiliares(value: string | null): number {
  const n = value?.length ?? 0;
  if (n <= 150) return 32;
  if (n <= 280) return 28;
  return 24;
}

export function nomeArquivoNota(nome: string): string {
  const slug = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `nota-falecimento-${slug}.png` : 'nota-falecimento.png';
}
```

- [ ] **Step 6: Run tests, typecheck, lint, build**

Run: `cd /root/campax && npm test && npx tsc --noEmit -p tsconfig.app.json && npx eslint src/lib src/pages/VelorioManagement.tsx vitest.config.ts && npm run build`
Expected: testes PASS (11); `tsc` sem erros; `eslint` sem erros novos (os 2 problemas antigos de
`VelorioManagement.tsx` — `no-explicit-any` na linha ~341 e `exhaustive-deps` em `CameraManagement` — já
existiam); build OK. Se o `tsconfig.app.json` não incluir `vitest.config.ts`, tudo bem — ele é lido pelo Vitest.

- [ ] **Step 7: Commit**

```bash
cd /root/campax
git add package.json package-lock.json vitest.config.ts src/lib/datetimeLocal.ts src/lib/notaFalecimento.ts src/lib/notaFalecimento.test.ts src/lib/hostEmpresa.ts src/hooks/useVelorios.ts src/pages/VelorioManagement.tsx
git commit -m "feat(nota): Vitest no frontend e montagem dos dados da nota de falecimento"
```

---

### Task 3: Geração e compartilhamento da imagem (`html-to-image`)

**Files:**
- Modify: `package.json` (dependency `html-to-image`)
- Create: `src/lib/imagemNota.ts`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces (usados na Task 5):

```ts
export const LARGURA_NOTA = 1080;
export const ALTURA_NOTA = 1350;
export function paraDataUrl(url: string | null): Promise<string | null>; // null on any failure
export function gerarPng(node: HTMLElement): Promise<Blob>;              // throws on failure
export function podeCompartilhar(arquivo: File): boolean;
export function compartilhar(arquivo: File, titulo: string): Promise<void>;
export function baixar(blob: Blob, nomeArquivo: string): void;
export function podeCopiar(): boolean;
export function copiar(blob: Blob): Promise<void>;
```

These are browser APIs (canvas, fetch of cross-origin images, Web Share, Clipboard) with nothing to assert in
the node test environment; they are checked in the browser in Task 6.

- [ ] **Step 1: Install the dependency**

```bash
cd /root/campax && npm install html-to-image@^1.11.13
```

- [ ] **Step 2: Create `src/lib/imagemNota.ts`**

```ts
import { toBlob } from 'html-to-image';

// Turns a rendered death-notice template into a PNG and hands it to the user (share / download / copy).
// Browser-only; checked by hand (see the plan's Task 6).

export const LARGURA_NOTA = 1080;
export const ALTURA_NOTA = 1350;

/**
 * Downloads an image and returns it as a data URL, or null if it can't be read. Images from the backend
 * (/files) must be inlined before rendering: a cross-origin <img> would taint the canvas and make the
 * export fail. /files sends CORS headers for the panel's origins.
 */
export async function paraDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'no-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Renders `node` (a template at full size, 1080×1350) to a PNG. */
export async function gerarPng(node: HTMLElement): Promise<Blob> {
  await document.fonts.ready;
  await Promise.all(Array.from(node.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)));
  const blob = await toBlob(node, { width: LARGURA_NOTA, height: ALTURA_NOTA, pixelRatio: 1 });
  if (!blob) throw new Error('Não foi possível gerar a imagem');
  return blob;
}

export function podeCompartilhar(arquivo: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] });
}

export async function compartilhar(arquivo: File, titulo: string): Promise<void> {
  await navigator.share({ files: [arquivo], title: titulo });
}

export function baixar(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function podeCopiar(): boolean {
  return typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
}

export async function copiar(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd /root/campax && npx tsc --noEmit -p tsconfig.app.json && npx eslint src/lib/imagemNota.ts`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
cd /root/campax
git add package.json package-lock.json src/lib/imagemNota.ts
git commit -m "feat(nota): gerar PNG da nota e compartilhar, baixar ou copiar"
```

---

### Task 4: Os 3 modelos da nota

**Files:**
- Create: `src/components/nota-falecimento/partes.tsx`
- Create: `src/components/nota-falecimento/ModeloClassico.tsx`
- Create: `src/components/nota-falecimento/ModeloSereno.tsx`
- Create: `src/components/nota-falecimento/ModeloModerno.tsx`
- Create: `src/components/nota-falecimento/modelos.ts`
- Test: `src/components/nota-falecimento/modelos.test.tsx`

**Interfaces:**
- Consumes: `NotaFalecimentoDados`, `tamanhoNome`, `tamanhoFamiliares` (Task 2); `LARGURA_NOTA`,
  `ALTURA_NOTA` (Task 3).
- Produces (usados na Task 5):

```ts
// modelos.ts
export interface ModeloProps { dados: NotaFalecimentoDados }
export type ModeloNotaId = 'classico' | 'sereno' | 'moderno';
export interface ModeloNota { id: ModeloNotaId; nome: string; componente: (props: ModeloProps) => JSX.Element }
export const MODELOS_NOTA: ModeloNota[];
export function modeloPorId(id: string | null): ModeloNota; // unknown/null → classico
```

Todos os modelos: raiz com `width: 1080, height: 1350, overflow: 'hidden'`, estilos **inline** (o
`html-to-image` copia estilos computados; inline evita depender de classes do Tailwind), fontes
`'Playfair Display', serif` (títulos) e `Inter, sans-serif` (texto) — as duas já vêm do `@fontsource` em
`src/index.css`. Sem logo → nome da funerária em texto. Sem foto → sem a área da foto, nome maior.

- [ ] **Step 1: Write the failing tests**

Criar `src/components/nota-falecimento/modelos.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { montarNota, NotaEmpresa, NotaVelorio } from '@/lib/notaFalecimento';
import { MODELOS_NOTA, modeloPorId } from './modelos';

const velorio: NotaVelorio = {
  nome_falecido: 'José da Silva',
  foto_falecido: 'data:image/png;base64,FOTO',
  data_nascimento: '1941-03-12', data_falecimento: '2026-09-25',
  data_inicio: '2026-09-26T11:00:00.000Z', data_fim: '2026-09-26T19:00:00.000Z',
  data_sepultamento: '2026-09-26T20:00:00.000Z', local_sepultamento: 'Cemitério Municipal',
  familiares: 'Deixa a esposa Maria.', token_acesso: 'ABC123', sala: { nome_sala_velorio: 'Sala 1' },
};
const empresa: NotaEmpresa = {
  nome_exibicao: 'Funerária Senap', slug: 'senap', logo_url: 'data:image/png;base64,LOGO',
  cor_primaria: '#C9A227', cor_secundaria: '#1B2A4A', whatsapp_contato: '62999990000', email_contato: null,
};
const opcoes = { incluirTransmissao: true, baseDomain: 'campax.com.br', hostAtual: 'app2.campax.com.br' };

describe.each(MODELOS_NOTA.map((m) => [m.id, m] as const))('modelo %s', (_id, modelo) => {
  const Modelo = modelo.componente;

  it('mostra foto, logo e todos os textos', () => {
    const html = renderToStaticMarkup(<Modelo dados={montarNota(velorio, empresa, opcoes)} />);
    for (const trecho of [
      'José da Silva', '12/03/1941', '25/09/2026', 'Deixa a esposa Maria.', 'Sala 1', 'Cemitério Municipal',
      'senap.campax.com.br', 'ABC123', '+55 62 99999-0000', 'base64,FOTO', 'base64,LOGO', 'width:1080px', 'height:1350px',
    ]) expect(html).toContain(trecho);
  });

  it('sem foto e sem logo: nenhuma imagem, nome da funerária em texto, nunca a logo da Campax', () => {
    const dados = montarNota({ ...velorio, foto_falecido: null }, { ...empresa, logo_url: null }, { ...opcoes, incluirTransmissao: false });
    const html = renderToStaticMarkup(<Modelo dados={dados} />);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('logo-campax');
    expect(html).toContain('Funerária Senap');
    expect(html).not.toContain('ABC123');
  });

  it('só o obrigatório: não mostra rótulos de campos vazios', () => {
    const dados = montarNota(
      { ...velorio, foto_falecido: null, data_nascimento: null, data_falecimento: null, data_sepultamento: null, local_sepultamento: null, familiares: null },
      { ...empresa, logo_url: null, whatsapp_contato: null },
      { ...opcoes, incluirTransmissao: false },
    );
    const html = renderToStaticMarkup(<Modelo dados={dados} />);
    expect(html).toContain('Velório');
    expect(html).not.toContain('Sepultamento');
    expect(html).not.toContain('Acompanhe ao vivo');
  });
});

describe('modeloPorId', () => {
  it('conhecido, desconhecido e null', () => {
    expect(modeloPorId('sereno').id).toBe('sereno');
    expect(modeloPorId('nao-existe').id).toBe('classico');
    expect(modeloPorId(null).id).toBe('classico');
    expect(MODELOS_NOTA.map((m) => m.id)).toEqual(['classico', 'sereno', 'moderno']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /root/campax && npm test`
Expected: FAIL — `Failed to resolve import "./modelos"`.

- [ ] **Step 3: Create `partes.tsx` (pieces shared by the templates)**

```tsx
import type { CSSProperties } from 'react';
import { ALTURA_NOTA, LARGURA_NOTA } from '@/lib/imagemNota';
import { NotaFalecimentoDados, tamanhoFamiliares } from '@/lib/notaFalecimento';

// Building blocks of the death-notice templates. Inline styles only: html-to-image copies computed styles,
// and inline keeps the PNG identical to the preview.

export const SERIF = "'Playfair Display', serif";
export const SANS = 'Inter, sans-serif';

export const raiz: CSSProperties = {
  width: LARGURA_NOTA,
  height: ALTURA_NOTA,
  overflow: 'hidden',
  position: 'relative',
  boxSizing: 'border-box',
  fontFamily: SANS,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
};

/** The funerária's logo, or its name in text when it has none (never the Campax logo). */
export function LogoOuNome({ empresa, cor, altura = 110 }: { empresa: NotaFalecimentoDados['empresa']; cor: string; altura?: number }) {
  if (empresa.logoUrl) {
    return <img src={empresa.logoUrl} alt={empresa.nome} style={{ height: altura, maxWidth: 520, objectFit: 'contain' }} />;
  }
  return <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 600, color: cor, letterSpacing: 1 }}>{empresa.nome}</div>;
}

export function Chamada({ cor }: { cor: string }) {
  return (
    <div style={{ fontSize: 26, letterSpacing: 8, textTransform: 'uppercase', color: cor, fontWeight: 500 }}>
      Nota de Falecimento
    </div>
  );
}

export function Datas({ dados, cor }: { dados: NotaFalecimentoDados; cor: string }) {
  if (!dados.nascimento && !dados.falecimento) return null;
  return (
    <div style={{ display: 'flex', gap: 48, justifyContent: 'center', fontSize: 32, color: cor }}>
      {dados.nascimento && <span>✱ {dados.nascimento}</span>}
      {dados.falecimento && <span>✝ {dados.falecimento}</span>}
    </div>
  );
}

export function Familiares({ dados, cor }: { dados: NotaFalecimentoDados; cor: string }) {
  if (!dados.familiares) return null;
  return (
    <p style={{ margin: 0, fontSize: tamanhoFamiliares(dados.familiares), lineHeight: 1.4, color: cor, fontStyle: 'italic', maxWidth: 880 }}>
      {dados.familiares}
    </p>
  );
}

function Bloco({ titulo, linhas, corTitulo, corTexto }: { titulo: string; linhas: string[]; corTitulo: string; corTexto: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', color: corTitulo, fontWeight: 600 }}>{titulo}</div>
      {linhas.map((linha) => (
        <div key={linha} style={{ fontSize: 30, color: corTexto }}>{linha}</div>
      ))}
    </div>
  );
}

/** Velório, sepultamento and (optionally) the live stream, each as a titled block. */
export function Informacoes({ dados, corTitulo, corTexto }: { dados: NotaFalecimentoDados; corTitulo: string; corTexto: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {dados.velorio && (
        <Bloco titulo="Velório" linhas={[dados.velorio.sala, dados.velorio.quando].filter(Boolean)} corTitulo={corTitulo} corTexto={corTexto} />
      )}
      {dados.sepultamento && (
        <Bloco
          titulo="Sepultamento"
          linhas={[dados.sepultamento.quando, dados.sepultamento.local].filter((l): l is string => !!l)}
          corTitulo={corTitulo}
          corTexto={corTexto}
        />
      )}
      {dados.transmissao && (
        <Bloco
          titulo="Acompanhe ao vivo"
          linhas={[`${dados.transmissao.endereco} · código ${dados.transmissao.codigo}`]}
          corTitulo={corTitulo}
          corTexto={corTexto}
        />
      )}
    </div>
  );
}

export function Rodape({ dados, cor }: { dados: NotaFalecimentoDados; cor: string }) {
  if (!dados.empresa.contato) return null;
  return <div style={{ fontSize: 24, color: cor, opacity: 0.85 }}>{dados.empresa.contato}</div>;
}

/** Thin horizontal rule. */
export function Filete({ cor, largura = 160 }: { cor: string; largura?: number }) {
  return <div style={{ width: largura, height: 3, background: cor, borderRadius: 2 }} />;
}
```

- [ ] **Step 4: Create the three templates**

`src/components/nota-falecimento/ModeloClassico.tsx`:

```tsx
import { tamanhoNome } from '@/lib/notaFalecimento';
import type { ModeloProps } from './modelos';
import { Chamada, Datas, Familiares, Filete, Informacoes, LogoOuNome, raiz, Rodape, SERIF } from './partes';

/** Dark background (secondary color), accents in the primary color, round photo. */
export function ModeloClassico({ dados }: ModeloProps) {
  const { corPrimaria, corSecundaria, textoSobreSecundaria } = dados.empresa;
  const semFoto = !dados.fotoUrl;
  return (
    <div style={{ ...raiz, background: corSecundaria, color: textoSobreSecundaria, padding: '64px 90px', gap: 26, justifyContent: semFoto ? 'center' : 'flex-start' }}>
      <div style={{ position: 'absolute', inset: 28, border: `2px solid ${corPrimaria}`, borderRadius: 12, opacity: 0.6 }} />
      <LogoOuNome empresa={dados.empresa} cor={corPrimaria} />
      <Chamada cor={corPrimaria} />
      {dados.fotoUrl && (
        <img src={dados.fotoUrl} alt="" style={{ width: 340, height: 340, borderRadius: '50%', objectFit: 'cover', border: `8px solid ${corPrimaria}` }} />
      )}
      <div style={{ fontFamily: SERIF, fontSize: tamanhoNome(dados.nome) * (semFoto ? 1.2 : 1), fontWeight: 600, lineHeight: 1.1 }}>{dados.nome}</div>
      <Datas dados={dados} cor={textoSobreSecundaria} />
      <Filete cor={corPrimaria} />
      <Familiares dados={dados} cor={textoSobreSecundaria} />
      <Informacoes dados={dados} corTitulo={corPrimaria} corTexto={textoSobreSecundaria} />
      <div style={{ marginTop: 'auto' }}>
        <Rodape dados={dados} cor={textoSobreSecundaria} />
      </div>
    </div>
  );
}
```

`src/components/nota-falecimento/ModeloSereno.tsx`:

```tsx
import { tamanhoNome } from '@/lib/notaFalecimento';
import type { ModeloProps } from './modelos';
import { Chamada, Datas, Familiares, Informacoes, LogoOuNome, raiz, Rodape, SERIF } from './partes';

const FUNDO = '#FAF7F2';
const TEXTO = '#1F2937';

/** Discreet olive branches, drawn inline so the export needs no extra file. */
function Ramos({ cor, invertido = false }: { cor: string; invertido?: boolean }) {
  return (
    <svg width="360" height="60" viewBox="0 0 360 60" style={{ transform: invertido ? 'scaleY(-1)' : undefined }} aria-hidden>
      <path d="M10 30 H350" stroke={cor} strokeWidth="2" fill="none" />
      {[60, 110, 160, 200, 250, 300].map((x, i) => (
        <ellipse key={x} cx={x} cy={i % 2 ? 20 : 40} rx="16" ry="7" fill={cor} opacity="0.7" transform={`rotate(${i % 2 ? -25 : 25} ${x} ${i % 2 ? 20 : 40})`} />
      ))}
    </svg>
  );
}

/** Light background, dark text, thin-framed photo, olive branches. */
export function ModeloSereno({ dados }: ModeloProps) {
  const { corPrimaria } = dados.empresa;
  const semFoto = !dados.fotoUrl;
  return (
    <div style={{ ...raiz, background: FUNDO, color: TEXTO, padding: '56px 90px', gap: 24, justifyContent: semFoto ? 'center' : 'flex-start' }}>
      <LogoOuNome empresa={dados.empresa} cor={corPrimaria} altura={100} />
      <Ramos cor={corPrimaria} />
      <Chamada cor={corPrimaria} />
      {dados.fotoUrl && (
        <img src={dados.fotoUrl} alt="" style={{ width: 300, height: 360, objectFit: 'cover', borderRadius: 16, border: `3px solid ${corPrimaria}`, padding: 8, background: '#fff' }} />
      )}
      <div style={{ fontFamily: SERIF, fontSize: tamanhoNome(dados.nome) * (semFoto ? 1.2 : 1), fontWeight: 500, lineHeight: 1.1 }}>{dados.nome}</div>
      <Datas dados={dados} cor={TEXTO} />
      <Familiares dados={dados} cor={TEXTO} />
      <Informacoes dados={dados} corTitulo={corPrimaria} corTexto={TEXTO} />
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Ramos cor={corPrimaria} invertido />
        <Rodape dados={dados} cor={TEXTO} />
      </div>
    </div>
  );
}
```

`src/components/nota-falecimento/ModeloModerno.tsx`:

```tsx
import { tamanhoNome } from '@/lib/notaFalecimento';
import type { ModeloProps } from './modelos';
import { Chamada, Datas, Familiares, Informacoes, LogoOuNome, raiz, Rodape, SERIF } from './partes';

/** Big photo on the top half fading into the secondary color, text block below. */
export function ModeloModerno({ dados }: ModeloProps) {
  const { corPrimaria, corSecundaria, textoSobreSecundaria, textoSobrePrimaria } = dados.empresa;
  return (
    <div style={{ ...raiz, background: corSecundaria, color: textoSobreSecundaria }}>
      {dados.fotoUrl ? (
        <div style={{ position: 'relative', width: '100%', height: 560, flexShrink: 0 }}>
          <img src={dados.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, transparent 45%, ${corSecundaria} 100%)` }} />
        </div>
      ) : (
        <div style={{ width: '100%', height: 24, background: corPrimaria, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, width: '100%', boxSizing: 'border-box', padding: dados.fotoUrl ? '0 90px 56px' : '64px 90px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        {!dados.fotoUrl && <LogoOuNome empresa={dados.empresa} cor={corPrimaria} />}
        <Chamada cor={corPrimaria} />
        <div style={{ fontFamily: SERIF, fontSize: tamanhoNome(dados.nome) * (dados.fotoUrl ? 1 : 1.2), fontWeight: 700, lineHeight: 1.1 }}>{dados.nome}</div>
        <Datas dados={dados} cor={textoSobreSecundaria} />
        <Familiares dados={dados} cor={textoSobreSecundaria} />
        <Informacoes dados={dados} corTitulo={corPrimaria} corTexto={textoSobreSecundaria} />
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 24 }}>
          {dados.fotoUrl ? <LogoOuNome empresa={dados.empresa} cor={corPrimaria} altura={80} /> : <span />}
          <div style={{ padding: dados.empresa.contato ? '8px 20px' : 0, borderRadius: 999, background: dados.empresa.contato ? corPrimaria : 'transparent' }}>
            <Rodape dados={dados} cor={textoSobrePrimaria} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create the registry `modelos.ts`**

```ts
import type { NotaFalecimentoDados } from '@/lib/notaFalecimento';
import { ModeloClassico } from './ModeloClassico';
import { ModeloModerno } from './ModeloModerno';
import { ModeloSereno } from './ModeloSereno';

// The death-notice templates. A new template = one component (1080×1350, see partes.tsx) + one entry here.

export interface ModeloProps {
  dados: NotaFalecimentoDados;
}

export type ModeloNotaId = 'classico' | 'sereno' | 'moderno';

export interface ModeloNota {
  id: ModeloNotaId;
  nome: string;
  componente: (props: ModeloProps) => JSX.Element;
}

export const MODELOS_NOTA: ModeloNota[] = [
  { id: 'classico', nome: 'Clássico', componente: ModeloClassico },
  { id: 'sereno', nome: 'Sereno', componente: ModeloSereno },
  { id: 'moderno', nome: 'Moderno', componente: ModeloModerno },
];

export function modeloPorId(id: string | null): ModeloNota {
  return MODELOS_NOTA.find((m) => m.id === id) ?? MODELOS_NOTA[0];
}
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `cd /root/campax && npm test && npx tsc --noEmit -p tsconfig.app.json && npx eslint src/components/nota-falecimento`
Expected: PASS (11 da Task 2 + 10 novos); sem erros de tipo ou lint.

- [ ] **Step 7: Commit**

```bash
cd /root/campax
git add src/components/nota-falecimento
git commit -m "feat(nota): modelos Clássico, Sereno e Moderno da nota de falecimento"
```

---

### Task 5: Diálogo da nota e botão na lista de velórios

**Files:**
- Create: `src/components/nota-falecimento/NotaFalecimentoDialog.tsx`
- Modify: `src/pages/VelorioManagement.tsx` (import do ícone e do diálogo, estado `notaTarget`, botão na linha
  de ações ~869, `<NotaFalecimentoDialog>` junto dos outros diálogos)

**Interfaces:**
- Consumes: `montarNota`, `nomeArquivoNota`, `FAMILIARES_MAX`, `NotaVelorio` (Task 2);
  `toDatetimeLocalValue`, `fromDatetimeLocalValue` (Task 2); `BASE_DOMAIN` (Task 2); `paraDataUrl`, `gerarPng`,
  `podeCompartilhar`, `compartilhar`, `baixar`, `podeCopiar`, `copiar`, `LARGURA_NOTA`, `ALTURA_NOTA` (Task 3);
  `MODELOS_NOTA`, `modeloPorId`, `ModeloNotaId` (Task 4); `useVelorios().updateVelorio`, `Velorio` (existing,
  `familiares` added in Task 2); `uploadFotoFalecido` (existing); `useAuth().empresa` (existing).
- Produces: `NotaFalecimentoDialog({ velorio, open, onOpenChange })`.

There is no DOM test setup in this repo; this task is verified in the browser (Step 4 and Task 6).

- [ ] **Step 1: Create `NotaFalecimentoDialog.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Copy, Download, ImageUp, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useVelorios, Velorio } from '@/hooks/useVelorios';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '@/lib/datetimeLocal';
import { BASE_DOMAIN } from '@/lib/hostEmpresa';
import { ALTURA_NOTA, baixar, compartilhar, copiar, gerarPng, LARGURA_NOTA, paraDataUrl, podeCompartilhar, podeCopiar } from '@/lib/imagemNota';
import { FAMILIARES_MAX, montarNota, NotaFalecimentoDados, nomeArquivoNota } from '@/lib/notaFalecimento';
import { uploadFotoFalecido } from '@/services/storageService';
import { MODELOS_NOTA, modeloPorId, ModeloNotaId } from './modelos';

const CHAVE_MODELO = 'campax_nota_modelo';
const ESCALA_PREVIA = 0.3;

function modeloSalvo(): ModeloNotaId {
  try {
    return modeloPorId(localStorage.getItem(CHAVE_MODELO)).id;
  } catch {
    return 'classico';
  }
}

function salvarModelo(id: ModeloNotaId) {
  try {
    localStorage.setItem(CHAVE_MODELO, id);
  } catch {
    // no storage (private window): the choice just isn't remembered
  }
}

interface Formulario {
  nome_falecido: string;
  data_nascimento: string;
  data_falecimento: string;
  data_inicio: string;
  data_fim: string;
  data_sepultamento: string;
  local_sepultamento: string;
  familiares: string;
}

function formularioDe(v: Velorio): Formulario {
  return {
    nome_falecido: v.nome_falecido,
    data_nascimento: v.data_nascimento?.slice(0, 10) ?? '',
    data_falecimento: v.data_falecimento?.slice(0, 10) ?? '',
    data_inicio: toDatetimeLocalValue(v.data_inicio),
    data_fim: toDatetimeLocalValue(v.data_fim),
    data_sepultamento: v.data_sepultamento ? toDatetimeLocalValue(v.data_sepultamento) : '',
    local_sepultamento: v.local_sepultamento ?? '',
    familiares: v.familiares ?? '',
  };
}

interface Props {
  velorio: Velorio;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotaFalecimentoDialog({ velorio, open, onOpenChange }: Props) {
  const { empresa } = useAuth();
  const { toast } = useToast();
  const { updateVelorio } = useVelorios();
  const [form, setForm] = useState<Formulario>(() => formularioDe(velorio));
  const [modeloId, setModeloId] = useState<ModeloNotaId>(modeloSalvo);
  const [incluirTransmissao, setIncluirTransmissao] = useState(false);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreviewUrl, setFotoPreviewUrl] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [dadosExport, setDadosExport] = useState<NotaFalecimentoDados | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Each open starts from the velório as it is now.
  useEffect(() => {
    if (!open) return;
    setForm(formularioDe(velorio));
    setIncluirTransmissao(false);
    setFotoFile(null);
    setFotoPreviewUrl(null);
    setArquivo(null);
  }, [open, velorio]);

  useEffect(() => () => { if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl); }, [fotoPreviewUrl]);

  const datasValidas = !!form.data_inicio && !!form.data_fim && new Date(form.data_fim) > new Date(form.data_inicio);
  const familiaresLongo = form.familiares.trim().length > FAMILIARES_MAX;
  const podeGerar = !!empresa && !!form.nome_falecido.trim() && datasValidas && !familiaresLongo && !gerando;

  const dados = useMemo(() => {
    if (!empresa || !datasValidas) return null;
    return montarNota(
      {
        ...form,
        data_inicio: fromDatetimeLocalValue(form.data_inicio),
        data_fim: fromDatetimeLocalValue(form.data_fim),
        data_sepultamento: form.data_sepultamento ? fromDatetimeLocalValue(form.data_sepultamento) : null,
        foto_falecido: fotoPreviewUrl ?? velorio.foto_falecido,
        token_acesso: velorio.token_acesso,
        sala: velorio.sala,
      },
      empresa,
      { incluirTransmissao, baseDomain: BASE_DOMAIN, hostAtual: window.location.host },
    );
  }, [form, fotoPreviewUrl, velorio, empresa, incluirTransmissao, datasValidas]);

  const Modelo = modeloPorId(modeloId).componente;
  const set = (campo: keyof Formulario) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [campo]: e.target.value }));
    setArquivo(null);
  };

  const escolherModelo = (id: ModeloNotaId) => {
    setModeloId(id);
    salvarModelo(id);
    setArquivo(null);
  };

  const escolherFoto = (file: File | undefined) => {
    if (!file) return;
    setFotoFile(file);
    setFotoPreviewUrl(URL.createObjectURL(file));
    setArquivo(null);
  };

  const salvarEGerar = async () => {
    if (!podeGerar || !dados) return;
    setGerando(true);
    try {
      try {
        await updateVelorio.mutateAsync({
          id: velorio.id,
          data: {
            nome_falecido: form.nome_falecido.trim(),
            data_nascimento: form.data_nascimento,
            data_falecimento: form.data_falecimento,
            data_inicio: fromDatetimeLocalValue(form.data_inicio),
            data_fim: fromDatetimeLocalValue(form.data_fim),
            data_sepultamento: form.data_sepultamento ? fromDatetimeLocalValue(form.data_sepultamento) : null,
            local_sepultamento: form.local_sepultamento.trim() || null,
            familiares: form.familiares.trim() || null,
          },
        });
      } catch {
        return; // the hook's onError already shows the toast
      }

      // A new photo that fails to upload keeps the velório's current one (if any) in the notice.
      let fotoUrl = velorio.foto_falecido ?? null;
      if (fotoFile) {
        try {
          fotoUrl = await uploadFotoFalecido(velorio.id, fotoFile);
          setFotoFile(null);
        } catch (error) {
          toast({ title: 'A foto não pôde ser enviada', description: (error as Error).message, variant: 'destructive' });
        }
      }

      // Images are inlined so the canvas isn't tainted; one that can't be read is left out.
      const [foto, logo] = await Promise.all([paraDataUrl(fotoUrl), paraDataUrl(dados.empresa.logoUrl)]);
      if ((fotoUrl && !foto) || (dados.empresa.logoUrl && !logo)) {
        toast({ title: 'Uma imagem não pôde ser carregada', description: 'A nota foi gerada sem ela.' });
      }
      const paraExportar = { ...dados, fotoUrl: foto, empresa: { ...dados.empresa, logoUrl: logo } };
      flushSync(() => setDadosExport(paraExportar));
      const blob = await gerarPng(exportRef.current!.firstElementChild as HTMLElement);
      setArquivo(new File([blob], nomeArquivoNota(form.nome_falecido), { type: 'image/png' }));
    } catch {
      toast({ title: 'Não foi possível gerar a imagem', variant: 'destructive' });
    } finally {
      setGerando(false);
    }
  };

  const acaoSegura = (acao: () => Promise<void> | void, erro: string) => async () => {
    try {
      await acao();
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast({ title: erro, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nota de falecimento</DialogTitle>
          <DialogDescription>Confira os dados, escolha o modelo e gere a imagem para compartilhar.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_auto]">
          <div className="order-2 md:order-1 grid gap-4">
            <div className="flex gap-2 flex-wrap">
              {MODELOS_NOTA.map((m) => (
                <Button key={m.id} type="button" size="sm" variant={m.id === modeloId ? 'gold' : 'outline'} onClick={() => escolherModelo(m.id)}>
                  {m.nome}
                </Button>
              ))}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nota-nome">Nome do falecido *</Label>
              <Input id="nota-nome" value={form.nome_falecido} onChange={set('nome_falecido')} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nota-foto">Foto</Label>
              <Input id="nota-foto" type="file" accept="image/*" onChange={(e) => escolherFoto(e.target.files?.[0])} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="nota-nasc">Nascimento</Label><Input id="nota-nasc" type="date" value={form.data_nascimento} onChange={set('data_nascimento')} /></div>
              <div className="grid gap-2"><Label htmlFor="nota-falec">Falecimento</Label><Input id="nota-falec" type="date" value={form.data_falecimento} onChange={set('data_falecimento')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="nota-ini">Velório: início *</Label><Input id="nota-ini" type="datetime-local" value={form.data_inicio} onChange={set('data_inicio')} /></div>
              <div className="grid gap-2"><Label htmlFor="nota-fim">Velório: fim *</Label><Input id="nota-fim" type="datetime-local" value={form.data_fim} onChange={set('data_fim')} /></div>
            </div>
            {!datasValidas && <p className="text-sm text-destructive">O fim do velório precisa ser depois do início.</p>}
            <p className="text-sm text-muted-foreground">Sala: {velorio.sala?.nome_sala_velorio ?? '—'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="nota-sep">Sepultamento</Label><Input id="nota-sep" type="datetime-local" value={form.data_sepultamento} onChange={set('data_sepultamento')} /></div>
              <div className="grid gap-2"><Label htmlFor="nota-local">Local do sepultamento</Label><Input id="nota-local" value={form.local_sepultamento} onChange={set('local_sepultamento')} /></div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nota-fam">Familiares</Label>
              <Textarea id="nota-fam" rows={4} value={form.familiares} onChange={set('familiares')} placeholder="Deixa a esposa Maria, os filhos João e Ana…" />
              <span className={`text-xs text-right ${familiaresLongo ? 'text-destructive' : 'text-muted-foreground'}`}>
                {form.familiares.trim().length}/{FAMILIARES_MAX}
              </span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={incluirTransmissao} onCheckedChange={(v) => { setIncluirTransmissao(v === true); setArquivo(null); }} />
              Incluir transmissão ao vivo (endereço e código de acesso)
            </label>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="gold" disabled={!podeGerar} onClick={salvarEGerar}>
                {gerando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImageUp className="w-4 h-4 mr-2" />}
                Salvar e gerar
              </Button>
              {arquivo && podeCompartilhar(arquivo) && (
                <Button variant="outline" onClick={acaoSegura(() => compartilhar(arquivo, `Nota de falecimento — ${form.nome_falecido}`), 'Não foi possível compartilhar')}>
                  <Share2 className="w-4 h-4 mr-2" /> Compartilhar
                </Button>
              )}
              {arquivo && (
                <Button variant="outline" onClick={acaoSegura(() => baixar(arquivo, arquivo.name), 'Não foi possível baixar')}>
                  <Download className="w-4 h-4 mr-2" /> Baixar PNG
                </Button>
              )}
              {arquivo && podeCopiar() && (
                <Button variant="ghost" onClick={acaoSegura(async () => { await copiar(arquivo); toast({ title: 'Imagem copiada' }); }, 'Não foi possível copiar')}>
                  <Copy className="w-4 h-4 mr-2" /> Copiar imagem
                </Button>
              )}
            </div>
          </div>

          <div className="order-1 md:order-2 mx-auto" style={{ width: LARGURA_NOTA * ESCALA_PREVIA, height: ALTURA_NOTA * ESCALA_PREVIA }}>
            {dados && (
              <div style={{ transform: `scale(${ESCALA_PREVIA})`, transformOrigin: 'top left', boxShadow: '0 4px 24px rgba(0,0,0,.25)' }}>
                <Modelo dados={dados} />
              </div>
            )}
          </div>
        </div>

        {/* Full-size copy used only for the export: off screen, with images already inlined. The wrapper
            carries the positioning so the exported node itself has none. */}
        <div ref={exportRef} aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
          {dadosExport && <Modelo dados={dadosExport} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Se `useVelorios().updateVelorio` recusar `null` em algum campo por tipo, ajustar `VelorioFormData` (Task 2, Step
2) — não usar `as any`.

- [ ] **Step 2: Wire it into `VelorioManagement.tsx`**

1. Acrescentar `FileImage` ao import de `lucide-react` e `import { NotaFalecimentoDialog } from '@/components/nota-falecimento/NotaFalecimentoDialog';`
   (e `Velorio` ao import de `@/hooks/useVelorios`, se ainda não estiver).
2. Junto dos outros estados de diálogo (`homenagensTarget`, `presencaTarget`):
   `const [notaTarget, setNotaTarget] = useState<Velorio | null>(null);`
3. Na linha de ações, logo antes do botão de editar (`{isOperador && (<Button … onClick={() => openEditDialog(velorio)}>`):

```tsx
                      {isOperador && (
                        <Button variant="ghost" size="icon" title="Nota de falecimento" onClick={() => setNotaTarget(velorio)}>
                          <FileImage className="w-4 h-4" />
                        </Button>
                      )}
```

4. Depois do `<Dialog open={!!presencaTarget} …>…</Dialog>`:

```tsx
      {notaTarget && (
        <NotaFalecimentoDialog velorio={notaTarget} open={!!notaTarget} onOpenChange={(open) => { if (!open) setNotaTarget(null); }} />
      )}
```

- [ ] **Step 3: Typecheck, lint, tests, build**

Run: `cd /root/campax && npx tsc --noEmit -p tsconfig.app.json && npx eslint src/components/nota-falecimento src/pages/VelorioManagement.tsx && npm test && npm run build`
Expected: sem erros novos (só os 2 antigos já citados), testes PASS, build OK.

- [ ] **Step 4: Check in the browser (dev)**

```bash
cd /root/campax/backend && npm run dev   # terminal 1 (usa campax_dev, que já tem a coluna)
cd /root/campax && npm run dev           # terminal 2 → http://localhost:8080/admin
```

Entrar como operador ou acima, abrir `/admin/velorios`, clicar no ícone da nota de um velório e conferir:
formulário preenchido; trocar modelo troca a prévia; "Salvar e gerar" grava (reabrir o diálogo mostra os
familiares) e libera "Baixar PNG"; o PNG baixado abre com 1080×1350 (`file ~/Downloads/nota-falecimento-*.png`
ou propriedades da imagem), foto e logo presentes.

- [ ] **Step 5: Commit**

```bash
cd /root/campax
git add src/components/nota-falecimento/NotaFalecimentoDialog.tsx src/pages/VelorioManagement.tsx
git commit -m "feat(nota): diálogo da nota de falecimento na lista de velórios"
```

---

### Task 6: Produção, verificação manual e documentação

**Files:**
- Modify: `CLAUDE.md` (Commands → Frontend: `npm test`; Database Schema → `velorios`: `familiares`)
- Modify: `docs/superpowers/specs/2026-09-26-nota-falecimento-design.md` (seção "Notas da implementação" no fim)

- [ ] **Step 1: Backup and apply the column in production**

```bash
cd /root/campax && scripts/backup-db.sh
cd backend
url=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
DATABASE_URL="$url" npx prisma migrate diff --from-url "$url" --to-schema-datamodel prisma/schema.prisma --script
```

Expected: só `ALTER TABLE "public"."velorios" ADD COLUMN "familiares" TEXT;`. Então:

```bash
DATABASE_URL="$url" npx prisma db push --skip-generate
DATABASE_URL="$url" npx prisma migrate diff --from-url "$url" --to-schema-datamodel prisma/schema.prisma --script
```

Expected: o segundo `migrate diff` imprime uma migração vazia.

- [ ] **Step 2: Build and restart**

```bash
cd /root/campax/backend && npm run build
cd /root/campax && npm run build
pm2 restart campax-backend-velorio campax-frontend-velorio
curl -s -o /dev/null -w "%{http_code}\n" https://app2.campax.com.br/
```

Expected: `200`; `pm2 logs campax-backend-velorio --lines 5 --nostream` mostra "campax-backend rodando na porta
3013" sem erros.

- [ ] **Step 3: Manual verification in production (with the user)**

Num velório de teste (não num real em andamento), em `https://senap.campax.com.br/admin/velorios`:

| Caso | Esperado |
|------|----------|
| Clássico, Sereno, Moderno × com foto | PNG 1080×1350, foto e logo nítidas, fontes Playfair/Inter |
| Os 3 × sem foto | sem espaço vazio, nome maior |
| Empresa sem logo (outra empresa de teste, via `/platform`) | nome da funerária em texto, sem logo da Campax |
| Tudo no máximo: nome com 45 caracteres, familiares com 400, sepultamento e transmissão | nada cortado nem sobreposto |
| "Incluir transmissão" marcada | `senap.campax.com.br · código XXXXXX` |
| Celular Android e iPhone | "Compartilhar" abre o menu com o WhatsApp e a imagem |
| Computador | "Baixar PNG" baixa `nota-falecimento-<nome>.png` |
| Reabrir o diálogo | familiares e demais campos salvos; modelo lembrado |

Se algum layout transbordar no caso "tudo no máximo", reduzir as fontes/tamanhos no modelo afetado e repetir.

- [ ] **Step 4: Update docs**

`CLAUDE.md`, em "### Frontend (root)", acrescentar a linha:

```
npm test             # Vitest (pure functions and static renders; node environment)
```

e, em "Database Schema", no item **velorios**, acrescentar ``, `familiares` (free text for the death notice, ≤ 400 chars, not in public responses)``.
Em "Frontend Structure", acrescentar: ``- `src/components/nota-falecimento/` — death-notice templates (`modelos.ts` registry) and `NotaFalecimentoDialog`; data in `src/lib/notaFalecimento.ts`, PNG export in `src/lib/imagemNota.ts` ``.

No fim da spec, acrescentar `## Notas da implementação` com o que mudou em relação à spec (se algo mudou), a
data do deploy e o resultado da verificação manual.

- [ ] **Step 5: Commit**

```bash
cd /root/campax
git add CLAUDE.md docs/superpowers/specs/2026-09-26-nota-falecimento-design.md
git commit -m "docs: nota de falecimento no ar"
```
