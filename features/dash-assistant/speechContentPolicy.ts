export type DashSpeechSuppressionReason =
  | 'structured_table'
  | 'numeric_grid'
  | 'code_block';

export type DashSpeechPolicy = {
  shouldSuppress: boolean;
  reason?: DashSpeechSuppressionReason;
};

const CODE_FENCE_PATTERN = /```[\s\S]*?```/;
const MARKDOWN_TABLE_SEPARATOR_PATTERN = /^\s*\|?(?:\s*:?-{3,}:?\s*\|){2,}\s*:?-{3,}:?\s*\|?\s*$/;
const DENSE_NUMERIC_GRID_PATTERN = /^\s*\|?\s*(?:\d+\s*\|){4,}\s*\d+\s*\|?\s*$/;

function countMatches(input: string, pattern: RegExp): number {
  return (input.match(pattern) || []).length;
}

export function evaluateDashSpeechContent(text?: string | null): DashSpeechPolicy {
  const value = String(text || '').trim();
  if (!value) {
    return { shouldSuppress: false };
  }

  if (CODE_FENCE_PATTERN.test(value) && value.length >= 140) {
    return {
      shouldSuppress: true,
      reason: 'code_block',
    };
  }

  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const pipeHeavyLines = lines.filter((line) => countMatches(line, /\|/g) >= 4);
  const markdownSeparatorLines = lines.filter((line) =>
    MARKDOWN_TABLE_SEPARATOR_PATTERN.test(line)
  );
  const numericGridLines = lines.filter((line) => DENSE_NUMERIC_GRID_PATTERN.test(line));

  const digitCount = countMatches(value, /\d/g);
  const letterCount = countMatches(value, /[A-Za-z]/g);
  const digitDensity = value.length > 0 ? digitCount / value.length : 0;
  const numericHeavy = digitCount >= 18 && digitCount > letterCount;

  if (
    pipeHeavyLines.length >= 3 &&
    (markdownSeparatorLines.length >= 1 ||
      /(?:grid|table)\s+format/i.test(value) ||
      numericGridLines.length >= 2)
  ) {
    return {
      shouldSuppress: true,
      reason: markdownSeparatorLines.length >= 1 ? 'structured_table' : 'numeric_grid',
    };
  }

  if (
    numericGridLines.length >= 2 ||
    (pipeHeavyLines.length >= 3 && numericHeavy && digitDensity >= 0.12)
  ) {
    return {
      shouldSuppress: true,
      reason: 'numeric_grid',
    };
  }

  return { shouldSuppress: false };
}

export function shouldSuppressDashSpeechForStructuredContent(text?: string | null): boolean {
  return evaluateDashSpeechContent(text).shouldSuppress;
}
