export type MathSegment = {
  type: 'text' | 'inline' | 'block';
  value: string;
};

function normalizeMathDelimiters(raw: string): string {
  return String(raw || '')
    // Unwrap double-escaped delimiters emitted by JSON-serialized model output.
    .replace(/\\\\(\[|\]|\(|\)|\$)/g, '\\$1')
    // Convert \[ ... \] to $$ ... $$ (display math)
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, expr: string) => `$$${expr}$$`)
    // Convert \( ... \) to $ ... $ (inline math)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_match, expr: string) => `$${expr}$`)
    // Convert escaped dollar wrappers (\$ ... \$) to standard inline math
    .replace(/\\\$\s*([^$\n]+?)\s*\\\$/g, (_match, expr: string) => `$${expr}$`);
}

export function parseMathSegments(value: string): MathSegment[] {
  const source = normalizeMathDelimiters(value);
  if (!source.trim()) return [];

  const segments: MathSegment[] = [];
  const matcher = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(source)) !== null) {
    if (match.index > cursor) {
      segments.push({
        type: 'text',
        value: source.slice(cursor, match.index),
      });
    }

    if (match[1]) {
      segments.push({ type: 'block', value: match[1].trim() });
    } else if (match[2]) {
      segments.push({ type: 'inline', value: match[2].trim() });
    }

    cursor = matcher.lastIndex;
  }

  if (cursor < source.length) {
    segments.push({
      type: 'text',
      value: source.slice(cursor),
    });
  }

  return segments.filter((segment) => segment.value.length > 0);
}

export function containsMathDelimiters(value: string): boolean {
  return /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\\\$[^$\n]+?\\\$/.test(String(value || ''));
}
