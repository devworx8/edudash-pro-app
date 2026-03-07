'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface UserProfile {
  preferredLanguage: string;
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'parent' | 'teacher' | 'principal' | 'superadmin' | null;
  usageType?: 'preschool' | 'k12_school' | 'homeschool' | 'aftercare' | 'supplemental' | 'exploring' | 'independent';
  schoolType?: string;
  preschoolId?: string;
  preschoolName?: string;
  preschoolSlug?: string;
  organizationId?: string;
  organizationName?: string;
  is_trial?: boolean;
  trial_end_date?: string;
  trial_plan_tier?: string;
  subscription_tier?: string;
  seat_status?: 'active' | 'inactive' | 'pending' | 'revoked' | string;
  has_active_seat?: boolean;
}

interface UseUserProfileReturn {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useUserProfile(userId: string | undefined): UseUserProfileReturn {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();

      // Get auth user email
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }


      // Get profile data from profiles table (includes role, usage_type, and trial info)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, auth_user_id, first_name, last_name, preschool_id, organization_id, role, usage_type, is_trial, trial_ends_at, trial_plan_tier, subscription_tier')
        .or(`id.eq.${userId},auth_user_id.eq.${userId}`)
        .maybeSingle();

      if (profileError || !profileData) {
        // Profile fetch error or no profile — will render empty/error state
      }

      // Use preschool_id from profiles table
      const preschoolId = profileData?.preschool_id;
      const organizationId = profileData?.organization_id;
      
      
      let preschoolName: string | undefined;
      let preschoolSlug: string | undefined;
      let schoolSubscriptionTier: string | undefined;
      let schoolType: string | undefined;
      let hasActiveSeat: boolean | undefined;
      let seatStatus: UserProfile['seat_status'];

      // Fetch preschool details if we have an ID, otherwise use "EduDash Pro Community"
      if (preschoolId) {
        const { data: preschoolData, error: preschoolError } = await supabase
          .from('preschools')
          .select('name, subscription_tier, school_type')
          .eq('id', preschoolId)
          .maybeSingle();

        // Errors handled gracefully — empty preschool name is acceptable

        preschoolName = preschoolData?.name;
        preschoolSlug = undefined; // slug column doesn't exist in schema
        schoolSubscriptionTier = preschoolData?.subscription_tier;
        schoolType = preschoolData?.school_type || undefined;
      } else {
        // Standalone user - show friendly community name
        preschoolName = 'My School';
        schoolSubscriptionTier = 'free'; // Default tier for standalone users
        schoolType = profileData?.usage_type || undefined;
      }

      // Organization data - use organization_id when available, fallback to preschool
      let organizationName: string | undefined;
      if (organizationId) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', organizationId)
          .maybeSingle();
        organizationName = orgData?.name;
      } else {
        organizationName = preschoolName;
      }

      // Resolve teacher seat status from seat-management RPC.
      // This reflects principal seat assignment in real-time data model.
      if (profileData?.role === 'teacher') {
        try {
          const { data: activeSeat } = await supabase.rpc('user_has_active_seat', {
            p_user_id: user.id,
          });

          if (typeof activeSeat === 'boolean') {
            hasActiveSeat = activeSeat;
            seatStatus = activeSeat ? 'active' : 'inactive';
          }
        } catch {
          // Keep seat status undefined on RPC errors.
        }
      }

      const profileObj = {
        id: userId,
        email: user.email!,
        firstName: profileData?.first_name,
        lastName: profileData?.last_name,
        role: profileData?.role as any || null,
        usageType: profileData?.usage_type as any || undefined,
        schoolType,
        preschoolId,
        preschoolName,
        preschoolSlug,
        organizationId: organizationId || preschoolId,
        organizationName,
        preferredLanguage: 'en-ZA', // Default language
        is_trial: profileData?.is_trial,
        trial_end_date: profileData?.trial_ends_at, // Map to expected field name
        trial_plan_tier: profileData?.trial_plan_tier,
        // Use school's tier (from preschools table) if available, fall back to user's tier
        subscription_tier: schoolSubscriptionTier || profileData?.subscription_tier || 'starter',
        seat_status: seatStatus,
        has_active_seat: hasActiveSeat,
      };
      
      
      setProfile(profileObj);
    } catch (err) {
      setProfile(null);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return {
    profile,
    loading,
    error,
    refetch: loadProfile,
  };
}
