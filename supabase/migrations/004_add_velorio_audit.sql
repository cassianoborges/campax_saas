-- ============================================
-- ETERNAL STREAMS - VELORIO AUDIT
-- Migration: 004_add_velorio_audit
-- Description: Adds created_by field to track who created each velorio
-- ============================================

-- Add created_by column to velorios table
ALTER TABLE velorios 
ADD COLUMN created_by UUID REFERENCES auth.users(id);

-- Create index for performance
CREATE INDEX idx_velorios_created_by ON velorios(created_by);

COMMENT ON COLUMN velorios.created_by IS 'ID do usuário que criou o velório';

-- Function to get velorio creation statistics
CREATE OR REPLACE FUNCTION get_velorio_creation_stats()
RETURNS TABLE (
  total_velorios BIGINT,
  velorios_today BIGINT,
  velorios_this_week BIGINT,
  velorios_this_month BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_velorios,
    COUNT(CASE WHEN created_at::DATE = CURRENT_DATE THEN 1 END)::BIGINT as velorios_today,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END)::BIGINT as velorios_this_week,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END)::BIGINT as velorios_this_month
  FROM velorios;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_velorio_creation_stats IS 'Retorna estatísticas de criação de velórios';

-- Function to automatically set created_by on insert
CREATE OR REPLACE FUNCTION set_velorio_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to set created_by automatically
CREATE TRIGGER trigger_set_velorio_created_by
  BEFORE INSERT ON velorios
  FOR EACH ROW
  EXECUTE FUNCTION set_velorio_created_by();

COMMENT ON TRIGGER trigger_set_velorio_created_by ON velorios IS 'Define automaticamente o created_by ao criar velório';
