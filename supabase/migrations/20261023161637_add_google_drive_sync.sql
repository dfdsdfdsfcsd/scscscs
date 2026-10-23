/*
# Add Google Drive sync settings and document sync log

1. New Tables
- `document_sync_log` — tracks sync status of documents to Google Drive
  - `id` (uuid, primary key)
  - `client_id` (uuid, nullable, references clients)
  - `attachment_id` (uuid, nullable, references client_attachments)
  - `file_name` (text) — standardized file name
  - `category` (text) — Contratos, Autorizacoes, Ordens de Servico, Recibos, Outros Documentos
  - `client_name` (text, nullable) — client name at time of sync (denormalized for display)
  - `year` (int) — year for folder organization
  - `status` (text) — 'pending', 'synced', 'failed', 'retry'
  - `drive_file_id` (text, nullable) — Google Drive file ID
  - `drive_folder_id` (text, nullable) — Google Drive folder ID
  - `drive_url` (text, nullable) — link to file in Drive
  - `error_message` (text, nullable)
  - `synced_at` (timestamptz, nullable)
  - `created_at` (timestamptz)

2. Modified Tables
- `settings` — add columns:
  - `gdrive_connected` (boolean, default false)
  - `gdrive_account_email` (text, nullable) — connected Google account
  - `gdrive_auto_sync` (boolean, default false) — auto-upload enabled
  - `gdrive_last_sync` (timestamptz, nullable) — last successful sync
  - `gdrive_root_folder_id` (text, nullable) — root "Estúdio Fotográfico — Gestão" folder ID
  - `gdrive_root_folder_url` (text, nullable) — link to root folder

3. Security
- Enable RLS on document_sync_log.
- Grant CRUD to anon + authenticated (single-tenant, no sign-in).
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'gdrive_connected') THEN
    ALTER TABLE settings ADD COLUMN gdrive_connected boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'gdrive_account_email') THEN
    ALTER TABLE settings ADD COLUMN gdrive_account_email text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'gdrive_auto_sync') THEN
    ALTER TABLE settings ADD COLUMN gdrive_auto_sync boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'gdrive_last_sync') THEN
    ALTER TABLE settings ADD COLUMN gdrive_last_sync timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'gdrive_root_folder_id') THEN
    ALTER TABLE settings ADD COLUMN gdrive_root_folder_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'gdrive_root_folder_url') THEN
    ALTER TABLE settings ADD COLUMN gdrive_root_folder_url text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS document_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  attachment_id text,
  file_name text NOT NULL,
  category text NOT NULL,
  client_name text,
  year int NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  status text NOT NULL DEFAULT 'pending',
  drive_file_id text,
  drive_folder_id text,
  drive_url text,
  error_message text,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE document_sync_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON document_sync_log TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_sync_log" ON document_sync_log;
CREATE POLICY "anon_select_sync_log" ON document_sync_log FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sync_log" ON document_sync_log;
CREATE POLICY "anon_insert_sync_log" ON document_sync_log FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sync_log" ON document_sync_log;
CREATE POLICY "anon_update_sync_log" ON document_sync_log FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sync_log" ON document_sync_log;
CREATE POLICY "anon_delete_sync_log" ON document_sync_log FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_document_sync_log_status ON document_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_document_sync_log_client ON document_sync_log(client_id);
