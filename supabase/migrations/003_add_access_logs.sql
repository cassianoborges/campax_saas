-- ============================================
-- ETERNAL STREAMS - ACCESS LOGS
-- Migration: 003_add_access_logs
-- Description: Creates table for tracking velorio access via tokens
-- ============================================

-- ============================================
-- VELORIO_ACCESS_LOGS TABLE
-- ============================================
CREATE TABLE velorio_access_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  velorio_id UUID NOT NULL REFERENCES velorios(id) ON DELETE CASCADE,
  token_acesso VARCHAR(6) NOT NULL,
  accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  session_duration INTERVAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_access_logs_velorio ON velorio_access_logs(velorio_id);
CREATE INDEX idx_access_logs_token ON velorio_access_logs(token_acesso);
CREATE INDEX idx_access_logs_accessed_at ON velorio_access_logs(accessed_at DESC);
CREATE INDEX idx_access_logs_created_at ON velorio_access_logs(created_at DESC);

COMMENT ON TABLE velorio_access_logs IS 'Registra todos os acessos aos velórios via token';
COMMENT ON COLUMN velorio_access_logs.velorio_id IS 'Referência ao velório acessado';
COMMENT ON COLUMN velorio_access_logs.token_acesso IS 'Token utilizado para acesso';
COMMENT ON COLUMN velorio_access_logs.accessed_at IS 'Data e hora do acesso';
COMMENT ON COLUMN velorio_access_logs.ip_address IS 'Endereço IP do visitante (opcional)';
COMMENT ON COLUMN velorio_access_logs.user_agent IS 'Informações do navegador/dispositivo';
COMMENT ON COLUMN velorio_access_logs.session_duration IS 'Duração da sessão (calculado posteriormente)';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE velorio_access_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users (admins) can view all access logs
CREATE POLICY "Authenticated users can view all access logs"
  ON velorio_access_logs FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow public insert for logging access (application will handle this)
CREATE POLICY "Public can insert access logs"
  ON velorio_access_logs FOR INSERT
  WITH CHECK (true);

-- Only authenticated users can update (for session duration tracking)
CREATE POLICY "Authenticated users can update access logs"
  ON velorio_access_logs FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get access statistics for a velorio
CREATE OR REPLACE FUNCTION get_velorio_access_stats(velorio_uuid UUID)
RETURNS TABLE (
  total_accesses BIGINT,
  unique_tokens BIGINT,
  last_access TIMESTAMP WITH TIME ZONE,
  accesses_last_24h BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_accesses,
    COUNT(DISTINCT token_acesso)::BIGINT as unique_tokens,
    MAX(accessed_at) as last_access,
    COUNT(CASE WHEN accessed_at > NOW() - INTERVAL '24 hours' THEN 1 END)::BIGINT as accesses_last_24h
  FROM velorio_access_logs
  WHERE velorio_id = velorio_uuid;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_velorio_access_stats IS 'Retorna estatísticas de acesso para um velório específico';

-- Function to get overall access statistics
CREATE OR REPLACE FUNCTION get_overall_access_stats()
RETURNS TABLE (
  total_accesses BIGINT,
  total_velorios BIGINT,
  accesses_today BIGINT,
  accesses_last_7_days BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_accesses,
    COUNT(DISTINCT velorio_id)::BIGINT as total_velorios,
    COUNT(CASE WHEN accessed_at::DATE = CURRENT_DATE THEN 1 END)::BIGINT as accesses_today,
    COUNT(CASE WHEN accessed_at > NOW() - INTERVAL '7 days' THEN 1 END)::BIGINT as accesses_last_7_days
  FROM velorio_access_logs;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_overall_access_stats IS 'Retorna estatísticas gerais de todos os acessos';
