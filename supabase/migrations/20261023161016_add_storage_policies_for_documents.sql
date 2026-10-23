/*
# Storage policies for documents bucket

1. Security
- Allow anon + authenticated to read, upload, update, and delete files in the 'documents' bucket.
- Single-tenant app with no sign-in, so USING(true) is acceptable.
*/

DROP POLICY IF EXISTS "public_read_documents" ON storage.objects;
CREATE POLICY "public_read_documents"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "public_upload_documents" ON storage.objects;
CREATE POLICY "public_upload_documents"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "public_update_documents" ON storage.objects;
CREATE POLICY "public_update_documents"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "public_delete_documents" ON storage.objects;
CREATE POLICY "public_delete_documents"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'documents');
