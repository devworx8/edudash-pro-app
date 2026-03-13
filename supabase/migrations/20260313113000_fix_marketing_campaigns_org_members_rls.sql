-- Allow legitimate school staff linked through organization_members to access
-- marketing_campaigns without relying solely on profiles.organization_id.

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_campaigns_org_manage ON public.marketing_campaigns;

CREATE POLICY marketing_campaigns_org_manage
ON public.marketing_campaigns
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = auth.uid()
      AND me.role IN ('superadmin', 'super_admin')
  )
  OR
  EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = auth.uid()
      AND me.role IN ('principal', 'principal_admin', 'admin', 'teacher')
      AND marketing_campaigns.organization_id = COALESCE(me.organization_id, me.preschool_id)
  )
  OR
  EXISTS (
    SELECT 1
    FROM public.organization_members membership
    WHERE membership.user_id = auth.uid()
      AND membership.organization_id = marketing_campaigns.organization_id
      AND COALESCE(membership.membership_status, 'active') IN ('active', 'pending')
      AND COALESCE(membership.seat_status, 'active') <> 'inactive'
      AND COALESCE(membership.role, membership.member_type, '') IN (
        'principal',
        'principal_admin',
        'admin',
        'teacher',
        'super_admin',
        'superadmin'
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = auth.uid()
      AND me.role IN ('superadmin', 'super_admin')
  )
  OR
  EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = auth.uid()
      AND me.role IN ('principal', 'principal_admin', 'admin', 'teacher')
      AND marketing_campaigns.organization_id = COALESCE(me.organization_id, me.preschool_id)
  )
  OR
  EXISTS (
    SELECT 1
    FROM public.organization_members membership
    WHERE membership.user_id = auth.uid()
      AND membership.organization_id = marketing_campaigns.organization_id
      AND COALESCE(membership.membership_status, 'active') IN ('active', 'pending')
      AND COALESCE(membership.seat_status, 'active') <> 'inactive'
      AND COALESCE(membership.role, membership.member_type, '') IN (
        'principal',
        'principal_admin',
        'admin',
        'teacher',
        'super_admin',
        'superadmin'
      )
  )
);
