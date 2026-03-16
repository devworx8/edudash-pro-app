/**
 * Direct Database AI Allocation Implementation
 * 
 * This is a temporary implementation that works directly with database tables
 * instead of relying on Edge Functions, allowing us to test the AI Quota
 * Management system with real data before the serverless functions are deployed.
 */

import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { reportError } from '@/lib/monitoring';
import type { SchoolAISubscription, TeacherAIAllocation } from './allocation';
import type { AIQuotaFeature } from './limits';

/**
 * Base quota allocations by subscription tier
 */
function getBaseQuotasByTier(tier: string): Record<AIQuotaFeature, number> {
  switch (tier.toLowerCase()) {
    case 'free':
      return { lesson_generation: 10, grading_assistance: 5, homework_help: 300, transcription: 60, chat_message: 100 };
    case 'parent_starter':
      return { lesson_generation: 0, grading_assistance: 0, homework_help: 30, transcription: 120, chat_message: 150 };
    case 'parent_plus':
      return { lesson_generation: 0, grading_assistance: 0, homework_help: 100, transcription: 300, chat_message: 500 };
    case 'private_teacher':
      return { lesson_generation: 20, grading_assistance: 20, homework_help: 100, transcription: 600, chat_message: 300 };
    case 'pro':
      return { lesson_generation: 50, grading_assistance: 100, homework_help: 300, transcription: 1800, chat_message: 1500 };
    case 'enterprise':
      return { lesson_generation: 5000, grading_assistance: 10000, homework_help: 30000, transcription: 36000, chat_message: 999999 };
    default:
      return { lesson_generation: 10, grading_assistance: 5, homework_help: 300, transcription: 60, chat_message: 100 };
  }
}

/**
 * Get school AI subscription details - fallback implementation
 */
export async function getSchoolAISubscriptionDirect(preschoolId: string): Promise<SchoolAISubscription | null> {
  try {
    const client = assertSupabase();
    
    // Get school info with actual subscription details
    const { data: school, error: schoolError } = await client
      .from('preschools')
      .select(`
        id, 
        name, 
        subscription_tier,
        subscriptions!inner(
          status,
          subscription_plans!inner(
            name,
            tier,
            price_monthly
          )
        )
      `)
      .eq('id', preschoolId)
      .eq('subscriptions.status', 'active')
      .single();

    if (schoolError || !school) {
      console.warn('School not found or no active subscription:', schoolError);
      // Fallback - try to get school without subscription join
      const { data: fallbackSchool, error: fallbackError } = await client
        .from('preschools')
        .select('id, name, subscription_tier')
        .eq('id', preschoolId)
        .single();
      
      if (fallbackError || !fallbackSchool) {
        console.warn('School completely not found:', fallbackError);
        return null;
      }
      
      // Use free tier as default
      const tier = fallbackSchool.subscription_tier || 'free';
      const baseQuotas = getBaseQuotasByTier(tier);
      
      return {
        preschool_id: preschoolId,
        subscription_tier: tier as any,
        org_type: 'preschool' as any,
        total_quotas: baseQuotas,
        allocated_quotas: { 'lesson_generation': 0, 'grading_assistance': 0, 'homework_help': 0, 'transcription': 0, 'chat_message': 0 },
        available_quotas: baseQuotas,
        total_usage: { 'lesson_generation': 0, 'grading_assistance': 0, 'homework_help': 0, 'transcription': 0, 'chat_message': 0 },
        allow_teacher_self_allocation: false,
        default_teacher_quotas: { 'lesson_generation': 10, 'grading_assistance': 5, 'homework_help': 20, 'transcription': 30, 'chat_message': 20 },
        max_individual_quota: { 'lesson_generation': Math.floor(baseQuotas.lesson_generation * 0.5), 'grading_assistance': Math.floor(baseQuotas.grading_assistance * 0.5), 'homework_help': Math.floor(baseQuotas.homework_help * 0.5), 'transcription': Math.floor(baseQuotas.transcription * 0.5), 'chat_message': Math.floor((baseQuotas.chat_message ?? 0) * 0.5) },
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: 'system',
      };
    }

    // Extract tier from active subscription plan
    const activeSub = school.subscriptions[0];
    const subscriptionPlan = activeSub?.subscription_plans as any;
    const planTier = Array.isArray(subscriptionPlan) ? subscriptionPlan[0]?.tier : subscriptionPlan?.tier;
    const tier = planTier || school.subscription_tier || 'free';
    
    const baseQuotas = getBaseQuotasByTier(tier);

    const subscription: SchoolAISubscription = {
      preschool_id: preschoolId,
      subscription_tier: tier as any,
      org_type: 'preschool' as any,
      total_quotas: baseQuotas,
      allocated_quotas: {
        'lesson_generation': 0,
        'grading_assistance': 0,
        'homework_help': 0,
        'transcription': 0,
        'chat_message': 0,
      },
      available_quotas: baseQuotas,
      total_usage: {
        'lesson_generation': 0,
        'grading_assistance': 0,
        'homework_help': 0,
        'transcription': 0,
        'chat_message': 0,
      },
      allow_teacher_self_allocation: false,
      default_teacher_quotas: {
        'lesson_generation': 20,
        'grading_assistance': 30,
        'homework_help': 50,
        'transcription': 300,
        'chat_message': 50,
      },
      max_individual_quota: {
        'lesson_generation': Math.floor(baseQuotas.lesson_generation * 0.5),
        'grading_assistance': Math.floor(baseQuotas.grading_assistance * 0.5),
        'homework_help': Math.floor(baseQuotas.homework_help * 0.5),
        'transcription': Math.floor(baseQuotas.transcription * 0.5),
        'chat_message': Math.floor((baseQuotas.chat_message ?? 0) * 0.5),
      },
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: 'system',
    };

    return subscription;
  } catch (error) {
    reportError(error instanceof Error ? error : new Error('Unknown error'), {
      context: 'getSchoolAISubscriptionDirect',
      preschool_id: preschoolId,
    });
    return null;
  }
}

/**
 * Get teacher allocations - REAL database implementation
 */
export async function getTeacherAllocationsDirect(preschoolId: string): Promise<TeacherAIAllocation[]> {
  try {
    const client = assertSupabase();
    
    // Get actual teacher allocations from database
    const { data: allocations, error } = await client
      .from('teacher_ai_allocations')
      .select('*')
      .eq('preschool_id', preschoolId)
      .eq('is_active', true);
    
    if (error) {
      console.warn('Failed to fetch teacher allocations:', error);
      return [];
    }
    
    if (!allocations || allocations.length === 0) {
      return [];
    }
    
    // Transform database records to expected format
    return allocations.map((allocation) => {
      const allocatedQuotas = allocation.allocated_quotas as Record<string, number> || {};
      const usedQuotas = allocation.used_quotas as Record<string, number> || {};
      
      // Calculate remaining quotas
      const remainingQuotas: Record<string, number> = {};
      Object.keys(allocatedQuotas).forEach(key => {
        remainingQuotas[key] = Math.max(0, (allocatedQuotas[key] || 0) - (usedQuotas[key] || 0));
      });
      
      return {
        id: allocation.id,
        preschool_id: allocation.preschool_id,
        user_id: allocation.user_id,
        teacher_name: allocation.teacher_name,
        teacher_email: allocation.teacher_email,
        role: allocation.role,
        allocated_quotas: allocatedQuotas,
        used_quotas: usedQuotas,
        remaining_quotas: remainingQuotas,
        allocated_by: allocation.allocated_by,
        allocated_at: allocation.allocated_at,
        allocation_reason: allocation.allocation_reason,
        is_active: allocation.is_active,
        is_suspended: allocation.is_suspended,
        suspension_reason: allocation.suspension_reason,
        auto_renew: allocation.auto_renew,
        priority_level: allocation.priority_level as 'low' | 'normal' | 'high',
      };
    });
    
  } catch (error) {
    reportError(error instanceof Error ? error : new Error('Unknown error'), {
      context: 'getTeacherAllocationsDirect',
      preschool_id: preschoolId,
    });
    return [];
  }
}

/**
 * Check if user can manage allocations - simplified direct implementation
 */
export async function canManageAllocationsDirect(userId: string, preschoolId: string): Promise<boolean> {
  try {
    const client = assertSupabase();
    
    // Get user's profile and role from profiles table (not deprecated users table)
    const { data: profile, error } = await client
      .from('profiles')
      .select('role, preschool_id')
      .eq('id', userId)
      .maybeSingle();

    if (error || !profile) {
      console.warn('User profile not found:', error);
      return false;
    }

    if (profile.preschool_id !== preschoolId) {
      console.warn('User not in the specified preschool');
      return false;
    }

    // Check if user has allocation management permissions
    const canManage = ['principal', 'principal_admin', 'super_admin'].includes(profile.role);
    
    return canManage;
    
  } catch (error) {
    console.warn('Error checking allocation permissions:', error);
    return false;
  }
}

/**
 * Real database allocation function
 */
export async function allocateAIQuotasDirect(
  preschoolId: string,
  teacherId: string,
  quotas: Partial<Record<AIQuotaFeature, number>>,
  options: {
    reason?: string;
    auto_renew?: boolean;
    priority_level?: 'low' | 'normal' | 'high';
  } = {}
): Promise<{ success: boolean; error?: string; allocation?: TeacherAIAllocation }> {
  try {
    const client = assertSupabase();
    
    // Validate inputs
    if (!preschoolId || !teacherId) {
      return { success: false, error: 'Missing required parameters' };
    }

    // Get current user for audit trail
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    // Get teacher details from profiles table (not deprecated users table)
    const { data: teacher, error: teacherError } = await client
      .from('profiles')
      .select('id, first_name, last_name, email, role')
      .eq('id', teacherId)
      .maybeSingle();

    if (teacherError || !teacher) {
      return { success: false, error: 'Teacher not found' };
    }

    const teacherName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || teacher.email?.split('@')[0] || 'Unknown Teacher';
    
    // Convert quota types to database format
    const dbQuotas = {
      'claude_messages': quotas.lesson_generation || 0,
      'content_generation': quotas.grading_assistance || 0, 
      'assessment_ai': quotas.homework_help || 0,
    };
    
    // Check if allocation exists
    const { data: existingAllocation } = await client
      .from('teacher_ai_allocations')
      .select('*')
      .eq('preschool_id', preschoolId)
      .eq('user_id', teacherId)
      .eq('is_active', true)
      .single();

    let allocation;
    
    if (existingAllocation) {
      // Update existing allocation
      const { data: updated, error: updateError } = await client
        .from('teacher_ai_allocations')
        .update({
          allocated_quotas: dbQuotas,
          allocated_by: user.id,
          allocated_at: new Date().toISOString(),
          allocation_reason: options.reason || 'Updated by admin',
          auto_renew: options.auto_renew || false,
          priority_level: options.priority_level || 'normal',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAllocation.id)
        .select()
        .single();
        
      if (updateError) {
        return { success: false, error: 'Failed to update allocation: ' + updateError.message };
      }
      allocation = updated;
    } else {
      // Create new allocation with UPSERT to handle race conditions and duplicate conflicts
      const { data: created, error: createError } = await client
        .from('teacher_ai_allocations')
        .upsert({
          preschool_id: preschoolId,
          user_id: teacherId,
          teacher_name: teacherName,
          teacher_email: teacher.email || '',
          role: teacher.role || 'teacher',
          allocated_quotas: dbQuotas,
          used_quotas: {
            'claude_messages': 0,
            'content_generation': 0,
            'assessment_ai': 0,
          },
          allocated_by: user.id,
          allocation_reason: options.reason || 'Allocated by admin',
          is_active: true,
          is_suspended: false,
          auto_renew: options.auto_renew || false,
          priority_level: options.priority_level || 'normal',
        }, {
          onConflict: 'preschool_id,user_id',
          ignoreDuplicates: false
        })
        .select()
        .single();
        
      if (createError) {
        return { success: false, error: 'Failed to create allocation: ' + createError.message };
      }
      allocation = created;
    }
    
    // Convert back to expected format
    const allocatedQuotas = allocation.allocated_quotas as Record<string, number>;
    const usedQuotas = allocation.used_quotas as Record<string, number> || {};
    
    // Calculate remaining quotas
    const remainingQuotas: Record<string, number> = {};
    Object.keys(allocatedQuotas).forEach(key => {
      remainingQuotas[key] = Math.max(0, (allocatedQuotas[key] || 0) - (usedQuotas[key] || 0));
    });
    
    const result: TeacherAIAllocation = {
      id: allocation.id,
      preschool_id: allocation.preschool_id,
      user_id: allocation.user_id,
      teacher_name: allocation.teacher_name,
      teacher_email: allocation.teacher_email,
      role: allocation.role,
      allocated_quotas: {
        lesson_generation: allocatedQuotas.claude_messages || 0,
        grading_assistance: allocatedQuotas.content_generation || 0,
        homework_help: allocatedQuotas.assessment_ai || 0,
        transcription: allocatedQuotas.transcription || 0,
        chat_message: allocatedQuotas.chat_message || 0,
      },
      used_quotas: {
        lesson_generation: usedQuotas.claude_messages || 0,
        grading_assistance: usedQuotas.content_generation || 0,
        homework_help: usedQuotas.assessment_ai || 0,
        transcription: usedQuotas.transcription || 0,
        chat_message: usedQuotas.chat_message || 0,
      },
      remaining_quotas: {
        lesson_generation: Math.max(0, (allocatedQuotas.claude_messages || 0) - (usedQuotas.claude_messages || 0)),
        grading_assistance: Math.max(0, (allocatedQuotas.content_generation || 0) - (usedQuotas.content_generation || 0)),
        homework_help: Math.max(0, (allocatedQuotas.assessment_ai || 0) - (usedQuotas.assessment_ai || 0)),
        transcription: Math.max(0, (allocatedQuotas.transcription || 0) - (usedQuotas.transcription || 0)),
        chat_message: Math.max(0, (allocatedQuotas.chat_message || 0) - (usedQuotas.chat_message || 0)),
      },
      allocated_by: allocation.allocated_by,
      allocated_at: allocation.allocated_at,
      allocation_reason: allocation.allocation_reason,
      is_active: allocation.is_active,
      is_suspended: allocation.is_suspended,
      suspension_reason: allocation.suspension_reason,
      auto_renew: allocation.auto_renew,
      priority_level: allocation.priority_level as 'low' | 'normal' | 'high',
    };

    track('edudash.ai.allocation.direct.success', {
      preschool_id: preschoolId,
      teacher_id: teacherId,
      quotas_allocated: quotas,
    });

    return { success: true, allocation: result };
    
  } catch (error) {
    console.error('Error in allocateAIQuotasDirect:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}


/**
 * Get optimal allocation suggestions - direct implementation fallback
 */
export async function getOptimalAllocationSuggestionsDirect(
  preschoolId: string
): Promise<{
  suggestions: Array<{
    teacher_id: string;
    teacher_name: string;
    current_quotas: Record<string, number>;
    suggested_quotas: Record<string, number>;
    reasoning: string;
    priority: 'low' | 'medium' | 'high';
    potential_savings: number;
  }>;
  school_summary: {
    total_quota_utilization: number;
    underused_quotas: number;
    overdemand_teachers: number;
    optimization_potential: number;
  };
}> {
  try {
    // Get current teacher allocations
    const allocations = await getTeacherAllocationsDirect(preschoolId);
    
    if (allocations.length === 0) {
      return {
        suggestions: [],
        school_summary: {
          total_quota_utilization: 0,
          underused_quotas: 0,
          overdemand_teachers: 0,
          optimization_potential: 0,
        },
      };
    }

    // Generate suggestions based on usage patterns
    const suggestions = allocations.map((allocation) => {
      const usage = allocation.used_quotas;
      const allocated = allocation.allocated_quotas;
      
      // Calculate utilization rates for each quota type
      const utilizationRates = {
        lesson_generation: (allocated.lesson_generation || 0) > 0 ? (usage.lesson_generation || 0) / (allocated.lesson_generation || 0) : 0,
        grading_assistance: (allocated.grading_assistance || 0) > 0 ? (usage.grading_assistance || 0) / (allocated.grading_assistance || 0) : 0,
        homework_help: (allocated.homework_help || 0) > 0 ? (usage.homework_help || 0) / (allocated.homework_help || 0) : 0,
      };

      // Calculate suggested quotas based on usage patterns
      const suggested = {
        lesson_generation: Math.ceil((usage.lesson_generation || 0) * 1.2), // 20% buffer
        grading_assistance: Math.ceil((usage.grading_assistance || 0) * 1.3), // 30% buffer for grading
        homework_help: Math.ceil((usage.homework_help || 0) * 1.15), // 15% buffer
      };

      // Determine priority and reasoning
      const avgUtilization = Object.values(utilizationRates).reduce((a, b) => a + b, 0) / 3;
      let priority: 'low' | 'medium' | 'high' = 'medium';
      let reasoning = 'Optimized allocation based on usage patterns';
      
      if (avgUtilization > 0.8) {
        priority = 'high';
        reasoning = 'High usage detected - increase allocation to prevent limits';
      } else if (avgUtilization < 0.3) {
        priority = 'low';
        reasoning = 'Low usage detected - consider reducing allocation';
        // For low usage, suggest reducing by 20%
        suggested.lesson_generation = Math.max(5, Math.ceil((allocated.lesson_generation || 0) * 0.8));
        suggested.grading_assistance = Math.max(5, Math.ceil((allocated.grading_assistance || 0) * 0.8));
        suggested.homework_help = Math.max(10, Math.ceil((allocated.homework_help || 0) * 0.8));
      }

      // Calculate potential savings
      const currentTotal = Object.values(allocated).reduce((a, b) => a + b, 0);
      const suggestedTotal = Object.values(suggested).reduce((a, b) => a + b, 0);
      const potentialSavings = Math.max(0, currentTotal - suggestedTotal);

      return {
        teacher_id: allocation.user_id,
        teacher_name: allocation.teacher_name,
        current_quotas: allocated,
        suggested_quotas: suggested,
        reasoning,
        priority,
        potential_savings: potentialSavings,
      };
    });

    // Calculate school summary
    const totalQuotas = allocations.reduce((acc, allocation) => {
      Object.entries(allocation.allocated_quotas).forEach(([key, value]) => {
        acc[key] = (acc[key] || 0) + value;
      });
      return acc;
    }, {} as Record<string, number>);

    const totalUsage = allocations.reduce((acc, allocation) => {
      Object.entries(allocation.used_quotas).forEach(([key, value]) => {
        acc[key] = (acc[key] || 0) + value;
      });
      return acc;
    }, {} as Record<string, number>);

    const totalQuotaSum = Object.values(totalQuotas).reduce((a, b) => a + b, 0);
    const totalUsageSum = Object.values(totalUsage).reduce((a, b) => a + b, 0);
    const utilization = totalQuotaSum > 0 ? totalUsageSum / totalQuotaSum : 0;

    const underusedTeachers = suggestions.filter(s => s.priority === 'low').length;
    const overdemandTeachers = suggestions.filter(s => s.priority === 'high').length;
    const totalPotentialSavings = suggestions.reduce((acc, s) => acc + s.potential_savings, 0);
    const optimizationPotential = totalQuotaSum > 0 ? totalPotentialSavings / totalQuotaSum : 0;

    return {
      suggestions,
      school_summary: {
        total_quota_utilization: Math.round(utilization * 100) / 100,
        underused_quotas: totalQuotaSum - totalUsageSum,
        overdemand_teachers: overdemandTeachers,
        optimization_potential: Math.round(optimizationPotential * 100) / 100,
      },
    };
    
  } catch (error) {
    reportError(error instanceof Error ? error : new Error('Unknown error'), {
      context: 'getOptimalAllocationSuggestionsDirect',
      preschool_id: preschoolId,
    });
    
    return {
      suggestions: [],
      school_summary: {
        total_quota_utilization: 0,
        underused_quotas: 0,
        overdemand_teachers: 0,
        optimization_potential: 0,
      },
    };
  }
}

/**
 * Get default teacher quotas by role (using database schema field names)
 */
function getDefaultTeacherQuotas(role: string): Record<string, number> {
  const quotaMap = {
    'teacher': {
      'claude_messages': 50,    // Teachers get 50 messages per month
      'content_generation': 10, // 10 content generations per month
      'assessment_ai': 25,      // 25 assessment AI uses per month
    },
    'principal': {
      'claude_messages': 200,   // Principals get more
      'content_generation': 50,
      'assessment_ai': 100,
    },
    'principal_admin': {
      'claude_messages': 500,   // Principal admins get the most
      'content_generation': 100,
      'assessment_ai': 200,
    },
  };

  return quotaMap[role] || quotaMap['teacher'];
}

/**
 * Create a default teacher allocation if none exists
 */
export async function ensureTeacherAllocation(preschoolId: string, userId: string): Promise<TeacherAIAllocation | null> {
  try {
    const client = assertSupabase();
    
    // Check if allocation already exists
    const { data: existingAllocation } = await client
      .from('teacher_ai_allocations')
      .select('*')
      .eq('preschool_id', preschoolId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();
    
    if (existingAllocation) {
      // Transform and return existing allocation
      const allocatedQuotas = existingAllocation.allocated_quotas as Record<string, number> || {};
      const usedQuotas = existingAllocation.used_quotas as Record<string, number> || {};
      
      const remainingQuotas: Record<string, number> = {};
      Object.keys(allocatedQuotas).forEach(key => {
        remainingQuotas[key] = Math.max(0, (allocatedQuotas[key] || 0) - (usedQuotas[key] || 0));
      });
      
      return {
        id: existingAllocation.id,
        preschool_id: existingAllocation.preschool_id,
        user_id: existingAllocation.user_id,
        teacher_name: existingAllocation.teacher_name,
        teacher_email: existingAllocation.teacher_email,
        role: existingAllocation.role,
        allocated_quotas: allocatedQuotas,
        used_quotas: usedQuotas,
        remaining_quotas: remainingQuotas,
        allocated_by: existingAllocation.allocated_by,
        allocated_at: existingAllocation.allocated_at,
        allocation_reason: existingAllocation.allocation_reason,
        is_active: existingAllocation.is_active,
        is_suspended: existingAllocation.is_suspended,
        suspension_reason: existingAllocation.suspension_reason,
        auto_renew: existingAllocation.auto_renew,
        priority_level: existingAllocation.priority_level as 'low' | 'normal' | 'high',
      };
    }
    
    // Get user details from profiles table (not deprecated users table)
    const { data: user } = await client
      .from('profiles')
      .select('id, first_name, last_name, email, role')
      .eq('id', userId)
      .maybeSingle();
    
    if (!user) {
      console.warn('User not found for allocation creation:', userId);
      return null;
    }
    
    const firstName = user.first_name || user.email?.split('@')[0] || 'Teacher';
    const lastName = user.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const role = user.role || 'teacher';
    const defaultQuotas = getDefaultTeacherQuotas(role);
    
    // Create new teacher allocation with UPSERT to avoid conflicts
    const { data: newAllocation, error } = await client
      .from('teacher_ai_allocations')
      .upsert({
        preschool_id: preschoolId,
        user_id: userId,
        teacher_name: fullName,
        teacher_email: user.email,
        role: role,
        allocated_quotas: defaultQuotas,
        used_quotas: {
          'claude_messages': 0,
          'content_generation': 0,
          'assessment_ai': 0,
        },
        allocated_by: userId, // Self-allocated initially
        allocation_reason: 'Auto-generated default allocation',
        is_active: true,
        is_suspended: false,
        auto_renew: true,
        priority_level: 'normal',
      }, {
        onConflict: 'preschool_id,user_id',
        ignoreDuplicates: false
      })
      .select()
      .single();
    
    if (error) {
      console.error('Failed to create teacher allocation:', error);
      return null;
    }
    
    console.log(`[Teacher Allocation] Created default allocation for ${fullName}:`, defaultQuotas);
    
    // Transform and return new allocation
    const allocatedQuotas = newAllocation.allocated_quotas as Record<string, number> || {};
    const usedQuotas = newAllocation.used_quotas as Record<string, number> || {};
    
    const remainingQuotas: Record<string, number> = {};
    Object.keys(allocatedQuotas).forEach(key => {
      remainingQuotas[key] = Math.max(0, (allocatedQuotas[key] || 0) - (usedQuotas[key] || 0));
    });
    
    return {
      id: newAllocation.id,
      preschool_id: newAllocation.preschool_id,
      user_id: newAllocation.user_id,
      teacher_name: newAllocation.teacher_name,
      teacher_email: newAllocation.teacher_email,
      role: newAllocation.role,
      allocated_quotas: allocatedQuotas,
      used_quotas: usedQuotas,
      remaining_quotas: remainingQuotas,
      allocated_by: newAllocation.allocated_by,
      allocated_at: newAllocation.allocated_at,
      allocation_reason: newAllocation.allocation_reason,
      is_active: newAllocation.is_active,
      is_suspended: newAllocation.is_suspended,
      suspension_reason: newAllocation.suspension_reason,
      auto_renew: newAllocation.auto_renew,
      priority_level: newAllocation.priority_level as 'low' | 'normal' | 'high',
    };
    
  } catch (error) {
    console.error('Error ensuring teacher allocation:', error);
    return null;
  }
}
