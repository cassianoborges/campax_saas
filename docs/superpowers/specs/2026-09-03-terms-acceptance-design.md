# Sistema de Aceite de Termos de Uso (Clickwrap) — Design

**Data:** 2026-09-03
**Status:** Aprovado para plano de implementação

## Contexto

O Campax é uma plataforma B2B de transmissão de velórios. Visitantes do público
não criam conta — eles digitam um token de 6 caracteres em `PublicAccess.tsx`
e, na primeira vez, se identificam com nome/celular/e-mail (opcional), que é
gravado em `velorio_visitantes` via insert direto do cliente Supabase (RLS
`anon`/`authenticated` INSERT, sem backend Express envolvido). Não existe
nenhum serviço de e-mail configurado no projeto hoje.

O pedido original (template genérico de "cadastro com clickwrap") assume um
fluxo de criação de conta com backend REST que não existe neste projeto. Este
spec adapta o requisito ao fluxo real: aceite de termos anexado ao momento em
que o visitante se identifica para assistir a um velório.

## Escopo

Incluído:
- Tabela append-only `terms_acceptances` como prova jurídica do aceite.
- Checkbox obrigatório na tela "Identificação do Visitante" (`PublicAccess.tsx`,
  step `visitor`), com link para o texto completo em um modal.
- Versionamento dos termos (arquivo de conteúdo + hash SHA-256 calculado no
  aceite).
- Reaceite automático apenas quando a versão vigente mudou desde o último
  aceite da mesma pessoa (identificada por celular).

Fora de escopo (decidido com o usuário):
- E-mail de confirmação do aceite (fica para uma iteração futura; exigiria
  escolher e configurar um provedor de e-mail, que não existe hoje).
- Aceite de termos no login/criação de contas administrativas
  (`AdminLogin.tsx`, `UserManagement.tsx`) — esse fluxo é para operadores da
  funerária, não para o público, e não foi pedido.
- Rota pública dedicada `/termos` — o texto é exibido em um modal na própria
  tela.
- Endpoint autenticado de consulta de histórico de aceites por usuário (não
  aplicável — não há conta de usuário público; consulta administrativa pode
  ser adicionada depois via uma tela de relatórios, fora deste escopo).

## Arquitetura

### 1. Conteúdo e versionamento dos termos

- Mover `TERMOUSO.MD` (raiz do repo) para `src/content/termos-de-uso-v1.0.md`,
  corrigindo o título truncado na linha 2 (`# Termos de Uso e Política de
  Privacidade de Imagem`).
- `src/config/terms.ts`:
  ```ts
  import termsTextV1_0 from '@/content/termos-de-uso-v1.0.md?raw';

  export const CURRENT_TERMS_VERSION = '1.0';
  export const CURRENT_TERMS_TEXT = termsTextV1_0;
  ```
- Para uma nova versão no futuro: adicionar `termos-de-uso-v1.1.md`, importar,
  e atualizar `CURRENT_TERMS_VERSION`/`CURRENT_TERMS_TEXT`. Versões antigas
  continuam no repo para auditoria, mesmo sem serem mais referenciadas pela
  constante atual (o hash gravado em cada aceite já documenta qual texto foi
  aceito).
- `document_hash` é calculado no navegador no momento do aceite, com
  `crypto.subtle.digest('SHA-256', new TextEncoder().encode(CURRENT_TERMS_TEXT))`,
  convertido para hex.

### 2. Banco de dados — migração `020_add_terms_acceptances.sql`

```sql
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

-- Append-only: só existe policy de INSERT e SELECT. Sem UPDATE/DELETE em
-- nenhuma role — a ausência de policy bloqueia a operação (RLS nega por
-- padrão), reforçando no banco a regra "nunca apagar aceite".
CREATE POLICY "Public can record terms acceptance"
    ON terms_acceptances FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can view terms acceptances"
    ON terms_acceptances FOR SELECT
    TO authenticated
    USING (true);

-- Função SECURITY DEFINER: permite checar se um celular já aceitou a versão
-- vigente sem expor o histórico completo de aceites (mesmo padrão de
-- get_velorio_visitante_nomes em 009_add_visitantes_public_function.sql).
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

`velorio_id` referencia o velório que estava sendo acessado no momento do
aceite (contexto, não escopo — o aceite vale para a pessoa, não só para
aquele velório, dado que a identidade é por celular).

### 3. Camada de serviço — `src/services/termsAcceptanceService.ts`

Mesmo estilo de `visitantesService.ts`:

```ts
export async function hasAcceptedCurrentTerms(celular: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_accepted_current_terms', {
    p_celular: celular.trim(),
    p_terms_version: CURRENT_TERMS_VERSION,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function recordTermsAcceptance(data: {
  velorio_id: string;
  nome: string;
  celular: string;
  email?: string;
  ip_address?: string;
  user_agent?: string;
}): Promise<void> {
  const documentHash = await hashTermsText(CURRENT_TERMS_TEXT);
  const { error } = await supabase.from('terms_acceptances').insert({
    ...data,
    email: data.email?.trim() || null,
    terms_version: CURRENT_TERMS_VERSION,
    document_hash: documentHash,
  });
  if (error) throw error;
}
```

`hashTermsText` (SHA-256 via Web Crypto, como descrito acima) vive em
`src/lib/hash.ts` — `src/lib/` já é o local convencional para utilitários no
projeto (`slugify.ts`, `empresaHash.ts`, `phoneMask.ts`).

### 4. Hook — `src/hooks/useTermsAcceptance.ts`

Mesmo estilo de `useVisitantes.ts`: `useHasAcceptedCurrentTerms(celular)` como
`useQuery` (só habilitado quando o celular tem 10-11 dígitos) e
`useRecordTermsAcceptance()` como `useMutation`.

### 5. Frontend — `PublicAccess.tsx`

- **Roteamento de tela:** hoje, após validar o token, `handleAccess` decide
  entre `confirm` (dados salvos) e `visitor` (primeira vez) olhando só o
  `localStorage`. Passa a também consultar
  `hasAcceptedCurrentTerms(saved.celular)`: se `true`, vai para `confirm`
  como hoje; se `false` (inclusive quando não há dado salvo), vai para
  `visitor`, mesmo que já exista um visitante salvo — forçando reaceite só
  quando a versão mudou.
- **Tela `visitor` (Identificação do Visitante):**
  - Novo estado `termsAccepted: boolean` (default `false`).
  - `Checkbox` (shadcn) desmarcado + label: "Li e aceito os
    [Termos de Uso e a Política de Privacidade de Imagem]" — o texto entre
    colchetes é um botão/link que abre um `Dialog` com `CURRENT_TERMS_TEXT`
    renderizado (scrollável).
  - Botão "Entrar no Velório" ganha mais uma condição de `disabled`:
    `!termsAccepted`.
  - `handleRegisterVisitor`: após o `registerVisitante` + `logVelorioAccess`
    existentes, chama `recordTermsAcceptance` (reaproveitando `userAgent` e
    `ipAddress` já obtidos nessa função). As três chamadas de rede podem
    rodar em paralelo com `Promise.all` já que são independentes.
- **Tela `confirm` (Bem-vindo de volta):** sem alteração — só chega aqui
  quem já aceitou a versão vigente.

### 6. Renderização do Markdown no modal

`CURRENT_TERMS_TEXT` é markdown puro. O projeto não tem nenhuma lib de
renderização de Markdown instalada hoje, então o texto é exibido como texto
pré-formatado (`white-space: pre-wrap`) dentro do Dialog — o documento já usa
`#`/`##`/`-`/`>` de forma legível mesmo como texto puro, e adicionar uma
dependência nova só para isso não se justifica.

## Testes

Como não há backend Express nesse fluxo (é RLS + insert direto), os testes
relevantes são:

1. **Migração:** aplicar `020_add_terms_acceptances.sql` em ambiente local/dev
   e confirmar via `list_tables`/`get_advisors` (Supabase MCP) que a tabela e
   a função foram criadas e que RLS está ativo sem policy de UPDATE/DELETE.
2. **Frontend (manual, via skill `run`):**
   - Botão "Entrar no Velório" permanece desabilitado com checkbox
     desmarcado.
   - Marcar o checkbox habilita o botão; ao confirmar, é criado exatamente 1
     registro em `terms_acceptances` (verificável via Supabase) além do
     registro já esperado em `velorio_visitantes`.
   - Abrir o link "Termos de Uso" mostra o texto completo no modal.
   - Simular segunda visita com o mesmo celular (mesma versão vigente): cai
     direto na tela "Bem-vindo de volta", sem checkbox.
   - Trocar `CURRENT_TERMS_VERSION` temporariamente para simular uma nova
     versão: o mesmo celular volta a cair na tela de identificação com
     checkbox desmarcado.

## Restrições (mantidas do pedido original)

- `terms_acceptances` é append-only: nenhuma policy de UPDATE/DELETE é criada
  em nenhuma role — RLS nega por padrão na ausência de policy.
- `ip_address` é lido do mesmo `getClientIP()` já usado em
  `accessLogsService.ts` (funciona hoje sem proxy reverso próprio; se um dia
  o Campax ficar atrás de um proxy que reescreve IP, ajustar lá, não aqui).
- O aceite só é gravado por uma ação real do visitante (clique em "Entrar no
  Velório" com o checkbox marcado) — nunca por job em batch.
