-- Migration: Personal dictionary for voice STT corrections
--
-- User-level spoken-form → canonical-form mappings that improve
-- transcript quality over time. Corrections a user makes manually
-- can be saved as personal dictionary entries.
--
-- Ownership: strict per-user via RLS on user_id = auth.uid()

CREATE TABLE IF NOT EXISTS public.user_voice_dictionary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spoken_form text NOT NULL,
  canonical_form text NOT NULL,
  language text DEFAULT 'en',
  source text DEFAULT 'manual',  -- 'manual' | 'correction' | 'import'
  use_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT spoken_form_length CHECK (char_length(spoken_form) BETWEEN 1 AND 200),
  CONSTRAINT canonical_form_length CHECK (char_length(canonical_form) BETWEEN 1 AND 500),
  CONSTRAINT unique_user_spoken UNIQUE (user_id, spoken_form, language)
);

-- Index for fast lookup during transcript processing
CREATE INDEX IF NOT EXISTS idx_user_voice_dict_lookup
  ON public.user_voice_dictionary (user_id, language, is_active)
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.user_voice_dictionary ENABLE ROW LEVEL SECURITY;

-- Owner-only policies
CREATE POLICY user_voice_dict_select_own ON public.user_voice_dictionary
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_voice_dict_insert_own ON public.user_voice_dictionary
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_voice_dict_update_own ON public.user_voice_dictionary
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_voice_dict_delete_own ON public.user_voice_dictionary
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Service role full access
CREATE POLICY user_voice_dict_service_role ON public.user_voice_dictionary
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.user_voice_dictionary_updated_at()
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

DROP TRIGGER IF EXISTS trg_user_voice_dict_updated_at ON public.user_voice_dictionary;
CREATE TRIGGER trg_user_voice_dict_updated_at
  BEFORE UPDATE ON public.user_voice_dictionary
  FOR EACH ROW EXECUTE FUNCTION public.user_voice_dictionary_updated_at();

REVOKE ALL ON FUNCTION public.user_voice_dictionary_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_voice_dictionary_updated_at() TO service_role;
