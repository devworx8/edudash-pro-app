-- Migration: Year Plan Teacher Submissions
-- Teachers submit input (themes, events, resources, reflections, assessment prefs)
-- through open input windows. Principals review, approve/modify/decline,
-- and incorporate into the year plan.

-- ════════════════════════════════════════════════════════════
-- 1. YEAR PLAN TEACHER SUBMISSIONS
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS year_plan_teacher_submissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    preschool_id uuid NOT NULL REFERENCES preschools(id) ON DELETE CASCADE,
    window_id uuid NOT NULL REFERENCES year_plan_input_windows(id) ON DELETE CASCADE,
    submitted_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category text NOT NULL CHECK (category IN (
        'theme_suggestion',
        'event_request',
        'resource_need',
        'reflection',
        'assessment_preference'
    )),
    title text NOT NULL,
    description text,
    -- Structured fields (nullable, depend on category)
    target_term_number integer,
    target_month integer CHECK (target_month IS NULL OR (target_month BETWEEN 1 AND 12)),
    target_week_number integer,
    suggested_date date,
    suggested_bucket text,
    learning_objectives text[] DEFAULT '{}',
    materials_needed text[] DEFAULT '{}',
    estimated_cost text,
    age_groups text[] DEFAULT '{}',
    priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    -- Review state
    status text NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'under_review', 'approved', 'modified', 'declined'
    )),
    reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    principal_notes text,
    principal_modifications jsonb,
    incorporated_into_entry_id uuid REFERENCES year_plan_monthly_entries(id) ON DELETE SET NULL,
    incorporated_into_theme_id uuid REFERENCES curriculum_themes(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ypts_window_status ON year_plan_teacher_submissions(window_id, status);
CREATE INDEX idx_ypts_preschool_status ON year_plan_teacher_submissions(preschool_id, status);
CREATE INDEX idx_ypts_submitted_by ON year_plan_teacher_submissions(submitted_by, window_id);
CREATE INDEX idx_ypts_review ON year_plan_teacher_submissions(preschool_id, status, reviewed_at);

-- Updated_at trigger
CREATE TRIGGER set_updated_at_year_plan_teacher_submissions
    BEFORE UPDATE ON year_plan_teacher_submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE year_plan_teacher_submissions ENABLE ROW LEVEL SECURITY;

-- Teachers: insert own submissions (only into active, open windows)
CREATE POLICY ypts_teacher_insert ON year_plan_teacher_submissions
    FOR INSERT
    WITH CHECK (
        submitted_by = auth.uid()
        AND preschool_id IN (
            SELECT COALESCE(p.organization_id, p.preschool_id)
            FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('teacher', 'principal', 'principal_admin')
        )
        AND EXISTS (
            SELECT 1 FROM year_plan_input_windows w
            WHERE w.id = window_id
              AND w.is_active = true
              AND now() BETWEEN w.opens_at AND w.closes_at
        )
    );

-- Teachers: read own submissions
CREATE POLICY ypts_teacher_select ON year_plan_teacher_submissions
    FOR SELECT
    USING (
        submitted_by = auth.uid()
        AND preschool_id IN (
            SELECT COALESCE(p.organization_id, p.preschool_id)
            FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('teacher', 'principal', 'principal_admin')
        )
    );

-- Principals: full access within their school
CREATE POLICY ypts_principal_all ON year_plan_teacher_submissions
    FOR ALL
    USING (
        preschool_id IN (
            SELECT COALESCE(p.organization_id, p.preschool_id)
            FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('principal', 'admin', 'principal_admin')
        )
    )
    WITH CHECK (
        preschool_id IN (
            SELECT COALESCE(p.organization_id, p.preschool_id)
            FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('principal', 'admin', 'principal_admin')
        )
    );

-- Super admins: full access
CREATE POLICY ypts_super_admin_all ON year_plan_teacher_submissions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'super_admin'
        )
    );

-- Grant access to authenticated users (RLS enforces row-level rules)
GRANT ALL ON year_plan_teacher_submissions TO authenticated;

-- ════════════════════════════════════════════════════════════
-- 2. RPC: Get submission counts for badge display
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_year_plan_submission_counts(
    p_preschool_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result jsonb;
BEGIN
    -- Verify caller is principal/admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('principal', 'admin', 'principal_admin', 'super_admin')
          AND (p.role = 'super_admin' OR COALESCE(p.organization_id, p.preschool_id) = p_preschool_id)
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT jsonb_build_object(
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'under_review', COUNT(*) FILTER (WHERE status = 'under_review'),
        'approved', COUNT(*) FILTER (WHERE status = 'approved'),
        'modified', COUNT(*) FILTER (WHERE status = 'modified'),
        'declined', COUNT(*) FILTER (WHERE status = 'declined'),
        'total', COUNT(*)
    ) INTO result
    FROM year_plan_teacher_submissions
    WHERE preschool_id = p_preschool_id;

    RETURN result;
END;
$$;
