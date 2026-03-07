-- Learning Enhancement P1: attendance, CPTD, NSNP, class posts, school settings
-- Adds core tables for attendance tracking, SACE CPTD logging, NSNP reporting,
-- and class story/photo journal. Also adds teacher_can_send_homework setting.

BEGIN;

-- =============================================================================
-- School setting: teacher_can_send_homework (bypass principal approval)
-- =============================================================================

ALTER TABLE public.preschools
  ADD COLUMN IF NOT EXISTS teacher_can_send_homework boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.preschools.teacher_can_send_homework IS
  'When true, teachers can assign homework directly without principal approval.';

-- =============================================================================
-- Attendance: add 'excused' status to existing attendance table
-- =============================================================================

-- Extend status check constraint to include 'excused'
DO $$
BEGIN
  -- Drop existing constraint if it exists (may have different name)
  BEGIN
    ALTER TABLE public.attendance
      DROP CONSTRAINT IF EXISTS attendance_status_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  -- Add constraint that includes 'excused'
  ALTER TABLE public.attendance
    ADD CONSTRAINT attendance_status_check
    CHECK (status IN ('present', 'absent', 'late', 'excused'));
END
$$;

-- Ensure class_id column exists (needed for per-class attendance queries)
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_class_date
  ON public.attendance (class_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_org
  ON public.attendance (organization_id);

-- =============================================================================
-- SACE CPTD Activities (SA teacher professional development tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cptd_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.preschools(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  hours numeric(4, 1) NOT NULL CHECK (hours > 0),
  description text,
  evidence_path text,
  sace_category text,
  activity_date date,
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cptd_activities IS
  'SACE Continuing Professional Teacher Development (CPTD) activity log.';

CREATE INDEX IF NOT EXISTS idx_cptd_teacher
  ON public.cptd_activities (teacher_id);

CREATE INDEX IF NOT EXISTS idx_cptd_org
  ON public.cptd_activities (organization_id);

ALTER TABLE public.cptd_activities ENABLE ROW LEVEL SECURITY;

-- Teachers: manage their own CPTD records
CREATE POLICY "Teachers manage own CPTD"
  ON public.cptd_activities
  FOR ALL
  USING (teacher_id = auth.uid());

-- Principals: read CPTD for their org's teachers
CREATE POLICY "Principals read org CPTD"
  ON public.cptd_activities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('principal', 'principal_admin', 'super_admin')
        AND (
          p.organization_id = cptd_activities.organization_id
          OR p.preschool_id = cptd_activities.organization_id
          OR p.role = 'super_admin'
        )
    )
  );

-- =============================================================================
-- NSNP (National School Nutrition Programme) daily reporting
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.nsnp_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.preschools(id) ON DELETE CASCADE,
  date date NOT NULL,
  meals_served integer NOT NULL CHECK (meals_served >= 0),
  funded_count integer CHECK (funded_count >= 0),
  menu_description text,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, recorded_by, date)
);

COMMENT ON TABLE public.nsnp_records IS
  'Daily National School Nutrition Programme meal counts per class.';

CREATE INDEX IF NOT EXISTS idx_nsnp_class_date
  ON public.nsnp_records (class_id, date);

CREATE INDEX IF NOT EXISTS idx_nsnp_org_date
  ON public.nsnp_records (organization_id, date);

ALTER TABLE public.nsnp_records ENABLE ROW LEVEL SECURITY;

-- Teachers: manage their own NSNP records
CREATE POLICY "Teachers manage own NSNP records"
  ON public.nsnp_records
  FOR ALL
  USING (recorded_by = auth.uid());

-- Principals: full access within their org
CREATE POLICY "Principals manage NSNP for their org"
  ON public.nsnp_records
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('principal', 'principal_admin', 'super_admin')
        AND (
          p.organization_id = nsnp_records.organization_id
          OR p.preschool_id = nsnp_records.organization_id
          OR p.role = 'super_admin'
        )
    )
  );

-- =============================================================================
-- Class Posts (photo journal / class story for parent engagement)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.class_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id),
  organization_id uuid REFERENCES public.preschools(id) ON DELETE CASCADE,
  caption text,
  photo_paths text[],
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.class_posts IS
  'Teacher photo journal / class story entries for parent engagement.';

CREATE INDEX IF NOT EXISTS idx_class_posts_class
  ON public.class_posts (class_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_class_posts_org
  ON public.class_posts (organization_id);

ALTER TABLE public.class_posts ENABLE ROW LEVEL SECURITY;

-- Teachers: manage posts for their classes
CREATE POLICY "Teachers manage class posts"
  ON public.class_posts
  FOR ALL
  USING (teacher_id = auth.uid());

-- Parents: read posts for their child's class
CREATE POLICY "Parents read class posts"
  ON public.class_posts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.parent_id = auth.uid()
        AND s.class_id = class_posts.class_id
    )
  );

-- Principals: read all posts in their org
CREATE POLICY "Principals read org class posts"
  ON public.class_posts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('principal', 'principal_admin', 'super_admin')
        AND (
          p.organization_id = class_posts.organization_id
          OR p.preschool_id = class_posts.organization_id
          OR p.role = 'super_admin'
        )
    )
  );

COMMIT;
