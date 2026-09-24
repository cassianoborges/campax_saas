-- ============================================
-- ETERNAL STREAMS - VELORIO HOMENAGENS
-- Migration: 008_add_velorio_homenagens
-- Description: Mural de homenagens e condolências para velórios
-- ============================================

CREATE TABLE velorio_homenagens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  velorio_id UUID NOT NULL REFERENCES velorios(id) ON DELETE CASCADE,
  autor_nome TEXT NOT NULL,
  parentesco TEXT,
  mensagem   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_velorio_homenagens_velorio_id ON velorio_homenagens(velorio_id);
CREATE INDEX idx_velorio_homenagens_created_at ON velorio_homenagens(created_at ASC);

ALTER TABLE velorio_homenagens ENABLE ROW LEVEL SECURITY;

-- Público (anon) pode ler e inserir mensagens
CREATE POLICY "Public read homenagens"
  ON velorio_homenagens FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public insert homenagens"
  ON velorio_homenagens FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Admins autenticados podem excluir mensagens (moderação)
CREATE POLICY "Admin delete homenagens"
  ON velorio_homenagens FOR DELETE TO authenticated USING (true);
