# WhatsApp do responsável pela Sala de Velório

## Contexto

A tabela `sala_velorio` (migration `013_add_sala_velorio`, tela `/admin/salas`
em `SalaManagement.tsx`) já tem um campo `responsavel_sala_velorio` (nome,
texto livre), mas nenhum campo de contato. É uma entidade diferente do
"responsável pelo velório" (`velorios.responsavel_velorio_nome` +
`contato_whatsapp_responsavel`, migration `014_add_velorio_responsavel`,
tela `/admin/velorios`), que já tem nome + WhatsApp implementados
(não commitado ainda) — este spec não mexe nisso.

## Objetivo

Adicionar um campo de celular/WhatsApp ao responsável da **sala** (a sala
física, dona das câmeras), editável em `/admin/salas`, e exibi-lo como link
clicável para a família/visitante na página pública de visualização do
velório (`VelorioViewing.tsx`).

## Escopo

### 1. Banco de dados

Nova migration `supabase/migrations/015_add_sala_velorio_whatsapp.sql`:

```sql
-- ============================================
-- CAMPAX - WHATSAPP DO RESPONSÁVEL PELA SALA
-- Migration: 015_add_sala_velorio_whatsapp
-- Description: Adiciona o celular/WhatsApp do responsável pela sala de
--   velório (campo de nome já existe desde a migration 013).
-- ============================================

ALTER TABLE sala_velorio
  ADD COLUMN whatsapp_responsavel_sala_velorio VARCHAR(20);

COMMENT ON COLUMN sala_velorio.whatsapp_responsavel_sala_velorio IS 'WhatsApp do responsável pela sala (sala_velorio.responsavel_sala_velorio)';
```

Sem mudança de RLS: as policies de `sala_velorio` já cobrem a tabela inteira
(`SELECT *`/`INSERT`/`UPDATE` para autenticado via `user_has_role`,
`SELECT true` para público) — a coluna nova é exposta automaticamente pelos
mesmos selects.

### 2. Tela admin — `SalaManagement.tsx` / `useSalasVelorio.ts`

**`src/hooks/useSalasVelorio.ts`**
- `SalaVelorio` e `SalaVelorioFormData`: adicionar
  `whatsapp_responsavel_sala_velorio: string | null` (interface) /
  `whatsapp_responsavel_sala_velorio?: string | null` (form data), no mesmo
  padrão dos campos existentes (`responsavel_sala_velorio` etc.). Como o
  hook já faz `select('*')` e `insert`/`update` com o objeto inteiro de
  campos, nenhuma outra mudança é necessária no hook além das interfaces.

**`src/pages/SalaManagement.tsx`**
- `SalaFormData` e `emptyForm`: adicionar
  `whatsapp_responsavel_sala_velorio: string`.
- `openEditDialog`: preencher
  `whatsapp_responsavel_sala_velorio: sala.whatsapp_responsavel_sala_velorio ?? ''`.
- No formulário do diálogo, transformar o bloco atual de "Responsável" (um
  único `Input` em linha cheia) em um `grid grid-cols-2 gap-4` com dois
  campos lado a lado, no mesmo padrão visual já usado para
  Bairro/CEP e Cidade/Estado:
  - "Responsável" (`Input`, mantém como está)
  - "WhatsApp do Responsável" (`Input type="tel"`, placeholder
    `+55 62 99999-9999`, mesmo padrão de `VelorioManagement.tsx` e
    `CreateUserDialog.tsx`)
- No card da listagem (dentro do `.map((sala) => ...)`), ao lado de
  `{sala.responsavel_sala_velorio && <span>Responsável: {sala.responsavel_sala_velorio}</span>}`,
  adicionar, quando o campo existir:
  `<span>WhatsApp: {sala.whatsapp_responsavel_sala_velorio}</span>`.

### 3. Página pública — `useVelorios.ts` / `VelorioViewing.tsx`

**`src/hooks/useVelorios.ts`**
- No tipo `Velorio`, dentro do objeto aninhado `sala_velorio?`, adicionar:
  `responsavel_sala_velorio?: string | null;` e
  `whatsapp_responsavel_sala_velorio?: string | null;` (o nome do
  responsável hoje não é buscado nem tipado ali — precisa entrar junto,
  já que exibir o WhatsApp sem saber de quem é ele não faz sentido).
- Em `VELORIO_SELECT`, dentro do bloco `sala_velorio (...)`, adicionar as
  colunas `responsavel_sala_velorio` e `whatsapp_responsavel_sala_velorio`
  à lista de campos selecionados.

**`src/pages/VelorioViewing.tsx`**
- Logo abaixo do bloco que já exibe `sala?.nome_sala_velorio` e
  `enderecoCompleto` (por volta da linha 118-122), adicionar: se
  `sala?.responsavel_sala_velorio` **e**
  `sala?.whatsapp_responsavel_sala_velorio` estiverem ambos preenchidos,
  renderizar um link:
  ```tsx
  <a
    href={`https://api.whatsapp.com/send?phone=${sala.whatsapp_responsavel_sala_velorio.replace(/\D/g, '')}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-cream/60 hover:text-gold text-sm"
  >
    <Phone className="w-3 h-3" />
    Falar com {sala.responsavel_sala_velorio} (responsável pela sala)
  </a>
  ```
  (usa `lucide-react`'s `Phone`, já importado em outras telas do projeto —
  adicionar ao import de ícones no topo do arquivo). O número é limpo de
  qualquer caractere não-numérico antes de montar a URL, já que o parâmetro
  `phone` do `api.whatsapp.com/send` exige apenas dígitos (com código do
  país). Se faltar nome OU WhatsApp, nada é renderizado — não faz sentido
  mostrar um rótulo sem link ou um link sem saber de quem é.

## Fora de escopo

- Qualquer mudança no "responsável pelo velório" (`velorios.responsavel_velorio_nome`
  / `contato_whatsapp_responsavel`) — já implementado separadamente.
- Validação de formato de telefone no frontend ou backend (mesmo padrão dos
  campos de WhatsApp já existentes no projeto — texto livre).
- Envio de mensagens automáticas ou integração com WhatsApp Business API —
  é só um link `wa.me`/`api.whatsapp.com` que abre o WhatsApp do visitante.

## Teste

- Criar/editar uma sala em `/admin/salas` preenchendo WhatsApp do
  responsável: confirmar que salva e aparece no card da listagem.
- Deixar o campo em branco: confirmar que não aparece "WhatsApp:" vazio no
  card.
- Acessar a página pública de um velório (`/velorio/:id`) cuja sala tem
  nome E whatsapp do responsável preenchidos: confirmar que o link "Falar
  com [nome] (responsável pela sala)" aparece e abre o WhatsApp com o
  número correto (sem caracteres não-numéricos).
- Acessar a página pública de um velório cuja sala não tem
  whatsapp do responsável preenchido (ou não tem nome): confirmar que
  nada é renderizado nesse lugar (sem erro, sem link quebrado).
