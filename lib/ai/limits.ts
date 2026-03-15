import { assertSupabase } from '@/lib/supabase'
import { getCombinedUsage, getUsageSourceState, type AIUsageRecord, type UsageDataSource } from '@/lib/ai/usage'
import { getOrgType, canUseAllocation, type OrgType } from '@/lib/subscriptionRules'
import { getDefaultModels } from '@/lib/ai/models'
import {
  type CapabilityTier,
  getCapabilityTier,
  normalizeTierName,
} from '@/lib/tiers'

export type AIQuotaFeature = 'lesson_generation' | 'grading_assistance' | 'homework_help' | 'transcription' | 'chat_message'

/**
 * Tier type for quota enforcement.
 * Re-exported from the canonical tier system in `@/lib/tiers`.
 */
export type Tier = CapabilityTier

export type QuotaMap = Record<AIQuotaFeature, number>

/**
 * Default monthly quotas keyed by CapabilityTier.
 * Aligned with TIER_QUOTAS in `@/lib/tiers` for the shared fields.
 */
const DEFAULT_MONTHLY_QUOTAS: Record<CapabilityTier, QuotaMap> = {
  free: { lesson_generation: 10, grading_assistance: 10, homework_help: 20, transcription: 5 },
  starter: { lesson_generation: 30, grading_assistance: 60, homework_help: 120, transcription: 30 },
  premium: { lesson_generation: 120, grading_assistance: 240, homework_help: 480, transcription: 120 },
  enterprise: { lesson_generation: 5000, grading_assistance: 10000, homework_help: 30000, transcription: 36000 }, // ~300 hours
}

export type EffectiveLimits = {
  tier: Tier
  quotas: QuotaMap
  source: 'default' | 'server' | 'org_allocation'
  overageRequiresPrepay: boolean
  modelOptions?: Array<{ id: string; name: string; provider: 'claude' | 'openai' | 'custom'; relativeCost: number }>
  orgType?: OrgType
  canOrgAllocate: boolean
}

type ProfileTierRow = {
  id: string
  auth_user_id?: string | null
  subscription_tier?: string | null
  preschool_id?: string | null
  organization_id?: string | null
  role?: string | null
}

async function getAuthenticatedProfileRow(): Promise<{ authUserId: string | null; user: any | null; profile: ProfileTierRow | null }> {
  try {
    const client = assertSupabase()
    const { data, error } = await client.auth.getUser()
    if (error || !data?.user) {
      return { authUserId: null, user: null, profile: null }
    }

    const authUserId = data.user.id
    const profileSelect = 'id, auth_user_id, subscription_tier, preschool_id, organization_id, role'

    const { data: byAuthUserId } = await client
      .from('profiles')
      .select(profileSelect)
      .eq('auth_user_id', authUserId)
      .maybeSingle()

    if (byAuthUserId) {
      return { authUserId, user: data.user, profile: byAuthUserId as ProfileTierRow }
    }

    const { data: byProfileId } = await client
      .from('profiles')
      .select(profileSelect)
      .eq('id', authUserId)
      .maybeSingle()

    return { authUserId, user: data.user, profile: (byProfileId as ProfileTierRow | null) || null }
  } catch {
    return { authUserId: null, user: null, profile: null }
  }
}

async function getUserTier(): Promise<CapabilityTier> {
  try {
    const client = assertSupabase()
    const { user, profile } = await getAuthenticatedProfileRow()
    
    // First try user_metadata (fastest)
    const metaTier = String((user?.user_metadata as any)?.subscription_tier || '').toLowerCase()
    const normalizedMetaTier = getCapabilityTier(normalizeTierName(metaTier))
    if (normalizedMetaTier !== 'free') {
      return normalizedMetaTier
    }
    
    // Fallback: Check profiles.subscription_tier (single source of truth)
    if (profile) {
      if (profile?.subscription_tier) {
        const profileTier = getCapabilityTier(normalizeTierName(String(profile.subscription_tier).toLowerCase()))
        if (profileTier !== 'free') {
          return profileTier
        }
      }
      
      // For staff with 'free' tier, inherit from school/org
      let role = String(profile?.role || '').toLowerCase()
      let schoolId = profile?.preschool_id || profile?.organization_id || null

      if (!schoolId && user?.id) {
        const { data: membershipRows } = await client
          .from('organization_members')
          .select('organization_id, role, member_type, membership_status, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(5)

        const membership = (membershipRows || []).find((row: any) =>
          String(row?.membership_status || '').toLowerCase() === 'active',
        ) || membershipRows?.[0]

        if (membership?.organization_id) {
          schoolId = String(membership.organization_id)
        }

        if (!role) {
          role = String(membership?.role || membership?.member_type || '').toLowerCase()
        }
      }

      const isStaff = ['teacher', 'principal', 'admin', 'principal_admin', 'staff'].includes(role)
      if (isStaff && schoolId) {
        let resolvedTier: CapabilityTier | null = null
        const { data: school } = await client
          .from('preschools')
          .select('subscription_tier')
          .eq('id', schoolId)
          .maybeSingle()

        if (school?.subscription_tier) {
          resolvedTier = getCapabilityTier(normalizeTierName(String(school.subscription_tier).toLowerCase()))
        }

        if (!resolvedTier || resolvedTier === 'free') {
          const { data: org } = await client
            .from('organizations')
            .select('subscription_tier, plan_tier')
            .eq('id', schoolId)
            .maybeSingle()

          const inheritedTier = String(org?.subscription_tier || org?.plan_tier || '').toLowerCase()
          if (inheritedTier) {
            resolvedTier = getCapabilityTier(normalizeTierName(inheritedTier))
          }
        }

        if ((!resolvedTier || resolvedTier === 'free') && profile?.organization_id && !profile?.preschool_id) {
          // Some schools store subscription on preschools while profiles carry organization_id.
          const { data: linkedSchool } = await client
            .from('profiles')
            .select('preschool_id')
            .eq('organization_id', profile.organization_id)
            .not('preschool_id', 'is', null)
            .limit(1)
            .maybeSingle()

          if (linkedSchool?.preschool_id) {
            const { data: linkedPreschool } = await client
              .from('preschools')
              .select('subscription_tier')
              .eq('id', linkedSchool.preschool_id)
              .maybeSingle()

            if (linkedPreschool?.subscription_tier) {
              resolvedTier = getCapabilityTier(normalizeTierName(String(linkedPreschool.subscription_tier).toLowerCase()))
            }
          }
        }

        if (resolvedTier && resolvedTier !== 'free') {
          return resolvedTier
        }
      }
    }
    
    return 'free'
  } catch (err) {
    console.warn('[getUserTier] Error fetching tier:', err)
    return 'free'
  }
}

async function getServerLimits(): Promise<Partial<EffectiveLimits> | null> {
  try {
    // Attempt to fetch server-defined limits and any org allocation
    const { data, error } = await assertSupabase().functions.invoke('ai-usage', { body: { action: 'limits' } as any })
    if (error) return null
    if (!data) return null

    const payload: any = data
    const quotas: QuotaMap | undefined = payload.quotas
    const overageRequiresPrepay: boolean = payload.overageRequiresPrepay !== false // default true
    const modelOptions = Array.isArray(payload.models)
      ? payload.models
      : getDefaultModels()

    const source: EffectiveLimits['source'] = payload.source === 'org_allocation' ? 'org_allocation' : 'server'

    return { quotas, overageRequiresPrepay, modelOptions, source }
  } catch {
    return null
  }
}

async function getUserRole(): Promise<string | null> {
  try {
    const { user, profile } = await getAuthenticatedProfileRow()
    const userRole = String((user?.user_metadata as any)?.role || '').trim().toLowerCase()
    if (userRole) return userRole
    const profileRole = String(profile?.role || '').trim().toLowerCase()
    return profileRole || null
  } catch {
    return null
  }
}

export async function getEffectiveLimits(): Promise<EffectiveLimits> {
  const tier = await getUserTier()
  const server = await getServerLimits()
  const orgType = await getOrgType()
  const userRole = await getUserRole()

  const quotas = server?.quotas || DEFAULT_MONTHLY_QUOTAS[tier]
  const overageRequiresPrepay = server?.overageRequiresPrepay !== false
  const modelOptions = server?.modelOptions || getDefaultModels()
  const source: EffectiveLimits['source'] = server?.source || 'default'
  
  // Allow principals and principal_admins to manage AI quota allocation regardless of tier
  const isPrincipalRole = userRole === 'principal' || userRole === 'principal_admin'
  const canOrgAllocate = isPrincipalRole || await canUseAllocation(tier, orgType)

  return { tier, quotas, overageRequiresPrepay, modelOptions, source, orgType, canOrgAllocate }
}

export type QuotaStatus = {
  used: number
  limit: number
  remaining: number
  source?: UsageDataSource
  serverReachable?: boolean
}

export async function getQuotaStatus(feature: AIQuotaFeature): Promise<QuotaStatus> {
  // First check if user has a teacher allocation from principal
  try {
    console.log(`[Quota] Checking teacher allocation for ${feature}...`);
    const teacherAllocation = await getTeacherSpecificQuota(feature)
    if (teacherAllocation) {
      console.log(`[Quota] Using teacher allocation:`, teacherAllocation);
      return teacherAllocation
    }
    console.log(`[Quota] No teacher allocation found, falling back to general limits`);
  } catch (error) {
    console.warn('[Quota] Teacher allocation check failed, falling back to general limits:', error)
  }
  
  // Fallback to general subscription limits
  const limits = await getEffectiveLimits()
  const usage: AIUsageRecord = await getCombinedUsage()
  const usageSource = getUsageSourceState()
  const used = usage[feature] || 0
  const limit = Math.max(0, limits.quotas[feature] || 0)
  const remaining = Math.max(0, limit - used)
  
  console.log(`[Quota] Using general subscription limits:`, {
    feature,
    used,
    limit,
    remaining,
    tier: limits.tier
  });
  
  return {
    used,
    limit,
    remaining,
    source: usageSource.source,
    serverReachable: usageSource.serverReachable,
  }
}

export type CanUseResult = {
  allowed: boolean
  reason?: 'over_quota' | 'suspended' | 'not_enabled'
  requiresPrepay?: boolean
  status: QuotaStatus
  limits: EffectiveLimits
}

export async function canUseFeature(feature: AIQuotaFeature, count = 1): Promise<CanUseResult> {
  const limits = await getEffectiveLimits()
  const status = await getQuotaStatus(feature)
  const remainingAfter = status.remaining - count

  if (remainingAfter < 0) {
    return { allowed: false, reason: 'over_quota', requiresPrepay: limits.overageRequiresPrepay, status, limits }
  }

  return { allowed: true, status, limits }
}

/**
 * Check for teacher-specific quota allocation from principal
 * Returns null if no teacher allocation exists or user is not a teacher
 */
export async function getTeacherSpecificQuota(feature: AIQuotaFeature): Promise<QuotaStatus | null> {
  try {
    console.log(`[Teacher Quota] Starting check for ${feature}`);
    const { authUserId, profile } = await getAuthenticatedProfileRow()
    if (!authUserId) {
      console.log(`[Teacher Quota] No authenticated user`);
      return null;
    }
    
    console.log(`[Teacher Quota] User authenticated:`, authUserId);
    
    if (!profile) {
      console.log(`[Teacher Quota] No profile found for user`);
      return null;
    }
    
    // Only check teacher allocation for teacher role
    const isTeacher = profile.role === 'teacher' || profile.role === 'assistant_teacher'
    if (!isTeacher) {
      console.log(`[Teacher Quota] User is ${profile.role}, not a teacher - skipping teacher quota check`);
      return null;
    }
    
    // Use preschool_id or organization_id
    const schoolId = profile.preschool_id || profile.organization_id
    if (!schoolId) {
      console.log(`[Teacher Quota] User not associated with any school/organization`);
      return null;
    }
    
    console.log(`[Teacher Quota] Teacher profile found:`, {
      userId: profile.id,
      schoolId: schoolId,
      role: profile.role
    });
    
    // Ensure teacher allocation exists (create if needed)
    console.log(`[Teacher Quota] Ensuring allocation exists...`);
    const { getTeacherAllocation } = await import('@/lib/ai/allocation')
    const allocation = await getTeacherAllocation(schoolId, profile.id)
    
    if (!allocation) {
      console.log(`[Teacher Quota] Failed to create/find allocation`);
      return null;
    }
    
    if (!allocation.allocated_quotas) {
      console.log(`[Teacher Quota] Allocation has no quota data`);
      return null;
    }
    
    console.log(`[Teacher Quota] Allocation found:`, {
      teacherName: allocation.teacher_name,
      allocatedQuotas: allocation.allocated_quotas,
      usedQuotas: allocation.used_quotas
    });
    
    // Map feature to allocation quota type (matching database schema)
    const quotaMapping: Record<AIQuotaFeature, string> = {
      'lesson_generation': 'lesson_generation', // Lesson generation has its own quota pool
      'grading_assistance': 'grading_assistance', // Grading assistance has its own quota pool  
      'homework_help': 'homework_help', // Homework help has its own quota pool
      'transcription': 'transcription', // Voice transcription quota (chunks per month)
    }
    
    const quotaType = quotaMapping[feature]
    if (!quotaType) {
      console.warn(`[Teacher Quota] No quota mapping for feature: ${feature}`);
      return null;
    }
    
    if (typeof allocation.allocated_quotas[quotaType] === 'undefined') {
      console.warn(`[Teacher Quota] No quota data for type: ${quotaType}`);
      return null;
    }
    
    const allocatedLimit = allocation.allocated_quotas[quotaType] || 0
    const usedAmount = allocation.used_quotas?.[quotaType] || 0
    
    // Server-tracked usage is authoritative for cross-device consistency
    // Only fall back to local usage if server data is completely unavailable
    let effectiveUsed = usedAmount
    let localUsed = 0 // Initialize with default value
    
    if (usedAmount === 0) {
      // Fallback: check if we have any local usage (offline scenario)
      try {
        const { getCombinedUsage } = await import('@/lib/ai/usage')
        const usage = await getCombinedUsage()
        localUsed = usage[feature] || 0
        if (localUsed > 0) {
          console.warn(`[Teacher Quota] Using local usage fallback: ${localUsed} for ${feature}`);
          effectiveUsed = localUsed
        }
      } catch {
        // If getCombinedUsage fails, stick with server data
        effectiveUsed = usedAmount
        localUsed = 0
      }
    }
    
    const remaining = Math.max(0, allocatedLimit - effectiveUsed)
    
    console.log(`[Teacher Quota] Final calculation for ${feature}:`, {
      quotaType,
      allocatedLimit,
      serverUsed: usedAmount,
      localUsed,
      effectiveUsed,
      remaining,
      teacher: profile.id,
      preschool: profile.preschool_id,
      teacherName: allocation.teacher_name
    })
    
    const usageSource = getUsageSourceState()
    return {
      used: effectiveUsed,
      limit: allocatedLimit,
      remaining,
      source: usageSource.source,
      serverReachable: usageSource.serverReachable,
    }
    
  } catch (error) {
    console.error('[Teacher Quota] Error in getTeacherSpecificQuota:', error)
    return null
  }
}
