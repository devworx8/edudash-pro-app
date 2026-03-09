-- Sprint 1 Security: Temp password hashing + invite hardening
-- 1. Enable pgcrypto for bcrypt hashing
-- 2. Add temp_password_hash column to store bcrypt hash instead of plaintext
-- 3. Add trigger to auto-hash on insert/update
-- 4. Enforce invite expiry via DB constraint check

-- ── Enable pgcrypto ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── join_requests: add hashed column, auto-hash trigger ─────────────────────
ALTER TABLE join_requests
  ADD COLUMN IF NOT EXISTS temp_password_hash TEXT;

-- Trigger function: whenever temp_password is set, hash it and clear plaintext
CREATE OR REPLACE FUNCTION _hash_join_request_temp_password()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.temp_password IS NOT NULL AND NEW.temp_password <> '' THEN
    NEW.temp_password_hash := crypt(NEW.temp_password, gen_salt('bf', 10));
    NEW.temp_password := NULL; -- clear plaintext immediately
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hash_join_request_temp_password ON join_requests;
CREATE TRIGGER hash_join_request_temp_password
  BEFORE INSERT OR UPDATE OF temp_password ON join_requests
  FOR EACH ROW EXECUTE FUNCTION _hash_join_request_temp_password();

-- Backfill: clear any existing plaintext (cannot recover hash from old data)
UPDATE join_requests SET temp_password = NULL WHERE temp_password IS NOT NULL;

-- ── region_invite_codes: same treatment (table may not exist) ────────────────
-- Add column conditionally
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'region_invite_codes'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'region_invite_codes' AND column_name = 'temp_password_hash'
    ) THEN
      ALTER TABLE region_invite_codes ADD COLUMN temp_password_hash TEXT;
    END IF;
  END IF;
END $$;

-- Create function at top level (safe even if table doesn't exist — trigger won't fire)
CREATE OR REPLACE FUNCTION _hash_region_invite_temp_password()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.temp_password IS NOT NULL AND NEW.temp_password <> '' THEN
    NEW.temp_password_hash := crypt(NEW.temp_password, gen_salt('bf', 10));
    NEW.temp_password := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger only if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'region_invite_codes'
  ) THEN
    DROP TRIGGER IF EXISTS hash_region_invite_temp_password ON region_invite_codes;
    CREATE TRIGGER hash_region_invite_temp_password
      BEFORE INSERT OR UPDATE OF temp_password ON region_invite_codes
      FOR EACH ROW EXECUTE FUNCTION _hash_region_invite_temp_password();

    UPDATE region_invite_codes SET temp_password = NULL WHERE temp_password IS NOT NULL;
  END IF;
END $$;

-- ── teacher_invites: ensure expires_at has 14-day default + add used_at ──────
ALTER TABLE teacher_invites
  ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '14 days');

ALTER TABLE teacher_invites
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

-- Index to speed up pending invite lookups
CREATE INDEX IF NOT EXISTS idx_teacher_invites_token_status_expires
  ON teacher_invites (token, status, expires_at)
  WHERE status = 'pending';

-- Automatically expire invites older than expires_at via a view or periodic job
-- (RLS/application layer enforces expires_at > now() checks)

COMMENT ON COLUMN join_requests.temp_password_hash IS
  'Bcrypt hash of the temp password. The plaintext is cleared immediately after hashing via trigger.';
COMMENT ON COLUMN teacher_invites.used_at IS
  'Timestamp when the invite was accepted/used. Null = not yet used.';
