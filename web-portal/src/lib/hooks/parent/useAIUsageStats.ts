'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface AIUsageStats {
  ai_help: number;
  ai_lessons: number;
  tutoring_sessions: number;
}

interface UseAIUsageStatsReturn {
  usage: AIUsageStats;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAIUsageStats(userId: string | undefined): UseAIUsageStatsReturn {
  const [usage, setUsage] = useState<AIUsageStats>({
    ai_help: 0,
    ai_lessons: 0,
    tutoring_sessions: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsageStats = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();

      // Get start of current month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Fetch AI usage logs for this month
      const { data: usageData } = await supabase
        .from('ai_usage_logs')
        .select('service_type')
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString());

      if (usageData) {
        const homeworkCount = usageData.filter((u: any) => u.service_type === 'homework_help').length;
        const lessonCount = usageData.filter((u: any) => u.service_type === 'lesson_generation').length;
        const tutoringCount = usageData.filter((u: any) => u.service_type === 'tutoring').length;

        setUsage({
          ai_help: homeworkCount,
          ai_lessons: lessonCount,
          tutoring_sessions: tutoringCount,
        });
      }
    } catch (err) {
      console.error('Failed to load AI usage stats:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUsageStats();
  }, [loadUsageStats]);

  return {
    usage,
    loading,
    error,
    refetch: loadUsageStats,
  };
}
