import type { ExamQuestion } from '@/lib/examParser';

export function questionTypeIcon(type: ExamQuestion['type']): { name: string; label: string } {
  switch (type) {
    case 'multiple_choice':
      return { name: 'radio-button-on', label: 'Multiple Choice' };
    case 'true_false':
      return { name: 'swap-horizontal', label: 'True / False' };
    case 'short_answer':
    case 'fill_blank':
    case 'fill_in_blank':
      return { name: 'pencil', label: 'Short Answer' };
    case 'essay':
      return { name: 'document-text', label: 'Essay' };
    case 'matching':
      return { name: 'git-compare', label: 'Matching' };
    default:
      return { name: 'help-circle', label: '' };
  }
}

export const MATH_HINT = 'Use LaTeX for maths: \\frac{1}{2}  \\sqrt{x}  x^2  \\times  \\div';

export function isOpenAnswer(type: ExamQuestion['type']) {
  return type === 'short_answer' || type === 'essay' || type === 'fill_blank' || type === 'fill_in_blank';
}

export function sanitizeChoiceText(value: string): string {
  return String(value || '')
    .replace(/^(?:\s*[A-D]\s*[\.\)\-:]\s*)+/i, '')
    .trim();
}

export function normalizeChoiceText(value: string): string {
  return sanitizeChoiceText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractChoiceLetter(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const exact = raw.match(/^\s*([A-D])\s*$/i);
  if (exact?.[1]) return exact[1].toLowerCase();

  const prefixed = raw.match(/^\s*([A-D])\s*[\.\)\-:]/i);
  if (prefixed?.[1]) return prefixed[1].toLowerCase();

  const labeled = raw.match(/\b(?:option|answer|correct(?:\s+answer)?)\s*[:\-]?\s*([A-D])\b/i);
  if (labeled?.[1]) return labeled[1].toLowerCase();

  return null;
}

export function resolveChoiceLetter(value: string | undefined, options: string[] | undefined): string | null {
  if (!value) return null;

  const direct = extractChoiceLetter(value);
  if (direct) return direct;
  if (!Array.isArray(options) || options.length === 0) return null;

  const normalized = normalizeChoiceText(value);
  if (!normalized) return null;

  const index = options.findIndex((option) => normalizeChoiceText(option) === normalized);
  return index >= 0 ? String.fromCharCode(97 + index) : null;
}

export function normalizeMathDelimiters(raw: string): string {
  return String(raw || '')
    .replace(/\\\\(\[|\]|\(|\)|\$)/g, '\\$1')
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_m, expr: string) => `$$${expr}$$`)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_m, expr: string) => `$${expr}$`)
    .replace(/\\\$\s*([^$\n]+?)\s*\\\$/g, (_m, expr: string) => `$${expr}$`);
}

export function isComplexInlineMath(expression: string): boolean {
  const normalized = String(expression || '');
  if (!normalized) return false;
  if (normalized.length >= 40) return true;
  if (/\\sum|\\int|\\left|\\right/i.test(normalized)) return true;
  if (/\\frac|\\sqrt/i.test(normalized) && normalized.length >= 34) return true;
  if ((normalized.match(/[=+\-*/]/g) || []).length >= 3) return true;
  return false;
}

export function parseStandaloneMath(value: string): { expression: string; displayMode: boolean } | null {
  const trimmed = normalizeMathDelimiters(value).trim();
  if (!trimmed) return null;

  const blockMatch = trimmed.match(/^\$\$([\s\S]+)\$\$$/);
  if (blockMatch?.[1]) {
    return {
      expression: blockMatch[1].trim(),
      displayMode: true,
    };
  }

  const inlineMatch = trimmed.match(/^\$([^$\n]+)\$$/);
  if (inlineMatch?.[1]) {
    const expression = inlineMatch[1].trim();
    return {
      expression,
      displayMode: isComplexInlineMath(expression),
    };
  }

  return null;
}
