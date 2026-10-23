/*
# Add Campaigns, Expense Installments, and Campaign Linking

1. New Tables
- `campaigns` — marketing/sales campaigns with category, period, status, description, optional goals
  - id (uuid PK)
  - name (text, not null)
  - category (text) — e.g. Natal, Casamentos, Ensaio externo, etc.
  - start_date (date)
  - end_date (date, nullable)
  - status (text, default 'ativa') — ativa, pausada, encerrada
  - description (text)
  - goal_revenue (numeric, nullable) — optional revenue target
  - goal_orders (int, nullable) — optional order count target
  - created_at, updated_at

2. Modified Tables
- `budgets`: add `campaign_id` (uuid, nullable, FK to campaigns, set null)
- `service_orders`: add `campaign_id` (uuid, nullable, FK to campaigns, set null) — replaces free-text campaign where available
- `financial_expenses`: add installment fields
  - `card_name` (text, nullable) — credit card name if applicable
  - `total_installments` (int, default 1) — total number of installments
  - `installment_number` (int, default 1) — which installment this row represents
  - `parent_expense_id` (uuid, nullable, FK to financial_expenses) — links installments to the original purchase
  - `campaign_id` (uuid, nullable, FK to campaigns, set null)

3. Security
- Single-tenant no-auth app: RLS enabled, policies TO anon, authenticated with USING(true)
- Grants for campaigns table to anon, authenticated
*/

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'ativa',
  description text,
  goal_revenue numeric(12,2),
  goal_orders int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_campaigns" ON campaigns;
CREATE POLICY "anon_select_campaigns" ON campaigns FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_campaigns" ON campaigns;
CREATE POLICY "anon_insert_campaigns" ON campaigns FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_campaigns" ON campaigns;
CREATE POLICY "anon_update_campaigns" ON campaigns FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_campaigns" ON campaigns;
CREATE POLICY "anon_delete_campaigns" ON campaigns FOR DELETE TO anon, authenticated USING (true);

-- Add campaign_id to budgets
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budgets' AND column_name = 'campaign_id') THEN
    ALTER TABLE budgets ADD COLUMN campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add campaign_id to service_orders
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_orders' AND column_name = 'campaign_id') THEN
    ALTER TABLE service_orders ADD COLUMN campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add installment fields to financial_expenses
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_expenses' AND column_name = 'card_name') THEN
    ALTER TABLE financial_expenses ADD COLUMN card_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_expenses' AND column_name = 'total_installments') THEN
    ALTER TABLE financial_expenses ADD COLUMN total_installments int NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_expenses' AND column_name = 'installment_number') THEN
    ALTER TABLE financial_expenses ADD COLUMN installment_number int NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_expenses' AND column_name = 'parent_expense_id') THEN
    ALTER TABLE financial_expenses ADD COLUMN parent_expense_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_expenses' AND column_name = 'campaign_id') THEN
    ALTER TABLE financial_expenses ADD COLUMN campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add FK for parent_expense_id self-reference
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_expense_parent' AND table_name = 'financial_expenses') THEN
    ALTER TABLE financial_expenses ADD CONSTRAINT fk_expense_parent FOREIGN KEY (parent_expense_id) REFERENCES financial_expenses(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_budgets_campaign ON budgets (campaign_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_campaign ON service_orders (campaign_id);
CREATE INDEX IF NOT EXISTS idx_expenses_campaign ON financial_expenses (campaign_id);
CREATE INDEX IF NOT EXISTS idx_expenses_parent ON financial_expenses (parent_expense_id);
