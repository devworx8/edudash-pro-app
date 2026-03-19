-- Migration: Year Plan Input Windows
-- Enables principals to open time-boxed planning input windows for teachers
-- to contribute theme suggestions, event requests, resource needs, reflections,
-- and assessment preferences to the annual/term plan.

-- ════════════════════════════════════════════════════════════
-- 1. YEAR PLAN INPUT WINDOWS
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS year_plan_input_windows (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    preschool_id uuid NOT NULL REFERENCES preschools(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    window_type text NOT NULL CHECK (window_type IN (
        'year_end_reflection',
        'annual_planning',
        'term_planning',
        'open_call'
    )),
    academic_year integer NOT NULL,
    target_term_id uuid REFERENCES academic_terms(id) ON DELETE SET NULL,
    opens_at timestamptz NOT NULL,
    closes_at timestamptz NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    allowed_categories text[] NOT NULL DEFAULT ARRAY[
        'theme_suggestion','event_request','resource_need','reflection','assessment_preference'
    ],
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT valid_window_dates CHECK (closes_at > opens_at)
);

-- Indexes
CREATE INDEX idx_ypiw_preschool_year ON year_plan_input_windows(preschool_id, academic_year);
CREATE INDEX idx_ypiw_active ON year_plan_input_windows(preschool_id, is_active, opens_at, closes_at);

-- Updated_at trigger
CREATE TRIGGER set_updated_at_year_plan_input_windows
    BEFORE UPDATE ON year_plan_input_windows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE year_plan_input_windows ENABLE ROW LEVEL SECURITY;

-- Principals: full access within their school
CREATE POLICY ypiw_principal_all ON year_plan_input_windows
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

-- Teachers: read active windows for their school (including upcoming, so they can see what's coming)
CREATE POLICY ypiw_teacher_select ON year_plan_input_windows
    FOR SELECT
    USING (
        is_active = true
        AND preschool_id IN (
            SELECT COALESCE(p.organization_id, p.preschool_id)
            FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'teacher'
        )
    );

-- Super admins: full access
CREATE POLICY ypiw_super_admin_all ON year_plan_input_windows
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
GRANT ALL ON year_plan_input_windows TO authenticated;
