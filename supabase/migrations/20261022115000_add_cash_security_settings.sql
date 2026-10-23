/*
# Add cash security settings and audit log

## Purpose
Adds a cash security system with admin password (stored as SHA-256 hash with salt) to control
open/close cash register operations. Also adds an audit log table to track cash operations.

## Changes

### 1. New columns on `settings` table
- `cash_security_enabled` (boolean, default false) — toggles password requirement for cash operations
- `cash_password_hash` (text, nullable) — SHA-256 hash of the admin password + salt
- `cash_password_salt` (text, nullable) — random salt for the password hash

### 2. New table: `cash_audit_logs`
- `id` (uuid, primary key)
- `operation` (text) — 'abertura' or 'fechamento'
- `cash_register_id` (uuid, nullable, FK to cash_registers)
- `responsible` (text, nullable)
- `success` (boolean) — whether the operation succeeded or was blocked
- `failure_reason` (text, nullable) — reason if blocked (e.g. 'senha_incorreta')
- `created_at` (timestamptz, default now())

## Security
- RLS enabled on `cash_audit_logs`
- Grants to `anon, authenticated` (single-tenant, no auth app)
- All CRUD allowed for anon + authenticated (shared data)

## Notes
- Password is never stored in plain text — only the hash + salt
- The hash uses SHA-256 which is available in browser Web Crypto API
- Salt is generated using crypto.getRandomValues
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'cash_security_enabled') THEN
    ALTER TABLE settings ADD COLUMN cash_security_enabled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'cash_password_hash') THEN
    ALTER TABLE settings ADD COLUMN cash_password_hash text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'cash_password_salt') THEN
    ALTER TABLE settings ADD COLUMN cash_password_salt text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS cash_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  cash_register_id uuid REFERENCES cash_registers(id) ON DELETE SET NULL,
  responsible text,
  success boolean NOT NULL DEFAULT true,
  failure_reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cash_audit_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON cash_audit_logs TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_cash_audit" ON cash_audit_logs;
CREATE POLICY "anon_select_cash_audit" ON cash_audit_logs FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_cash_audit" ON cash_audit_logs;
CREATE POLICY "anon_insert_cash_audit" ON cash_audit_logs FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cash_audit" ON cash_audit_logs;
CREATE POLICY "anon_update_cash_audit" ON cash_audit_logs FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_cash_audit" ON cash_audit_logs;
CREATE POLICY "anon_delete_cash_audit" ON cash_audit_logs FOR DELETE
TO anon, authenticated USING (true);
