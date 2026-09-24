-- ============================================
-- CAMPAX - Update RLS Policies for RBAC
-- Migration: 011_update_rls
-- Description: Replaces binary authenticated policies with role-based ones
-- ============================================

-- ============================================
-- CAMERAS
-- ============================================
DROP POLICY IF EXISTS "Authenticated users have full access to cameras" ON cameras;

CREATE POLICY "Viewer+ pode ler cameras"
  ON cameras FOR SELECT TO authenticated
  USING (user_has_role('viewer'));

CREATE POLICY "Operador+ pode criar cameras"
  ON cameras FOR INSERT TO authenticated
  WITH CHECK (user_has_role('operador'));

CREATE POLICY "Operador+ pode editar cameras"
  ON cameras FOR UPDATE TO authenticated
  USING (user_has_role('operador'))
  WITH CHECK (user_has_role('operador'));

CREATE POLICY "Admin+ pode deletar cameras"
  ON cameras FOR DELETE TO authenticated
  USING (user_has_role('admin'));

-- ============================================
-- VELORIOS
-- ============================================
DROP POLICY IF EXISTS "Authenticated users have full access to velorios" ON velorios;

CREATE POLICY "Viewer+ pode ler velorios"
  ON velorios FOR SELECT TO authenticated
  USING (user_has_role('viewer'));

CREATE POLICY "Operador+ pode criar velorios"
  ON velorios FOR INSERT TO authenticated
  WITH CHECK (user_has_role('operador'));

CREATE POLICY "Operador+ pode editar velorios"
  ON velorios FOR UPDATE TO authenticated
  USING (user_has_role('operador'))
  WITH CHECK (user_has_role('operador'));

CREATE POLICY "Admin+ pode deletar velorios"
  ON velorios FOR DELETE TO authenticated
  USING (user_has_role('admin'));

-- ============================================
-- VELORIO_CAMERAS
-- ============================================
DROP POLICY IF EXISTS "Authenticated users have full access to velorio_cameras" ON velorio_cameras;

CREATE POLICY "Viewer+ pode ler velorio_cameras"
  ON velorio_cameras FOR SELECT TO authenticated
  USING (user_has_role('viewer'));

CREATE POLICY "Operador+ pode criar velorio_cameras"
  ON velorio_cameras FOR INSERT TO authenticated
  WITH CHECK (user_has_role('operador'));

CREATE POLICY "Operador+ pode editar velorio_cameras"
  ON velorio_cameras FOR UPDATE TO authenticated
  USING (user_has_role('operador'))
  WITH CHECK (user_has_role('operador'));

CREATE POLICY "Admin+ pode deletar velorio_cameras"
  ON velorio_cameras FOR DELETE TO authenticated
  USING (user_has_role('admin'));

-- ============================================
-- VELORIO_ACCESS_LOGS
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view all access logs" ON velorio_access_logs;
DROP POLICY IF EXISTS "Authenticated users can update access logs"   ON velorio_access_logs;

CREATE POLICY "Viewer+ pode ler access logs"
  ON velorio_access_logs FOR SELECT TO authenticated
  USING (user_has_role('viewer'));

CREATE POLICY "Admin+ pode atualizar access logs"
  ON velorio_access_logs FOR UPDATE TO authenticated
  USING (user_has_role('admin'))
  WITH CHECK (user_has_role('admin'));

-- ============================================
-- VELORIO_VISITANTES
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view visitantes" ON velorio_visitantes;

CREATE POLICY "Viewer+ pode ler visitantes"
  ON velorio_visitantes FOR SELECT TO authenticated
  USING (user_has_role('viewer'));

-- ============================================
-- VELORIO_HOMENAGENS
-- ============================================
DROP POLICY IF EXISTS "Admin delete homenagens" ON velorio_homenagens;

CREATE POLICY "Admin+ pode deletar homenagens"
  ON velorio_homenagens FOR DELETE TO authenticated
  USING (user_has_role('admin'));
