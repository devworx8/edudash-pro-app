import { assertSupabase } from '@/lib/supabase'

export type OrgType = 'preschool' | 'k12' | 'individual'
export type Tier = 'free' | 'starter' | 'premium' | 'enterprise'
// Legacy tier names kept for backward compatibility during migration only
export type LegacyTier = 'parent_starter' | 'parent_plus' | 'private_teacher' | 'pro' | 'basic'

/**
 * Determine organization type for the current user.
 * Priority:
 * - user_metadata.org_type if present ('preschool' | 'k12')
 * - If profile.preschool_id exists -> 'preschool'
 * - Else 'individual'
 */
export async function getOrgType(): Promise<OrgType> {
  try {
    const { data: userRes } = await assertSupabase().auth.getUser()
    const orgTypeMeta = ((userRes?.user?.user_metadata as any)?.org_type || '').toLowerCase()
    if (orgTypeMeta === 'k12' || orgTypeMeta === 'school') return 'k12'
    if (orgTypeMeta === 'preschool' || orgTypeMeta === 'pre_school') return 'preschool'

    // Fallback: infer from profile record
    if (userRes?.user?.id) {
      const profileSelect = 'id, preschool_id'
      const { data: profByAuth } = await assertSupabase()
        .from('profiles')
        .select(profileSelect)
        .eq('auth_user_id', userRes.user.id)
        .maybeSingle()
      if (profByAuth && (profByAuth as any).preschool_id) return 'preschool'

      const { data: profById } = await assertSupabase()
        .from('profiles')
        .select(profileSelect)
        .eq('id', userRes.user.id)
        .maybeSingle()
      if (profById && (profById as any).preschool_id) return 'preschool'
    }
    return 'individual'
  } catch {
    return 'individual'
  }
}

/**
 * Normalize legacy tier names to new tier system
 * Maps old tier names to production tiers: free, starter, premium, enterprise
 */
export function normalizeTier(tier: string): Tier {
  const normalized = tier.toLowerCase()
  switch (normalized) {
    case 'parent_starter':
    case 'teacher_starter':
    case 'learner_starter':
    case 'school_starter':
    case 'starter':
      return 'starter'
    case 'parent_plus':
    case 'teacher_pro':
    case 'learner_pro':
    case 'school_premium':
    case 'basic':
    case 'pro':
    case 'premium':
      return 'premium'
    case 'school_pro':
    case 'school_enterprise':
    case 'super_admin':
    case 'superadmin':
    case 'enterprise':
      return 'enterprise'
    default:
      return 'free'
  }
}

/**
 * Plan gating for organization-managed AI allocations.
 * - Preschools: available starting from Starter plan (2 seats minimum per business rule)
 * - K-12 Schools: available starting from Premium plan
 * - Individuals: not applicable
 * - Principals: always allowed regardless of tier (core management capability)
 */
export async function canUseAllocation(tier: Tier | LegacyTier, orgType: OrgType): Promise<boolean> {
  // Normalize tier
  const normalizedTier = normalizeTier(tier)
  
  // Check if user is a principal or principal_admin - they should always have access
  try {
    const { data } = await assertSupabase().auth.getUser()
    const userRole = (data?.user?.user_metadata as any)?.role
    if (userRole === 'principal' || userRole === 'principal_admin') {
      return true
    }
  } catch {
    // Continue with tier-based checks if role check fails
  }

  if (orgType === 'preschool') {
    return normalizedTier === 'starter' || normalizedTier === 'premium' || normalizedTier === 'enterprise'
  }
  if (orgType === 'k12') {
    return normalizedTier === 'premium' || normalizedTier === 'enterprise'
  }
  return false
}

/**
 * Model selection UI available from Premium and Enterprise tiers.
 * Starter tier gets one upgraded model, Premium+ gets all models.
 */
export function canSelectModels(tier: Tier | LegacyTier): boolean {
  const normalizedTier = normalizeTier(tier)
  return normalizedTier === 'premium' || normalizedTier === 'enterprise'
}

/**
 * Get AI quota limits based on subscription tier
 */
export function getAIQuotaLimits(tier: Tier | LegacyTier) {
  const normalizedTier = normalizeTier(tier)
  
  switch (normalizedTier) {
    case 'free':
      return { monthly: 300, rpm: 5, models: ['claude-haiku-4-5-20251001'] }
    case 'starter': 
      return { monthly: 1500, rpm: 15, models: ['claude-haiku-4-5-20251001', 'claude-3-7-sonnet-20250219'] }
    case 'premium':
      return { monthly: 6000, rpm: 30, models: ['claude-haiku-4-5-20251001', 'claude-3-7-sonnet-20250219', 'claude-sonnet-4-20250514'] }
    case 'enterprise':
      return { monthly: -1, rpm: 60, models: ['claude-haiku-4-5-20251001', 'claude-3-7-sonnet-20250219', 'claude-sonnet-4-20250514', 'claude-sonnet-4-5-20250514'] } // -1 = unlimited
    default:
      return { monthly: 50, rpm: 5, models: ['claude-haiku-4-5-20251001'] }
  }
}
