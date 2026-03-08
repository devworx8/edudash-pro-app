/**
 * useAILessonGeneration - Custom hook for AI lesson generation logic
 * @module hooks/useAILessonGeneration
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';
import { isAIEnabled } from '@/lib/ai/aiConfig';
import { track } from '@/lib/analytics';
import { getCombinedUsage, incrementUsage, logUsageEvent } from '@/lib/ai/usage';
import { canUseFeature, getQuotaStatus } from '@/lib/ai/limits';
import { formatAIGatewayErrorMessage, invokeAIGatewayWithRetry } from '@/lib/ai-gateway/invokeWithRetry';
import { toast } from '@/components/ui/ToastProvider';

interface GeneratedLesson {
  title: string;
  description: string;
  content: string | { sections: unknown[] }; // Can be markdown string or structured object
  activities: unknown[];
}

interface UsageState {
  lesson_generation: number;
  grading_assistance: number;
  homework_help: number;
}

interface QuotaState {
  used: number;
  limit: number;
  remaining: number;
}

interface LessonParams {
  topic: string;
  subject: string;
  gradeLevel: string;
  duration: string;
  objectives: string;
  language: string;
  selectedModel: string | null;
  planningContext?: string | null;
}

interface UseAILessonGenerationReturn {
  generated: GeneratedLesson | null;
  setGenerated: React.Dispatch<React.SetStateAction<GeneratedLesson | null>>;
  pending: boolean;
  progress: number;
  progressPhase: 'idle' | 'init' | 'quota_check' | 'request' | 'parse' | 'complete';
  progressMessage: string;
  errorMsg: string | null;
  lastPayload: Record<string, unknown> | null;
  usage: UsageState;
  quotaStatus: QuotaState | null;
  isQuotaExhausted: boolean;
  onGenerate: (params: LessonParams, payloadOverride?: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  refreshUsage: () => Promise<void>;
}

export function useAILessonGeneration(): UseAILessonGenerationReturn {
  const [generated, setGenerated] = useState<GeneratedLesson | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState<'idle' | 'init' | 'quota_check' | 'request' | 'parse' | 'complete'>('idle');
  const [progressMessage, setProgressMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState<Record<string, unknown> | null>(null);
  const [usage, setUsage] = useState<UsageState>({ lesson_generation: 0, grading_assistance: 0, homework_help: 0 });
  const [quotaStatus, setQuotaStatus] = useState<QuotaState | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flags = getFeatureFlagsSync();
  const AI_ENABLED = isAIEnabled();
  const isQuotaExhausted = Boolean(quotaStatus && quotaStatus.limit !== -1 && quotaStatus.used >= quotaStatus.limit);

  // Load initial usage
  useEffect(() => {
    (async () => {
      setUsage(await getCombinedUsage());
      try {
        const s = await getQuotaStatus('lesson_generation');
        setQuotaStatus(s);
      } catch (err) {
        if (__DEV__) console.warn('[useAILessonGeneration] Failed to load quota:', err);
      }
    })();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortController) abortController.abort();
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [abortController]);

  const clearProgressTicker = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const startProgressTicker = useCallback((minIncrement: number, maxIncrement: number, intervalMs: number) => {
    clearProgressTicker();
    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return Math.min(prev + (Math.random() * (maxIncrement - minIncrement) + minIncrement), 90);
      });
    }, intervalMs);
  }, [clearProgressTicker]);

  const refreshUsage = useCallback(async () => {
    setUsage(await getCombinedUsage());
    try {
      const s = await getQuotaStatus('lesson_generation');
      setQuotaStatus(s);
    } catch { /* non-fatal */ }
  }, []);

  const onCancel = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    clearProgressTicker();
    setPending(false);
    setProgress(0);
    setProgressPhase('idle');
    setProgressMessage('');
    setErrorMsg(null);
    toast.info('Generation cancelled');
    track('edudash.ai.lesson.generate_cancelled', {});
  }, [abortController, clearProgressTicker]);

  const invokeWithTimeout = useCallback(async <T,>(p: Promise<T>, ms = 30000): Promise<T> => {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000}s`)), ms)
      ),
    ]);
  }, []);

  const onGenerate = useCallback(async (params: LessonParams, payloadOverride?: Record<string, unknown>) => {
    const {
      topic,
      subject,
      gradeLevel,
      duration,
      objectives,
      language,
      selectedModel,
      planningContext,
    } = params;

    try {
      const controller = new AbortController();
      setAbortController(controller);
      setPending(true);
      setProgress(0);
      setProgressPhase('init');
      setProgressMessage('Initializing...');

      startProgressTicker(2, 6, 600);

      if (!AI_ENABLED || flags.ai_lesson_generation === false) {
        toast.warn('AI Lesson Generator is disabled.');
        return;
      }

      setProgress(10);
      setProgressPhase('quota_check');
      setProgressMessage('Checking quota...');
      setErrorMsg(null);

      let gate: { allowed: boolean } | null = null;
      try {
        gate = await invokeWithTimeout(canUseFeature('lesson_generation', 1), 10000);
      } catch {
        // Fail CLOSED on timeout — do not bypass quota on network issues
        toast.error('Could not verify usage quota. Please check your connection and try again.');
        return;
      }

      if (!gate?.allowed) {
        const status = await getQuotaStatus('lesson_generation');
        Alert.alert('Monthly limit reached', `You have used ${status.used} of ${status.limit} generations.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'See plans', onPress: () => navigateToUpgrade({ source: 'lesson_generation_alert' }) },
        ]);
        return;
      }

      setProgress(20);
      setProgressPhase('request');
      setProgressMessage('Preparing request...');
      track('edudash.ai.lesson.generate_started', {});

      const objectiveList = (objectives || '').split(';').map(s => s.trim()).filter(Boolean);
      const normalizedDuration = Number(duration) || 45;
      const outputContract = [
        'Return ONLY valid JSON. Do not return markdown, prose, or code fences.',
        'Schema:',
        '{',
        '  "lessonPlan": {',
        '    "title": "string",',
        '    "summary": "string",',
        '    "objectives": ["string"],',
        '    "materials": ["string"],',
        '    "steps": [',
        '      {',
        '        "title": "string",',
        '        "minutes": 10,',
        '        "objective": "string",',
        '        "instructions": ["string"],',
        '        "teacherPrompt": "string",',
        '        "example": "string"',
        '      }',
        '    ],',
        '    "assessment": ["string"],',
        '    "differentiation": { "support": "string", "extension": "string" },',
        '    "closure": "string",',
        '    "durationMinutes": 45',
        '  }',
        '}',
      ].join('\n');
      const lessonPrompt = [
        `Generate a ${normalizedDuration}-minute CAPS-aligned lesson plan.`,
        `Subject: ${subject || 'General Studies'}.`,
        `Topic: ${topic || 'Lesson Topic'}.`,
        `Grade level: ${Number(gradeLevel) || 3}.`,
        `Learning objectives: ${objectiveList.length ? objectiveList.join('; ') : 'Derive clear objectives from the topic.'}.`,
        'Include warm-up, guided activity, independent practice, assessment, differentiation, closure, and worked examples.',
        outputContract,
        planningContext ? `Planning Alignment Context:\\n${planningContext}` : '',
      ]
        .filter(Boolean)
        .join('\\n');

      const payload = payloadOverride || {
        action: 'lesson_generation',
        prompt: lessonPrompt,
        topic: topic || 'Lesson Topic',
        subject: subject || 'General Studies',
        gradeLevel: Number(gradeLevel) || 3,
        duration: normalizedDuration,
        objectives: objectiveList,
        language: language || 'en',
        model: selectedModel || process.env.EXPO_PUBLIC_ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
        context: planningContext || undefined,
      };
      setLastPayload(payload);

      setProgress(30);
      setProgressMessage('Connecting to AI...');

      startProgressTicker(4, 8, 500);

      if (controller.signal.aborted) throw new Error('Generation cancelled');

      const invokePromise = invokeAIGatewayWithRetry(payload, {
        retries: 1,
        retryDelayMs: 1200,
      });
      const { data, error } = await invokeWithTimeout(invokePromise, 30000);

      clearProgressTicker();
      setProgress(95);
      setProgressPhase('parse');
      setProgressMessage('Processing results...');

      if (error) {
        throw new Error(formatAIGatewayErrorMessage(error, 'Failed to generate lesson.'));
      }

      const lessonText = data?.content || '';
      setProgress(100);
      setProgressPhase('complete');
      setProgressMessage('Complete!');

      // Store the AI-generated content in the 'content' field for proper display
      // The 'description' field is used for a short summary
      setGenerated({
        title: `${subject}: ${topic}`,
        description: lessonText?.substring(0, 200) + (lessonText?.length > 200 ? '...' : '') || 'AI-generated lesson plan',
        content: lessonText, // Store the full lesson text as content
        activities: [],
      });

      try {
        await incrementUsage('lesson_generation', 1);
        await logUsageEvent({
          feature: 'lesson_generation',
          model: String(payload.model),
          tokensIn: data?.usage?.input_tokens || 0,
          tokensOut: data?.usage?.output_tokens || 0,
          estCostCents: data?.cost || 0,
          timestamp: new Date().toISOString(),
        });
      } catch (usageError) {
        if (__DEV__) console.error('[useAILessonGeneration] Failed to track usage:', usageError);
      }

      await refreshUsage();

      lessonText ? toast.success('Lesson generated!') : toast.warn('No content returned.');
      track('edudash.ai.lesson.generate_completed', {});
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Please try again';
      track('edudash.ai.lesson.generate_failed', { error: message });
      setErrorMsg(message);
      toast.error(`Generation failed: ${message}`);
    } finally {
      setAbortController(null);
      clearProgressTicker();
      setPending(false);
      setProgress(0);
      setProgressPhase('idle');
      setProgressMessage('');
    }
  }, [AI_ENABLED, clearProgressTicker, flags, invokeWithTimeout, refreshUsage, startProgressTicker]);

  return {
    generated,
    setGenerated,
    pending,
    progress,
    progressPhase,
    progressMessage,
    errorMsg,
    lastPayload,
    usage,
    quotaStatus,
    isQuotaExhausted,
    onGenerate,
    onCancel,
    refreshUsage,
  };
}

export default useAILessonGeneration;
