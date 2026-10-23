/*
# Add Professionals table and link commissions to professionals

1. New Tables
- `professionals` — cadastro de funcionários/profissionais do estúdio
  - id (uuid PK)
  - name (text, not null)
  - role (text) — função/cargo: fotógrafo, maquiador, assistente, etc.
  - email (text)
  - phone (text)
  - document (text) — CPF
  - hire_date (date) — data de admissão
  - is_active (boolean, default true)
  - notes (text)
  - created_at, updated_at

2. Modified Tables
- `commission_rules`: add `professional_id` (uuid FK to professionals, set null)
  - Keeps existing `professional` text column for backward compatibility
- `commissions`: add `professional_id` (uuid FK to professionals, set null)
  - Keeps existing `professional` text column for backward compatibility
- `appointments`: add `professional_id` (uuid FK to professionals, set null)
  - Allows linking appointments to the responsible professional

3. Security
- Single-tenant no-auth app: RLS enabled, policies TO anon, authenticated with USING(true)
- Grants for professionals table to anon, authenticated
*/

-- ============ PROFESSIONALS ============
CREATE TABLE IF NOT EXISTS professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text,
  email text,
  phone text,
  document text,
  hire_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON professionals TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_professionals" ON professionals;
CREATE POLICY "anon_select_professionals" ON professionals FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_professionals" ON professionals;
CREATE POLICY "anon_insert_professionals" ON professionals FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_professionals" ON professionals;
CREATE POLICY "anon_update_professionals" ON professionals FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_professionals" ON professionals;
CREATE POLICY "anon_delete_professionals" ON professionals FOR DELETE
  TO anon, authenticated USING (true);

-- Add professional_id to commission_rules
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rules' AND column_name = 'professional_id') THEN
    ALTER TABLE commission_rules ADD COLUMN professional_id uuid REFERENCES professionals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add professional_id to commissions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commissions' AND column_name = 'professional_id') THEN
    ALTER TABLE commissions ADD COLUMN professional_id uuid REFERENCES professionals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add professional_id to appointments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'professional_id') THEN
    ALTER TABLE appointments ADD COLUMN professional_id uuid REFERENCES professionals(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commission_rules_professional ON commission_rules (professional_id);
CREATE INDEX IF NOT EXISTS idx_commissions_professional ON commissions (professional_id);
CREATE INDEX IF NOT EXISTS idx_appointments_professional ON appointments (professional_id);