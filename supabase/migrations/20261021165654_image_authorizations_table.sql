/*
# Image Authorizations Table

Creates a comprehensive table to store Termo de Autorização de Uso de Imagem, Voz e Nome documents for clients, with full structured data for all clauses required by Brazilian law (LGPD, ECA, Civil Code).

## New Tables

1. `image_authorizations` — stores complete image usage authorization records linked to a client and optionally to a photo folder.

### Columns
- `id` — uuid primary key
- `client_id` — FK to clients(id), cascade delete
- `photo_folder_id` — FK to client_photo_folders(id), set null on delete (links authorization to a specific photo folder)
- `version` — integer, version number of this authorization (increments for new versions)
- `status` — text: rascunho, aguardando_assinatura, autorizado, recusado, revogado, expirado, substituido
- `doc_number` — text, auto-generated document number
- `session_date` — date of the photo session
- `session_title` — text, description of the session/shoot

#### Authorizing person (may differ from photographed person)
- `authorizer_name` — text, name of person granting authorization
- `authorizer_cpf` — text
- `authorizer_relationship` — text, relationship to photographed person (self, parent, guardian, etc.)
- `authorizer_email` — text
- `authorizer_phone` — text
- `authorizer_address` — text

#### Photographed person (if different)
- `photographed_name` — text, name of person photographed
- `photographed_cpf` — text, when applicable
- `photographed_birth_date` — date, for age verification
- `is_minor` — boolean, whether photographed person is under 18

#### Minor-specific fields
- `minor_legal_guardian_name` — text
- `minor_legal_guardian_cpf` — text
- `minor_guardian_relationship` — text, degree of kinship or bond
- `minor_guardian_declaration` — text, declaration of legitimacy

#### Purposes (JSONB — each is independently selectable)
- `purposes` — jsonb, object with boolean flags: instagram, facebook, tiktok, youtube, pinterest, website_portfolio, google_business, stories_reels, paid_ads, printed_catalogs, physical_showroom, competitions_exhibitions, other_purposes
- `other_purposes_text` — text, description of other purposes

#### Materials authorized (JSONB)
- `materials` — jsonb, object with boolean flags: selected_photos, behind_the_scenes, session_videos, voice_recordings, person_name, testimonials, individual_photos, group_photos, pregnant_baby_children, other_materials
- `other_materials_text` — text
- `gallery_ref` — text, gallery or file/folder reference

#### Compensation
- `compensation_type` — text: gratuita or remunerada
- `compensation_value` — numeric(12,2)
- `compensation_payment_method` — text
- `compensation_deadline` — text

#### Editing permissions (JSONB)
- `editing_permissions` — jsonb, object: color_light_contrast, resize_compress, visual_identity, watermark, video_editing, format_adaptation

#### Duration and territory
- `start_date` — date, authorization start date
- `end_date` — date, authorization end date (null = indeterminate but not perpetual default)
- `renewable` — boolean
- `territory` — text, territory of disclosure
- `channels` — text, authorized channels/platforms
- `paid_campaign_conditions` — text

#### Privacy/LGPD
- `data_controller_name` — text
- `data_processing_purposes` — text
- `data_categories` — text
- `legal_basis` — text
- `data_subject_rights_channel` — text, contact for rights exercise
- `retention_criteria` — text
- `security_measures` — text
- `sharing_conditions` — text

#### Signatures
- `signing_city` — text
- `signing_date` — date
- `authorizer_signature` — text (typed name or signature image path)
- `guardian_signature` — text
- `studio_representative` — text
- `witness_1_name` — text
- `witness_1_cpf` — text
- `witness_2_name` — text
- `witness_2_cpf` — text
- `studio_contact_email` — text
- `studio_contact_phone` — text

#### Awareness declaration
- `awareness_declaration` — boolean, authorizer confirms they read and understood
- `document_version` — text, version identifier of the template used

- `notes` — text, internal notes
- `created_at` — timestamptz
- `updated_at` — timestamptz

2. `image_authorization_history` — tracks changes to each authorization for version history.

### Columns
- `id` — uuid primary key
- `authorization_id` — uuid FK to image_authorizations(id) cascade delete
- `action` — text, description of the change
- `previous_status` — text
- `new_status` — text
- `created_at` — timestamptz

## Security
- Single-tenant app (no sign-in). All policies use `TO anon, authenticated` with `USING (true)`.
- RLS enabled on both tables.

## Notes
1. The `purposes` and `materials` fields use JSONB so each consent item is independently selectable.
2. No authorization is considered perpetual or irrevocable by default — `end_date` must be explicitly set.
3. Status flow: rascunho -> aguardando_assinatura -> autorizado -> (revogado | expirado | substituido). Also: recusado from aguardando_assinatura.
*/

CREATE TABLE IF NOT EXISTS image_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  photo_folder_id uuid REFERENCES client_photo_folders(id) ON DELETE SET NULL,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'rascunho',
  doc_number text,
  session_date date,
  session_title text,

  authorizer_name text,
  authorizer_cpf text,
  authorizer_relationship text,
  authorizer_email text,
  authorizer_phone text,
  authorizer_address text,

  photographed_name text,
  photographed_cpf text,
  photographed_birth_date date,
  is_minor boolean NOT NULL DEFAULT false,

  minor_legal_guardian_name text,
  minor_legal_guardian_cpf text,
  minor_guardian_relationship text,
  minor_guardian_declaration text,

  purposes jsonb NOT NULL DEFAULT '{"instagram":false,"facebook":false,"tiktok":false,"youtube":false,"pinterest":false,"website_portfolio":false,"google_business":false,"stories_reels":false,"paid_ads":false,"printed_catalogs":false,"physical_showroom":false,"competitions_exhibitions":false,"other_purposes":false}'::jsonb,
  other_purposes_text text,

  materials jsonb NOT NULL DEFAULT '{"selected_photos":false,"behind_the_scenes":false,"session_videos":false,"voice_recordings":false,"person_name":false,"testimonials":false,"individual_photos":false,"group_photos":false,"pregnant_baby_children":false,"other_materials":false}'::jsonb,
  other_materials_text text,
  gallery_ref text,

  compensation_type text NOT NULL DEFAULT 'gratuita',
  compensation_value numeric(12,2) DEFAULT 0,
  compensation_payment_method text,
  compensation_deadline text,

  editing_permissions jsonb NOT NULL DEFAULT '{"color_light_contrast":false,"resize_compress":false,"visual_identity":false,"watermark":false,"video_editing":false,"format_adaptation":false}'::jsonb,

  start_date date,
  end_date date,
  renewable boolean NOT NULL DEFAULT false,
  territory text,
  channels text,
  paid_campaign_conditions text,

  data_controller_name text,
  data_processing_purposes text,
  data_categories text,
  legal_basis text,
  data_subject_rights_channel text,
  retention_criteria text,
  security_measures text,
  sharing_conditions text,

  signing_city text,
  signing_date date,
  authorizer_signature text,
  guardian_signature text,
  studio_representative text,
  witness_1_name text,
  witness_1_cpf text,
  witness_2_name text,
  witness_2_cpf text,
  studio_contact_email text,
  studio_contact_phone text,

  awareness_declaration boolean NOT NULL DEFAULT false,
  document_version text,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE image_authorizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_image_authorizations" ON image_authorizations;
CREATE POLICY "anon_select_image_authorizations" ON image_authorizations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_image_authorizations" ON image_authorizations;
CREATE POLICY "anon_insert_image_authorizations" ON image_authorizations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_image_authorizations" ON image_authorizations;
CREATE POLICY "anon_update_image_authorizations" ON image_authorizations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_image_authorizations" ON image_authorizations;
CREATE POLICY "anon_delete_image_authorizations" ON image_authorizations FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_image_auth_client ON image_authorizations (client_id);
CREATE INDEX IF NOT EXISTS idx_image_auth_status ON image_authorizations (status);
CREATE INDEX IF NOT EXISTS idx_image_auth_folder ON image_authorizations (photo_folder_id);

CREATE TABLE IF NOT EXISTS image_authorization_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id uuid NOT NULL REFERENCES image_authorizations(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_status text,
  new_status text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE image_authorization_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_image_auth_history" ON image_authorization_history;
CREATE POLICY "anon_select_image_auth_history" ON image_authorization_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_image_auth_history" ON image_authorization_history;
CREATE POLICY "anon_insert_image_auth_history" ON image_authorization_history FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_image_auth_history_auth ON image_authorization_history (authorization_id, created_at DESC);
