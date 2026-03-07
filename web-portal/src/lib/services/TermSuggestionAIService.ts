/**
 * Term Suggestion AI Service (web) — ECD-aware, semester-aware suggestions for Create/Edit Term.
 * Part of the interconnected planning system: terms → lessons, plans, grading, activities.
 */

import { createClient } from '@/lib/supabase/client';

/** Default 4-term South African academic date ranges (approximate) */
function getDefaultTermRange(
  academicYear: number,
  termNumber: number
): { startDate: string; endDate: string } {
  const ranges: Array<{ start: string; end: string }> = [
    { start: `${academicYear}-01-15`, end: `${academicYear}-03-31` },
    { start: `${academicYear}-04-01`, end: `${academicYear}-06-30` },
    { start: `${academicYear}-07-01`, end: `${academicYear}-09-30` },
    { start: `${academicYear}-10-01`, end: `${academicYear}-12-10` },
  ];
  const idx = Math.max(0, Math.min(termNumber - 1, 3));
  return {
    startDate: ranges[idx]!.start,
    endDate: ranges[idx]!.end,
  };
}

function coerceString(value: unknown): string {
  return String(value ?? '').trim();
}

export interface TermSuggestionInput {
  academic_year: number;
  term_number: number;
  existing_name?: string | null;
  existing_description?: string | null;
  context?: 'ecd' | 'preschool' | 'school' | string;
}

export interface TermSuggestionResult {
  suggested_name: string;
  suggested_description: string;
  suggested_start_date: string;
  suggested_end_date: string;
  tips?: string;
}

function extractContentFromAIResponse(data: unknown): string {
  if (typeof data === 'string') return data;
  const obj = data as Record<string, unknown> | null;
  if (!obj || typeof obj !== 'object') return '';
  const candidates = [
    obj.content,
    obj.text,
    obj.response,
    obj.message,
    obj.output,
    (obj as any).choices?.[0]?.message?.content,
    (obj as any).result?.content,
    (obj as any).data?.content,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  try {
    const json = JSON.stringify(obj);
    return json === '{}' ? '' : json;
  } catch {
    return '';
  }
}

function tryParseJson(content: string): TermSuggestionResult | null {
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const name = coerceString(parsed.suggested_name);
    const description = coerceString(parsed.suggested_description);
    const start = coerceString(parsed.suggested_start_date);
    const end = coerceString(parsed.suggested_end_date);
    if (!name && !description && !start && !end) return null;
    return {
      suggested_name: name || `Term ${parsed.term_number ?? 1}`,
      suggested_description: description,
      suggested_start_date: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : getDefaultTermRange(
        Number(parsed.academic_year) || new Date().getFullYear(),
        Number(parsed.term_number) || 1
      ).startDate,
      suggested_end_date: /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : getDefaultTermRange(
        Number(parsed.academic_year) || new Date().getFullYear(),
        Number(parsed.term_number) || 1
      ).endDate,
      tips: typeof parsed.tips === 'string' ? parsed.tips.trim() : undefined,
    };
  } catch {
    return null;
  }
}

export class TermSuggestionAIService {
  static async suggest(params: TermSuggestionInput): Promise<TermSuggestionResult> {
    const year = params.academic_year || new Date().getFullYear();
    const termNum = params.term_number || 1;
    const defaultRange = getDefaultTermRange(year, termNum);
    const context = (params.context || 'ecd').toLowerCase();
    const isEcd = context === 'ecd' || context === 'preschool';

    const prompt = [
      'You are Dash, an ECD-aware educational AI. You help principals set up academic terms that form a unified system: terms anchor lessons, weekly plans, grading periods, and interactive activities.',
      '',
      'OUTPUT FORMAT: Return ONLY valid JSON (no markdown, no extra text) with these exact keys:',
      '- suggested_name (string): short term name, e.g. "Term 1", "First Semester", "Foundation Phase Term 1"',
      '- suggested_description (string): 1–3 sentences. For ECD/preschool: mention play-based learning, development areas, typical focus. For school: mention curriculum phase and what this term typically covers.',
      '- suggested_start_date (string): YYYY-MM-DD only',
      '- suggested_end_date (string): YYYY-MM-DD only',
      '- tips (string, optional): one short sentence on how this term connects to lessons, plans, grading, or activities.',
      '',
      'ECD / SEMESTER AWARENESS:',
      '- South African academic year usually has 4 terms. Term 1 ~ Jan–Mar, Term 2 ~ Apr–Jun, Term 3 ~ Jul–Sep, Term 4 ~ Oct–Dec.',
      '- For ECD/preschool: descriptions should reference development areas (e.g. social-emotional, language, numeracy, life skills), play-based learning, and age-appropriate outcomes.',
      '- Terms are the backbone: teachers create weekly plans and lessons per term; grading and reports align to terms; interactive activities are scheduled within term dates.',
      '',
      'CONTEXT:',
      `- Academic year: ${year}`,
      `- Term number: ${termNum}`,
      `- Context: ${context}`,
      `- Suggested date range (use or adjust slightly): ${defaultRange.startDate} to ${defaultRange.endDate}`,
      `- Existing name: ${coerceString(params.existing_name) || '(none)'}`,
      `- Existing description: ${coerceString(params.existing_description) || '(none)'}`,
      '',
      'TASK:',
      '1) Suggest a clear term name and an ECD-appropriate (or school-appropriate) description.',
      '2) Use the suggested date range or adjust by a few days if needed; always return YYYY-MM-DD.',
      '3) If existing name/description provided, refine and improve rather than replace entirely.',
      '4) Add a brief "tips" line on how this term fits into the bigger picture (lessons, plans, grading, activities).',
    ].join('\n');

    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: {
        scope: 'principal',
        service_type: 'dash_conversation',
        payload: { prompt },
        stream: false,
        enable_tools: false,
      },
    });

    if (error) {
      throw new Error(error.message || 'AI suggestion failed');
    }

    const direct = data as TermSuggestionResult | undefined;
    if (
      direct &&
      typeof direct.suggested_name === 'string' &&
      (typeof direct.suggested_start_date === 'string' || typeof direct.suggested_description === 'string')
    ) {
      return {
        suggested_name: coerceString(direct.suggested_name) || `Term ${termNum}`,
        suggested_description: coerceString(direct.suggested_description),
        suggested_start_date: /^\d{4}-\d{2}-\d{2}$/.test(String(direct.suggested_start_date ?? ''))
          ? String(direct.suggested_start_date)
          : defaultRange.startDate,
        suggested_end_date: /^\d{4}-\d{2}-\d{2}$/.test(String(direct.suggested_end_date ?? ''))
          ? String(direct.suggested_end_date)
          : defaultRange.endDate,
        tips: typeof direct.tips === 'string' ? direct.tips.trim() : undefined,
      };
    }

    const content = extractContentFromAIResponse(data);
    if (!content.trim()) {
      throw new Error('AI returned an empty response. Try again.');
    }

    const parsed = tryParseJson(content);
    if (parsed) return parsed;

    return {
      suggested_name: `Term ${termNum}`,
      suggested_description: isEcd
        ? `Foundation phase term ${termNum}. Plan weekly themes, play-based activities, and development goals for this period.`
        : `Term ${termNum} — plan lessons, assessments, and activities within this period.`,
      suggested_start_date: defaultRange.startDate,
      suggested_end_date: defaultRange.endDate,
      tips: 'This term will anchor your weekly plans, lessons, and grading. Create it first, then add plans and activities.',
    };
  }
}
