import { parseColumnMethodPayload, type ColumnMethodPayload } from './InlineColumnMethodCard';
import { parseQuizPayload, type QuizQuestionPayload } from './InlineQuizCard';
import { parseSpellingPayload, type SpellingPracticePayload } from './InlineSpellingPracticeCard';
import { repairInteractiveJson } from './DashMessageBubble.utils';

export type RichSegment =
  | { type: 'markdown'; content: string }
  | { type: 'math'; content: string }
  | { type: 'inlineMath'; content: string }
  | { type: 'mermaid'; content: string }
  | { type: 'column'; content: string }
  | { type: 'spelling'; content: string }
  | { type: 'quiz'; content: string };

const normalizeMathDelimiters = (raw: string): string => {
  return String(raw || '')
    .replace(/\\\\(\[|\]|\(|\)|\$)/g, '\\$1')
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, expr: string) => `$$${expr}$$`)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_match, expr: string) => `$${expr}$`)
    .replace(/\\\$\s*([^$\n]+?)\s*\\\$/g, (_match, expr: string) => `$${expr}$`);
};

export const parseRichSegments = (content: string): RichSegment[] => {
  const splitByPattern = (
    input: RichSegment[],
    regex: RegExp,
    mapper: (value: string) => RichSegment,
  ): RichSegment[] => {
    const next: RichSegment[] = [];
    for (const segment of input) {
      if (segment.type !== 'markdown') {
        next.push(segment);
        continue;
      }
      const text = segment.content || '';
      let cursor = 0;
      regex.lastIndex = 0;
      let match: RegExpExecArray | null = null;
      while ((match = regex.exec(text)) !== null) {
        const [raw, captured] = match;
        const start = match.index;
        const end = start + raw.length;
        if (start > cursor) {
          next.push({ type: 'markdown', content: text.slice(cursor, start) });
        }
        next.push(mapper(String(captured || '').trim()));
        cursor = end;
      }
      if (cursor < text.length) {
        next.push({ type: 'markdown', content: text.slice(cursor) });
      }
    }
    return next;
  };

  const base: RichSegment[] = [{ type: 'markdown', content: normalizeMathDelimiters(content) }];
  const withQuiz = splitByPattern(base, /```quiz\s*([\s\S]*?)```/gi, (value) => ({
    type: 'quiz' as const,
    content: value,
  }));
  const withColumn = splitByPattern(withQuiz, /```column(?:[_-]?method)?\s*([\s\S]*?)```/gi, (value) => ({
    type: 'column' as const,
    content: value,
  }));
  const withSpelling = splitByPattern(withColumn, /```spelling\s*([\s\S]*?)```/gi, (value) => ({
    type: 'spelling' as const,
    content: value,
  }));
  const withMermaid = splitByPattern(withSpelling, /```mermaid\s*([\s\S]*?)```/gi, (value) => ({
    type: 'mermaid',
    content: value,
  }));
  const withMath = splitByPattern(withMermaid, /\$\$([\s\S]*?)\$\$/g, (value) => ({
    type: 'math',
    content: value,
  }));
  const withInlineMath = splitByPattern(withMath, /(?<!\$)\$(?!\$)([^\$\n]+?)(?<!\$)\$(?!\$)/g, (value) => ({
    type: 'inlineMath',
    content: value,
  }));

  return withInlineMath.filter((segment) => {
    if (segment.type === 'markdown') return segment.content.trim().length > 0;
    return segment.content.length > 0;
  });
};

export const safeParseQuizJson = (raw: string): QuizQuestionPayload | null => {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return null;

  const wrapped = `\`\`\`quiz\n${cleaned}\n\`\`\``;
  const parsed = parseQuizPayload(wrapped);
  if (parsed) return parsed;

  try {
    const direct = JSON.parse(cleaned);
    if (
      direct &&
      typeof direct === 'object' &&
      (direct as any).type === 'quiz_question' &&
      typeof (direct as any).question === 'string' &&
      typeof (direct as any).correct === 'string'
    ) {
      return direct as QuizQuestionPayload;
    }
  } catch {
    return null;
  }

  return null;
};

export const safeParseColumnJson = (raw: string): ColumnMethodPayload | null => {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return null;

  const wrapped = `\`\`\`column\n${cleaned}\n\`\`\``;
  const parsed = parseColumnMethodPayload(wrapped);
  if (parsed) return parsed;

  try {
    const direct = JSON.parse(cleaned);
    const addends = Array.isArray((direct as any)?.addends)
      ? (direct as any).addends
          .map((entry: unknown) => Number(String(entry).replace(/,/g, '').trim()))
          .filter((entry: number) => Number.isFinite(entry))
          .map((entry: number) => Math.abs(Math.trunc(entry)))
      : [];
    if (
      direct &&
      typeof direct === 'object' &&
      addends.length >= 2
    ) {
      return {
        type: 'column_addition',
        addends,
        question: typeof (direct as any).question === 'string' ? (direct as any).question : undefined,
        expression: typeof (direct as any).expression === 'string' ? (direct as any).expression : undefined,
        result: Number.isFinite(Number((direct as any).result))
          ? Math.abs(Math.trunc(Number((direct as any).result)))
          : undefined,
        show_carry: (direct as any).show_carry !== false,
      };
    }
  } catch {
    return null;
  }

  return null;
};

export const safeParseSpellingJson = (raw: string): SpellingPracticePayload | null => {
  let cleaned = String(raw || '').trim();
  if (!cleaned) return null;

  const wrapped = `\`\`\`spelling\n${cleaned}\n\`\`\``;
  const parsed = parseSpellingPayload(wrapped);
  if (parsed) return parsed;

  let direct: unknown = null;
  try {
    direct = JSON.parse(cleaned);
  } catch {
    cleaned = repairInteractiveJson(cleaned);
    try {
      direct = JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
  if (
    direct &&
    typeof direct === 'object' &&
    (direct as any).type === 'spelling_practice' &&
    typeof (direct as any).word === 'string'
  ) {
    return direct as SpellingPracticePayload;
  }
  return null;
};
