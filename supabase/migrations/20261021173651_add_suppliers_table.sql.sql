/*
# Add suppliers table

1. New Tables
- `suppliers` — vendor/supplier records for the studio (albums, prints, equipment, etc.)
  - id (uuid, primary key)
  - name (text, not null) — supplier name
  - category (text) — type of supplier (e.g. álbum, impressão, equipamento)
  - contact_person (text) — contact name
  - phone (text)
  - email (text)
  - whatsapp (text)
  - website (text)
  - cnpj (text) — tax ID
  - address (text)
  - city (text)
  - state (text)
  - observations (text)
  - active (boolean, default true)
  - created_at (timestamptz)
  - updated_at (timestamptz)
2. Security
- Single-tenant no-auth app: RLS enabled, policies TO anon, authenticated with USING(true).
*/

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  contact_person text,
  phone text,
  email text,
  whatsapp text,
  website text,
  cnpj text,
  address text,
  city text,
  state text,
  observations text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_suppliers" ON suppliers;
CREATE POLICY "anon_select_suppliers" ON suppliers FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_suppliers" ON suppliers;
CREATE POLICY "anon_insert_suppliers" ON suppliers FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_suppliers" ON suppliers;
CREATE POLICY "anon_update_suppliers" ON suppliers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_suppliers" ON suppliers;
CREATE POLICY "anon_delete_suppliers" ON suppliers FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers (name);
CREATE INDEX IF NOT EXISTS idx_suppliers_category ON suppliers (category);
