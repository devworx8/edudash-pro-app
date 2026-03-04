const SUPPORTED_QUESTION_TYPES = new Set([
  'multiple_choice',
  'true_false',
  'short_answer',
  'fill_in_blank',
]);

export function parseGradeNumber(grade: string): number {
  const normalized = String(grade || '').toLowerCase().trim();
  if (!normalized) return 6;
  if (normalized === 'grade_r' || normalized === 'grader' || normalized === 'r') return 0;
  const match = normalized.match(/grade[_\s-]*(\d{1,2})/);
  if (match?.[1]) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value;
  }
  return 6;
}

export function getQuestionCountPolicy(grade: string, examType: string): { min: number; max: number } {
  const level = parseGradeNumber(grade);
  const type = String(examType || 'practice_test').toLowerCase();

  if (type === 'practice_test') {
    if (level >= 10) return { min: 28, max: 40 };
    if (level >= 7) return { min: 22, max: 30 };
    return { min: 20, max: 24 };
  }

  if (type === 'flashcards') {
    if (level >= 10) return { min: 20, max: 32 };
    return { min: 20, max: 24 };
  }

  if (type === 'study_guide' || type === 'revision_notes') {
    return { min: 20, max: 24 };
  }

  return { min: 20, max: 24 };
}

export function getMinimumQuestionCount(grade: string, examType: string): number {
  return getQuestionCountPolicy(grade, examType).min;
}

export function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesSubject(candidate: string | null | undefined, requested: string): boolean {
  const c = normalizeText(candidate);
  const r = normalizeText(requested);

  if (!c || !r) return false;
  if (c.includes(r) || r.includes(c)) return true;

  const tokens = r.split(' ').filter((token) => token.length >= 4);
  if (tokens.length === 0) return false;
  return tokens.some((token) => c.includes(token));
}

export function parseDateValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function isRecent(
  row: { due_date?: string | null; assigned_at?: string | null; created_at?: string | null },
  lookbackMs: number,
): boolean {
  const values = [
    parseDateValue(row.due_date || null),
    parseDateValue(row.assigned_at || null),
    parseDateValue(row.created_at || null),
  ].filter((item): item is number => item !== null);

  if (values.length === 0) return true;
  return values.some((value) => value >= lookbackMs);
}

export function sanitizeTopic(value: string | null | undefined): string | null {
  const cleaned = String(value || '')
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 3) return null;
  if (cleaned.length > 80) return `${cleaned.slice(0, 77)}...`;
  return cleaned;
}

export function pickTopTopics(map: Map<string, number>, limit: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic]) => topic);
}

export function normalizeQuestionType(type: string | null | undefined): string {
  const raw = String(type || 'short_answer').toLowerCase();
  if (raw === 'fill_blank' || raw === 'fill-in-the-blank' || raw === 'fillintheblank') {
    return 'fill_in_blank';
  }
  if (SUPPORTED_QUESTION_TYPES.has(raw)) return raw;
  if (raw.includes('true')) return 'true_false';
  if (raw.includes('multiple')) return 'multiple_choice';
  return 'short_answer';
}
