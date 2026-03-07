                    'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useChildrenData } from '@/lib/hooks/parent/useChildrenData';
import { useChildMetrics } from '@/lib/hooks/parent/useChildMetrics';
import { useUnreadMessages } from '@/lib/hooks/parent/useUnreadMessages';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { resolveSchoolTypeFromProfile } from '@/lib/tenant/schoolTypeResolver';

export interface TrialStatus {
  is_trial: boolean;
  days_remaining: number;
  plan_tier: string;
  plan_name: string;
}

export function useParentDashboardData() {
  const supabase = createClient();
  
  // Auth state
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  
  // Trial state
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  
  // Fetch user ID
  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
      }
      setAuthLoading(false);
    };
    initAuth();
  }, [supabase]);
  
  // Use custom hooks
  const { profile, loading: profileLoading, refetch: refetchProfile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const {
    childrenCards,
    activeChildId,
    setActiveChildId,
    loading: childrenLoading,
    refetch: refetchChildren,
  } = useChildrenData(userId);
  const { metrics } = useChildMetrics(activeChildId);
  const { unreadCount } = useUnreadMessages(userId, activeChildId);
  
  // Derived values
  const userName = profile?.firstName || profile?.email?.split('@')[0] || 'User';
  const usageType = profile?.usageType;
  const resolvedSchoolType = resolveSchoolTypeFromProfile(profile);
  const hasOrganization = !!(profile?.preschoolId || profile?.organizationId);
  
  // Show "EduDash Pro Community School" for standalone users (digital learning focus), actual school name for org users
  const preschoolName = hasOrganization 
    ? (profile?.preschoolName || profile?.organizationName)
    : 'EduDash Pro Community School';
  
  // Profile validation (no debug logs in production)
  
  // Fetch trial status
  useEffect(() => {
    const loadTrialStatus = async () => {
      if (!userId) return;
      
      try {
        // Fetch trial info directly from profile
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('is_trial, trial_ends_at, trial_plan_tier')
          .eq('id', userId)
          .single();
        
        if (error) {
          console.error('[useParentDashboardData] Failed to fetch trial status:', error);
          return;
        }
        
        let status: TrialStatus | null = null;
        
        // Derive from profile flags (user-level trial)
        if (profileData?.is_trial && profileData.trial_ends_at) {
          const trialEnd = new Date(profileData.trial_ends_at);
          const now = new Date();
          if (trialEnd > now) {
            const days_remaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            status = {
              is_trial: true,
              days_remaining,
              plan_tier: profileData.trial_plan_tier || 'parent_plus',
              plan_name: 'Parent Plus',
            };
          }
        }
        
        setTrialStatus(status);
      } catch (err) {
        // Silent fail - trial status is optional
      }
    };
    
    loadTrialStatus();
  }, [userId, supabase, profile]);
  
  return {
    // Auth
    userId,
    authLoading,
    
    // Profile
    profile,
    profileLoading,
    refetchProfile,
    userName,
    preschoolName,
    usageType,
    resolvedSchoolType,
    hasOrganization,
    tenantSlug,
    
    // Children
    childrenCards,
    activeChildId,
    setActiveChildId,
    childrenLoading,
    refetchChildren,
    
    // Metrics
    metrics,
    unreadCount,
    
    // Trial
    trialStatus,
    
    // Computed
    loading: authLoading || profileLoading,
  };
}
