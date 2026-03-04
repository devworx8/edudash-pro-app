export type MathSegment = {
  type: 'text' | 'inline' | 'block';
  value: string;
};

const IMPLICIT_LATEX_TOKEN_RE =
  /(\\frac\s*\{[^{}]+\}\s*\{[^{}]+\}|\\sqrt\s*\{[^{}]+\}|\\(?:times|div|cdot|pm|leq|geq|neq|approx|pi|theta|alpha|beta|gamma|sum|int|left|right)\b|[A-Za-z0-9]+\s*[\^_]\s*\{[^{}]+\}|[A-Za-z0-9]+\s*[\^_]\s*[A-Za-z0-9]+|\b(?:\d{1,3}|[A-Za-z])\s*\/\s*(?:\d{1,3}|[A-Za-z])\b)/g;

function normalizeMathToken(rawToken: string): string {
  const token = String(rawToken || '').trim();
  if (!token) return token;

  // Convert plain fractions to proper TeX fractions for clearer rendering.
  const plainFraction = token.match(/^([A-Za-z]|\d{1,3})\s*\/\s*([A-Za-z]|\d{1,3})$/);
  if (plainFraction) {
    return `\\frac{${plainFraction[1]}}{${plainFraction[2]}}`;
  }

  // Normalize shorthand malformed TeX fractions (`\frac a b` -> `\frac{a}{b}`).
  const malformedFrac = token.match(/^\\frac\s+([^{}\s]+)\s+([^{}\s]+)$/);
  if (malformedFrac) {
    return `\\frac{${malformedFrac[1]}}{${malformedFrac[2]}}`;
  }

  // Normalize exponent/subscript shorthand (`x^2` -> `x^{2}`, `a_b` -> `a_{b}`).
  const shorthandPower = token.match(/^([A-Za-z0-9]+)\s*\^\s*([A-Za-z0-9]+)$/);
  if (shorthandPower) {
    return `${shorthandPower[1]}^{${shorthandPower[2]}}`;
  }

  const shorthandSubscript = token.match(/^([A-Za-z0-9]+)\s*_\s*([A-Za-z0-9]+)$/);
  if (shorthandSubscript) {
    return `${shorthandSubscript[1]}_{${shorthandSubscript[2]}}`;
  }

  return token;
}

function normalizeMathDelimiters(raw: string): string {
  return String(raw || '')
    // Unwrap double-escaped delimiters emitted by JSON-serialized model output.
    .replace(/\\\\(\[|\]|\(|\)|\$)/g, '\\$1')
    // Normalize malformed TeX fraction shorthand before segment parsing.
    .replace(/\\frac\s+([^{}\s]+)\s+([^{}\s]+)/g, (_match, numerator: string, denominator: string) => {
      return `\\frac{${numerator}}{${denominator}}`;
    })
    // Convert \[ ... \] to $$ ... $$ (display math)
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, expr: string) => `$$${expr}$$`)
    // Convert \( ... \) to $ ... $ (inline math)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_match, expr: string) => `$${expr}$`)
    // Convert escaped dollar wrappers (\$ ... \$) to standard inline math
    .replace(/\\\$\s*([^$\n]+?)\s*\\\$/g, (_match, expr: string) => `$${expr}$`);
}

function injectImplicitInlineMath(source: string): string {
  if (!source.trim()) return source;
  if (containsMathDelimiters(source)) return source;
  IMPLICIT_LATEX_TOKEN_RE.lastIndex = 0;
  if (!IMPLICIT_LATEX_TOKEN_RE.test(source)) return source;
  IMPLICIT_LATEX_TOKEN_RE.lastIndex = 0;
  return source.replace(IMPLICIT_LATEX_TOKEN_RE, (token) => `$${normalizeMathToken(token)}$`);
}

export function parseMathSegments(value: string): MathSegment[] {
  const source = injectImplicitInlineMath(normalizeMathDelimiters(value));
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

export function containsMathSyntax(value: string): boolean {
  const source = String(value || '');
  if (!source.trim()) return false;
  if (containsMathDelimiters(source)) return true;
  IMPLICIT_LATEX_TOKEN_RE.lastIndex = 0;
  return IMPLICIT_LATEX_TOKEN_RE.test(source);
}
