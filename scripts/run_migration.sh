#!/bin/bash
# Run migrations via psql

export PGPASSWORD='hHFgMNhsfdUKUEkA'
PSQL="psql -h aws-0-ap-southeast-1.pooler.supabase.com -p 6543 -U postgres.lvvvjywrmpcqrpvuptdi -d postgres"

echo "=== Checking storage buckets ==="
$PSQL -c "SELECT id, name, public FROM storage.buckets ORDER BY id;"

echo ""
echo "=== Creating registration-documents bucket if not exists ==="
$PSQL << 'EOF'
-- Create registration-documents bucket for parent document uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'registration-documents',
  'registration-documents',
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
EOF

echo ""
echo "=== Setting up RLS policies for registration-documents bucket ==="
$PSQL << 'EOF'
-- Drop existing policies if any
DROP POLICY IF EXISTS "Parents can upload registration documents" ON storage.objects;
DROP POLICY IF EXISTS "Parents can view own registration documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view all registration documents" ON storage.objects;

-- Policy: Parents can upload documents to their own folder
CREATE POLICY "Parents can upload registration documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'registration-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Parents can view their own documents
CREATE POLICY "Parents can view own registration documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'registration-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Staff (principals/teachers) can view all registration documents
CREATE POLICY "Staff can view all registration documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'registration-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
    AND up.role IN ('principal', 'teacher', 'admin', 'super_admin')
  )
);
EOF

echo ""
echo "=== Verifying bucket creation ==="
$PSQL -c "SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'registration-documents';"

echo ""
echo "=== Migration complete ==="
