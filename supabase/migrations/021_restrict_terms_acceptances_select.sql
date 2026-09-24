-- ============================================
-- ETERNAL STREAMS - TERMS ACCEPTANCE RLS FIX
-- Migration: 021_restrict_terms_acceptances_select
-- Description: Gate terms_acceptances SELECT by role, matching the
-- convention established in 011_update_rls.sql for every other table
-- (e.g. velorio_visitantes) — 020 shipped it ungated (USING (true)),
-- which let any authenticated user, regardless of role, read this
-- table's legally-sensitive PII (name, phone, email, IP, user-agent).
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can view terms acceptances" ON terms_acceptances;

CREATE POLICY "Viewer+ pode ler terms acceptances"
    ON terms_acceptances FOR SELECT
    TO authenticated
    USING (user_has_role('viewer'));
