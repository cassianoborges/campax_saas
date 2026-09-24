-- ============================================
-- ETERNAL STREAMS - VELORIO VISITANTES
-- Migration: 006_add_velorio_visitantes
-- Description: Tabela para registro de visitantes no velório online
-- ============================================

CREATE TABLE IF NOT EXISTS velorio_visitantes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    velorio_id UUID NOT NULL REFERENCES velorios(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    celular TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_velorio_visitantes_velorio_id ON velorio_visitantes(velorio_id);
CREATE INDEX IF NOT EXISTS idx_velorio_visitantes_created_at ON velorio_visitantes(created_at DESC);

ALTER TABLE velorio_visitantes ENABLE ROW LEVEL SECURITY;

-- Público (anon) pode inserir seu cadastro
CREATE POLICY "Public can register as visitante"
    ON velorio_visitantes FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Admins autenticados podem ler todos os visitantes
CREATE POLICY "Authenticated users can view visitantes"
    ON velorio_visitantes FOR SELECT
    TO authenticated
    USING (true);
