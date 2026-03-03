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
import { buildSystemPrompt, parseHomeworkResponse } from './utils/homeworkHelpers';
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

      // Step 2: Build enhanced system prompt with context
      const systemPrompt = buildSystemPrompt(opts, childContext);

      // Step 3: Call AI - use simple mode first, fallback to tools if supported
      const messages = [{
        role: 'user',
        content: `${opts.question}\n\nSubject: ${opts.subject}\nGrade: ${opts.gradeLevel}\nDifficulty: ${opts.difficulty || 'medium'}`
      }];

      // Try simple request first (without tools for reliability)
      let data: any = null;
      let usedFallback = false;

      try {
        const response = await client.functions.invoke('ai-gateway', {
          body: {
            action: 'homework_help',
            messages,
            system: systemPrompt,
            model: opts.model || 'claude-3-haiku-20240307' // Use haiku by default for speed
          }
        });

        if (response.error) {
          throw response.error;
        }
        data = response.data;
      } catch (gatewayError) {
        logger.warn('[useHomeworkGenerator] AI gateway failed, trying ai-proxy fallback:', gatewayError);
        
        // Fallback to ai-proxy edge function with normalized payload contract.
        try {
          const fallbackResponse = await client.functions.invoke('ai-proxy', {
            body: {
              scope: 'parent',
              service_type: 'homework_help',
              payload: {
                model: opts.model || 'claude-3-haiku-20240307',
                messages: [
                  { role: 'system', content: systemPrompt },
                  ...messages,
                ],
                prompt: opts.question,
              },
              metadata: {
                subject: opts.subject,
                grade_level: opts.gradeLevel,
                student_id: opts.studentId || null,
                pipeline_mode: opts.pipelineMode || 'k12_exam_prep',
              },
            }
          });

          if (fallbackResponse.error) {
            throw fallbackResponse.error;
          }

          data = {
            content:
              fallbackResponse.data?.content?.[0]?.text ||
              fallbackResponse.data?.content ||
              fallbackResponse.data?.message?.content ||
              fallbackResponse.data?.text ||
              'No response received',
            usage: fallbackResponse.data?.usage,
            model: fallbackResponse.data?.model,
          };
          usedFallback = true;
        } catch (fallbackError) {
          logger.error('[useHomeworkGenerator] Both AI gateways failed:', fallbackError);
          throw new Error('AI service unavailable. Please try again later.');
        }
      }

      // Step 4: Extract text from response
      let responseText = '';
      if (typeof data.content === 'string') {
        responseText = data.content;
      } else if (Array.isArray(data.content)) {
        responseText = data.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('\n');
      } else if (data.text) {
        responseText = data.text;
      } else if (data.message?.content) {
        responseText = data.message.content;
      }

      // Step 5: Extract structured data from response
      const parsedResult = parseHomeworkResponse(responseText, toolsUsed);
      
      if (usedFallback) {
        parsedResult.__fallbackUsed = true;
      }

      // Track usage (don't block on this)
      incrementUsage('homework_help', 1).catch(() => {});
      logUsageEvent({
        feature: 'homework_help_agentic',
        model: data.model || opts.model || 'claude-3-haiku-20240307',
        tokensIn: data.usage?.input_tokens || 0,
        tokensOut: data.usage?.output_tokens || 0,
        estCostCents: data.cost || 0,
        timestamp: new Date().toISOString(),
        metadata: {
          tools_used: toolsUsed.length,
          student_id: opts.studentId || null,
          fallback_used: usedFallback
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
