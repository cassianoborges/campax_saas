-- Migration: Adicionar suporte para MediaMTX WebRTC

-- Adicionar colunas para MediaMTX
ALTER TABLE cameras 
ADD COLUMN IF NOT EXISTS mediamtx_path VARCHAR(100),
ADD COLUMN IF NOT EXISTS webrtc_url TEXT;

-- Criar índice para busca rápida por path
CREATE INDEX IF NOT EXISTS idx_cameras_mediamtx_path 
ON cameras(mediamtx_path);

-- Comentários nas colunas
COMMENT ON COLUMN cameras.mediamtx_path IS 'Nome do path no MediaMTX (gerado automaticamente)';
COMMENT ON COLUMN cameras.webrtc_url IS 'URL WebRTC para streaming (gerado pelo sync service)';
