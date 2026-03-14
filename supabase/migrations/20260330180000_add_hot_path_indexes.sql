-- =============================================================================
-- Migration: Add indexes for hot-path queries
-- Purpose:   Cover commonly-queried columns that lack index support.
--            Focuses on tables hit on every screen mount / notification fetch.
-- =============================================================================

-- --------------------------------------------------------
-- active_calls  (incoming-call lookup, call history, signals)
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_active_calls_callee_status
  ON active_calls (callee_id, status);

CREATE INDEX IF NOT EXISTS idx_active_calls_caller
  ON active_calls (caller_id);

CREATE INDEX IF NOT EXISTS idx_active_calls_call_id
  ON active_calls (call_id);

-- --------------------------------------------------------
-- in_app_notifications  (notification feed — zero indexes today)
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_created
  ON in_app_notifications (user_id, created_at DESC);

-- --------------------------------------------------------
-- push_notifications  (push delivery feed — zero indexes today)
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_push_notifications_recipient_status
  ON push_notifications (recipient_user_id, status, created_at DESC);

-- --------------------------------------------------------
-- organization_members  (most-queried table by org, 50+ call sites)
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_organization_members_org_status
  ON organization_members (organization_id, membership_status);

-- --------------------------------------------------------
-- student_fees  (parent fee screens, 16+ query sites by student)
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_student_fees_student
  ON student_fees (student_id);

-- --------------------------------------------------------
-- homework_submissions  (teacher & student screens, zero indexes)
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_homework_submissions_student
  ON homework_submissions (student_id);

CREATE INDEX IF NOT EXISTS idx_homework_submissions_assignment
  ON homework_submissions (assignment_id);

-- --------------------------------------------------------
-- pop_uploads  (proof-of-payment screens)
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pop_uploads_student_type
  ON pop_uploads (student_id, upload_type);

-- --------------------------------------------------------
-- registration_requests  (principal dashboard widget)
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_registration_requests_org_status
  ON registration_requests (organization_id, status);
