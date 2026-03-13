-- Keep fee_corrections_audit append-only while still allowing
-- Postgres to clear student_fee_id when a parent student_fees row is deleted.
-- Without this exception, ON DELETE SET NULL triggers the blanket no-update
-- guard and fee deletion fails even though the FK is configured correctly.

CREATE OR REPLACE FUNCTION public.prevent_fee_corrections_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.student_fee_id IS NOT NULL
     AND NEW.student_fee_id IS NULL
     AND (to_jsonb(NEW) - 'student_fee_id') = (to_jsonb(OLD) - 'student_fee_id') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'fee_corrections_audit is append-only';
END;
$$;
