-- Add missing payment_verified_at column to registration_requests
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;

-- Add payment_verified_by column if missing
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS payment_verified_by UUID REFERENCES profiles(id);

-- Also ensure child_registration_requests has same columns for consistency
ALTER TABLE child_registration_requests ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
ALTER TABLE child_registration_requests ADD COLUMN IF NOT EXISTS payment_verified_by UUID REFERENCES profiles(id);

-- Create storage bucket for registration documents if needed
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'registration-documents',
  'registration-documents', 
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Show results
SELECT 'payment_verified_at' as column_added, 
       EXISTS(SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'registration_requests' 
              AND column_name = 'payment_verified_at') as exists;
