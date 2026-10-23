/*
# Fix financial tracking: discount, refunds, linking, monthly closing

## Changes
### 1. financial_entries — add discount and refund columns
- discount_amount (numeric, default 0) — discount applied to this entry
- discount_reason (text, nullable) — justification for the discount
- refund_amount (numeric, default 0) — amount refunded/estorno
- original_entry_id (uuid, nullable) — for refund entries, references the original entry

### 2. cash_transactions — add financial_entry_id link
- financial_entry_id (uuid, nullable) — links to financial_entries to prevent double counting
  This lets us identify which cash transactions were auto-created from financial page payments.

### 3. New table: monthly_closings
Tracks monthly reconciliation periods.
- id (uuid, primary key)
- period_month (int 1-12, not null)
- period_year (int, not null)
- total_receivable (numeric) — sum of receivable entries in period
- total_received (numeric) — sum of actually received amounts
- total_payable (numeric) — sum of payable entries in period
- total_paid (numeric) — sum of actually paid amounts
- cash_in (numeric) — total cash entries in period
- cash_out (numeric) — total cash exits in period
- discrepancies (text, nullable) — notes about differences found
- status (text: 'pendente' | 'revisado' | 'alterado') — review status
- reviewed_by (text, nullable) — who reviewed
- reviewed_at (timestamptz, nullable) — when reviewed
- closed_at (timestamptz, nullable) — when marked as reviewed
- unique constraint on (period_month, period_year)

### 4. Security
- RLS on monthly_closings, grants for anon+authenticated
- Index on cash_transactions.financial_entry_id
*/

-- 1. Add discount and refund columns to financial_entries
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS discount_reason text;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS refund_amount numeric DEFAULT 0;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS original_entry_id uuid;

-- 2. Add financial_entry_id to cash_transactions for traceability
ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS financial_entry_id uuid;

CREATE INDEX IF NOT EXISTS idx_cash_tx_financial_entry ON cash_transactions (financial_entry_id) WHERE financial_entry_id IS NOT NULL;

-- 3. Create monthly_closings table
CREATE TABLE IF NOT EXISTS monthly_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month int NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  period_year int NOT NULL,
  total_receivable numeric DEFAULT 0,
  total_received numeric DEFAULT 0,
  total_payable numeric DEFAULT 0,
  total_paid numeric DEFAULT 0,
  cash_in numeric DEFAULT 0,
  cash_out numeric DEFAULT 0,
  discrepancies text,
  status text NOT NULL DEFAULT 'pendente',
  reviewed_by text,
  reviewed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (period_month, period_year)
);

ALTER TABLE monthly_closings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON monthly_closings TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_monthly_closings" ON monthly_closings;
CREATE POLICY "anon_select_monthly_closings" ON monthly_closings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_monthly_closings" ON monthly_closings;
CREATE POLICY "anon_insert_monthly_closings" ON monthly_closings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_monthly_closings" ON monthly_closings;
CREATE POLICY "anon_update_monthly_closings" ON monthly_closings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_monthly_closings" ON monthly_closings;
CREATE POLICY "anon_delete_monthly_closings" ON monthly_closings FOR DELETE
  TO anon, authenticated USING (true);
