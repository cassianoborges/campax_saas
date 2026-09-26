# Multiempresa — Planejamento

> Status: **em implementação** (2026-09-23): **F0–F6 (todo o MVP de código)** feitas na `feat/multiempresa` e no ar no ambiente de desenvolvimento (`app2`). O banco `campax` já foi migrado. Q1, Q2 e Q4 resolvidas (D5–D7). Specs do MVP prontas: 01–07 e 09. Pós-MVP: 08 (subdomínio — código implementado em 2026-09-24 no branch `feat/subdominio`; falta DNS/certificado e a troca do slug inicial).
> Objetivo: transformar o Campax (hoje single-tenant, uma funerária por instalação) em uma
> plataforma SaaS que atende várias funerárias ("empresas") na mesma instalação, com um
> administrador de plataforma acima dos `superadmin` de cada empresa.

## 1. Decisões tomadas

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Modelo de isolamento | **Banco único + coluna `empresa_id`** em todas as tabelas do cliente, filtro automático no backend (extensão do Prisma Client). RLS do Postgres fica como possível reforço futuro. |
| D2 | Identificação da empresa nas URLs | **Ambos**: hash no caminho agora (`/<hash-empresa>/<sala>`, como já é hoje); subdomínio/domínio próprio como fase pós-MVP. |
| D3 | Escopo do MVP | **Painel da plataforma** + **Branding por empresa**. Fora do MVP: limites por plano e cobrança integrada. |
| D4 | Onde ficam os documentos | `docs/multiempresa/` — este planejamento + uma spec por fase. |
| D5 (Q1) | Testes de isolamento | **Vitest + supertest só no `backend/`**, contra um banco de teste dedicado (`campax_test`). |
| D6 (Q2) | `homenagens_templates` | **Os dois**: modelos globais da plataforma (`empresa_id NULL`, só `platform_admin` edita) + modelos próprios de cada empresa. |
| D7 (Q4) | `velorio_permissions` | **Remover** na F1 (0 linhas, sem uso no código). |
| D8 (M1) | Acesso às transmissões | **Partes A e B da spec 06 no MVP**: caminhos aleatórios + autenticação HTTP do MediaMTX com token ligado ao velório ao vivo. |

Decisões derivadas (não precisam de nova discussão, a menos que alguém discorde):

- **`velorios.token_acesso` continua único no sistema todo.** O visitante digita só o token em `/`, sem saber a empresa; a empresa é descoberta a partir do velório.
- **`profiles.email` continua único no sistema todo.** O login não pergunta a empresa, e a empresa vem do perfil.
- **O hash atual (`VITE_EMPRESA_HASH`) vira o `hash_publico` da empresa "Campax"**, para que links e QR codes de sala já impressos continuem funcionando.
- ~~Os caminhos atuais do MediaMTX não mudam.~~ **Revisto na spec 06:** todos os caminhos passam a `<slug>-<aleatório>`, inclusive os atuais, porque os nomes de hoje (nomes de cidade) são adivinháveis e a leitura no MediaMTX é anônima. A troca vale sozinha (o `webrtc_url` vem do banco), numa janela sem velório ao vivo.

## 2. Situação atual (o que o código faz hoje)

- **Schema** (`backend/prisma/schema.prisma`): nenhuma tabela tem noção de empresa.
  `sala_velorio.slug` e `profiles.email` são únicos no sistema todo.
- **Autenticação** (`backend/src/auth/*`): o JWT carrega só `sub` (id do perfil); `requireRole` compara papéis
  `superadmin(4) > admin(3) > operador(2) > viewer(1)`.
- **Rotas autenticadas** (`cameras`, `salas`, `velorios`, `users`, `accessLogs`, `visitantes`,
  `homenagensTemplates`, `termsAcceptances`): todas fazem `findMany`/`update`/`delete` **sem filtro**, e
  `PATCH/DELETE /:id` confia no id recebido. Com mais de uma empresa, isso vira vazamento entre clientes.
- **Rotas públicas** (`routes/public.ts`): `GET /public/salas/:slug` depende de o slug ser único no sistema todo;
  `GET /public/terms/accepted` procura aceite por `celular + version` no sistema todo.
- **Uploads**: todos em `backend/uploads/`, sem separação.
- **Socket.IO**: salas de eventos por `velorioId` (UUID). Não colide entre empresas.
- **mediamtx-sync** (`sync.ts`): `generatePathName` usa só `camera.nome`, então "Sala 1" de duas empresas geraria
  o mesmo caminho.
- **camera-status-api**: recebe IP/porta e testa conexão TCP **sem autenticação** (risco de SSRF, que piora
  com vários clientes).
- **Frontend**: `src/lib/empresaHash.ts` lê `VITE_EMPRESA_HASH` na hora do build; `SalaPublicLink.tsx`
  compara o hash da URL com essa constante e `SalaManagement.tsx` monta o link com ela.
- **Tabelas sem uso no código**: `velorio_permissions` (herança do Supabase) e `n8n_chat_histories_campax`
  (integração n8n separada).

## 3. Arquitetura alvo

### 3.1 Dados

Nova tabela **`empresas`**:

| Coluna | Tipo | Observação |
|--------|------|------------|
| `id` | uuid PK | |
| `nome` | varchar | Razão social ou nome fantasia |
| `nome_exibicao` | varchar | Nome mostrado nas páginas públicas |
| `slug` | varchar unique | Usado em caminhos do MediaMTX e, no futuro, no subdomínio |
| `hash_publico` | varchar unique | Prefixo dos links públicos de sala; o da Campax = `VITE_EMPRESA_HASH` atual |
| `cnpj` | varchar null | |
| `logo_url` | text null | Upload em `uploads/<empresa_id>/branding/` |
| `cor_primaria`, `cor_secundaria` | varchar(7) null | Hexadecimal; se vazio, usa as cores padrão da Campax |
| `whatsapp_contato`, `email_contato` | varchar null | |
| `ativo` | boolean default true | Empresa suspensa: login bloqueado e páginas públicas mostram "indisponível" |
| `dominio_customizado` | varchar null unique | Reservado para a fase F7 |
| `created_at`, `updated_at` | timestamptz | |

**`empresa_id uuid NOT NULL` (FK + índice)** em: `cameras`, `sala_velorio`, `velorios`,
`velorio_access_logs`, `terms_acceptances`. Em `homenagens_templates` é **nullable** (`NULL` = modelo global
da plataforma, ver D6).
`profiles.empresa_id` é **nullable**: é `NULL` só para `platform_admin`, garantido por uma CHECK constraint.

As tabelas filhas (`velorio_cameras`, `sala_velorio_cameras`, `velorio_homenagens`, `velorio_visitantes`)
**herdam** a empresa via FK e não recebem coluna. `velorio_access_logs` e `terms_acceptances` recebem
coluna própria porque os relatórios e a LGPD consultam essas tabelas diretamente.

Mudanças de unicidade:
- `sala_velorio.slug`: `@unique` → `@@unique([empresa_id, slug])`.
- `cameras`: `@@unique([mediamtx_path])` (hoje é só índice), para impedir colisão entre empresas.

Migração dos dados existentes: criar a empresa "Campax" com `hash_publico = VITE_EMPRESA_HASH`, preencher
`empresa_id` em todas as linhas e só depois aplicar `NOT NULL`. Fazer isso com `pg_dump` antes, dentro de
uma transação.

### 3.2 Papéis

```
platform_admin (5)  — empresa_id NULL, só acessa /platform/*
superadmin (4)      — dono da empresa (gerencia usuários da própria empresa)
admin (3) > operador (2) > viewer (1) — inalterados, sempre dentro da própria empresa
```

Entra `platform_admin` no enum `user_role`. Um `superadmin` nunca consegue criar ou promover alguém a `platform_admin`,
nem mexer em usuários de outra empresa.

### 3.3 Backend — isolamento por empresa

1. **Empresa na requisição**: o JWT continua `{ sub }`; `requireAuth` carrega o perfil **com a empresa** do
   banco (já faz uma consulta por requisição), confere se os dois estão ativos e grava `req.empresa`. Assim,
   uma suspensão vale na hora (detalhes na spec 03).
2. **Middleware `requireTenant`** nas rotas de empresa: rejeita `platform_admin` e perfis sem `empresa_id`.
3. **Extensão do Prisma Client por requisição** (`prismaForTenant(empresaId)`):
   - Leituras (`findMany/findFirst/count/aggregate`) nos modelos com empresa recebem `where.empresa_id`.
   - `create` injeta `empresa_id`.
   - `update/delete` por `id` viram `updateMany/deleteMany` com `{ id, empresa_id }` e dão 404 se nada foi alterado.
   - Tabelas filhas (`velorio_homenagens` etc.) são validadas pelo pai (`velorio.empresa_id`).
   - O `prisma` "cru" fica restrito a `routes/public.ts`, `routes/platform.ts` e scripts. Uma regra de lint ou
     `grep` no CI impede que ele seja importado em outras rotas.
4. **Relações cruzadas**: ao vincular uma câmera a uma sala ou a um velório, validar que as duas pertencem à mesma empresa.
5. **Rotas públicas**:
   - `GET /public/velorios/:token` → retorna também `empresa` (nome_exibicao, logo, cores, contato).
   - `GET /public/salas/:slug` → **substituída** por `GET /public/empresas/:hash/salas/:slug`
     (o frontend é o único consumidor e é implantado junto).
   - `GET /public/empresas/:hash` → branding, para a página da sala.
   - `POST` de access-logs e terms → `empresa_id` vem do velório, nunca do corpo da requisição.
   - `GET /public/terms/accepted` → filtra também por empresa (cada funerária é controladora dos próprios
     dados perante a LGPD, então um aceite dado na empresa A não vale para a B).
6. **Uploads**: `uploads/<empresa_id>/falecidos/…` e `uploads/<empresa_id>/branding/…`. Arquivos
   existentes ficam onde estão (as URLs gravadas continuam válidas).
7. **Socket.IO**: nada muda no modelo; no `join`, validar que o `velorioId` existe.
8. **CORS**: `FRONTEND_ORIGIN` continua fixo no MVP; na F7 passa a aceitar também os
   `empresas.dominio_customizado` ativos.

### 3.4 Plataforma (painel do `platform_admin`)

API `/platform/*` (exige `requireRole('platform_admin')`):
- `GET/POST/PATCH /platform/empresas`, `PATCH /platform/empresas/:id/ativo`
- `POST /platform/empresas/:id/superadmin`: cria o primeiro usuário da empresa
- `GET /platform/empresas/:id/uso`: contagem de câmeras, salas, velórios, acessos (só leitura; base para
  limites futuros)

UI em `/platform` (listagem de empresas, formulário com branding e upload de logo, suspender/reativar).

### 3.5 Frontend

- `/auth/me` retorna `empresa` junto com o perfil; um `EmpresaContext` fornece nome, hash e branding.
- `SalaManagement.tsx` monta o link público com `empresa.hash_publico`, e não mais com a variável de ambiente.
- `SalaPublicLink.tsx` busca `GET /public/empresas/:hash/salas/:slug` e deixa de comparar com a constante.
- Remover `VITE_EMPRESA_HASH` e `src/lib/empresaHash.ts` depois da migração.
- **Branding**: aplicar `cor_primaria`/`cor_secundaria` como variáveis CSS do Tailwind/shadcn e o logo em
  `PublicAccess` (depois de resolver o token), `VelorioViewing`, `SalaPublicLink` e no cabeçalho do admin.
  A página `/` (digitar o token) continua com a marca Campax, porque ainda não se sabe a empresa.
- Rotas `/platform/*` protegidas por `platform_admin`; `platform_admin` não vê o menu da empresa.

### 3.6 mediamtx-sync

- `generatePathName` passa a gerar `<empresa.slug>_<nome>` (usando um JOIN com `empresas`).
- Câmeras existentes mantêm o `mediamtx_path` gravado, sem mudança de URL.
- A remoção de caminhos órfãos já funciona sobre o conjunto de todas as câmeras ativas; não muda.
- Câmeras de empresa suspensa (`empresas.ativo = false`) saem do MediaMTX.

### 3.7 camera-status-api

Passar a checagem para dentro do backend (`POST /cameras/:id/check-status`), usando o `rtsp_url`
**da câmera no banco, filtrado pela empresa**, e não um IP vindo do cliente. Depois disso, desligar o
`campax-cam-status.service` e o proxy `check.campax.com.br`.

## 4. Riscos e pontos de atenção

| Risco | Mitigação |
|-------|-----------|
| Uma rota esquecer o filtro e vazar dados de outra empresa | Extensão do Prisma + proibição de importar o `prisma` cru + testes de isolamento (F2) |
| Integração **n8n** (tabela `n8n_chat_histories_campax`, campos `profiles.agente_ia`/`numero_whatsapp`) pode ler ou gravar direto em `velorios`/`profiles`; o `NOT NULL` em `empresa_id` quebraria as inserções | **Levantar os workflows do n8n antes da F1** |
| `GET /public/velorios/:token` expõe `cameras.rtsp_url` (com credenciais da câmera) para visitantes anônimos, **já hoje** | Corrigido na F2 (spec 03, C8); pode ser antecipado como correção isolada na `main` |
| **Página pública do velório (`/velorio/:id`) responde 401 para visitantes sem login** (usa a rota autenticada `/velorios/:id`), **já hoje** | Corrigido na F2/F4 (spec 03 C12, spec 05); recomendado antecipar como correção isolada na `main` |
| **Qualquer pessoa assiste qualquer câmera sem token**, a qualquer hora (leitura anônima no MediaMTX + nomes adivinháveis; 8554/8888 abertas), **já hoje** | Spec 06: nomes aleatórios + portas fechadas (parte A); autenticação por token ligada ao velório ao vivo (parte B, decisão M1) |
| **Frontend novo manda `rtsp_url` (com senha) para o servidor antigo** (`check.campax.com.br` → 77.42.69.91), que é um varredor de portas público sem autenticação, **já hoje** | Spec 07; paliativo recomendado na `main` antes do multiempresa |
| **Câmeras em H.265** (3 de 4 que respondem): WebRTC com H.265 não toca em boa parte dos navegadores ("codecs not supported by client"), **já hoje** | Configurar as câmeras para H.264 (recomendado) ou transcodificar no MediaMTX; incluir no onboarding de cada funerária (spec 09) |
| Links e QR codes de sala já impressos | `hash_publico` da Campax = `VITE_EMPRESA_HASH` atual |
| Virada do Supabase ainda pendente (sincronização final, troca de senhas, desligar o Cloud) | Concluir, ou decidir formalmente abandonar a sincronização, **antes** da F1, para não fazer migração de schema em dois bancos |
| PM2 v6 (bug do proxy Go) com mais carga no backend | Monitorar; se aparecer, mover o backend para systemd (já documentado no CLAUDE.md) |
| Capacidade de um único MediaMTX/VPS com mais câmeras | Medir CPU e banda no piloto (F8) |
| O repositório não tem executor de testes | Vitest só no backend (D5), montado na F0 |

## 5. Questões em aberto (resolver antes ou durante as specs)

- **Q3 — `platform_admin` operando uma empresa:** no MVP ele só usa `/platform`. Vale ter "entrar como
  empresa" (personificação com registro em log) já no MVP, para suporte? (Recomendado: pós-MVP.)
- **Q5 — Termos de uso/LGPD:** o texto do termo passa a citar a funerária como controladora e a Campax
  como operadora. O texto atual ainda afirma que a Campax "não compartilha dados com terceiros", mas os dados dos
  visitantes aparecem nos relatórios da funerária. Quem redige? **Bloqueia o piloto** (spec 09, P3).
- **Q6 — Subdomínio × domínio próprio na F7:** só `*.campax.com.br` (SSL curinga via desafio DNS) ou
  também domínio do cliente (certificado por domínio no nginx-proxy-manager)?
  **Resolvida (2026-09-24):** só `<slug>.campax.com.br` — ver [08-subdominio-dominio-proprio.md](08-subdominio-dominio-proprio.md), S1.

## 6. Fases e specs

Cada fase vira uma spec em `docs/multiempresa/NN-<nome>.md`, e depois um plano de implementação.

| Fase | Spec | Conteúdo | Depende de |
|------|------|----------|------------|
| F0 | `01-pre-requisitos.md` | Bancos `campax_dev`/`campax_test`, Vitest no backend, backup/restauração, n8n, fotos no Supabase Storage, virada do Supabase | — |
| F1 | `02-schema-e-migracao.md` | Tabela `empresas`, `empresa_id` nas tabelas, constraints, `platform_admin` no enum, script de preenchimento dos dados | F0 |
| F2 | `03-backend-isolamento.md` | JWT com empresa, `requireTenant`, extensão do Prisma, ajuste das 8 rotas, rotas públicas, uploads, termos por empresa, testes de isolamento | F1 |
| F3 | `04-plataforma.md` | API e UI `/platform`, criação de empresa + primeiro superadmin, suspensão | F2 |
| F4 | `05-frontend-empresa-e-branding.md` | `EmpresaContext`, links dinâmicos, `SalaPublicLink` via API, branding nas páginas públicas e no admin, remover `VITE_EMPRESA_HASH` | F2 (F3 para editar o branding) |
| F5 | `06-mediamtx-sync.md` | Caminhos com prefixo da empresa, unicidade, empresa suspensa | F1 |
| F6 | `07-camera-status.md` | Checagem de câmera dentro do backend, com empresa; desligar camera-status-api | F2 |
| F7 | `08-subdominio-dominio-proprio.md` | Identificar a empresa pelo host, CORS dinâmico, SSL (pós-MVP) — **no ar em 2026-09-26** | F4, Q6 |
| F8 | `09-piloto.md` | Cadastrar a 2ª funerária, checklist de validação, monitoramento | F2–F6 |
| F9 | `10-usuarios-globais.md` | Cadastro global de usuários na plataforma, um usuário em várias empresas, escolha/troca da empresa ativa (pós-MVP) — **spec em revisão** | F3, F7 |

F5 e F6 podem andar em paralelo com F3/F4. **MVP = F0 a F6 + F8.** F7, limites por plano e cobrança ficam
para depois.

Ordem de implantação em produção (detalhada na spec 09): **janela 1** = F1 + F2 + F4 + F6 juntas (o schema novo
quebra o frontend antigo e vice-versa; a F6 vai junto porque a rota de status que o frontend antigo usa é removida),
com a F3 no mesmo merge; **janela 2** = F5 parte A; **janela 3** = F5 parte B. Todas sem velório ao vivo.
