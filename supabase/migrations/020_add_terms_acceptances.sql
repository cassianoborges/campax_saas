-- ============================================
-- ETERNAL STREAMS - TERMS ACCEPTANCE
-- Migration: 020_add_terms_acceptances
-- Description: Registro de aceite dos Termos de Uso (clickwrap), append-only
-- ============================================

CREATE TABLE IF NOT EXISTS terms_acceptances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    velorio_id UUID REFERENCES velorios(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    celular TEXT NOT NULL,
    email TEXT,
    terms_version TEXT NOT NULL,
    document_hash TEXT NOT NULL,
    accepted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    ip_address TEXT,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_celular ON terms_acceptances(celular);
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_accepted_at ON terms_acceptances(accepted_at DESC);

ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;

-- Append-only: apenas policies de INSERT e SELECT existem para esta tabela.
-- Nunca adicionar policy de UPDATE ou DELETE — RLS nega por padrão na
-- ausência de policy, então isso é o que garante o registro imutável.
CREATE POLICY "Public can record terms acceptance"
    ON terms_acceptances FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can view terms acceptances"
    ON terms_acceptances FOR SELECT
    TO authenticated
    USING (true);

-- Função SECURITY DEFINER: permite checar se um celular já aceitou a versão
-- vigente sem expor o histórico completo de aceites a usuários anônimos
-- (mesmo padrão de get_velorio_visitante_nomes em
-- 009_add_visitantes_public_function.sql).
CREATE OR REPLACE FUNCTION has_accepted_current_terms(p_celular TEXT, p_terms_version TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM terms_acceptances
    WHERE celular = p_celular AND terms_version = p_terms_version
  );
$$;

GRANT EXECUTE ON FUNCTION has_accepted_current_terms(TEXT, TEXT) TO anon, authenticated;
