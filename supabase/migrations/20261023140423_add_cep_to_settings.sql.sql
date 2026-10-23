/*
# Add CEP column to settings table

1. Modified Tables
- `settings` — add `cep` text column (nullable) for studio address CEP lookup
2. Security
- No policy changes needed; existing grants cover the new column.
*/

ALTER TABLE settings ADD COLUMN IF NOT EXISTS cep text;
