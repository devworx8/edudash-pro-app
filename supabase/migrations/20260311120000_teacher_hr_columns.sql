-- =============================================================
-- Teacher HR Management Columns
-- Adds employment, personal, compensation, and emergency
-- contact fields to the teachers table for full HR management.
-- =============================================================

-- ── Employment Details ───────────────────────────────────────
ALTER TABLE public.teachers
    ADD COLUMN IF NOT EXISTS employee_id       VARCHAR(50),
    ADD COLUMN IF NOT EXISTS contract_type     VARCHAR(30)
        DEFAULT 'permanent'
        CHECK (contract_type IN (
            'permanent', 'temporary', 'substitute',
            'probationary', 'intern', 'volunteer'
        )),
    ADD COLUMN IF NOT EXISTS employment_status VARCHAR(20)
        DEFAULT 'active'
        CHECK (employment_status IN (
            'active', 'inactive', 'pending', 'probation',
            'suspended', 'on_leave', 'terminated'
        )),
    ADD COLUMN IF NOT EXISTS hire_date         DATE,
    ADD COLUMN IF NOT EXISTS contract_end_date DATE,
    ADD COLUMN IF NOT EXISTS position_title    VARCHAR(100),
    ADD COLUMN IF NOT EXISTS department        VARCHAR(100);

-- ── Personal Information ─────────────────────────────────────
ALTER TABLE public.teachers
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS gender        VARCHAR(20),
    ADD COLUMN IF NOT EXISTS id_number     VARCHAR(20),
    ADD COLUMN IF NOT EXISTS address       TEXT;

-- ── Compensation ─────────────────────────────────────────────
ALTER TABLE public.teachers
    ADD COLUMN IF NOT EXISTS salary_basic      INTEGER,
    ADD COLUMN IF NOT EXISTS salary_allowances  INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS salary_deductions  INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pay_scale         VARCHAR(50);

-- ── Emergency Contact ────────────────────────────────────────
ALTER TABLE public.teachers
    ADD COLUMN IF NOT EXISTS emergency_contact_name         VARCHAR(200),
    ADD COLUMN IF NOT EXISTS emergency_contact_phone        VARCHAR(30),
    ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(50);

-- ── Admin Notes ──────────────────────────────────────────────
ALTER TABLE public.teachers
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_teachers_employee_id
    ON public.teachers (employee_id)
    WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teachers_employment_status
    ON public.teachers (employment_status);

CREATE INDEX IF NOT EXISTS idx_teachers_contract_type
    ON public.teachers (contract_type);

-- ── Backfill existing rows with sensible defaults ────────────
UPDATE public.teachers
SET
    employment_status = CASE
        WHEN is_active = TRUE THEN 'active'
        ELSE 'inactive'
    END,
    hire_date = created_at::DATE
WHERE employment_status IS NULL;

-- ── RLS: teachers table already has RLS enabled ──────────────
-- Existing policies cover SELECT/INSERT/UPDATE for authenticated
-- users within their preschool_id scope. No new policies needed
-- because these are additional columns on the same table.
