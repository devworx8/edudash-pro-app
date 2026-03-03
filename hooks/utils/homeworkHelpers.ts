/**
 * Homework Generator Helper Functions
 * 
 * Extracted from useHomeworkGenerator to maintain file size limits.
 */

import { HomeworkGenOptions, HomeworkResult } from '../useHomeworkGenerator';
import { logger } from '@/lib/logger';

/**
 * Build enhanced system prompt with child context
 */
export function buildSystemPrompt(opts: HomeworkGenOptions, childContext: any): string {
  const isPreschoolPipeline = opts.pipelineMode === 'preschool_activity_pack' || opts.gradeLevel <= 0;

  let prompt = `You are Dash, an AI learning assistant helping a parent support their child's education.

CONTEXT:
- Child's grade level: ${opts.gradeLevel}
- Subject: ${opts.subject}
- Difficulty level: ${opts.difficulty || 'medium'}`;

  if (childContext) {
    prompt += `
- Child: ${childContext.student?.first_name} ${childContext.student?.last_name}
- Class: ${childContext.student?.classes?.name || 'Unknown'}`;

    if (childContext.pending_homework?.length > 0) {
      prompt += `\n- Current pending homework: ${childContext.pending_homework.length} assignments`;
    }

    if (childContext.attendance_summary) {
      const rate = Math.round((childContext.attendance_summary.present_count / childContext.attendance_summary.total_days) * 100);
      prompt += `\n- Recent attendance: ${rate}% (last 30 days)`;
    }
  }

  if (isPreschoolPipeline) {
    prompt += `

PIPELINE MODE:
- Preschool activity pack mode (ages 1-6)

YOUR ROLE:
1. Convert worksheet/homework content into short, practical home activities (5-15 minutes each)
2. Use simple parent instructions and clear materials list
3. Include safe movement, language, and early numeracy/literacy opportunities
4. Provide gentle observation checkpoints (completed / needs support / not attempted)
5. Keep tone warm, practical, and non-judgmental

OUTPUT FORMAT:
- Activity title
- Goal
- Materials
- Step-by-step activity (numbered)
- Parent talk prompts
- Safety note
- Quick teacher feedback checklist`;
    return prompt;
  }

  prompt += `

YOUR ROLE:
1. Provide clear, age-appropriate explanations
2. Break down complex concepts into simple steps
3. Use examples relevant to Grade ${opts.gradeLevel}
4. Suggest practice problems when helpful
5. Encourage parent-child learning together

TOOLS AVAILABLE:
- Generate practice problems
- Create study reminders
- Navigate to relevant resources

Respond in a friendly, supportive tone. Help the parent understand so they can explain to their child.`;

  return prompt;
}

/**
 * Parse AI response for structured data
 */
export function parseHomeworkResponse(content: string, toolsUsed: any[]): HomeworkResult {
  const result: HomeworkResult = {
    text: content,
    toolsUsed: toolsUsed.map(t => ({ name: t.name, result: t.result }))
  };

  // Extract practice problems if generated
  const practiceProblems = toolsUsed.find(t => t.name === 'generate_practice_problems');
  if (practiceProblems?.result?.data?.problems) {
    result.practiceProblems = practiceProblems.result.data.problems;
  }

  // Build suggested actions based on context
  result.suggestedActions = [];

  if (result.practiceProblems && result.practiceProblems.length > 0) {
    result.suggestedActions.push({
      label: 'Review Practice Problems',
      action: () => logger.info('User tapped: Review Practice Problems')
    });
  }

  return result;
}
