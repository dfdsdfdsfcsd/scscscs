/*
# Email Send History and Gmail Settings

## Overview
Adds support for sending Service Orders (OS) to clients by email via Gmail.
Creates a new table to track email send history and adds Gmail connection fields to the settings table.

## New Tables
### email_send_history
- `id` (uuid, primary key)
- `service_order_id` (uuid, foreign key to service_orders, ON DELETE CASCADE)
- `order_code` (text) — snapshot of the OS code at send time
- `client_id` (uuid, foreign key to clients, ON DELETE SET NULL)
- `recipient_email` (text) — email address used for sending
- `subject` (text) — email subject
- `status` (text) — 'enviado', 'falhou', 'pendente'
- `error_message` (text, nullable) — error details on failure
- `sent_at` (timestamptz, nullable) — timestamp of successful send
- `created_at` (timestamptz, default now())

## Modified Tables
### settings (new columns)
- `gmail_connected` (boolean, default false) — whether Gmail is connected
- `gmail_account_email` (text, nullable) — connected Gmail account email
- `gmail_sender_name` (text, nullable) — display name for outgoing emails

## Security
- RLS enabled on email_send_history.
- Grants: SELECT, INSERT, UPDATE, DELETE to anon, authenticated (single-tenant app, no sign-in).
- Policies: all CRUD allowed for anon + authenticated (data is intentionally shared within the single-tenant app).
- No user_id columns — this is a single-tenant app with no auth.

## Important Notes
1. The email_send_history table stores the result of each attempt to email an OS to a client.
2. Duplicate prevention: the frontend checks recent entries before inserting to avoid duplicate records on retries.
3. The Gmail connection state is stored in Electron's userData directory (tokens), NOT in the database — only the connection status and email are persisted in settings for UI display.
*/

CREATE TABLE IF NOT EXISTS email_send_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid REFERENCES service_orders(id) ON DELETE CASCADE,
  order_code text,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'pendente',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_send_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON email_send_history TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_email_history" ON email_send_history;
CREATE POLICY "anon_select_email_history" ON email_send_history
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_email_history" ON email_send_history;
CREATE POLICY "anon_insert_email_history" ON email_send_history
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_email_history" ON email_send_history;
CREATE POLICY "anon_update_email_history" ON email_send_history
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_email_history" ON email_send_history;
CREATE POLICY "anon_delete_email_history" ON email_send_history
  FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_email_history_order_id ON email_send_history(service_order_id);
CREATE INDEX IF NOT EXISTS idx_email_history_created_at ON email_send_history(created_at DESC);

-- Add Gmail settings columns to settings table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'gmail_connected') THEN
    ALTER TABLE settings ADD COLUMN gmail_connected boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'gmail_account_email') THEN
    ALTER TABLE settings ADD COLUMN gmail_account_email text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'gmail_sender_name') THEN
    ALTER TABLE settings ADD COLUMN gmail_sender_name text;
  END IF;
END $$;
