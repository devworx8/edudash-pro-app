/**
 * DashMessageBubble Component
 * 
 * Renders individual chat messages for the Dash AI Assistant.
 * Extracted from DashAssistant for better maintainability.
 */

import React from 'react';
import { View, Text, TouchableOpacity, Platform, Linking, Alert, ScrollView, Image, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { messageStyles as styles } from './styles/message.styles';
import { useTheme } from '@/contexts/ThemeContext';
import type { DashMessage } from '@/services/dash-ai/types';
import { createSignedUrl, getFileIconName, formatFileSize } from '@/services/AttachmentService';
import { LinearGradient } from 'expo-linear-gradient';
import { MathRenderer } from './MathRenderer';
import { MermaidRenderer } from './MermaidRenderer';
import InlineQuizCard, { parseQuizPayload, type QuizQuestionPayload } from './InlineQuizCard';
import InlineColumnMethodCard, {
  parseColumnMethodPayload,
  type ColumnMethodPayload,
} from './InlineColumnMethodCard';
import InlineSpellingPracticeCard, {
  parseSpellingPayload,
  type SpellingPracticePayload,
} from './InlineSpellingPracticeCard';
import {
  resolvePdfPreviewTarget,
  sanitizeGeneratedPdfUrl,
} from './pdfPreviewUtils';
import { isValidFollowUp } from '@/hooks/dash-assistant/assistantHelpers';

const isWeb = Platform.OS === 'web';
let Markdown: React.ComponentType<any> | null = null;
if (!isWeb) {
  try {
    Markdown = require('react-native-markdown-display').default;
  } catch (e) {
    console.warn('[DashMessageBubble] Markdown not available:', e);
  }
}

const buildMarkdownStyles = (theme: ReturnType<typeof useTheme>['theme'], isUser: boolean) => ({
  body: {
    color: isUser ? theme.onPrimary : theme.text,
    fontSize: 14,
    lineHeight: 20,
  },
  paragraph: {
    color: isUser ? theme.onPrimary : theme.text,
    marginBottom: 6,
  },
  heading1: {
    color: isUser ? theme.onPrimary : theme.text,
    fontSize: 18,
    fontWeight: '700' as const,
    marginTop: 12,
    marginBottom: 6,
  },
  heading2: {
    color: isUser ? theme.onPrimary : theme.text,
    fontSize: 16,
    fontWeight: '700' as const,
    marginTop: 10,
    marginBottom: 6,
  },
  heading3: {
    color: isUser ? theme.onPrimary : theme.text,
    fontSize: 15,
    fontWeight: '600' as const,
    marginTop: 8,
    marginBottom: 4,
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
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    marginBottom: 2,
  },
  bullet_list_icon: {
    color: isUser ? theme.onPrimary : theme.primary,
    marginRight: 8,
  },
  code_inline: {
    backgroundColor: isUser ? 'rgba(255,255,255,0.18)' : theme.surfaceVariant,
    color: isUser ? theme.onPrimary : theme.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  code_block: {
    backgroundColor: isUser ? 'rgba(0,0,0,0.25)' : '#101420',
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
  },
  fence: {
    backgroundColor: isUser ? 'rgba(0,0,0,0.25)' : '#101420',
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
  },
  blockquote: {
    backgroundColor: (isUser ? theme.onPrimary : theme.primary) + '12',
    borderLeftWidth: 3,
    borderLeftColor: isUser ? theme.onPrimary : theme.primary,
    paddingLeft: 12,
    paddingVertical: 8,
    marginVertical: 8,
    borderRadius: 6,
  },
  link: {
    color: isUser ? theme.onPrimary : theme.primary,
    textDecorationLine: 'underline' as const,
  },
});

const toTitleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const prettifyToolName = (toolName?: string) => {
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

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const normalizeToolErrorMessage = (toolName: string, rawError: string | null): string | null => {
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
type ToolChartPreview = {
  title: string;
  type: ToolChartKind;
  points: ToolChartPoint[];
};

type ExpandedVisualState =
  | { type: 'mermaid'; title: string; definition: string }
  | { type: 'chart'; title: string; chart: ToolChartPreview }
  | { type: 'image'; title: string; uri: string };

const TOOL_CHART_COLORS = ['#3b82f6', '#14b8a6', '#f59e0b', '#f97316', '#6366f1', '#10b981', '#ef4444', '#8b5cf6'];
const PDF_TOOL_NAMES = new Set(['export_pdf', 'generate_worksheet', 'generate_chart', 'generate_pdf_from_prompt']);

const isLikelyPdfUrl = (value?: string | null): boolean => {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/\.pdf(\?|$)/i.test(text)) return true;
  return /generated[-_/]?pdf|\/pdfs?\//i.test(text);
};

const toFiniteNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const buildToolChartPreview = (
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
const repairInteractiveJson = (raw: string): string => {
  let s = raw;
  // Fix standalone language codes: "en", or "af", -> "language":"en",
  s = s.replace(/"([a-z]{2})",\s*(?=\s*["\}\]])/g, '"language":"$1",');
  // Fix "language": "en", with stray commas
  s = s.replace(/"language"\s*:\s*"([^"]+)"\s*,?\s*,/g, '"language":"$1",');
  return s;
};

const normalizeInteractiveJsonFences = (content: string): string => {
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
const stripRawInteractiveJsonFromProse = (content: string): string => {
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

const replaceVisualPlaceholders = (content: string): string => {
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

const AttachmentImagePreview: React.FC<{
  attachment: DashMessage['attachments'][number];
  isUser: boolean;
}> = ({ attachment, isUser }) => {
  const { theme } = useTheme();
  const [imageUrl, setImageUrl] = React.useState<string | null>(attachment.previewUri || null);
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    if (imageUrl || !attachment.bucket || !attachment.storagePath) return () => { mounted = false; };

    (async () => {
      try {
        const signed = await createSignedUrl(attachment.bucket, attachment.storagePath, 3600);
        if (mounted) setImageUrl(signed);
      } catch {
        if (mounted) setHasError(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [attachment.bucket, attachment.storagePath, imageUrl]);

  if (hasError || !imageUrl) return null;

  return (
    <View
      style={[
        styles.imagePreviewCard,
        { borderColor: isUser ? 'rgba(255,255,255,0.2)' : theme.border },
      ]}
    >
      <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
    </View>
  );
};

interface DashMessageBubbleProps {
  message: DashMessage;
  index: number;
  totalMessages: number;
  speakingMessageId: string | null;
  isLoading: boolean;
  voiceEnabled?: boolean;
  showFollowUps?: boolean;
  onSpeak: (message: DashMessage) => void;
  onRetry: (content: string) => void;
  onSendFollowUp: (text: string) => void;
  extractFollowUps: (text: string) => string[];
  assistantLabel?: string;
  onRetakeForClarity?: (message: DashMessage) => void;
}

export const DashMessageBubble: React.FC<DashMessageBubbleProps> = ({
  message,
  index,
  totalMessages,
  speakingMessageId,
  isLoading,
  voiceEnabled = true,
  showFollowUps = true,
  onSpeak,
  onRetry,
  onSendFollowUp,
  extractFollowUps,
  assistantLabel,
  onRetakeForClarity,
}) => {
  const { theme, isDark } = useTheme();
  const warningColor = theme.warning || '#d97706';
  const isUser = message.type === 'user';
  const [showRawToolPayload, setShowRawToolPayload] = React.useState(false);
  const [showFullToolNarrative, setShowFullToolNarrative] = React.useState(false);
  const [expandedVisual, setExpandedVisual] = React.useState<ExpandedVisualState | null>(null);
  
  // Enhanced gradients for better visual appeal
  const userGradient = isDark
    ? [theme.primaryDark || '#1e40af', theme.primary, theme.accentDark || '#7c3aed']
    : ['#0ea5e9', '#3b82f6', '#6366f1']; // Sky blue → Blue → Indigo

  React.useEffect(() => {
    setShowRawToolPayload(false);
    setShowFullToolNarrative(false);
    setExpandedVisual(null);
  }, [message.id]);

  // Check if this is the last user message (for retry button)
  const isLastUserMessage = isUser && index >= totalMessages - 2;

  // Extract URLs from content
  const extractUrl = (content: string): string | undefined => {
    try {
      const candidates = [content, content.replace(/\s*\n+\s*/g, ''), content.replace(/\s+/g, ' ')];
      for (const candidate of candidates) {
        const match = String(candidate || '').match(/https?:\/\/[^\s)]+/i);
        if (match?.[0]) {
          return match[0].replace(/[.,;:!?]+$/g, '');
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  };

  const url = !isUser ? extractUrl(message.content || '') : undefined;
  const isPdf = isLikelyPdfUrl(url);

  const isLatestMessage = index === totalMessages - 1;

  // Get suggestions from metadata or extract from content
  const suggestions = React.useMemo(() => {
    if (isUser || !showFollowUps) return [] as string[];
    const rawSuggestions = Array.isArray(message.metadata?.suggested_actions) && message.metadata.suggested_actions.length > 0
      ? message.metadata.suggested_actions
      : extractFollowUps(message.content);
    const deduped = Array.from(
      new Set(
        rawSuggestions
          .map((item: unknown) => String(item || '').trim())
          .filter((item) => item.length >= 4 && isValidFollowUp(item)),
      ),
    );
    return deduped.slice(0, 4);
  }, [extractFollowUps, isUser, message.content, message.metadata?.suggested_actions, showFollowUps]);

  const sanitizeAssistantContent = (content: string) => {
    const step1 = replaceVisualPlaceholders(content || '');
    const step2 = normalizeInteractiveJsonFences(step1);
    const step3 = stripRawInteractiveJsonFromProse(step2);
    return step3.trim();
  };

  const assistantContent = sanitizeAssistantContent(message.content || '');
  const userContent = message.content || '';
  const hasAssistantContent = assistantContent.trim().length > 0;
  const assistantFallbackText = isLoading && isLatestMessage
    ? 'Working on your request...'
    : 'I completed that step. Ask a follow-up and I will refine it.';
  const assistantDisplayText = hasAssistantContent ? assistantContent : assistantFallbackText;
  const metadata = (message.metadata || {}) as Record<string, any>;
  const resolutionStatus = String(metadata.resolution_status || '').toLowerCase();
  const confidenceScore = typeof metadata.confidence_score === 'number'
    ? metadata.confidence_score
    : Number.NaN;
  const normalizedOCR = metadata.ocr && typeof metadata.ocr === 'object'
    ? metadata.ocr
    : null;
  const unclearSpans = Array.isArray(normalizedOCR?.unclear_spans)
    ? normalizedOCR.unclear_spans
        .map((span: unknown) => String(span || '').trim())
        .filter((span: string) => span.length > 0)
        .slice(0, 3)
    : [];
  const shouldOfferRetake =
    !isUser &&
    typeof onRetakeForClarity === 'function' &&
    (resolutionStatus === 'escalated' || resolutionStatus === 'needs_clarification' || (!Number.isNaN(confidenceScore) && confidenceScore <= 0.75));
  const tutorPhase = String(metadata.tutor_phase || metadata.phase || '').toLowerCase();
  const showPracticeMicrocopy = !isUser && tutorPhase.includes('practice');
  const toolResultsArray = Array.isArray(metadata.tool_results)
    ? metadata.tool_results.filter(
        (entry): entry is Record<string, any> => !!entry && typeof entry === 'object',
      )
    : [];
  const metadataToolName = String(metadata.tool_name || '').trim().toLowerCase();
  const latestMatchingToolResult = metadataToolName
    ? [...toolResultsArray]
        .reverse()
        .find((entry) => String(entry?.name || entry?.tool || '').trim().toLowerCase() === metadataToolName) || null
    : null;
  const latestPdfToolResult = [...toolResultsArray]
    .reverse()
    .find((entry) => PDF_TOOL_NAMES.has(String(entry?.name || entry?.tool || '').trim().toLowerCase())) || null;
  const latestToolResult =
    latestMatchingToolResult ||
    latestPdfToolResult ||
    (toolResultsArray.length > 0 ? toolResultsArray[toolResultsArray.length - 1] : null);
  const toolResultsCompat = metadata.tool_results && typeof metadata.tool_results === 'object' && !Array.isArray(metadata.tool_results)
    ? metadata.tool_results as Record<string, any>
    : null;
  const parsedLatestToolOutput = (() => {
    const output = latestToolResult?.output ?? latestToolResult?.result ?? latestToolResult?.data;
    if (typeof output !== 'string') return output;
    const candidate = output.trim();
    if (!candidate || (!candidate.startsWith('{') && !candidate.startsWith('['))) return output;
    try {
      return JSON.parse(candidate);
    } catch {
      return output;
    }
  })();
  const rawToolName = firstText(
    metadata.tool_name,
    latestToolResult?.name,
    latestToolResult?.tool,
    toolResultsCompat?.tool,
  );
  const toolNameKey = String(rawToolName || '').toLowerCase();
  const toolExecution = (
    metadata.tool_result && typeof metadata.tool_result === 'object'
      ? metadata.tool_result
      : latestToolResult
        ? {
            success: latestToolResult.success !== false,
            result:
              parsedLatestToolOutput ??
              latestToolResult.output ??
              latestToolResult.result ??
              latestToolResult.data ??
              latestToolResult,
            error: firstText(latestToolResult.error),
          }
      : (toolResultsCompat ? { success: true, result: toolResultsCompat } : undefined)
  ) as Record<string, any> | undefined;
  const toolArgs = metadata.tool_args as Record<string, any> | undefined;
  const isToolOperation = !isUser && !!rawToolName && !!toolExecution;
  const toolPayload = toolExecution ? (toolExecution.result ?? toolExecution.data ?? null) : null;
  const toolSuccess = toolExecution ? toolExecution.success !== false : true;
  const toolError = toolExecution ? firstText(toolExecution.error) : null;
  const toolErrorFriendly = React.useMemo(
    () => normalizeToolErrorMessage(toolNameKey, toolError),
    [toolError, toolNameKey]
  );
  const allowRawToolPayload = process.env.EXPO_PUBLIC_DASH_SHOW_RAW_TOOL_PAYLOAD === 'true';
  const generatedImages = (Array.isArray(metadata.generated_images) ? metadata.generated_images : [])
    .filter((img) => typeof img?.signed_url === 'string' && String(img.signed_url).trim().length > 0);
  const toolSummary = (() => {
    const explicitSummary = firstText(metadata.tool_summary);
    if (explicitSummary) return explicitSummary;
    if (!toolExecution) return null;
    const summary = firstText(
      toolPayload?.summary,
      toolPayload?.message,
      toolPayload?.status_message,
      toolPayload?.title,
    );
    if (summary) return summary;

    const count = typeof toolPayload?.count === 'number' ? toolPayload.count : null;
    const grade = firstText(toolPayload?.grade, toolPayload?.grade_level);
    const subject = firstText(toolPayload?.subject, toolPayload?.topic);
    const toolKey = toolNameKey;

    if (toolKey === 'get_caps_documents') {
      const target = [grade ? `Grade ${String(grade).replace(/^grade\s*/i, '')}` : null, subject]
        .filter(Boolean)
        .join(' ');
      if (count === 0) return `No CAPS documents found${target ? ` for ${target}` : ''}.`;
      if (count !== null) return `Found ${count} CAPS document${count === 1 ? '' : 's'}${target ? ` for ${target}` : ''}.`;
    }

    if (Array.isArray(toolPayload?.documents)) {
      const total = toolPayload.documents.length;
      return `Found ${total} document${total === 1 ? '' : 's'}.`;
    }
    if (Array.isArray(toolPayload?.recommendations)) {
      const total = toolPayload.recommendations.length;
      return `Generated ${total} recommendation${total === 1 ? '' : 's'}.`;
    }
    if (count !== null) {
      return `${count} result${count === 1 ? '' : 's'} returned.`;
    }
    return null;
  })();
  const toolMetaPills = (() => {
    if (!toolPayload || typeof toolPayload !== 'object') return [] as string[];
    const pills: string[] = [];
    const count = typeof toolPayload.count === 'number' ? toolPayload.count : null;
    const grade = firstText(toolPayload.grade, toolPayload.grade_level);
    const subject = firstText(toolPayload.subject, toolPayload.topic);
    const term = firstText(toolPayload.term, toolPayload.period, toolPayload.time_period);

    if (count !== null) pills.push(`${count} result${count === 1 ? '' : 's'}`);
    if (grade) pills.push(String(grade).toLowerCase().startsWith('grade') ? grade : `Grade ${grade}`);
    if (subject) pills.push(subject);
    if (term) pills.push(`Term ${term}`.replace(/\bterm term\b/i, 'Term'));
    return pills.slice(0, 4);
  })();
  const toolRawPayload = React.useMemo(() => {
    if (!toolExecution) return null;
    try {
      return JSON.stringify(toolPayload ?? toolExecution, null, 2);
    } catch {
      return null;
    }
  }, [toolExecution, toolPayload]);
  const toolChartPreview = React.useMemo(
    () => buildToolChartPreview(toolNameKey, toolArgs || null),
    [toolArgs, toolNameKey]
  );
  const pdfArtifactMetadata = metadata.pdf_artifact && typeof metadata.pdf_artifact === 'object'
    ? metadata.pdf_artifact as Record<string, any>
    : null;
  const toolDownloadUrl = firstText(
    pdfArtifactMetadata?.downloadUrl,
    pdfArtifactMetadata?.download_url,
    pdfArtifactMetadata?.signedUrl,
    pdfArtifactMetadata?.signed_url,
    toolPayload?.downloadUrl,
    toolPayload?.download_url,
    toolPayload?.signedUrl,
    toolPayload?.signed_url,
    toolPayload?.uri,
    toolPayload?.url,
  );
  const toolStoragePath = firstText(
    pdfArtifactMetadata?.storagePath,
    pdfArtifactMetadata?.storage_path,
    toolPayload?.storagePath,
    toolPayload?.storage_path
  );
  const isPdfToolOperation = isToolOperation && PDF_TOOL_NAMES.has(toolNameKey);
  const assistantPdfUrl = !isUser ? extractUrl(assistantContent || '') : undefined;
  const attachmentPdfUrl = firstText(
    ...(message.attachments || [])
      .filter((attachment) => attachment.kind === 'pdf' || /\.pdf$/i.test(String(attachment.name || '')))
      .flatMap((attachment) => [attachment.previewUri, attachment.uri]),
  );
  const pdfPreviewTarget = resolvePdfPreviewTarget({
    isPdfToolOperation,
    isToolOperation,
    toolDownloadUrl,
    toolStoragePath,
    extractedPdfUrl: isPdf ? url : null,
    attachmentPdfUrl,
    assistantPdfUrl,
  });
  const pdfPreviewUrl = pdfPreviewTarget.url;
  const hasPdfPreview = isPdfToolOperation
    ? !!pdfPreviewUrl || !!pdfPreviewTarget.storagePath
    : !!pdfPreviewUrl && isLikelyPdfUrl(pdfPreviewUrl);
  const toolFilename = firstText(
    pdfArtifactMetadata?.filename,
    pdfArtifactMetadata?.file_name,
    pdfArtifactMetadata?.name,
    toolPayload?.filename,
    toolPayload?.file_name,
    toolPayload?.name,
  );
  const toolLinkType = String(
    firstText(
      pdfArtifactMetadata?.linkType,
      pdfArtifactMetadata?.link_type,
      toolPayload?.linkType,
      toolPayload?.link_type
    ) || ''
  ).toLowerCase();
  const toolLinkStatus = isPdfToolOperation
    ? toolLinkType === 'signed'
      ? 'Secure link ready'
      : toolLinkType === 'local'
          ? 'Saved on this device'
          : 'Link unavailable'
    : '';
  const toolWarning = firstText(
    pdfArtifactMetadata?.warning,
    pdfArtifactMetadata?.warning_message,
    toolPayload?.warning,
    toolPayload?.warning_message
  );
  const conciseToolNarrative = toolSummary
    || (isPdfToolOperation ? 'PDF ready to open.' : (toolSuccess ? 'Task completed.' : 'Task needs attention.'));
  const assistantNarrative = String(assistantContent || '').trim();
  const hasVerboseAssistantNarrative = assistantNarrative.length > 220;
  const showToolNarrativeToggle = isToolOperation
    && hasVerboseAssistantNarrative
    && assistantNarrative !== conciseToolNarrative;
  const inlineAssistantUrl = sanitizeGeneratedPdfUrl(url);
  const inlineActionUrl = isPdfToolOperation ? pdfPreviewUrl : inlineAssistantUrl;
  const inlineActionIsPdf = isPdfToolOperation ? !!pdfPreviewUrl : isLikelyPdfUrl(inlineAssistantUrl);
  const openPdfPreview = React.useCallback(
    async (targetUrl: string, title?: string, storagePath?: string) => {
      const safeUrl = String(targetUrl || '').trim();
      const safeStoragePath = String(storagePath || '').trim();
      if (!safeUrl && !safeStoragePath) return;
      if (Platform.OS !== 'web') {
        try {
          router.push({
            pathname: '/screens/pdf-viewer',
            params: {
              ...(safeUrl ? { url: safeUrl } : {}),
              title: title || 'Generated PDF',
              ...(safeStoragePath ? { storagePath: safeStoragePath } : {}),
            },
          } as any);
          return;
        } catch {
          // fall through to external open
        }
      }
      try {
        if (!safeUrl) {
          Alert.alert('Unable to preview PDF', 'Please regenerate the PDF to refresh the preview link.');
          return;
        }
        if (Platform.OS === 'web') {
          window.open(safeUrl, '_blank');
        } else {
          const canOpen = await Linking.canOpenURL(safeUrl);
          if (!canOpen) throw new Error('UNSUPPORTED_URL');
          await Linking.openURL(safeUrl);
        }
      } catch {
        Alert.alert('Unable to preview PDF', 'Please try again from a stable connection.');
      }
    },
    [],
  );
  const markdownStyles = React.useMemo(() => buildMarkdownStyles(theme, isUser), [theme, isUser]);

  type RichSegment =
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

  const parseRichSegments = (content: string): RichSegment[] => {
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
    // Quiz blocks: ```quiz ... ```
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
    // Inline math: $...$ (single dollar, not preceded/followed by space+dollar)
    const withInlineMath = splitByPattern(withMath, /(?<!\$)\$(?!\$)([^\$\n]+?)(?<!\$)\$(?!\$)/g, (value) => ({
      type: 'inlineMath',
      content: value,
    }));

    return withInlineMath.filter((segment) => {
      if (segment.type === 'markdown') return segment.content.trim().length > 0;
      return segment.content.length > 0;
    });
  };

  const safeParseQuizJson = (raw: string): QuizQuestionPayload | null => {
    const cleaned = String(raw || '').trim();
    if (!cleaned) return null;

    // First try the InlineQuizCard parser contract.
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
      // Keep null fallback to fenced markdown render below.
    }

    return null;
  };

  const safeParseColumnJson = (raw: string): ColumnMethodPayload | null => {
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
      // Keep null fallback to fenced markdown render below.
    }

    return null;
  };

  const safeParseSpellingJson = (raw: string): SpellingPracticePayload | null => {
    let cleaned = String(raw || '').trim();
    if (!cleaned) return null;

    const wrapped = `\`\`\`spelling\n${cleaned}\n\`\`\``;
    let parsed = parseSpellingPayload(wrapped);
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

  const BubbleSurface: React.ElementType = isUser ? LinearGradient : View;
  const bubbleSurfaceProps = isUser
    ? { 
        colors: userGradient, 
        start: { x: 0, y: 0 }, 
        end: { x: 1, y: 1 } 
      }
    : {};
  
  // Enhanced bubble shadows for depth
  const bubbleShadow = Platform.OS === 'ios'
    ? {
        shadowColor: isUser ? theme.primary : '#000',
        shadowOffset: { width: 0, height: isUser ? 4 : 2 },
        shadowOpacity: isUser ? 0.3 : 0.1,
        shadowRadius: isUser ? 12 : 8,
      }
    : {
        elevation: isUser ? 5 : 2,
      };

  return (
    <View
      style={[
        styles.messageContainer,
        isUser ? styles.userMessage : styles.assistantMessage,
      ]}
    >
      <BubbleSurface
        {...bubbleSurfaceProps}
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          { alignSelf: isUser ? 'flex-end' : 'flex-start' },
          !isUser && isToolOperation
            ? { width: '96%', minWidth: 260 }
            : null,
          isUser
            ? { 
                borderColor: 'rgba(255,255,255,0.3)', 
                borderWidth: 0.5 
              }
            : { 
                backgroundColor: theme.surface, 
                borderColor: theme.border, 
                borderWidth: 1.5 
              },
          bubbleShadow,
        ]}
      >
        {!isUser && (
          <View style={styles.messageHeaderRow}>
            <View style={styles.messageHeaderLeft}>
              <View style={[styles.inlineAvatar, { backgroundColor: theme.primary }]}>
                <Ionicons name="sparkles" size={12} color={theme.onPrimary} />
              </View>
              <Text style={[styles.messageRoleLabel, { color: theme.text }]}>
                {assistantLabel || 'Dash'}
              </Text>
            </View>
          </View>
        )}
        <View style={styles.messageContentRow}>
          {shouldOfferRetake && (
            <View
              style={{
                width: '100%',
                marginBottom: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: warningColor + '66',
                backgroundColor: warningColor + '18',
                padding: 10,
                gap: 6,
              }}
            >
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>
                Scan clarity check
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                {Number.isNaN(confidenceScore)
                  ? 'Dash detected uncertain text in this image. Retake for better OCR and more accurate help.'
                  : `OCR confidence: ${Math.round(confidenceScore * 100)}%. Retake for clearer analysis if needed.`}
              </Text>
              {unclearSpans.length > 0 && (
                <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                  Unclear: {unclearSpans.join(' | ')}
                </Text>
              )}
              <TouchableOpacity
                onPress={() => onRetakeForClarity?.(message)}
                style={{
                  marginTop: 2,
                  alignSelf: 'flex-start',
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  backgroundColor: warningColor + '2B',
                  borderWidth: 1,
                  borderColor: warningColor + '88',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
                accessibilityRole="button"
                accessibilityLabel="Retake scan for clarity"
              >
                <Ionicons name="scan-outline" size={14} color={warningColor} />
                <Text style={{ color: warningColor, fontSize: 12, fontWeight: '700' }}>
                  Retake for clarity
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {showPracticeMicrocopy && (
            <View
              style={{
                width: '100%',
                marginBottom: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.primary + '44',
                backgroundColor: theme.primary + '14',
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>
                This is a Tutor Practice Question (not a formal exam).
              </Text>
            </View>
          )}
          {isToolOperation ? (
            <View
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: toolSuccess ? theme.primary + '44' : theme.error + '44',
                backgroundColor: toolSuccess ? theme.primary + '12' : theme.error + '10',
                gap: 8,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexGrow: 1, flexShrink: 1, minWidth: 0, paddingRight: 6 }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: toolSuccess ? theme.primary + '22' : theme.error + '22',
                    }}
                  >
                    <Ionicons
                      name={toolSuccess ? 'checkmark-done-outline' : 'alert-circle-outline'}
                      size={14}
                      color={toolSuccess ? theme.primary : theme.error}
                    />
                  </View>
                  <Text
                    style={{ color: theme.text, fontSize: 13, fontWeight: '700', flexShrink: 1, flexGrow: 1, minWidth: 0 }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {prettifyToolName(rawToolName || undefined)}
                  </Text>
                </View>
                <View
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    backgroundColor: toolSuccess ? theme.success + '22' : theme.error + '22',
                    alignSelf: 'flex-start',
                    flexShrink: 0,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: toolSuccess ? (theme.success || '#16a34a') : theme.error,
                      textTransform: 'uppercase',
                    }}
                  >
                    {toolSuccess ? 'Done' : 'Error'}
                  </Text>
                </View>
              </View>

              {(conciseToolNarrative || assistantNarrative) && (
                <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
                  {showToolNarrativeToggle ? conciseToolNarrative : (conciseToolNarrative || assistantNarrative)}
                </Text>
              )}
              {showToolNarrativeToggle && (
                <TouchableOpacity
                  onPress={() => setShowFullToolNarrative((prev) => !prev)}
                  style={{
                    alignSelf: 'flex-start',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={showFullToolNarrative ? 'Hide full assistant response' : 'View full assistant response'}
                >
                  <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }}>
                    {showFullToolNarrative ? 'Hide full response' : 'View full response'}
                  </Text>
                </TouchableOpacity>
              )}
              {showToolNarrativeToggle && showFullToolNarrative && (
                <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 18 }}>
                  {assistantNarrative}
                </Text>
              )}

              {toolMetaPills.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {toolMetaPills.map((pill) => (
                    <View
                      key={pill}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                      }}
                    >
                      <Text style={{ color: theme.text, fontSize: 11, fontWeight: '600' }}>{pill}</Text>
                    </View>
                  ))}
                </View>
              )}

              {isPdfToolOperation && (
                <View
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    padding: 10,
                    gap: 5,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="document-text-outline" size={15} color={theme.primary} />
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>
                      PDF Export
                    </Text>
                  </View>
                  {toolFilename && (
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
                      {toolFilename}
                    </Text>
                  )}
                  <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                    {toolLinkStatus || 'File prepared'}
                  </Text>
                  {toolWarning && (
                    <Text style={{ color: theme.warning || '#d97706', fontSize: 11 }} numberOfLines={2}>
                      {toolWarning}
                    </Text>
                  )}
                  {hasPdfPreview && (
                    <TouchableOpacity
                      onPress={() =>
                        openPdfPreview(
                          pdfPreviewUrl || '',
                          toolFilename || 'Generated PDF',
                          pdfPreviewTarget.storagePath || toolStoragePath || undefined,
                        )
                      }
                      style={{
                        alignSelf: 'flex-start',
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderWidth: 1,
                        borderColor: theme.primary + '55',
                        backgroundColor: theme.primary + '18',
                        marginTop: 4,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel="Preview generated PDF"
                    >
                      <Ionicons name="document-text-outline" size={13} color={theme.primary} />
                      <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>
                        Preview PDF
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {toolChartPreview && (
                <View
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    padding: 12,
                    gap: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', flex: 1 }}>
                      {toolChartPreview.title}
                    </Text>
                    <View
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.surfaceVariant,
                      }}
                    >
                      <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                        {toolChartPreview.type}
                      </Text>
                    </View>
                  </View>

                  {toolChartPreview.type === 'pie' ? (
                    <>
                      <View
                        style={{
                          height: 14,
                          borderRadius: 999,
                          overflow: 'hidden',
                          flexDirection: 'row',
                          backgroundColor: theme.surfaceVariant || '#e2e8f0',
                        }}
                      >
                        {toolChartPreview.points.map((point, pointIndex) => (
                          <View
                            key={`pie-segment-${pointIndex}`}
                            style={{
                              flex: Math.max(Math.abs(point.value), 0.5),
                              backgroundColor: point.color,
                            }}
                          />
                        ))}
                      </View>
                      <View style={{ gap: 6 }}>
                        {toolChartPreview.points.map((point, pointIndex) => (
                          <View
                            key={`pie-legend-${pointIndex}`}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: point.color }} />
                              <Text
                                style={{ color: theme.textSecondary, fontSize: 12, flexShrink: 1 }}
                                numberOfLines={1}
                              >
                                {point.label}
                              </Text>
                            </View>
                            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>
                              {point.value}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, minHeight: 120 }}>
                        {(() => {
                          const maxValue = Math.max(
                            1,
                            ...toolChartPreview.points.map((point) => Math.abs(point.value))
                          );
                          return toolChartPreview.points.map((point, pointIndex) => {
                            const barHeight = Math.max(12, Math.round((Math.abs(point.value) / maxValue) * 84));
                            return (
                              <View key={`bar-${pointIndex}`} style={{ width: 46, alignItems: 'center', gap: 4 }}>
                                <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }}>
                                  {point.value}
                                </Text>
                                <View
                                  style={{
                                    width: 28,
                                    borderRadius: 7,
                                    backgroundColor: point.color,
                                    height: barHeight,
                                  }}
                                />
                                <Text
                                  style={{ color: theme.textSecondary, fontSize: 10, textAlign: 'center' }}
                                  numberOfLines={1}
                                >
                                  {point.label}
                                </Text>
                              </View>
                            );
                          });
                        })()}
                      </View>
                    </ScrollView>
                  )}

                  <TouchableOpacity
                    onPress={() => setExpandedVisual({
                      type: 'chart',
                      title: toolChartPreview.title,
                      chart: toolChartPreview,
                    })}
                    style={{
                      alignSelf: 'flex-start',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderWidth: 1,
                      borderColor: theme.primary + '55',
                      backgroundColor: theme.primary + '16',
                    }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Expand chart for easier viewing"
                  >
                    <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>
                      Expand chart
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {toolDownloadUrl && (
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      const canOpen = await Linking.canOpenURL(toolDownloadUrl);
                      if (!canOpen) throw new Error('UNSUPPORTED_URL');
                      await Linking.openURL(toolDownloadUrl);
                    } catch {
                      Alert.alert('Unable to open file', 'Please try again from a stable connection.');
                    }
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderWidth: 1,
                    borderColor: theme.primary + '55',
                    backgroundColor: theme.primary + '16',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Open generated file"
                >
                  <Ionicons name="open-outline" size={14} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>
                    {isPdfToolOperation ? 'Open Externally' : 'Open Generated File'}
                  </Text>
                </TouchableOpacity>
              )}

              {allowRawToolPayload && toolRawPayload && (
                <TouchableOpacity
                  onPress={() => setShowRawToolPayload((prev) => !prev)}
                  style={{
                    alignSelf: 'flex-start',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={showRawToolPayload ? 'Hide raw tool output' : 'View raw tool output'}
                >
                  <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }}>
                    {showRawToolPayload ? 'Hide raw output' : 'View raw output'}
                  </Text>
                </TouchableOpacity>
              )}

              {allowRawToolPayload && showRawToolPayload && toolRawPayload && (
                <View
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: '#0f172a',
                    maxHeight: 220,
                    overflow: 'hidden',
                  }}
                >
                  <ScrollView
                    style={{ maxHeight: 220 }}
                    contentContainerStyle={{ padding: 10 }}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={true}
                  >
                    <Text
                      selectable
                      style={{
                        color: '#cbd5e1',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        lineHeight: 16,
                      }}
                    >
                      {toolRawPayload}
                    </Text>
                  </ScrollView>
                </View>
              )}

              {!toolSuccess && toolErrorFriendly && (
                <Text style={{ color: theme.error, fontSize: 12, lineHeight: 17 }}>
                  {toolErrorFriendly}
                </Text>
              )}
            </View>
          ) : isUser ? (
            <Text
              style={[
                styles.messageText,
                { color: isUser ? theme.onPrimary : theme.text },
              ]}
              selectable={true}
              selectionColor={isUser ? 'rgba(255,255,255,0.3)' : theme.primaryLight}
            >
              {isUser ? userContent : assistantDisplayText}
            </Text>
          ) : (
            <View style={{ width: '100%' }}>
              {parseRichSegments(assistantDisplayText).map((segment, segmentIndex) => {
                if (segment.type === 'math') {
                  return (
                    <MathRenderer
                      key={`math-${message.id}-${segmentIndex}`}
                      expression={segment.content}
                      displayMode
                    />
                  );
                }
                if (segment.type === 'inlineMath') {
                  return (
                    <MathRenderer
                      key={`imath-${message.id}-${segmentIndex}`}
                      expression={segment.content}
                      displayMode={false}
                    />
                  );
                }
                if (segment.type === 'mermaid') {
                  return (
                    <View key={`mermaid-${message.id}-${segmentIndex}`}>
                      <MermaidRenderer definition={segment.content} />
                      <TouchableOpacity
                        onPress={() => setExpandedVisual({
                          type: 'mermaid',
                          title: 'Diagram',
                          definition: segment.content,
                        })}
                        style={{
                          alignSelf: 'flex-start',
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderWidth: 1,
                          borderColor: theme.primary + '55',
                          backgroundColor: theme.primary + '16',
                          marginBottom: 6,
                        }}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Expand diagram for easier viewing"
                      >
                        <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>
                          Expand diagram
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }
                if (segment.type === 'quiz') {
                  const payload = safeParseQuizJson(segment.content);
                  if (payload) {
                    return (
                      <InlineQuizCard
                        key={`quiz-${message.id}-${segmentIndex}`}
                        payload={payload}
                        onAnswer={(answer) => onSendFollowUp(answer)}
                      />
                    );
                  }
                  return null;
                }
                if (segment.type === 'column') {
                  const payload = safeParseColumnJson(segment.content);
                  if (payload) {
                    return (
                      <InlineColumnMethodCard
                        key={`column-${message.id}-${segmentIndex}`}
                        payload={payload}
                      />
                    );
                  }
                  return null;
                }
                if (segment.type === 'spelling') {
                  const payload = safeParseSpellingJson(segment.content);
                  if (payload) {
                    return (
                      <InlineSpellingPracticeCard
                        key={`spelling-${message.id}-${segmentIndex}`}
                        payload={payload}
                      />
                    );
                  }
                  // Never show raw JSON; omit unparseable spelling blocks
                  return null;
                }
                return (
                  Markdown ? (
                    <Markdown key={`md-${message.id}-${segmentIndex}`} style={markdownStyles}>
                      {segment.content}
                    </Markdown>
                  ) : (
                    <Text
                      key={`md-fallback-${message.id}-${segmentIndex}`}
                      style={[
                        styles.messageText,
                        { color: theme.text },
                      ]}
                      selectable={true}
                    >
                      {segment.content}
                    </Text>
                  )
                );
              })}
            </View>
          )}
        </View>
        
        {/* Voice note indicator */}
        {message.voiceNote && (
          <View style={styles.voiceNoteIndicator}>
            <Ionicons 
              name="mic" 
              size={12} 
              color={isUser ? theme.onPrimary : theme.textSecondary} 
            />
            <Text
              style={[
                styles.voiceNoteDuration,
                { color: isUser ? theme.onPrimary : theme.textSecondary },
              ]}
            >
              {Math.round((message.voiceNote.duration || 0) / 1000)}s
            </Text>
          </View>
        )}
        
        {/* Image previews */}
        {message.attachments && message.attachments.some((a) => a.kind === 'image') && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.imagePreviewRow}
          >
            {message.attachments
              .filter((attachment) => attachment.kind === 'image')
              .map((attachment, idx) => (
                <AttachmentImagePreview key={`${attachment.id}-${idx}`} attachment={attachment} isUser={isUser} />
              ))}
          </ScrollView>
        )}
        {generatedImages.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.imagePreviewRow}
          >
            {generatedImages.map((image, idx) => (
              <TouchableOpacity
                key={`generated-${message.id}-${idx}`}
                style={[
                  styles.imagePreviewCard,
                  { borderColor: isUser ? 'rgba(255,255,255,0.2)' : theme.border },
                ]}
                onPress={() => setExpandedVisual({
                  type: 'image',
                  title: 'Generated image',
                  uri: String(image.signed_url),
                })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Expand generated image"
              >
                <Image source={{ uri: String(image.signed_url) }} style={styles.imagePreview} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Attachments display (non-image only — images already shown as visual previews above) */}
        {message.attachments && message.attachments.some((a) => a.kind !== 'image') && (
          <View style={styles.messageAttachmentsContainer}>
            {message.attachments
              .filter((attachment) => attachment.kind !== 'image')
              .map((attachment, idx) => {
                const attachmentUrl = firstText(attachment.previewUri, attachment.uri);
                const attachmentIsPdf = attachment.kind === 'pdf' || /\.pdf$/i.test(String(attachment.name || ''));
                return (
                  <View
                    key={idx}
                    style={[
                      styles.messageAttachment,
                      {
                        backgroundColor: isUser
                          ? 'rgba(255, 255, 255, 0.2)'
                          : theme.surfaceVariant,
                        borderColor: isUser ? 'rgba(255, 255, 255, 0.3)' : theme.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={getFileIconName(attachment.kind)}
                      size={14}
                      color={isUser ? theme.onPrimary : theme.text}
                    />
                    <Text
                      style={[
                        styles.messageAttachmentName,
                        { color: isUser ? theme.onPrimary : theme.text },
                      ]}
                      numberOfLines={1}
                    >
                      {attachment.name}
                    </Text>
                    <Text
                      style={[
                        styles.messageAttachmentSize,
                        { color: isUser ? theme.onPrimary : theme.textSecondary },
                      ]}
                    >
                      {formatFileSize(attachment.size)}
                    </Text>
                    {attachmentIsPdf && attachmentUrl && (
                      <TouchableOpacity
                        onPress={() => openPdfPreview(attachmentUrl, attachment.name || 'Attachment PDF')}
                        style={{
                          marginLeft: 6,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: isUser ? 'rgba(255,255,255,0.4)' : theme.primary + '55',
                          backgroundColor: isUser ? 'rgba(0,0,0,0.16)' : theme.primary + '12',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Preview PDF attachment"
                      >
                        <Text
                          style={{
                            color: isUser ? theme.onPrimary : theme.primary,
                            fontSize: 10,
                            fontWeight: '700',
                          }}
                        >
                          Preview
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
          </View>
        )}

        {/* Follow-up question chips */}
        {!isUser && suggestions && suggestions.length > 0 && (
          <View style={styles.followUpContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.followUpScroll}
            >
              {suggestions.map((q: string, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.followUpChip, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => onSendFollowUp(q)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Send: ${q}`}
                >
                  <Text style={[styles.followUpText, { color: theme.text }]} numberOfLines={1}>
                    {q}
                  </Text>
                  <Ionicons name="send" size={14} color={theme.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        
        {/* PDF/Link quick action */}
        {!isUser && inlineActionUrl && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
            <TouchableOpacity
              style={[styles.inlineSpeakButton, { backgroundColor: inlineActionIsPdf ? theme.primary : theme.accent }]}
              onPress={() => {
                if (!inlineActionUrl) return;
                if (inlineActionIsPdf) {
                  void openPdfPreview(inlineActionUrl, toolFilename || 'Generated PDF');
                  return;
                }
                if (Platform.OS === 'web') {
                  window.open(inlineActionUrl, '_blank');
                } else {
                  Linking.openURL(inlineActionUrl).catch(() => Alert.alert('Open failed', 'Could not open the link'));
                }
              }}
              accessibilityLabel={inlineActionIsPdf ? 'Open PDF' : 'Open link'}
              activeOpacity={0.8}
            >
              <Ionicons name={inlineActionIsPdf ? 'document' : 'open-outline'} size={12} color={theme.onAccent || '#fff'} />
            </TouchableOpacity>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
              {inlineActionIsPdf ? 'Preview PDF' : 'Open link'}
            </Text>
          </View>
        )}

        {/* Bottom row with avatar, speak button and timestamp */}
        <View style={styles.messageBubbleFooter}>
          {!isUser && (
            <>
              <TouchableOpacity
                style={[
                  styles.inlineSpeakButton, 
                  { 
                    backgroundColor: speakingMessageId === message.id ? theme.error : theme.accent,
                    opacity: voiceEnabled ? 1 : 0.5,
                  }
                ]}
                onPress={() => onSpeak(message)}
                disabled={!voiceEnabled}
                activeOpacity={0.7}
                accessibilityLabel={speakingMessageId === message.id ? "Stop audio" : "Play audio"}
              >
                <Ionicons 
                  name={speakingMessageId === message.id ? "stop" : "play"} 
                  size={12} 
                  color={speakingMessageId === message.id ? theme.onError || theme.background : theme.onAccent} 
                />
              </TouchableOpacity>
            </>
          )}
          {isUser && isLastUserMessage && !isLoading && (
            <TouchableOpacity
              style={[
                styles.inlineFooterRetryButton,
                {
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderColor: 'rgba(255,255,255,0.32)',
                },
              ]}
              onPress={() => onRetry(message.content)}
              accessibilityLabel="Retry last message"
              activeOpacity={0.78}
            >
              <Ionicons name="refresh" size={12} color={theme.onPrimary} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          <Text
            style={[
              styles.messageTime,
              { color: isUser ? 'rgba(255,255,255,0.72)' : theme.textTertiary },
            ]}
          >
            {new Date(message.timestamp).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
        </View>
      </BubbleSurface>

      <Modal
        visible={!!expandedVisual}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedVisual(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(2,6,23,0.84)',
            justifyContent: 'center',
            paddingHorizontal: 16,
            paddingVertical: 24,
          }}
        >
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.background,
              padding: 12,
              maxHeight: '92%',
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                {expandedVisual?.title || 'Expanded view'}
              </Text>
              <TouchableOpacity
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.surfaceVariant,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
                onPress={() => setExpandedVisual(null)}
                accessibilityLabel="Close expanded visual"
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            {expandedVisual?.type === 'image' && (
              <Image
                source={{ uri: expandedVisual.uri }}
                style={{ width: '100%', minHeight: 260, maxHeight: 540, borderRadius: 12 }}
                resizeMode="contain"
              />
            )}

            {expandedVisual?.type === 'mermaid' && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <MermaidRenderer definition={expandedVisual.definition} height={420} />
                <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 8 }}>
                  Pinch zoom is supported in the system image viewer if you need larger detail.
                </Text>
              </ScrollView>
            )}

            {expandedVisual?.type === 'chart' && (
              <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 10 }}>
                <View
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    padding: 10,
                    gap: 8,
                  }}
                >
                  {expandedVisual.chart.points.map((point, idx) => (
                    <View
                      key={`expanded-chart-${idx}`}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: point.color }} />
                        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flexShrink: 1 }}>
                          {point.label}
                        </Text>
                      </View>
                      <Text style={{ color: theme.textSecondary, fontSize: 14, fontWeight: '700' }}>
                        {point.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};
