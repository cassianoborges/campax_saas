-- ============================================
-- CAMPAX - RBAC (Role-Based Access Control)
-- Migration: 010_add_rbac
-- Description: Adds user profiles table with roles and helper functions
-- ============================================

-- 1. Role enum
CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'operador', 'viewer');

-- 2. Profiles table (linked to auth.users)
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        user_role NOT NULL DEFAULT 'viewer',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  invited_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_profiles_role      ON profiles(role);
CREATE INDEX idx_profiles_is_active ON profiles(is_active);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 3. Per-velório granular permissions (optional override on top of global role)
CREATE TABLE velorio_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  velorio_id UUID NOT NULL REFERENCES velorios(id) ON DELETE CASCADE,
  role       user_role NOT NULL,
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, velorio_id)
);

CREATE INDEX idx_velorio_permissions_user    ON velorio_permissions(user_id);
CREATE INDEX idx_velorio_permissions_velorio ON velorio_permissions(velorio_id);

ALTER TABLE velorio_permissions ENABLE ROW LEVEL SECURITY;

-- 4. updated_at trigger for profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Auto-create profile when a new user is added to auth.users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'viewer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 6. Helper functions (SECURITY DEFINER so they bypass RLS safely)

-- Returns the current user's global role (null if inactive or no profile)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active = true;
$$;

-- Hierarchical role check: true if caller's role >= required_role
-- superadmin(4) > admin(3) > operador(2) > viewer(1)
CREATE OR REPLACE FUNCTION user_has_role(required_role user_role)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  my_role        user_role;
  role_order     INT;
  required_order INT;
BEGIN
  SELECT role INTO my_role FROM profiles WHERE id = auth.uid() AND is_active = true;
  IF my_role IS NULL THEN RETURN false; END IF;

  role_order := CASE my_role
    WHEN 'superadmin' THEN 4
    WHEN 'admin'      THEN 3
    WHEN 'operador'   THEN 2
    WHEN 'viewer'     THEN 1
  END;

  required_order := CASE required_role
    WHEN 'superadmin' THEN 4
    WHEN 'admin'      THEN 3
    WHEN 'operador'   THEN 2
    WHEN 'viewer'     THEN 1
  END;

  RETURN role_order >= required_order;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_role()            TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_role(user_role) TO authenticated;

-- 7. Backfill: existing auth users become superadmin
INSERT INTO profiles (id, email, role)
SELECT id, email, 'superadmin'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 8. RLS for profiles
CREATE POLICY "Usuarios leem proprio perfil"
  ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Superadmin le todos perfis"
  ON profiles FOR SELECT TO authenticated
  USING (user_has_role('superadmin'));

CREATE POLICY "Superadmin atualiza qualquer perfil"
  ON profiles FOR UPDATE TO authenticated
  USING (user_has_role('superadmin'))
  WITH CHECK (user_has_role('superadmin'));

CREATE POLICY "Usuario atualiza proprio nome"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 9. RLS for velorio_permissions
CREATE POLICY "Superadmin gerencia permissoes"
  ON velorio_permissions FOR ALL TO authenticated
  USING (user_has_role('superadmin'))
  WITH CHECK (user_has_role('superadmin'));

CREATE POLICY "Usuario le proprias permissoes"
  ON velorio_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
