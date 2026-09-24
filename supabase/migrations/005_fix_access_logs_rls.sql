-- Fix RLS policy for public access logging
-- This allows anonymous users to insert access logs

-- Drop the existing policy
DROP POLICY IF EXISTS "Public can insert access logs" ON velorio_access_logs;

-- Create a new policy that explicitly allows anonymous inserts
CREATE POLICY "Allow anonymous insert access logs"
  ON velorio_access_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Also ensure the policy for viewing is correct
DROP POLICY IF EXISTS "Authenticated users can view all access logs" ON velorio_access_logs;

CREATE POLICY "Authenticated users can view all access logs"
  ON velorio_access_logs FOR SELECT
  TO authenticated
  USING (true);
