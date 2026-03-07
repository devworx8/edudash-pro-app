/**
 * Hook for AI term suggestions on Create/Edit Term (web). ECD-aware, semester-aware.
 */

import { useState, useCallback } from 'react';
import { TermSuggestionAIService, type TermSuggestionResult } from '@/lib/services/TermSuggestionAIService';
import type { TermFormData, WebTermFormData } from '@/components/principal/year-planner/types';

export interface UseTermSuggestionAIOptions {
  context?: 'ecd' | 'preschool' | 'school';
  onError?: (message: string) => void;
}

export interface UseTermSuggestionAIReturn {
  suggest: (current: TermFormData) => Promise<TermSuggestionResult | null>;
  isBusy: boolean;
  error: string | null;
  lastResult: TermSuggestionResult | null;
  applyToWebForm: (current: WebTermFormData, setFormData: (data: WebTermFormData) => void) => void;
}

export function useTermSuggestionAI(
  options: UseTermSuggestionAIOptions = {}
): UseTermSuggestionAIReturn {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TermSuggestionResult | null>(null);
  const { context = 'ecd', onError } = options;

  const suggest = useCallback(
    async (current: TermFormData): Promise<TermSuggestionResult | null> => {
      setError(null);
      setLastResult(null);
      setIsBusy(true);
      try {
        const result = await TermSuggestionAIService.suggest({
          academic_year: current.academic_year,
          term_number: current.term_number,
          existing_name: current.name || null,
          existing_description: current.description || null,
          context,
        });
        setLastResult(result);
        return result;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'AI suggestion failed';
        setError(message);
        onError?.(message);
        return null;
      } finally {
        setIsBusy(false);
      }
    },
    [context, onError]
  );

  const applyToWebForm = useCallback(
    (current: WebTermFormData, setFormData: (data: WebTermFormData) => void) => {
      const r = lastResult;
      if (!r) return;
      setFormData({
        ...current,
        name: r.suggested_name || current.name,
        description: r.suggested_description || current.description,
        start_date: r.suggested_start_date || current.start_date,
        end_date: r.suggested_end_date || current.end_date,
      });
    },
    [lastResult]
  );

  return {
    suggest,
    isBusy,
    error,
    lastResult,
    applyToWebForm,
  };
}
