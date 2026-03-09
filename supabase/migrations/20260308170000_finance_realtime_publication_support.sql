-- Publish finance tables needed for principal/admin dashboard live refresh.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payment_allocations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_allocations;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'students'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'registration_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.registration_requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'child_registration_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.child_registration_requests;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.payments REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.payment_allocations REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.students REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.registration_requests REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.child_registration_requests REPLICA IDENTITY FULL;
