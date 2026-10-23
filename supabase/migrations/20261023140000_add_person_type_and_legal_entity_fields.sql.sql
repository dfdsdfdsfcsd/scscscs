/*
# Add person type and legal entity fields to clients

1. Modified Tables
- `clients` — add columns for legal entity support:
  - person_type (text, default 'fisica') — 'fisica' or 'juridica'
  - legal_name (text, nullable) — razão social for legal entities
  - fantasy_name (text, nullable) — nome fantasia for legal entities
  - cnpj (text, nullable) — CNPJ for legal entities
  - state_registration (text, nullable) — inscrição estadual
  - municipal_registration (text, nullable) — inscrição municipal
  - contact_person_name (text, nullable) — responsible contact person for legal entities
2. Security
- No new tables; existing RLS policies and grants on `clients` already cover the new columns.
- No policy changes needed — the new columns are nullable and covered by existing column-agnostic grants.
*/

ALTER TABLE clients ADD COLUMN IF NOT EXISTS person_type text NOT NULL DEFAULT 'fisica';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS legal_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS fantasy_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cnpj text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS state_registration text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS municipal_registration text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person_name text;
