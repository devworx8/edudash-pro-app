'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export type UserRole = 'parent' | 'teacher' | 'principal' | 'superadmin' | 'student' | null;
export type UserType = 'standalone' | 'affiliated' | null;
export type SubscriptionTier = 'free' | 'parent-starter' | 'parent-plus' | 'private-teacher' | 'school_starter' | 'school_premium' | 'school_pro' | 'school_enterprise' | 'teacher_starter' | 'teacher_pro';

export interface UserProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  userType: UserType;
  preschoolId: string | null;
  preschoolName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  subscriptionTier: SubscriptionTier;
  isAffiliated: boolean;
  isStandalone: boolean;
}

interface UseUserTypeReturn {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isAffiliated: boolean;
  isStandalone: boolean;
}

/**
 * Hook to detect user type (standalone vs affiliated)
 * 
 * Standalone users:
 * - preschool_id IS NULL
 * - Pay individual subscriptions (parent-starter, parent-plus, private-teacher)
 * - Don't have access to school features
 * 
 * Affiliated users:
 * - preschool_id IS NOT NULL
 * - Connected to schools/organizations
 * - Have access to school features (messages, attendance, etc.)
 * 
 * @returns {UseUserTypeReturn} User profile with type detection
 */
export function useUserType(): UseUserTypeReturn {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();

      // Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      // Fetch profile from profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          role,
          preschool_id,
          organization_id,
          subscription_tier
        `)
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      // Fetch preschool/organization name if affiliated
      let preschoolName: string | null = null;
      let organizationName: string | null = null;

      if (profileData?.preschool_id) {
        const { data: preschool } = await supabase
          .from('preschools')
          .select('name')
          .eq('id', profileData.preschool_id)
          .maybeSingle();

        preschoolName = preschool?.name || null;
      }

      if (profileData?.organization_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', profileData.organization_id)
          .maybeSingle();

        organizationName = org?.name || null;
      }

      // Determine user type
      const isAffiliated = !!(profileData?.preschool_id || profileData?.organization_id);
      const userType: UserType = isAffiliated ? 'affiliated' : 'standalone';

      // Normalize subscription tier
      let tier: SubscriptionTier = 'free';
      if (profileData?.subscription_tier) {
        const tierStr = String(profileData.subscription_tier).toLowerCase();
        if (tierStr.includes('parent-starter') || tierStr === 'parent_starter') {
          tier = 'parent-starter';
        } else if (tierStr.includes('parent-plus') || tierStr === 'parent_plus') {
          tier = 'parent-plus';
        } else if (tierStr.includes('private-teacher') || tierStr === 'private_teacher') {
          tier = 'private-teacher';
        } else if (tierStr === 'school_starter' || tierStr === 'starter') {
          tier = 'school_starter';
        } else if (tierStr === 'school_premium' || tierStr === 'premium') {
          tier = 'school_premium';
        } else if (tierStr === 'school_pro' || tierStr === 'pro') {
          tier = 'school_pro';
        } else if (tierStr === 'school_enterprise' || tierStr === 'enterprise') {
          tier = 'school_enterprise';
        } else if (tierStr === 'teacher_starter') {
          tier = 'teacher_starter';
        } else if (tierStr === 'teacher_pro') {
          tier = 'teacher_pro';
        }
      }

      const userProfile: UserProfile = {
        id: user.id,
        email: user.email || '',
        firstName: profileData?.first_name || null,
        lastName: profileData?.last_name || null,
        role: (profileData?.role as UserRole) || null,
        userType,
        preschoolId: profileData?.preschool_id || null,
        preschoolName,
        organizationId: profileData?.organization_id || null,
        organizationName,
        subscriptionTier: tier,
        isAffiliated,
        isStandalone: !isAffiliated,
      };

      setProfile(userProfile);
    } catch (err: any) {
      console.error('Error fetching user profile:', err);
      setError(err.message || 'Failed to fetch user profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserProfile();
  }, []);

  return {
    profile,
    loading,
    error,
    refetch: fetchUserProfile,
    isAffiliated: profile?.isAffiliated || false,
    isStandalone: profile?.isStandalone || false,
  };
}

/**
 * Get dashboard route based on user type and role
 * 
 * @param role - User role
 * @param isAffiliated - Whether user is affiliated with organization
 * @returns Dashboard route path
 */
export function getDashboardRoute(role: UserRole, isAffiliated: boolean): string {
  if (role === 'parent') {
    return isAffiliated ? '/dashboard/parent' : '/dashboard/parent/standalone';
  }

  if (role === 'teacher') {
    return isAffiliated ? '/dashboard/teacher' : '/dashboard/teacher/private';
  }

  if (role === 'principal') {
    return '/dashboard/principal';
  }

  if (role === 'superadmin') {
    return '/admin';
  }

  // Default fallback
  return '/dashboard';
}

/**
 * Check if user should have access to school features
 * 
 * @param isAffiliated - Whether user is affiliated
 * @returns Boolean indicating school feature access
 */
export function hasSchoolFeatures(isAffiliated: boolean): boolean {
  return isAffiliated;
}

/**
 * Get AI quota limits based on subscription tier
 * 
 * @param tier - Subscription tier
 * @returns Quota limits object
 */
export function getAIQuotaLimits(tier: SubscriptionTier) {
  switch (tier) {
    case 'free':
      return {
        homeworkHelp: 10,
        lessonGeneration: 0,
        examPrep: 3,
        grading: 0,
      };
    case 'parent-starter':
      return {
        homeworkHelp: 30,
        lessonGeneration: 5,
        examPrep: 10,
        grading: 0,
      };
    case 'parent-plus':
      return {
        homeworkHelp: 100,
        lessonGeneration: 25,
        examPrep: 50,
        grading: 10,
      };
    case 'private-teacher':
      return {
        homeworkHelp: 200,
        lessonGeneration: 50,
        examPrep: 100,
        grading: 25,
      };
    case 'teacher_pro':
      return {
        homeworkHelp: 500,
        lessonGeneration: 200,
        examPrep: 200,
        grading: 100,
      };
    case 'teacher_starter':
    case 'school_starter':
    case 'school_premium':
    case 'school_pro':
    case 'school_enterprise':
      return {
        homeworkHelp: -1, // unlimited
        lessonGeneration: -1,
        examPrep: -1,
        grading: -1,
      };
    default:
      return {
        homeworkHelp: 10,
        lessonGeneration: 0,
        examPrep: 3,
        grading: 0,
      };
  }
}
