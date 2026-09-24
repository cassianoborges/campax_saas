# Editar usuário (nome, WhatsApp, Agente IA e redefinição de senha)

## Contexto

O RBAC (migrations `010`–`012`, tabela `profiles`, RLS, hooks `useUsers`/
`useRole`/`useProfile`, página `UserManagement.tsx`) e o fluxo de criação
direta de usuário (`CreateUserDialog.tsx`, endpoint `POST /api/users/create`
em `camera-status-api.cjs`, ver
`docs/superpowers/specs/2026-07-15-criacao-direta-usuario-design.md`) já
estão implantados e funcionando em produção.

Hoje, depois de criado, um usuário só pode ter o **papel** alterado (`Select`
na linha da tabela) e ser **ativado/desativado** (`AlertDialog` na mesma
linha) — ambos via `useUsers.updateRole` / `useUsers.toggleActive`, que
fazem `UPDATE` direto em `profiles` a partir do client (permitido pela RLS
`"Superadmin atualiza qualquer perfil"`, migration `010`). Não existe
nenhum botão ou diálogo para editar nome, WhatsApp, o switch de Agente IA,
ou para redefinir a senha de um usuário já criado.

## Objetivo

Superadmin edita, pela tela `/admin/usuarios`, os dados de um usuário
existente (nome completo, WhatsApp, Agente IA) e, opcionalmente, define uma
nova senha para ele — tudo em um único diálogo "Editar", sem precisar
excluir e recriar o usuário.

## Escopo

### 1. Backend — endpoint em `camera-status-api.cjs`

Novo endpoint `PATCH /api/users/:id`, adicionado ao Express já existente em
`camera-status-api.cjs` (roda via PM2, porta 3001), no mesmo padrão do
`POST /api/users/create`.

Request: header `Authorization: Bearer <jwt>` + parâmetro de rota `:id`
(uuid do usuário) + body
`{ full_name?, numero_whatsapp?, agente_ia?, password? }` — todos os campos
do body são opcionais; envia-se apenas o que mudou.

Fluxo:
1. Cria um client Supabase (anon key) com o JWT do chamador no header
   `Authorization` e chama a RPC `get_my_role()`. Se o retorno não for
   `'superadmin'`, responde `403`.
2. Cria um segundo client Supabase com a service role key
   (`adminClient`).
3. Se `password` vier preenchido no body, chama
   `adminClient.auth.admin.updateUserById(id, { password })`. Erro aqui
   responde `400` com a mensagem do Supabase Auth (ex.: senha curta
   demais).
4. Monta um objeto só com os campos de perfil presentes no body
   (`full_name`, `numero_whatsapp`, `agente_ia`) e faz
   `adminClient.from('profiles').update(...).eq('id', id)`. Se nenhum
   campo de perfil foi enviado, pula este update.
5. Responde `{ success: true }`. Erros seguem o mesmo padrão do
   `/api/users/create` (400/401/403/500, `{ error: string }`).

Não há migration nova nem mudança de RLS — o endpoint usa a service role
key (mesmo padrão do `/api/users/create`), então não depende da policy
`"Superadmin atualiza qualquer perfil"` para os campos de perfil.

### 2. Frontend

**`src/lib/generatePassword.ts`** (novo arquivo)
- Extrai a função `generatePassword(length = 16)` hoje definida dentro de
  `CreateUserDialog.tsx`, para ser reaproveitada também no diálogo de
  edição.

**`src/components/CreateUserDialog.tsx`**
- Passa a importar `generatePassword` de `src/lib/generatePassword.ts` em
  vez de defini-la localmente. Nenhuma outra mudança.

**`src/hooks/useUsers.ts`**
- Nova mutation `updateUser`, que faz
  `fetch(`${CAMERA_STATUS_API_URL}/api/users/${userId}`, { method: 'PATCH', ... })`
  com o JWT da sessão atual no header `Authorization`, enviando só os
  campos alterados (incluindo `password` quando preenchido). Em caso de
  erro, lança `Error` com a mensagem retornada pela API (mesmo padrão do
  `createUser`).
- `onSuccess`: invalida `['users']` (e `['profile']`, já que o próprio
  superadmin pode editar seus próprios dados).

**`src/components/EditUserDialog.tsx`** (novo arquivo)
- Modelado visualmente como `CreateUserDialog.tsx`, mas recebe o
  `ProfileRow` do usuário a editar via prop e pré-preenche os campos:
  - Nome completo (`Input`)
  - WhatsApp (`Input type="tel"`)
  - Agente IA (`Switch`)
  - "Nova senha" (`Input`, opcional, com botão "Gerar senha" igual ao de
    criação) — texto de apoio: "Deixe em branco para manter a senha
    atual."
- Não inclui e-mail nem papel (esses já têm seus próprios controles na
  listagem).
- `handleSubmit` chama `updateUser.mutateAsync` só com os campos que
  mudaram (nome/WhatsApp/Agente IA sempre vão, já que são o estado atual
  do formulário; `password` só vai se o campo não estiver vazio).
- Sucesso: toast "Usuário atualizado com sucesso." e fecha o diálogo.
  Erro: toast destrutivo com a mensagem do erro (mesmo padrão do
  `CreateUserDialog`).

**`src/pages/UserManagement.tsx`**
- Adiciona um botão "Editar" (ícone `Pencil`, `variant="ghost"`) que abre
  o `EditUserDialog` para a linha, posicionado antes do `Select` de papel.
- Diferente do `Select` de papel e do botão ativar/desativar (que só
  aparecem quando `!isCurrentUser`), o botão "Editar" aparece **para
  todas as linhas**, inclusive a do próprio usuário logado — um
  superadmin pode editar seu próprio nome/WhatsApp/Agente IA/senha.

### 3. Deploy

- Sem migration nova, sem mudança de RLS.
- No servidor: nenhum `npm install` novo (mesmas dependências do
  `/api/users/create`); só `pm2 restart camera-status-api` depois do
  deploy do backend, e rebuild do frontend (`npm run build`) para a nova
  tela.

## Fora de escopo

- Alterar e-mail do usuário.
- Alterar papel pelo `EditUserDialog` (continua exclusivamente pelo
  `Select` já existente na listagem).
- Fluxo de "esqueci minha senha" ou troca de senha pelo próprio usuário
  fora da tela de administração.
- Forçar troca de senha no próximo login após uma redefinição pelo
  admin.
- Qualquer alteração em `profiles`, RLS ou migrations já aplicadas.

## Teste

- Editar nome/WhatsApp/Agente IA de outro usuário sem preencher "Nova
  senha": confirmar que os dados aparecem atualizados na listagem e que
  o usuário ainda loga com a senha antiga.
- Preencher "Nova senha" (gerada ou digitada) ao editar outro usuário:
  confirmar que ele consegue logar com a senha nova e que a antiga deixa
  de funcionar.
- Editar o próprio perfil (usuário logado) pelo botão "Editar": confirmar
  que funciona e que o `Select` de papel / botão ativar-desativar
  continuam ocultos para a própria linha.
- Chamar `PATCH /api/users/:id` sem token ou com token de um usuário
  não-superadmin: confirmar `401`/`403`.
- Confirmar que os fluxos existentes (criar usuário, mudar papel,
  ativar/desativar) continuam funcionando sem mudanças.
