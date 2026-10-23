/*
# Add Commissions, Rooms, Equipment, Loans, and Maintenance

1. New Tables

- `commission_rules` — commission configuration per service/professional/partner
  - id (uuid PK)
  - name (text) — rule label
  - service_id (uuid FK to services, nullable — null = all services)
  - professional (text, nullable) — who earns the commission
  - partner (text, nullable) — external partner if applicable
  - rule_type (text: 'percent' or 'fixed') — percentage or fixed amount
  - value (numeric) — percentage (0-100) or fixed BRL amount
  - base (text: 'gross', 'net') — calculation base: gross sale or net (after discounts)
  - is_active (boolean, default true)
  - effective_from (date) — when rule starts applying
  - effective_to (date, nullable) — when rule stops (null = indefinite)
  - created_at, updated_at

- `commissions` — individual commission records (snapshot, not recalculated)
  - id (uuid PK)
  - commission_rule_id (uuid FK to commission_rules, set null) — rule used (kept for reference even if rule later changes)
  - service_order_id (uuid FK to service_orders, set null) — order that generated it
  - budget_id (uuid FK to budgets, set null) — budget that generated it
  - service_id (uuid FK to services, set null)
  - professional (text) — who earns it
  - partner (text, nullable)
  - description (text)
  - base_value (numeric) — the base amount used for calculation
  - rule_type_snapshot (text) — snapshot of rule_type at creation time
  - value_snapshot (numeric) — snapshot of value at creation time
  - base_snapshot (text) — snapshot of base at creation time
  - estimated_amount (numeric) — projected commission
  - due_amount (numeric) — confirmed amount owed (may differ from estimate)
  - status (text: 'prevista', 'devida', 'paga', 'cancelada')
  - paid_date (date, nullable)
  - created_at, updated_at

- `rooms` — physical spaces/scenarios available for booking
  - id (uuid PK)
  - name (text, not null)
  - type (text) — 'sala', 'cenario', 'espaco', 'estudio'
  - capacity (int, nullable)
  - description (text)
  - is_active (boolean, default true)
  - created_at, updated_at

- `equipment` — equipment items that can be reserved or loaned
  - id (uuid PK)
  - name (text, not null)
  - category (text) — e.g. 'camera', 'lens', 'light', 'tripod', 'backdrop', 'accessory'
  - serial_number (text)
  - condition (text) — 'otimo', 'bom', 'regular', 'danificado'
  - is_active (boolean, default true)
  - created_at, updated_at

- `equipment_loans` — track equipment lent out
  - id (uuid PK)
  - equipment_id (uuid FK to equipment, cascade)
  - responsible (text, not null) — who took the equipment
  - checkout_date (date, not null)
  - expected_return_date (date, nullable)
  - actual_return_date (date, nullable)
  - status (text: 'emprestado', 'devolvido', 'atrasado')
  - notes (text)
  - created_at, updated_at

- `equipment_maintenance` — maintenance records
  - id (uuid PK)
  - equipment_id (uuid FK to equipment, cascade)
  - description (text, not null)
  - start_date (date, not null)
  - end_date (date, nullable) — null = still in maintenance
  - cost (numeric, default 0)
  - provider (text, nullable)
  - status (text: 'em_manutencao', 'concluido')
  - notes (text)
  - created_at, updated_at

2. Modified Tables
- `appointments`: add `room_id` (uuid FK to rooms, set null) and `equipment_id` (uuid FK to equipment, set null)
  - These complement existing free-text room/equipment fields for structured conflict checking

3. Security
- Single-tenant no-auth app: RLS enabled, policies TO anon, authenticated with USING(true)
- Grants for all new tables to anon, authenticated
*/

-- ============ COMMISSION RULES ============
CREATE TABLE IF NOT EXISTS commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  professional text,
  partner text,
  rule_type text NOT NULL DEFAULT 'percent' CHECK (rule_type IN ('percent', 'fixed')),
  value numeric(12,2) NOT NULL DEFAULT 0,
  base text NOT NULL DEFAULT 'gross' CHECK (base IN ('gross', 'net')),
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON commission_rules TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_commission_rules" ON commission_rules;
CREATE POLICY "anon_select_commission_rules" ON commission_rules FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_commission_rules" ON commission_rules;
CREATE POLICY "anon_insert_commission_rules" ON commission_rules FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_commission_rules" ON commission_rules;
CREATE POLICY "anon_update_commission_rules" ON commission_rules FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_commission_rules" ON commission_rules;
CREATE POLICY "anon_delete_commission_rules" ON commission_rules FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_commission_rules_service ON commission_rules (service_id);

-- ============ COMMISSIONS ============
CREATE TABLE IF NOT EXISTS commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_rule_id uuid REFERENCES commission_rules(id) ON DELETE SET NULL,
  service_order_id uuid REFERENCES service_orders(id) ON DELETE SET NULL,
  budget_id uuid REFERENCES budgets(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  professional text,
  partner text,
  description text NOT NULL,
  base_value numeric(12,2) NOT NULL DEFAULT 0,
  rule_type_snapshot text NOT NULL DEFAULT 'percent',
  value_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  base_snapshot text NOT NULL DEFAULT 'gross',
  estimated_amount numeric(12,2) NOT NULL DEFAULT 0,
  due_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'prevista' CHECK (status IN ('prevista', 'devida', 'paga', 'cancelada')),
  paid_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON commissions TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_commissions" ON commissions;
CREATE POLICY "anon_select_commissions" ON commissions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_commissions" ON commissions;
CREATE POLICY "anon_insert_commissions" ON commissions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_commissions" ON commissions;
CREATE POLICY "anon_update_commissions" ON commissions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_commissions" ON commissions;
CREATE POLICY "anon_delete_commissions" ON commissions FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_commissions_order ON commissions (service_order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions (status);

-- ============ ROOMS ============
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'sala',
  capacity int,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON rooms TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_rooms" ON rooms;
CREATE POLICY "anon_select_rooms" ON rooms FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_rooms" ON rooms;
CREATE POLICY "anon_insert_rooms" ON rooms FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_rooms" ON rooms;
CREATE POLICY "anon_update_rooms" ON rooms FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_rooms" ON rooms;
CREATE POLICY "anon_delete_rooms" ON rooms FOR DELETE TO anon, authenticated USING (true);

-- ============ EQUIPMENT ============
CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  serial_number text,
  condition text NOT NULL DEFAULT 'otimo' CHECK (condition IN ('otimo', 'bom', 'regular', 'danificado')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipment TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_equipment" ON equipment;
CREATE POLICY "anon_select_equipment" ON equipment FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_equipment" ON equipment;
CREATE POLICY "anon_insert_equipment" ON equipment FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_equipment" ON equipment;
CREATE POLICY "anon_update_equipment" ON equipment FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_equipment" ON equipment;
CREATE POLICY "anon_delete_equipment" ON equipment FOR DELETE TO anon, authenticated USING (true);

-- ============ EQUIPMENT LOANS ============
CREATE TABLE IF NOT EXISTS equipment_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  responsible text NOT NULL,
  checkout_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_return_date date,
  actual_return_date date,
  status text NOT NULL DEFAULT 'emprestado' CHECK (status IN ('emprestado', 'devolvido', 'atrasado')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE equipment_loans ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipment_loans TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_equipment_loans" ON equipment_loans;
CREATE POLICY "anon_select_equipment_loans" ON equipment_loans FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_equipment_loans" ON equipment_loans;
CREATE POLICY "anon_insert_equipment_loans" ON equipment_loans FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_equipment_loans" ON equipment_loans;
CREATE POLICY "anon_update_equipment_loans" ON equipment_loans FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_equipment_loans" ON equipment_loans;
CREATE POLICY "anon_delete_equipment_loans" ON equipment_loans FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_equipment_loans_equipment ON equipment_loans (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_loans_status ON equipment_loans (status);

-- ============ EQUIPMENT MAINTENANCE ============
CREATE TABLE IF NOT EXISTS equipment_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  description text NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  provider text,
  status text NOT NULL DEFAULT 'em_manutencao' CHECK (status IN ('em_manutencao', 'concluido')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE equipment_maintenance ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipment_maintenance TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_equipment_maintenance" ON equipment_maintenance;
CREATE POLICY "anon_select_equipment_maintenance" ON equipment_maintenance FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_equipment_maintenance" ON equipment_maintenance;
CREATE POLICY "anon_insert_equipment_maintenance" ON equipment_maintenance FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_equipment_maintenance" ON equipment_maintenance;
CREATE POLICY "anon_update_equipment_maintenance" ON equipment_maintenance FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_equipment_maintenance" ON equipment_maintenance;
CREATE POLICY "anon_delete_equipment_maintenance" ON equipment_maintenance FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_equipment ON equipment_maintenance (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_status ON equipment_maintenance (status);

-- Add room_id and equipment_id to appointments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'room_id') THEN
    ALTER TABLE appointments ADD COLUMN room_id uuid REFERENCES rooms(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'equipment_id') THEN
    ALTER TABLE appointments ADD COLUMN equipment_id uuid REFERENCES equipment(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_room ON appointments (room_id);
CREATE INDEX IF NOT EXISTS idx_appointments_equipment ON appointments (equipment_id);