/**
 * Parse a teacher's message into a weekly theme suggestion: title + objectives.
 * Used when principal taps "Add to weekly program" on a message.
 *
 * Heuristics:
 * - Title: "theme will be X", "weekly theme: X", "Theme title: X", "Tema: X"
 * - Objectives: numbered/bulleted lines, explicit "Learning objectives" blocks,
 *   or plain multi-line lists when teachers do not use bullets
 */

export interface ParsedThemeFromMessage {
  title: string | null;
  objectives: string[];
  rawTitle?: string;
}

const TITLE_PATTERNS = [
  /(?:my\s+)?weekly\s+theme\s+will\s+be\s*[:\s]+([^.!\n]+)/i,
  /weekly\s+theme\s*[:\s]+([^.!\n]+)/i,
  /theme\s+will\s+be\s*[:\s]+([^.!\n]+)/i,
  /theme\s+title\s*[:\s]+([^.!\n]+)/i,
  /theme\s*[:\s]+([^.!\n]+)/i,
  /tema\s*[:\s]+([^.!\n]+)/i,
  /(?:this\s+week(?:'s)?\s+)?theme\s+is\s*[:\s]+([^.!\n]+)/i,
];

const TITLE_LINE = /^(?:\*\*)?\s*(?:theme\s*title|weekly\s*theme|theme|title|tema|onderwerp)\s*(?:\*\*)?\s*[:\-]\s*(.+)$/i;
const NUMBERED_LINE = /^\s*(?:\d+[.)]\s*|[-*•]\s*)(.+)$/;
const OBJECTIVES_HEADING = /^(?:\*\*)?\s*(?:learning\s*objectives?|objectives?|goals?|outcomes?|leerdoelwitte|doelwitte)\s*(?:\*\*)?\s*:?\s*$/i;
const SECTION_HEADING = /^(?:\*\*)?\s*(?:theme(?:\s*title)?|title|description|week(?:\s*start)?|date|materials?|notes?|grade|subject|onderwerp|tema|learning\s*objectives?|objectives?|goals?|outcomes?|leerdoelwitte|doelwitte)\s*(?:\*\*)?\s*[:\-]/i;
const GREETING_LINE = /^(?:hi|hello|dear|good\s+(?:morning|afternoon|evening)|molo|sawubona|dumela)\b/i;

function normalizeText(text: string): string {
  let normalized = text.trim();

  // Some payloads arrive URI-encoded (%0A, %20, etc).
  if (/%[0-9a-f]{2}/i.test(normalized)) {
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // Keep original value when decode fails.
    }
  }

  return normalized
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\u00a0/g, ' ');
}

function cleanLine(value: string): string {
  return value
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsefulTitle(value: string): boolean {
  if (!value || value.length < 2 || value.length > 200) return false;
  if (OBJECTIVES_HEADING.test(value)) return false;
  if (/^(?:week(?:\s*start)?|date|materials?|notes?|leerdoelwitte|doelwitte)\b/i.test(value)) {
    return false;
  }
  return true;
}

function extractTitle(text: string): string | null {
  const normalized = normalizeText(text);
  for (const re of TITLE_PATTERNS) {
    const m = normalized.match(re);
    if (m && m[1]) {
      const candidate = cleanLine(m[1]);
      if (isUsefulTitle(candidate)) return candidate;
    }
  }

  const lines = normalized.split(/\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(TITLE_LINE);
    if (m && m[1]) {
      const candidate = cleanLine(m[1]);
      if (isUsefulTitle(candidate)) return candidate;
    }
  }

  // Fallback: first meaningful non-heading line.
  for (const line of lines) {
    const candidate = cleanLine(line);
    if (!candidate) continue;
    if (GREETING_LINE.test(candidate)) continue;
    if (OBJECTIVES_HEADING.test(candidate)) continue;
    if (SECTION_HEADING.test(candidate)) continue;
    if (/^\s*(?:\d+[.)]\s*|[-*•]\s*)/.test(candidate)) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) continue;
    if (isUsefulTitle(candidate)) return candidate;
  }

  return null;
}

function splitObjectiveFragments(line: string): string[] {
  if (/[;|]/.test(line)) {
    return line.split(/[;|]/).map((item) => item.trim()).filter(Boolean);
  }
  return [line];
}

function extractObjectives(text: string, title: string | null): string[] {
  const normalized = normalizeText(text);
  const lines = normalized.split(/\n/).map((l) => l.trim());
  const objectives: string[] = [];
  const seen = new Set<string>();

  const addObjective = (value: string) => {
    const cleaned = cleanLine(value);
    if (!cleaned || cleaned.length >= 500) return;
    if (title && cleaned.toLowerCase() === title.toLowerCase()) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    objectives.push(cleaned);
  };

  let inObjectiveSection = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const cleaned = cleanLine(line);
    if (!cleaned) continue;

    if (OBJECTIVES_HEADING.test(cleaned)) {
      inObjectiveSection = true;
      continue;
    }
    if (inObjectiveSection && SECTION_HEADING.test(cleaned) && !OBJECTIVES_HEADING.test(cleaned)) {
      break;
    }

    const bullet = line.match(NUMBERED_LINE);
    if (bullet && bullet[1]) {
      addObjective(bullet[1]);
      continue;
    }

    if (inObjectiveSection) {
      for (const fragment of splitObjectiveFragments(cleaned)) {
        addObjective(fragment);
      }
    }
  }

  if (objectives.length > 0) return objectives.slice(0, 12);

  // Fallback 1: collect numbered/bulleted lines anywhere.
  for (const line of lines) {
    const bullet = line.match(NUMBERED_LINE);
    if (bullet && bullet[1]) addObjective(bullet[1]);
  }
  if (objectives.length > 0) return objectives.slice(0, 12);

  // Fallback 2: use plain multi-line text as objectives.
  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) continue;
    if (title && cleaned.toLowerCase() === title.toLowerCase()) continue;
    if (GREETING_LINE.test(cleaned)) continue;
    if (OBJECTIVES_HEADING.test(cleaned)) continue;
    if (SECTION_HEADING.test(cleaned)) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) continue;
    if (cleaned.length < 3 || cleaned.length > 180) continue;
    for (const fragment of splitObjectiveFragments(cleaned)) {
      addObjective(fragment);
    }
  }

  return objectives.slice(0, 12);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => cleanLine(String(item))).filter(Boolean);
  }
  if (typeof value === 'string') {
    return normalizeText(value)
      .split(/\n|;|,/)
      .map((item) => cleanLine(item))
      .filter(Boolean);
  }
  return [];
}

function parseStructuredTheme(text: string): ParsedThemeFromMessage | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const titleCandidate =
      parsed.title ??
      parsed.themeTitle ??
      parsed.theme ??
      parsed.weeklyTheme ??
      null;
    const title = titleCandidate ? cleanLine(String(titleCandidate)) : null;
    const objectives = asStringArray(
      parsed.objectives ??
      parsed.learningObjectives ??
      parsed.goals ??
      parsed.outcomes
    );

    if (!title && objectives.length === 0) return null;
    return {
      title: isUsefulTitle(title || '') ? title : null,
      objectives: objectives.slice(0, 12),
      rawTitle: title || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Parse message body into theme title and list of objectives.
 */
export function parseThemeFromMessage(messageText: string): ParsedThemeFromMessage {
  if (!messageText || typeof messageText !== 'string') {
    return { title: null, objectives: [] };
  }

  const normalized = normalizeText(messageText);
  const structured = parseStructuredTheme(normalized);
  if (structured) return structured;

  const title = extractTitle(normalized);
  const objectives = extractObjectives(normalized, title);
  return {
    title,
    objectives,
    rawTitle: title ?? undefined,
  };
}
