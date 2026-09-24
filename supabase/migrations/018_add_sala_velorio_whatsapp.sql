-- ============================================
-- CAMPAX - WHATSAPP DO RESPONSÁVEL PELA SALA
-- Migration: 018_add_sala_velorio_whatsapp
-- Description: Adiciona o celular/WhatsApp do responsável pela sala de
--   velório (campo de nome já existe desde a migration 013).
-- ============================================

ALTER TABLE sala_velorio
  ADD COLUMN whatsapp_responsavel_sala_velorio VARCHAR(20);

COMMENT ON COLUMN sala_velorio.whatsapp_responsavel_sala_velorio IS 'WhatsApp do responsável pela sala (sala_velorio.responsavel_sala_velorio)';
