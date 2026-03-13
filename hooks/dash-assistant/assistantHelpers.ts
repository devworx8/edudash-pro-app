import type { DashAttachment, DashMessage } from '@/services/dash-ai/types';
import type { LearnerContext } from '@/lib/dash-ai/learnerContext';
import { formatFileSize } from '@/services/AttachmentService';
import { normalizeLanguageCode } from '@/lib/ai/dashSettings';
import { getCurrentLanguage } from '@/lib/i18n';
import {
  resolveAgeBand,
  formatGradeLabel,
  isPreschoolContext,
} from '@/lib/dash-ai/learnerContext';
import { buildIntelligentSystemPrompt, buildAttachmentContext } from '@/lib/dash-ai/promptBuilder';
export { prepareAttachmentsForAI } from '@/hooks/dash-assistant/attachmentPreparation';

export const wantsLessonGenerator = (text: string, assistantText?: string): boolean => {
  const rx = /(create|plan|generate)\s+(a\s+)?lesson(\s+plan)?|lesson\s+plan|teach\s+.*(about|on)/i;
  if (rx.test(text)) return true;
  if (assistantText && rx.test(assistantText)) return true;
  return false;
};

/** Filters out JSON-like, bracket-tag, or internal strings that should not be shown as follow-up chips. */
export const isValidFollowUp = (s: string): boolean => {
  if (!s || s.length < 6) return false;
  const lower = s.toLowerCase().trim();
  // Exclude JSON keys, object fragments, or internal structure
  if (/^["']?\s*(type|prompt|word|hint|language|hide_word_reveal)\s*["']?\s*:/.test(lower)) return false;
  if (/^["']?\s*[\{\[]\s*["']?/.test(lower) || /["']?\s*[\}\]]\s*["']?$/.test(lower)) return false;
  if (/\{\s*"type"\s*:\s*"(spelling_practice|column_addition|quiz_question)"/.test(lower)) return false;
  if (/^"?prompt"?$/i.test(lower) || /^"?prompt"\s*:\s*"?/i.test(lower)) return false;
  // Exclude bracket-wrapped tags like [WHITEBOARD], [/WHITEBOARD], [TOOL], etc.
  if (/^\[\/?\w+\]$/.test(s.trim())) return false;
  // Exclude strings that are mostly bracket tags
  if (/\[\/?\w+\]/.test(s) && s.replace(/\[\/?\w+\]/g, '').trim().length < 6) return false;
  // Exclude markdown code fences or raw code blocks
  if (/^```/.test(s.trim()) || /```$/.test(s.trim())) return false;
  // Exclude lines that look like tool invocations or metadata
  if (/^(tool_use|tool_result|function_call|<tool|<\/tool)/i.test(lower)) return false;
  return true;
};

export const extractFollowUps = (text: string): string[] => {
  try {
    const raw = String(text || '').trim();
    if (!raw) return [];
    const cleaned = (value: string) =>
      value
        .replace(/^[\s"'`]+/, '')
        .replace(/[\s"'`]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
    const dedupe = (items: string[]) =>
      Array.from(new Set(items.map(cleaned).filter(isValidFollowUp))).slice(0, 6);

    const jsonArrayMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonArrayMatch?.[0]) {
      try {
        const parsed = JSON.parse(jsonArrayMatch[0]);
        if (Array.isArray(parsed)) {
          const mapped = parsed.map((entry) => String(entry || '')).filter(isValidFollowUp);
          const normalized = dedupe(mapped);
          if (normalized.length > 0) return normalized;
        }
      } catch {
        // Continue with line-based parsing.
      }
    }

    const lines = raw.split(/\n+/);
    const results: string[] = [];
    for (const lineRaw of lines) {
      const line = String(lineRaw || '').trim();
      if (!line) continue;

      const userMatch = line.match(/^\s*User:\s*(.+)$/i);
      if (userMatch?.[1]) {
        const v = cleaned(userMatch[1]);
        if (isValidFollowUp(v)) results.push(v);
        continue;
      }

      const numberedMatch = line.match(/^\s*\d{1,2}[\)\.\-:]\s+(.+)$/);
      if (numberedMatch?.[1]) {
        const v = cleaned(numberedMatch[1]);
        if (isValidFollowUp(v)) results.push(v);
        continue;
      }

      const bulletMatch = line.match(/^\s*[-*•]\s+(.+)$/);
      if (bulletMatch?.[1]) {
        const v = cleaned(bulletMatch[1]);
        if (isValidFollowUp(v)) results.push(v);
        continue;
      }

      // NOTE: bare '?'-line scraping deliberately removed — it captured Dash's
      // own conversational questions (e.g. "Hey Olivia, what can I help with?")
      // and showed them as chips the user is supposed to click, which felt like
      // talking to themselves in the 3rd person. Only structured list formats
      // (numbered, bullets, User:) should become suggestion chips.
    }
    return dedupe(results);
  } catch {
    return [];
  }
};

export const buildDashContextOverride = (params: {
  learner?: LearnerContext | null;
  messages: DashMessage[];
}): string => {
  const learner = params.learner || null;
  const gradeLabel = formatGradeLabel(learner?.grade);
  const ageYears = learner?.ageYears ?? null;
  const ageBand = learner?.ageBand || resolveAgeBand(ageYears, gradeLabel);
  const schoolType = learner?.schoolType || null;
  const preschoolMode = isPreschoolContext({
    ...learner,
    ageBand,
  });
  const normalizedSchoolType = String(schoolType || '').toLowerCase();
  const gradeNumberMatch = String(gradeLabel || '').match(/(\d{1,2})/);
  const inferredGradeNumber = gradeNumberMatch ? Number(gradeNumberMatch[1]) : null;
  const looksLikeK12Grade = typeof inferredGradeNumber === 'number' && Number.isFinite(inferredGradeNumber) && inferredGradeNumber >= 1;
  const isK12Context = normalizedSchoolType.includes('k12') || normalizedSchoolType.includes('primary') || normalizedSchoolType.includes('secondary') || (!!looksLikeK12Grade && !preschoolMode);
  const isParentRole = String(learner?.role || '').toLowerCase() === 'parent';

  const preschoolRules = preschoolMode
    ? [
        'PRESCHOOL TEACHING RULES (always on for preschool):',
        '- Always use play-based, game-like activities.',
        '- Focus on letter recognition, phonics, number recognition, counting, shapes, colors, and fine-motor skills.',
        '- Keep instructions short (3-6 steps) and hands-on.',
        '- Include a quick interactive check (e.g., "Point to the letter A" or "Count to 5 with me").',
        '- Avoid formal tests or exam language unless a teacher explicitly asks.',
      ].join('\n')
    : null;

  const k12ParentActivityRules = isK12Context && isParentRole
    ? [
        'K-12 HOME ACTIVITY QUALITY BAR (for parent support):',
        '- When a parent asks for activities, provide a clear CAPS-aligned activity pack.',
        '- Match the learner grade and subject explicitly (if known).',
        '- Include repetition across activities to reinforce mastery, especially for foundational skills.',
        '- Prefer practical at-home tasks with everyday materials before digital-only suggestions.',
        '- For each activity include: Objective, Duration, Materials, Steps, and a quick Success Check.',
        '- For slower learners, keep each task to one concept at a time and avoid multi-step overload.',
        '- Use a confidence ladder: easy warm-up -> guided practice -> independent try.',
        '- Provide remediation loops: if incorrect, retry with simpler hint, then worked example, then retry.',
        '- Keep response chunks short and clear (2-4 lines per step) with supportive language.',
        '- Include 1 remediation option and 1 stretch/challenge option for differentiation.',
        '- Keep parent instructions actionable so they can run the activity without teacher support.',
      ].join('\n')
    : null;

  const generalRules = [
    'DASH CONVERSATION STYLE:',
    '- Be warm, friendly, and conversational - like a helpful learning companion',
    '- Celebrate progress: "Great job!", "You\'re getting it!", "That\'s a smart connection!"',
    '- Be proactive: Suggest next steps, offer insights, make connections',
    '- Balance teaching with conversation - not every interaction needs to be a lesson',
    '',
    'RESPONSE STRUCTURE (for homework/learning questions):',
    '1. When user shares an image/document: ANALYZE THE ACTUAL CONTENT',
    '   - Describe what is clearly visible: "This looks like [worksheet/notes/page]..."',
    '   - Read legible text as accurately as possible',
    '   - Mark uncertain text with [?] and keep it explicit',
    '   - Be SPECIFIC to content shown, not generic advice',
    '',
    '2. FORBIDDEN generic responses:',
    '   ❌ "Identify the problem, break it down, check your work"',
    '   ❌ "Organize approach, apply concept, reflect"',
    '   ✅ CORRECT: "This is Activity 7.1 about Multiple Intelligences..."',
    '',
    '3. Structure learning responses as:',
    '   **1. What this is about** (brief overview)',
    '   **2. Key concepts** (with examples)',
    '   **3. Step-by-step solution/explanation**',
    '   **4. Check understanding** (ONE diagnostic question)',
    '',
    '3. Formatting rules:',
    '- Use **bold** for headings',
    '- Use bullet points (•) for lists',
    '- Use numbered steps (1., 2., 3.) for sequences',
    '- Keep paragraphs short (2-3 sentences max)',
    '- Use line breaks between sections',
    '- When a visual helps, output a renderable visual block (NOT placeholders):',
    '  • Prefer Mermaid blocks: ```mermaid ... ```',
    '  • For numeric comparisons, provide a markdown table or chart-friendly list',
    '  • NEVER output placeholders like [DIAGRAM], [CHART], or [GRAPH]',
    '- For step-by-step column ADDITION visuals only, output:',
    '  • ```column {"type":"column_addition","question":"...","addends":[975,155]} ```',
    '- NEVER use column blocks for division problems. If the question asks to divide, share equally, or find "how many in each group", use a quiz block or written explanation instead — addends are for addition only.',
    '- For interactive spelling practice, output:',
    '  • ```spelling {"type":"spelling_practice","word":"because","prompt":"Spell the hidden word","hint":"Use it in a sentence","language":"en","hide_word_reveal":true} ```',
    '- In spelling tasks NEVER reveal the answer word in normal text, prompt text, or hint text before the learner solves it.',
    '- For Afrikaans tasks, use `language:"af"` in spelling JSON and keep examples/instructions in Afrikaans.',
    '- For K-12 maths learners who struggle: use one problem at a time, simple language, worked examples, and progressive hints.',
    '- Prefer `column` interactive blocks for arithmetic over Mermaid diagrams unless user explicitly asks for a diagram.',
    '',
    '4. Uncertainty handling:',
    '   - If visibility is poor, say exactly which words/lines are unclear',
    '   - Ask ONE targeted clarification question only when needed',
    '   - Do not invent exact text when the image is ambiguous',
  ].join('\n');

  const lines = [
    'DASH CONTEXT PACK (do not repeat verbatim):',
    learner?.learnerName ? `Learner: ${learner.learnerName}.` : null,
    gradeLabel ? `Grade: ${gradeLabel}.` : null,
    typeof ageYears === 'number' ? `Age: ${ageYears}.` : null,
    ageBand ? `Age band: ${ageBand}.` : null,
    schoolType ? `School type: ${schoolType}.` : null,
    learner?.role ? `User role: ${learner.role}.` : null,
    generalRules,
    preschoolRules,
    k12ParentActivityRules,
  ].filter(Boolean);

  const messageHistory = params.messages.map(msg => ({
    role: msg.type === 'task_result' ? 'assistant' : msg.type,
    content: msg.content || '',
  }));
  const hour = new Date().getHours();
  const timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' =
    hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

  const enrichedLearner: LearnerContext = {
    ...learner,
    ageBand: ageBand || undefined,
    ageYears: ageYears || undefined,
    grade: gradeLabel || undefined,
    schoolType: schoolType || undefined,
  };

  const intelligentPrompt = buildIntelligentSystemPrompt({
    learner: enrichedLearner,
    messageHistory,
    tutorMode: true,
    sessionStart: params.messages.length === 0,
    timeOfDay,
  });

  return `${lines.join('\n')}\n\n${intelligentPrompt}`;
};

export const buildAttachmentContextInternal = (attachments: DashAttachment[]) => {
  if (!attachments || attachments.length === 0) return null;

  const hasImages = attachments.some(a => a.kind === 'image');
  const hasDocuments = attachments.some(a => a.kind === 'document' || a.kind === 'pdf');

  const baseContext = buildAttachmentContext(attachments.length, hasImages, hasDocuments);

  const lines = attachments.map((attachment) => {
    const label = attachment.name || 'Attachment';
    const kind = attachment.kind || 'file';
    const size = typeof attachment.size === 'number' ? formatFileSize(attachment.size) : null;
    return `- ${label} (${kind}${size ? `, ${size}` : ''})`;
  });

  return `${baseContext}\n\nATTACHMENT LIST:\n${lines.join('\n')}`;
};

export const resolveVoiceLocale = (lang?: string | null): 'en-ZA' | 'af-ZA' | 'zu-ZA' => {
  const base = normalizeLanguageCode(lang || getCurrentLanguage?.());
  if (base === 'af') return 'af-ZA';
  if (base === 'zu') return 'zu-ZA';
  return 'en-ZA';
};

export const sanitizeTutorUserContent = (content?: string | null) => {
  if (!content) return { content: '', sanitized: false };
  const lower = content.toLowerCase();
  const isTutorPrompt = /you are dash, an interactive tutor|tutor_payload|return only json|tutor mode override/i.test(lower);
  if (!isTutorPrompt) return { content, sanitized: false };

  const requestMatch = content.match(/Learner request:\s*([^\n]+)/i);
  if (requestMatch?.[1]) {
    return { content: requestMatch[1].trim(), sanitized: true };
  }
  const answerMatch = content.match(/Learner answer:\s*([^\n]+)/i);
  if (answerMatch?.[1]) {
    return { content: answerMatch[1].trim(), sanitized: true };
  }
  const questionMatch = content.match(/Question:\s*([^\n]+)/i);
  if (questionMatch?.[1]) {
    return { content: questionMatch[1].trim(), sanitized: true };
  }
  return { content: 'Tutor request', sanitized: true };
};
