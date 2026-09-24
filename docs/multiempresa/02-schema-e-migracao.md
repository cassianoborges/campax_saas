# Spec 02 — F1: Schema e migração dos dados

> Planejamento geral: [00-planejamento.md](00-planejamento.md) · Depende de: [01-pre-requisitos.md](01-pre-requisitos.md)
> Status: **implementada em 2026-09-23** no `campax_dev`/`campax_test`. O banco `campax` só migra junto com a F2 e a F4 (ver "Notas da implementação").

## Objetivo

Criar o modelo de dados multiempresa (tabela `empresas`, `empresa_id` nas tabelas do cliente, papel
`platform_admin`) e migrar os dados atuais para uma primeira empresa, **sem perder nem alterar nenhum dado**
e sem mudar URLs públicas já distribuídas.

## Contexto (verificado em 2026-09-23)

- O schema é aplicado com `npx prisma db push`; não existe pasta de migrations. Como esta fase exige passos em
  ordem (criar coluna nullable → preencher → `NOT NULL`), ela usa um **script SQL escrito à mão**, e o
  `schema.prisma` é ajustado para refletir exatamente o resultado.
- Volume atual: 5 câmeras, 5 salas, 37 velórios, 4 perfis (3 `superadmin`, 1 `admin`), 2 modelos de
  homenagem, 844 logs de acesso, 38 aceites de termos (3 sem `velorio_id`), 0 `velorio_permissions`.
- Não há `mediamtx_path` duplicado nem `slug` de sala duplicado.
- `VITE_EMPRESA_HASH` atual: 8 caracteres, minúsculas e dígitos.
- Constraints existentes em `velorios`: `valid_dates`, `valid_token`, `velorios_sala_velorio_id_fkey`.
- Postgres 17: `gen_random_uuid()` é nativo.

## Modelo

### Tabela `empresas`

```sql
CREATE TABLE empresas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                varchar(255) NOT NULL,
  nome_exibicao       varchar(255) NOT NULL,
  slug                varchar(40)  NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  hash_publico        varchar(32)  NOT NULL UNIQUE CHECK (hash_publico ~ '^[a-z0-9]{6,32}$'),
  cnpj                varchar(18),
  logo_url            text,
  cor_primaria        varchar(7) CHECK (cor_primaria  ~ '^#[0-9a-fA-F]{6}$'),
  cor_secundaria      varchar(7) CHECK (cor_secundaria ~ '^#[0-9a-fA-F]{6}$'),
  whatsapp_contato    varchar(20),
  email_contato       varchar(255),
  ativo               boolean NOT NULL DEFAULT true,
  dominio_customizado varchar(255) UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

- `slug`: usado no prefixo do MediaMTX (F5) e no subdomínio (F7). Com hífen, porque é visível ao cliente.
- `hash_publico`: prefixo dos links públicos de sala. Formato compatível com o hash atual.

### `empresa_id` por tabela

| Tabela | Coluna | FK | Observação |
|--------|--------|----|------------|
| `cameras` | `NOT NULL` | `empresas(id)` `ON DELETE RESTRICT` | |
| `sala_velorio` | `NOT NULL` | idem | + `UNIQUE (id, empresa_id)` para as FKs compostas |
| `velorios` | `NOT NULL` | idem | FK composta `(sala_velorio_id, empresa_id)` → `sala_velorio(id, empresa_id)`, que substitui `velorios_sala_velorio_id_fkey`. Garante no banco que o velório e a sala são da mesma empresa. + `UNIQUE (id, empresa_id)` |
| `velorio_access_logs` | `NOT NULL` | idem | FK composta `(velorio_id, empresa_id)` → `velorios(id, empresa_id)` `ON DELETE CASCADE`, que substitui a FK simples |
| `terms_acceptances` | `NOT NULL` | idem | `velorio_id` continua opcional (há 3 aceites sem velório); FK simples mantida; a consistência com o velório é garantida no backend (F2) |
| `homenagens_templates` | **nullable** | idem | `NULL` = modelo global da plataforma (D6) |
| `profiles` | **nullable** | idem | `CHECK ((role = 'platform_admin') = (empresa_id IS NULL))` |

Todas as FKs para `empresas` usam `ON DELETE RESTRICT`: empresa não se apaga, se suspende (`ativo = false`).

Tabelas filhas **sem** coluna própria (herdam do pai): `velorio_cameras`, `sala_velorio_cameras`,
`velorio_homenagens`, `velorio_visitantes`. A regra "câmera e sala/velório da mesma empresa" fica no backend
(F2) e é coberta por teste.

### Unicidade e índices

- `sala_velorio.slug`: `UNIQUE (slug)` → `UNIQUE (empresa_id, slug)`.
- `cameras.mediamtx_path`: índice → `UNIQUE` (vários `NULL` continuam permitidos).
- `velorios.token_acesso`: **continua único no sistema todo**.
- `profiles.email`: **continua único no sistema todo**.
- Índices novos: `empresa_id` em todas as tabelas acima; `velorios (empresa_id, data_inicio)`;
  `velorio_access_logs (empresa_id, accessed_at DESC)`; `terms_acceptances (empresa_id, celular, terms_version)`
  (a consulta pública de aceite passa a filtrar por empresa na F2).

### Papel

`ALTER TYPE user_role ADD VALUE 'platform_admin';`, executado **fora** da transação principal (o Postgres
não permite usar um valor novo de enum na mesma transação que o criou, e a CHECK de `profiles` usa esse valor).

### Remoção

`DROP TABLE velorio_permissions;` (D7: 0 linhas, sem uso no código).

## Script de migração

Arquivo: `backend/prisma/sql/001_multiempresa.sql`. Abre uma nova pasta para scripts SQL ordenados;
documentar no CLAUDE.md que mudanças que o `db push` sozinho não consegue fazer vão para lá.

Parâmetros, via variáveis do `psql` (`-v`): `empresa_nome`, `empresa_nome_exibicao`, `empresa_slug`,
`hash_publico` (= valor atual de `VITE_EMPRESA_HASH`).

Estrutura:

```
-- Passo 0 (fora da transação)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'platform_admin';

BEGIN;
-- 1. CREATE TABLE empresas ...
-- 2. INSERT da empresa inicial com os parâmetros; guardar o id numa tabela temporária
-- 3. ADD COLUMN empresa_id (nullable) nas 7 tabelas
-- 4. UPDATE ... SET empresa_id = <empresa inicial> em todas as linhas
--    (em homenagens_templates também: os 2 modelos atuais viram da empresa, não globais)
-- 5. SET NOT NULL onde se aplica; CHECK em profiles
-- 6. Trocar as UNIQUE/FKs (slug, mediamtx_path, FKs compostas); criar os índices
-- 7. DROP TABLE velorio_permissions
-- 8. Verificações: DO $$ ... RAISE EXCEPTION se alguma tabela tiver empresa_id NULL
--    onde não pode, ou se a contagem de linhas mudou em relação à tirada no início do script
COMMIT;
```

Execução: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v empresa_nome=... -f 001_multiempresa.sql`.
Se qualquer passo falhar, a transação é desfeita; só o valor novo do enum fica, o que não causa problema.

**Idempotência:** o script aborta logo no início se a tabela `empresas` já existir (não é para rodar duas
vezes).

## `schema.prisma`

- Adicionar o `model empresas` e as relações inversas.
- Adicionar `empresa_id` e a relação `empresa` em cada model da tabela acima.
- Relações compostas em `velorios.sala` e `velorio_access_logs.velorios` (`fields: [x_id, empresa_id]`,
  `references: [id, empresa_id]`), com `@@unique([id, empresa_id])` em `sala_velorio` e `velorios`.
  **Plano B:** se o Prisma 5 rejeitar a relação composta que compartilha o campo `empresa_id` com a relação
  `empresa`, manter a FK composta **só no banco**, declarada em comentário no model, e confirmar que o `db push`
  não tenta removê-la. Se tentar, trocar por um trigger de verificação. Registrar a escolha nesta spec.
- Remover `model velorio_permissions` e as relações dele em `velorios`.
- Adicionar `platform_admin` ao `enum user_role`.

**Verificação de que o schema bate com o banco:** depois de rodar o script no `campax_dev`,
`npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`
deve retornar migração vazia. Se não retornar, o `schema.prisma` está errado, não o banco.

## Script `create-platform-admin`

`backend/src/scripts/createPlatformAdmin.ts` + `npm run create-platform-admin -- --email <email>`:
pede a senha no terminal (sem eco), cria `profiles` com `role = platform_admin` e `empresa_id = NULL`.
É a única forma de criar um `platform_admin`; nenhuma rota da API permite isso.
Usa um e-mail **diferente** dos `superadmin` atuais, porque o `platform_admin` não acessa as telas da empresa.

## Impacto no código (esperado, resolvido na F2)

Depois da F1, o backend **deixa de compilar**: os `create` passam a exigir `empresa`, e
`findUnique({ where: { slug } })` em `public.ts` deixa de existir. Isso é esperado dentro da branch
`feat/multiempresa`; a compilação volta a passar na F2. **A F1 nunca vai para produção sozinha** (ver o
deploy conjunto F1+F2+F4 no planejamento).

mediamtx-sync (SQL cru, `SELECT * FROM cameras`) e as leituras públicas não quebram com colunas novas.

## Testes (Vitest, `campax_test`)

`backend/test/schema.test.ts`, testando direto no banco com o Prisma:
- Não é possível criar um velório com `sala_velorio_id` de uma sala de outra empresa (erro de FK).
- Não é possível criar um access log com `empresa_id` diferente da empresa do velório.
- Duas empresas podem ter salas com o mesmo `slug`; a mesma empresa não pode.
- `mediamtx_path` duplicado falha.
- `profiles`: `platform_admin` com `empresa_id` falha; `admin` sem `empresa_id` falha.
- Apagar uma empresa com dados falha (`RESTRICT`).

Além disso, um **ensaio do script** no `campax_dev` (cópia recente da produção), comparando a contagem de linhas
de cada tabela antes e depois (tudo igual, exceto `velorio_permissions`, que é removida, e `empresas`, que ganha 1 linha).

## Notas da implementação (2026-09-23)

- **Relações compostas aceitas pelo Prisma 5** (`velorios.sala` e `velorio_access_logs.velorios` compartilham o
  `empresa_id` com a relação `empresa`). O plano B não foi necessário. `prisma migrate diff` contra o `campax_dev` e o
  `campax_test` retorna migração vazia.
- **Tabela `schema_scripts`** (nova, modelada no Prisma): cada script de `prisma/sql/` se registra ao final e aborta se
  já estiver registrado. `backend/scripts/refresh-dev-db.sh dev` copia o `campax` e aplica os scripts pendentes; `test`
  gera o `campax_test` a partir do schema do `campax_dev` (já migrado).
- **Trigger `trigger_set_velorio_created_by` removido** (e a função `set_velorio_created_by`): era resto do Supabase e
  chamava `auth.uid()`, que não existe mais, então um INSERT de velório sem `created_by` falhava. O backend sempre informa
  `created_by`. Outras funções herdadas do Supabase (`get_my_role`, `user_has_role`, `has_accepted_current_terms`...)
  continuam no banco sem uso; a limpeza delas fica para depois.
- **O script roda como `campax_local`** (`SET ROLE` no `refresh-dev-db.sh`), para que as tabelas novas tenham o mesmo
  dono das existentes. O SQL entra pelo stdin, porque o usuário `postgres` não lê arquivos em `/root`.
- `npm run create-platform-admin` testado no `campax_dev` (`plataforma@campax.dev`). A CHECK barra um
  `platform_admin` com empresa e um `admin` sem empresa.
- **Backend sem compilar, como previsto:** 4 erros (`ROLE_ORDER` sem `platform_admin`, `findUnique` por `slug` e 2
  `create` sem `empresa_id` em `public.ts`). **Além disso**, as rotas que repassam `req.body` (tipo `any`) compilam, mas
  falham em execução por falta de `empresa_id`. É exatamente o item C1 da spec 03. Tudo isso fica para a F2.
- **Por que o `campax` não migrou ainda:** o backend que o PM2 roda foi compilado da `main` e quebraria com o schema
  novo. O `campax` migra quando a F2 e a F4 estiverem prontas, usando o mesmo script.

## Fora de escopo

- Qualquer mudança em rotas, middleware ou frontend (F2/F4).
- Colunas de plano e limites (pós-MVP).
- RLS no Postgres.

## Critérios de aceite

- [x] `001_multiempresa.sql` roda do início ao fim no `campax_dev` sem erro; uma segunda execução aborta ("já foi
      aplicado"), e rodar sem parâmetro aborta ("Parâmetro ausente").
- [x] A contagem de linhas bate antes e depois (verificação dentro do script); nenhum `empresa_id` fica NULL onde não
      pode.
- [x] A empresa inicial tem `hash_publico` igual ao `VITE_EMPRESA_HASH` atual (`d2788b07`).
- [x] `prisma migrate diff` entre o `campax_dev` (e o `campax_test`) e o `schema.prisma` retorna vazio.
- [x] `backend/test/schema.test.ts` passa (8 testes).
- [x] `npm run create-platform-admin` cria o usuário com `empresa_id NULL` no `campax_dev` (o bloqueio nas rotas de
      empresa é validado na F2).
- [ ] O CLAUDE.md fica com uma seção de schema atualizada (tabela `empresas`, `platform_admin`, a pasta
      `prisma/sql/`), e essa atualização vai **no mesmo deploy** F1+F2+F4, não antes.

## Checklist de deploy (executado no deploy conjunto F1+F2+F4)

1. Confirmar a condição da F0 §6: a sincronização final do Supabase foi feita e a produção escreve só neste banco.
2. Janela sem velório ao vivo (`data_inicio <= now() <= data_fim` vazio).
3. `scripts/backup-db.sh` manual; anotar o arquivo gerado.
4. `pm2 stop campax-backend-velorio campax-sync-velorio`.
5. Rodar `001_multiempresa.sql` com os parâmetros de produção.
6. Deploy do backend (F2) e do frontend (F4), `pm2 start`.
7. Teste rápido: login de admin, lista de velórios, acesso público por token, link público de sala antigo.
8. **Rollback:** `pm2 stop`, `pg_restore --clean` do dump do passo 3, voltar para o commit anterior da `main`, rebuild, `pm2 start`.
