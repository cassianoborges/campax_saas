-- ============================================
-- CAMPAX - SALA DE VELÓRIO
-- Migration: 013_add_sala_velorio
-- Description: Cria a entidade sala_velorio (local físico com endereço e
--   responsável). Câmeras passam a pertencer à sala (não mais ao velório
--   diretamente); o velório passa a referenciar uma sala_velorio_id.
--   A tabela velorio_cameras e a coluna velorios.sala_velorio (texto livre)
--   são mantidas sem uso, como rede de segurança.
-- ============================================

-- ============================================
-- SALA_VELORIO TABLE
-- ============================================
CREATE TABLE sala_velorio (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_sala_velorio         VARCHAR(255) NOT NULL,
  endereco                  TEXT,
  bairro                    VARCHAR(255),
  cep                       VARCHAR(9),
  cidade                    VARCHAR(255),
  estado                    VARCHAR(2),
  responsavel_sala_velorio  VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE sala_velorio IS 'Salas físicas de velório, com endereço e responsável, dona das câmeras';
COMMENT ON COLUMN sala_velorio.nome_sala_velorio IS 'Nome da sala (ex: Sala Ouro)';
COMMENT ON COLUMN sala_velorio.responsavel_sala_velorio IS 'Nome do responsável pela sala';

CREATE TRIGGER update_sala_velorio_updated_at BEFORE UPDATE ON sala_velorio
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SALA_VELORIO_CAMERAS JUNCTION TABLE
-- ============================================
CREATE TABLE sala_velorio_cameras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sala_velorio_id UUID NOT NULL REFERENCES sala_velorio(id) ON DELETE CASCADE,
  camera_id       UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  ordem           INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(sala_velorio_id, camera_id)
);

CREATE INDEX idx_sala_velorio_cameras_sala   ON sala_velorio_cameras(sala_velorio_id);
CREATE INDEX idx_sala_velorio_cameras_camera ON sala_velorio_cameras(camera_id);

COMMENT ON TABLE sala_velorio_cameras IS 'Associação many-to-many entre salas de velório e câmeras';
COMMENT ON COLUMN sala_velorio_cameras.ordem IS 'Ordem de exibição das câmeras na interface';

-- ============================================
-- VELORIOS: referência à sala
-- ============================================
ALTER TABLE velorios ADD COLUMN sala_velorio_id UUID REFERENCES sala_velorio(id);
CREATE INDEX idx_velorios_sala_velorio_id ON velorios(sala_velorio_id);

-- Coluna de texto livre antiga fica deprecated (não é mais preenchida pelo app)
ALTER TABLE velorios ALTER COLUMN sala_velorio DROP NOT NULL;
COMMENT ON COLUMN velorios.sala_velorio IS 'DEPRECATED: texto livre legado, substituído por sala_velorio_id';

-- ============================================
-- BACKFILL: migra dados existentes
-- ============================================

-- 1. Cria uma sala_velorio para cada nome distinto ainda não migrado
INSERT INTO sala_velorio (nome_sala_velorio)
SELECT DISTINCT v.sala_velorio
FROM velorios v
WHERE v.sala_velorio_id IS NULL
  AND v.sala_velorio IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sala_velorio sv WHERE sv.nome_sala_velorio = v.sala_velorio
  );

-- 2. Vincula cada velório à sala correspondente pelo nome
UPDATE velorios v
SET sala_velorio_id = sv.id
FROM sala_velorio sv
WHERE v.sala_velorio = sv.nome_sala_velorio
  AND v.sala_velorio_id IS NULL;

-- 3. Migra as câmeras já vinculadas por velório para a sala correspondente
--    (mescla câmeras quando dois velórios compartilham a mesma sala)
INSERT INTO sala_velorio_cameras (sala_velorio_id, camera_id, ordem)
SELECT DISTINCT ON (v.sala_velorio_id, vc.camera_id)
  v.sala_velorio_id, vc.camera_id, vc.ordem
FROM velorio_cameras vc
JOIN velorios v ON v.id = vc.velorio_id
WHERE v.sala_velorio_id IS NOT NULL
ORDER BY v.sala_velorio_id, vc.camera_id, vc.ordem
ON CONFLICT (sala_velorio_id, camera_id) DO NOTHING;

-- 4. A partir daqui, todo velório deve ter uma sala
ALTER TABLE velorios ALTER COLUMN sala_velorio_id SET NOT NULL;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE sala_velorio         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sala_velorio_cameras ENABLE ROW LEVEL SECURITY;

-- Público (visitante) precisa ler a sala e suas câmeras para montar o player
CREATE POLICY "Public pode ver salas de velorio"
  ON sala_velorio FOR SELECT
  USING (true);

CREATE POLICY "Public pode ver cameras da sala"
  ON sala_velorio_cameras FOR SELECT
  USING (true);

-- Admin/operador (mesmo padrão de 011_update_rls.sql)
CREATE POLICY "Viewer+ pode ler salas de velorio"
  ON sala_velorio FOR SELECT TO authenticated
  USING (user_has_role('viewer'));

CREATE POLICY "Operador+ pode criar salas de velorio"
  ON sala_velorio FOR INSERT TO authenticated
  WITH CHECK (user_has_role('operador'));

CREATE POLICY "Operador+ pode editar salas de velorio"
  ON sala_velorio FOR UPDATE TO authenticated
  USING (user_has_role('operador'))
  WITH CHECK (user_has_role('operador'));

CREATE POLICY "Admin+ pode deletar salas de velorio"
  ON sala_velorio FOR DELETE TO authenticated
  USING (user_has_role('admin'));

CREATE POLICY "Viewer+ pode ler cameras da sala"
  ON sala_velorio_cameras FOR SELECT TO authenticated
  USING (user_has_role('viewer'));

CREATE POLICY "Operador+ pode criar cameras da sala"
  ON sala_velorio_cameras FOR INSERT TO authenticated
  WITH CHECK (user_has_role('operador'));

CREATE POLICY "Operador+ pode editar cameras da sala"
  ON sala_velorio_cameras FOR UPDATE TO authenticated
  USING (user_has_role('operador'))
  WITH CHECK (user_has_role('operador'));

CREATE POLICY "Admin+ pode deletar cameras da sala"
  ON sala_velorio_cameras FOR DELETE TO authenticated
  USING (user_has_role('admin'));
