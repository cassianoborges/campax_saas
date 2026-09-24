-- ============================================================================
-- 002_camera_status_checked_at — F6 do multiempresa (docs/multiempresa/07-camera-status.md)
-- Quando o backend testou a câmera pela última vez (a checagem saiu do navegador para o servidor).
-- Execução: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/prisma/sql/002_camera_status_checked_at.sql
-- ============================================================================

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_scripts WHERE name = '002_camera_status_checked_at') THEN
    RAISE EXCEPTION '002_camera_status_checked_at já foi aplicado neste banco — nada a fazer.';
  END IF;
END $$;

BEGIN;
ALTER TABLE cameras ADD COLUMN status_checked_at timestamptz;
INSERT INTO schema_scripts (name) VALUES ('002_camera_status_checked_at');
COMMIT;
