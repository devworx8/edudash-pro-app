-- Bana Pele / DBE compliance companion tables
-- Online-only readiness tooling; certification remains with DBE/eCares.
-- See .cursor/plans/dbe-compliance-service-edudash.plan.md

-- ════════════════════════════════════════════════════════════
-- 1. COMPLIANCE CHECKLIST TEMPLATES
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_checklist_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  preschool_id uuid REFERENCES preschools(id) ON DELETE CASCADE,
  -- NULL = system template; non-null = school-specific override
  domain text NOT NULL CHECK (domain IN (
    'premises_safety', 'health_hygiene', 'staff_vetting',
    'documentation', 'teaching_learning', 'learner_support'
  )),
  name text NOT NULL,
  description text,
  checklist_type text NOT NULL DEFAULT 'monthly' CHECK (checklist_type IN ('daily', 'weekly', 'monthly', 'registration_audit')),
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- criteria: [{ id, label, type: 'yes_no'|'scale_1_5'|'text'|'date'|'document', required: bool }]
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_compliance_tpl_preschool ON compliance_checklist_templates(preschool_id);
CREATE INDEX idx_compliance_tpl_domain ON compliance_checklist_templates(domain);
CREATE INDEX idx_compliance_tpl_type ON compliance_checklist_templates(checklist_type);

ALTER TABLE compliance_checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_tpl_principal_all ON compliance_checklist_templates
  FOR ALL
  USING (
    (preschool_id IS NULL)
    OR (preschool_id IN (
      SELECT COALESCE(p.organization_id, p.preschool_id)
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('principal', 'admin', 'principal_admin', 'super_admin')
    ))
  );

CREATE POLICY compliance_tpl_teacher_select ON compliance_checklist_templates
  FOR SELECT
  USING (
    (preschool_id IS NULL)
    OR (preschool_id IN (
      SELECT COALESCE(p.organization_id, p.preschool_id)
      FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'teacher'
    ))
  );

-- Compliance officers get principal-like access for their preschool (policy added after compliance_officers table)

-- ════════════════════════════════════════════════════════════
-- 2. COMPLIANCE CHECKLIST RECORDS (completed checklists)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_checklist_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  preschool_id uuid NOT NULL REFERENCES preschools(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES compliance_checklist_templates(id) ON DELETE CASCADE,
  checklist_date date NOT NULL,
  checklist_type text NOT NULL DEFAULT 'monthly' CHECK (checklist_type IN ('daily', 'weekly', 'monthly', 'registration_audit')),
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  completed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (preschool_id, template_id, checklist_date)
);

CREATE INDEX idx_compliance_rec_preschool ON compliance_checklist_records(preschool_id);
CREATE INDEX idx_compliance_rec_template ON compliance_checklist_records(template_id);
CREATE INDEX idx_compliance_rec_date ON compliance_checklist_records(checklist_date);
CREATE INDEX idx_compliance_rec_completed_by ON compliance_checklist_records(completed_by);
CREATE INDEX idx_compliance_rec_assigned_to ON compliance_checklist_records(assigned_to);

ALTER TABLE compliance_checklist_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_rec_principal_all ON compliance_checklist_records
  FOR ALL
  USING (
    preschool_id IN (
      SELECT COALESCE(p.organization_id, p.preschool_id)
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('principal', 'admin', 'principal_admin', 'super_admin')
    )
  );

CREATE POLICY compliance_rec_teacher_select_insert ON compliance_checklist_records
  FOR ALL
  USING (
    preschool_id IN (
      SELECT COALESCE(p.organization_id, p.preschool_id)
      FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'teacher'
    )
  )
  WITH CHECK (
    preschool_id IN (
      SELECT COALESCE(p.organization_id, p.preschool_id)
      FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'teacher'
    )
  );

-- ════════════════════════════════════════════════════════════
-- 3. COMPLIANCE DOCUMENTS (registry for eCares/COMPLY docs)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  preschool_id uuid NOT NULL REFERENCES preschools(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'registration_certificate', 'fire_certificate', 'zoning_approval',
    'health_clearance', 'policies', 'staff_files', 'floor_plan', 'other'
  )),
  name text NOT NULL,
  required boolean DEFAULT true,
  storage_path text,
  uploaded_at timestamptz,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expiry_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'valid', 'expiring_soon', 'expired')),
  linked_teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_compliance_doc_preschool ON compliance_documents(preschool_id);
CREATE INDEX idx_compliance_doc_category ON compliance_documents(preschool_id, category);
CREATE INDEX idx_compliance_doc_status ON compliance_documents(status);
CREATE INDEX idx_compliance_doc_expiry ON compliance_documents(expiry_date) WHERE expiry_date IS NOT NULL;

ALTER TABLE compliance_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_doc_principal_all ON compliance_documents
  FOR ALL
  USING (
    preschool_id IN (
      SELECT COALESCE(p.organization_id, p.preschool_id)
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('principal', 'admin', 'principal_admin', 'super_admin')
    )
  );

CREATE POLICY compliance_doc_teacher_own ON compliance_documents
  FOR SELECT
  USING (
    preschool_id IN (
      SELECT COALESCE(p.organization_id, p.preschool_id)
      FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'teacher'
    )
    AND (linked_teacher_id IS NULL OR linked_teacher_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════
-- 4. COMPLIANCE OFFICERS (designated per preschool)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_officers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  preschool_id uuid NOT NULL REFERENCES preschools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (preschool_id, user_id)
);

CREATE INDEX idx_compliance_officers_preschool ON compliance_officers(preschool_id);
CREATE INDEX idx_compliance_officers_user ON compliance_officers(user_id);

ALTER TABLE compliance_officers ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_officers_principal_manage ON compliance_officers
  FOR ALL
  USING (
    preschool_id IN (
      SELECT COALESCE(p.organization_id, p.preschool_id)
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('principal', 'admin', 'principal_admin', 'super_admin')
    )
  );

CREATE POLICY compliance_officers_self_select ON compliance_officers
  FOR SELECT
  USING (user_id = auth.uid());

-- Compliance officer: same as principal for templates, records, documents (allow in existing principal policies via OR)
-- We add a separate policy for compliance_officers so they can FOR ALL on their preschool's data.
CREATE POLICY compliance_tpl_officer_all ON compliance_checklist_templates
  FOR ALL
  USING (
    preschool_id IN (SELECT preschool_id FROM compliance_officers WHERE user_id = auth.uid())
  );

CREATE POLICY compliance_rec_officer_all ON compliance_checklist_records
  FOR ALL
  USING (
    preschool_id IN (SELECT preschool_id FROM compliance_officers WHERE user_id = auth.uid())
  );

CREATE POLICY compliance_doc_officer_all ON compliance_documents
  FOR ALL
  USING (
    preschool_id IN (SELECT preschool_id FROM compliance_officers WHERE user_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════
-- 5. UPDATED_AT TRIGGERS
-- ════════════════════════════════════════════════════════════

CREATE TRIGGER set_compliance_tpl_updated_at
  BEFORE UPDATE ON compliance_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_compliance_rec_updated_at
  BEFORE UPDATE ON compliance_checklist_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_compliance_doc_updated_at
  BEFORE UPDATE ON compliance_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE compliance_checklist_templates IS 'Bana Pele readiness checklist templates (per domain/type). System templates have preschool_id NULL.';
COMMENT ON TABLE compliance_checklist_records IS 'Completed compliance checklists per preschool and date.';
COMMENT ON TABLE compliance_documents IS 'Registry of required DBE/eCares documents with expiry and status.';
COMMENT ON TABLE compliance_officers IS 'Designated compliance officers per preschool (principal can assign).';
