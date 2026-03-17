-- ============================================================
-- prepare_user_for_deletion(target_user_id UUID)
-- ============================================================
-- Clears ALL foreign key references to auth.users(id) for a
-- given user so that auth.admin.deleteUser() can succeed.
--
-- Strategy:
--   1. BLOCK if user is principal of any org/school/preschool
--   2. SET NULL on audit/tracking columns (created_by, approved_by, etc.)
--   3. DELETE owned records (profiles, push_devices, notifications, etc.)
--   4. Returns JSON summary of what was cleaned
--
-- Uses safe_nullify() helper to skip missing tables/columns gracefully.
-- ============================================================

CREATE OR REPLACE FUNCTION prepare_user_for_deletion(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_count INT;
  v_summary JSONB := '{}'::jsonb;
  v_count INT;
  v_nullified INT := 0;
  v_skipped INT := 0;
BEGIN
  -- ─── Guard: block if principal of any org/school/preschool ───
  SELECT count(*) INTO v_org_count
  FROM (
    SELECT id FROM organizations WHERE principal_id = p_target_user_id
    UNION ALL
    SELECT id FROM preschools WHERE principal_id = p_target_user_id
    UNION ALL
    SELECT id FROM schools WHERE principal_id = p_target_user_id
  ) AS orgs;

  IF v_org_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete user: still principal of % organization(s). Reassign principal first.', v_org_count;
  END IF;

  -- ─── SET NULL: all audit/tracking FK columns ───────────────
  -- Uses dynamic SQL so missing tables/columns are skipped, not fatal.
  -- This is the authoritative list of (table, column) pairs that
  -- reference auth.users(id) WITHOUT ON DELETE CASCADE.

  DECLARE
    v_pair RECORD;
    v_sql TEXT;
    v_rows INT;
  BEGIN
    FOR v_pair IN
      SELECT * FROM (VALUES
        -- Assignment & grading
        ('assignment_grades', 'teacher_id'),
        -- CAPS
        ('caps_textbook_mapping', 'created_by'),
        ('caps_textbook_mapping', 'verified_by'),
        -- Deletion requests
        ('deletion_requests', 'processed_by'),
        -- Error logs
        ('error_logs', 'user_id'),
        -- Exam papers
        ('exam_papers', 'created_by'),
        -- Financial
        ('expense_categories', 'created_by'),
        ('fee_structures', 'created_by'),
        ('financial_transactions', 'approved_by'),
        ('financial_transactions', 'created_by'),
        -- Guardian
        ('guardian_requests', 'approved_by'),
        -- Invitations
        ('invitations', 'accepted_by'),
        ('invitations', 'created_by'),
        -- Invoices
        ('invoice_audit_log', 'user_id'),
        ('invoice_payments', 'recorded_by'),
        ('invoice_payments', 'verified_by'),
        ('invoice_templates', 'created_by'),
        ('invoices', 'created_by'),
        -- Jobs
        ('job_distributions', 'distributed_by'),
        -- Join requests
        ('join_requests', 'invited_by'),
        ('join_requests', 'reviewed_by'),
        -- Meetings
        ('meeting_action_items', 'assigned_to'),
        ('meeting_action_items', 'created_by'),
        ('meeting_participants', 'invited_by'),
        ('meeting_rooms', 'created_by'),
        ('meeting_sessions', 'host_id'),
        ('meeting_shared_resources', 'shared_by'),
        -- Member fees & invoices
        ('member_events', 'created_by'),
        ('member_fees', 'created_by'),
        ('member_invoices', 'created_by'),
        ('membership_fee_structure', 'created_by'),
        ('membership_pop_uploads', 'reviewed_by'),
        ('membership_pop_uploads', 'uploaded_by'),
        -- Organization
        ('organization_bank_accounts', 'created_by'),
        ('organization_board_positions', 'created_by'),
        ('organization_budgets', 'created_by'),
        ('organization_document_access', 'granted_by'),
        ('organization_document_access', 'revoked_by'),
        ('organization_document_access_requests', 'reviewed_by'),
        ('organization_document_audit_log', 'user_id'),
        ('organization_document_folders', 'created_by'),
        ('organization_documents', 'approved_by'),
        ('organization_documents', 'deleted_by'),
        ('organization_documents', 'uploaded_by'),
        ('organization_members', 'created_by'),
        ('organization_members', 'invited_by'),
        ('organization_regions', 'manager_id'),
        ('organization_transactions', 'approved_by'),
        ('organization_transactions', 'reconciled_by'),
        ('organization_transactions', 'submitted_by'),
        ('organization_wings', 'created_by'),
        -- Parent join requests
        ('parent_join_requests', 'reviewed_by'),
        -- Payments & petty cash
        ('payment_reminders', 'created_by'),
        ('petty_cash_accounts', 'created_by'),
        ('petty_cash_receipts', 'created_by'),
        ('petty_cash_reconciliations', 'reconciled_by'),
        ('platform_collected_payments', 'payer_user_id'),
        ('platform_disbursements', 'created_by'),
        ('pop_uploads', 'reviewed_by'),
        -- Promotional
        ('promotional_campaigns', 'created_by'),
        -- Region
        ('region_invite_codes', 'created_by'),
        -- Registration
        ('registration_requests', 'payment_verified_by'),
        -- Resources
        ('resources', 'created_by'),
        -- School AI
        ('school_ai_subscriptions', 'updated_by'),
        -- Security
        ('security_events', 'user_id'),
        -- Superadmin
        ('superadmin_agent_executions', 'triggered_by'),
        ('superadmin_command_log', 'admin_id'),
        ('superadmin_platform_insights', 'dismissed_by'),
        -- Teacher
        ('teacher_invites', 'accepted_by'),
        ('teacher_student_notes', 'teacher_id'),
        ('teacher_student_notes', 'acknowledged_by'),
        -- User invitations
        ('user_invitations', 'invited_by'),
        -- Aftercare
        ('aftercare_registrations', 'parent_user_id'),
        -- profiles(id) FK references
        ('child_requests', 'payment_verified_by'),
        ('video_calls', 'teacher_id'),
        ('conversations', 'pinned_by'),
        ('conversation_threads', 'created_by')
      ) AS t(tbl, col)
    LOOP
      BEGIN
        v_sql := format(
          'UPDATE %I SET %I = NULL WHERE %I = $1',
          v_pair.tbl, v_pair.col, v_pair.col
        );
        EXECUTE v_sql USING p_target_user_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
          v_nullified := v_nullified + v_rows;
          v_summary := v_summary || jsonb_build_object(v_pair.tbl || '.' || v_pair.col, v_rows);
        END IF;
      EXCEPTION
        WHEN undefined_table OR undefined_column THEN
          v_skipped := v_skipped + 1;
          -- Table or column doesn't exist — skip gracefully
      END;
    END LOOP;
  END;

  -- ─── DELETE: owned records ──────────────────────────────────
  DECLARE
    v_del_tbl TEXT;
  BEGIN
    FOR v_del_tbl IN
      SELECT unnest(ARRAY[
        'deletion_requests',
        'push_devices',
        'push_subscriptions',
        'user_push_devices',
        'in_app_notifications',
        'notifications'
      ])
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM %I WHERE user_id = $1', v_del_tbl) USING p_target_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN
          v_summary := v_summary || jsonb_build_object(v_del_tbl || '.deleted', v_count);
        END IF;
      EXCEPTION
        WHEN undefined_table THEN NULL; -- skip
      END;
    END LOOP;
  END;

  -- Delete profile last (other tables may ref profiles.id)
  BEGIN
    DELETE FROM profiles WHERE id = p_target_user_id OR auth_user_id = p_target_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_summary := v_summary || jsonb_build_object('profiles.deleted', v_count);
    END IF;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  v_summary := v_summary || jsonb_build_object(
    'status', 'ready_for_auth_deletion',
    'nullified_refs', v_nullified,
    'skipped_missing', v_skipped
  );
  RETURN v_summary;
END;
$$;

-- Grant execute to service_role only (edge functions)
REVOKE ALL ON FUNCTION prepare_user_for_deletion(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prepare_user_for_deletion(UUID) TO service_role;
