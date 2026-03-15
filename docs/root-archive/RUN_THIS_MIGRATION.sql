-- IMPORTANT: This migration must be run in Supabase Dashboard SQL Editor
-- The pooled connection doesn't have owner permissions to alter policies
-- 
-- Steps:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Copy and paste this entire file
-- 3. Click "Run"

-- Fix RLS policy WITH CHECK clause using ALTER POLICY
-- Date: 2026-01-11
-- Purpose: Fix WITH CHECK clause to correctly reference the inserted row's organization_id
-- Issue: The policy has om.organization_id = om.organization_id (always true)
--        Should be om.organization_id = organization_id (comparing to inserted row)

ALTER POLICY admins_manage_documents ON organization_documents
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = organization_documents.organization_id
        AND om.membership_status = 'active'
        AND (
          (om.role IS NOT NULL AND om.role = ANY (ARRAY['admin'::text, 'national_admin'::text]))
          OR
          (om.member_type IS NOT NULL AND om.member_type::text IN (
            'ceo', 'president', 'deputy_president', 'secretary_general', 'treasurer',
            'national_admin', 'national_coordinator', 'executive', 'board_member',
            'youth_president', 'youth_deputy', 'youth_secretary', 'youth_treasurer',
            'women_president', 'women_deputy', 'women_secretary', 'women_treasurer',
            'veterans_president',
            'regional_manager', 'regional_coordinator', 'provincial_manager', 'provincial_coordinator',
            'branch_manager'
          ))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        -- CRITICAL FIX: Compare to the inserted row's organization_id (not om.organization_id)
        AND om.organization_id = organization_id
        AND om.membership_status = 'active'
        AND (
          (om.role IS NOT NULL AND om.role = ANY (ARRAY['admin'::text, 'national_admin'::text]))
          OR
          (om.member_type IS NOT NULL AND om.member_type::text IN (
            'ceo', 'president', 'deputy_president', 'secretary_general', 'treasurer',
            'national_admin', 'national_coordinator', 'executive', 'board_member',
            'youth_president', 'youth_deputy', 'youth_secretary', 'youth_treasurer',
            'women_president', 'women_deputy', 'women_secretary', 'women_treasurer',
            'veterans_president',
            'regional_manager', 'regional_coordinator', 'provincial_manager', 'provincial_coordinator',
            'branch_manager'
          ))
        )
    )
  );
