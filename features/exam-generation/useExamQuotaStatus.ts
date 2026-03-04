import { useMemo } from 'react';
import { useAIUserLimits } from '@/hooks/useAI';

type ExamQuotaStatus = {
  examQuotaLimit: number;
  examQuotaUsed: number;
  examQuotaWarning: string | null;
};

function toNumberMap(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  const map: Record<string, number> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    map[key] = Math.max(0, numeric);
  }
  return map;
}

function pickQuotaValue(map: Record<string, number>, keys: string[]): number {
  for (const key of keys) {
    const value = map[key];
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

export function useExamQuotaStatus(): ExamQuotaStatus {
  const { data: aiLimits } = useAIUserLimits();
  const quotaMap = useMemo(() => toNumberMap((aiLimits as any)?.quotas), [aiLimits]);
  const usedMap = useMemo(
    () => toNumberMap((aiLimits as any)?.used ?? (aiLimits as any)?.current_usage),
    [aiLimits],
  );
  const examQuotaKeys = useMemo(
    () => ['exam_generation', 'grading_assistance', 'lesson_generation'],
    [],
  );
  const examQuotaLimit = useMemo(
    () => pickQuotaValue(quotaMap, examQuotaKeys),
    [quotaMap, examQuotaKeys],
  );
  const examQuotaUsed = useMemo(
    () => pickQuotaValue(usedMap, examQuotaKeys),
    [usedMap, examQuotaKeys],
  );
  const examQuotaRemaining = Math.max(0, examQuotaLimit - examQuotaUsed);
  const examQuotaWarning =
    examQuotaLimit > 0 && examQuotaRemaining <= 0
      ? 'Monthly exam quota appears exhausted.'
      : examQuotaLimit > 0 && examQuotaRemaining <= 2
        ? `Low exam quota: ${examQuotaRemaining} left this month.`
        : null;

  return {
    examQuotaLimit,
    examQuotaUsed,
    examQuotaWarning,
  };
}

