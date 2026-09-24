-- ============================================
-- Migration: 007_add_visitante_to_access_logs
-- Description: Adiciona dados do visitante ao log de acesso
-- ============================================

ALTER TABLE velorio_access_logs
  ADD COLUMN IF NOT EXISTS nome_visitante TEXT,
  ADD COLUMN IF NOT EXISTS celular_visitante TEXT,
  ADD COLUMN IF NOT EXISTS email_visitante TEXT;
