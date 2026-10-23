/*
# Enhance client_history and add CRM tasks table

## Changes

### 1. client_history — add source linking columns
- `source_table` (text, nullable) — name of the table the event originated from (e.g. 'budgets', 'appointments')
- `source_id` (uuid, nullable) — id of the source record
These columns allow timeline entries to link back to their originating record so users can open it directly.

### 2. New table: crm_tasks
Tracks tasks, opportunities, follow-ups, and attendiments for the CRM.
- `id` (uuid, primary key)
- `client_id` (uuid, FK to clients, nullable — some tasks may not be client-specific)
- `title` (text, not null)
- `description` (text, nullable)
- `type` (text, default 'tarefa') — tarefa, oportunidade, follow_up, atendimento
- `status` (text, default 'pendente') — pendente, em_andamento, concluido, cancelado
- `priority` (text, default 'media') — baixa, media, alta
- `due_date` (date, nullable)
- `completed_at` (timestamptz, nullable)
- `created_at` / `updated_at` (timestamptz)

### 3. Security
- RLS enabled on crm_tasks
- Grants and policies for anon + authenticated (single-tenant, no auth)
- Index on client_id and status for frequent queries
*/

-- 1. Enhance client_history with source linking
ALTER TABLE client_history ADD COLUMN IF NOT EXISTS source_table text;
ALTER TABLE client_history ADD COLUMN IF NOT EXISTS source_id uuid;

-- 2. Create crm_tasks table
CREATE TABLE IF NOT EXISTS crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'tarefa',
  status text NOT NULL DEFAULT 'pendente',
  priority text NOT NULL DEFAULT 'media',
  due_date date,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON crm_tasks TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_crm_tasks" ON crm_tasks;
CREATE POLICY "anon_select_crm_tasks" ON crm_tasks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_crm_tasks" ON crm_tasks;
CREATE POLICY "anon_insert_crm_tasks" ON crm_tasks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_crm_tasks" ON crm_tasks;
CREATE POLICY "anon_update_crm_tasks" ON crm_tasks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_crm_tasks" ON crm_tasks;
CREATE POLICY "anon_delete_crm_tasks" ON crm_tasks FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_client ON crm_tasks (client_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks (status, due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_type ON crm_tasks (type, status);
