/**
 * useDashVoiceSendMessage — message dispatch orchestrator for Dash Voice.
 *
 * Handles session setup, conversation history, handoff routing, prompt
 * construction, and criteria guardrails. Delegates OCR to useDashVoiceOCR
 * and SSE streaming to useDashVoiceStreaming.
 */

import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { buildDashTurnTelemetry, createDashTurnId } from '@/lib/dash-ai/turnTelemetry';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { classifyFullChatIntent } from '@/lib/dash-ai/fullChatIntent';
import { trackTutorFullChatHandoff } from '@/lib/ai/trackingEvents';
import { buildSystemPrompt, cleanRawJSON, shouldEnableVoiceTurnTools, getStreamingPlaceholder } from '@/lib/dash-voice-utils';
import { detectPhonicsIntent } from '@/lib/dash-ai/phonicsDetection';
import {
  buildCriteriaHeadingTemplate, detectOCRTask, extractCriteriaHeadings,
  getCriteriaResponsePrompt, isOCRIntent, getOCRPromptForTask, isShortOrAttachmentOnlyPrompt,
} from '@/lib/dash-ai/ocrPrompts';
import { enforceCriteriaResponseWithSingleRewrite } from '@/features/dash-ai/criteriaEnforcement';
import { wantsPdfArtifact, type UseDashVoiceSendMessageParams, type DashVoiceDictationProbe, type ConversationEntry } from './types';
import { useDashVoiceStreaming } from './useDashVoiceStreaming';
import { useDashVoiceOCR } from './useDashVoiceOCR';

export function useDashVoiceSendMessage({
  isProcessing, setIsProcessing, setLastResponse, setStreamingText,
  setWhiteboardContent, setConversationHistory, setLatestPdfArtifact,
  setRestartBlocked, setAttachedImage,
  conversationHistoryRef, conversationIdRef, activeRequestRef,
  speechQueueRef, streamedPrefixQueuedRef,
  attachedImage, role, orgType, aiScope, preferredLanguage,
  profile, user, dashPolicy, activeTier, autoScanUserId, streamingTTSEnabled,
  enqueueSpeech, maybeEnqueueStreamingSpeech, resetStreamingSpeech,
  longestCommonPrefixLen, logDashTrace, refreshAutoScanBudget, voiceOrbRef,
}: UseDashVoiceSendMessageParams) {
  const persistOrbMessages = useCallback(async (msgs: ConversationEntry[]) => {
    try {
      const userId = user?.id || profile?.id;
      if (!userId) return;
      const key = `dash:orb-session:${userId}`;
      await AsyncStorage.setItem(key, JSON.stringify({ conversationId: conversationIdRef.current, messages: msgs, updatedAt: Date.now() }));
    } catch { /* non-critical */ }
  }, [profile?.id, user?.id, conversationIdRef]);

  const { runStreamingRequest, exportPdfFromVoiceResponse } = useDashVoiceStreaming({
    role, profile, user, activeTier, streamingTTSEnabled,
    setWhiteboardContent, setLastResponse, setStreamingText, setIsProcessing,
    setLatestPdfArtifact, conversationHistoryRef, activeRequestRef,
    streamedPrefixQueuedRef, enqueueSpeech, maybeEnqueueStreamingSpeech,
    resetStreamingSpeech, longestCommonPrefixLen, logDashTrace,
    persistOrbMessages, setConversationHistory,
  });

  const { runOCRRequest } = useDashVoiceOCR({
    activeTier, autoScanUserId, setWhiteboardContent, setLastResponse,
    setStreamingText, setIsProcessing, conversationHistoryRef, activeRequestRef,
    setConversationHistory, enqueueSpeech, persistOrbMessages, logDashTrace, refreshAutoScanBudget,
  });

  const sendMessage = useCallback(async (
    text: string, options?: { dictationProbe?: DashVoiceDictationProbe },
  ) => {
    const trimmed = text.trim();
    if (!trimmed || isProcessing) return;
    const shouldAutoExportPdf = wantsPdfArtifact(trimmed);
    const flags = getFeatureFlagsSync();
    const handoffIntent = flags.dash_tutor_auto_handoff_v1 ? classifyFullChatIntent(trimmed) : null;
    if (handoffIntent) {
      await persistOrbMessages(conversationHistoryRef.current);
      trackTutorFullChatHandoff({ intent: handoffIntent, source: 'dash_voice', role });
      setRestartBlocked(true);
      activeRequestRef.current?.abort();
      voiceOrbRef.current?.stopSpeaking?.().catch(() => {});
      voiceOrbRef.current?.stopListening?.().catch(() => {});
      router.push({ pathname: '/screens/dash-assistant', params: { source: 'orb', initialMessage: trimmed, resumePrompt: trimmed, mode: handoffIntent === 'quiz' ? 'tutor' : 'advisor', tutorMode: handoffIntent === 'quiz' ? 'quiz' : undefined, handoffIntent } });
      return;
    }
    const turnId = createDashTurnId('dash_voice_turn');
    const turnStartedAt = Date.now();
    const turnTelemetryBase = buildDashTurnTelemetry({ conversationId: conversationIdRef.current, turnId, mode: 'orb', tier: String((profile as any)?.subscription_tier || '').trim() || null, voiceProvider: 'voice_orb', fallbackReason: 'none', source: 'dash-voice.sendMessage' });
    track('dash.turn.started', turnTelemetryBase);
    logDashTrace('turn_started', { turnId, role, orgType, language: preferredLanguage, inputChars: trimmed.length, inputPreview: trimmed.slice(0, 140), hasImage: !!attachedImage?.base64, autoPdfIntent: shouldAutoExportPdf });
    activeRequestRef.current?.abort();
    resetStreamingSpeech();
    speechQueueRef.current = [];
    setIsProcessing(true);
    setLastResponse('');
    setWhiteboardContent(null);
    setStreamingText(getStreamingPlaceholder(trimmed));
    const updatedHistory = [...conversationHistoryRef.current, { role: 'user' as const, content: trimmed }];
    conversationHistoryRef.current = updatedHistory;
    setConversationHistory(updatedHistory);
    try {
      const supabase = assertSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in');
      const recentText = updatedHistory.slice(-4).map(m => m.content).join(' ');
      const phonicsActive = detectPhonicsIntent(trimmed) || detectPhonicsIntent(recentText);
      const systemPrompt = buildSystemPrompt(orgType, role, preferredLanguage, { phonicsActive }) + '\n\n' + dashPolicy.systemPromptAddendum;
      const hasImage = !!attachedImage?.base64;
      const ocrTask = hasImage ? detectOCRTask(trimmed) : null;
      const ocrMode = hasImage && (isOCRIntent(trimmed) || ocrTask !== null || isShortOrAttachmentOnlyPrompt(trimmed));
      const attachedImageSource = attachedImage?.source || null;
      const criteriaHeadings = extractCriteriaHeadings(trimmed);
      const criteriaIntent = criteriaHeadings.length > 0;
      const enableToolsForTurn = shouldEnableVoiceTurnTools(trimmed, { hasAttachment: hasImage, ocrMode, criteriaIntent });
      const recentHistory = updatedHistory.slice(-20);
      const payload: Record<string, any> = {
        messages: recentHistory,
        context: systemPrompt +
          (hasImage ? '\n\nIMAGE PROCESSING: The user attached an image. Describe what you see and provide educational insights.' : '') +
          (getCriteriaResponsePrompt(trimmed) ? `\n\n${getCriteriaResponsePrompt(trimmed)}` : '') +
          (buildCriteriaHeadingTemplate(criteriaHeadings) ? `\n\n${buildCriteriaHeadingTemplate(criteriaHeadings)}` : '') +
          (ocrMode ? `\n\n${getOCRPromptForTask(ocrTask || 'document')}` : ''),
      };
      if (hasImage) payload.images = [{ data: attachedImage!.base64, media_type: 'image/jpeg' }];
      if (ocrMode) { payload.ocr_mode = true; payload.ocr_task = ocrTask || 'document'; payload.ocr_response_format = 'json'; }
      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-proxy`;
      const body = JSON.stringify({ scope: aiScope, service_type: ocrMode ? 'image_analysis' : 'dash_conversation', payload, stream: !ocrMode, enable_tools: enableToolsForTurn, metadata: { role, source: 'dash_voice_orb', voice_dictation_probe: options?.dictationProbe, org_type: orgType, dash_mode: dashPolicy.defaultMode, language: preferredLanguage || undefined, has_image: hasImage, ocr_mode: ocrMode, ocr_task: ocrTask || undefined, stream_tool_mode: enableToolsForTurn ? 'enabled' : 'deferred' } });
      if (attachedImage) setAttachedImage(null);
      const applyCriteriaGuardrails = async (candidateText: string): Promise<{ text: string; warningCode?: string }> => {
        const enforcement = await enforceCriteriaResponseWithSingleRewrite({
          userInput: trimmed, responseContent: candidateText, extractedHeadings: criteriaHeadings,
          rewriteAttempt: async (rewritePrompt) => {
            const rewriteBody = JSON.stringify({ scope: aiScope, service_type: ocrMode ? 'image_analysis' : 'dash_conversation', payload: { messages: [...recentHistory.slice(-10), { role: 'assistant', content: candidateText }, { role: 'user', content: rewritePrompt }], context: payload.context }, stream: false, enable_tools: false, metadata: { role, source: 'dash_voice_orb.criteria_rewrite', criteria_rewrite_pass: true } });
            const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: rewriteBody });
            const d = await r.json().catch(() => ({} as Record<string, any>));
            if (!r.ok) throw new Error(String(d?.error || d?.message || `Request failed (${r.status})`));
            return cleanRawJSON(String(d?.content || ''));
          },
        });
        if (enforcement.outcome === 'failed_after_rewrite') return { text: `${String(enforcement.content || candidateText).trim()}\n\nNote: Please verify criterion headings before submission.`, warningCode: enforcement.warningCode || 'criteria_mapping_mismatch' };
        return { text: String(enforcement.content || candidateText).trim(), warningCode: enforcement.warningCode || undefined };
      };
      if (ocrMode) {
        await runOCRRequest({ url, accessToken: session.access_token, body, trimmed, ocrTask, shouldAutoExportPdf, shouldConsumeScannerQuota: ocrMode && attachedImageSource === 'scanner', attachedImageSource, turnId, turnStartedAt, turnTelemetryBase, updatedHistory, applyCriteriaGuardrails, exportPdfFromVoiceResponse });
        return;
      }
      runStreamingRequest({ url, accessToken: session.access_token, body, trimmed, shouldAutoExportPdf, turnId, turnStartedAt, turnTelemetryBase, updatedHistory, applyCriteriaGuardrails });
    } catch (error) {
      resetStreamingSpeech();
      const msg = error instanceof Error ? error.message : 'Something went wrong';
      logDashTrace('turn_error', { turnId: '', latencyMs: 0, message: msg });
      setLastResponse(`Sorry, ${msg}. Please try again.`);
      setStreamingText('');
      setIsProcessing(false);
      track('dash.turn.failed', { ...buildDashTurnTelemetry({ conversationId: conversationIdRef.current, turnId: '', mode: 'orb', tier: null, voiceProvider: 'voice_orb', fallbackReason: 'none', source: 'dash-voice.sendMessage', latencyMs: 0 }), error: msg });
    }
  }, [
    isProcessing, orgType, role, aiScope, preferredLanguage, attachedImage,
    enqueueSpeech, resetStreamingSpeech, logDashTrace, persistOrbMessages,
    exportPdfFromVoiceResponse, runStreamingRequest, runOCRRequest,
    profile, activeTier, dashPolicy.defaultMode, dashPolicy.systemPromptAddendum,
    setIsProcessing, setLastResponse, setStreamingText, setWhiteboardContent,
    setConversationHistory, setRestartBlocked, setAttachedImage,
    conversationHistoryRef, conversationIdRef, activeRequestRef,
    speechQueueRef, voiceOrbRef,
  ]);

  return { sendMessage, persistOrbMessages };
}
