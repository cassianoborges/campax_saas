# Spec 04 — F3: Painel da plataforma

> Planejamento geral: [00-planejamento.md](00-planejamento.md) · Depende de: [03-backend-isolamento.md](03-backend-isolamento.md)
> Status: **implementada em 2026-09-23** e no ar em `app2` (backend: 23 testes novos, 97 no total).

## Objetivo

Dar ao `platform_admin` (a equipe Campax) uma área própria, `/platform`, para **cadastrar funerárias,
configurar a identidade visual de cada uma, criar os primeiros usuários, suspender ou reativar e acompanhar o uso**,
sem precisar mexer no banco. Também é onde ficam os modelos de homenagem globais (D6).

## Contexto

- Depois da F1, o único jeito de criar um `platform_admin` é o script `npm run create-platform-admin`.
  Isso continua assim: **nenhuma rota cria nem promove `platform_admin`.**
- Depois da F2, `platform_admin` recebe 403 em todas as rotas de empresa (`requireTenant`), e `requirePlatformAdmin`
  já existe. `routes/platform.ts` está na lista de arquivos que podem usar o `prisma` cru.
- Frontend: `ProtectedRoute` compara só `ROLE_ORDER`, então um `platform_admin` (nível 5) **passaria** em todas as
  rotas `/admin/*`. O login sempre redireciona para `/admin/dashboard`. `AdminLayout` tem o menu fixo da empresa.
  `UserRole` no frontend não conhece `platform_admin`.
- Não existe envio de e-mail no sistema. Senhas iniciais são definidas por quem cria o usuário (como já é em
  `/admin/usuarios` hoje).

## Decisões desta spec

| # | Decisão |
|---|---------|
| P1 | `slug` e `hash_publico` são **imutáveis** depois de criados. Trocar o `hash_publico` quebraria links e QR codes impressos; o `slug` vai para os caminhos do MediaMTX (F5) e para o subdomínio (F7). Se um dia for preciso trocar, é uma operação manual documentada, não um botão. |
| P2 | O `hash_publico` é **gerado pelo servidor** (8 caracteres `[a-z0-9]`, mesmo formato do atual, único). O `slug` é sugerido a partir do nome (como `generatePathName`, trocando `_` por `-`) e pode ser editado **só na criação**. |
| P3 | Criar empresa e primeiro `superadmin` é **uma operação só**, numa transação. Se o e-mail já existir, nada é criado. Evita empresa sem nenhum usuário. |
| P4 | Suspender não apaga nada. Efeitos: login e tokens bloqueados (F2), páginas públicas respondem "indisponível" (F2) e câmeras saem do MediaMTX (F5). Se houver velório **ao vivo agora**, a UI exige confirmação explícita. |
| P5 | Logo: PNG, JPG ou WEBP, até 2 MB. **SVG não é aceito**, porque é servido pelo `/files` e poderia carregar script. |
| P6 | O `platform_admin` pode redefinir a senha e ativar/desativar usuários de uma empresa (é o suporte). Ele **não** entra no painel da empresa. Personificação é pós-MVP (Q3). |
| P7 | Sem trilha de auditoria das ações da plataforma no MVP (há um único operador, a própria Campax). Cada ação gera um `console.log` estruturado (`[platform] <acao> empresa=<id> por=<profile_id>`), que vai para o log do PM2. |

## API — `backend/src/routes/platform.ts`

Todas com `requireAuth + requirePlatformAdmin`, montadas em `/platform`.

### Empresas

| Método e rota | Descrição |
|---------------|-----------|
| `GET /platform/empresas` | Lista com `id, nome, nome_exibicao, slug, hash_publico, ativo, created_at` + contagens: `usuarios`, `cameras`, `salas`, `velorios`, `velorios_ao_vivo` (agora), `acessos_30d`. Contagens via `groupBy` por `empresa_id` (5 consultas no total, não uma por empresa). |
| `GET /platform/empresas/:id` | Todos os campos + as mesmas contagens. |
| `POST /platform/empresas` | Corpo: `{ empresa: { nome, nome_exibicao, slug?, cnpj?, whatsapp_contato?, email_contato?, cor_primaria?, cor_secundaria? }, superadmin: { email, password, full_name? } }`. Gera o `hash_publico` e cria tudo numa transação (P3). Respostas: 409 para slug ou e-mail duplicado, 400 para formato inválido (as CHECKs da F1 também valem). |
| `PATCH /platform/empresas/:id` | Lista branca: `nome, nome_exibicao, cnpj, whatsapp_contato, email_contato, cor_primaria, cor_secundaria`. `slug`, `hash_publico`, `ativo`, `logo_url` e `dominio_customizado` são ignorados (P1). |
| `PATCH /platform/empresas/:id/ativo` | `{ ativo: boolean }`. A resposta inclui `velorios_ao_vivo` para o log; a confirmação (P4) é feita na UI. |
| `POST /platform/empresas/:id/logo` | multipart `file` → `uploads/<empresa_id>/branding/logo-<timestamp>.<ext>`, grava `logo_url`. O timestamp no nome evita cache velho no navegador. P5. |
| `DELETE /platform/empresas/:id/logo` | Limpa `logo_url` (volta ao logo padrão Campax). O arquivo fica no disco. |

### Usuários de uma empresa

| Método e rota | Descrição |
|---------------|-----------|
| `GET /platform/empresas/:id/usuarios` | Perfis da empresa, sem `password_hash`. |
| `POST /platform/empresas/:id/usuarios` | `{ email, password, role, full_name? }`; `role` só entre os 4 papéis de empresa. |
| `PATCH /platform/empresas/:id/usuarios/:uid/senha` | `{ password }` (mínimo 8 caracteres). |
| `PATCH /platform/empresas/:id/usuarios/:uid/ativo` | `{ is_active }`. Não permite desativar o **último superadmin ativo** da empresa (400). |

Todas conferem se `:uid` pertence a `:id` (senão 404).

### Modelos de homenagem globais (D6)

`GET/POST/PATCH/DELETE /platform/homenagens-templates`: só registros com `empresa_id IS NULL`; lista branca
`titulo, mensagem`. As empresas já veem esses modelos em modo somente leitura (F2).

### Resposta de `/auth/me` e `/auth/login` para `platform_admin`

`{ profile, empresa: null }`, o que já vale pela F2. O frontend usa isso para decidir para onde redirecionar.

## Frontend

### Papéis e rotas

- `useRole.ts`: `UserRole` ganha `platform_admin`; `ROLE_ORDER.platform_admin = 5`.
- `useAuth`: expõe `isPlatformAdmin`.
- `ProtectedRoute` ganha `scope: 'empresa' | 'platform'` (padrão `'empresa'`):
  - `scope='empresa'` + `platform_admin` → redireciona para `/platform`.
  - `scope='platform'` + qualquer outro papel → redireciona para `/admin/dashboard`.
  - A checagem de `requiredRole` continua igual dentro do escopo.
- `AdminLogin`: depois do login (e no redirecionamento de quem já está logado), `platform_admin` vai para `/platform`
  e os demais para `/admin/dashboard`.
- O login continua sendo um só (`/admin`).

### `PlatformLayout`

Componente próprio, **não** reaproveita o `AdminLayout`, porque o menu é outro. Mesma identidade visual Campax do admin
(fundo escuro, dourado, mesmas fontes), com um rótulo "Plataforma" bem visível no topo, para não confundir com o painel
de uma funerária. Menu: **Empresas**, **Modelos de homenagem**, **Sair**. Responsivo como o `AdminLayout` (Sheet no
celular).

### Páginas

| Rota | Conteúdo |
|------|----------|
| `/platform` | Tabela de empresas: nome de exibição, slug, status (badge Ativa/Suspensa), contagens (câmeras, salas, velórios, ao vivo agora, acessos 30d), criada em. Busca por nome. Botão "Nova empresa". No celular, vira cards. |
| `/platform/empresas/nova` | Formulário em 2 blocos: **Empresa** (nome, nome de exibição, slug sugerido e editável, CNPJ, contatos) e **Primeiro superadmin** (nome, e-mail, senha com botão "gerar"). Depois de criar, mostra o link público base (`<origin>/<hash_publico>/...`) e as credenciais **uma única vez**, com botão copiar, e vai para o detalhe. |
| `/platform/empresas/:id` | Abas: **Dados** (edição; slug e hash só leitura, com uma explicação curta do porquê), **Identidade visual** (upload/remoção do logo, 2 seletores de cor com campo hex, e uma **prévia** com um card do velório e um botão nas cores escolhidas), **Usuários** (lista, criar, redefinir senha, ativar/desativar), **Uso** (as contagens). No topo, o botão **Suspender/Reativar** com um diálogo de confirmação que mostra os efeitos (P4) e, se houver, o aviso "N velório(s) ao vivo agora". |
| `/platform/modelos-homenagem` | CRUD dos modelos globais, no mesmo padrão visual de `HomenagensTemplatesManagement.tsx`. |

Hooks novos (TanStack Query): `usePlatformEmpresas`, `usePlatformEmpresa(id)`, `usePlatformUsuarios(id)`,
`usePlatformTemplates`, todos em `src/hooks/usePlatform*.ts`, usando `apiClient`.

A **aplicação** da identidade visual nas páginas públicas e no admin da empresa **não** faz parte desta fase (é a F4).
Aqui só se cadastra e se vê a prévia.

## Testes

**Backend (Vitest, `backend/test/platform/`):**
- Qualquer papel de empresa (inclusive `superadmin`) em qualquer rota `/platform/*` → 403. Sem token → 401.
- `POST /platform/empresas` cria a empresa + superadmin; o superadmin consegue logar e vê a empresa **vazia**
  (nenhum dado das outras). Com e-mail duplicado → 409 e **nenhuma** empresa criada (P3).
- `hash_publico` gerado no formato certo e único; `PATCH` com `slug` ou `hash_publico` não altera nada (P1).
- Suspender → login do superadmin da empresa dá 403 e `/public/velorios/:token` dá 404; reativar → volta a funcionar.
- Logo: PNG aceito, SVG rejeitado, arquivo acima de 2 MB rejeitado; `logo_url` aponta para `/files/<empresa_id>/branding/...`.
- Usuários: `role: 'platform_admin'` → 400; `:uid` de outra empresa → 404; desativar o último superadmin → 400.
- Modelos globais: criados aqui aparecem em `GET /homenagens-templates` das empresas A e B, e continuam
  somente leitura para elas.

**Frontend (manual, com o checklist na PR):** login como `platform_admin` cai em `/platform` e, digitando
`/admin/velorios` na URL, volta para `/platform`; login de superadmin digitando `/platform` volta para
`/admin/dashboard`; criar empresa → logar como o superadmin novo em outra aba → painel vazio; testar em largura de
celular.

## Notas da implementação (2026-09-23)

- **Arquivos:** `backend/src/routes/platform.ts` (+ `test/platform/platform.test.ts`); frontend: `hooks/usePlatform.ts`,
  `components/PlatformLayout.tsx` (com `StatusBadge`), `pages/platform/*`, rotas `/platform*` no `App.tsx` com
  `ProtectedRoute scope="platform"`.
- **Logo:** recebido em memória (multer `memoryStorage`, 2 MB, só PNG/JPG/WEBP) e gravado depois de conferir que a
  empresa existe.
- **Contagens de uso:** 6 `groupBy` por requisição, não uma consulta por empresa.
- **Tela de modelos da funerária:** os modelos globais aparecem com o selo "Modelo Campax" e sem os botões de editar e
  excluir (antes, clicar dava 404).
- **Acessibilidade:** os campos dos formulários da plataforma ficam dentro de `<label>`. Isso foi descoberto no teste de
  navegador, porque o campo não era encontrado pelo rótulo.
- **Verificado no navegador** (Playwright em `app2`, com um `platform_admin` e uma funerária temporários, removidos em
  seguida): login leva a `/platform`; `/admin/velorios` volta para `/platform`; cadastro de empresa + superadmin mostra
  as credenciais e o link base; envio de logo e cores salvas, com prévia; o superadmin novo loga, cai em
  `/admin/dashboard`, não vê nenhum velório da Campax e, em `/platform`, volta para o painel dele; suspender (diálogo com os
  efeitos) derruba a sessão dele; lista e detalhe funcionam em 375 px.
- **Não há ainda nenhum `platform_admin` de verdade no banco `campax`.** Crie o seu com
  `cd backend && npm run create-platform-admin -- --email <seu e-mail>`.
- **Efeito "câmeras saem do servidor de vídeo" (P4):** o texto já aparece no diálogo, mas só vale depois da F5 (hoje o
  mediamtx-sync ainda não olha `empresas.ativo`).

## Fora de escopo

- Personificação ("entrar como empresa"), Q3.
- Limites por plano, cobrança, contrato.
- Envio de e-mail de boas-vindas ou de redefinição de senha.
- Gerenciar `platform_admin` pela UI (continua pelo script).
- Excluir empresa (só suspender; a exclusão definitiva por LGPD é uma operação manual futura).
- Domínio customizado (F7).

## Critérios de aceite

- [x] Todas as rotas da tabela de API existem e os testes de `backend/test/platform/` passam, junto com os de isolamento da F2.
- [x] Um `platform_admin` cadastra uma funerária nova com logo e cores, e o superadmin dela consegue logar e ver o
      painel vazio, sem tocar no banco.
- [x] Suspender e reativar funcionam com os efeitos da P4 que pertencem à F2 (a remoção das câmeras do MediaMTX é
      verificada na F5).
- [x] Nenhum usuário de empresa consegue acessar `/platform` (API ou UI), e o `platform_admin` não consegue acessar
      `/admin/*`.
- [x] Telas utilizáveis em celular (largura de 375 px).
