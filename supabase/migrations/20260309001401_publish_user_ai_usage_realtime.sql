-- Publish user_ai_usage to Supabase Realtime so the client-side
-- useRealtimeTier hook receives live updates when quota increments.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_ai_usage'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_ai_usage;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.user_ai_usage REPLICA IDENTITY FULL;
