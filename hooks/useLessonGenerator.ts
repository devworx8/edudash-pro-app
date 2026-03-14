import { logger } from '@/lib/logger';
import { useCallback, useState } from 'react';
import { toast } from '@/components/ui/ToastProvider';
import { track } from '@/lib/analytics';
import { assertSupabase } from '@/lib/supabase';
import { incrementUsage, logUsageEvent } from '@/lib/ai/usage';
import { formatAIGatewayErrorMessage, invokeAIGatewayWithRetry } from '@/lib/ai-gateway/invokeWithRetry';
import { DashAIAssistant } from '@/services/dash-ai/DashAICompat';

export type LessonGenOptions = {
  topic: string;
  subject: string;
  gradeLevel: number;
  duration?: number;
  learningObjectives: string[];
  language?: string;
  model?: string; // optional model override
};

export function useLessonGenerator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const generate = useCallback(async (opts: LessonGenOptions) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Call server function to proxy AI (never expose keys client-side)
      const payload = {
        action: 'lesson_generation',
        topic: opts.topic,
        subject: opts.subject,
        gradeLevel: opts.gradeLevel,
        duration: opts.duration ?? 45,
        objectives: opts.learningObjectives,
        language: opts.language || 'en',
        model: opts.model || 'claude-haiku-4-5-20251001',
      } as any;

      const { data, error } = await invokeAIGatewayWithRetry(payload, {
        retries: 1,
        retryDelayMs: 1200,
      });
      if (error) {
        throw new Error(formatAIGatewayErrorMessage(error, 'Failed to generate lesson.'));
      }

      if (data && (data as any).provider_error) {
        try { toast.warn('AI provider error – used safe fallback'); } catch { /* Intentional: non-fatal */ }
      }

      const lessonText: string = (data && data.content) || '';
      setResult({ text: lessonText, __fallbackUsed: !!(data && (data as any).provider_error) });

      // Track usage client-side (best-effort) in addition to server logs
      incrementUsage('lesson_generation', 1).catch(() => { /* Intentional: error handled */ });
      logUsageEvent({
        feature: 'lesson_generation',
        model: String(payload.model),
        tokensIn: (data && data.usage?.input_tokens) || 0,
        tokensOut: (data && data.usage?.output_tokens) || 0,
        estCostCents: (data && data.cost) || 0,
        timestamp: new Date().toISOString(),
      }).catch(() => { /* Intentional: error handled */ });

      track('edudash.ai.lesson_generated', {
        subject: opts.subject,
        gradeLevel: opts.gradeLevel,
        duration: opts.duration ?? 45,
      });

      return lessonText;
      } catch (e: any) {
      // Fallback: use Dash assistant to generate if edge function fails
      try {
        const { getAssistant } = await import('@/services/core/getAssistant');
        const dash: any = await getAssistant();
        await dash.initialize?.();
        if (!dash.getCurrentConversationId?.()) {
          await dash.startNewConversation?.('AI Lesson Generator');
        }
        const prompt = `Generate a ${opts.duration ?? 45} minute lesson plan for Grade ${opts.gradeLevel} in ${opts.subject} on the topic "${opts.topic}".
Learning objectives: ${(opts.learningObjectives || []).join('; ')}.
Provide a structured plan with objectives, warm-up, core activities, assessment ideas, and closure. Use clear bullet points.`;
        const response = await dash.sendMessage(prompt);
        const lessonText = response.content || '';
        
        // Automatically save the Dash-generated lesson to the database
        let saveResult = null;
        try {
          if (typeof (dash as any).saveLessonToDatabase === 'function') {
            saveResult = await (dash as any).saveLessonToDatabase(lessonText, {
              topic: opts.topic,
              subject: opts.subject,
              gradeLevel: opts.gradeLevel,
              duration: opts.duration ?? 45,
              objectives: opts.learningObjectives,
            });
            if (saveResult.success) {
              logger.info('[useLessonGenerator] Fallback lesson saved to database:', saveResult.lessonId);
              track('edudash.ai.lesson.fallback_saved_to_database', { lessonId: saveResult.lessonId });
            } else {
              logger.warn('[useLessonGenerator] Failed to save fallback lesson:', saveResult.error);
            }
          }
        } catch (saveError) {
          console.error('[useLessonGenerator] Error saving fallback lesson:', saveError);
        }
        
        setResult({ 
          text: lessonText, 
          __fallbackUsed: true,
          __savedToDatabase: saveResult?.success || false,
          __lessonId: saveResult?.lessonId || null
        });
        incrementUsage('lesson_generation', 1).catch(() => { /* Intentional: error handled */ });
        logUsageEvent({ feature: 'lesson_generation', model: 'dash-fallback', tokensIn: 0, tokensOut: 0, estCostCents: 0, timestamp: new Date().toISOString() }).catch(() => { /* Intentional: error handled */ });
        track('edudash.ai.lesson.generate_fallback_dash', { reason: e?.message || 'unknown', savedToDatabase: saveResult?.success });
        return lessonText;
      } catch {
        setError(e?.message || 'Failed to generate lesson');
        throw e;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, result, generate } as const;
}
