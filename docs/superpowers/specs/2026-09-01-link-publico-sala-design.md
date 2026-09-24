# Link público fixo por sala de velório

## Contexto

Hoje o único jeito de um visitante acessar uma transmissão é digitando o
token de 6 caracteres do velório específico em `/` (`PublicAccess.tsx`).
Esse token muda a cada velório, então a funerária não tem um link único e
fixo para divulgar por sala (ex: imprimir num cartaz, colocar no Google
Meu Negócio, mandar sempre o mesmo link no WhatsApp).

A entidade `sala_velorio` (migration `013_add_sala_velorio`, tela
`/admin/salas`) já existe e é dona das câmeras e do endereço físico. O
`status` de um velório (`Agendado` / `Ao Vivo` / `Encerrado`) já é
calculado dinamicamente em `getVelorioStatus()`
(`src/hooks/useVelorios.ts:267`) a partir de `data_inicio`/`data_fim`,
sem depender de ação manual do admin.

O sistema é **single-tenant** (uma funerária só rodando essa instalação) —
não existe hoje, nem vamos criar, uma entidade "empresa" no banco.

## Objetivo

Criar uma página pública fixa por sala, em
`app.campax.com.br/:hashEmpresa/:salaSlug`, que mostra qual velório está
em andamento naquela sala agora (ou o próximo agendado) — sem expor o
stream diretamente. Para assistir, a pessoa ainda precisa passar pelo
fluxo de token normal em `/`.

`hashEmpresa` é um identificador fixo e ofuscado desta instalação (não é
multi-tenant real, não isola dados — serve só para a URL não ficar
adivinhável por quem não recebeu o link).

## Escopo

### 1. Banco de dados

Nova migration `supabase/migrations/019_add_sala_slug.sql`:

```sql
-- ============================================
-- CAMPAX - SLUG DA SALA DE VELÓRIO
-- Migration: 019_add_sala_slug
-- Description: Adiciona um slug URL-safe a sala_velorio, usado no link
--   público fixo por sala (/:hashEmpresa/:salaSlug). Gerado a partir do
--   nome existente, com backfill para as salas já cadastradas.
-- ============================================

CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE sala_velorio ADD COLUMN slug VARCHAR(255);

-- Backfill: minúsculas, sem acento, não-alfanumérico vira "_"
UPDATE sala_velorio
SET slug = regexp_replace(
             regexp_replace(lower(unaccent(nome_sala_velorio)), '[^a-z0-9]+', '_', 'g'),
             '(^_+|_+$)', '', 'g'
           );

-- Resolve colisão entre salas com nomes que geram o mesmo slug
UPDATE sala_velorio sv
SET slug = sv.slug || '_' || substr(sv.id::text, 1, 4)
WHERE EXISTS (
  SELECT 1 FROM sala_velorio sv2
  WHERE sv2.slug = sv.slug AND sv2.id <> sv.id
);

ALTER TABLE sala_velorio
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT sala_velorio_slug_unique UNIQUE (slug);

COMMENT ON COLUMN sala_velorio.slug IS 'Identificador amigável para URL pública (ex: sala_uruacu), gerado a partir do nome, editável no admin';
```

Sem mudança de RLS: a policy `"Public pode ver salas de velorio"` (`SELECT
true`) já cobre a coluna nova, e as policies de `velorios` já permitem
`SELECT` público sem token — é assim que o fluxo de token atual já
funciona hoje.

### 2. Slug — geração e edição em `/admin/salas`

**`src/lib/slugify.ts`** (novo arquivo)
- `slugify(texto: string): string` — `normalize('NFD')` + strip de
  diacríticos, lowercase, substitui tudo que não é `[a-z0-9]` por `_`,
  colapsa `_` repetido, remove `_` das pontas. Mesma regra do backfill em
  SQL, para o slug sugerido no admin bater com o que o banco geraria.

**`src/hooks/useSalasVelorio.ts`**
- `SalaVelorio`: adicionar `slug: string`.
- `SalaVelorioFormData`: adicionar `slug: string`.
- Sem mudança de query (`select('*')` já traz a coluna nova).

**`src/pages/SalaManagement.tsx`**
- `SalaFormData`/`emptyForm`: adicionar `slug: ''`.
- Novo campo no formulário, "Link público da sala", mostrando o preview
  completo (`app.campax.com.br/{EMPRESA_HASH}/{slug}`) com o slug editável
  ao lado/abaixo.
- Enquanto o slug não tiver sido editado manualmente nesta sessão do
  formulário, ele é recalculado automaticamente a partir de
  `nome_sala_velorio` a cada tecla (via `slugify`) — mesmo padrão de
  "campo derivado até o usuário mexer nele" comum em formulários com
  slug. Um `useRef`/state booleano `slugEditadoManualmente` controla isso.
- `openEditDialog`: preenche `slug: sala.slug` e marca
  `slugEditadoManualmente = true` (não sobrescrever o slug de uma sala já
  existente só porque o admin editou o nome).
- Ao salvar, se o Supabase retornar erro de unique violation na
  constraint `sala_velorio_slug_unique`, mostrar toast "Esse link já está
  em uso por outra sala — escolha outro."
- No card de cada sala na listagem, exibir o link completo com um botão
  "Copiar link" (usa `navigator.clipboard.writeText`), mesmo padrão visual
  dos outros metadados da sala (endereço, responsável).

### 3. Hash fixo da instalação

- Novo env var `VITE_EMPRESA_HASH` em `.env` (string fixa, ex:
  `cx7f2a`) — cada instalação do Campax define a sua.
- **`src/lib/empresaHash.ts`** (novo arquivo): `export const EMPRESA_HASH
  = import.meta.env.VITE_EMPRESA_HASH as string;`
- Documentar em `CLAUDE.md`, seção "Environment Variables", junto dos
  outros `VITE_*`.

### 4. Rota e página pública — `/:hashEmpresa/:salaSlug`

**`src/App.tsx`**
- Nova rota pública, junto das outras (`/`, `/velorio/:id`):
  `<Route path="/:hashEmpresa/:salaSlug" element={<SalaPublicLink />} />`

**`src/hooks/useSalaPublicLink.ts`** (novo hook)
- `useSalaPublicLink(salaSlug: string)`: um `useQuery` que:
  1. Busca `sala_velorio` por `slug` (1 linha: `nome_sala_velorio`,
     `endereco`, `bairro`, `cidade`, `estado`). Se não achar, retorna
     `sala: null`.
  2. Busca todos os `velorios` com aquele `sala_velorio_id`
     (`nome_falecido`, `data_inicio`, `data_fim`, `data_sepultamento`).
  3. Calcula, reaproveitando `getVelorioStatus`:
     - `atual`: velório com status `'Ao Vivo'`. Se mais de um (caso
       extremo — duas velas simultâneas na mesma sala física, não
       deveria acontecer na prática), desempata pelo `data_inicio` mais
       recente.
     - `proximo`: entre os `'Agendado'`, o de menor `data_inicio` (só
       quando não há `atual`).

**`src/pages/SalaPublicLink.tsx`** (nova página)
- Lê `hashEmpresa`/`salaSlug` via `useParams`.
- Se `hashEmpresa !== EMPRESA_HASH` → renderiza `<NotFound />` direto
  (nem chega a consultar o banco pelo slug).
- Usa `useSalaPublicLink(salaSlug)`; se `sala` vier `null` → `<NotFound />`.
- Layout reaproveita o visual das outras páginas públicas (fundo
  `gradient-soft`, `CrossIcon`/`CandleIcon`, tipografia dourada — mesmo
  padrão de `PublicAccess.tsx`/`VelorioViewing.tsx`, sem inventar um
  novo estilo):
  - Cabeçalho: nome da sala + cidade/estado.
  - Se `atual`: card "Velório em andamento" com selo "Ao Vivo",
    `nome_falecido`, horário de início e, se preenchido,
    data/hora de sepultamento; botão "Acessar transmissão".
  - Senão, se `proximo`: card "Próximo velório" com `nome_falecido` e
    data/horário de início; mesmo botão "Acessar transmissão".
  - Senão: só o texto "Nenhum velório em andamento no momento.", sem
    card nem botão.
  - O botão "Acessar transmissão" sempre faz `navigate('/')` limpo —
    **sem** passar `?token=` nem o id do velório. A pessoa digita o
    token manualmente na tela seguinte, como já funciona hoje.
- Nenhum cadastro de visitante, nenhuma escrita em
  `velorio_access_logs` acontece nesta página — ela só expõe leitura
  pública já permitida hoje (`sala_velorio`/`velorios`); o log e o
  cadastro de visitante continuam exclusivos do fluxo de confirmação de
  token em `PublicAccess.tsx`, que não é tocado por este spec.

### 5. Documentação

- Atualizar a tabela de rotas e a seção "Environment Variables" do
  `CLAUDE.md` com a rota nova e `VITE_EMPRESA_HASH`.

## Fora de escopo

- Multi-tenant real (tabela `empresas`, isolamento de dados por
  funerária) — o hash é só um prefixo fixo ofuscado.
- Pré-preencher o token ao navegar para `/` a partir da vitrine da sala.
- Qualquer mudança no fluxo de token, cadastro de visitante, mural de
  homenagens ou contador de visitantes (`PublicAccess.tsx`,
  `MuralHomenagens.tsx`, `OnlineCounter.tsx`, `VisitantesCounter.tsx`) —
  tudo intacto.
- Foto do falecido ou qualquer dado sensível na vitrine — só nome e
  data/horário.
- Tratamento além do desempate simples para múltiplos velórios "Ao Vivo"
  simultâneos na mesma sala (cenário que não deveria acontecer numa sala
  física).

## Teste

- Rodar a migration localmente: confirmar que o backfill gera slugs
  únicos para as salas já cadastradas, sem erro de constraint.
- Em `/admin/salas`, criar uma sala nova digitando o nome: conferir que
  o slug é sugerido automaticamente; editar o slug manualmente e salvar;
  tentar salvar duas salas com o mesmo slug e ver o toast de erro.
- Editar uma sala existente: conferir que o slug já salvo aparece
  preenchido e não muda sozinho ao editar só o nome.
- Acessar `/{hash}/{slug}` de uma sala com velório "Ao Vivo": ver nome
  do falecido, horário, botão "Acessar transmissão"; clicar e cair em
  `/` limpo (sem token preenchido).
- Acessar sala só com velório "Agendado" no futuro: ver o card "Próximo
  velório" com a data certa.
- Acessar sala sem nenhum velório atual nem futuro: ver a mensagem
  "Nenhum velório em andamento no momento.", sem card.
- Acessar com hash errado (`/xxxx/{slug}`): página 404.
- Acessar com hash certo mas slug inexistente: página 404.
- Copiar o link pelo botão da listagem em `/admin/salas` e colar: URL
  deve bater exatamente com a rota pública.
