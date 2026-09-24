# Criação direta de usuário (sem convite por e-mail)

## Contexto

O RBAC (migrations `010`–`012`, tabela `profiles`, RLS, hooks `useUsers`/
`useRole`/`useProfile`, página `UserManagement.tsx`) já está todo implantado
e funcionando em produção. A única peça pendente era o fluxo de convite:
`InviteUserDialog.tsx` chama uma Supabase Edge Function
(`supabase/functions/invite-user`) que nunca foi implantada — a URL
responde `404 NOT_FOUND`.

Decisão: abandonar o fluxo de convite por e-mail. O superadmin não precisa
convidar ninguém por e-mail; ele mesmo cria o usuário já com senha, sem
depender de deploy de Edge Function no Supabase (que exige credenciais que
hoje não temos acesso via MCP).

## Objetivo

Superadmin cria um novo usuário diretamente pela tela `/admin/usuarios`,
definindo e-mail, senha (gerada ou digitada) e papel. O usuário nasce ativo
e confirmado, podendo logar imediatamente — sem e-mail de convite.

## Escopo

### 1. Backend — endpoint em `camera-status-api.cjs`

Novo endpoint `POST /api/users/create`, adicionado ao Express já existente
em `camera-status-api.cjs` (roda via PM2, porta 3001).

Request: header `Authorization: Bearer <jwt>` + body
`{ email, password, role, full_name?, numero_whatsapp?, agente_ia? }`.

Fluxo:
1. Cria um client Supabase (anon key) com o JWT do chamador no header
   `Authorization` e chama a RPC `get_my_role()`. Se o retorno não for
   `'superadmin'`, responde `403`.
2. Cria um segundo client Supabase com a service role key e chama
   `auth.admin.createUser({ email, password, email_confirm: true,
   user_metadata: { full_name } })`.
3. Faz upsert em `profiles` com `id` (do usuário criado), `email`, `role`,
   `full_name`, `numero_whatsapp`, `agente_ia`, `invited_by` (id do
   chamador, extraído do JWT decodificado ou de `callerClient.auth.getUser()`).
4. Responde `{ success: true, user_id }`. Erros retornam
   `{ error: string }` com status apropriado (400/401/403/500), no mesmo
   padrão do `invite-user/index.ts` atual.

Configuração:
- Novo `.env` ao lado de `camera-status-api.cjs` (mesmo padrão do
  `mediamtx-sync/.env`), carregado via `dotenv`, com `SUPABASE_URL`,
  `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_KEY` (reaproveita os mesmos
  valores já usados em `mediamtx-sync/.env`).
- Adiciona dependências `dotenv` e `@supabase/supabase-js` (esta última já
  existe no `package.json` raiz) ao processo do `camera-status-api.cjs`.
- `ecosystem.config.cjs` não muda (o `.env` é carregado pelo próprio
  `dotenv.config()`, não pelo bloco `env` do PM2).

### 2. Frontend

**`src/hooks/useUsers.ts`**
- Renomeia a mutation `inviteUser` → `createUser`.
- Passa a chamar `${VITE_CAMERA_STATUS_API_URL}/api/users/create` em vez do
  Edge Function, incluindo `password` no corpo da requisição.
- Mantém a invalidação de `['users']` em caso de sucesso.

**`src/components/InviteUserDialog.tsx` → `src/components/CreateUserDialog.tsx`**
- Renomeia o arquivo e o componente.
- Mantém os campos existentes (e-mail, nome, WhatsApp, papel, agente IA).
- Adiciona campo de senha com dois modos:
  - Padrão: botão "Gerar senha" cria uma senha aleatória forte (ex.: 16
    caracteres, letras maiúsculas/minúsculas/números/símbolos) e preenche o
    campo em texto visível.
  - Alternativa: link/toggle "Digitar manualmente" transforma o campo em
    input editável para o admin escolher a senha.
- Após criar com sucesso, em vez do toast atual ("Convite enviado!"), exibe
  um estado de confirmação dentro do próprio dialog mostrando e-mail e
  senha definidos, com botão "Copiar", já que não há e-mail automático
  avisando o novo usuário.
- Textos trocam de "Convidar Usuário" / "Convidar Novo Usuário" para
  "Criar Usuário" / "Criar Novo Usuário".

**`src/pages/UserManagement.tsx`**
- Só troca o import de `InviteUserDialog` para `CreateUserDialog` (nenhuma
  outra mudança nessa página).

### 3. Limpeza

- Remove o diretório `supabase/functions/invite-user/` (não será mais
  usado).

### 4. Deploy

- Sem nenhum deploy no Supabase (nem migration nova, nem Edge Function).
- No servidor: `npm install` (raiz, para pegar `dotenv`), criar o `.env` do
  `camera-status-api`, e `pm2 restart camera-status-api`.

## Fora de escopo

- Qualquer alteração em `profiles`, RLS ou nas migrations já aplicadas.
- Forçar troca de senha no primeiro login.
- Reenvio de senha ou recuperação de senha pelo admin (fica a critério do
  fluxo padrão "esqueci minha senha" do Supabase Auth, já existente).
- Alterações em `mediamtx-sync` (só reaproveitamos o valor da service key,
  não o código).

## Teste

- Criar um usuário novo (papel `viewer`, sem WhatsApp/agente IA) com senha
  gerada automaticamente; confirmar que ele consegue logar em `/admin` com
  e-mail + a senha exibida.
- Criar um usuário com senha digitada manualmente e papel `admin`;
  confirmar login e que o papel aparece corretamente na lista.
- Tentar chamar `POST /api/users/create` sem token ou com token de um
  usuário não-superadmin: confirmar `401`/`403`.
- Confirmar que a lista de usuários (`UserManagement.tsx`) e as ações
  existentes (mudar papel, ativar/desativar) continuam funcionando sem
  mudanças.
