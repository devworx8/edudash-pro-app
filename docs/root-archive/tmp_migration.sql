-- Add missing payment_verified_at and payment_verified_by columns to registration_requests table
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS payment_verified_by UUID REFERENCES auth.users(id);
COMMENT ON COLUMN registration_requests.payment_verified_at IS 'When payment was verified by principal';
COMMENT ON COLUMN registration_requests.payment_verified_by IS 'User ID of principal who verified payment';
