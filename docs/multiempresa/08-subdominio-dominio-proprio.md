# Spec 08 — F7: Subdomínio por funerária

> Planejamento geral: [00-planejamento.md](00-planejamento.md) · Depende de: [04-plataforma.md](04-plataforma.md), [05-frontend-empresa-e-branding.md](05-frontend-empresa-e-branding.md), [06-mediamtx-sync.md](06-mediamtx-sync.md)
> Status: **implementada em 2026-09-24; no ar desde 2026-09-26** (`senap.campax.com.br`, Task 11 concluída).

## Objetivo

Cada funerária ganha o endereço **`<slug>.campax.com.br`**, com a identidade visual dela já na primeira tela:
o visitante digita o token numa página com a marca da funerária, e a equipe entra no painel por um login com o
logo dela. O endereço genérico (`app2.campax.com.br`) e os links já distribuídos continuam funcionando.

## Decisões

| # | Decisão |
|---|---------|
| S1 (Q6) | **Só subdomínio `<slug>.campax.com.br`**, com um certificado curinga. Domínio próprio do cliente (`aovivo.funerariax.com.br`) fica fora desta fase; a coluna `empresas.dominio_customizado` continua reservada e sem uso. |
| S2 | O subdomínio serve **tudo** da empresa: `/` (token), `/velorio/:id`, `/<sala>` e `/admin`. `/platform*` fica só no endereço genérico. |
| S3 | **O frontend identifica a empresa pelo endereço** e manda o slug ao backend nas chamadas em que isso importa. O backend usa esse slug **só para restringir** (nunca para ampliar acesso), por isso não precisa confiar nele. |
| S4 | No subdomínio, tudo fica **restrito àquela empresa**: login de outra empresa (ou de `platform_admin`) é recusado; token de velório de outra funerária é "não encontrado". |
| S5 | `app2.campax.com.br` continua como hoje: marca Campax, `/platform`, login de qualquer empresa, links `/<hash>/<sala>`. Nada é redirecionado. |
| S6 | Slugs reservados não podem ser usados por empresas (lista fixa no backend e no frontend). |
| S7 | O slug da empresa inicial (`campax`) é trocado **uma vez, antes do go-live**, pelo nome real da funerária (seção 5). Depois disso, a imutabilidade de P1 (spec 04) volta a valer. |

## Contexto (verificado em 2026-09-24)

- DNS de `campax.com.br` na **Cloudflare** (`reza`/`glen.ns.cloudflare.com`); não existe registro `*`.
- nginx-proxy-manager (Docker) já faz o SSL de `app2`, `backend`, `media2` e `apicam`.
- CORS: `app.use(cors({ origin: FRONTEND_ORIGIN }))` em `backend/src/app.ts`, lista fixa vinda do `.env`; o
  Socket.IO recebe a mesma lista (`initRealtime(server, FRONTEND_ORIGIN)` em `src/index.ts`).
- Uma empresa só (`slug = campax`). Salas: `anapolis_sala_1`, `niquelandia_sala_1`, `santana_sala_1`,
  `uruacu_sala_1`, `uruacu_sala_2` — nenhuma colide com rotas do frontend.
- Caminhos do MediaMTX: `<slug>-<10 aleatórios>` (`mediamtx-sync/src/paths.ts`). O `rotate-paths` só troca caminhos
  **fora** desse formato (`getCamerasWithLegacyPaths`), então não percebe uma troca de slug.
- Link fixo da sala aparece em `src/pages/SalaManagement.tsx` e `src/pages/platform/PlatformEmpresaDetalhe.tsx`.

## Desenho

### 1. Backend

**`backend/src/lib/empresaHost.ts` (novo)**
- `BASE_DOMAIN` — de `process.env.BASE_DOMAIN` (ex.: `campax.com.br`). Vazio = recurso desligado (nenhuma origem de
  subdomínio é aceita).
- `RESERVED_SLUGS` — `app`, `app2`, `backend`, `media`, `media2`, `apicam`, `api`, `www`, `admin`, `platform`,
  `check`, `mail`, `smtp`, `ftp`, `status`, `static`, `cdn`, `painel`, `suporte`. `isReservedSlug(slug)`.
- `isEmpresaOrigin(origin): Promise<boolean>` — `true` só se `origin` for exatamente
  `https://<slug>.<BASE_DOMAIN>` (sem porta, sem caminho), o slug não for reservado e existir empresa **ativa** com
  esse slug. Resultado em cache por slug por 60 s (positivo e negativo).

**CORS e Socket.IO**
- Função `corsOrigin(origin, callback)` usada pelos dois: aceita se não houver `origin` (mesmo comportamento do
  pacote `cors` hoje), se estiver em `FRONTEND_ORIGIN`, ou se `isEmpresaOrigin(origin)`.
- Empresa suspensa perde o CORS em até 60 s; o bloqueio de verdade continua sendo o `requireAuth` e as rotas
  públicas (que já ignoram empresa suspensa).

**Rotas públicas**
- `GET /public/empresas/slug/:slug` (nova): marca da empresa ativa — mesmos campos de `GET /public/empresas/:hash`
  (o `select` de `src/lib/empresa.ts`), incluindo `hash_publico`. Inexistente, reservada ou suspensa → 404.
- `GET /public/empresas/slug/:slug/salas/:salaSlug` (nova): mesma resposta de `GET /public/empresas/:hash/salas/:slug`.
  As duas chamam uma função comum que recebe a empresa já resolvida.
- `GET /public/velorios/:token`: parâmetro opcional `?empresa=<slug>`. Se presente e o velório não for dessa empresa
  → 404 (mesma resposta de token inexistente).

**Login**
- `POST /auth/login`: campo opcional `empresa_slug`. Se presente e o usuário for `platform_admin` ou de outra
  empresa → **401 com a mesma mensagem de senha errada** (não revela que o e-mail existe). A checagem é feita depois
  de validar a senha, para o tempo de resposta não diferenciar os casos.

**Validação de slugs**
- `POST /platform/empresas`: slug reservado → 400 ("Esse identificador é reservado").
- Salas (`POST`/`PATCH /salas`): slug `admin`, `velorio` ou `platform` → 400, porque viraria `/<sala>` no subdomínio.

### 2. Frontend

**`src/lib/hostEmpresa.ts` (novo)**
- `getHostSlug(): string | null` — se `location.hostname` for `<slug>.<VITE_BASE_DOMAIN>` (um nível só) e o slug não
  for reservado (mesma lista do backend), devolve o slug; senão `null`. `app2`, IP puro e `localhost` → `null`.
- Em desenvolvimento (`import.meta.env.DEV`), `?empresa=<slug>` na URL simula o subdomínio.

**`src/hooks/useHostEmpresa.ts` (novo)** — TanStack Query em `GET /public/empresas/slug/:slug` (`staleTime` longo).
Devolve `{ slug, empresa, isLoading, notFound }`; `slug === null` quando não há empresa no endereço.

**Telas**

| Tela | Com empresa no endereço |
|------|-------------------------|
| Qualquer rota, empresa inexistente/suspensa | Página "Endereço não encontrado" (componente único, sem marca). |
| `/` (`PublicAccess`) | `useBranding(empresa)` + `<EmpresaLogo>`; a busca do token manda `?empresa=<slug>`. |
| `/velorio/:id` | Sem mudança (a marca já vem do velório). |
| `/:salaSlug` (nova rota) | `SalaPublicLink` buscando por slug da empresa. Só existe no subdomínio; em `app2` a URL de um segmento continua caindo no `NotFound`. |
| `/:hashEmpresa/:salaSlug` | Continua funcionando no subdomínio (QR codes antigos). |
| `/admin` (`AdminLogin`) | Logo e nome da empresa, cores Campax (igual ao painel); o login manda `empresa_slug`. |
| `/admin/*` (`ProtectedRoute`) | Se `empresa.slug` da sessão ≠ slug do endereço → logout e volta ao login. |
| `/platform*` | Redireciona para `/admin`. |

**Links exibidos no painel** — em `SalaManagement` e `PlatformEmpresaDetalhe`, o link fixo da sala passa a mostrar
`https://<slug>.<VITE_BASE_DOMAIN>/<sala>` como principal e o link por hash como alternativo (QR codes já impressos).
Sem `VITE_BASE_DOMAIN`, mostra só o link por hash, como hoje.

### 3. Infraestrutura (uma vez)

1. **Cloudflare — token de API** (usuário): permissão *Zone → DNS → Edit*, só na zona `campax.com.br`. Vai direto no
   nginx-proxy-manager; não passa pelo chat nem pelo repositório.
2. **Cloudflare — DNS** (usuário): `*` tipo A → `2.29.41.124`, *DNS only* (nuvem cinza). Registros específicos
   (`app2`, `backend`, `media2`, `apicam`) continuam valendo acima do curinga.
3. **nginx-proxy-manager**: certificado Let's Encrypt `*.campax.com.br` + `campax.com.br` por desafio DNS
   (Cloudflare); host `*.campax.com.br` → `2.29.41.124:8080`, *Force SSL*, *HTTP/2*. Hosts específicos têm
   precedência sobre o curinga no nginx.
4. **Variáveis**: `BASE_DOMAIN=campax.com.br` em `backend/.env` (e `.env.development`); `VITE_BASE_DOMAIN=campax.com.br`
   no `.env` do frontend (exige `npm run build`). `FRONTEND_ORIGIN` não muda.

### 4. Ordem de implantação

1. Backend (rotas novas, CORS, validações) → `npm run build` + `pm2 restart campax-backend-velorio`.
2. Frontend → `npm run build` + `pm2 restart campax-frontend-velorio`. Sem DNS, nada muda em `app2`.
3. Troca do slug da empresa inicial (seção 5).
4. DNS + certificado + host no nginx-proxy-manager.
5. Checagem manual (Critérios de aceite).

### 5. Troca do slug da empresa inicial (uma vez, antes do go-live)

O slug `campax` geraria `campax.campax.com.br`. Como o slug é imutável pela interface (P1), a troca é manual:

1. `scripts/backup-db.sh`.
2. `UPDATE empresas SET slug = '<novo>' WHERE slug = 'campax';` — o novo slug segue `SLUG_RE`, não é reservado e não
   existe. O `hash_publico` **não muda** (links e QR codes continuam).
3. Caminhos do MediaMTX: ajustar `rotate-paths` para tratar também caminhos cujo prefixo **não é** o slug atual da
   empresa (`!path.startsWith(slug + '-')`), além dos que estão fora do formato. Rodar `npm run rotate-paths`
   (simulação), conferir, depois `-- --apply`, sem velório ao vivo. Os caminhos antigos continuariam funcionando
   (são aleatórios), mas o prefixo deve refletir a empresa dona.
4. Renomear também `nome`/`nome_exibicao` pelo `/platform` (isso já era pendência do piloto).

## Testes (Vitest, backend)

- `empresaHost`: aceita `https://<slug>.campax.com.br` de empresa ativa; recusa slug inexistente, empresa suspensa,
  slug reservado, `http://`, porta, dois níveis (`a.b.campax.com.br`), sufixo enganoso
  (`https://x.campax.com.br.evil.com`, `https://xcampax.com.br`); `BASE_DOMAIN` vazio recusa tudo.
- CORS via supertest: cabeçalho `Access-Control-Allow-Origin` presente para subdomínio válido, ausente para inválido;
  `FRONTEND_ORIGIN` continua aceito.
- `GET /public/empresas/slug/:slug` e `/salas/:salaSlug`: ativa → 200; suspensa, inexistente e reservada → 404.
- `GET /public/velorios/:token?empresa=`: mesma empresa → 200; outra empresa → 404; sem parâmetro → como hoje.
- `POST /auth/login` com `empresa_slug`: mesma empresa → 200; outra empresa → 401 com a mensagem genérica;
  `platform_admin` → 401; sem o campo → como hoje.
- `POST /platform/empresas` com slug reservado → 400; sala com slug `admin` → 400.
- mediamtx-sync: teste do novo filtro do `rotate-paths` (prefixo diferente do slug entra; formato antigo entra;
  prefixo correto não entra) — extrair o filtro para uma função pura.

O frontend não tem executor de testes (D5); `getHostSlug` é verificado manualmente com `?empresa=` em
desenvolvimento e com o subdomínio real depois da seção 3.

## Notas da implementação (2026-09-24)

Branch `feat/subdominio`, Tasks 1–10 do plano `docs/superpowers/plans/2026-09-24-subdominio-por-funeraria.md`.
O código segue o desenho; divergências e pendências:

- **Ordem de implantação ajustada:** no VPS, `BASE_DOMAIN` (backend) está ligado, mas `VITE_BASE_DOMAIN`
  (frontend) fica **vazio até o DNS e o certificado existirem** — com ele ligado, o painel já mostrava e copiava
  `https://<slug>.campax.com.br/<sala>`, que ainda não resolve. Ligar e rebuildar o frontend é o último passo
  da seção 3/Task 11. Assim `app2` segue igual (critério 5).
- Revisão final do branch: origem de CORS limitada a slugs de até 40 caracteres e cache de origens com teto
  (1000 entradas), para que `Origin` inventado não faça a memória crescer; no subdomínio, `/<hash>/<sala>` de
  outra empresa mostra "não encontrado".
- **Verificação manual no navegador** (`?empresa=` em desenvolvimento) não foi feita durante a implementação;
  fica para os critérios de aceite com o subdomínio real (Task 11).
- `HostEmpresaGate` só mostra "Endereço não encontrado" para 404; erro de rede/500 deixa a página seguir
  (falha aberta — o backend continua filtrando por empresa).
- O `HOST_SLUG` é calculado uma vez por carregamento: trocar `?empresa=` em desenvolvimento exige recarregar.
- Pendências menores anotadas: sem teste unitário isolado do callback de CORS (coberto ponta a ponta);
  checagem de sala reservada repetida no POST e no PATCH; +2 avisos `no-explicit-any` em `public.ts`
  (idioma já usado no arquivo); lista de slugs reservados duplicada backend/frontend sem teste de paridade;
  `/velorio/:id` não é filtrado pela empresa do host (IDs são UUID e só chegam após o token).

### Implantação (Task 11, 2026-09-25/26)

- Slug da empresa inicial `campax` → **`senap`** (backup `campax-20260925-0229.dump`), `rotate-paths --apply`
  (5 câmeras `senap-…`); `hash_publico` `d2788b07` mantido. Nome exibido "Senap" pelo `/platform` (primeiro
  `platform_admin` criado nesse dia).
- Cloudflare: registro `*` A → `2.29.41.124`, *DNS only*; token *Zone → DNS → Edit* só em `campax.com.br`,
  guardado apenas no nginx-proxy-manager.
- nginx-proxy-manager: certificado Let's Encrypt por desafio DNS — saiu só com `*.campax.com.br` (sem o
  `campax.com.br` puro, que não é usado pelo subdomínio), válido até 25/12/2026, renovação automática; host
  `*.campax.com.br` → `http://2.29.41.124:8080` com Force SSL, HTTP/2 e Websockets; HSTS deixado desligado.
  Os hosts exatos (`app2`, `backend`, `media2`, `apicam`) continuam tendo prioridade.
- Frontend: `VITE_BASE_DOMAIN="campax.com.br"`, build e restart.
- **Critérios de aceite (2026-09-26): 1–8 ok.** 1–7 conferidos pelo usuário no navegador em
  `senap.campax.com.br`, `naoexiste.campax.com.br`, `funeraria-piloto-teste.campax.com.br` (suspensa) e `app2`;
  pelo backend também: `/public/empresas/slug/<inexistente>` → 404, token da Senap com `?empresa=` de outra
  empresa → 404, login do `platform_admin` com `empresa_slug` → 401, CORS aceita `senap`/`app2` e recusa slug
  inexistente ou suspenso. 8: backend 171 testes, mediamtx-sync 20.

## Fora de escopo

- Domínio próprio do cliente (`dominio_customizado`), com certificado por domínio e verificação de DNS.
- Redirecionar `app2…/<hash>/<sala>` para o subdomínio.
- Trocar slug pela interface (continua operação manual, seção 5).
- Sessão compartilhada entre `app2` e subdomínios (cada origem tem seu `localStorage`; é esperado logar de novo).

## Critérios de aceite

1. `https://<slug>.campax.com.br/` mostra a marca da funerária; um token dela abre o velório; um token de outra
   empresa diz "não encontrado".
2. `https://<slug>.campax.com.br/<sala>` mostra a página da sala; `/<hash>/<sala>` também.
3. `https://<slug>.campax.com.br/admin`: usuário da empresa entra; usuário de outra empresa e `platform_admin`
   recebem "senha incorreta"; `/platform` redireciona para `/admin`.
4. `https://naoexiste.campax.com.br/` mostra "Endereço não encontrado" com certificado válido.
5. `https://app2.campax.com.br` funciona como antes (login de qualquer empresa, `/platform`, links por hash).
6. Presença e homenagens ao vivo (Socket.IO) funcionam no subdomínio.
7. Empresa suspensa: subdomínio mostra "Endereço não encontrado".
8. Testes do backend e do mediamtx-sync passam.
