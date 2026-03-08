/**
 * AI Quota Guards
 * 
 * Utility functions to wrap client actions with quota pre-checks
 * and show user-friendly alerts with upgrade prompts.
 * Complies with WARP.md security and UX requirements.
 */

import { Alert } from 'react-native';
import { router } from 'expo-router';
import { track } from '@/lib/analytics';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';
import { getQuotaStatus, extractAPIError } from './api';
import type { AIQuotaFeature } from './limits';

export interface QuotaGuardOptions {
  serviceType: AIQuotaFeature;
  userId: string;
  requestedUnits?: number;
  customMessages?: {
    title?: string;
    message?: string;
    upgradeText?: string;
    cancelText?: string;
  };
  onBlocked?: (quotaInfo: any) => void;
  onUpgradePressed?: () => void;
  skipAlert?: boolean; // For custom UI handling
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: 'quota_exceeded' | 'error' | 'loading';
  quotaInfo?: {
    used: number;
    limit: number;
    remaining: number;
    reset_at: string;
    upgrade_suggestions?: Array<{
      tier: string;
      limit: number;
      cost_per_month: number;
      features: string[];
    }>;
  };
}

/**
 * Check quota without showing UI
 */
export async function checkAIQuota(
  serviceType: AIQuotaFeature,
  userId: string,
  requestedUnits = 1
): Promise<QuotaCheckResult> {
  try {
    const quotaInfo = await getQuotaStatus(userId, serviceType);
    
    const allowed = quotaInfo.remaining >= requestedUnits;
    
    return {
      allowed,
      reason: allowed ? undefined : 'quota_exceeded',
      quotaInfo,
    };
  } catch {
    // Fail-closed: on quota check error, block to prevent bypass.
    // User sees "Unable to verify quota" and can retry when service recovers.
    return {
      allowed: false,
      reason: 'error',
      quotaInfo: undefined,
    };
  }
}

/**
 * Wrap a function with quota checking and user-friendly alerts
 */
export function withAIQuotaGuard<T extends (...args: any[]) => any>(
  fn: T,
  options: QuotaGuardOptions
): (...args: Parameters<T>) => Promise<ReturnType<T> | void> {
  return async (...args: Parameters<T>) => {
    const {
      serviceType,
      userId,
      requestedUnits = 1,
      customMessages = {},
      onBlocked,
      onUpgradePressed,
      skipAlert = false,
    } = options;
    
    try {
      // Check quota before executing the function
      const quotaCheck = await checkAIQuota(serviceType, userId, requestedUnits);
      
      if (quotaCheck.allowed) {
        // Quota available - execute the original function
        track('edudash.ai.quota.check_passed', {
          service_type: serviceType,
          remaining: quotaCheck.quotaInfo?.remaining,
          requested: requestedUnits,
        });
        
        return await fn(...args);
      } else {
        // Quota exceeded - handle gracefully
        track('edudash.ai.quota.blocked', {
          service_type: serviceType,
          quota_used: quotaCheck.quotaInfo?.used,
          quota_limit: quotaCheck.quotaInfo?.limit,
          user_tier: 'unknown', // Will be filled by context
          upgrade_shown: !skipAlert,
        });
        
        // Call optional blocked callback
        if (onBlocked) {
          onBlocked(quotaCheck.quotaInfo);
        }
        
        // Show alert unless skipAlert is true
        if (!skipAlert) {
          showQuotaExceededAlert(serviceType, quotaCheck.quotaInfo, {
            customMessages,
            onUpgradePressed,
          });
        }
        
        return; // Don't execute the original function
      }
    } catch (error) {
      const errorInfo = extractAPIError(error);
      
      track('edudash.ai.quota.check_error', {
        service_type: serviceType,
        error: errorInfo.message,
      });
      
      // Fail-closed: on quota check error, do not execute. Show user-friendly message.
      if (!skipAlert) {
        Alert.alert(
          'Unable to Verify Quota',
          'We couldn\'t verify your AI usage limit. Please check your connection and try again.',
          [{ text: 'OK', style: 'cancel' }],
        );
      }
      return;
    }
  };
}

/**
 * Show standardized quota exceeded alert with upgrade options
 */
export function showQuotaExceededAlert(
  serviceType: AIQuotaFeature,
  quotaInfo: any,
  options: {
    customMessages?: {
      title?: string;
      message?: string;
      upgradeText?: string;
      cancelText?: string;
    };
    onUpgradePressed?: () => void;
  } = {}
) {
  const { customMessages = {}, onUpgradePressed } = options;
  
  const serviceName = serviceType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  const title = customMessages.title || `${serviceName} Limit Reached`;
  const message = customMessages.message || 
    `You've used all your ${serviceName.toLowerCase()} quota for this month${quotaInfo?.limit ? ` (${quotaInfo.used}/${quotaInfo.limit})` : ''}. Upgrade to continue using AI features.`;
  
  const upgradeText = customMessages.upgradeText || 'View Plans';
  const cancelText = customMessages.cancelText || 'Cancel';
  
  Alert.alert(
    title,
    message,
    [
      { 
        text: cancelText, 
        style: 'cancel',
        onPress: () => {
          track('edudash.ai.quota.alert_dismissed', {
            service_type: serviceType,
            action: 'cancel',
          });
        }
      },
      {
        text: upgradeText,
        onPress: () => {
          track('edudash.ai.upsell.shown', {
            trigger: 'quota_exceeded_alert',
            current_tier: 'free', // Will be determined by context
            target_tier: 'pro',
            quota_percentage: quotaInfo?.limit ? (quotaInfo.used / quotaInfo.limit) * 100 : 100,
          });
          
          if (onUpgradePressed) {
            onUpgradePressed();
          } else {
            navigateToUpgrade({ source: 'quota_exceeded_alert' });
          }
        },
      },
    ]
  );
}

/**
 * Create a quota-aware navigation function
 * Useful for protecting navigation to AI screens
 */
export function createQuotaAwareNavigation(
  serviceType: AIQuotaFeature,
  userId: string,
  targetRoute: string,
  options?: {
    customMessages?: QuotaGuardOptions['customMessages'];
    onBlocked?: () => void;
  }
) {
  return withAIQuotaGuard(
    () => {
      // Track successful navigation
      track('edudash.ai.tool.opened', {
        tool_type: (serviceType === 'lesson_generation' ? 'lesson_generator' : (serviceType === 'grading_assistance' ? 'grader' : (serviceType as any))),
        source: 'dashboard_navigation',
        user_role: 'unknown', // Will be filled by context
      });
      
      router.push(targetRoute as any);
    },
    {
      serviceType,
      userId,
      requestedUnits: 1,
      customMessages: options?.customMessages,
      onBlocked: options?.onBlocked,
    }
  );
}

/**
 * Get user-friendly quota status text
 */
export function getQuotaStatusText(
  quotaInfo: {
    used: number;
    limit: number;
    remaining: number;
    reset_at: string;
  },
  serviceType: AIQuotaFeature
): {
  statusText: string;
  percentageUsed: number;
  isLow: boolean;
  isCritical: boolean;
} {
  const percentageUsed = quotaInfo.limit > 0 ? (quotaInfo.used / quotaInfo.limit) * 100 : 0;
  const isLow = percentageUsed >= 80;
  const isCritical = percentageUsed >= 95;
  
  const serviceName = serviceType.replace('_', ' ');
  
  let statusText: string;
  
  if (quotaInfo.remaining === 0) {
    statusText = `${serviceName} quota exceeded (${quotaInfo.used}/${quotaInfo.limit})`;
  } else if (isCritical) {
    statusText = `Only ${quotaInfo.remaining} ${serviceName} requests left`;
  } else if (isLow) {
    statusText = `${quotaInfo.remaining} of ${quotaInfo.limit} ${serviceName} requests remaining`;
  } else {
    statusText = `${quotaInfo.remaining}/${quotaInfo.limit} ${serviceName} requests available`;
  }
  
  return {
    statusText,
    percentageUsed,
    isLow,
    isCritical,
  };
}

/**
 * Get quota status color for UI components
 */
export function getQuotaStatusColor(percentageUsed: number): {
  color: string;
  backgroundColor: string;
} {
  if (percentageUsed >= 100) {
    return { color: '#DC2626', backgroundColor: '#FEE2E2' }; // Red
  } else if (percentageUsed >= 95) {
    return { color: '#D97706', backgroundColor: '#FEF3C7' }; // Amber
  } else if (percentageUsed >= 80) {
    return { color: '#CA8A04', backgroundColor: '#FEF9C3' }; // Yellow
  } else {
    return { color: '#059669', backgroundColor: '#D1FAE5' }; // Green
  }
}

/**
 * Pre-flight check for AI actions (returns boolean for simple usage)
 */
export async function canUseAI(
  serviceType: AIQuotaFeature,
  userId: string,
  requestedUnits = 1
): Promise<boolean> {
  try {
    const result = await checkAIQuota(serviceType, userId, requestedUnits);
    return result.allowed;
  } catch {
    // Fail-closed: on error, block to prevent bypass
    return false;
  }
}

/**
 * Batch quota check for multiple services
 */
export async function checkMultipleQuotas(
  userId: string,
  checks: Array<{ serviceType: AIQuotaFeature; requestedUnits?: number }>
): Promise<Record<AIQuotaFeature, QuotaCheckResult>> {
  const results: Record<string, QuotaCheckResult> = {};
  
  const checkPromises = checks.map(async ({ serviceType, requestedUnits = 1 }) => {
    try {
      const result = await checkAIQuota(serviceType, userId, requestedUnits);
      results[serviceType] = result;
    } catch {
      results[serviceType] = {
        allowed: false,
        reason: 'error',
      };
    }
  });
  
  await Promise.all(checkPromises);
  
  return results as Record<AIQuotaFeature, QuotaCheckResult>;
}
