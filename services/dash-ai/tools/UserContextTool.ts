/**
 * User Context Tool
 * 
 * Provides Dash AI with context about the current user.
 * Enables personalized, relevant responses based on user profile.
 * 
 * **Features:**
 * - Get user's role and subscription tier
 * - Access child profiles (for parents)
 * - Get recent activity and progress
 * - Understand user preferences
 * 
 * **Security:**
 * - Only returns data for the authenticated user
 * - RLS enforced at database level
 * - No access to other users' data
 */

import { Tool, ToolCategory, RiskLevel, ToolParameter, ToolExecutionContext, ToolExecutionResult } from '../types';
import { assertSupabase } from '@/lib/supabase';
import { getCurrentLanguage } from '@/lib/i18n';
import { normalizeLanguageCode } from '@/lib/ai/dashSettings';
import { fetchParentChildren } from '@/lib/parent-children';

const UserContextTool: Tool = {
  id: 'user_context',
  name: 'User Context',
  description: 'Get information about the current user to provide personalized assistance. Retrieves user profile, role, subscription tier, and child information for parents.',
  category: 'profile' as ToolCategory,
  riskLevel: 'low' as RiskLevel,
  
  allowedRoles: ['superadmin', 'principal', 'teacher', 'parent', 'student'],
  requiredTier: undefined,
  
  parameters: [
    {
      name: 'include_children',
      type: 'boolean',
      description: 'Include child profiles (for parent users)',
      required: false,
    },
    {
      name: 'include_activity',
      type: 'boolean',
      description: 'Include recent activity summary',
      required: false,
    },
    {
      name: 'include_preferences',
      type: 'boolean',
      description: 'Include user preferences and settings',
      required: false,
    },
  ] as ToolParameter[],
  
  claudeToolDefinition: {
    name: 'user_context',
    description: 'Get information about the current user including their name, role, grade level, and children (for parents). Use this to personalize responses and understand context.',
    input_schema: {
      type: 'object' as const,
      properties: {
        include_children: {
          type: 'boolean',
          description: 'Include child profiles for parent users',
        },
        include_activity: {
          type: 'boolean',
          description: 'Include recent activity summary',
        },
        include_preferences: {
          type: 'boolean',
          description: 'Include user preferences',
        },
      },
      required: [],
    },
  },
  
  execute: async (
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    try {
      const supabase = assertSupabase();
      const userId = context.userId;
      
      if (!userId) {
        return {
          success: false,
          error: 'User not authenticated',
        };
      }
      
      // Get user profile
      const { data: profileById, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (profileError) {
        return {
          success: false,
          error: `Failed to get user profile: ${profileError.message}`,
        };
      }

      let profile = profileById;
      if (!profile) {
        const { data: profileByAuth, error: authProfileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('auth_user_id', userId)
          .maybeSingle();
        if (authProfileError) {
          return {
            success: false,
            error: `Failed to get user profile: ${authProfileError.message}`,
          };
        }
        profile = profileByAuth;
      }

      if (!profile) {
        return {
          success: false,
          error: 'Failed to get user profile',
        };
      }
      
      const uiLanguage = normalizeLanguageCode(getCurrentLanguage?.());
      const profileLanguage = normalizeLanguageCode(profile.preferred_language || undefined);
      const effectiveLanguage = ['en', 'af', 'zu'].includes(profileLanguage) ? profileLanguage : uiLanguage;
      const languageLocale = effectiveLanguage === 'af'
        ? 'af-ZA'
        : effectiveLanguage === 'zu'
          ? 'zu-ZA'
          : 'en-ZA';

      const userContext: Record<string, any> = {
        name: profile.full_name || profile.display_name || '',
        firstName: profile.full_name?.split(' ')[0] || 'there',
        role: profile.role || context.role,
        tier: profile.subscription_tier || context.tier,
        gradeLevel: profile.grade_level,
        language: languageLocale,
        organization: profile.organization_id,
      };
      
      // Get children for parent users
      if (params.include_children && profile.role === 'parent') {
        const schoolId = profile.organization_id || profile.preschool_id;
        const children = await fetchParentChildren(profile.id, { includeInactive: false, schoolId });

        userContext.children = (children || []).map((child: any) => {
          const classData = Array.isArray(child.classes) ? child.classes[0] : child.classes;
          const gradeLevel = child.grade_level || child.grade || classData?.grade_level || null;
          return {
            id: child.id,
            name: `${child.first_name} ${child.last_name}`.trim(),
            gradeLevel,
            className: classData?.name || null,
            avatarUrl: child.avatar_url || null,
          };
        }).filter((c: any) => c.id);
      }
      
      // Get recent activity
      if (params.include_activity) {
        // Get recent AI interactions
        const { data: aiUsage } = await supabase
          .from('user_ai_usage')
          .select('*')
          .eq('user_id', userId)
          .single();
        
        userContext.activity = {
          aiMessagesUsed: aiUsage?.messages_used || 0,
          aiMessagesLimit: aiUsage?.messages_limit || 0,
          lastActive: profile.last_login_at,
        };
        
        // Get homework stats if student or parent
        if (['student', 'parent'].includes(profile.role)) {
          const { data: homeworkStats } = await supabase
            .from('homework_submissions')
            .select('status', { count: 'exact' })
            .eq(profile.role === 'parent' ? 'parent_id' : 'student_id', profile.role === 'parent' ? profile.id : userId)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
          
          userContext.activity.recentHomework = homeworkStats?.length || 0;
        }
      }
      
      // Get preferences
      if (params.include_preferences) {
        userContext.preferences = {
          dashboardLayout: profile.dashboard_layout || 'classic',
          notifications: profile.notification_preferences || {},
          theme: profile.theme_preference || 'system',
        };
      }
      
      return {
        success: true,
        data: userContext,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to get user context: ${error.message}`,
      };
    }
  },
};

export { UserContextTool };
