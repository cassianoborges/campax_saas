-- ============================================
-- ETERNAL STREAMS - VISITANTES PUBLIC ACCESS
-- Migration: 009_add_visitantes_public_function
-- Description: Função segura para visitantes verem nomes dos outros visitantes
-- ============================================

-- Função SECURITY DEFINER: bypassa RLS e retorna apenas nome/data (sem celular/email)
CREATE OR REPLACE FUNCTION get_velorio_visitante_nomes(p_velorio_id UUID)
RETURNS TABLE(id UUID, nome TEXT, created_at TIMESTAMPTZ)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.nome, v.created_at
  FROM velorio_visitantes v
  WHERE v.velorio_id = p_velorio_id
  ORDER BY v.created_at ASC;
$$;

-- Permite que usuários anônimos e autenticados chamem esta função
GRANT EXECUTE ON FUNCTION get_velorio_visitante_nomes(UUID) TO anon, authenticated;
