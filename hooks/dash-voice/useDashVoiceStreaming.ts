/**
 * useDashVoiceStreaming — SSE streaming + PDF auto-export for Dash Voice.
 *
 * Handles createStreamingRequest, response finalisation, criteria-guardrail
 * rewrite for SSE mode, and the exportPdfFromVoiceResponse helper.
 * Called by useDashVoiceSendMessage for all non-OCR turns.
 *
 * Speech: when Dash Board (whiteboard) content is detected, TTS reads the
 * board content instead of the plain response text — one source of truth.
 */

import { useCallback } from 'react';
import { track } from '@/lib/analytics';
import { buildDashTurnTelemetry } from '@/lib/dash-ai/turnTelemetry';
import { ToolRegistry } from '@/services/AgentTools';
import { getCapabilityTier, normalizeTierName } from '@/lib/tiers';
import { cleanRawJSON, createStreamingRequest } from '@/lib/dash-voice-utils';
import {
  extractWhiteboardContent,
  stripWhiteboardFromDisplay,
  getWhiteboardTTSContent,
  type WhiteboardContent,
} from '@/components/ai/DashTutorWhiteboard';
import { assertSupabase } from '@/lib/supabase';
import { firstText, buildPdfTitleFromPrompt, type OrbPdfArtifact, type ConversationEntry } from './types';

interface UseDashVoiceStreamingParams {
  role: string;
  profile: any;
  user: any;
  activeTier: string;
  setWhiteboardContent: (v: WhiteboardContent | null) => void;
  setLastResponse: (v: string) => void;
  setStreamingText: (v: string) => void;
  setIsProcessing: (v: boolean) => void;
  setLatestPdfArtifact: (v: OrbPdfArtifact | null) => void;
  conversationHistoryRef: React.MutableRefObject<ConversationEntry[]>;
  activeRequestRef: React.MutableRefObject<{ abort: () => void } | null>;
  enqueueSpeech: (text: string) => void;
  maybeEnqueueStreamingSpeech?: (text: string) => void;
  flushStreamingSpeechFinal?: (text: string) => void;
  streamingTTSEnabled?: boolean;
  logDashTrace: (event: string, payload?: Record<string, unknown>) => void;
  persistOrbMessages: (msgs: ConversationEntry[]) => Promise<void>;
  setConversationHistory: (v: ConversationEntry[]) => void;
}

export interface StreamingRequestParams {
  url: string;
  accessToken: string;
  body: string;
  trimmed: string;
  shouldAutoExportPdf: boolean;
  turnId: string;
  turnStartedAt: number;
  turnTelemetryBase: Record<string, any>;
  updatedHistory: ConversationEntry[];
  applyCriteriaGuardrails: (text: string) => Promise<{ text: string; warningCode?: string }>;
}

export function useDashVoiceStreaming({
  role, profile, user, activeTier,
  setWhiteboardContent, setLastResponse, setStreamingText, setIsProcessing,
  setLatestPdfArtifact, conversationHistoryRef, activeRequestRef,
  enqueueSpeech, maybeEnqueueStreamingSpeech, flushStreamingSpeechFinal,
  streamingTTSEnabled = false,
  logDashTrace,
  persistOrbMessages, setConversationHistory,
}: UseDashVoiceStreamingParams) {
  const normalizedToolTier = getCapabilityTier(normalizeTierName(activeTier || 'free'));

  const exportPdfFromVoiceResponse = useCallback(async (
    prompt: string, content: string,
  ): Promise<OrbPdfArtifact | null> => {
    const safeContent = String(content || '').trim();
    if (!safeContent) return null;
    try {
      const supabase = assertSupabase();
      const execution = await ToolRegistry.execute('export_pdf',
        { title: buildPdfTitleFromPrompt(prompt), content: safeContent },
        {
          profile, user, supabase, supabaseClient: supabase,
          role: String(profile?.role || role || 'parent').toLowerCase(),
          tier: normalizedToolTier,
          organizationId: (profile as any)?.organization_id || (profile as any)?.preschool_id || null,
          hasOrganization: Boolean((profile as any)?.organization_id || (profile as any)?.preschool_id),
          isGuest: !user?.id,
          trace_id: `dash_voice_pdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          tool_plan: { source: 'dash_voice.auto_pdf_export', intent: 'voice_pdf_request' },
        },
      );
      if (!execution?.success) {
        logDashTrace('pdf_export_failed', { error: execution?.error || 'unknown_error', role, tier: normalizedToolTier });
        return null;
      }
      const raw = (execution.result && typeof execution.result === 'object') ? execution.result as Record<string, any> : {};
      const nested = (raw.result && typeof raw.result === 'object') ? raw.result as Record<string, any> : {};
      const merged = { ...raw, ...nested };
      const url = firstText(merged.downloadUrl, merged.download_url, merged.signedUrl, merged.signed_url, merged.publicUrl, merged.public_url, merged.uri, merged.url);
      if (!url) { logDashTrace('pdf_export_missing_url', { role, tier: normalizedToolTier }); return null; }
      const filename = firstText(merged.filename, merged.file_name, merged.name);
      const artifact: OrbPdfArtifact = { url, title: filename || 'Generated PDF', filename };
      setLatestPdfArtifact(artifact);
      logDashTrace('pdf_export_ready', { filename: artifact.filename, urlPreview: artifact.url.slice(0, 140) });
      return artifact;
    } catch (error) {
      logDashTrace('pdf_export_error', { message: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }, [logDashTrace, normalizedToolTier, profile, role, user, setLatestPdfArtifact]);

  const runStreamingRequest = useCallback((params: StreamingRequestParams) => {
    const { url, accessToken, body, trimmed, shouldAutoExportPdf, turnId, turnStartedAt, turnTelemetryBase, updatedHistory, applyCriteriaGuardrails } = params;
    let firstChunkAt: number | null = null;
    let lastProgressLogAt = 0;
    let firstPhraseLoggedAt: number | null = null;
    const req = createStreamingRequest(url, accessToken, body,
      (accumulated) => {
        if (firstChunkAt === null) { firstChunkAt = Date.now(); logDashTrace('stream_first_chunk', { turnId, firstTokenLatencyMs: firstChunkAt - turnStartedAt }); }
        const now = Date.now();
        if (now - lastProgressLogAt > 900) { lastProgressLogAt = now; logDashTrace('stream_progress', { turnId, chars: accumulated.length, elapsedMs: now - turnStartedAt }); }
        if (accumulated && !/^\s*data:\s*(\[DONE\])?\s*$/i.test(accumulated)) {
          const displayText = stripWhiteboardFromDisplay(accumulated);
          setStreamingText(displayText);
          // Phrase-streaming TTS: enqueue phrases as tokens arrive
          if (streamingTTSEnabled && displayText) {
            if (firstPhraseLoggedAt === null) {
              firstPhraseLoggedAt = Date.now();
              logDashTrace('tts_first_phrase_ms', { turnId, latencyMs: firstPhraseLoggedAt - turnStartedAt });
            }
            maybeEnqueueStreamingSpeech?.(displayText);
          }
        }
      },
      (finalText) => {
        void (async () => {
          const cleaned = cleanRawJSON(finalText);
          const isSseArtifact = !cleaned || /^\s*(data:\s*\[DONE\]|data:\s*$)/i.test(cleaned);
          const displayText = isSseArtifact ? 'I couldn\'t get a response. Please try again.' : cleaned;
          const criteriaGuard = isSseArtifact ? { text: displayText } : await applyCriteriaGuardrails(displayText);
          const finalDisplayText = criteriaGuard.text || displayText;
          let resolvedDisplayText = finalDisplayText;
          let resolvedSpeechText = finalDisplayText;
          if (shouldAutoExportPdf && !isSseArtifact) {
            const artifact = await exportPdfFromVoiceResponse(trimmed, finalDisplayText);
            if (artifact?.url) { resolvedDisplayText = `${finalDisplayText}\n\nPDF generated. Tap "Open latest PDF" below.`; resolvedSpeechText = `${finalDisplayText}\n\nYour PDF is ready.`; }
          }
          logDashTrace('stream_done', { turnId, latencyMs: Date.now() - turnStartedAt, chars: resolvedDisplayText.length, preview: resolvedDisplayText.slice(0, 160), artifact: isSseArtifact, criteriaWarning: (criteriaGuard as any).warningCode || null });
          const wb2 = extractWhiteboardContent(resolvedDisplayText);
          if (wb2) setWhiteboardContent(wb2);
          setLastResponse(stripWhiteboardFromDisplay(resolvedDisplayText));
          setStreamingText('');
          setIsProcessing(false);
          if (resolvedDisplayText && !isSseArtifact) {
            const withResponse = [...updatedHistory, { role: 'assistant' as const, content: resolvedDisplayText }];
            conversationHistoryRef.current = withResponse;
            setConversationHistory(withResponse);
            persistOrbMessages(withResponse);
            // Speak the response — in streaming mode, flush only the unspoken tail
            const ttsText = wb2 ? getWhiteboardTTSContent(wb2) : resolvedSpeechText;
            if (ttsText) {
              if (streamingTTSEnabled) {
                // Flush any buffered tail of the streamed response text
                flushStreamingSpeechFinal?.(resolvedSpeechText);
                // If Dash Board is shown, append its TTS as a separate chunk
                if (wb2) enqueueSpeech(getWhiteboardTTSContent(wb2));
              } else {
                enqueueSpeech(ttsText);
              }
            }
          }
          track('dash.turn.completed', buildDashTurnTelemetry({ ...turnTelemetryBase, latencyMs: Date.now() - turnStartedAt }));
          activeRequestRef.current = null;
        })().catch((error) => {
          const message = error instanceof Error ? error.message : 'Unknown stream finalization error';
          logDashTrace('stream_error', { turnId, latencyMs: Date.now() - turnStartedAt, message });
          setLastResponse(`Sorry, ${message}. Please try again.`);
          setStreamingText('');
          setIsProcessing(false);
          activeRequestRef.current = null;
        });
      },
      (error) => {
        logDashTrace('stream_error', { turnId, latencyMs: Date.now() - turnStartedAt, message: error.message });
        setLastResponse(`Sorry, ${error.message}. Please try again.`);
        setStreamingText('');
        setIsProcessing(false);
        track('dash.turn.failed', { ...buildDashTurnTelemetry({ ...turnTelemetryBase, latencyMs: Date.now() - turnStartedAt }), error: error.message });
        activeRequestRef.current = null;
      },
    );
    activeRequestRef.current = req;
  }, [
    exportPdfFromVoiceResponse, logDashTrace,
    setStreamingText, setWhiteboardContent, setLastResponse, setIsProcessing, setConversationHistory,
    conversationHistoryRef, activeRequestRef,
    enqueueSpeech, maybeEnqueueStreamingSpeech, flushStreamingSpeechFinal,
    streamingTTSEnabled, persistOrbMessages,
  ]);

  return { runStreamingRequest, exportPdfFromVoiceResponse };
}
