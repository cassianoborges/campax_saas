# Spec 01 — F0: Pré-requisitos

> Planejamento geral: [00-planejamento.md](00-planejamento.md) · Status: **em implementação** (itens 1–4 e 7 feitos em 2026-09-23; 5 e 6 pendentes de informação ou decisão)

## Objetivo

Deixar o ambiente pronto para desenvolver o multiempresa **sem mexer no banco de produção**. Isso inclui
ter uma forma confiável de testar que uma empresa não enxerga os dados de outra e resolver o que ainda está
pendente da saída do Supabase e que atrapalharia a migração de schema.

## Contexto (verificado em 2026-09-23)

- Existe **um único banco** (`campax`, role `campax_local`). As únicas conexões ativas são do backend e do
  mediamtx-sync. Não há banco de desenvolvimento nem de teste.
- O banco é um retrato de 2026-09-11/12: o velório mais recente foi criado em 2026-09-11 19:06. A
  sincronização final com o Supabase Cloud ainda está pendente (CLAUDE.md).
- **2 de 37 velórios** ainda têm `foto_falecido` apontando para `mzqthywvdavavviqbolm.supabase.co` (Storage
  do Supabase). Essas imagens quebram quando o Supabase for desligado.
- **n8n**: não roda nesta VPS (não há container) e o Postgres escuta só em `localhost`, então o n8n **não
  consegue** ler nem gravar neste banco. A tabela `n8n_chat_histories_campax` (2 linhas) e os campos
  `profiles.agente_ia`/`numero_whatsapp` vieram da época do Supabase. Se o workflow do n8n ainda estiver
  ativo, ele aponta para o Supabase Cloud.
- O backend não tem executor de testes; `backend/src/index.ts` cria o `app` e chama `server.listen` no
  mesmo arquivo, então o supertest não consegue importar o app sem subir o servidor.
- Não existe rotina de backup do Postgres (nenhum cron).

## Escopo

### 1. Bancos `campax_dev` e `campax_test`

- Criar, no mesmo Postgres 17 e com o mesmo role `campax_local`:
  - `campax_dev`: **cópia** do `campax` (`pg_dump campax | psql campax_dev`). É onde a F1 e a F2 são
    desenvolvidas e onde o script de migração é ensaiado.
  - `campax_test`: **vazio**, criado com `pg_dump --schema-only campax`. *(Mudou na implementação: a ideia era
    `prisma db push`, mas o banco tem 6 triggers, 11 funções e o schema `extensions` (uuid-ossp), que o Prisma não
    modela e um `db push` não recriaria. O banco de teste ficaria diferente da produção.)*
- `backend/.env.development` (`DATABASE_URL` → `campax_dev`) e `backend/.env.test` (→ `campax_test`),
  ambos no `.gitignore` (como o `.env` já está). Criar `backend/.env.test.example` versionado, sem segredos.
- `npm run dev` passa a usar `campax_dev`: `dotenv` carrega `.env.development` quando
  `NODE_ENV !== 'production'`. O PM2 já define `NODE_ENV: 'production'` para os 3 apps em
  `ecosystem.config.cjs` (verificado). Mesmo assim, se o `NODE_ENV` não estiver definido, o código deve cair
  no `.env` (produção) e **não** no `.env.development`; só `NODE_ENV=development`, definido no script
  `npm run dev`, carrega o banco de dev.
- Script `backend/scripts/refresh-dev-db.sh` para recriar o `campax_dev` a partir do `campax` quando for
  preciso.

### 2. Vitest + supertest no backend

- `devDependencies`: `vitest`, `supertest`, `@types/supertest`.
- Separar `backend/src/app.ts` (cria e exporta `app` e `server`, registra as rotas) de `backend/src/index.ts`
  (só chama `initRealtime` e `listen`). O comportamento em produção não muda.
- `backend/vitest.config.ts`: força `NODE_ENV=test` (→ `.env.test`), `globalSetup` confere se é o `campax_test` e se
  o schema existe (senão, manda rodar `refresh-dev-db.sh test`), e `fileParallelism: false` (um banco
  compartilhado). O `.env.test`/`.env.development` é carregado com `override: true`, porque importar o
  `@prisma/client` carrega o `backend/.env` (produção) sozinho. Isso foi descoberto quando a guarda abaixo barrou a
  primeira execução.
- Helper `backend/test/helpers.ts`: `resetDb()` (TRUNCATE ... CASCADE de todas as tabelas da aplicação),
  `createProfile({ role })`, `authHeader(profile)` (assina um JWT com o `signToken` real).
- Scripts: `npm test` (`vitest run`) e `npm run test:watch`.
- **Teste de fumaça** (`backend/test/smoke.test.ts`): `GET /health` responde 200; login com um usuário
  criado pelo helper responde com token; `GET /cameras` sem token responde 401. Prova que a infraestrutura funciona.
- Os testes de isolamento entre empresas **não** entram aqui: são escritos na F2.
- Guarda de segurança: `resetDb()` se recusa a rodar se o `DATABASE_URL` não terminar em `/campax_test`.

### 3. Backup e restauração

- `scripts/backup-db.sh`: `pg_dump -Fc campax > /root/backups/campax/campax-AAAAMMDD-HHMM.dump`,
  apagando os arquivos com mais de 14 dias.
- Cron diário às 03:30 (horário de Brasília).
- **Teste de restauração documentado**: `pg_restore` do último dump para um banco temporário
  `campax_restore_check`, comparar a contagem de linhas das tabelas com o `campax` e apagar o banco temporário.
  O passo a passo fica em `docs/linux-deployment.md`.
- A mesma rotina é usada manualmente antes do deploy da F1.

### 4. Fotos ainda no Supabase Storage

- Baixar as 2 imagens para `backend/uploads/falecido-fotos/`, atualizar `velorios.foto_falecido` para a
  URL local (`https://backend.campax.com.br/files/falecido-fotos/<arquivo>`) e confirmar que abrem no
  navegador.
- Isso já é parte da virada do Supabase. Entra aqui porque, depois da F2, os uploads novos vão para
  `uploads/<empresa_id>/`, e é melhor que nenhuma URL externa sobre.

### 5. n8n — levantamento (só documentação)

Responder e registrar em `00-planejamento.md` (seção de riscos):
- Onde o n8n roda e se o workflow do "agente IA" (`profiles.agente_ia`) ainda está ativo.
- Quais tabelas ele lê e grava no Supabase.
- Decisão: **desligar** o workflow junto com o Supabase ou **reescrever** para usar a API do backend
  (nesse caso, vira uma spec própria, fora do MVP).

O n8n não bloqueia o desenvolvimento, porque não tem acesso a este banco. **Bloqueia só o desligamento do
Supabase.**

### 6. Virada do Supabase — condição para o deploy, não para o desenvolvimento

O desenvolvimento das fases F1 a F6 pode começar em `campax_dev` agora. O **deploy em produção** da F1
exige que a sincronização final dos dados do Supabase já tenha sido feita **e** que a produção esteja
recebendo escrita só neste banco, senão o preenchimento de `empresa_id` rodaria sobre dados que depois seriam
sobrescritos. Essa confirmação é um item do checklist de deploy da F1.

### 7. Branch

Todo o trabalho do multiempresa em `feat/multiempresa`. Commits por fase (`feat(multiempresa-f1): ...`).
Merge na `main` só no deploy conjunto F1+F2+F4.

## Fora de escopo

- Qualquer mudança de schema (F1).
- Pipeline de CI remoto: os testes rodam localmente e fazem parte do checklist de cada fase.
- Desligar o Supabase Cloud (exige autorização explícita, CLAUDE.md).

## Critérios de aceite

- [x] `campax_dev` e `campax_test` existem; com `NODE_ENV=development` o backend usa `campax_dev`, e sem `NODE_ENV` ou
      com `production` usa `campax`, mantendo a porta do PM2 (3013). Verificado em 2026-09-23.
- [x] `cd backend && npm test` passa (5 testes de fumaça); com o `.env.test` apontando para `campax`, a guarda aborta
      antes de qualquer teste (produção conferida: 4 perfis antes e depois).
- [x] O build compila (`tsc` numa pasta temporária) e `dist/index.js` sobe com `NODE_ENV=production` (`/health` 200).
      *Deploy no PM2 pendente: a produção roda a partir deste mesmo checkout.*
- [x] Backup em `/root/backups/campax/`, cron instalado, teste de restauração executado e registrado em
      `docs/linux-deployment.md`.
- [x] Nenhum `velorios.foto_falecido` aponta para `supabase.co` (2 fotos migradas, abrem via
      `https://backend.campax.com.br/files/...`). **Rodar de novo depois da sincronização final com o Supabase**
      (`npm run migrate-supabase-photos`).
- [ ] Levantamento do n8n registrado no planejamento.
