# Spec 03 — F2: Isolamento entre empresas no backend

> Planejamento geral: [00-planejamento.md](00-planejamento.md) · Depende de: [02-schema-e-migracao.md](02-schema-e-migracao.md)
> Status: **implementada em 2026-09-23** (branch `feat/multiempresa`); 74 testes passando.

## Objetivo

Garantir que **nenhuma requisição de um usuário da empresa A consiga ler, criar, alterar ou apagar dados
da empresa B**, nem pelas rotas autenticadas nem pelas públicas. Deixar isso comprovado por testes
automatizados. Ao final desta fase, o backend volta a compilar sobre o schema da F1.

## Contexto (verificado no código em 2026-09-23)

Além da falta de filtro por empresa (esperada, porque o sistema era de uma empresa só), a leitura das rotas
revelou problemas que, com várias empresas, viram falhas de isolamento:

| # | Onde | Problema |
|---|------|----------|
| C1 | `cameras.ts` POST/PATCH, `velorios.ts` POST/PATCH, `homenagensTemplates.ts` POST/PATCH | `data: req.body` repassado direto para o Prisma (**mass assignment**). Quem manda `empresa_id` no corpo move o registro para outra empresa; também dá para sobrescrever `token_acesso`, `created_by`, `mediamtx_path`, `webrtc_url`. |
| C2 | Todas as rotas `/:id` | `findUnique/update/delete({ where: { id } })` sem checar a empresa (IDOR). |
| C3 | `cameras.ts` `POST /bulk-status` | Atualiza o status de qualquer id recebido. |
| C4 | `velorios.ts` `DELETE /:velorioId/homenagens/:id` | Apaga a homenagem pelo id, **sem conferir** se ela é daquele velório. |
| C5 | `velorios.ts` `POST /:id/foto` | O multer grava o arquivo em `uploads/falecido-fotos/<id>/` **antes** de qualquer checagem; um usuário de outra empresa conseguiria sobrescrever a foto no disco mesmo se o `update` falhasse. |
| C6 | `salas.ts` POST/PATCH (`camera_ids`) | Vincula câmeras de qualquer empresa à sala. |
| C7 | `velorios.ts` `GET /audit` | Busca nomes e e-mails de `profiles` por id sem filtro. |
| C8 | `public.ts` `GET /velorios/:token` (`velorioInclude`) | Retorna `cameras.rtsp_url` (normalmente com usuário e senha da câmera) para **visitantes anônimos**. As páginas públicas não usam esse campo. **Já é um vazamento hoje**, independente do multiempresa. |
| C9 | `public.ts` POST de visitantes, homenagens e access-logs | Não verificam se o velório existe; a F1 exige `empresa_id` no access log, que precisa vir do velório. |
| C10 | `public.ts` `/terms/accepted` e `POST /terms-acceptances` | Aceite procurado e gravado sem empresa; `velorio_id` é opcional. |
| C11 | `users.ts` | Lista e altera **todos** os perfis; `PATCH /:id/role` aceita qualquer valor do enum, inclusive `platform_admin` depois da F1. |

## Desenho

### 1. Contexto de empresa na requisição

- O JWT **continua** com `{ sub }`. A empresa sai do **perfil no banco**, que o `requireAuth` já carrega a cada
  requisição. Assim, uma troca de empresa ou uma suspensão vale na hora, sem esperar o token (7 dias) expirar.
  *(Isso substitui a ideia de "JWT com `empresa_id`" do planejamento, seção 3.3.1.)*
- `requireAuth` passa a carregar `profiles` com `include: { empresa: true }` e:
  - Nega com 401 se o perfil estiver inativo (já faz isso hoje).
  - Nega com **403 `{ error: 'Empresa suspensa' }`** se `empresa.ativo = false`.
  - Grava `req.profile` e `req.empresa` (`null` para `platform_admin`).
- `POST /auth/login` aplica a mesma checagem de empresa suspensa, para mostrar a mensagem já na tela de login.
- `GET /auth/me` passa a responder `{ profile, empresa }`, com os campos públicos da empresa (id, nome_exibicao, slug,
  hash_publico, logo_url, cores). A F4 usa isso.

### 2. `ROLE_ORDER` e `requireTenant`

```ts
const ROLE_ORDER = { platform_admin: 5, superadmin: 4, admin: 3, operador: 2, viewer: 1 };
```

- `requireTenant`: 403 se `req.empresa` for nulo. É obrigatório em **todos** os routers de empresa, antes do
  `requireRole`. Sem ele, o `platform_admin` (nível 5) passaria em `requireRole('viewer')`.
- Para não esquecer, cada router de empresa usa um guarda único: `router.use(tenantGuard('viewer'))`, que
  equivale a `requireAuth + requireTenant + requireRole('viewer')`.
- `requirePlatformAdmin` fica pronto para a F3.

### 3. `req.db`: Prisma com filtro de empresa

`backend/src/tenant/prismaForEmpresa.ts` exporta `prismaForEmpresa(empresaId)`, que devolve
`prisma.$extends(...)` e é criado por requisição no `tenantGuard` como `req.db`.
O Prisma 5 aceita campos não únicos no `where` de `findUnique/update/delete` (`extendedWhereUnique` é GA
desde a versão 5.0), então o filtro entra direto, sem trocar operações.

**Modelos com `empresa_id` direto:** `cameras`, `sala_velorio`, `velorios`, `velorio_access_logs`,
`terms_acceptances`, `profiles`.

| Operação | Comportamento |
|----------|---------------|
| `findMany`, `findFirst`, `findUnique`, `count`, `aggregate`, `groupBy`, `updateMany`, `deleteMany` | `where = { AND: [where, { empresa_id }] }` (para `findUnique`: `{ ...where, empresa_id }`) |
| `update`, `delete`, `upsert` | `where.empresa_id = empresaId` (se não achar, o Prisma lança P2025 e a rota responde 404) |
| `create`, `createMany` | `data.empresa_id = empresaId`, **sobrescrevendo** o que vier |
| `update`, `updateMany` | remove `data.empresa_id` (empresa não muda por esta via) |

**Modelos filhos (sem coluna):** o filtro vai pela relação com o pai.

| Modelo | Filtro de leitura/`delete*`/`update*` |
|--------|---------------------------------------|
| `velorio_homenagens`, `velorio_visitantes`, `velorio_cameras` | `{ velorios: { empresa_id } }` |
| `sala_velorio_cameras` | `{ sala_velorio: { empresa_id } }` |

`create/createMany` em modelos filhos **não** são validados pela extensão. As rotas devem chamar antes
`assertPertence(req.db, 'velorios' | 'sala_velorio' | 'cameras', ids[])`, que conta os registros pelo `req.db`
e lança 404 se algum não for da empresa. A F1 já garante no banco a regra velório/sala.

**`homenagens_templates` (D6):**
- leitura: `empresa_id = X OR empresa_id IS NULL`
- `create`: força `empresa_id = X`
- `update/delete`: `where.empresa_id = X`, o que torna os modelos globais somente leitura pela empresa
  (tentar alterar um deles responde 404; eles são editados só pelo `/platform`, na F3).

**Qualquer outro modelo** (`empresas`, `n8n_chat_histories_campax`) acessado via `req.db` → **lança erro**.
Operações `$queryRaw`/`$executeRaw` também lançam erro no `req.db`.

**`include`/`select` aninhados não são filtrados pela extensão.** Isso é aceitável porque as relações só
apontam para registros da mesma empresa: a F1 garante velório/sala e access log/velório no banco, e os passos 5
e C6 garantem câmera/sala. Fica registrado como invariante e é coberto por teste.

### 4. Restrição ao `prisma` cru

- `backend/src/prisma.ts` continua exportando `prisma`, mas só estes arquivos podem importá-lo: `routes/public.ts`,
  `routes/auth.ts`, `routes/platform.ts` (F3), `auth/middleware.ts`, `tenant/*`, `lib/token.ts` e `scripts/*`.
- Teste `backend/test/no-raw-prisma.test.ts`: percorre `src/` e falha se algum outro arquivo importar `../prisma`.
  Custa pouco e pega o esquecimento mais provável.

### 5. Mudanças por rota

Regra geral: trocar `prisma.` por `req.db.` e mapear o erro P2025 para 404, via um helper `handlePrismaError(res, err)`
que também trata P2002 (409) e P2003 (409/400).

**Lista branca de campos (resolve C1):** `lib/pickFields.ts`, com `pick(body, [...])` por entidade:

| Entidade | Campos aceitos do cliente |
|----------|---------------------------|
| cameras | `nome`, `rtsp_url`, `ativo` |
| velorios | `nome_falecido`, `data_inicio`, `data_fim`, `sala_velorio_id`, `status`, `responsavel_velorio_nome`, `contato_whatsapp_responsavel`, `data_nascimento`, `data_falecimento`, `mensagem_homenagem`, `data_sepultamento`, `local_sepultamento`, `google_maps_url_sepultamento` |
| sala_velorio | os campos de endereço, contato, `nome_sala_velorio` e `slug` (lista exata tirada do formulário `SalaManagement.tsx`) |
| homenagens_templates | `titulo`, `mensagem` |

`token_acesso`, `created_by`, `foto_falecido`, `mediamtx_path`, `webrtc_url`, `status` da câmera e `empresa_id`
nunca vêm do cliente. Antes de fechar a lista, conferir no frontend quais campos cada formulário envia hoje, para não
quebrar nenhuma tela.

| Rota | Mudança |
|------|---------|
| `cameras` | `req.db`; lista branca; `bulk-status` usa `updateMany({ where: { id } })` por item, e ids de outra empresa são ignorados sem erro (C3) |
| `salas` | `req.db`; `assertPertence(cameras, camera_ids)` antes do `createMany` (C6); o `deleteMany` dos vínculos só roda depois de confirmar que a sala é da empresa |
| `velorios` | `req.db` em tudo. `creation-stats` e `audit` ficam filtrados automaticamente, e a busca de `profiles` no audit usa `req.db` (C7). `DELETE /:velorioId/homenagens/:id` apaga com `where: { id, velorio_id: velorioId }` via `req.db` (C4). `POST /` com `sala_velorio_id` de outra empresa: a FK composta falha e a rota responde 400 `Sala inválida` |
| `velorios` `POST /:id/foto` | middleware `assertVelorioDaEmpresa` **antes** do multer (C5); destino passa a ser `uploads/<empresa_id>/falecido-fotos/<velorio_id>/`; a URL gravada fica `/files/<empresa_id>/falecido-fotos/<id>/foto.ext`. As URLs antigas (`/files/falecido-fotos/...`) continuam servidas pelo `express.static` |
| `accessLogs`, `access-stats` | `req.db` (tem `empresa_id` direto) |
| `visitantes` | `req.db` (filtro pela relação `velorios`) |
| `termsAcceptances` | `req.db` |
| `homenagensTemplates` | `req.db` com a regra de globais acima; lista branca |
| `users` | `req.db` (`profiles` filtrado). `role` aceito só dentro de `['superadmin','admin','operador','viewer']`, e **nunca** `platform_admin` (C11). `POST` força a empresa. Um usuário não pode desativar a si mesmo nem rebaixar o próprio papel (evita empresa sem nenhum superadmin) |

### 6. Rotas públicas (`public.ts`)

Continuam usando o `prisma` cru, mas **toda** consulta nasce de um identificador público (token, hash,
id de velório) e resolve a empresa a partir dele.

- `velorioPublicInclude`: igual ao `velorioInclude`, **sem `rtsp_url`** (C8). O `velorioInclude` completo fica só para
  as rotas autenticadas.
- `GET /public/velorios/:token`: inclui `empresa` (campos públicos). Se `empresa.ativo = false`, responde 404
  com `error: 'Indisponível'`.
- **`GET /public/velorios/id/:id`** (nova): mesma resposta de `/public/velorios/:token`, buscando pelo id.
  Hoje, `VelorioViewing.tsx` (a página pública `/velorio/:id`) chama a rota **autenticada** `/velorios/:id`, que
  responde **401 para visitantes sem login** (verificado com curl em 2026-09-23). Ou seja, a página de transmissão
  está quebrada para o público no stack novo. Se isso não for corrigido antes na `main`, a correção entra aqui (C12).
- `GET /public/empresas/:hash`: campos públicos da empresa ativa, ou 404.
- `GET /public/empresas/:hash/salas/:slug`: substitui `GET /public/salas/:slug` (que é **removida**). A resposta
  continua `{ sala, atual, proximo }` e ganha `empresa`.
- Helper `loadPublicVelorio(id)`: `{ id, empresa_id }` do velório com a empresa ativa, ou 404. Usado em (C9):
  - `GET/POST /velorios/:id/visitantes*`, `GET/POST /velorios/:id/homenagens`
  - `POST /velorios/:id/access-logs`: grava `empresa_id` do velório. Se o velório não existir, continua respondendo
    `success: true` sem gravar (logging é best-effort, como hoje)
- Termos (C10):
  - `GET /public/terms/accepted?celular&version&velorio_id`: `velorio_id` passa a ser **obrigatório**; filtra por
    `empresa_id` do velório.
  - `POST /public/terms-acceptances`: `velorio_id` obrigatório; `empresa_id` vem do velório. Os 3 registros
    antigos sem velório continuam válidos no banco (histórico).
  - Os dois chamadores atuais (`PublicAccess.tsx` e `RegistrarHomenagemDialog.tsx`) já têm o `velorio_id`
    na mão quando chamam; o ajuste no frontend é trivial e entra na F4.

### 7. Socket.IO

`presence:join/track` e `homenagens:join` passam a validar que o `velorioId` é um UUID de um velório existente
de empresa ativa (com um cache em memória de 60 s por id). Senão, ignoram o evento. Não há dado sensível
trafegando, então isso é só higiene.

### 8. Mensagens e códigos de erro

- Recurso de outra empresa: **404** (não 403), para não revelar que o id existe.
- Empresa suspensa: 403 no admin, 404 `Indisponível` no público.

## Testes de isolamento (Vitest, `campax_test`)

`backend/test/isolamento/` com um fixture `duasEmpresas()`: cria as empresas A e B, cada uma com superadmin, admin,
operador e viewer, 1 sala, 1 câmera, 1 velório, 1 homenagem, 1 visitante, 1 access log, 1 aceite de termo e 1 template;
mais 1 template global e 1 `platform_admin`.

Um teste por item, sempre **como usuário de A, mirando dados de B**:

- **Leitura:** `GET` de cada listagem (`/cameras`, `/salas`, `/velorios`, `/velorios/audit`, `/velorios/creation-stats`,
  `/access-logs`, `/access-stats/overall`, `/visitantes`, `/terms-acceptances`, `/users`, `/homenagens-templates`)
  não contém nenhum id de B, e as contagens batem só com A. `GET /velorios/:idB` e `GET /velorios/:idB/access-stats` → 404.
- **Escrita:** `PATCH`/`DELETE` de câmera, sala, velório, template e usuário de B → 404, e o registro de B continua
  intacto (conferido com o `prisma` cru). `DELETE /velorios/:idA/homenagens/:homenagemB` → 404 (C4).
  `POST /cameras/bulk-status` com id de B não muda B (C3).
- **Mass assignment:** `POST`/`PATCH` com `empresa_id: B` no corpo → o registro fica em A (C1).
  `PATCH /velorios/:id` com `token_acesso` → o token não muda.
- **Vínculos:** sala de A com `camera_ids` de B → 404 (C6); velório de A com `sala_velorio_id` de B → 400.
- **Upload:** `POST /velorios/:idB/foto` → 404 e **nenhum arquivo criado** no disco (C5).
- **Papéis:** `platform_admin` em qualquer rota de empresa → 403. `superadmin` de A promovendo alguém a `platform_admin`
  → 400. Superadmin desativando a si mesmo → 400.
- **Templates:** A vê os próprios + os globais, não os de B; `PATCH`/`DELETE` num global → 404.
- **Empresa suspensa:** login → 403; token já emitido → 403; `GET /public/velorios/:tokenB` → 404.
- **Público:** `/public/velorios/:token` não contém `rtsp_url` (C8); `/public/empresas/:hashA/salas/:slugB` → 404 mesmo
  com slug igual em A e B; aceite de termos dado em B não conta em `terms/accepted` com `velorio_id` de A (C10);
  access log de um velório de B grava `empresa_id = B`.
- **Guarda do `prisma` cru:** `no-raw-prisma.test.ts`.

## Notas da implementação (2026-09-23)

- **Arquivos:** `auth/middleware.ts` (`tenantGuard`, `requireTenant`, `requirePlatformAdmin`, empresa carregada do
  banco), `tenant/prismaForEmpresa.ts` (extensão + `assertPertence`), `lib/http.ts` (`handleError`, `pick`, listas
  brancas), `lib/empresa.ts` (campos públicos), e todas as rotas de empresa, `auth.ts`, `public.ts` e `realtime/socket.ts`.
- **O `req.db` é criado no `requireTenant`**, não num middleware separado. `socket.ts` também usa o `prisma` cru (para
  validar velórios) e entrou na lista de permitidos do `no-raw-prisma.test.ts`.
- **Velório com sala de outra empresa responde 404** (via `assertPertence` antes da escrita), não 400. Mais simples e
  consistente com "recurso de outra empresa = 404"; a FK composta continua como segunda barreira.
- **`app.set('trust proxy', 'loopback, linklocal, uniquelocal')`:** o `req.ip` passa a ser o IP real do visitante
  (antes, o `X-Forwarded-For` era lido à mão e podia ser forjado pelo cliente, o que contamina os logs usados como prova
  LGPD), e o `req.protocol` vira `https` atrás do nginx-proxy-manager. **Isso confirma e corrige** a suspeita da F0:
  as URLs de foto eram geradas como `http://` e seriam bloqueadas como conteúdo misto.
- **Bug anterior corrigido:** `data_nascimento`/`data_falecimento` vindos do formulário como `"YYYY-MM-DD"` eram
  rejeitados pelo Prisma (colunas `@db.Date`). Salvar um velório com essas datas falhava já antes do multiempresa.
- **O `foto_falecido` que o frontend reenvia por PATCH depois do upload é ignorado** (fora da lista branca), porque a
  rota de upload já grava o campo. O reenvio pode ser removido do frontend na F4.
- **Teste de mutação:** com o filtro da extensão desligado de propósito, 31 dos testes falham; com um import do `prisma`
  cru numa rota, o `no-raw-prisma` falha. Os testes pegam de fato um vazamento.
- **Verificação contra dados reais** (`campax_dev`, servidor de dev e superadmin real): todas as listagens do admin
  retornam os mesmos totais de antes (5 câmeras, 5 salas, 37 velórios, 844 acessos, 796 visitantes, 38 aceites, 4
  usuários, 2 modelos); criar, editar e excluir câmera, sala (com câmera) e velório, e o upload de foto, funcionam com os
  payloads do frontend; o link de sala antigo (`/d2788b07/<slug>`) resolve pela rota nova; o token público não traz
  `rtsp_url`; o Socket.IO continua funcionando.
- **Quebras esperadas no frontend atual** (corrigidas na F4): a página do link de sala (a rota antiga
  `/public/salas/:slug` foi removida) e o aceite de termos (`velorio_id` passou a ser obrigatório).

## Fora de escopo

- Rotas `/platform/*` (F3). Aqui só `requirePlatformAdmin` e o papel `platform_admin` no middleware.
- Mudanças no frontend (F4), exceto a observação sobre o `velorio_id` nos termos.
- Validação de corpo com biblioteca de schema (zod etc.): a lista branca resolve o problema de segurança. Validação
  de formato fica para depois.
- Checagem de câmera (camera-status-api, F6).

## Critérios de aceite

- [x] `npm run build` do backend passa sobre o schema da F1 (`tsc --noEmit` limpo).
- [x] Todos os testes de `backend/test/isolamento/` e `no-raw-prisma.test.ts` passam (74 no total).
- [x] Nenhum arquivo em `src/routes/` fora da lista permitida importa `../prisma`.
- [x] Com o `campax_dev` já migrado, as operações das telas de admin funcionam para a empresa inicial. Verificado pela
      API, com os mesmos payloads do frontend, e não pelo navegador. Os únicos quebrados esperados são a página pública de
      sala e o aceite de termos, corrigidos na F4.
- [x] `/public/velorios/:token` não retorna `rtsp_url`.
- [x] Planejamento (seção 3.3.1) atualizado: a empresa vem do perfil no banco, e não do JWT.
