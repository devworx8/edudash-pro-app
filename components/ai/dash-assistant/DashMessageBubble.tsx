/**
 * DashMessageBubble Component
 *
 * Orchestrates individual chat message rendering.
 * Sub-components: DashToolResultCard, DashMessageImages, DashMessageAttachments, DashMessageFooter
 */

import React from 'react';
import { View, Text, TouchableOpacity, Platform, Linking } from 'react-native';
import { toast } from '@/components/ui/ToastProvider';
import { Ionicons } from '@expo/vector-icons';
import { messageStyles as styles } from './styles/message.styles';
import { useTheme } from '@/contexts/ThemeContext';
import type { DashMessage } from '@/services/dash-ai/types';
import { LinearGradient } from 'expo-linear-gradient';
import { MathRenderer } from './MathRenderer';
import { MermaidRenderer } from './MermaidRenderer';
import InlineQuizCard from './InlineQuizCard';
import InlineColumnMethodCard from './InlineColumnMethodCard';
import InlineSpellingPracticeCard from './InlineSpellingPracticeCard';
import { ExpandedVisualModal } from './ExpandedVisualModal';
import { DashToolResultCard } from './DashToolResultCard';
import { DashMessageImages } from './DashMessageImages';
import { DashMessageAttachments } from './DashMessageAttachments';
import { DashMessageFooter } from './DashMessageFooter';
import { parseRichSegments, safeParseQuizJson, safeParseColumnJson, safeParseSpellingJson } from './DashMessageBubble.rich';
import { openPdfPreview } from './pdfPreviewUtils';
import { buildMarkdownStyles, stripMarkdownForDisplay, type ExpandedVisualState } from './DashMessageBubble.utils';
import { useDashMessageMeta } from '@/hooks/dash-assistant/useDashMessageMeta';

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
  onSpeak: (message: DashMessage) => void;
  onRetry: (content: string, attachments?: any[]) => void;
  onSendFollowUp: (text: string, attachments?: any[]) => void;
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
  onSpeak,
  onRetry,
  onSendFollowUp,
  assistantLabel,
  onRetakeForClarity,
}) => {
  const { theme, isDark } = useTheme();
  const warningColor = theme.warning || '#d97706';
  const isUser = message.type === 'user';
  const [expandedVisual, setExpandedVisual] = React.useState<ExpandedVisualState | null>(null);
  const imageAttachments = (message.attachments || []).filter((attachment) => attachment.kind === 'image');
  const nonImageAttachments = (message.attachments || []).filter((attachment) => attachment.kind !== 'image');
  const hasStandaloneUserMedia = isUser && imageAttachments.length > 0;

  React.useEffect(() => { setExpandedVisual(null); }, [message.id]);

  const isLatestMessage = index === totalMessages - 1;
  const isLastUserMessage = isUser && index >= totalMessages - 2;

  const meta = useDashMessageMeta(message, isUser, isLoading, isLatestMessage, onRetakeForClarity);
  const markdownStyles = React.useMemo(() => buildMarkdownStyles(theme, isUser), [theme, isUser]);

  const userGradient = isDark
    ? [theme.primaryDark || '#1e40af', theme.primary, theme.accentDark || '#7c3aed']
    : ['#0ea5e9', '#3b82f6', '#6366f1'];

  const BubbleSurface: React.ElementType = isUser ? LinearGradient : View;
  const bubbleSurfaceProps = isUser ? { colors: userGradient, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } : {};
  const bubbleShadow = Platform.OS === 'ios'
    ? { shadowColor: isUser ? theme.primary : '#000', shadowOffset: { width: 0, height: isUser ? 4 : 2 }, shadowOpacity: isUser ? 0.3 : 0.1, shadowRadius: isUser ? 12 : 8 }
    : { elevation: isUser ? 5 : 2 };

  const handleInlineAction = React.useCallback(() => {
    if (!meta.inlineActionUrl) return;
    if (meta.inlineActionIsPdf) {
      void openPdfPreview(meta.inlineActionUrl, undefined);
      return;
    }
    if (Platform.OS === 'web') {
      window.open(meta.inlineActionUrl, '_blank');
    } else {
      Linking.openURL(meta.inlineActionUrl).catch(() => toast.error('Could not open the link'));
    }
  }, [meta.inlineActionUrl, meta.inlineActionIsPdf]);

  if (hasStandaloneUserMedia) {
    return (
      <View style={[styles.messageContainer, styles.userMessage]}>
        <View style={styles.userMessageStack}>
          {meta.userContent.trim() ? (
            <BubbleSurface
              {...bubbleSurfaceProps}
              style={[
                styles.messageBubble,
                styles.userBubble,
                styles.userTextBubble,
                { alignSelf: 'flex-end' },
                { borderColor: 'rgba(255,255,255,0.3)', borderWidth: 0.5 },
                bubbleShadow,
              ]}
            >
              <Text style={[styles.messageText, { color: theme.onPrimary }]} selectable selectionColor="rgba(255,255,255,0.3)">
                {meta.userContent}
              </Text>
            </BubbleSurface>
          ) : null}

          <View style={styles.userStandaloneMediaContainer}>
            <DashMessageImages
              message={message}
              isUser={isUser}
              generatedImages={meta.generatedImages}
              onSendFollowUp={onSendFollowUp}
              onRetakeForClarity={onRetakeForClarity}
              onExpandVisual={setExpandedVisual}
              flushTop
            />
            {nonImageAttachments.length > 0 && (
              <DashMessageAttachments
                message={{ ...message, attachments: nonImageAttachments }}
                isUser={isUser}
              />
            )}
            <DashMessageFooter
              message={message}
              isUser={isUser}
              speakingMessageId={speakingMessageId}
              voiceEnabled={voiceEnabled}
              isLastUserMessage={isLastUserMessage}
              isLoading={isLoading}
              inlineActionUrl={meta.inlineActionUrl}
              inlineActionIsPdf={meta.inlineActionIsPdf}
              onSpeak={onSpeak}
              onRetry={onRetry}
              onInlineAction={handleInlineAction}
            />
          </View>
        </View>

        <ExpandedVisualModal expandedVisual={expandedVisual} onClose={() => setExpandedVisual(null)} />
      </View>
    );
  }

  return (
    <View style={[styles.messageContainer, isUser ? styles.userMessage : styles.assistantMessage]}>
      <BubbleSurface
        {...bubbleSurfaceProps}
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          { alignSelf: isUser ? 'flex-end' : 'flex-start' },
          !isUser && meta.isToolOperation ? { width: '96%', minWidth: 260 } : null,
          isUser
            ? { borderColor: 'rgba(255,255,255,0.3)', borderWidth: 0.5 }
            : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1.5 },
          bubbleShadow,
        ]}
      >
        {/* Assistant label */}
        {!isUser && (
          <View style={styles.messageHeaderRow}>
            <View style={styles.messageHeaderLeft}>
              <View style={[styles.inlineAvatar, { backgroundColor: theme.primary }]}>
                <Ionicons name="sparkles" size={12} color={theme.onPrimary} />
              </View>
              <Text style={[styles.messageRoleLabel, { color: theme.text }]}>{assistantLabel || 'Dash'}</Text>
            </View>
          </View>
        )}

        <View style={styles.messageContentRow}>
          {/* Retake clarity banner */}
          {meta.shouldOfferRetake && (
            <View style={{ width: '100%', marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: warningColor + '66', backgroundColor: warningColor + '18', padding: 10, gap: 6 }}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Scan clarity check</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                {Number.isNaN(meta.confidenceScore)
                  ? 'Dash detected uncertain text in this image. Retake for better OCR and more accurate help.'
                  : `OCR confidence: ${Math.round(meta.confidenceScore * 100)}%. Retake for clearer analysis if needed.`}
              </Text>
              {meta.unclearSpans.length > 0 && (
                <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>Unclear: {meta.unclearSpans.join(' | ')}</Text>
              )}
              <TouchableOpacity onPress={() => onRetakeForClarity?.(message)} style={{ marginTop: 2, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: warningColor + '2B', borderWidth: 1, borderColor: warningColor + '88', flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityRole="button" accessibilityLabel="Retake scan for clarity">
                <Ionicons name="scan-outline" size={14} color={warningColor} />
                <Text style={{ color: warningColor, fontSize: 12, fontWeight: '700' }}>Retake for clarity</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Tutor practice microcopy */}
          {meta.showPracticeMicrocopy && (
            <View style={{ width: '100%', marginBottom: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.primary + '44', backgroundColor: theme.primary + '14', paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>This is a Tutor Practice Question (not a formal exam).</Text>
            </View>
          )}

          {/* Main content */}
          {meta.isToolOperation ? (
            <DashToolResultCard
              toolSuccess={meta.toolSuccess}
              rawToolName={meta.rawToolName}
              toolMetaPills={meta.toolMetaPills}
              toolChartPreview={meta.toolChartPreview}
              isPdfToolOperation={meta.isPdfToolOperation}
              hasPdfPreview={meta.hasPdfPreview}
              pdfPreviewUrl={meta.pdfPreviewUrl}
              pdfPreviewTarget={meta.pdfPreviewTarget}
              toolStoragePath={meta.toolStoragePath}
              toolFilename={meta.toolFilename}
              toolLinkStatus={meta.toolLinkStatus}
              toolWarning={meta.toolWarning}
              toolDownloadUrl={meta.toolDownloadUrl}
              toolRawPayload={meta.toolRawPayload}
              allowRawToolPayload={meta.allowRawToolPayload}
              assistantNarrative={meta.assistantNarrative}
              conciseToolNarrative={meta.conciseToolNarrative}
              showToolNarrativeToggle={meta.showToolNarrativeToggle}
              toolErrorFriendly={meta.toolErrorFriendly}
              onExpandVisual={setExpandedVisual}
            />
          ) : isUser ? (
            meta.userContent.trim() ? (
              <Text style={[styles.messageText, { color: theme.onPrimary }]} selectable selectionColor="rgba(255,255,255,0.3)">
                {meta.userContent}
              </Text>
            ) : null
          ) : (
            <View style={{ width: '100%' }}>
              {parseRichSegments(meta.assistantDisplayText).map((segment, segmentIndex) => {
                if (segment.type === 'math') {
                  return <MathRenderer key={`math-${message.id}-${segmentIndex}`} expression={segment.content} displayMode />;
                }
                if (segment.type === 'inlineMath') {
                  return <MathRenderer key={`imath-${message.id}-${segmentIndex}`} expression={segment.content} displayMode={false} />;
                }
                if (segment.type === 'mermaid') {
                  return (
                    <View key={`mermaid-${message.id}-${segmentIndex}`}>
                      <MermaidRenderer definition={segment.content} />
                      <TouchableOpacity onPress={() => setExpandedVisual({ type: 'mermaid', title: 'Diagram', definition: segment.content })} style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.primary + '55', backgroundColor: theme.primary + '16', marginBottom: 6 }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Expand diagram for easier viewing">
                        <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>Expand diagram</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }
                if (segment.type === 'quiz') {
                  const payload = safeParseQuizJson(segment.content);
                  if (payload) return <InlineQuizCard key={`quiz-${message.id}-${segmentIndex}`} payload={payload} onAnswer={(answer) => onSendFollowUp(answer)} />;
                  return null;
                }
                if (segment.type === 'column') {
                  const payload = safeParseColumnJson(segment.content);
                  if (payload) return <InlineColumnMethodCard key={`column-${message.id}-${segmentIndex}`} payload={payload} />;
                  return null;
                }
                if (segment.type === 'spelling') {
                  const payload = safeParseSpellingJson(segment.content);
                  if (payload) return <InlineSpellingPracticeCard key={`spelling-${message.id}-${segmentIndex}`} payload={payload} />;
                  return null;
                }
                return Markdown ? (
                  <Markdown key={`md-${message.id}-${segmentIndex}`} style={markdownStyles}>{segment.content}</Markdown>
                ) : (
                  <Text key={`md-fallback-${message.id}-${segmentIndex}`} style={[styles.messageText, { color: theme.text }]} selectable>
                    {stripMarkdownForDisplay(segment.content)}
                  </Text>
                );
              })}
            </View>
          )}
        </View>

        {/* Voice note */}
        {message.voiceNote && (
          <View style={styles.voiceNoteIndicator}>
            <Ionicons name="mic" size={12} color={isUser ? theme.onPrimary : theme.textSecondary} />
            <Text style={[styles.voiceNoteDuration, { color: isUser ? theme.onPrimary : theme.textSecondary }]}>
              {Math.round((message.voiceNote.duration || 0) / 1000)}s
            </Text>
          </View>
        )}

        {/* Images */}
        <DashMessageImages
          message={message}
          isUser={isUser}
          generatedImages={meta.generatedImages}
          onSendFollowUp={onSendFollowUp}
          onRetakeForClarity={onRetakeForClarity}
          onExpandVisual={setExpandedVisual}
        />

        {/* Non-image attachments */}
        <DashMessageAttachments message={message} isUser={isUser} />

        {/* Footer (PDF action + speak/retry + timestamp) */}
        <DashMessageFooter
          message={message}
          isUser={isUser}
          speakingMessageId={speakingMessageId}
          voiceEnabled={voiceEnabled}
          isLastUserMessage={isLastUserMessage}
          isLoading={isLoading}
          inlineActionUrl={meta.inlineActionUrl}
          inlineActionIsPdf={meta.inlineActionIsPdf}
          onSpeak={onSpeak}
          onRetry={onRetry}
          onInlineAction={handleInlineAction}
        />
      </BubbleSurface>

      <ExpandedVisualModal expandedVisual={expandedVisual} onClose={() => setExpandedVisual(null)} />
    </View>
  );
};
