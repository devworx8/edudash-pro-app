-- Migration: Voice snippets for Dash ORB
-- 
-- User-defined trigger phrases that expand into full text during
-- transcript finalization (e.g., "homework note" → "Please remember to
-- complete the homework assignment by Friday.")
--
-- Ownership: strict per-user via RLS on user_id = auth.uid()

CREATE TABLE IF NOT EXISTS public.voice_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_phrase text NOT NULL,
  expansion_text text NOT NULL,
  language text DEFAULT 'en',
  is_active boolean DEFAULT true,
  use_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT trigger_phrase_length CHECK (char_length(trigger_phrase) BETWEEN 2 AND 100),
  CONSTRAINT expansion_text_length CHECK (char_length(expansion_text) BETWEEN 1 AND 2000),
  CONSTRAINT unique_user_trigger UNIQUE (user_id, trigger_phrase)
);

-- Index for fast lookup during transcript processing
CREATE INDEX IF NOT EXISTS idx_voice_snippets_user_active
  ON public.voice_snippets (user_id, is_active)
  WHERE is_active = true;

-- Enable RLS — all access scoped to owner
ALTER TABLE public.voice_snippets ENABLE ROW LEVEL SECURITY;

-- Owner-only SELECT
CREATE POLICY voice_snippets_select_own ON public.voice_snippets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Owner-only INSERT
CREATE POLICY voice_snippets_insert_own ON public.voice_snippets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Owner-only UPDATE
CREATE POLICY voice_snippets_update_own ON public.voice_snippets
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Owner-only DELETE
CREATE POLICY voice_snippets_delete_own ON public.voice_snippets
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Service role has full access (for admin tooling)
CREATE POLICY voice_snippets_service_role ON public.voice_snippets
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.voice_snippets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_snippets_updated_at ON public.voice_snippets;
CREATE TRIGGER trg_voice_snippets_updated_at
  BEFORE UPDATE ON public.voice_snippets
  FOR EACH ROW EXECUTE FUNCTION public.voice_snippets_updated_at();

REVOKE ALL ON FUNCTION public.voice_snippets_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.voice_snippets_updated_at() TO service_role;
