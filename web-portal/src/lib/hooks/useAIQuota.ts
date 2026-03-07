import { useCallback } from 'react';
import { useQuotaCheck } from '@/hooks/useQuotaCheck';

interface AIQuotaStatus {
  allowed: boolean;
  remaining: number;
  limit: number;
  current_tier: string;
  upgrade_available: boolean;
}

type RequestType = 'exam_generation' | 'explanation' | 'chat_message';

/**
 * Legacy compatibility wrapper.
 * Source of truth now comes from useQuotaCheck to avoid split quota logic.
 */
export function useAIQuota() {
  const { usage, loading, checkQuota, incrementUsage, refreshUsage } = useQuotaCheck(undefined);

  const withQuotaCheck = useCallback(async <T,>(
    requestType: RequestType,
    callback: () => Promise<T>,
    onQuotaExceeded?: (status: AIQuotaStatus) => void,
  ): Promise<T | null> => {
    const quotaStatus = await checkQuota(requestType);
    if (!quotaStatus) return null;

    if (!quotaStatus.allowed) {
      if (onQuotaExceeded) {
        onQuotaExceeded(quotaStatus);
      } else {
        const typeLabel = requestType.replace('_', ' ');
        alert(
          `⚠️ AI Quota Exceeded\n\n` +
            `You've reached your ${typeLabel} limit (${quotaStatus.limit} per ${requestType === 'chat_message' ? 'day' : 'month'}).\n\n` +
            `${quotaStatus.upgrade_available ? 'Upgrade to continue using AI features!' : 'Please try again later.'}`,
        );
      }
      await incrementUsage(requestType, 'rate_limited');
      return null;
    }

    try {
      const result = await callback();
      await incrementUsage(requestType, 'success');
      return result;
    } catch (error) {
      await incrementUsage(requestType, 'failed');
      throw error;
    }
  }, [checkQuota, incrementUsage]);

  return {
    usage,
    loading,
    checkQuota,
    incrementUsage,
    withQuotaCheck,
    fetchUsage: refreshUsage,
    hasExamsRemaining: usage ? usage.exams_generated_this_month < 999 : true,
    hasExplanationsRemaining: usage ? usage.explanations_requested_this_month < 999 : true,
    hasChatRemaining: usage ? (usage.chat_messages_this_month ?? usage.chat_messages_today) < 999 : true,
  };
}

