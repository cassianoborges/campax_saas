-- Migration: 012_add_profile_whatsapp_agente_ia
-- Description: Adds WhatsApp number and AI agent flag to profiles

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS numero_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS agente_ia BOOLEAN NOT NULL DEFAULT false;
