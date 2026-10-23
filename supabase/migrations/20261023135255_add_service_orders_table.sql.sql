/*
# Add Service Orders (Ordens de Servico) table

1. New Tables
- `service_orders` — tracks production/service orders linked to budgets or appointments
  - id (uuid, primary key)
  - code (text, not null) — auto-generated order code like OS-0001
  - client_id (uuid, FK to clients, cascade delete)
  - budget_id (uuid, FK to budgets, set null on delete) — optional link to approved budget
  - appointment_id (uuid, FK to appointments, set null on delete) — optional link to appointment
  - title (text, not null) — short description of the work
  - description (text) — detailed work description
  - status (text, not null, default 'rascunho') — flow: rascunho -> em_producao -> concluido -> entregue -> cancelado
  - priority (text, not null, default 'normal') — baixa, normal, alta, urgente
  - assigned_to (text) — who is responsible for executing the work
  - items_summary (text) — quick list of what's being produced
  - due_date (date) — delivery deadline
  - started_at (timestamptz) — when production started
  - completed_at (timestamptz) — when work was completed
  - delivered_at (timestamptz) — when client received the product
  - delivery_method (text) — retira_loja, correios, entrega_direta, digital
  - tracking_code (text) — tracking number if shipped
  - notes (text) — internal notes
  - created_at (timestamptz)
  - updated_at (timestamptz)
2. Security
- Single-tenant no-auth app: RLS enabled, policies TO anon, authenticated with USING(true).
*/

CREATE TABLE IF NOT EXISTS service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  budget_id uuid REFERENCES budgets(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'rascunho',
  priority text NOT NULL DEFAULT 'normal',
  assigned_to text,
  items_summary text,
  due_date date,
  started_at timestamptz,
  completed_at timestamptz,
  delivered_at timestamptz,
  delivery_method text,
  tracking_code text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON service_orders TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_service_orders" ON service_orders;
CREATE POLICY "anon_select_service_orders" ON service_orders FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_service_orders" ON service_orders;
CREATE POLICY "anon_insert_service_orders" ON service_orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_service_orders" ON service_orders;
CREATE POLICY "anon_update_service_orders" ON service_orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_service_orders" ON service_orders;
CREATE POLICY "anon_delete_service_orders" ON service_orders FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_service_orders_client ON service_orders (client_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders (status);
CREATE INDEX IF NOT EXISTS idx_service_orders_due_date ON service_orders (due_date);
