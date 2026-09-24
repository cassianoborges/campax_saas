# Terms Acceptance (Clickwrap) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require and record clickwrap acceptance of the Termos de Uso before a public visitor enters a velório, with per-version re-acceptance and an append-only audit trail.

**Architecture:** A new `terms_acceptances` Postgres table (RLS: insert-only for `anon`/`authenticated`, select-only for `authenticated`, no update/delete policy ever) records each acceptance. The terms text and version live as a versioned markdown file bundled into the frontend; a SHA-256 hash of that text is computed client-side and stored with each acceptance. `PublicAccess.tsx`'s existing "Identificação do Visitante" step gains a required checkbox that opens the full text in a dialog; submitting inserts into `terms_acceptances` alongside the existing `velorio_visitantes` insert. A returning visitor (data cached in `localStorage`) skips the checkbox only if they already accepted the currently-active version, checked via a `SECURITY DEFINER` RPC keyed by phone number.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, Supabase (Postgres + RLS + PostgREST), shadcn/ui (`Dialog`, `Checkbox`). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-03-terms-acceptance-design.md`

## Global Constraints

- `terms_acceptances` is append-only: never write an UPDATE or DELETE policy for it, in any task, for any role, including test/verification code.
- The checkbox and terms link appear **only** on the "Identificação do Visitante" step (`step === 'visitor'`) of `src/pages/PublicAccess.tsx` — not on the token-entry step, not on the "Bem-vindo de volta" (`confirm`) step.
- A returning visitor re-does the checkbox flow only when `has_accepted_current_terms(celular, CURRENT_TERMS_VERSION)` returns `false` — identity is the phone number (`celular`), not email (email is optional).
- No email is sent as part of this plan (explicitly deferred).
- No new npm dependency is introduced (markdown is rendered as preformatted text; hashing uses the browser's built-in Web Crypto API).
- Reuse `getUserAgent()` / `getClientIP()` from `src/services/accessLogsService.ts` as-is; do not modify them.
- The project has no automated test runner (`npm run` has no `test` script, no vitest/jest config exists). Verification per task uses `npm run build` (TypeScript compile), `npm run lint`, targeted Node scripts run with plain `node`, and — for the final task — manual browser verification via the `run` skill. Do not add a test framework as part of this plan.
- The live Supabase project (`mzqthywvdavavviqbolm`) is not reachable through the Supabase MCP connector (a known account/project mismatch — see project memory). Do not attempt to use `mcp__claude_ai_Supabase__*` tools for this project; use the Supabase Studio SQL Editor (manual, human-run) for schema changes and `@supabase/supabase-js` with local `.env`/`.env.camera-status-api` credentials (already an installed dependency) for verification scripts.

---

### Task 1: Terms content, version config, and hash utility

**Files:**
- Create: `src/content/termos-de-uso-v1.0.md`
- Delete: `TERMOUSO.MD` (repo root)
- Create: `src/config/terms.ts`
- Create: `src/lib/hash.ts`

**Interfaces:**
- Produces: `CURRENT_TERMS_VERSION: string` and `CURRENT_TERMS_TEXT: string` from `src/config/terms.ts`, consumed by Task 3 (`termsAcceptanceService.ts`) and Task 5 (`TermsDialog.tsx`).
- Produces: `sha256Hex(text: string): Promise<string>` from `src/lib/hash.ts`, consumed by Task 3.

- [ ] **Step 1: Create the versioned terms content file**

Create `src/content/termos-de-uso-v1.0.md` with this exact content (this is `TERMOUSO.MD`'s content with the truncated title on the old line 2 fixed):

```markdown
# Termos de Uso e Política de Privacidade de Imagem

**Plataforma Campax — Transmissão ao Vivo de Cerimônias Fúnebres**
Versão 1.0 · Vigência a partir de [DATA]

---

Ao criar sua conta e acessar a plataforma Campax, você declara que leu, compreendeu e concorda integralmente com os presentes Termos de Uso e Política de Privacidade de Imagem. Caso não concorde com qualquer das condições aqui estabelecidas, não utilize o serviço.

---

## 1. O que é a Campax

A Campax é uma plataforma B2B de transmissão ao vivo de cerimônias fúnebres, desenvolvida para que funerárias e cemitérios possam oferecer às famílias a possibilidade de acompanhar velórios à distância, com segurança, privacidade e dignidade.

O acesso às transmissões é restrito e privado, concedido exclusivamente a pessoas autorizadas pela família do(a) falecido(a) por meio de um código de acesso (token) de 6 (seis) dígitos.

---

## 2. Uso Permitido

Ao acessar uma transmissão na plataforma Campax, você está autorizado exclusivamente a:

- Assistir à cerimônia fúnebre ao vivo em tempo real, durante o período em que a transmissão estiver ativa;
- Enviar mensagens de condolências por meio dos recursos disponíveis na plataforma;
- Registrar sua presença virtual no Livro de Presença Digital, quando disponível;
- Acessar a gravação da cerimônia pelo tempo determinado pela funerária responsável, quando esse recurso for habilitado.

---

## 3. Restrições e Proibições

> ⚠️ **As ações descritas abaixo são estritamente proibidas e constituem violação destes Termos, podendo gerar responsabilidade civil e criminal.**

É expressamente **PROIBIDO** ao usuário:

### 3.1 Compartilhamento não autorizado
- Compartilhar o link de acesso, o código token ou qualquer credencial de acesso com pessoas não autorizadas pela família do(a) falecido(a);
- Divulgar ou transmitir o endereço da cerimônia virtual em grupos de mensagens, redes sociais ou qualquer outro canal público ou privado sem autorização expressa da funerária responsável.

### 3.2 Gravação e captura de imagem
- Gravar, capturar, fotografar ou reproduzir, por qualquer meio, as imagens transmitidas durante a cerimônia fúnebre;
- Realizar capturas de tela (print screen / screenshot) de qualquer parte da transmissão;
- Utilizar aplicativos, softwares ou dispositivos externos para registrar o conteúdo da transmissão;
- Retransmitir ou replicar, ao vivo ou de forma gravada, o conteúdo da cerimônia em qualquer plataforma ou canal.

### 3.3 Publicação e compartilhamento de imagens
- Publicar, postar, compartilhar ou distribuir imagens, vídeos, áudios ou prints da cerimônia em redes sociais (Instagram, Facebook, TikTok, X/Twitter, WhatsApp, Telegram, YouTube ou similares);
- Enviar imagens ou gravações da cerimônia para terceiros por qualquer meio de comunicação;
- Utilizar qualquer imagem ou trecho da transmissão em conteúdos pessoais, profissionais, publicitários ou comerciais.

### 3.4 Uso indevido das imagens
- Usar, editar, manipular ou associar as imagens do(a) falecido(a) ou de qualquer participante da cerimônia a qualquer tipo de conteúdo — inclusive para fins humorísticos, satíricos ou jornalísticos — sem autorização escrita dos herdeiros legais;
- Usar as imagens captadas para fins comerciais ou econômicos de qualquer natureza.

---

## 4. Natureza Privada e Sigilosa da Transmissão

A transmissão à qual você tem acesso é um conteúdo **estritamente privado**, cedido em caráter exclusivo e pessoal a você pela funerária responsável pela cerimônia, mediante autorização da família do(a) falecido(a).

As imagens de pessoas falecidas e de seus familiares são protegidas pelos seguintes dispositivos legais:

- **Constituição Federal de 1988, art. 5º, inciso X** — que declara invioláveis a intimidade, a vida privada, a honra e a imagem das pessoas;
- **Código Civil (Lei 10.406/2002), art. 20** — que proíbe a divulgação ou publicação de imagem de pessoa sem sua autorização, salvo as exceções legais previstas;
- **Código Civil, art. 12, parágrafo único** — que confere aos herdeiros do(a) falecido(a) legitimidade para defender seus direitos de personalidade, incluindo a imagem;
- **Lei Geral de Proteção de Dados — LGPD (Lei 13.709/2018), arts. 6º, 7º e 11** — que regulamenta o tratamento de dados pessoais, incluindo imagem, exigindo consentimento e finalidade legítima;
- **Marco Civil da Internet (Lei 12.965/2014), art. 21** — que responsabiliza diretamente quem divulga, sem autorização, imagens privadas de terceiros obtidas por meios digitais;
- **Súmula 403 do Superior Tribunal de Justiça (STJ)** — que estabelece que o uso não autorizado de imagem de pessoa gera dever de indenizar, **independentemente de comprovação de prejuízo**.

---

## 5. Responsabilidade do Usuário

O usuário que violar qualquer das proibições previstas na Cláusula 3 destes Termos será responsabilizado, nos termos da lei, por:

- **Indenização por danos morais e materiais** aos herdeiros do(a) falecido(a) ou a qualquer pessoa cujas imagens tenham sido indevidamente utilizadas;
- **Responsabilidade civil** por uso não autorizado de imagem, nos termos do art. 20 do Código Civil e da Súmula 403 do STJ;
- **Responsabilidade administrativa** perante a Autoridade Nacional de Proteção de Dados — ANPD — por violação à LGPD;
- **Responsabilidade criminal**, quando o uso indevido configurar crime contra a honra (arts. 138 a 140 do Código Penal), crime de violação de privacidade (art. 154-A do CP) ou outros tipos penais aplicáveis.

A Campax se reserva o direito de suspender ou encerrar imediatamente o acesso do usuário ao serviço, sem aviso prévio, diante de qualquer suspeita ou confirmação de uso indevido das imagens.

---

## 6. Privacidade e Tratamento de Dados

A Campax trata os dados pessoais dos usuários em conformidade com a **Lei Geral de Proteção de Dados (Lei 13.709/2018)**, observando os seguintes princípios:

- **Finalidade:** os dados coletados são utilizados exclusivamente para viabilizar o acesso à transmissão e garantir a segurança e a privacidade da cerimônia;
- **Necessidade:** coletamos apenas os dados estritamente necessários para o funcionamento do serviço;
- **Segurança:** adotamos medidas técnicas e administrativas aptas a proteger os dados pessoais contra acesso não autorizado, vazamentos ou incidentes de segurança;
- **Transparência:** você pode solicitar informações sobre os dados que tratamos a qualquer momento pelo e-mail **contato@campax.com.br**.

Os dados de acesso (nome, e-mail, token utilizado e logs de conexão) são armazenados de forma segura pelo prazo necessário ao cumprimento das finalidades descritas e às obrigações legais aplicáveis.

A Campax **não compartilha, vende ou cede** dados pessoais de usuários a terceiros, salvo por determinação judicial ou regulatória.

---

## 7. Propriedade Intelectual

Todo o conteúdo da plataforma Campax — incluindo sua interface, marca, logotipo, código-fonte e tecnologias empregadas — é de propriedade exclusiva da Campax e está protegido pela **Lei de Propriedade Intelectual (Lei 9.279/1996)** e pela **Lei de Direitos Autorais (Lei 9.610/1998)**.

A transmissão ao vivo à qual o usuário tem acesso é um conteúdo privado produzido pela funerária responsável, e todos os direitos relativos às imagens são reservados à família do(a) falecido(a) e seus herdeiros legais.

---

## 8. Alterações nos Termos

A Campax reserva-se o direito de atualizar estes Termos de Uso a qualquer momento. Alterações relevantes serão comunicadas ao usuário por e-mail ou por notificação dentro do aplicativo. O uso continuado da plataforma após a publicação das alterações implica a aceitação dos novos termos.

---

## 9. Contato e Suporte

Em caso de dúvidas sobre estes Termos, violações identificadas ou solicitações relacionadas aos seus dados pessoais, entre em contato:

- **E-mail:** contato@campax.com.br
- **WhatsApp:** (62) 98258-3216
- **Site:** campax.com.br

---

## 10. Foro e Legislação Aplicável

Estes Termos são regidos pela legislação brasileira. Fica eleito o foro da Comarca de [Cidade/Estado] para dirimir quaisquer litígios decorrentes de sua aplicação, com renúncia expressa a qualquer outro.

---

**Ao clicar em "Li e Aceito os Termos", você confirma que leu, compreendeu e concorda integralmente com todas as cláusulas acima.**

> Este documento é um modelo orientativo. Recomenda-se revisão por advogado habilitado antes do uso definitivo.

---

*© 2024 CAMPAX. Todos os direitos reservados.*
```

- [ ] **Step 2: Remove the old root-level file**

```bash
rm /root/campax/TERMOUSO.MD
```

- [ ] **Step 3: Create the hash utility**

Create `src/lib/hash.ts`:

```ts
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 4: Verify the hash utility against a known test vector**

`sha256Hex` uses the same Web Crypto API (`crypto.subtle`) in both the browser and Node 20+, so it can be verified directly with `node`:

Run:
```bash
node -e "crypto.subtle.digest('SHA-256', new TextEncoder().encode('abc')).then(buf => console.log(Buffer.from(buf).toString('hex')))"
```
Expected output: `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad` (the well-known SHA-256 of the string `"abc"`). This confirms the exact digest/encoding approach `sha256Hex` implements is correct.

- [ ] **Step 5: Create the terms version config**

Create `src/config/terms.ts`:

```ts
import termsTextV1_0 from '@/content/termos-de-uso-v1.0.md?raw';

export const CURRENT_TERMS_VERSION = '1.0';
export const CURRENT_TERMS_TEXT = termsTextV1_0;
```

- [ ] **Step 6: Verify the project builds with the new files**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors (confirms the `?raw` import and `crypto.subtle` typing resolve correctly under the project's `vite/client` types).

- [ ] **Step 7: Commit**

```bash
git add src/content/termos-de-uso-v1.0.md src/config/terms.ts src/lib/hash.ts
git rm TERMOUSO.MD
git commit -m "$(cat <<'EOF'
feat: add versioned terms content and hash utility

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HhaTPj9yPTBp8SMvQ5Jf1Y
EOF
)"
```

---

### Task 2: `terms_acceptances` database migration

**Files:**
- Create: `supabase/migrations/020_add_terms_acceptances.sql`

**Interfaces:**
- Produces: table `terms_acceptances` (columns: `id`, `velorio_id`, `nome`, `celular`, `email`, `terms_version`, `document_hash`, `accepted_at`, `ip_address`, `user_agent`) and RPC function `has_accepted_current_terms(p_celular TEXT, p_terms_version TEXT) RETURNS BOOLEAN`, both consumed by Task 3 (`termsAcceptanceService.ts`).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/020_add_terms_acceptances.sql`:

```sql
-- ============================================
-- ETERNAL STREAMS - TERMS ACCEPTANCE
-- Migration: 020_add_terms_acceptances
-- Description: Registro de aceite dos Termos de Uso (clickwrap), append-only
-- ============================================

CREATE TABLE IF NOT EXISTS terms_acceptances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    velorio_id UUID REFERENCES velorios(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    celular TEXT NOT NULL,
    email TEXT,
    terms_version TEXT NOT NULL,
    document_hash TEXT NOT NULL,
    accepted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    ip_address TEXT,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_celular ON terms_acceptances(celular);
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_accepted_at ON terms_acceptances(accepted_at DESC);

ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;

-- Append-only: apenas policies de INSERT e SELECT existem para esta tabela.
-- Nunca adicionar policy de UPDATE ou DELETE — RLS nega por padrão na
-- ausência de policy, então isso é o que garante o registro imutável.
CREATE POLICY "Public can record terms acceptance"
    ON terms_acceptances FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can view terms acceptances"
    ON terms_acceptances FOR SELECT
    TO authenticated
    USING (true);

-- Função SECURITY DEFINER: permite checar se um celular já aceitou a versão
-- vigente sem expor o histórico completo de aceites a usuários anônimos
-- (mesmo padrão de get_velorio_visitante_nomes em
-- 009_add_visitantes_public_function.sql).
CREATE OR REPLACE FUNCTION has_accepted_current_terms(p_celular TEXT, p_terms_version TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM terms_acceptances
    WHERE celular = p_celular AND terms_version = p_terms_version
  );
$$;

GRANT EXECUTE ON FUNCTION has_accepted_current_terms(TEXT, TEXT) TO anon, authenticated;
```

- [ ] **Step 2: Apply the migration to the live database (manual, human action required)**

This project has no Supabase CLI installed locally (`supabase` command not found) and the live project (`mzqthywvdavavviqbolm`) is not visible through the Supabase MCP connector — this is a known mismatch (see project memory `campax-infra-layout`), not something to work around by guessing at a different project. Applying schema changes to the live database is also the kind of shared-infrastructure change that needs a human's direct action, not an automated one.

Ask the user (Cassiano) to:
1. Open the Supabase Studio SQL Editor for project `mzqthywvdavavviqbolm`.
2. Paste the full contents of `supabase/migrations/020_add_terms_acceptances.sql`.
3. Run it.
4. Confirm back that it ran without errors.

Do not proceed to Step 3 until this is confirmed.

- [ ] **Step 3: Write and run a verification script against the live database**

This script exercises the table and RPC exactly as the frontend will, using the same public (`anon`) credentials the frontend uses, plus the service-role key (already used elsewhere in this repo, e.g. `camera-status-api.cjs`) only to *read back* and confirm state — never to delete from `terms_acceptances`, per the append-only constraint.

Create `/tmp/claude-0/-root-campax/93a5d508-8ec5-4271-a6a8-144cd626a032/scratchpad/verify-terms-migration.mjs`:

```js
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: '/root/campax/.env.camera-status-api' });

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

const anonClient = createClient(url, anonKey);
const adminClient = createClient(url, serviceKey);

const TEST_CELULAR = 'TESTE-MIGRATION-VERIFY-020';
const TEST_VERSION = '1.0';

async function main() {
  // 1. Unknown celular has not accepted current terms.
  const before = await anonClient.rpc('has_accepted_current_terms', {
    p_celular: TEST_CELULAR,
    p_terms_version: TEST_VERSION,
  });
  console.log('before insert, has_accepted_current_terms:', before.data, before.error?.message);
  if (before.error) throw before.error;
  if (before.data !== false) throw new Error('Expected false before any acceptance is recorded');

  // 2. anon can INSERT an acceptance (what the frontend does).
  const insert = await anonClient.from('terms_acceptances').insert({
    nome: 'Teste Verificação Migration',
    celular: TEST_CELULAR,
    email: null,
    terms_version: TEST_VERSION,
    document_hash: '0'.repeat(64),
    ip_address: null,
    user_agent: 'verify-terms-migration.mjs',
  });
  console.log('anon insert error (expect null):', insert.error?.message ?? null);
  if (insert.error) throw insert.error;

  // 3. Now has_accepted_current_terms is true for this celular+version.
  const after = await anonClient.rpc('has_accepted_current_terms', {
    p_celular: TEST_CELULAR,
    p_terms_version: TEST_VERSION,
  });
  console.log('after insert, has_accepted_current_terms:', after.data, after.error?.message);
  if (after.error) throw after.error;
  if (after.data !== true) throw new Error('Expected true after acceptance is recorded');

  // 4. anon cannot SELECT from terms_acceptances (only authenticated can).
  const anonSelect = await anonClient.from('terms_acceptances').select('id').eq('celular', TEST_CELULAR);
  console.log('anon select rows (expect 0, RLS blocks anon SELECT):', anonSelect.data?.length, anonSelect.error?.message ?? null);
  if ((anonSelect.data?.length ?? 0) !== 0) throw new Error('anon should not be able to SELECT from terms_acceptances');

  // 5. Confirm via the admin client (bypasses RLS) that the row really exists
  //    and no UPDATE/DELETE policy exists to remove it.
  const adminSelect = await adminClient.from('terms_acceptances').select('*').eq('celular', TEST_CELULAR);
  console.log('admin select rows (expect 1):', adminSelect.data?.length, adminSelect.error?.message ?? null);
  if ((adminSelect.data?.length ?? 0) !== 1) throw new Error('Expected exactly 1 row for the test celular');

  console.log('OK: terms_acceptances table and has_accepted_current_terms behave as designed.');
  console.log(`NOTE: a test row with celular="${TEST_CELULAR}" remains in terms_acceptances by design`);
  console.log('(this table is append-only — no DELETE is issued, even for test data).');
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
```

Run:
```bash
cd /root/campax && node /tmp/claude-0/-root-campax/93a5d508-8ec5-4271-a6a8-144cd626a032/scratchpad/verify-terms-migration.mjs
```
Expected: all five checks print the "expect" values noted in the comments, ending in `OK: terms_acceptances table and has_accepted_current_terms behave as designed.` If any check fails, the script throws and exits non-zero — stop and investigate the migration (most likely an RLS policy or the RPC's `SECURITY DEFINER`/`search_path` before re-running).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/020_add_terms_acceptances.sql
git commit -m "$(cat <<'EOF'
feat: add terms_acceptances table and has_accepted_current_terms RPC

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HhaTPj9yPTBp8SMvQ5Jf1Y
EOF
)"
```

---

### Task 3: `termsAcceptanceService.ts`

**Files:**
- Create: `src/services/termsAcceptanceService.ts`

**Interfaces:**
- Consumes: `CURRENT_TERMS_VERSION: string`, `CURRENT_TERMS_TEXT: string` (from Task 1's `src/config/terms.ts`); `sha256Hex(text: string): Promise<string>` (from Task 1's `src/lib/hash.ts`); table `terms_acceptances` and RPC `has_accepted_current_terms` (from Task 2's migration); `supabase` client from `@/integrations/supabase/client`.
- Produces: `hasAcceptedCurrentTerms(celular: string): Promise<boolean>` and `recordTermsAcceptance(input: RecordTermsAcceptanceInput): Promise<void>` with
  ```ts
  export interface RecordTermsAcceptanceInput {
    velorio_id: string;
    nome: string;
    celular: string;
    email?: string;
    ip_address?: string;
    user_agent?: string;
  }
  ```
  Consumed directly (imperative call) by Task 6 (`PublicAccess.tsx`, `handleAccess`) for `hasAcceptedCurrentTerms`, and by Task 4 (`useTermsAcceptance.ts`) for `recordTermsAcceptance`.

- [ ] **Step 1: Create the service file**

Create `src/services/termsAcceptanceService.ts`:

```ts
import { supabase } from '@/integrations/supabase/client';
import { CURRENT_TERMS_VERSION, CURRENT_TERMS_TEXT } from '@/config/terms';
import { sha256Hex } from '@/lib/hash';

export interface RecordTermsAcceptanceInput {
    velorio_id: string;
    nome: string;
    celular: string;
    email?: string;
    ip_address?: string;
    user_agent?: string;
}

/**
 * Log de Aceite de Termos de Uso — Campax
 *
 * Este registro serve como prova jurídica do consentimento do usuário, nos
 * termos do Código Civil (art. 107), do Marco Civil da Internet (art. 7º) e
 * da LGPD (art. 8º). A tabela terms_acceptances é append-only: esta camada
 * de serviço nunca deve ganhar uma função de update ou delete.
 */

export async function hasAcceptedCurrentTerms(celular: string): Promise<boolean> {
    const { data, error } = await (supabase as any).rpc('has_accepted_current_terms', {
        p_celular: celular.trim(),
        p_terms_version: CURRENT_TERMS_VERSION,
    });

    if (error) throw error;
    return Boolean(data);
}

export async function recordTermsAcceptance(input: RecordTermsAcceptanceInput): Promise<void> {
    const documentHash = await sha256Hex(CURRENT_TERMS_TEXT);

    const { error } = await (supabase as any).from('terms_acceptances').insert({
        velorio_id: input.velorio_id,
        nome: input.nome.trim(),
        celular: input.celular.trim(),
        email: input.email?.trim() || null,
        terms_version: CURRENT_TERMS_VERSION,
        document_hash: documentHash,
        ip_address: input.ip_address ?? null,
        user_agent: input.user_agent ?? null,
    });

    if (error) throw error;
}
```

- [ ] **Step 2: Verify the project builds and lints**

Run: `npm run build && npm run lint`
Expected: both succeed with no errors — confirms the types line up with `RecordTermsAcceptanceInput` and the `(supabase as any)` cast (the same pattern already used in `src/services/accessLogsService.ts` and `useVisitantesPublic` for tables/RPCs absent from the generated `Database` types) compiles cleanly.

- [ ] **Step 3: Verify against the live database**

Re-run the verification script from Task 2 Step 3 — it already exercises `has_accepted_current_terms` and an insert shaped exactly like `recordTermsAcceptance`'s payload, which is the real behavior this service wraps:

```bash
cd /root/campax && node /tmp/claude-0/-root-campax/93a5d508-8ec5-4271-a6a8-144cd626a032/scratchpad/verify-terms-migration.mjs
```
Expected: same output as before — `OK: terms_acceptances table and has_accepted_current_terms behave as designed.` (A second run will insert one more harmless test row for the same fake `celular`; that's fine and expected given the append-only design.)

- [ ] **Step 4: Commit**

```bash
git add src/services/termsAcceptanceService.ts
git commit -m "$(cat <<'EOF'
feat: add termsAcceptanceService for recording clickwrap acceptance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HhaTPj9yPTBp8SMvQ5Jf1Y
EOF
)"
```

---

### Task 4: `useTermsAcceptance` hook

**Files:**
- Create: `src/hooks/useTermsAcceptance.ts`

**Interfaces:**
- Consumes: `recordTermsAcceptance(input: RecordTermsAcceptanceInput): Promise<void>` and `RecordTermsAcceptanceInput` from Task 3's `src/services/termsAcceptanceService.ts`.
- Produces: `useRecordTermsAcceptance()` returning a TanStack Query `UseMutationResult` whose `mutateAsync` takes `RecordTermsAcceptanceInput` and resolves `void`, and whose `isPending: boolean` reflects in-flight state. Consumed by Task 6 (`PublicAccess.tsx`).

- [ ] **Step 1: Create the hook file**

Create `src/hooks/useTermsAcceptance.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import { recordTermsAcceptance, RecordTermsAcceptanceInput } from '@/services/termsAcceptanceService';

export function useRecordTermsAcceptance() {
    return useMutation({
        mutationFn: (input: RecordTermsAcceptanceInput) => recordTermsAcceptance(input),
    });
}
```

This mirrors `useRegisterVisitante()` in `src/hooks/useVisitantes.ts:14-18`, the existing convention for a plain create-mutation hook in this codebase.

- [ ] **Step 2: Verify the project builds and lints**

Run: `npm run build && npm run lint`
Expected: both succeed — confirms `useMutation`'s generic inference matches `RecordTermsAcceptanceInput` with no explicit type arguments needed (same as `useRegisterVisitante`).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTermsAcceptance.ts
git commit -m "$(cat <<'EOF'
feat: add useRecordTermsAcceptance mutation hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HhaTPj9yPTBp8SMvQ5Jf1Y
EOF
)"
```

---

### Task 5: `TermsDialog` component

**Files:**
- Create: `src/components/TermsDialog.tsx`

**Interfaces:**
- Consumes: `CURRENT_TERMS_TEXT: string` from Task 1's `src/config/terms.ts`; `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogTrigger` from `@/components/ui/dialog`.
- Produces: `TermsDialog({ trigger: React.ReactNode })` React component. Consumed by Task 6 (`PublicAccess.tsx`).

- [ ] **Step 1: Create the component**

Create `src/components/TermsDialog.tsx`:

```tsx
import { ReactNode } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { CURRENT_TERMS_TEXT } from '@/config/terms';

interface TermsDialogProps {
    trigger: ReactNode;
}

export function TermsDialog({ trigger }: TermsDialogProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Termos de Uso e Política de Privacidade de Imagem</DialogTitle>
                </DialogHeader>
                <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">
                    {CURRENT_TERMS_TEXT}
                </pre>
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 2: Verify the project builds and lints**

Run: `npm run build && npm run lint`
Expected: both succeed with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TermsDialog.tsx
git commit -m "$(cat <<'EOF'
feat: add TermsDialog component to display full terms text

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HhaTPj9yPTBp8SMvQ5Jf1Y
EOF
)"
```

---

### Task 6: Wire the checkbox and gate into `PublicAccess.tsx`

**Files:**
- Modify: `src/pages/PublicAccess.tsx`

**Interfaces:**
- Consumes: `hasAcceptedCurrentTerms(celular: string): Promise<boolean>` (Task 3); `useRecordTermsAcceptance()` (Task 4); `TermsDialog` (Task 5); `Checkbox` from `@/components/ui/checkbox` (already installed, unused so far in this file).

- [ ] **Step 1: Add imports**

In `src/pages/PublicAccess.tsx`, add to the import block (after the existing `useRegisterVisitante` import at line 12):

```ts
import { hasAcceptedCurrentTerms } from '@/services/termsAcceptanceService';
import { useRecordTermsAcceptance } from '@/hooks/useTermsAcceptance';
import { Checkbox } from '@/components/ui/checkbox';
import { TermsDialog } from '@/components/TermsDialog';
```

- [ ] **Step 2: Add `termsAccepted` state and the mutation hook**

Replace:
```ts
  const { mutateAsync: registerVisitante, isPending: isRegistering } = useRegisterVisitante();
```
with:
```ts
  const { mutateAsync: registerVisitante, isPending: isRegistering } = useRegisterVisitante();
  const { mutateAsync: recordTermsAcceptance, isPending: isRecordingTerms } = useRecordTermsAcceptance();
  const [termsAccepted, setTermsAccepted] = useState(false);
```

- [ ] **Step 3: Route returning visitors through the re-acceptance check**

Replace this block inside `handleAccess`:
```ts
      const saved = getSavedVisitor();
      if (saved) {
        setNome(saved.nome);
        setCelular(saved.celular);
        setEmail(saved.email);
        setStep('confirm');
      } else {
        setStep('visitor');
      }
```
with:
```ts
      const saved = getSavedVisitor();
      if (saved) {
        setNome(saved.nome);
        setCelular(saved.celular);
        setEmail(saved.email);
        const accepted = await hasAcceptedCurrentTerms(saved.celular);
        setStep(accepted ? 'confirm' : 'visitor');
      } else {
        setStep('visitor');
      }
```
This stays inside `handleAccess`'s existing `try`/`catch`, so a failure here surfaces through the same generic error toast the function already has.

- [ ] **Step 4: Gate `handleRegisterVisitor` on the checkbox and record acceptance**

Replace `handleRegisterVisitor` in full:
```ts
  const handleRegisterVisitor = async () => {
    const celularDigits = celular.replace(/\D/g, '');

    if (!nome.trim()) {
      toast({ title: "Nome obrigatório", description: "Por favor, informe seu nome.", variant: "destructive" });
      return;
    }
    if (celularDigits.length < 10) {
      toast({ title: "Celular inválido", description: "Informe um número de celular válido com DDD.", variant: "destructive" });
      return;
    }
    if (!termsAccepted) {
      toast({ title: "Termos de Uso", description: "Você precisa aceitar os Termos de Uso para continuar.", variant: "destructive" });
      return;
    }

    try {
      const visitante = { nome: nome.trim(), celular: celular.trim(), email: email.trim() || undefined };
      const userAgent = getUserAgent();
      const ipAddress = await getClientIP();
      await Promise.all([
        registerVisitante({ velorio_id: pendingVelorioId, ...visitante }),
        logVelorioAccess(pendingVelorioId, token.toUpperCase(), ipAddress || undefined, userAgent, visitante),
        recordTermsAcceptance({
          velorio_id: pendingVelorioId,
          ...visitante,
          ip_address: ipAddress || undefined,
          user_agent: userAgent,
        }),
      ]);
      saveVisitor({ nome: nome.trim(), celular: celular.trim(), email: email.trim() });
      navigate(`/velorio/${pendingVelorioId}`);
    } catch (error) {
      toast({
        title: "Erro ao registrar",
        description: "Não foi possível salvar seus dados. Tente novamente.",
        variant: "destructive",
      });
    }
  };
```

- [ ] **Step 5: Add the checkbox UI and gate the submit button**

In the `step === 'visitor'` branch of the JSX, insert the checkbox block right before the "Entrar no Velório" button (i.e. immediately after the closing `</div>` of the e-mail field's `space-y-1.5` block, before the `<Button ... onClick={handleRegisterVisitor} ...>`):

```tsx
              <div className="flex items-start gap-2 pt-2">
                <Checkbox
                  id="terms"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="terms" className="text-sm font-normal leading-snug text-muted-foreground">
                  Li e aceito os{' '}
                  <TermsDialog
                    trigger={
                      <button type="button" className="text-gold underline underline-offset-2">
                        Termos de Uso e a Política de Privacidade de Imagem
                      </button>
                    }
                  />
                </Label>
              </div>
```

Then update that same branch's submit button. Both the `confirm`-step and
`visitor`-step buttons currently read `disabled={isRegistering}` verbatim, so
match on the larger block to hit only the `visitor`-step one — replace:
```tsx
              <Button
                variant="gold"
                size="xl"
                className="w-full mt-2"
                onClick={handleRegisterVisitor}
                disabled={isRegistering}
              >
                {isRegistering ? 'Entrando...' : 'Entrar no Velório'}
              </Button>
```
with:
```tsx
              <Button
                variant="gold"
                size="xl"
                className="w-full mt-2"
                onClick={handleRegisterVisitor}
                disabled={isRegistering || isRecordingTerms || !termsAccepted}
              >
                {isRegistering ? 'Entrando...' : 'Entrar no Velório'}
              </Button>
```
(the `confirm`-step button, which uses `onClick={handleConfirmVisitor}`, keeps
its original `disabled={isRegistering}`, unchanged).

- [ ] **Step 6: Verify the project builds and lints**

Run: `npm run build && npm run lint`
Expected: both succeed with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/PublicAccess.tsx
git commit -m "$(cat <<'EOF'
feat: require terms acceptance before entering a velório

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HhaTPj9yPTBp8SMvQ5Jf1Y
EOF
)"
```

---

### Task 7: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Launch the app**

Use the `run` skill to start the dev server (`npm run dev`, port 8080) and open it in a browser.

- [ ] **Step 2: Verify the gate blocks submission**

On `/`, enter a valid token for a velório that is `Agendado`/`Ao Vivo` (check `VelorioManagement` in `/admin/velorios` for one, or create one). On the "Identificação do Visitante" screen: fill nome and celular, leave the checkbox unchecked. Confirm "Entrar no Velório" is disabled.

- [ ] **Step 3: Verify the terms dialog**

Click "Termos de Uso e a Política de Privacidade de Imagem". Confirm a dialog opens showing the full text from `src/content/termos-de-uso-v1.0.md`, scrollable, closeable.

- [ ] **Step 4: Verify a first-time acceptance is recorded**

Check the checkbox (button becomes enabled), click "Entrar no Velório". Confirm navigation to `/velorio/:id` succeeds. In Supabase Studio (Table Editor, authenticated as an admin, or via the SQL Editor), confirm exactly one new row exists in `terms_acceptances` with the `celular` you used, `terms_version = '1.0'`, a 64-character hex `document_hash`, and non-null `accepted_at`/`user_agent`. Confirm a matching row also exists in `velorio_visitantes` (unchanged existing behavior).

- [ ] **Step 5: Verify returning-visitor skip**

Go back to `/`, enter the same token again. Confirm this time it goes straight to "Bem-vindo de volta" (no checkbox), since `has_accepted_current_terms` now returns `true` for that `celular` + version `1.0`.

- [ ] **Step 6: Verify version bump forces re-acceptance**

Temporarily edit `src/config/terms.ts`, changing `CURRENT_TERMS_VERSION` to `'1.1'` (do not add a new content file for this manual check — reusing `CURRENT_TERMS_TEXT` is fine, this step only exercises the version-comparison logic). Restart the dev server if needed, repeat Step 5 with the same celular. Confirm it now routes to "Identificação do Visitante" with the checkbox unchecked again. Revert `CURRENT_TERMS_VERSION` back to `'1.0'` afterward — **do not commit the `1.1` change**.

- [ ] **Step 7: Final report**

Report to the user: confirm all 6 checks above passed, and note the test rows left in `terms_acceptances` from this session and from Task 2/3's verification script (all real inserts, all intentionally left — the table is append-only) so they know what they're looking at if they browse the table.
