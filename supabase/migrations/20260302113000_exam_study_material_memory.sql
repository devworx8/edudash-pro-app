-- Persist OCR study material summaries so future exam generations can reuse context.

CREATE TABLE IF NOT EXISTS public.exam_study_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  auth_user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NULL REFERENCES public.students(id) ON DELETE SET NULL,
  school_id UUID NULL REFERENCES public.preschools(id) ON DELETE SET NULL,
  student_scope TEXT NOT NULL DEFAULT '',
  grade TEXT NULL,
  subject TEXT NULL,
  language TEXT NULL,
  source_name TEXT NULL,
  summary_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 1 CHECK (usage_count >= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  origin TEXT NOT NULL DEFAULT 'exam_prep_upload',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_study_materials_dedupe
  ON public.exam_study_materials (auth_user_id, student_scope, content_hash);

CREATE INDEX IF NOT EXISTS idx_exam_study_materials_auth_user
  ON public.exam_study_materials (auth_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_study_materials_student
  ON public.exam_study_materials (student_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_study_materials_school_subject_grade
  ON public.exam_study_materials (school_id, subject, grade, updated_at DESC);

ALTER TABLE public.exam_study_materials ENABLE ROW LEVEL SECURITY;

-- Create policies only if missing (avoids DROP POLICY and AccessExclusiveLock, reducing deadlock risk)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exam_study_materials' AND policyname = 'Users can read own exam study materials') THEN
    CREATE POLICY "Users can read own exam study materials"
      ON public.exam_study_materials FOR SELECT TO authenticated USING (auth.uid() = auth_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exam_study_materials' AND policyname = 'Users can insert own exam study materials') THEN
    CREATE POLICY "Users can insert own exam study materials"
      ON public.exam_study_materials FOR INSERT TO authenticated WITH CHECK (auth.uid() = auth_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exam_study_materials' AND policyname = 'Users can update own exam study materials') THEN
    CREATE POLICY "Users can update own exam study materials"
      ON public.exam_study_materials FOR UPDATE TO authenticated USING (auth.uid() = auth_user_id) WITH CHECK (auth.uid() = auth_user_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.trg_set_updated_at()') IS NULL THEN
    CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trigger_exam_study_materials_updated_at ON public.exam_study_materials;
CREATE TRIGGER trigger_exam_study_materials_updated_at
  BEFORE UPDATE ON public.exam_study_materials
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_updated_at();

COMMENT ON TABLE public.exam_study_materials IS 'OCR-derived learner study material memory used to ground future exam generations.';
COMMENT ON COLUMN public.exam_study_materials.summary_text IS 'Cleaned OCR summary text used as grounding context.';
COMMENT ON COLUMN public.exam_study_materials.content_hash IS 'Deterministic hash for deduping repeated uploads.';
