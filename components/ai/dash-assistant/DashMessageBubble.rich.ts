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

/**
 * Normalize unicode bullet chars (•, ◦, ▪, ‣) at line starts to standard
 * markdown list markers so BARE_LATEX_RE prefix matching works correctly.
 */
const normalizeBullets = (text: string): string =>
  text.replace(/^(\s*)[\u2022\u25E6\u25AA\u2023\u25B8\u25BA]/gm, '$1- ');

/**
 * Join consecutive lines that form a split math expression.
 * AI models sometimes break "5^3 = 5 \times 5 \times 5 = 125" across
 * multiple lines. Rejoin when a line ends with a math operator or the
 * next line begins with one.
 */
const joinSplitMathLines = (text: string): string => {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    let current = lines[i];
    let merged = current.trimEnd();
    while (i + 1 < lines.length) {
      const t = merged.trim();
      const nextTrimmed = lines[i + 1].trim();
      if (!nextTrimmed) break; // blank line = paragraph break

      // Current line ends with a math operator (+, =, ×, ÷, \times, etc.)
      const endsWithOp = /[\u00d7\u00f7+=×·]$|\\(?:times|cdot|div)\s*$/.test(t);
      // Next line starts with a math operator or digit/paren and is math-like
      const startsWithOp = /^[\u00d7\u00f7+=×·]|^\\(?:times|cdot|div)\b/.test(nextTrimmed);
      const nextIsMathCont =
        /^[\d(\\]/.test(nextTrimmed) &&
        /[\d^{}=\u00d7\u00f7×·)]/.test(nextTrimmed);

      if (endsWithOp && (nextIsMathCont || startsWithOp)) {
        merged = t + ' ' + nextTrimmed;
        current = merged;
        i++;
      } else if (startsWithOp && /[\d^{})\u00d7\u00f7×·=]/.test(t)) {
        // Previous line looks math-like and next starts with an operator
        merged = t + ' ' + nextTrimmed;
        current = merged;
        i++;
      } else {
        break;
      }
    }
    result.push(current);
    i++;
  }
  return result.join('\n');
};

const normalizeMathDelimiters = (raw: string): string => {
  return String(raw || '')
    // Collapse double-escaped delimiters (\\[ → \[) so next regexes can match
    .replace(/\\\\(\[|\]|\(|\))/g, '\\$1')
    // Display math: \[...\] → $$...$$
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, expr: string) => `$$${expr}$$`)
    // Inline math: \(...\) → $...$
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_match, expr: string) => `$${expr}$`)
    // Escaped dollar pairs: \$...\$ → $...$
    .replace(/\\\$\s*([^$\n]+?)\s*\\\$/g, (_match, expr: string) => `$${expr}$`);
};

/**
 * Detect bare LaTeX expressions (missing $ delimiters) and wrap them.
 * Catches patterns like: 2^3 \times 2^4 = 2^{3+2^7} = 128
 */
const LATEX_CMD_ALTERNATION =
  'times|frac|sqrt|cdot|div|pm|mp|neq|leq|geq|approx|infty|sum|prod|int|lim|' +
  'sin|cos|tan|log|ln|alpha|beta|gamma|delta|theta|pi|sigma|omega|phi|psi|' +
  'lambda|mu|epsilon|rightarrow|leftarrow|Rightarrow|Leftarrow|text|mathrm|' +
  'mathbf|overline|underline|hat|bar|vec|dot';

const BARE_LATEX_RE = new RegExp(
  // Allow leading markdown (bullet/number) then capture the math expression
  String.raw`^((?:\s*[-*+]\s+|\s*\d+[.)]\s+|\s*))((?:[0-9a-zA-Z()\[\]{}\s^_=+\-*/<>.,:|!]+)?\\(?:${LATEX_CMD_ALTERNATION})[^$\n]*)$`,
  'gm'
);

const wrapBareLaTeX = (text: string): string => {
  return text.replace(BARE_LATEX_RE, (_match, prefix: string, expr: string) => {
    // Don't wrap if the line already contains a $ delimiter
    if (_match.includes('$')) return _match;
    return `${prefix}$${expr.trim()}$`;
  });
};

/**
 * Wrap bare caret expressions (e.g. "2^4 = 16", "2^{3+4} = 128") that use ^
 * for exponents but contain no LaTeX command (so wrapBareLaTeX misses them).
 * Also catches mixed expressions with both ^ and \times that wrapBareLaTeX
 * already wraps — this acts as a safety net for remaining cases.
 */
const MATH_KEYWORDS = new Set([
  'times', 'frac', 'sqrt', 'cdot', 'div', 'log', 'sin', 'cos', 'tan',
  'mod', 'ln', 'pi', 'pm', 'mp', 'neq', 'leq', 'geq', 'approx',
]);

const wrapBareCaretExpressions = (text: string): string =>
  text.replace(
    /^((?:\s*[-*+]\s+|\s*\d+[.)]\s+|\s*))([^$\n]*\d\^[\d{(][^$\n]*)$/gm,
    (match, prefix: string, expr: string) => {
      if (match.includes('$')) return match;
      // Skip lines with prose words (2+ letter sequences that aren't math keywords)
      const words: string[] = expr.match(/[a-zA-Z]{2,}/g) || [];
      if (words.some((w: string) => !MATH_KEYWORDS.has(w.toLowerCase()))) return match;
      return `${prefix}$${expr.trim()}$`;
    },
  );

/**
 * Last-resort catch: lines that look like pure math (only digits, operators,
 * =, ^, braces, parens, spaces) but weren't caught by previous passes.
 * Example: "5 × 5 × 5 = 125", "2 + 3 = 5"
 */
const wrapPureMathLines = (text: string): string =>
  text.replace(
    /^((?:\s*[-*+]\s+|\s*\d+[.)]\s+|\s*))(\d[\d\s×÷·+\-*/^{}()=,.]+\d)$/gm,
    (match, prefix: string, expr: string) => {
      if (match.includes('$')) return match;
      // Must contain at least one operator to be math (not just "123")
      if (!/[×÷·+\-*/^=]/.test(expr)) return match;
      // Must not be a date-like pattern (2024-03-15)
      if (/^\d{4}-\d{2}-\d{2}$/.test(expr.trim())) return match;
      return `${prefix}$${expr.trim()}$`;
    },
  );

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

  const base: RichSegment[] = [{
    type: 'markdown',
    content: wrapPureMathLines(
      wrapBareCaretExpressions(
        wrapBareLaTeX(
          joinSplitMathLines(
            normalizeMathDelimiters(
              normalizeBullets(content),
            ),
          ),
        ),
      ),
    ),
  }];
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
  const withInlineMath = splitByPattern(withMath, /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g, (value) => ({
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
