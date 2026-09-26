-- ============================================================================
-- 003_usuario_empresas — spec docs/multiempresa/10-usuarios-globais.md
-- Um usuário pode estar em zero, uma ou várias empresas: profiles.empresa_id vira a tabela
-- usuario_empresas. platform_admin nunca tem vínculo (triggers no lugar do CHECK antigo).
-- Execução: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/prisma/sql/003_usuario_empresas.sql
-- ============================================================================

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_scripts WHERE name = '003_usuario_empresas') THEN
    RAISE EXCEPTION '003_usuario_empresas já foi aplicado neste banco — nada a fazer.';
  END IF;
END $$;

BEGIN;

CREATE TABLE usuario_empresas (
  profile_id uuid NOT NULL,
  empresa_id uuid NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  created_by uuid NULL,
  CONSTRAINT usuario_empresas_pkey PRIMARY KEY (profile_id, empresa_id),
  CONSTRAINT usuario_empresas_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT usuario_empresas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT,
  CONSTRAINT usuario_empresas_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);
CREATE INDEX idx_usuario_empresas_empresa ON usuario_empresas (empresa_id);

CREATE FUNCTION usuario_empresas_sem_platform_admin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.profile_id AND role = 'platform_admin') THEN
    RAISE EXCEPTION 'usuario_empresas_sem_platform_admin: platform_admin não pode ser vinculado a empresas';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER usuario_empresas_sem_platform_admin
  BEFORE INSERT OR UPDATE ON usuario_empresas
  FOR EACH ROW EXECUTE FUNCTION usuario_empresas_sem_platform_admin();

CREATE FUNCTION profiles_platform_admin_sem_vinculo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'platform_admin' AND EXISTS (SELECT 1 FROM usuario_empresas WHERE profile_id = NEW.id) THEN
    RAISE EXCEPTION 'profiles_platform_admin_sem_vinculo: usuário com empresa não pode virar platform_admin';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_platform_admin_sem_vinculo
  BEFORE UPDATE OF role ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_platform_admin_sem_vinculo();

INSERT INTO usuario_empresas (profile_id, empresa_id, created_at)
SELECT id, empresa_id, created_at FROM profiles WHERE empresa_id IS NOT NULL;

DO $$
DECLARE
  vinculos int;
  perfis int;
BEGIN
  SELECT count(*) INTO vinculos FROM usuario_empresas;
  SELECT count(*) INTO perfis FROM profiles WHERE empresa_id IS NOT NULL;
  IF vinculos <> perfis THEN
    RAISE EXCEPTION '003: % vínculos criados para % perfis com empresa — abortando', vinculos, perfis;
  END IF;
  RAISE NOTICE '003: % vínculos criados', vinculos;
END $$;

ALTER TABLE profiles DROP CONSTRAINT profiles_empresa_platform_admin;
ALTER TABLE profiles DROP CONSTRAINT profiles_empresa_id_fkey;
DROP INDEX IF EXISTS idx_profiles_empresa;
ALTER TABLE profiles DROP COLUMN empresa_id;

INSERT INTO schema_scripts (name) VALUES ('003_usuario_empresas');
COMMIT;
