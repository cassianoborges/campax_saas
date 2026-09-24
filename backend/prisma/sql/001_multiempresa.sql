-- ============================================================================
-- 001_multiempresa — F1 do multiempresa (docs/multiempresa/02-schema-e-migracao.md)
--
-- Cria a tabela `empresas`, adiciona `empresa_id` às tabelas do cliente, move todos os
-- dados existentes para a empresa inicial, adiciona o papel `platform_admin` e remove
-- `velorio_permissions` (sem uso). Roda uma vez só; uma segunda execução aborta.
--
-- Parâmetros obrigatórios (psql -v):
--   empresa_nome, empresa_nome_exibicao, empresa_slug, hash_publico (= VITE_EMPRESA_HASH atual)
--
-- Execução (como o dono das tabelas, campax_local):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v empresa_nome=... -v empresa_nome_exibicao=... \
--        -v empresa_slug=... -v hash_publico=... -f backend/prisma/sql/001_multiempresa.sql
-- ============================================================================

\set ON_ERROR_STOP on

\if :{?empresa_nome}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Parâmetro ausente: -v empresa_nome=...'; END $$;
\endif
\if :{?empresa_nome_exibicao}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Parâmetro ausente: -v empresa_nome_exibicao=...'; END $$;
\endif
\if :{?empresa_slug}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Parâmetro ausente: -v empresa_slug=...'; END $$;
\endif
\if :{?hash_publico}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Parâmetro ausente: -v hash_publico=...'; END $$;
\endif

-- Registro dos scripts SQL aplicados (cada script se registra no fim e aborta se já estiver aqui).
CREATE TABLE IF NOT EXISTS schema_scripts (
  name       varchar(100) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_scripts WHERE name = '001_multiempresa') OR to_regclass('public.empresas') IS NOT NULL THEN
    RAISE EXCEPTION '001_multiempresa já foi aplicado neste banco — nada a fazer.';
  END IF;
END $$;

-- Passo 0 (fora da transação): o Postgres não deixa usar um valor de enum na mesma transação
-- que o criou, e a CHECK de profiles abaixo usa 'platform_admin'. Sozinho, é inofensivo.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'platform_admin';

BEGIN;

-- Contagens antes, para conferir no fim que nenhuma linha foi perdida ou criada.
CREATE TEMP TABLE _contagem_antes ON COMMIT DROP AS
  SELECT 'cameras' AS tabela, count(*) AS n FROM cameras
  UNION ALL SELECT 'sala_velorio', count(*) FROM sala_velorio
  UNION ALL SELECT 'velorios', count(*) FROM velorios
  UNION ALL SELECT 'velorio_access_logs', count(*) FROM velorio_access_logs
  UNION ALL SELECT 'terms_acceptances', count(*) FROM terms_acceptances
  UNION ALL SELECT 'homenagens_templates', count(*) FROM homenagens_templates
  UNION ALL SELECT 'profiles', count(*) FROM profiles
  UNION ALL SELECT 'velorio_cameras', count(*) FROM velorio_cameras
  UNION ALL SELECT 'sala_velorio_cameras', count(*) FROM sala_velorio_cameras
  UNION ALL SELECT 'velorio_homenagens', count(*) FROM velorio_homenagens
  UNION ALL SELECT 'velorio_visitantes', count(*) FROM velorio_visitantes;

-- 1. Tabela empresas ----------------------------------------------------------
CREATE TABLE empresas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                varchar(255) NOT NULL,
  nome_exibicao       varchar(255) NOT NULL,
  slug                varchar(40)  NOT NULL,
  hash_publico        varchar(32)  NOT NULL,
  cnpj                varchar(18),
  logo_url            text,
  cor_primaria        varchar(7),
  cor_secundaria      varchar(7),
  whatsapp_contato    varchar(20),
  email_contato       varchar(255),
  ativo               boolean NOT NULL DEFAULT true,
  dominio_customizado varchar(255),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empresas_slug_formato CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT empresas_hash_publico_formato CHECK (hash_publico ~ '^[a-z0-9]{6,32}$'),
  CONSTRAINT empresas_cor_primaria_formato CHECK (cor_primaria ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT empresas_cor_secundaria_formato CHECK (cor_secundaria ~ '^#[0-9a-fA-F]{6}$')
);
CREATE UNIQUE INDEX empresas_slug_key ON empresas (slug);
CREATE UNIQUE INDEX empresas_hash_publico_key ON empresas (hash_publico);
CREATE UNIQUE INDEX empresas_dominio_customizado_key ON empresas (dominio_customizado);

CREATE TRIGGER update_empresas_updated_at
  BEFORE UPDATE ON empresas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Empresa inicial ---------------------------------------------------------
INSERT INTO empresas (nome, nome_exibicao, slug, hash_publico)
VALUES (:'empresa_nome', :'empresa_nome_exibicao', :'empresa_slug', :'hash_publico')
RETURNING id AS empresa_inicial_id \gset

-- 3–5. empresa_id: coluna nullable → preenche → NOT NULL (onde se aplica) → FK ------
ALTER TABLE cameras              ADD COLUMN empresa_id uuid;
ALTER TABLE sala_velorio         ADD COLUMN empresa_id uuid;
ALTER TABLE velorios             ADD COLUMN empresa_id uuid;
ALTER TABLE velorio_access_logs  ADD COLUMN empresa_id uuid;
ALTER TABLE terms_acceptances    ADD COLUMN empresa_id uuid;
ALTER TABLE homenagens_templates ADD COLUMN empresa_id uuid;
ALTER TABLE profiles             ADD COLUMN empresa_id uuid;

-- Os 2 modelos de homenagem atuais passam a ser da empresa inicial (não globais, D6).
UPDATE cameras              SET empresa_id = :'empresa_inicial_id';
UPDATE sala_velorio         SET empresa_id = :'empresa_inicial_id';
UPDATE velorios             SET empresa_id = :'empresa_inicial_id';
UPDATE velorio_access_logs  SET empresa_id = :'empresa_inicial_id';
UPDATE terms_acceptances    SET empresa_id = :'empresa_inicial_id';
UPDATE homenagens_templates SET empresa_id = :'empresa_inicial_id';
UPDATE profiles             SET empresa_id = :'empresa_inicial_id';

ALTER TABLE cameras             ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE sala_velorio        ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE velorios            ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE velorio_access_logs ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE terms_acceptances   ALTER COLUMN empresa_id SET NOT NULL;
-- homenagens_templates.empresa_id: NULL = modelo global da plataforma (D6).
-- profiles.empresa_id: NULL só para platform_admin (CHECK abaixo).

ALTER TABLE profiles ADD CONSTRAINT profiles_empresa_platform_admin
  CHECK ((role = 'platform_admin') = (empresa_id IS NULL));

ALTER TABLE cameras              ADD CONSTRAINT cameras_empresa_id_fkey              FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE sala_velorio         ADD CONSTRAINT sala_velorio_empresa_id_fkey         FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE velorios             ADD CONSTRAINT velorios_empresa_id_fkey             FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE velorio_access_logs  ADD CONSTRAINT velorio_access_logs_empresa_id_fkey  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE terms_acceptances    ADD CONSTRAINT terms_acceptances_empresa_id_fkey    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE homenagens_templates ADD CONSTRAINT homenagens_templates_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE profiles             ADD CONSTRAINT profiles_empresa_id_fkey             FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE NO ACTION;

-- 6. Unicidade, FKs compostas e índices -------------------------------------------

-- Slug de sala: único por empresa (antes era no sistema todo).
ALTER TABLE sala_velorio DROP CONSTRAINT sala_velorio_slug_unique;
CREATE UNIQUE INDEX sala_velorio_empresa_id_slug_key ON sala_velorio (empresa_id, slug);

-- mediamtx_path: de índice simples para único (evita colisão entre empresas; NULLs continuam permitidos).
DROP INDEX idx_cameras_mediamtx_path;
CREATE UNIQUE INDEX cameras_mediamtx_path_key ON cameras (mediamtx_path);

-- Alvos das FKs compostas.
CREATE UNIQUE INDEX sala_velorio_id_empresa_id_key ON sala_velorio (id, empresa_id);
CREATE UNIQUE INDEX velorios_id_empresa_id_key     ON velorios (id, empresa_id);

-- Velório e sala sempre da mesma empresa (garantido pelo banco).
ALTER TABLE velorios DROP CONSTRAINT velorios_sala_velorio_id_fkey;
ALTER TABLE velorios ADD CONSTRAINT velorios_sala_velorio_id_empresa_id_fkey
  FOREIGN KEY (sala_velorio_id, empresa_id) REFERENCES sala_velorio(id, empresa_id) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Log de acesso e velório sempre da mesma empresa.
ALTER TABLE velorio_access_logs DROP CONSTRAINT velorio_access_logs_velorio_id_fkey;
ALTER TABLE velorio_access_logs ADD CONSTRAINT velorio_access_logs_velorio_id_empresa_id_fkey
  FOREIGN KEY (velorio_id, empresa_id) REFERENCES velorios(id, empresa_id) ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE INDEX idx_cameras_empresa              ON cameras (empresa_id);
CREATE INDEX idx_sala_velorio_empresa         ON sala_velorio (empresa_id);
CREATE INDEX idx_velorios_empresa_data_inicio ON velorios (empresa_id, data_inicio);
CREATE INDEX idx_access_logs_empresa_accessed ON velorio_access_logs (empresa_id, accessed_at DESC);
CREATE INDEX idx_terms_empresa_celular_versao ON terms_acceptances (empresa_id, celular, terms_version);
CREATE INDEX idx_homenagens_templates_empresa ON homenagens_templates (empresa_id);
CREATE INDEX idx_profiles_empresa             ON profiles (empresa_id);

-- 7. Remoções ----------------------------------------------------------------------

-- Sem uso no código e sem linhas (D7).
DROP TABLE velorio_permissions;

-- Resto do Supabase: preenchia created_by com auth.uid(), mas o schema `auth` não existe mais
-- (um INSERT sem created_by falharia). O backend sempre informa created_by.
DROP TRIGGER trigger_set_velorio_created_by ON velorios;
DROP FUNCTION set_velorio_created_by();

-- 8. Verificações ------------------------------------------------------------------
DO $$
DECLARE
  r record;
  depois bigint;
BEGIN
  FOR r IN SELECT * FROM _contagem_antes LOOP
    EXECUTE format('SELECT count(*) FROM %I', r.tabela) INTO depois;
    IF depois <> r.n THEN
      RAISE EXCEPTION 'Contagem de % mudou: % antes, % depois', r.tabela, r.n, depois;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM homenagens_templates WHERE empresa_id IS NULL)
     OR EXISTS (SELECT 1 FROM profiles WHERE empresa_id IS NULL) THEN
    RAISE EXCEPTION 'Linhas antigas ficaram sem empresa_id';
  END IF;

  IF (SELECT count(*) FROM empresas) <> 1 THEN
    RAISE EXCEPTION 'Esperada exatamente 1 empresa, há %', (SELECT count(*) FROM empresas);
  END IF;
END $$;

INSERT INTO schema_scripts (name) VALUES ('001_multiempresa');

COMMIT;

\echo '✓ 001_multiempresa aplicado. Empresa inicial:' :'empresa_inicial_id'
