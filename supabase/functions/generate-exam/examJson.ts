export function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) return jsonMatch[0].trim();

  throw new Error('No JSON payload found in AI response');
}

/** Attempt to repair common LLM JSON issues (trailing commas, control chars) */
export function repairJsonForParse(raw: string): string {
  let s = raw;
  // Remove trailing commas before } or ] (common LLM mistake)
  s = s.replace(/,\s*([}\]])/g, '$1');
  // Remove control characters except newline and tab
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  return s;
}

/** Parse exam JSON with repair attempts to avoid malformed fallback */
export function parseExamJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(repairJsonForParse(raw));
    } catch {
      throw new Error('Parse failed after repair attempt');
    }
  }
}
