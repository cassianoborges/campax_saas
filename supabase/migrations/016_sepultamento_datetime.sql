-- ============================================
-- CAMPAX - DATA E HORA DE SEPULTAMENTO
-- Migration: 016_sepultamento_datetime
-- Description: data_sepultamento passa de DATE para TIMESTAMP WITH TIME ZONE,
--   permitindo cadastrar o horário do sepultamento além da data.
-- ============================================

ALTER TABLE velorios
  ALTER COLUMN data_sepultamento TYPE TIMESTAMP WITH TIME ZONE
  USING data_sepultamento::TIMESTAMP WITH TIME ZONE;
