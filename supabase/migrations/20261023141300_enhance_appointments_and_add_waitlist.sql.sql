/*
# Enhance appointments and add waitlist

1. Modified Tables
- `appointments` — add columns for resource-based scheduling:
  - end_time (text, nullable) — explicit end time as alternative to duration_min
  - professional (text, nullable) — assigned photographer/staff
  - room (text, nullable) — room or studio space
  - equipment (text, nullable) — equipment assigned
  - prep_time_min (integer, default 0) — scenario preparation time before appointment
  - is_blocked (boolean, default false) — marks blocked time slots (vacation, maintenance, etc.)
  - block_reason (text, nullable) — reason for blocking
2. New Tables
- `waitlist` — clients waiting for available slots
  - id (uuid, primary key)
  - client_id (uuid, FK to clients, cascade delete)
  - service_id (uuid, FK to services, set null on delete) — desired service
  - desired_period_start (date) — earliest acceptable date
  - desired_period_end (date) — latest acceptable date
  - time_preference (text) — morning, afternoon, evening, any
  - priority (text, default 'normal') — baixa, normal, alta, urgente
  - observations (text)
  - status (text, default 'aguardando') — aguardando, atendido, cancelado
  - attended_at (timestamptz, nullable) — when request was fulfilled
  - created_at, updated_at
3. Security
- RLS enabled on waitlist with anon+authenticated CRUD (single-tenant, no auth)
- Grants on waitlist to anon, authenticated
*/

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS end_time text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS professional text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS room text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS equipment text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS prep_time_min integer NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS block_reason text;

CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  desired_period_start date NOT NULL,
  desired_period_end date,
  time_preference text NOT NULL DEFAULT 'qualquer',
  priority text NOT NULL DEFAULT 'normal',
  observations text,
  status text NOT NULL DEFAULT 'aguardando',
  attended_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON waitlist TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_waitlist" ON waitlist;
CREATE POLICY "anon_select_waitlist" ON waitlist FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_waitlist" ON waitlist;
CREATE POLICY "anon_insert_waitlist" ON waitlist FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_waitlist" ON waitlist;
CREATE POLICY "anon_update_waitlist" ON waitlist FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_waitlist" ON waitlist;
CREATE POLICY "anon_delete_waitlist" ON waitlist FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_waitlist_client ON waitlist (client_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist (status);
