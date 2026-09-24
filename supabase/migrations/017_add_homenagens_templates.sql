-- ============================================
-- CAMPAX - BANCO DE HOMENAGENS
-- Migration: 017_add_homenagens_templates
-- Description: Mensagens de homenagem reutilizáveis, cadastradas pelo
--   admin e escolhidas via dropdown no cadastro de velório.
-- ============================================

CREATE TABLE homenagens_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo     VARCHAR(255) NOT NULL,
  mensagem   TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE homenagens_templates IS 'Mensagens de homenagem reutilizáveis, cadastradas pelo admin e escolhidas via dropdown no cadastro de velório (diferente do mural velorio_homenagens, onde cada visitante escreve a própria mensagem)';

CREATE TRIGGER update_homenagens_templates_updated_at BEFORE UPDATE ON homenagens_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE homenagens_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewer+ pode ler banco de homenagens"
  ON homenagens_templates FOR SELECT TO authenticated
  USING (user_has_role('viewer'));

CREATE POLICY "Admin+ pode criar mensagens no banco de homenagens"
  ON homenagens_templates FOR INSERT TO authenticated
  WITH CHECK (user_has_role('admin'));

CREATE POLICY "Admin+ pode editar mensagens no banco de homenagens"
  ON homenagens_templates FOR UPDATE TO authenticated
  USING (user_has_role('admin'))
  WITH CHECK (user_has_role('admin'));

CREATE POLICY "Admin+ pode excluir mensagens no banco de homenagens"
  ON homenagens_templates FOR DELETE TO authenticated
  USING (user_has_role('admin'));
