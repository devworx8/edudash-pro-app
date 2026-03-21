/**
 * useHomeworkGenerator - Tool-enabled homework help for parents
 * 
 * Enhanced with agentic AI capabilities:
 * - Contextual child learning data
 * - AI-generated practice problems
 * - Suggested learning actions
 * - Study reminders
 */

import { useCallback, useState } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { incrementUsage, logUsageEvent } from '@/lib/ai/usage';
import { ParentToolRegistry } from '@/services/dash-ai/ParentToolRegistry';
import { logger } from '@/lib/logger';
import { parseHomeworkResponse } from './utils/homeworkHelpers';
import type { HomeworkPipelineMode } from '@/lib/homework/pipelineResolver';

export type HomeworkGenOptions = {
  question: string;
  subject: string;
  gradeLevel: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  context?: string;
  model?: string;
  studentId?: string;  // NEW: for context retrieval and tool usage
  pipelineMode?: HomeworkPipelineMode;
};

export interface HomeworkResult {
  text: string;
  toolsUsed?: Array<{ name: string; result: any }>;
  practiceProblems?: any[];
  suggestedActions?: Array<{ label: string; action: () => void }>;
  __fallbackUsed?: boolean;
}

export function useHomeworkGenerator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HomeworkResult | null>(null);

  const generate = useCallback(async (opts: HomeworkGenOptions): Promise<HomeworkResult> => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const client = assertSupabase();
      const toolRegistry = new ParentToolRegistry();
      const toolsUsed: Array<{ name: string; result: any }> = [];

      // Step 1: Get child context if studentId provided
      let childContext: any = null;
      if (opts.studentId) {
        try {
          const contextResult = await toolRegistry.execute('get_child_learning_context', {
            student_id: opts.studentId,
            include_homework: true,
            include_attendance: true,
            days_back: 30
          });

          if (contextResult.success) {
            childContext = contextResult.result.data;
            toolsUsed.push({ name: 'get_child_learning_context', result: contextResult.result });
          }
        } catch (contextError) {
          logger.warn('[useHomeworkGenerator] Failed to get child context, continuing without:', contextError);
        }
      }

      // Step 2: Call dedicated homework-helper Edge Function
      let data: any = null;

      const response = await client.functions.invoke('homework-helper', {
        body: {
          question: opts.question,
          subject: opts.subject || 'Mathematics',
          grade: opts.gradeLevel,
          helpMode: 'explain',
          language: 'en',
          model: opts.model || undefined,
          // Pass child context as conversation history hint if available
          conversationHistory: childContext ? [{
            role: 'user',
            content: `Learner context: ${JSON.stringify(childContext)}`
          }] : undefined,
        }
      });

      if (response.error) {
        throw response.error;
      }
      data = response.data;

      // Step 4: Extract text from response
      // EF returns { success, helpMode, helperResponse: { response, followUpPrompt, encouragement, didSolve }, meta }
      let responseText = '';
      if (data?.helperResponse) {
        const hr = data.helperResponse;
        responseText = String(hr.response || '');
        if (hr.followUpPrompt) {
          responseText += '\n\n' + String(hr.followUpPrompt);
        }
        if (hr.encouragement) {
          responseText += '\n\n' + String(hr.encouragement);
        }
      } else if (typeof data?.content === 'string') {
        responseText = data.content;
      } else if (data?.text) {
        responseText = data.text;
      }

      // Step 5: Extract structured data from response
      const parsedResult = parseHomeworkResponse(responseText, toolsUsed);

      // Track usage (don't block on this)
      incrementUsage('homework_help', 1).catch(() => {});
      logUsageEvent({
        feature: 'homework_help_agentic',
        model: data?.meta?.model || opts.model || 'claude-haiku-4-5-20251001',
        tokensIn: data?.meta?.inputTokens || 0,
        tokensOut: data?.meta?.outputTokens || 0,
        estCostCents: 0,
        timestamp: new Date().toISOString(),
        metadata: {
          tools_used: toolsUsed.length,
          student_id: opts.studentId || null,
        }
      }).catch(() => {});

      setResult(parsedResult);
      return parsedResult;

    } catch (e: any) {
      logger.error('[useHomeworkGenerator] Error:', e);
      setError(e?.message || 'Failed to generate help');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, result, generate } as const;
}
