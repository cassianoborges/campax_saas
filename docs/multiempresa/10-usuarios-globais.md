# Spec 10 — Usuários globais e vínculo com várias empresas

> Planejamento geral: [00-planejamento.md](00-planejamento.md) · Depende de: [03-backend-isolamento.md](03-backend-isolamento.md), [04-plataforma.md](04-plataforma.md), [08-subdominio-dominio-proprio.md](08-subdominio-dominio-proprio.md)
> Status: **implementada e no ar em 2026-09-26**.

## Objetivo

Dar à plataforma um **cadastro global de usuários**: ver e gerenciar todos num lugar só, cadastrar alguém antes
de decidir a empresa e **vincular o mesmo usuário a várias funerárias** (ex.: dono de uma rede, técnico que atende
várias). Quem está em mais de uma empresa escolhe por qual está agindo, e o isolamento entre funerárias continua
valendo: agindo pela empresa A, a pessoa não enxerga nada da B.

## Decisões

| # | Decisão |
|---|---------|
| U1 | Um usuário pode ter **zero, um ou vários vínculos** com empresas. Com zero, fica cadastrado mas **não entra** no sistema. |
| U2 | O **papel é da pessoa**, não do vínculo: continua em `profiles.role` e vale igual em todas as empresas dela. |
| U3 | **Só a plataforma** vincula e desvincula usuários de empresas, e só ela vê o cadastro global. |
| U4 | O superadmin continua criando os usuários da própria empresa (já nascem vinculados a ela). Com um usuário que **também está em outra empresa** ele **não** redefine a senha, **não** desativa e **não** muda o papel (os três valem para todas as empresas da pessoa); ele só pode **tirá-lo da empresa dele**. Ele sabe que o usuário está em outra empresa, mas não qual. |
| U5 | `platform_admin` **nunca** tem vínculo (garantido por trigger no banco). |
| U6 | Escolha da empresa: no **subdomínio** da funerária, entra direto nela; no **endereço geral**, quem tem vários vínculos escolhe numa tela depois da senha, e a barra lateral ganha "Trocar empresa". Quem tem um vínculo só não vê diferença. |
| U7 | Desvincular, suspender a empresa ou trocar a senha tem **efeito imediato**: a empresa ativa e o vínculo são conferidos no banco a cada requisição. |
| U8 | A regra "não pode ficar sem superadmin ativo" passa a valer para **desativar, mudar papel e desvincular**, olhando **todas** as empresas da pessoa. |

## Contexto (verificado em 2026-09-26)

- `profiles.empresa_id` é a única ligação usuário→empresa. CHECK `profiles_empresa_platform_admin`
  (`(role = 'platform_admin') = (empresa_id IS NULL)`) e FK `profiles_empresa_id_fkey` (`ON DELETE RESTRICT`).
  Hoje há 6 perfis: 1 `platform_admin`, 4 `superadmin`, 1 `admin`.
- `requireAuth` (`backend/src/auth/middleware.ts`) carrega o perfil **com a empresa** a cada requisição e preenche
  `req.profile` / `req.empresa`; `requireTenant` monta `req.db = prismaForEmpresa(req.empresa.id)`. Todo o isolamento
  parte de `req.empresa`.
- `prismaForEmpresa` trata `profiles` como modelo com `empresa_id` próprio (`DIRECT_MODELS`).
- O JWT carrega `sub` e `sv` (versão da senha, `profiles.senha_alterada_em`).
- `POST /auth/login` aceita `empresa_slug` (subdomínio, spec 08) e responde 401 igual a senha errada se o usuário
  for de outra empresa.
- `/users` (superadmin): listar, criar, `PATCH /:id` (nome, WhatsApp, senha), `PATCH /:id/role`, `PATCH /:id/active`.
- `/platform/empresas/:id/usuarios`: listar, criar, redefinir senha, ativar/desativar, com a regra do último
  superadmin ativo.
- `GET /velorios/audit` busca os criadores dos velórios com `req.db.profiles`.
- O Socket.IO não usa o login (só eventos públicos), então não é afetado.

## Desenho

### 1. Banco e migração — `backend/prisma/sql/003_usuario_empresas.sql`

Tabela nova:

```sql
CREATE TABLE usuario_empresas (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (profile_id, empresa_id)
);
CREATE INDEX idx_usuario_empresas_empresa ON usuario_empresas (empresa_id);
```

Trigger `usuario_empresas_sem_platform_admin` (`BEFORE INSERT OR UPDATE`): recusa o vínculo se o perfil for
`platform_admin`. E, em `profiles`, um trigger `BEFORE UPDATE OF role` recusa promover a `platform_admin` quem tem
vínculo (hoje nenhuma rota faz isso; é a barreira de banco que substitui o CHECK antigo).

Passos, numa transação, registrando-se em `schema_scripts` e recusando rodar duas vezes (padrão de 001/002):

1. cria a tabela, o índice e os triggers;
2. `INSERT INTO usuario_empresas (profile_id, empresa_id, created_at) SELECT id, empresa_id, created_at FROM profiles WHERE empresa_id IS NOT NULL`;
3. confere que o número de vínculos é igual ao de perfis com `empresa_id`; se não for, `RAISE EXCEPTION` (desfaz tudo);
4. remove o CHECK `profiles_empresa_platform_admin`, a FK `profiles_empresa_id_fkey`, o índice `idx_profiles_empresa` e a coluna `profiles.empresa_id`.

`schema.prisma`: modelo `usuario_empresas` com relações para `profiles` e `empresas`; sai `empresa_id`/`empresa`
de `profiles`. Conferido com `npx prisma migrate diff ... --script` vazio.

Antes de rodar em `campax`: `scripts/backup-db.sh` e `scripts/restore-check.sh`. O script roda primeiro em
`campax_dev` (cópia com dados reais); depois `refresh-dev-db.sh test`.

### 2. Backend

**JWT.** Ganha `emp` (id da empresa ativa), opcional. `tokenFor(profile, empresaId?)`.

**`requireAuth`**, depois das checagens atuais (perfil ativo, `sv`):

- `platform_admin`: `req.empresa = null`, como hoje (`emp` é ignorado).
- Com `emp`: carrega o vínculo (`usuario_empresas` + empresa). Sem vínculo → **401** "Você não tem mais acesso a
  esta empresa". Empresa suspensa → 403 "Empresa suspensa", como hoje — exceto se a pessoa tiver outra empresa
  ativa: aí a sessão vira provisória (`req.empresa = null`) para escolher outra sem logar de novo (ver Notas).
- Sem `emp` (tokens antigos ou login provisório): se a pessoa tem **exatamente um** vínculo, ele vale como empresa
  ativa (tokens de antes da implantação continuam funcionando); com vários, `req.empresa = null` (login
  provisório); com **zero** → 401 "Nenhuma empresa vinculada a este usuário" (volta para o login em vez de ficar
  preso em telas que respondem 403).
- `req.vinculos`: a lista de empresas da pessoa (id, nome_exibicao, slug, logo_url, ativo), para `/auth/me`.

Com `req.empresa = null`, `requireTenant` já responde 403 em todas as rotas de empresa: o login provisório só
serve para `/auth/me`, `/auth/senha` e `/auth/empresa`.

**`POST /auth/login`**, depois de conferir a senha:

| Situação | Resposta |
|----------|----------|
| `platform_admin` | como hoje |
| `empresa_slug` (subdomínio) sem vínculo com essa empresa | 401 "Credenciais inválidas" (igual a senha errada) |
| `empresa_slug` com vínculo | token com `emp` dessa empresa (suspensa → 403) |
| sem vínculo nenhum | 403 "Nenhuma empresa vinculada a este usuário" |
| um vínculo | token com `emp` (suspensa → 403, como hoje) |
| vários vínculos | token **sem** `emp` + `empresas: [...]` + `escolher_empresa: true` |

Se todos os vínculos de quem tem vários estiverem suspensos → 403 "Empresa suspensa".

**`POST /auth/empresa`** `{ empresa_id }` (qualquer usuário logado, menos `platform_admin`): confere vínculo e empresa
ativa e devolve um token novo com esse `emp`. Serve para a escolha depois do login e para "Trocar empresa". Sem
vínculo → 404; suspensa → 403.

**`GET /auth/me`** passa a devolver também `empresas` (a lista de vínculos).

**`prismaForEmpresa`.** `profiles` sai de `DIRECT_MODELS` e ganha filtro próprio:
`{ vinculos: { some: { empresa_id } } }` para leituras e updates; um `create` de `profiles` pelo `req.db` ganha
`vinculos: { create: { empresa_id } }` (o usuário nasce vinculado à empresa de quem criou).

**`/users` (superadmin):**

- `GET /` devolve, em cada usuário, `outras_empresas: number` (quantas empresas além desta; nunca quais).
- `PATCH /:id` com `password`, `PATCH /:id/role` e `PATCH /:id/active`: se `outras_empresas > 0` → **403**
  "Este usuário também atende outra empresa; fale com o suporte da Campax". Nome e WhatsApp continuam editáveis.
- `DELETE /:id/vinculo` (novo): remove o vínculo com a empresa do superadmin (regra U8). Remover a si mesmo → 400.
- `POST /`: e-mail que já existe (em qualquer empresa) → 409, como hoje.

**`/platform/usuarios` (novo, `requirePlatformAdmin`):**

| Rota | Faz |
|------|-----|
| `GET /platform/usuarios?busca=&empresa_id=` | Lista usuários (menos `platform_admin`) com as empresas de cada um; busca por nome ou e-mail. |
| `POST /platform/usuarios` | Cria `{ email, password, role, full_name, empresa_ids? }` numa transação. |
| `GET /platform/usuarios/:id` | Detalhe com vínculos. |
| `PATCH /platform/usuarios/:id` | Nome e papel (U8). Nunca `platform_admin`. |
| `PATCH /platform/usuarios/:id/senha` | Redefine (`novaSenha()`, derruba sessões). |
| `PATCH /platform/usuarios/:id/ativo` | Ativa/desativa (U8). |
| `PUT /platform/usuarios/:id/empresas/:empresaId` | Vincula (idempotente). |
| `DELETE /platform/usuarios/:id/empresas/:empresaId` | Desvincula (U8). |

As rotas atuais `/platform/empresas/:id/usuarios*` continuam, passando a usar os vínculos (`criar` = criar +
vincular; senha, ativo e papel seguem U8).

**Regra U8** numa função só (`assertNaoDeixaSemSuperadmin(profileId, acao)`): para cada empresa afetada, confere se
continua existindo outro `superadmin` ativo vinculado. Se não → 400 com o nome da empresa (na plataforma) ou
"É o último superadmin ativo da empresa" (no painel).

**Auditoria (`GET /velorios/audit`).** Os ids de criadores vêm dos velórios da própria empresa; o nome e o e-mail
passam a ser lidos por esses ids sem o filtro de vínculo (via `include` a partir de `velorios`), para quem foi
desvinculado não virar "desconhecido".

**Logs.** Cada ação nova gera `[platform] <acao> usuario=<id> [empresa=<id>] por=<id>` e
`[auth] trocar-empresa usuario=<id> empresa=<id>`.

### 3. Frontend

**Plataforma — item "Usuários" na barra lateral:**

- `/platform/usuarios`: lista com busca (nome ou e-mail) e filtro por empresa; colunas nome, e-mail, papel,
  situação e empresas (chips); quem não tem nenhuma aparece como **"Sem empresa"**. Botão "Novo usuário".
- "Novo usuário": nome, e-mail, papel (superadmin/admin/operador/viewer), senha inicial com "gerar", empresas
  (seleção múltipla, opcional). Depois de criar, mostra as credenciais **uma única vez** com botão copiar (como na
  criação de empresa) e vai para o detalhe.
- `/platform/usuarios/:id`: dados (nome, papel), empresas vinculadas com "Vincular empresa" (lista das ativas e
  suspensas ainda não vinculadas) e "Remover", redefinir senha, ativar/desativar. Erros da regra U8 aparecem no
  toast com o motivo.

**Plataforma — aba "Usuários" da empresa:** ganha "Vincular usuário existente" (busca no cadastro global) e, em quem
está em outras empresas, a marcação "+N empresas" com link para o detalhe.

**Login (`AdminLogin`):** se a resposta vier com `escolher_empresa`, mostra **"Escolha a empresa"**: cartões com
logo (`EmpresaLogo`) e nome; suspensas aparecem desabilitadas com "Suspensa". Escolher chama `POST /auth/empresa`,
guarda o token novo e segue para `/admin/dashboard`. Recarregar a página com o login provisório volta para essa
tela (o `useAuth` sabe que há `empresas` mas não `empresa`). No subdomínio a tela nunca aparece.

**Barra lateral do painel (`AdminLayout`):** "Trocar empresa", só quando `empresas.length > 1`; abre a mesma lista
num diálogo. Trocar grava o token novo, limpa o cache do TanStack Query (dados da empresa anterior) e vai para
`/admin/dashboard`.

**`/admin/usuarios` (superadmin):** para quem tem `outras_empresas > 0`, senha, papel e desativar ficam
desabilitados com a dica "Este usuário também atende outra empresa; fale com o suporte da Campax", e aparece
"Remover da empresa" (com confirmação).

`useAuth()` passa a expor `empresas` e `trocarEmpresa(id)`.

## Testes (Vitest, backend)

- **Migração:** o script roda em `campax_test` sobre dados de fixture e preserva cada `empresa_id` como vínculo;
  rodar de novo é recusado.
- **Isolamento** (`test/isolamento/`, fixture com um usuário vinculado a A e B): agindo por A, todas as rotas
  de empresa só devolvem dados de A; agindo por B, só de B; token com `emp` de uma empresa sem vínculo → 401.
- **Efeito imediato:** desvinculado de A, o token com `emp = A` recebe 401 na próxima requisição; A suspensa → 403;
  token sem `emp` de quem ficou sem nenhum vínculo → 401.
- **Login:** subdomínio de A para quem é de A e B → token de A; subdomínio de C → 401 igual a senha errada; sem
  vínculo → 403; um vínculo → direto; vários → provisório, que recebe 403 nas rotas de empresa e serve para
  `/auth/empresa`; token antigo sem `emp` de quem tem um vínculo continua valendo.
- **Superadmin:** vê só usuários vinculados à empresa dele; cria já vinculado; com usuário compartilhado, senha,
  papel e ativo → 403 e desvincular funciona; não enxerga quais são as outras empresas.
- **Plataforma:** CRUD de `/platform/usuarios`, vincular (idempotente), desvincular; `platform_admin` não pode ser
  vinculado (erro do trigger vira 400).
- **Regra U8:** desativar, mudar papel e desvincular o último superadmin ativo de qualquer empresa da pessoa → 400.
- **Auditoria:** criador desvinculado continua aparecendo com nome e e-mail.
- Os testes existentes que usam `profiles.empresa_id` (fixture, `helpers.createProfile`) passam a criar vínculo.

## Implantação

Tudo ainda é ambiente de desenvolvimento, sem janela de manutenção. Ordem, com alguns segundos fora do ar:

1. `scripts/backup-db.sh` e `scripts/restore-check.sh`;
2. `003_usuario_empresas.sql` em `campax_dev`, conferir; depois em `campax`;
3. `npx prisma generate`, `npm run build` do backend e do frontend, `pm2 restart` dos dois;
4. conferir: login do superadmin da Senap sem escolher empresa (token antigo continua valendo), `/platform/usuarios`
   lista os 5 usuários com uma empresa cada;
5. `refresh-dev-db.sh all`.

## Notas da implementação (2026-09-26)

- **Teste da migração:** em vez de um teste Vitest sobre `campax_test`, `003_usuario_empresas.sql` foi conferido
  rodando em `campax_dev` (cópia com dados reais): a checagem de contagem do próprio script (vínculos criados =
  perfis com `empresa_id`) cobre a divergência, e rodá-lo de novo é recusado (registro em `schema_scripts`).
- **`prismaForEmpresa`** (`backend/src/tenant/prismaForEmpresa.ts`): `profiles` saiu de `DIRECT_MODELS` e ganhou
  filtro próprio via `usuario_empresas` (`{ vinculos: { some: { empresa_id } } }` em leituras e updates; um
  `create` de `profiles` pelo `req.db` cria o vínculo com a empresa de quem criou). `usuario_empresas` em si não
  é acessado por `req.db` — só por `prisma` bruto nas rotas `/platform/usuarios` e `/users`.
  Ver `backend/test/no-raw-prisma.test.ts` para a lista de arquivos que podem importar `prisma` bruto.
- **Vincular um `platform_admin`** por `PUT /platform/usuarios/:id/empresas/:empresaId` responde **404** (não
  400): a lista de usuários vinculáveis da plataforma já exclui `platform_admin`, então o id simplesmente não é
  encontrado — o trigger do banco (`usuario_empresas_sem_platform_admin`) nunca chega a ser exercitado por essa
  rota.
- `backend/scripts/check-isolamento.sql` passou a ter 7 checagens: a checagem 6 agora é "platform_admin com
  vínculo" (zero linhas esperadas); a antiga "velório criado por usuário de outra empresa" foi removida (deixou
  de fazer sentido — a autoria de um velório não muda com o vínculo do usuário).
- Teste final do backend: **237 testes**, todos passando.
- **Implantação (2026-09-26):** backup `campax-20260926-1531.dump`; `restore-check.sh` com contagens idênticas;
  `003_usuario_empresas.sql` em `campax` — `NOTICE: 003: 5 vínculos criados`; `check-isolamento.sql` com 0
  problemas em todas as 7 checagens; todos os usuários existentes mantiveram exatamente uma empresa. Não há
  script de reversão (down): rollback é restaurar esse backup com `pg_restore` e implantar o commit anterior.
  Verificação em navegador (Playwright) dos 6 cenários do roteiro passou em `campax_dev`.
- **Decisões da revisão final:** "Trocar empresa" aparece só no endereço geral (não no subdomínio, onde a
  empresa já é fixa pelo host); "Remover da empresa" em `/admin/usuarios` só é oferecido a usuários
  compartilhados (com outra empresa), como no desenho da spec; a migração foi verificada rodando em
  `campax_dev` em vez de um teste Vitest (ver acima); vincular um `platform_admin` pela API responde 404 (ver
  acima).
- **Pendências resolvidas (2026-09-26, branch `fix/usuarios-globais-pendencias`):**
  - `created_by` do vínculo criado pelo superadmin (`POST /users`): `prismaForEmpresa(empresaId, profileId)`
    grava quem chamou.
  - Páginas da plataforma tratam a promise de `mutateAsync` (o toast de erro continua vindo do hook);
    "Remover" empresa na página do usuário pede confirmação.
  - Empresa ativa suspensa com outra empresa ativa: `resolverEmpresaAtiva` devolve `provisorio`; as rotas de
    empresa respondem 403 com `code: 'escolher_empresa'`, e o `apiClient` dispara um evento que recarrega
    `/auth/me` — o `ProtectedRoute` leva para `/admin/escolher-empresa` (no subdomínio, para o login, que recusa
    a empresa suspensa). Sem outra ativa, 403 "Empresa suspensa" como antes.
  - Regra U8 atômica: `assertNaoDeixaSemSuperadmin(tx, profileId, empresaIds)` roda dentro da transação da
    mudança, com `pg_advisory_xact_lock(1008, hashtext(empresa_id))` por empresa (ordenadas, sem deadlock) e a
    conferência em SQL depois do lock. Coberto por `test/vinculos/concorrencia.test.ts` (antes da correção, as
    duas ações simultâneas passavam).

## Fora de escopo

- Papel diferente por empresa (decisão U2; se um dia for preciso, o papel migra para `usuario_empresas`).
- Convite por e-mail e "esqueci minha senha" (o sistema não envia e-mails).
- Superadmin adicionar à empresa dele alguém que já existe (decisão U3).
- Personificação ("entrar como empresa"), Q3.

## Critérios de aceite

- A plataforma cria um usuário sem empresa, vincula a duas funerárias, e ele escolhe a empresa ao entrar em
  `app2`; em `<slug>.campax.com.br` entra direto na funerária do endereço.
- Agindo por uma empresa, ele não vê nada da outra; desvinculado, perde o acesso na próxima ação.
- O superadmin de uma das funerárias não consegue redefinir a senha, desativar nem mudar o papel desse usuário,
  mas consegue tirá-lo da empresa dele.
- Nenhuma ação deixa uma empresa sem superadmin ativo.
- Todos os testes do backend passam; os usuários existentes continuam entrando como antes.
