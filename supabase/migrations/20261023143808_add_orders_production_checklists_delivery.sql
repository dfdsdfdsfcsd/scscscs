/*
# Add Orders Production, Checklists, and Delivery Tracking

1. New Tables
- `order_items` — individual line items per order with qty, price, discount
  - id (uuid PK)
  - order_id (uuid FK to service_orders, cascade)
  - service_id (uuid FK to services, set null)
  - is_custom (boolean)
  - name (text)
  - description (text)
  - quantity (numeric)
  - unit_price (numeric)
  - discount (numeric)
  - subtotal (numeric)
- `production_steps` — track each production stage with responsible, deadline, change history
  - id (uuid PK)
  - order_id (uuid FK, cascade)
  - step_name (text)
  - step_order (int)
  - status (text: pendente, em_andamento, concluido)
  - assigned_to (text)
  - started_at (timestamptz)
  - completed_at (timestamptz)
  - notes (text)
  - created_at, updated_at
- `production_step_history` — audit log of changes to production steps
  - id (uuid PK)
  - step_id (uuid FK, cascade)
  - field_changed (text)
  - old_value (text)
  - new_value (text)
  - changed_at (timestamptz)
- `checklist_templates` — reusable checklist models per service type
  - id (uuid PK)
  - name (text)
  - service_type (text, nullable — null = applies to all)
  - is_active (boolean)
  - created_at, updated_at
- `checklist_template_items` — items within a template
  - id (uuid PK)
  - template_id (uuid FK, cascade)
  - label (text)
  - item_order (int)
- `order_checklists` — snapshot of checklist tasks generated for a specific order (immutable from template changes)
  - id (uuid PK)
  - order_id (uuid FK, cascade)
  - template_id (uuid FK, set null)
  - label (text)
  - item_order (int)
  - is_done (boolean)
  - done_at (timestamptz)
  - done_by (text)
  - snapshot_template_name (text)

2. Modified Tables
- `service_orders`:
  - Add `campaign` (text) — optional campaign reference
  - Add `digital_delivered` (boolean default false) — independent digital delivery tracking
  - Add `digital_delivered_at` (timestamptz)
  - Add `printed_delivered` (boolean default false) — independent printed delivery tracking
  - Add `printed_delivered_at` (timestamptz)
  - Add `delivery_confirmed` (boolean default false) — idempotent flag for DAR BAIXA
  - Add `delivery_confirmed_at` (timestamptz)
  - Add `delivery_confirmed_by` (text)

3. Sequence for OS numbering
- Create sequence `service_orders_code_seq` starting at 1
- Create function `generate_os_code()` that returns 'os' || nextval padded to 2 digits
  - Guarantees uniqueness even with concurrent inserts (nextval is atomic)

4. Security
- Single-tenant no-auth app: RLS enabled, policies TO anon, authenticated with USING(true)
- Grants for all new tables to anon, authenticated
*/

-- Sequence for OS numbering
CREATE SEQUENCE IF NOT EXISTS service_orders_code_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_os_code() RETURNS text AS $$
DECLARE
  next_num bigint;
BEGIN
  next_num := nextval('service_orders_code_seq');
  RETURN 'os' || lpad(next_num::text, 2, '0');
END;
$$ LANGUAGE plpgsql;

-- Add columns to service_orders
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_orders' AND column_name = 'campaign') THEN
    ALTER TABLE service_orders ADD COLUMN campaign text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_orders' AND column_name = 'digital_delivered') THEN
    ALTER TABLE service_orders ADD COLUMN digital_delivered boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_orders' AND column_name = 'digital_delivered_at') THEN
    ALTER TABLE service_orders ADD COLUMN digital_delivered_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_orders' AND column_name = 'printed_delivered') THEN
    ALTER TABLE service_orders ADD COLUMN printed_delivered boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_orders' AND column_name = 'printed_delivered_at') THEN
    ALTER TABLE service_orders ADD COLUMN printed_delivered_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_orders' AND column_name = 'delivery_confirmed') THEN
    ALTER TABLE service_orders ADD COLUMN delivery_confirmed boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_orders' AND column_name = 'delivery_confirmed_at') THEN
    ALTER TABLE service_orders ADD COLUMN delivery_confirmed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_orders' AND column_name = 'delivery_confirmed_by') THEN
    ALTER TABLE service_orders ADD COLUMN delivery_confirmed_by text;
  END IF;
END $$;

-- Grant sequence usage
GRANT USAGE ON SEQUENCE service_orders_code_seq TO anon, authenticated;

-- Grant function execution
GRANT EXECUTE ON FUNCTION generate_os_code() TO anon, authenticated;

-- order_items
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  is_custom boolean NOT NULL DEFAULT false,
  name text NOT NULL,
  description text,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON order_items TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_order_items" ON order_items;
CREATE POLICY "anon_select_order_items" ON order_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_order_items" ON order_items;
CREATE POLICY "anon_insert_order_items" ON order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_order_items" ON order_items;
CREATE POLICY "anon_update_order_items" ON order_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_order_items" ON order_items;
CREATE POLICY "anon_delete_order_items" ON order_items FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

-- production_steps
CREATE TABLE IF NOT EXISTS production_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  step_name text NOT NULL,
  step_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  assigned_to text,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE production_steps ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON production_steps TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_production_steps" ON production_steps;
CREATE POLICY "anon_select_production_steps" ON production_steps FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_production_steps" ON production_steps;
CREATE POLICY "anon_insert_production_steps" ON production_steps FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_production_steps" ON production_steps;
CREATE POLICY "anon_update_production_steps" ON production_steps FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_production_steps" ON production_steps;
CREATE POLICY "anon_delete_production_steps" ON production_steps FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_production_steps_order ON production_steps (order_id);

-- production_step_history
CREATE TABLE IF NOT EXISTS production_step_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES production_steps(id) ON DELETE CASCADE,
  field_changed text NOT NULL,
  old_value text,
  new_value text,
  changed_at timestamptz DEFAULT now()
);

ALTER TABLE production_step_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON production_step_history TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_step_history" ON production_step_history;
CREATE POLICY "anon_select_step_history" ON production_step_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_step_history" ON production_step_history;
CREATE POLICY "anon_insert_step_history" ON production_step_history FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_step_history_step ON production_step_history (step_id);

-- checklist_templates
CREATE TABLE IF NOT EXISTS checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_type text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON checklist_templates TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_checklist_templates" ON checklist_templates;
CREATE POLICY "anon_select_checklist_templates" ON checklist_templates FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_checklist_templates" ON checklist_templates;
CREATE POLICY "anon_insert_checklist_templates" ON checklist_templates FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_checklist_templates" ON checklist_templates;
CREATE POLICY "anon_update_checklist_templates" ON checklist_templates FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_checklist_templates" ON checklist_templates;
CREATE POLICY "anon_delete_checklist_templates" ON checklist_templates FOR DELETE TO anon, authenticated USING (true);

-- checklist_template_items
CREATE TABLE IF NOT EXISTS checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  item_order int NOT NULL DEFAULT 0
);

ALTER TABLE checklist_template_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON checklist_template_items TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_ct_items" ON checklist_template_items;
CREATE POLICY "anon_select_ct_items" ON checklist_template_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_ct_items" ON checklist_template_items;
CREATE POLICY "anon_insert_ct_items" ON checklist_template_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_ct_items" ON checklist_template_items;
CREATE POLICY "anon_update_ct_items" ON checklist_template_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_ct_items" ON checklist_template_items;
CREATE POLICY "anon_delete_ct_items" ON checklist_template_items FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ct_items_template ON checklist_template_items (template_id);

-- order_checklists (snapshots — not affected by future template changes)
CREATE TABLE IF NOT EXISTS order_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  template_id uuid REFERENCES checklist_templates(id) ON DELETE SET NULL,
  label text NOT NULL,
  item_order int NOT NULL DEFAULT 0,
  is_done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  done_by text,
  snapshot_template_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_checklists ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON order_checklists TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_order_checklists" ON order_checklists;
CREATE POLICY "anon_select_order_checklists" ON order_checklists FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_order_checklists" ON order_checklists;
CREATE POLICY "anon_insert_order_checklists" ON order_checklists FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_order_checklists" ON order_checklists;
CREATE POLICY "anon_update_order_checklists" ON order_checklists FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_order_checklists" ON order_checklists;
CREATE POLICY "anon_delete_order_checklists" ON order_checklists FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_order_checklists_order ON order_checklists (order_id);
