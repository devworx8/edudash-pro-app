/**
 * DashMessageBubble Component
 * 
 * Renders individual chat messages for the Dash AI Assistant.
 * Extracted from DashAssistant for better maintainability.
 */

import React from 'react';
import { View, Text, TouchableOpacity, Platform, Linking, Alert, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { messageStyles as styles } from './styles/message.styles';
import { useTheme } from '@/contexts/ThemeContext';
import type { DashMessage } from '@/services/dash-ai/types';
import { getFileIconName, formatFileSize } from '@/services/AttachmentService';
import { LinearGradient } from 'expo-linear-gradient';
import { MathRenderer } from './MathRenderer';
import { MermaidRenderer } from './MermaidRenderer';
import InlineQuizCard from './InlineQuizCard';
import InlineColumnMethodCard from './InlineColumnMethodCard';
import InlineSpellingPracticeCard from './InlineSpellingPracticeCard';
import { AttachmentImagePreview } from './AttachmentImagePreview';
import { ExpandedVisualModal } from './ExpandedVisualModal';
import {
  parseRichSegments,
  safeParseQuizJson,
  safeParseColumnJson,
  safeParseSpellingJson,
} from './DashMessageBubble.rich';
import {
  resolvePdfPreviewTarget,
  sanitizeGeneratedPdfUrl,
} from './pdfPreviewUtils';
import { isValidFollowUp } from '@/hooks/dash-assistant/assistantHelpers';
import {
  buildMarkdownStyles,
  buildToolChartPreview,
  firstText,
  isLikelyPdfUrl,
  normalizeInteractiveJsonFences,
  normalizeToolErrorMessage,
  PDF_TOOL_NAMES,
  prettifyToolName,
  replaceVisualPlaceholders,
  stripRawInteractiveJsonFromProse,
  type ExpandedVisualState,
  type ToolChartPreview,
} from './DashMessageBubble.utils';

const isWeb = Platform.OS === 'web';
let Markdown: React.ComponentType<any> | null = null;
if (!isWeb) {
  try {
    Markdown = require('react-native-markdown-display').default;
  } catch (e) {
    console.warn('[DashMessageBubble] Markdown not available:', e);
  }
}

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
      <ExpandedVisualModal
        expandedVisual={expandedVisual}
        onClose={() => setExpandedVisual(null)}
      />
    </View>
  );
};
