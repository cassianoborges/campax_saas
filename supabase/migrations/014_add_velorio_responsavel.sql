-- ============================================
-- CAMPAX - RESPONSÁVEL PELO VELÓRIO
-- Migration: 014_add_velorio_responsavel
-- Description: Adiciona nome e WhatsApp do parente responsável pelo velório.
-- ============================================

ALTER TABLE velorios
  ADD COLUMN responsavel_velorio_nome VARCHAR(255),
  ADD COLUMN contato_whatsapp_responsavel VARCHAR(20);

COMMENT ON COLUMN velorios.responsavel_velorio_nome IS 'Nome do parente responsável pelo velório';
COMMENT ON COLUMN velorios.contato_whatsapp_responsavel IS 'WhatsApp do parente responsável pelo velório';
