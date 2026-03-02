/**
 * Dash AI Assistant Chat Component
 * 
 * Clean, modern conversational AI interface — general-purpose like ChatGPT.
 * No tool-heavy UI, no mode selectors, no command decks.
 * Just a beautiful chat with Dash.
 * 
 * Refactored to use:
 * - useDashAssistant hook for business logic
 * - DashMessageBubble for message rendering
 * - DashInputBar for input handling
 * - Single floating thinking dock for loading states
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, KeyboardAvoidingView, Keyboard } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { layoutStyles, headerStyles, messageStyles, inputStyles } from '@/components/ai/dash-assistant/styles';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  DashAssistantMessages, 
  DashMessageBubble,
  DashInputBar,
  AttachmentOptionsSheet,
  DashOptionsSheet,
} from '@/components/ai/dash-assistant';
import { useTheme } from '@/contexts/ThemeContext';
import type { DashMessage, DashAttachment } from '@/services/dash-ai/types';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import HomeworkScanner, { type HomeworkScanResult } from '@/components/ai/HomeworkScanner';
import { AlertModal } from '@/components/ui/AlertModal';
import { CompactModelPicker } from '@/components/ai/model-picker/CompactModelPicker';
import { useDashAssistant } from '@/hooks/useDashAssistant';
import { useAuth } from '@/contexts/AuthContext';
import { getDashAIRoleCopy } from '@/lib/ai/dashRoleCopy';
import { loadAutoScanBudget } from '@/lib/dash-ai/imageBudget';
import { deriveRetakePrompt } from '@/lib/dash-ai/retakeFlow';
import { resolveSpeechControlsLayoutState } from '@/features/dash-ai/speechControls';
import { getOrganizationType } from '@/lib/tenant/compat';
import { canAccessModel, getDefaultModels, type AIModelId } from '@/lib/ai/models';
import { normalizeTierToSubscription } from '@/lib/ai/modelForTier';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { DASH_TELEMETRY_EVENTS, trackDashTelemetry } from '@/lib/telemetry/events';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useRealtimeTier } from '@/hooks/useRealtimeTier';
import { DashUsageBanner } from '@/components/ai/dash-assistant';

// Merge all style domains for backward compatibility with child components
const styles = {
  ...layoutStyles,
  ...headerStyles,
  ...messageStyles,
  ...inputStyles,
};

const COMPOSER_FLOAT_GAP = 2;
const COMPOSER_OVERLAY_MIN_HEIGHT = 64;
const COMPOSER_ANDROID_NAV_LIFT = 14;

const splitSpeechSegments = (content: string): string[] => {
  const cleaned = String(content || '').trim();
  if (!cleaned) return [];
  return cleaned
    .split(/(?<=[.?!])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
};

const getBottomThinkingLabel = (
  loadingStatus: 'uploading' | 'analyzing' | 'thinking' | 'responding' | null,
): string => {
  switch (loadingStatus) {
    case 'uploading':
      return 'Dash is uploading your files...';
    case 'analyzing':
      return 'Dash is analyzing your content...';
    case 'responding':
      return 'Dash is preparing the final response...';
    case 'thinking':
    default:
      return 'Dash is thinking...';
  }
};

interface DashAssistantProps {
  conversationId?: string;
  onClose?: () => void;
  initialMessage?: string;
  handoffSource?: string;
  uiMode?: 'advisor' | 'tutor' | 'orb' | 'exam' | null;
  /** Disable all text-to-speech controls for this assistant instance. */
  disableTts?: boolean;
  /** Disable follow-up/quick chips for this assistant instance. */
  disableQuickChips?: boolean;
  /** Pre-configured tutor mode — kept for routing compat but UI stays general */
  tutorMode?: 'quiz' | 'practice' | 'diagnostic' | 'play' | 'explain' | null;
  tutorConfig?: {
    subject?: string;
    grade?: string;
    topic?: string;
    difficulty?: 1 | 2 | 3 | 4 | 5;
    slowLearner?: boolean;
  };
}

export const DashAssistant: React.FC<DashAssistantProps> = ({
  conversationId,
  onClose,
  initialMessage,
  handoffSource,
  uiMode,
  disableTts = false,
  disableQuickChips = false,
  tutorMode: externalTutorMode,
  tutorConfig,
}: DashAssistantProps) => {
  const { theme, isDark } = useTheme();
  const { profile } = useAuth();
  const autoScanUserId = String(profile?.id || '').trim() || null;
  const orgType = getOrganizationType(profile);
  const normalizedRole = String(profile?.role || '').toLowerCase();
  const canRunAssignmentsTool = useMemo(() => {
    if (orgType === 'preschool') return false;
    return ['parent', 'student', 'learner', 'teacher', 'principal', 'principal_admin', 'admin', 'super_admin', 'superadmin']
      .includes(normalizedRole);
  }, [normalizedRole, orgType]);
  const insets = useSafeAreaInsets();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(COMPOSER_OVERLAY_MIN_HEIGHT);
  const [lastSpokenMessageId, setLastSpokenMessageId] = useState<string | null>(null);
  const [speechSegmentIndex, setSpeechSegmentIndex] = useState(0);
  const [speechControlsExpanded, setSpeechControlsExpanded] = useState(false);
  const wasSpeakingRef = useRef(false);
  const [remainingScans, setRemainingScans] = useState<number | null>(null);
  const [initTimedOut, setInitTimedOut] = useState(false);
  const [retakeContext, setRetakeContext] = useState<{
    assistantMessageId: string;
    prompt: string;
    pendingAttachmentId: string | null;
  } | null>(null);
  const retakeAutoSendRef = useRef(false);
  const tierRef = useRef<string | undefined>(undefined);
  const duplicateThinkingLoggedRef = useRef(false);
  const singleThinkingIndicatorEnabled = useMemo(
    () => getFeatureFlagsSync().dash_single_thinking_indicator_v1 !== false,
    []
  );

  const { tierStatus } = useRealtimeTier();
  const usageLabel = tierStatus
    ? tierStatus.quotaLimit > 0
      ? `${tierStatus.quotaUsed}/${tierStatus.quotaLimit} used this month`
      : 'Unlimited usage'
    : '';

  const refreshScanBudget = useCallback(async (tierOverride?: string | null) => {
    const activeTier = String(tierOverride || tierRef.current || 'free');
    const budget = await loadAutoScanBudget(activeTier, autoScanUserId);
    setRemainingScans(budget.remainingCount);
  }, [autoScanUserId]);

  // Keyboard listeners
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event?.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Timeout fallback: if init hangs >12s, show chat interface anyway
  useEffect(() => {
    const timer = setTimeout(() => setInitTimedOut(true), 12000);
    return () => clearTimeout(timer);
  }, []);

  // All business logic via hook
  const {
    messages,
    inputText,
    setInputText,
    isLoading,
    hasActiveToolExecution,
    loadingStatus,
    streamingMessageId,
    isSpeaking,
    speakingMessageId,
    dashInstance,
    isInitialized,
    enterToSend,
    voiceEnabled,
    autoSuggestQuestions,
    selectedAttachments,
    isUploading,
    attachmentProgress,
    isNearBottom,
    setIsNearBottom,
    unreadCount,
    setUnreadCount,
    isRecording,
    recordingVoiceActivity,
    partialTranscript,
    speechChunkProgress,
    voiceAutoSendCountdownActive,
    voiceAutoSendCountdownMs,
    tutorSession,
    alertState,
    hideAlert,
    flashListRef,
    inputRef,
    sendMessage,
    speakResponse,
    stopSpeaking,
    stopAllActivity,
    startNewConversation,
    scrollToBottom,
    handleTakePhoto,
    handlePickImages,
    handlePickDocuments,
    handleInputMicPress,
    cancelVoiceAutoSend,
    handleRemoveAttachment,
    addAttachments,
    runTool,
    extractFollowUps,
    tier,
    cancelGeneration,
    selectedModel,
    setSelectedModel,
  } = useDashAssistant({
    conversationId,
    initialMessage,
    onClose,
    handoffSource,
    externalTutorMode,
    tutorConfig,
    onAutoScanConsumed: () => refreshScanBudget(),
  });

  useEffect(() => {
    tierRef.current = tier;
  }, [tier]);

  useEffect(() => {
    void refreshScanBudget(tier);
  }, [refreshScanBudget, tier]);

  const isTypingActive = isLoading || !!loadingStatus;
  const allModels = useMemo(() => getDefaultModels(), []);
  const normalizedTier = useMemo(() => normalizeTierToSubscription(tier), [tier]);
  const canSelectHeaderModel = useCallback((modelId: AIModelId) => canAccessModel(normalizedTier, modelId), [normalizedTier]);
  const roleCopy = useMemo(() => getDashAIRoleCopy(profile?.role), [profile?.role]);
  const isK12ParentDashEntry = handoffSource === 'k12_parent_tab';
  const useMinimalNextGenLayout = isK12ParentDashEntry;
  const isParentRole =
    normalizedRole === 'parent' ||
    normalizedRole.includes('parent');
  const isTutorUiActive = uiMode === 'tutor' || !!externalTutorMode || !!tutorSession;
  const effectiveVoiceEnabled = !disableTts && voiceEnabled;
  const effectiveShowFollowUps = !disableQuickChips && autoSuggestQuestions;
  const activeTutorMode = tutorSession?.mode || externalTutorMode;
  const tutorModeLabel = activeTutorMode
    ? `${String(activeTutorMode).charAt(0).toUpperCase()}${String(activeTutorMode).slice(1)}`
    : 'Diagnose → Teach → Practice';
  const shellSubtitle = useMinimalNextGenLayout
    ? 'Your AI assistant'
    : isTutorUiActive
    ? 'Tutor Session Active'
    : uiMode === 'advisor'
      ? 'Advisor Mode'
      : uiMode === 'exam'
        ? 'Exam Builder Mode'
      : uiMode === 'orb'
        ? 'Orb Companion Mode'
        : 'Your AI assistant';

  useEffect(() => {
    if (!speakingMessageId) return;
    setLastSpokenMessageId(speakingMessageId);
    setSpeechSegmentIndex(0);
  }, [speakingMessageId]);

  useEffect(() => {
    if (isSpeaking) {
      setSpeechControlsExpanded(true);
    } else if (wasSpeakingRef.current) {
      setSpeechControlsExpanded(false);
    }
    wasSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    if (!speechChunkProgress || speechChunkProgress.chunkCount <= 0) return;
    const boundedIndex = Math.max(
      0,
      Math.min(speechChunkProgress.chunkIndex, speechChunkProgress.chunkCount - 1),
    );
    setSpeechSegmentIndex((prev) => (prev === boundedIndex ? prev : boundedIndex));
  }, [speechChunkProgress]);

  const activeSpeechMessageId = speakingMessageId || lastSpokenMessageId;
  const activeSpeechMessage = useMemo(() => {
    if (!activeSpeechMessageId) return null;
    const match = messages.find((msg) => msg.id === activeSpeechMessageId);
    if (!match || match.type !== 'assistant') return null;
    return match;
  }, [messages, activeSpeechMessageId]);

  useEffect(() => {
    if (!activeSpeechMessage) {
      setSpeechControlsExpanded(false);
    }
  }, [activeSpeechMessage]);
  const speechSegments = useMemo(
    () => splitSpeechSegments(activeSpeechMessage?.content || ''),
    [activeSpeechMessage?.content],
  );
  const chunkCount = speechChunkProgress?.chunkCount || speechSegments.length;
  const chunkIndex = typeof speechChunkProgress?.chunkIndex === 'number'
    ? speechChunkProgress.chunkIndex
    : speechSegmentIndex;
  const displaySpeechIndex = Math.max(0, Math.min(chunkIndex, Math.max(0, chunkCount - 1)));
  const canSeekBack = displaySpeechIndex > 0 && speechSegments.length > 0;
  const canSeekForward = displaySpeechIndex < speechSegments.length - 1;
  const speechProgress = chunkCount > 0
    ? Math.min(1, Math.max(0, (displaySpeechIndex + 1) / chunkCount))
    : 0;
  const speechControlsLayout = resolveSpeechControlsLayoutState({
    isSpeaking,
    hasSpeechMessage: Boolean(activeSpeechMessage),
    chunkCount,
    expanded: speechControlsExpanded,
  });
  const showMiniSpeechControls = speechControlsLayout.showMiniControls;
  const showFullSpeechControls = speechControlsLayout.showFullControls;
  const bottomThinkingLabel = getBottomThinkingLabel(loadingStatus);
  const showBottomThinkingDock =
    singleThinkingIndicatorEnabled &&
    !streamingMessageId &&
    !isRecording &&
    (isTypingActive || hasActiveToolExecution);

  useEffect(() => {
    if (!singleThinkingIndicatorEnabled) return;
    if (isTypingActive && !duplicateThinkingLoggedRef.current) {
      duplicateThinkingLoggedRef.current = true;
      trackDashTelemetry(DASH_TELEMETRY_EVENTS.DUPLICATE_THINKING_INDICATOR_BLOCKED, {
        source: 'message_footer',
      });
    }
    if (!isTypingActive) {
      duplicateThinkingLoggedRef.current = false;
    }
  }, [isTypingActive, singleThinkingIndicatorEnabled]);

  const handleNewChat = useCallback(async () => {
    await stopAllActivity();
    await startNewConversation();
  }, [startNewConversation, stopAllActivity]);

  const handleComposerFocus = useCallback(() => {
    if (isRecording) {
      handleInputMicPress();
    }
    if (isSpeaking) {
      void stopSpeaking();
    }
  }, [isRecording, handleInputMicPress, isSpeaking, stopSpeaking]);

  const speakFromSegment = useCallback(async (requestedIndex: number) => {
    if (!activeSpeechMessage || speechSegments.length === 0) return;
    const nextIndex = Math.max(0, Math.min(requestedIndex, speechSegments.length - 1));
    const remainingText = speechSegments.slice(nextIndex).join(' ').trim();
    if (!remainingText) return;

    setSpeechSegmentIndex(nextIndex);
    const replayMessage: DashMessage = {
      ...activeSpeechMessage,
      id: `${activeSpeechMessage.id}_segment_${nextIndex}`,
      content: remainingText,
      timestamp: Date.now(),
    };
    await stopSpeaking();
    await speakResponse(replayMessage);
  }, [activeSpeechMessage, speechSegments, speakResponse, stopSpeaking]);

  const handleSpeechToggle = useCallback(() => {
    if (isSpeaking) {
      void stopSpeaking();
      return;
    }
    void speakFromSegment(displaySpeechIndex);
  }, [displaySpeechIndex, isSpeaking, speakFromSegment, stopSpeaking]);

  const openAttachmentSheet = useCallback(() => {
    if (isRecording) {
      handleInputMicPress();
    }
    if (isSpeaking) {
      void stopSpeaking();
    }
    setAttachmentSheetVisible(true);
  }, [isRecording, handleInputMicPress, isSpeaking, stopSpeaking]);

  const closeAttachmentSheet = useCallback(() => {
    setAttachmentSheetVisible(false);
  }, []);

  const openOptionsSheet = useCallback(() => {
    if (isRecording) {
      handleInputMicPress();
    }
    if (isSpeaking) {
      void stopSpeaking();
    }
    setOptionsSheetVisible(true);
  }, [isRecording, handleInputMicPress, isSpeaking, stopSpeaking]);

  const closeOptionsSheet = useCallback(() => {
    setOptionsSheetVisible(false);
  }, []);

  const handlePasteImage = useCallback(
    (file: File) => {
      const attachment: DashAttachment = {
        id: `paste_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        bucket: 'attachments',
        storagePath: '',
        kind: 'image',
        status: 'pending',
        previewUri: typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined,
      };
      addAttachments([attachment]);
    },
    [addAttachments]
  );

  const openScanner = useCallback(() => {
    setScannerVisible(true);
  }, []);

  const closeScanner = useCallback(() => {
    setScannerVisible(false);
    setRetakeContext((previous) => (
      previous && !previous.pendingAttachmentId
        ? null
        : previous
    ));
  }, []);

  const handleAttachmentTakePhoto = useCallback(() => {
    openScanner();
  }, [openScanner]);

  const handleAttachmentPickImages = useCallback(() => {
    void handlePickImages();
  }, [handlePickImages]);

  const handleAttachmentPickDocuments = useCallback(() => {
    void handlePickDocuments();
  }, [handlePickDocuments]);

  const handleOpenHistory = useCallback(() => {
    router.push('/screens/dash-conversations-history');
  }, []);

  const handleOpenSearch = useCallback(() => {
    router.push('/screens/app-search?scope=dash&q=dash');
  }, []);

  const handleOpenOrb = useCallback(() => {
    router.push('/screens/dash-voice?mode=orb');
  }, []);

  const handleRunScheduleTool = useCallback(() => {
    void runTool('get_schedule', { start_date: 'today', days: 7 });
  }, [runTool]);

  const handleRunAssignmentsTool = useCallback(() => {
    void runTool('get_assignments', { status: 'pending', days_ahead: 14 });
  }, [runTool]);

  const handleRetakeForClarity = useCallback((assistantMessage: DashMessage) => {
    const prompt = deriveRetakePrompt(messages, assistantMessage.id);
    setInputText(prompt);
    setRetakeContext({
      assistantMessageId: assistantMessage.id,
      prompt,
      pendingAttachmentId: null,
    });
    setScannerVisible(true);
  }, [messages, setInputText]);

  const handleScannerScanned = useCallback((result: HomeworkScanResult) => {
    if (!result?.base64) return;
    const attachmentId = `attach_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const attachment: DashAttachment = {
      id: attachmentId,
      name: `scan_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      size: Math.max(0, Math.floor(result.base64.length * 0.75)),
      bucket: 'attachments',
      storagePath: '',
      kind: 'image',
      status: 'pending',
      previewUri: result.uri,
      uploadProgress: 0,
      meta: {
        base64: result.base64,
        image_base64: result.base64,
        image_media_type: 'image/jpeg',
        width: result.width,
        height: result.height,
        source: 'scanner',
      },
    };
    addAttachments([attachment]);
    setRetakeContext((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        pendingAttachmentId: attachmentId,
      };
    });
    void refreshScanBudget();
    setScannerVisible(false);
  }, [addAttachments, refreshScanBudget]);

  useEffect(() => {
    if (!retakeContext?.pendingAttachmentId) return;
    if (retakeAutoSendRef.current) return;
    if (isLoading || isUploading) return;
    const hasAttachment = selectedAttachments.some(
      (attachment) => attachment.id === retakeContext.pendingAttachmentId
    );
    if (!hasAttachment) return;
    const prompt = String(retakeContext.prompt || '').trim();
    if (!prompt) {
      setRetakeContext(null);
      return;
    }

    retakeAutoSendRef.current = true;
    void sendMessage(prompt).finally(() => {
      retakeAutoSendRef.current = false;
      setRetakeContext(null);
    });
  }, [retakeContext, selectedAttachments, sendMessage, isLoading, isUploading]);

  // Scroll to bottom on keyboard show
  useEffect(() => {
    if (keyboardVisible && messages.length > 0 && isNearBottom) {
      const timer = setTimeout(() => {
        scrollToBottom({ animated: true, delay: 50 });
      }, Platform.OS === 'android' ? 150 : 50);
      return () => clearTimeout(timer);
    }
  }, [keyboardVisible, isNearBottom, scrollToBottom, messages.length]);

  // Render message
  const renderMessage = useCallback((message: DashMessage, index: number) => (
    <DashMessageBubble
      key={message.id}
      message={message}
      index={index}
      totalMessages={messages.length}
      speakingMessageId={speakingMessageId}
      isLoading={isLoading}
      voiceEnabled={effectiveVoiceEnabled}
      showFollowUps={effectiveShowFollowUps}
      onSpeak={speakResponse}
      onRetry={(content) => sendMessage(content)}
      onSendFollowUp={(text) => sendMessage(text)}
      extractFollowUps={extractFollowUps}
      assistantLabel={roleCopy.assistantLabel}
      onRetakeForClarity={handleRetakeForClarity}
    />
  ), [
    messages.length,
    speakingMessageId,
    isLoading,
    effectiveVoiceEnabled,
    effectiveShowFollowUps,
    speakResponse,
    sendMessage,
    extractFollowUps,
    roleCopy.assistantLabel,
    handleRetakeForClarity,
  ]);

  // Loading state — show spinner until initialized or timeout (12s)
  if (!isInitialized && !initTimedOut) {
    return (
      <View style={[layoutStyles.loadingContainer, { backgroundColor: theme.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <EduDashSpinner size="large" color={theme.primary} />
        <Text style={[layoutStyles.loadingText, { color: theme.text }]}>
          Initializing Dash...
        </Text>
      </View>
    );
  }

  const keyboardBehavior = Platform.OS === 'ios' ? 'padding' : undefined;
  const keyboardOffset = Platform.OS === 'ios' ? 90 : 0;
  const composerBottomInset = Platform.OS === 'ios'
    ? insets.bottom
    : Math.max(insets.bottom, COMPOSER_ANDROID_NAV_LIFT);
  const keyboardUp = keyboardHeight > 0;
  const safeComposerHeight = Math.max(composerHeight, COMPOSER_OVERLAY_MIN_HEIGHT);
  const composerExtraBottom = keyboardUp ? composerBottomInset : 0;
  const messageViewportInset = keyboardHeight + COMPOSER_FLOAT_GAP + composerExtraBottom + safeComposerHeight;
  const backgroundBase: [string, string, string] = isDark
    ? ['#0B1020', '#0F172A', theme.background]
    : ['#F7FAFF', '#EEF2FF', '#F8FAFC'];
  const glowA: [string, string, string] = isDark
    ? ['rgba(14,165,233,0.32)', 'rgba(59,130,246,0.05)', 'transparent']
    : ['rgba(14,165,233,0.35)', 'rgba(34,211,238,0.12)', 'transparent'];
  const glowB: [string, string, string] = isDark
    ? ['rgba(16,185,129,0.25)', 'rgba(99,102,241,0.06)', 'transparent']
    : ['rgba(16,185,129,0.3)', 'rgba(59,130,246,0.08)', 'transparent'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <KeyboardAvoidingView
        style={[layoutStyles.container, { backgroundColor: theme.background }]}
        behavior={keyboardBehavior}
        keyboardVerticalOffset={keyboardOffset}
      >
        {/* Background gradients */}
        <View pointerEvents="none" style={layoutStyles.backgroundLayer}>
          <LinearGradient colors={backgroundBase} style={layoutStyles.backgroundGradient} />
          <LinearGradient colors={glowA} style={layoutStyles.backgroundGlowA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <LinearGradient colors={glowB} style={layoutStyles.backgroundGlowB} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} />
        </View>

        <View style={layoutStyles.contentLayer}>
          <StatusBar style={isDark ? 'light' : 'dark'} />

          {initTimedOut && !isInitialized && (
            <View
              style={{
                padding: 12,
                marginHorizontal: 16,
                marginTop: 8,
                backgroundColor: theme.surfaceVariant + 'CC',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                Having trouble connecting. Try sending a message and I&apos;ll do my best to help.
              </Text>
            </View>
          )}

          <View style={[headerStyles.header, { backgroundColor: 'transparent' }]}>
            <View
              style={[
                headerStyles.headerShell,
                {
                  backgroundColor: theme.surface + 'CC',
                  borderColor: 'transparent',
                  borderWidth: 0,
                  shadowColor: '#020617',
                  shadowOpacity: 0.25,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 6,
                },
              ]}
            >
              <View style={headerStyles.headerTopRow}>
                <View style={headerStyles.headerLeft}>
                  <View style={headerStyles.headerTitleRow}>
                    <View style={[headerStyles.headerAccentDot, { backgroundColor: theme.primary }]} />
                    <Text style={[headerStyles.headerTitle, { color: theme.text }]}>Dash</Text>
                  </View>
                  <Text style={[headerStyles.headerSubtitle, { color: theme.textSecondary }]}>
                    {shellSubtitle}
                  </Text>
                </View>
                <View style={headerStyles.headerRight}>
                  <View
                    style={[
                      headerStyles.actionRail,
                      {
                        backgroundColor: theme.surfaceVariant + 'D9',
                        borderColor: 'transparent',
                        borderWidth: 0,
                        shadowColor: '#020617',
                        shadowOpacity: 0.22,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 6 },
                        elevation: 5,
                      },
                    ]}
                  >
                    {(isSpeaking || isTypingActive || isRecording) && (
                      <TouchableOpacity
                        style={[headerStyles.iconButton, { backgroundColor: theme.error, borderColor: 'transparent', borderWidth: 0 }]}
                        accessibilityLabel="Stop Dash activity"
                        onPress={() => {
                          void stopAllActivity('header_stop_button');
                        }}
                      >
                        <Ionicons name="stop" size={16} color={theme.onError || theme.background} />
                      </TouchableOpacity>
                    )}
                    <CompactModelPicker
                      models={allModels}
                      selectedModelId={selectedModel}
                      canSelectModel={canSelectHeaderModel}
                      onSelectModel={(modelId) => setSelectedModel(modelId)}
                      onLockedPress={() => { router.push('/screens/subscription-setup?reason=model_selection&source=dash_assistant' as any); }}
                      disabled={isLoading || isUploading}
                    />
                    <TouchableOpacity
                      style={[headerStyles.iconButton, { backgroundColor: theme.surfaceVariant, borderColor: 'transparent', borderWidth: 0 }]}
                      accessibilityLabel="Open Dash options"
                      onPress={openOptionsSheet}
                    >
                      <Ionicons name="ellipsis-horizontal" size={16} color={theme.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        headerStyles.iconButton,
                        headerStyles.orbIconButton,
                        { backgroundColor: theme.primary + '22', borderColor: 'transparent', borderWidth: 0 },
                      ]}
                      accessibilityLabel="Open Dash Orb"
                      onPress={handleOpenOrb}
                    >
                      <Ionicons name="planet" size={17} color={theme.primary} />
                    </TouchableOpacity>
                    {onClose && (
                      <TouchableOpacity
                        style={[headerStyles.closeButton, { backgroundColor: theme.surfaceVariant, borderColor: 'transparent', borderWidth: 0 }]}
                        onPress={async () => {
                          await stopSpeaking();
                          dashInstance?.cleanup?.();
                          onClose();
                        }}
                        accessibilityLabel="Close"
                      >
                        <Ionicons name="close" size={18} color={theme.text} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
              {isTutorUiActive && !useMinimalNextGenLayout && (
                <View style={headerStyles.headerStatusRow}>
                  <View
                    style={[
                      headerStyles.headerStatusPill,
                      { borderColor: theme.primary + '66', backgroundColor: theme.primary + '18' },
                    ]}
                  >
                    <Ionicons name="school-outline" size={12} color={theme.primary} />
                    <Text style={[headerStyles.headerStatusText, { color: theme.primary }]}>
                      Tutor Session Active
                    </Text>
                  </View>
                  <View
                    style={[
                      headerStyles.headerStatusPill,
                      { borderColor: theme.border, backgroundColor: theme.surfaceVariant },
                    ]}
                  >
                    <Ionicons name="git-network-outline" size={12} color={theme.textSecondary} />
                    <Text style={[headerStyles.headerStatusSubtle, { color: theme.textSecondary }]}>
                      Mode: {tutorModeLabel}
                    </Text>
                  </View>
                </View>
              )}
              {effectiveVoiceEnabled && showMiniSpeechControls && (
                <View
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 11,
                    backgroundColor: theme.surfaceVariant + 'C7',
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <TouchableOpacity
                    style={[headerStyles.iconButton, { backgroundColor: theme.primary + '22', borderColor: theme.primary + '44' }]}
                    onPress={handleSpeechToggle}
                    accessibilityLabel={isSpeaking ? 'Stop speech' : 'Play speech'}
                  >
                    <Ionicons
                      name={isSpeaking ? 'stop' : 'play'}
                      size={14}
                      color={theme.primary}
                    />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                      Speech controls
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '600' }}>
                      {chunkCount > 0 ? `${displaySpeechIndex + 1}/${chunkCount}` : '0/0'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[headerStyles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => setSpeechControlsExpanded(true)}
                    accessibilityLabel="Expand speech controls"
                  >
                    <Ionicons name="chevron-down" size={15} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}
              {effectiveVoiceEnabled && showFullSpeechControls && (
                <View
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 12,
                    backgroundColor: theme.surfaceVariant + 'CC',
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    gap: 7,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text
                      style={{ color: theme.text, fontSize: 11, fontWeight: '700', flex: 1 }}
                      numberOfLines={1}
                    >
                      {isSpeaking ? 'Dash speaking' : 'Speech controls'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '600' }}>
                        {chunkCount > 0 ? `${displaySpeechIndex + 1}/${chunkCount}` : '0/0'}
                      </Text>
                      {!isSpeaking && (
                        <TouchableOpacity
                          style={[headerStyles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                          onPress={() => setSpeechControlsExpanded(false)}
                          accessibilityLabel="Collapse speech controls"
                        >
                          <Ionicons name="chevron-up" size={14} color={theme.textSecondary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <View
                    style={{
                      height: 5,
                      borderRadius: 999,
                      overflow: 'hidden',
                      backgroundColor: theme.surface,
                    }}
                  >
                    <View
                      style={{
                        height: '100%',
                        width: `${Math.round(speechProgress * 100)}%`,
                        backgroundColor: theme.primary,
                      }}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                      style={[headerStyles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      onPress={() => void speakFromSegment(displaySpeechIndex - 1)}
                      disabled={!canSeekBack}
                      accessibilityLabel="Rewind spoken content"
                    >
                      <Ionicons
                        name="play-back"
                        size={16}
                        color={canSeekBack ? theme.text : theme.textTertiary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[headerStyles.iconButton, { backgroundColor: theme.primary + '22', borderColor: theme.primary + '44' }]}
                      onPress={handleSpeechToggle}
                      accessibilityLabel={isSpeaking ? 'Stop speech' : 'Play speech'}
                    >
                      <Ionicons
                        name={isSpeaking ? 'stop' : 'play'}
                        size={16}
                        color={theme.primary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[headerStyles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      onPress={() => void speakFromSegment(displaySpeechIndex + 1)}
                      disabled={!canSeekForward}
                      accessibilityLabel="Fast forward spoken content"
                    >
                      <Ionicons
                        name="play-forward"
                        size={16}
                        color={canSeekForward ? theme.text : theme.textTertiary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>

          {tierStatus && tierStatus.quotaLimit > 0 && (
            <DashUsageBanner
              tierStatus={tierStatus}
              usageLabel={usageLabel}
              styles={styles}
              theme={theme}
            />
          )}

          {/* Messages */}
          <View style={[layoutStyles.messagesClip, { marginBottom: messageViewportInset }]}>
            <DashAssistantMessages
              flashListRef={flashListRef}
              messages={messages}
              renderMessage={renderMessage}
              styles={styles}
              theme={theme}
              isLoading={isTypingActive}
              isNearBottom={isNearBottom}
              setIsNearBottom={setIsNearBottom}
              unreadCount={unreadCount}
              setUnreadCount={setUnreadCount}
              scrollToBottom={scrollToBottom}
              renderSuggestedActions={() => null}
              onSendMessage={(text) => sendMessage(text)}
              bottomInset={0}
              keyboardVisible={keyboardVisible}
              compactBottomPadding
              tutorMode={activeTutorMode || null}
              userRole={String(profile?.role || '').toLowerCase()}
            />
          </View>

          {/* Jump to bottom FAB */}
          {Platform.OS === 'android' && !isNearBottom && messages.length > 0 && (
            <TouchableOpacity
              style={[
                messageStyles.scrollToBottomFab,
                {
                  backgroundColor: theme.primary,
                  bottom: messageViewportInset + 12,
                  zIndex: 220,
                  elevation: 16,
                },
              ]}
              onPress={() => { setUnreadCount(0); scrollToBottom({ animated: true, delay: 0, force: true }); }}
              accessibilityLabel="Jump to bottom"
              activeOpacity={0.8}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <Ionicons name="chevron-down" size={20} color={theme.onPrimary || '#fff'} />
              {unreadCount > 0 && (
                <View style={[messageStyles.scrollToBottomBadge, { backgroundColor: theme.error }]}>
                  <Text style={[messageStyles.scrollToBottomBadgeText, { color: theme.onError || '#fff' }]}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {showBottomThinkingDock && (
            <View
              style={[
                layoutStyles.bottomThinkingDock,
                {
                  bottom: keyboardHeight + safeComposerHeight + COMPOSER_FLOAT_GAP + composerExtraBottom + 10,
                  backgroundColor: theme.surface + 'EE',
                },
              ]}
              pointerEvents="none"
            >
              <EduDashSpinner size="small" color={theme.primary} />
              <Text style={[layoutStyles.bottomThinkingText, { color: theme.text }]}>
                {bottomThinkingLabel}
              </Text>
            </View>
          )}

          {/* Input */}
          <View
            style={[
              layoutStyles.composerArea,
              {
                bottom: keyboardHeight + COMPOSER_FLOAT_GAP + composerExtraBottom,
                paddingBottom: keyboardUp ? 0 : composerBottomInset,
              },
            ]}
            pointerEvents="box-none"
            onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
          >
            <DashInputBar
              inputRef={inputRef}
              inputText={inputText}
              setInputText={setInputText}
              enterToSend={enterToSend}
              selectedAttachments={selectedAttachments}
              attachmentProgress={attachmentProgress}
              isLoading={isLoading}
              isUploading={isUploading}
              isRecording={isRecording}
              recordingVoiceActivity={recordingVoiceActivity}
              isSpeaking={isSpeaking}
              partialTranscript={partialTranscript}
              voiceAutoSendCountdownActive={voiceAutoSendCountdownActive}
              voiceAutoSendCountdownMs={voiceAutoSendCountdownMs}
              placeholder="Message Dash..."
              messages={messages}
              onSend={() => sendMessage()}
              onMicPress={handleInputMicPress}
              onCancelVoiceAutoSend={cancelVoiceAutoSend}
              onInterrupt={stopAllActivity}
              onTakePhoto={openScanner}
              onAttachFile={openAttachmentSheet}
              onRemoveAttachment={handleRemoveAttachment}
              onQuickAction={(text) => sendMessage(text)}
              onCancel={cancelGeneration}
              bottomInset={0}
              // Quick chips are currently confusing more than they help.
              // Disable them globally in Dash until we have tighter suggestions.
              hideQuickChips={disableQuickChips || true}
              onInputFocus={handleComposerFocus}
              onPasteImage={handlePasteImage}
            />
          </View>

          {/* Modals */}
          {alertState.bannerMode ? (
            alertState.visible && (
              <View style={{
                position: 'absolute',
                bottom: 100,
                left: 16,
                right: 16,
                backgroundColor: theme.surface,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.18,
                shadowRadius: 10,
                elevation: 8,
                borderWidth: 1,
                borderColor: theme.border,
                zIndex: 999,
              }}>
                {alertState.icon && (
                  <Ionicons name={alertState.icon as any} size={20} color={theme.primary} />
                )}
                <Text style={{ flex: 1, color: theme.text, fontSize: 13, fontWeight: '500' }}>
                  {alertState.message}
                </Text>
                <TouchableOpacity onPress={hideAlert} hitSlop={8}>
                  <Ionicons name="close" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
            )
          ) : (
            <AlertModal
              visible={alertState.visible}
              title={alertState.title}
              message={alertState.message}
              type={alertState.type}
              icon={alertState.icon as any}
              buttons={alertState.buttons}
              onClose={hideAlert}
            />
          )}
          <AttachmentOptionsSheet
            visible={attachmentSheetVisible}
            onClose={closeAttachmentSheet}
            onTakePhoto={handleAttachmentTakePhoto}
            onPickImages={handleAttachmentPickImages}
            onPickDocuments={handleAttachmentPickDocuments}
            showDocuments
            isBusy={isLoading || isUploading}
          />
          <DashOptionsSheet
            visible={optionsSheetVisible}
            onClose={closeOptionsSheet}
            onNewChat={handleNewChat}
            onOpenHistory={handleOpenHistory}
            onOpenSearch={handleOpenSearch}
            onOpenOrb={handleOpenOrb}
            onOpenScanner={openScanner}
            onRunScheduleTool={handleRunScheduleTool}
            onRunAssignmentsTool={canRunAssignmentsTool ? handleRunAssignmentsTool : undefined}
            isBusy={isLoading || isUploading}
          />
          <HomeworkScanner
            visible={scannerVisible}
            onClose={closeScanner}
            onScanned={handleScannerScanned}
            title="Scan Image"
            tier={tier || 'free'}
            remainingScans={remainingScans}
            userId={autoScanUserId}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default DashAssistant;
