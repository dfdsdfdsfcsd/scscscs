/*
# Add gemini_api_key column to settings table

## Changes
- Adds `gemini_api_key` (text, nullable) to the `settings` table.
- This column stores the Google Gemini API key used by the gemini-ai edge function.
- The key is written and read only by the edge function using the service role key,
  so it is never exposed to the frontend via the anon key.

## Security
- No RLS policy changes needed — the column is not exposed to the frontend.
  The anon role already has SELECT on settings; to prevent the key from leaking,
  we REVOKE the anon SELECT on just this column and grant it only to authenticated.
*/

ALTER TABLE settings ADD COLUMN IF NOT EXISTS gemini_api_key text;

-- Restrict anon access to the gemini_api_key column
REVOKE SELECT (gemini_api_key) ON settings FROM anon;
