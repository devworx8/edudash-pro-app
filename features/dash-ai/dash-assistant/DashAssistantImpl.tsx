import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { layoutStyles, messageStyles, inputStyles } from '@/components/ai/dash-assistant/styles';
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
import HomeworkScanner from '@/components/ai/HomeworkScanner';
import { AlertModal } from '@/components/ui/AlertModal';
import { useDashAssistant } from '@/hooks/useDashAssistant';
import { useAuth } from '@/contexts/AuthContext';
import { getDashAIRoleCopy } from '@/lib/ai/dashRoleCopy';
import { getOrganizationType } from '@/lib/tenant/compat';
import { canAccessModel, getDefaultModels, MODEL_WEIGHTS, type AIModelId } from '@/lib/ai/models';
import { normalizeTierToSubscription } from '@/lib/ai/modelForTier';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { DASH_TELEMETRY_EVENTS, trackDashTelemetry } from '@/lib/telemetry/events';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useRealtimeTier } from '@/hooks/useRealtimeTier';

import type { DashAssistantProps } from './types';
import {
  COMPOSER_FLOAT_GAP,
  COMPOSER_OVERLAY_MIN_HEIGHT,
  COMPOSER_ANDROID_NAV_LIFT,
  getBottomThinkingLabel,
} from './utils';
import { DashAssistantHeader } from './DashAssistantHeader';
import { DashAssistantThinkingDock } from './DashAssistantThinkingDock';
import { useSpeechControls } from './useSpeechControls';
import { useScannerFlow } from './useScannerFlow';

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
    return [
      'parent',
      'student',
      'learner',
      'teacher',
      'principal',
      'principal_admin',
      'admin',
      'super_admin',
      'superadmin',
    ].includes(normalizedRole);
  }, [normalizedRole, orgType]);

  const insets = useSafeAreaInsets();
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(COMPOSER_OVERLAY_MIN_HEIGHT);
  const [initTimedOut, setInitTimedOut] = useState(false);
  const tierRef = useRef<string | undefined>(undefined);
  const duplicateThinkingLoggedRef = useRef(false);
  const singleThinkingIndicatorEnabled = useMemo(
    () => getFeatureFlagsSync().dash_single_thinking_indicator_v1 !== false,
    [],
  );

  const { tierStatus, refresh: refreshTierStatus, incrementQuota } = useRealtimeTier();
  const prevIsLoadingRef = useRef(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e?.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setInitTimedOut(true), 12000);
    return () => clearTimeout(timer);
  }, []);

  const {
    messages,
    inputText,
    setInputText,
    isLoading,
    hasActiveToolExecution,
    activeToolLabel,
    loadingStatus,
    streamingMessageId,
    isSpeaking,
    speakingMessageId,
    dashInstance,
    isInitialized,
    enterToSend,
    voiceEnabled,
    selectedAttachments,
    isUploading,
    attachmentProgress,
    isNearBottom,
    setIsNearBottom,
    unreadCount,
    setUnreadCount,
    bottomScrollRequestId,
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
    webScrollNodeRef,
    sendMessage,
    speakResponse,
    stopSpeaking,
    stopAllActivity,
    startNewConversation,
    scrollToBottom,
    handlePickImages,
    handlePickDocuments,
    handleInputMicPress,
    cancelVoiceAutoSend,
    handleRemoveAttachment,
    updateAttachmentUri,
    addAttachments,
    runTool,
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
    onAutoScanConsumed: () => scanner.refreshScanBudget(),
  });

  useEffect(() => {
    tierRef.current = tier;
  }, [tier]);

  useEffect(() => {
    if (prevIsLoadingRef.current && !isLoading) {
      const timer = setTimeout(() => refreshTierStatus(), 2000);
      return () => clearTimeout(timer);
    }
    prevIsLoadingRef.current = isLoading;
  }, [isLoading, refreshTierStatus]);

  const isTypingActive = isLoading || !!loadingStatus;

  const speech = useSpeechControls({
    isSpeaking,
    speakingMessageId,
    speechChunkProgress,
    messages,
    speakResponse,
    stopSpeaking,
  });

  const scanner = useScannerFlow({
    autoScanUserId,
    tierRef,
    messages,
    isLoading,
    isUploading,
    selectedAttachments,
    addAttachments,
    sendMessage,
    setInputText,
  });

  useEffect(() => {
    void scanner.refreshScanBudget(tier);
  }, [scanner.refreshScanBudget, tier]);

  useEffect(() => {
    if (!singleThinkingIndicatorEnabled) return;
    if (isTypingActive && !duplicateThinkingLoggedRef.current) {
      duplicateThinkingLoggedRef.current = true;
      trackDashTelemetry(DASH_TELEMETRY_EVENTS.DUPLICATE_THINKING_INDICATOR_BLOCKED, {
        source: 'message_footer',
      });
    }
    if (!isTypingActive) duplicateThinkingLoggedRef.current = false;
  }, [isTypingActive, singleThinkingIndicatorEnabled]);

  const allModels = useMemo(() => getDefaultModels(), []);
  const normalizedTier = useMemo(() => normalizeTierToSubscription(tier), [tier]);
  const canSelectHeaderModel = useCallback(
    (modelId: AIModelId) => canAccessModel(normalizedTier, modelId),
    [normalizedTier],
  );
  const roleCopy = useMemo(() => getDashAIRoleCopy(profile?.role), [profile?.role]);
  const isK12ParentDashEntry = handoffSource === 'k12_parent_tab';
  const useMinimalNextGenLayout = isK12ParentDashEntry;
  const isTutorUiActive = uiMode === 'tutor' || !!externalTutorMode || !!tutorSession;
  const effectiveVoiceEnabled = !disableTts && voiceEnabled;
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

  const handleSend = useCallback(
    (text?: string, attachments?: any[]) => {
      const weight = MODEL_WEIGHTS[selectedModel as AIModelId] ?? 1;
      incrementQuota(weight);
      return sendMessage(text as any, attachments as any);
    },
    [sendMessage, selectedModel, incrementQuota],
  );

  const handleNewChat = useCallback(async () => {
    await stopAllActivity();
    await startNewConversation();
  }, [startNewConversation, stopAllActivity]);
  const handleComposerFocus = useCallback(() => {
    if (isRecording) handleInputMicPress();
    if (isSpeaking) void stopSpeaking();
  }, [isRecording, handleInputMicPress, isSpeaking, stopSpeaking]);
  const openAttachmentSheet = useCallback(() => {
    if (isRecording) handleInputMicPress();
    if (isSpeaking) void stopSpeaking();
    setAttachmentSheetVisible(true);
  }, [isRecording, handleInputMicPress, isSpeaking, stopSpeaking]);
  const openOptionsSheet = useCallback(() => {
    if (isRecording) handleInputMicPress();
    if (isSpeaking) void stopSpeaking();
    setOptionsSheetVisible(true);
  }, [isRecording, handleInputMicPress, isSpeaking, stopSpeaking]);
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
        previewUri:
          typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
            ? URL.createObjectURL(file)
            : undefined,
      };
      addAttachments([attachment]);
    },
    [addAttachments],
  );
  const handleOpenOrb = useCallback(() => {
    router.push('/screens/dash-voice?mode=orb');
  }, []);
  const handleRunScheduleTool = useCallback(() => {
    void runTool('get_schedule', { start_date: 'today', days: 7 });
  }, [runTool]);
  const handleRunAssignmentsTool = useCallback(() => {
    void runTool('get_assignments', { status: 'pending', days_ahead: 14 });
  }, [runTool]);

  const toolActivityLabel =
    activeToolLabel || (hasActiveToolExecution ? 'Using tools to prepare your answer' : null);
  const showBottomThinkingDock =
    singleThinkingIndicatorEnabled &&
    !streamingMessageId &&
    !isRecording &&
    (isTypingActive || hasActiveToolExecution);
  const bottomThinkingLabel = getBottomThinkingLabel(loadingStatus);

  const renderMessage = useCallback(
    (message: DashMessage, index: number) => (
      <DashMessageBubble
        key={message.id}
        message={message}
        index={index}
        totalMessages={messages.length}
        speakingMessageId={speakingMessageId}
        isLoading={isLoading}
        voiceEnabled={effectiveVoiceEnabled}
        onSpeak={speech.handleSpeakMessage}
        onRetry={(content, attachments) => handleSend(content, attachments as any)}
        onSendFollowUp={(text, attachments) => handleSend(text, attachments as any)}
        assistantLabel={roleCopy.assistantLabel}
        onRetakeForClarity={scanner.handleRetakeForClarity}
      />
    ),
    [
      messages.length,
      speakingMessageId,
      isLoading,
      effectiveVoiceEnabled,
      speech.handleSpeakMessage,
      handleSend,
      roleCopy.assistantLabel,
      scanner.handleRetakeForClarity,
    ],
  );

  useEffect(() => {
    if (keyboardVisible && messages.length > 0 && isNearBottom) {
      const timer = setTimeout(
        () => scrollToBottom({ animated: true, delay: 50 }),
        Platform.OS === 'android' ? 150 : 50,
      );
      return () => clearTimeout(timer);
    }
  }, [keyboardVisible, isNearBottom, scrollToBottom, messages.length]);

  if (!isInitialized && !initTimedOut) {
    return (
      <View style={[layoutStyles.loadingContainer, { backgroundColor: theme.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <EduDashSpinner size="large" color={theme.primary} />
        <Text style={[layoutStyles.loadingText, { color: theme.text }]}>Initializing Dash...</Text>
      </View>
    );
  }

  const keyboardBehavior = Platform.OS === 'ios' ? 'padding' : undefined;
  const keyboardOffset = Platform.OS === 'ios' ? 90 : 0;
  const composerBottomInset =
    Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, COMPOSER_ANDROID_NAV_LIFT);
  const keyboardUp = keyboardHeight > 0;
  const safeComposerHeight = Math.max(composerHeight, COMPOSER_OVERLAY_MIN_HEIGHT);
  const composerExtraBottom = keyboardUp ? composerBottomInset : 0;
  const bottomThinkingDockClearance = showBottomThinkingDock ? 58 : 0;
  const messageViewportInset =
    keyboardHeight +
    COMPOSER_FLOAT_GAP +
    composerExtraBottom +
    safeComposerHeight +
    bottomThinkingDockClearance;
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
        <View pointerEvents="none" style={layoutStyles.backgroundLayer}>
          <LinearGradient colors={backgroundBase} style={layoutStyles.backgroundGradient} />
          <LinearGradient
            colors={glowA}
            style={layoutStyles.backgroundGlowA}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <LinearGradient
            colors={glowB}
            style={layoutStyles.backgroundGlowB}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
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

          <DashAssistantHeader
            theme={theme}
            tierStatus={tierStatus}
            shellSubtitle={shellSubtitle}
            isTutorUiActive={isTutorUiActive}
            useMinimalNextGenLayout={useMinimalNextGenLayout}
            tutorModeLabel={tutorModeLabel}
            effectiveVoiceEnabled={effectiveVoiceEnabled}
            showSpeechControls={speech.showSpeechControls}
            speech={{
              isSpeaking,
              chunkCount: speech.chunkCount,
              displaySpeechIndex: speech.displaySpeechIndex,
              canSeekBack: speech.canSeekBack,
              canSeekForward: speech.canSeekForward,
              onToggle: speech.handleSpeechToggle,
              onSeek: speech.speakFromSegment,
            }}
            isTypingActive={isTypingActive}
            isLoading={isLoading}
            isUploading={isUploading}
            isRecording={isRecording}
            allModels={allModels}
            selectedModel={selectedModel}
            canSelectModel={canSelectHeaderModel}
            onSelectModel={setSelectedModel}
            onStopAllActivity={() => void stopAllActivity()}
            onOpenOptions={() => openOptionsSheet()}
            onOpenOrb={handleOpenOrb}
            onClose={onClose}
            onClosePress={async () => {
              await stopSpeaking();
              dashInstance?.cleanup?.();
              onClose?.();
            }}
          />

          <View style={[layoutStyles.messagesClip, { marginBottom: messageViewportInset }]}>
            <DashAssistantMessages
              flashListRef={flashListRef}
              messages={messages}
              renderMessage={renderMessage}
              styles={{ ...layoutStyles, ...messageStyles, ...inputStyles }}
              theme={theme}
              isLoading={isTypingActive}
              isNearBottom={isNearBottom}
              setIsNearBottom={setIsNearBottom}
              unreadCount={unreadCount}
              setUnreadCount={setUnreadCount}
              bottomScrollRequestId={bottomScrollRequestId}
              scrollToBottom={scrollToBottom}
              renderSuggestedActions={() => null}
              onSendMessage={(text) => handleSend(text)}
              bottomInset={0}
              keyboardVisible={keyboardVisible}
              compactBottomPadding
              tutorMode={activeTutorMode || null}
              userRole={normalizedRole}
              webScrollNodeRef={webScrollNodeRef}
            />
          </View>

          {!isNearBottom && messages.length > 0 && (
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
              onPress={() => {
                setUnreadCount(0);
                scrollToBottom({ animated: true, delay: 0, force: true });
                requestAnimationFrame(() =>
                  scrollToBottom({ animated: false, delay: 0, force: true }),
                );
              }}
              accessibilityLabel="Jump to bottom"
              activeOpacity={0.8}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <Ionicons name="chevron-down" size={20} color={theme.onPrimary || '#fff'} />
              {unreadCount > 0 && (
                <View style={[messageStyles.scrollToBottomBadge, { backgroundColor: theme.error }]}>
                  <Text
                    style={[
                      messageStyles.scrollToBottomBadgeText,
                      { color: theme.onError || '#fff' },
                    ]}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          <DashAssistantThinkingDock
            theme={theme}
            show={showBottomThinkingDock}
            label={bottomThinkingLabel}
            toolActivityLabel={toolActivityLabel}
            keyboardHeight={keyboardHeight}
            safeComposerHeight={safeComposerHeight}
            composerExtraBottom={composerExtraBottom}
          />

          <View
            style={[
              layoutStyles.composerArea,
              {
                bottom: keyboardHeight + COMPOSER_FLOAT_GAP + composerExtraBottom,
                paddingBottom: keyboardUp ? 0 : composerBottomInset,
              },
            ]}
            pointerEvents="box-none"
            onLayout={(e) => setComposerHeight(e.nativeEvent.layout.height)}
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
              onSend={() => handleSend()}
              onMicPress={handleInputMicPress}
              onCancelVoiceAutoSend={cancelVoiceAutoSend}
              onInterrupt={stopAllActivity}
              onTakePhoto={scanner.openScanner}
              onAttachFile={openAttachmentSheet}
              onRemoveAttachment={handleRemoveAttachment}
              onUpdateAttachmentUri={updateAttachmentUri}
              onQuickAction={(text) => handleSend(text)}
              onCancel={cancelGeneration}
              bottomInset={0}
              hideQuickChips={disableQuickChips || true}
              onInputFocus={handleComposerFocus}
              onPasteImage={handlePasteImage}
            />
          </View>

          {alertState.bannerMode ? (
            alertState.visible && (
              <View
                style={{
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
                }}
              >
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
            onClose={() => setAttachmentSheetVisible(false)}
            onTakePhoto={scanner.openScanner}
            onPickImages={() => void handlePickImages()}
            onPickDocuments={() => void handlePickDocuments()}
            showDocuments
            isBusy={isLoading || isUploading}
          />
          <DashOptionsSheet
            visible={optionsSheetVisible}
            onClose={() => setOptionsSheetVisible(false)}
            onNewChat={handleNewChat}
            onOpenHistory={() => router.push('/screens/dash-conversations-history')}
            onOpenSearch={() => router.push('/screens/app-search?scope=dash&q=dash')}
            onOpenOrb={handleOpenOrb}
            onOpenSettings={() => router.push('/screens/ai-settings' as any)}
            onOpenScanner={scanner.openScanner}
            onRunScheduleTool={handleRunScheduleTool}
            onRunAssignmentsTool={canRunAssignmentsTool ? handleRunAssignmentsTool : undefined}
            isBusy={isLoading || isUploading}
          />
          <HomeworkScanner
            visible={scanner.scannerVisible}
            onClose={scanner.closeScanner}
            onScanned={scanner.handleScannerScanned}
            title="Scan Image"
            tier={tier || 'free'}
            remainingScans={scanner.remainingScans}
            userId={autoScanUserId}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default DashAssistant;
