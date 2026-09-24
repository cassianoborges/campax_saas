-- ============================================
-- CAMPAX - PERFIL DO FALECIDO E SEPULTAMENTO
-- Migration: 015_add_falecido_sepultamento
-- Description: Campos memoriais (nascimento, falecimento, foto, mensagem de
--   homenagem), dados de sepultamento e localização Google da sala.
-- ============================================

ALTER TABLE velorios
  ADD COLUMN data_nascimento DATE,
  ADD COLUMN data_falecimento DATE,
  ADD COLUMN mensagem_homenagem TEXT,
  ADD COLUMN foto_falecido TEXT,
  ADD COLUMN data_sepultamento DATE,
  ADD COLUMN local_sepultamento VARCHAR(255),
  ADD COLUMN google_maps_url_sepultamento TEXT;

COMMENT ON COLUMN velorios.mensagem_homenagem IS 'Texto único de homenagem cadastrado pelo admin/família (diferente do mural velorio_homenagens, onde cada visitante deixa sua própria mensagem)';
COMMENT ON COLUMN velorios.foto_falecido IS 'URL pública da foto no bucket de Storage falecido-fotos';
COMMENT ON COLUMN velorios.local_sepultamento IS 'Nome do cemitério/local de sepultamento, texto livre';

ALTER TABLE sala_velorio
  ADD COLUMN google_maps_url TEXT;

COMMENT ON COLUMN sala_velorio.google_maps_url IS 'Link do Google Maps para a sala de velório';

-- ============================================
-- STORAGE: bucket de fotos do falecido
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('falecido-fotos', 'falecido-fotos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public pode ver fotos de falecidos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'falecido-fotos');

CREATE POLICY "Operador+ pode enviar fotos de falecidos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'falecido-fotos' AND user_has_role('operador'));

CREATE POLICY "Operador+ pode atualizar fotos de falecidos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'falecido-fotos' AND user_has_role('operador'))
  WITH CHECK (bucket_id = 'falecido-fotos' AND user_has_role('operador'));

CREATE POLICY "Operador+ pode remover fotos de falecidos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'falecido-fotos' AND user_has_role('operador'));
