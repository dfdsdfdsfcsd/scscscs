/*
# Studio Management Schema - Initial Creation

Creates the full database structure for the photographer studio management web app.

## New Tables

1. `settings` — single-row studio identity + preferences (name, colors, theme, currency, etc.)
2. `clients` — customer records with full personal data + optional gestante-specific fields
3. `client_attachments` — metadata for files referenced/copied against a client
4. `client_photo_folders` — authorized photo folder paths per client with authorization status
5. `client_history` — timeline entries (cadastros, orçamentos, pagamentos, etc.)
6. `services` — catalog of services/products with pricing, category, duration
7. `service_categories` — lookup categories for services
8. `budgets` — budget/quote header (client, status, totals, payment terms)
9. `budget_items` — line items belonging to a budget
10. `appointments` — calendar events linked to clients/services
11. `cash_registers` — daily cash register open/close records
12. `cash_transactions` — entries/exits within a cash register
13. `financial_entries` — receivables (contas a receber) with installments
14. `financial_expenses` — payables (contas a pagar)
15. `message_templates` — reusable message templates (birthday, etc.)
16. `document_templates` — contract/term templates with auto-field placeholders
17. `activity_log` — audit trail of important operations
18. `alert_dismissals` — tracks which alerts the user dismissed

## Security
- Single-tenant app (no sign-in). All policies use `TO anon, authenticated` with `USING (true)` because data is intentionally shared/public on this instance.
- RLS enabled on every table.

## Notes
1. All monetary values stored as numeric(12,2) in BRL.
2. Dates stored as date; timestamps as timestamptz.
3. Cascading deletes from parent (client) to children where appropriate.
4. Budget status flows: rascunho -> enviado -> aguardando -> aprovado/recusado/expirado/cancelado.
*/

-- ============ SETTINGS ============
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_name text NOT NULL DEFAULT 'Meu Estúdio',
  fantasy_name text,
  tax_id text,
  address text,
  phone text,
  whatsapp text,
  email text,
  logo_url text,
  primary_color text NOT NULL DEFAULT '#0f766e',
  accent_color text NOT NULL DEFAULT '#f59e0b',
  theme text NOT NULL DEFAULT 'light',
  date_format text NOT NULL DEFAULT 'DD/MM/YYYY',
  currency text NOT NULL DEFAULT 'BRL',
  business_hours text,
  default_duration_min int NOT NULL DEFAULT 60,
  alerts_enabled boolean NOT NULL DEFAULT true,
  alert_advance_days int NOT NULL DEFAULT 7,
  documents_folder text,
  exports_folder text,
  backup_folder text,
  cancellation_rules text,
  reschedule_rules text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_settings" ON settings;
CREATE POLICY "anon_select_settings" ON settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_settings" ON settings;
CREATE POLICY "anon_insert_settings" ON settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_settings" ON settings;
CREATE POLICY "anon_update_settings" ON settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_settings" ON settings;
CREATE POLICY "anon_delete_settings" ON settings FOR DELETE TO anon, authenticated USING (true);

-- ============ SERVICE CATEGORIES ============
CREATE TABLE IF NOT EXISTS service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_service_categories" ON service_categories;
CREATE POLICY "anon_select_service_categories" ON service_categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_service_categories" ON service_categories;
CREATE POLICY "anon_insert_service_categories" ON service_categories FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_service_categories" ON service_categories;
CREATE POLICY "anon_update_service_categories" ON service_categories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_service_categories" ON service_categories;
CREATE POLICY "anon_delete_service_categories" ON service_categories FOR DELETE TO anon, authenticated USING (true);

-- ============ SERVICES ============
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  category text,
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  duration_min int NOT NULL DEFAULT 60,
  unit text NOT NULL DEFAULT 'única',
  active boolean NOT NULL DEFAULT true,
  observations text,
  payment_conditions text,
  delivery_days int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_services" ON services;
CREATE POLICY "anon_select_services" ON services FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_services" ON services;
CREATE POLICY "anon_insert_services" ON services FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_services" ON services;
CREATE POLICY "anon_update_services" ON services FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_services" ON services;
CREATE POLICY "anon_delete_services" ON services FOR DELETE TO anon, authenticated USING (true);

-- ============ CLIENTS ============
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  full_name text NOT NULL,
  social_name text,
  cpf text,
  birth_date date,
  phone text,
  whatsapp text,
  email text,
  cep text,
  address text,
  address_number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  first_contact date DEFAULT CURRENT_DATE,
  origin text,
  observations text,
  status text NOT NULL DEFAULT 'ativo',
  -- gestante-specific (optional)
  due_date date,
  baby_name text,
  shoot_type text,
  scenery_preferences text,
  costume_preferences text,
  references_notes text,
  companion_name text,
  pose_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_clients" ON clients;
CREATE POLICY "anon_select_clients" ON clients FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_clients" ON clients;
CREATE POLICY "anon_insert_clients" ON clients FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_clients" ON clients;
CREATE POLICY "anon_update_clients" ON clients FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_clients" ON clients;
CREATE POLICY "anon_delete_clients" ON clients FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_clients_full_name ON clients (full_name);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients (status);

-- ============ CLIENT ATTACHMENTS ============
CREATE TABLE IF NOT EXISTS client_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  mode text NOT NULL DEFAULT 'referenced',
  observations text,
  attached_at timestamptz DEFAULT now()
);

ALTER TABLE client_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_client_attachments" ON client_attachments;
CREATE POLICY "anon_select_client_attachments" ON client_attachments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_client_attachments" ON client_attachments;
CREATE POLICY "anon_insert_client_attachments" ON client_attachments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_client_attachments" ON client_attachments;
CREATE POLICY "anon_update_client_attachments" ON client_attachments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_client_attachments" ON client_attachments;
CREATE POLICY "anon_delete_client_attachments" ON client_attachments FOR DELETE TO anon, authenticated USING (true);

-- ============ CLIENT PHOTO FOLDERS ============
CREATE TABLE IF NOT EXISTS client_photo_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  folder_path text NOT NULL,
  authorization_status text NOT NULL DEFAULT 'pendente',
  authorization_notes text,
  last_checked date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE client_photo_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_client_photo_folders" ON client_photo_folders;
CREATE POLICY "anon_select_client_photo_folders" ON client_photo_folders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_client_photo_folders" ON client_photo_folders;
CREATE POLICY "anon_insert_client_photo_folders" ON client_photo_folders FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_client_photo_folders" ON client_photo_folders;
CREATE POLICY "anon_update_client_photo_folders" ON client_photo_folders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_client_photo_folders" ON client_photo_folders;
CREATE POLICY "anon_delete_client_photo_folders" ON client_photo_folders FOR DELETE TO anon, authenticated USING (true);

-- ============ CLIENT HISTORY ============
CREATE TABLE IF NOT EXISTS client_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE client_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_client_history" ON client_history;
CREATE POLICY "anon_select_client_history" ON client_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_client_history" ON client_history;
CREATE POLICY "anon_insert_client_history" ON client_history FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_client_history" ON client_history;
CREATE POLICY "anon_update_client_history" ON client_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_client_history" ON client_history;
CREATE POLICY "anon_delete_client_history" ON client_history FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_client_history_client ON client_history (client_id, created_at DESC);

-- ============ BUDGETS ============
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'rascunho',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  general_discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  deposit numeric(12,2) NOT NULL DEFAULT 0,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  payment_conditions text,
  valid_until date,
  observations text,
  template_style text NOT NULL DEFAULT 'simples',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_budgets" ON budgets;
CREATE POLICY "anon_select_budgets" ON budgets FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_budgets" ON budgets;
CREATE POLICY "anon_insert_budgets" ON budgets FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_budgets" ON budgets;
CREATE POLICY "anon_update_budgets" ON budgets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_budgets" ON budgets;
CREATE POLICY "anon_delete_budgets" ON budgets FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_budgets_client ON budgets (client_id);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON budgets (status);

-- ============ BUDGET ITEMS ============
CREATE TABLE IF NOT EXISTS budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  is_custom boolean NOT NULL DEFAULT false,
  name text NOT NULL,
  description text,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_budget_items" ON budget_items;
CREATE POLICY "anon_select_budget_items" ON budget_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_budget_items" ON budget_items;
CREATE POLICY "anon_insert_budget_items" ON budget_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_budget_items" ON budget_items;
CREATE POLICY "anon_update_budget_items" ON budget_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_budget_items" ON budget_items;
CREATE POLICY "anon_delete_budget_items" ON budget_items FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_budget_items_budget ON budget_items (budget_id);

-- ============ APPOINTMENTS ============
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  title text NOT NULL,
  appointment_date date NOT NULL,
  start_time text NOT NULL,
  duration_min int NOT NULL DEFAULT 60,
  location text,
  observations text,
  reminder boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'agendado',
  appointment_type text NOT NULL DEFAULT 'ensaio',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_appointments" ON appointments;
CREATE POLICY "anon_select_appointments" ON appointments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_appointments" ON appointments;
CREATE POLICY "anon_insert_appointments" ON appointments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_appointments" ON appointments;
CREATE POLICY "anon_update_appointments" ON appointments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_appointments" ON appointments;
CREATE POLICY "anon_delete_appointments" ON appointments FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments (appointment_date);

-- ============ CASH REGISTERS ============
CREATE TABLE IF NOT EXISTS cash_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_date date NOT NULL DEFAULT CURRENT_DATE,
  open_time timestamptz NOT NULL DEFAULT now(),
  close_time timestamptz,
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  counted_balance numeric(12,2),
  difference numeric(12,2),
  difference_notes text,
  responsible text,
  notes text,
  status text NOT NULL DEFAULT 'aberto',
  total_in numeric(12,2) NOT NULL DEFAULT 0,
  total_out numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_cash_registers" ON cash_registers;
CREATE POLICY "anon_select_cash_registers" ON cash_registers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_cash_registers" ON cash_registers;
CREATE POLICY "anon_insert_cash_registers" ON cash_registers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_cash_registers" ON cash_registers;
CREATE POLICY "anon_update_cash_registers" ON cash_registers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_cash_registers" ON cash_registers;
CREATE POLICY "anon_delete_cash_registers" ON cash_registers FOR DELETE TO anon, authenticated USING (true);

-- ============ CASH TRANSACTIONS ============
CREATE TABLE IF NOT EXISTS cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_register_id uuid NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  budget_id uuid REFERENCES budgets(id) ON DELETE SET NULL,
  type text NOT NULL,
  category text,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL DEFAULT 'dinheiro',
  document_number text,
  responsible text,
  observations text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_cash_transactions" ON cash_transactions;
CREATE POLICY "anon_select_cash_transactions" ON cash_transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_cash_transactions" ON cash_transactions;
CREATE POLICY "anon_insert_cash_transactions" ON cash_transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_cash_transactions" ON cash_transactions;
CREATE POLICY "anon_update_cash_transactions" ON cash_transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_cash_transactions" ON cash_transactions;
CREATE POLICY "anon_delete_cash_transactions" ON cash_transactions FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cash_tx_register ON cash_transactions (cash_register_id);

-- ============ FINANCIAL ENTRIES (contas a receber) ============
CREATE TABLE IF NOT EXISTS financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  budget_id uuid REFERENCES budgets(id) ON DELETE SET NULL,
  description text NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  paid_date date,
  installment_number int NOT NULL DEFAULT 1,
  total_installments int NOT NULL DEFAULT 1,
  payment_method text,
  category text NOT NULL DEFAULT 'servico',
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_financial_entries" ON financial_entries;
CREATE POLICY "anon_select_financial_entries" ON financial_entries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_financial_entries" ON financial_entries;
CREATE POLICY "anon_insert_financial_entries" ON financial_entries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_financial_entries" ON financial_entries;
CREATE POLICY "anon_update_financial_entries" ON financial_entries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_financial_entries" ON financial_entries;
CREATE POLICY "anon_delete_financial_entries" ON financial_entries FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_fin_entries_due ON financial_entries (due_date);
CREATE INDEX IF NOT EXISTS idx_fin_entries_status ON financial_entries (status);

-- ============ FINANCIAL EXPENSES (contas a pagar) ============
CREATE TABLE IF NOT EXISTS financial_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  paid_date date,
  category text NOT NULL DEFAULT 'diversas',
  supplier text,
  payment_method text,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_financial_expenses" ON financial_expenses;
CREATE POLICY "anon_select_financial_expenses" ON financial_expenses FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_financial_expenses" ON financial_expenses;
CREATE POLICY "anon_insert_financial_expenses" ON financial_expenses FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_financial_expenses" ON financial_expenses;
CREATE POLICY "anon_update_financial_expenses" ON financial_expenses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_financial_expenses" ON financial_expenses;
CREATE POLICY "anon_delete_financial_expenses" ON financial_expenses FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_fin_expenses_due ON financial_expenses (due_date);
CREATE INDEX IF NOT EXISTS idx_fin_expenses_status ON financial_expenses (status);

-- ============ MESSAGE TEMPLATES ============
CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'aniversario',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_message_templates" ON message_templates;
CREATE POLICY "anon_select_message_templates" ON message_templates FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_message_templates" ON message_templates;
CREATE POLICY "anon_insert_message_templates" ON message_templates FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_message_templates" ON message_templates;
CREATE POLICY "anon_update_message_templates" ON message_templates FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_message_templates" ON message_templates;
CREATE POLICY "anon_delete_message_templates" ON message_templates FOR DELETE TO anon, authenticated USING (true);

-- ============ DOCUMENT TEMPLATES ============
CREATE TABLE IF NOT EXISTS document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  header text,
  footer text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_document_templates" ON document_templates;
CREATE POLICY "anon_select_document_templates" ON document_templates FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_document_templates" ON document_templates;
CREATE POLICY "anon_insert_document_templates" ON document_templates FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_document_templates" ON document_templates;
CREATE POLICY "anon_update_document_templates" ON document_templates FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_document_templates" ON document_templates;
CREATE POLICY "anon_delete_document_templates" ON document_templates FOR DELETE TO anon, authenticated USING (true);

-- ============ ACTIVITY LOG ============
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity text,
  entity_id uuid,
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_activity_log" ON activity_log;
CREATE POLICY "anon_select_activity_log" ON activity_log FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_activity_log" ON activity_log;
CREATE POLICY "anon_insert_activity_log" ON activity_log FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_activity_log" ON activity_log;
CREATE POLICY "anon_update_activity_log" ON activity_log FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_activity_log" ON activity_log;
CREATE POLICY "anon_delete_activity_log" ON activity_log FOR DELETE TO anon, authenticated USING (true);

-- ============ ALERT DISMISSALS ============
CREATE TABLE IF NOT EXISTS alert_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL,
  alert_type text NOT NULL,
  dismissed_at timestamptz DEFAULT now()
);

ALTER TABLE alert_dismissals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_alert_dismissals" ON alert_dismissals;
CREATE POLICY "anon_select_alert_dismissals" ON alert_dismissals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_alert_dismissals" ON alert_dismissals;
CREATE POLICY "anon_insert_alert_dismissals" ON alert_dismissals FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_alert_dismissals" ON alert_dismissals;
CREATE POLICY "anon_delete_alert_dismissals" ON alert_dismissals FOR DELETE TO anon, authenticated USING (true);
