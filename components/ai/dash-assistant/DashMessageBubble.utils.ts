export const buildMarkdownStyles = (theme: any, isUser: boolean) => ({
  body: {
    color: isUser ? theme.onPrimary : theme.text,
    fontSize: 15,
    lineHeight: 22,
  },
  paragraph: {
    color: isUser ? theme.onPrimary : theme.text,
    marginBottom: 8,
    lineHeight: 22,
  },
  heading1: {
    color: isUser ? theme.onPrimary : theme.text,
    fontSize: 20,
    fontWeight: '700' as const,
    marginTop: 16,
    marginBottom: 8,
    lineHeight: 28,
  },
  heading2: {
    color: isUser ? theme.onPrimary : theme.text,
    fontSize: 17,
    fontWeight: '700' as const,
    marginTop: 14,
    marginBottom: 6,
    lineHeight: 24,
  },
  heading3: {
    color: isUser ? theme.onPrimary : theme.text,
    fontSize: 15,
    fontWeight: '700' as const,
    marginTop: 10,
    marginBottom: 4,
    lineHeight: 22,
  },
  strong: {
    fontWeight: '700' as const,
    color: isUser ? theme.onPrimary : theme.text,
  },
  em: {
    fontStyle: 'italic' as const,
    color: isUser ? theme.onPrimary : theme.textSecondary,
  },
  bullet_list: {
    marginVertical: 6,
  },
  ordered_list: {
    marginVertical: 6,
  },
  list_item: {
    marginBottom: 4,
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
  },
  bullet_list_icon: {
    color: isUser ? theme.onPrimary : theme.primary,
    marginRight: 8,
    fontSize: 8,
    lineHeight: 22,
  },
  bullet_list_content: {
    flex: 1,
  },
  code_inline: {
    backgroundColor: isUser ? 'rgba(255,255,255,0.18)' : (theme.surfaceVariant || '#1e293b'),
    color: isUser ? theme.onPrimary : (theme.primary || '#60a5fa'),
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  code_block: {
    backgroundColor: isUser ? 'rgba(0,0,0,0.3)' : '#0f1219',
    color: '#e2e8f0',
    padding: 14,
    borderRadius: 10,
    marginVertical: 10,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
    overflow: 'hidden' as const,
  },
  fence: {
    backgroundColor: isUser ? 'rgba(0,0,0,0.3)' : '#0f1219',
    color: '#e2e8f0',
    padding: 14,
    borderRadius: 10,
    marginVertical: 10,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
    overflow: 'hidden' as const,
  },
  blockquote: {
    backgroundColor: (isUser ? theme.onPrimary : theme.primary) + '12',
    borderLeftWidth: 3,
    borderLeftColor: isUser ? theme.onPrimary : theme.primary,
    paddingLeft: 14,
    paddingVertical: 10,
    marginVertical: 10,
    borderRadius: 6,
  },
  link: {
    color: isUser ? theme.onPrimary : (theme.primary || '#3b82f6'),
    textDecorationLine: 'underline' as const,
  },
  hr: {
    backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : (theme.border || '#334155'),
    height: 1,
    marginVertical: 12,
  },
  table: {
    borderWidth: 1,
    borderColor: isUser ? 'rgba(255,255,255,0.2)' : (theme.border || '#334155'),
    borderRadius: 8,
    marginVertical: 10,
    overflow: 'hidden' as const,
  },
  thead: {
    backgroundColor: isUser ? 'rgba(0,0,0,0.15)' : (theme.surfaceVariant || '#1e293b'),
  },
  th: {
    padding: 8,
    fontWeight: '700' as const,
    fontSize: 13,
    color: isUser ? theme.onPrimary : theme.text,
  },
  td: {
    padding: 8,
    fontSize: 13,
    color: isUser ? theme.onPrimary : theme.text,
    borderTopWidth: 1,
    borderColor: isUser ? 'rgba(255,255,255,0.1)' : (theme.border || '#334155'),
  },
  tr: {
    borderBottomWidth: 0,
  },
  strikethrough: {
    textDecorationLine: 'line-through' as const,
  },
});

// Lightweight markdown stripper for web fallback (no markdown renderer available).
export const stripMarkdownForDisplay = (text: string): string => {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+\u2022]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const toTitleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export const prettifyToolName = (toolName?: string) => {
  const normalized = String(toolName || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!normalized) return 'Operation';
  return toTitleCase(
    normalized
      .replace(/\b(get|fetch|run|execute|create|generate|build)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || normalized,
  );
};

export const firstText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

export const normalizeToolErrorMessage = (toolName: string, rawError: string | null): string | null => {
  const message = String(rawError || '').trim();
  if (!message) return null;
  const lower = message.toLowerCase();

  if (toolName === 'get_assignments') {
    if (lower.includes('column') && lower.includes('does not exist')) {
      return 'Assignments are temporarily unavailable. Please try again shortly.';
    }
    if (lower.includes('relation') && lower.includes('does not exist')) {
      return 'Assignments data is not ready yet for this account.';
    }
  }

  if (lower.includes('permission denied') || lower.includes('insufficient permission')) {
    return 'You do not have access to run this action.';
  }

  if (lower.includes('network') || lower.includes('timeout') || lower.includes('fetch failed')) {
    return 'Network issue while running this action. Please try again.';
  }

  if (
    lower.includes('column') && lower.includes('does not exist')
    || lower.includes('relation') && lower.includes('does not exist')
    || lower.includes('schema')
    || lower.includes('sql')
  ) {
    return 'This action is temporarily unavailable due to a data issue.';
  }

  if (message.length > 180) {
    return 'This action failed. Please try again in a moment.';
  }

  return message;
};

type ToolChartKind = 'bar' | 'line' | 'pie';
type ToolChartPoint = {
  label: string;
  value: number;
  color: string;
};
export type ToolChartPreview = {
  title: string;
  type: ToolChartKind;
  points: ToolChartPoint[];
};

export type ExpandedVisualState =
  | { type: 'mermaid'; title: string; definition: string }
  | { type: 'chart'; title: string; chart: ToolChartPreview }
  | { type: 'image'; title: string; uri: string };

const TOOL_CHART_COLORS = ['#3b82f6', '#14b8a6', '#f59e0b', '#f97316', '#6366f1', '#10b981', '#ef4444', '#8b5cf6'];
export const PDF_TOOL_NAMES = new Set(['export_pdf', 'generate_worksheet', 'generate_chart', 'generate_pdf_from_prompt']);

export const isLikelyPdfUrl = (value?: string | null): boolean => {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/\.pdf(\?|$)/i.test(text)) return true;
  return /generated[-_/]?pdf|\/pdfs?\//i.test(text);
};

const toFiniteNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const buildToolChartPreview = (
  toolName: string,
  toolArgs?: Record<string, any> | null
): ToolChartPreview | null => {
  if (String(toolName || '').toLowerCase() !== 'generate_chart') return null;
  if (!toolArgs || typeof toolArgs !== 'object') return null;

  const labels = Array.isArray(toolArgs.labels) ? toolArgs.labels : [];
  const values = Array.isArray(toolArgs.values) ? toolArgs.values : [];
  if (labels.length === 0 || values.length === 0) return null;

  const typeRaw = String(toolArgs.chart_type || 'bar').toLowerCase();
  const type: ToolChartKind = typeRaw === 'pie' ? 'pie' : (typeRaw === 'line' ? 'line' : 'bar');
  const colors = Array.isArray(toolArgs.colors) ? toolArgs.colors : [];
  const points: ToolChartPoint[] = labels
    .map((label: unknown, idx: number) => {
      const text = String(label || '').trim();
      if (!text) return null;
      return {
        label: text,
        value: toFiniteNumber(values[idx]),
        color: String(colors[idx] || TOOL_CHART_COLORS[idx % TOOL_CHART_COLORS.length]),
      };
    })
    .filter((point: ToolChartPoint | null): point is ToolChartPoint => !!point)
    .slice(0, 8);

  if (points.length === 0) return null;
  return {
    title: firstText(toolArgs.title) || 'Chart Preview',
    type,
    points,
  };
};

const VISUAL_PLACEHOLDER_REGEX = /\[(diagram|chart|graph)\]/gi;

/** Repairs common AI JSON errors (e.g. "en", instead of "language":"en") to avoid raw display. */
export const repairInteractiveJson = (raw: string): string => {
  let s = raw;
  // Fix standalone language codes: "en", or "af", -> "language":"en",
  s = s.replace(/"([a-z]{2})",\s*(?=\s*["\}\]])/g, '"language":"$1",');
  // Fix "language": "en", with stray commas
  s = s.replace(/"language"\s*:\s*"([^"]+)"\s*,?\s*,/g, '"language":"$1",');
  return s;
};

export const normalizeInteractiveJsonFences = (content: string): string => {
  const source = String(content || '');
  if (!source.includes('```json')) return source;
  return source.replace(/```json\s*([\s\S]*?)```/gi, (full, jsonBlock) => {
    let raw = String(jsonBlock || '').trim();
    if (!raw) return full;
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      raw = repairInteractiveJson(raw);
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return ''; // Strip unparseable blocks so raw JSON is never shown
      }
    }
    const type = String(parsed?.type || '').trim().toLowerCase();
    if (type === 'spelling_practice') return `\`\`\`spelling\n${raw}\n\`\`\``;
    if (type === 'column_addition') return `\`\`\`column\n${raw}\n\`\`\``;
    if (type === 'quiz_question') return `\`\`\`quiz\n${raw}\n\`\`\``;
    return full;
  });
};

/** Strips raw interactive JSON blocks from prose so they are not shown as text. */
export const stripRawInteractiveJsonFromProse = (content: string): string => {
  let source = String(content || '');
  source = source.replace(/\{\s*"type"\s*:\s*"(spelling_practice|column_addition|quiz_question)"[\s\S]*?\}\s*/g, '');
  // Strip worksheet/activity metadata JSON that AI sometimes outputs (title, type, age_group, content)
  source = source.replace(/\{\s*"title"\s*:\s*"[^"]*"\s*,\s*"type"\s*:\s*"(?:activity|worksheet|math|reading|general)"[\s\S]*?"content"\s*:\s*"[^"]*"\s*\}\s*/g, '');
  source = source.replace(/(?:^|\n)\s*"title"\s*:\s*"[^"]*"\s*,\s*"type"\s*:\s*"[^"]*"\s*,\s*"age_group"\s*:\s*"[^"]*"\s*,\s*"content"\s*:\s*"[^"]*"\s*/gm, '');
  return source;
};

const parseNumberToken = (token: string): number => {
  const parsed = Number(String(token || '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : NaN;
};

const buildAdditionMermaidFallback = (content: string): string | null => {
  const text = String(content || '');
  if (!/(more|plus|add|added|bought|altogether|total|sum)/i.test(text)) return null;
  const numberTokens = [...text.matchAll(/\b\d{1,3}(?:,\d{3})*\b/g)].map((match) => match[0]);
  if (numberTokens.length < 2) return null;

  const first = parseNumberToken(numberTokens[0]);
  const second = parseNumberToken(numberTokens[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

  const total = first + second;
  const unitMatch = text.match(/\b\d{1,3}(?:,\d{3})*\s+([A-Za-z]{3,20})/);
  const unit = unitMatch?.[1] ? ` ${unitMatch[1].toLowerCase()}` : '';

  return [
    'flowchart LR',
    `  A["Start: ${first.toLocaleString()}${unit}"]`,
    `  B["+ ${second.toLocaleString()}${unit}"]`,
    `  C["Total: ${total.toLocaleString()}${unit}"]`,
    '  A --> B --> C',
  ].join('\n');
};

export const replaceVisualPlaceholders = (content: string): string => {
  const input = String(content || '');
  if (!VISUAL_PLACEHOLDER_REGEX.test(input)) return input;
  VISUAL_PLACEHOLDER_REGEX.lastIndex = 0;

  const autoMermaid = buildAdditionMermaidFallback(input);
  if (autoMermaid) {
    return input.replace(
      VISUAL_PLACEHOLDER_REGEX,
      `\n\`\`\`mermaid\n${autoMermaid}\n\`\`\`\n`
    );
  }

  return input.replace(
    VISUAL_PLACEHOLDER_REGEX,
    '\n```text\nVisual guide:\n- Draw a quick labeled sketch for each quantity.\n- Show the operation before solving.\n```\n'
  );
};
