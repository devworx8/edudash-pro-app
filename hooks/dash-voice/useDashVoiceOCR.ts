/**
 * useDashVoiceOCR — OCR image analysis branch for Dash Voice.
 *
 * Called by useDashVoiceSendMessage when an image is attached and OCR mode
 * is detected. Fetches the non-streaming OCR endpoint, applies criteria
 * guardrails, optionally auto-exports a PDF, then updates conversation state.
 */

import { useCallback } from 'react';
import { track } from '@/lib/analytics';
import { buildDashTurnTelemetry } from '@/lib/dash-ai/turnTelemetry';
import { cleanRawJSON } from '@/lib/dash-voice-utils';
import {
  extractWhiteboardContent,
  stripWhiteboardFromDisplay,
  getWhiteboardTTSContent,
} from '@/components/ai/DashTutorWhiteboard';
import { consumeAutoScanBudget } from '@/lib/dash-ai/imageBudget';
import type { ConversationEntry, OrbPdfArtifact } from './types';
import type { WhiteboardContent } from '@/components/ai/DashTutorWhiteboard';

interface RunOCRParams {
  url: string;
  accessToken: string;
  body: string;
  trimmed: string;
  ocrTask: string | null;
  shouldAutoExportPdf: boolean;
  shouldConsumeScannerQuota: boolean;
  attachedImageSource: string | null;
  turnId: string;
  turnStartedAt: number;
  turnTelemetryBase: Record<string, any>;
  updatedHistory: ConversationEntry[];
  applyCriteriaGuardrails: (text: string) => Promise<{ text: string; warningCode?: string }>;
  exportPdfFromVoiceResponse: (prompt: string, content: string) => Promise<OrbPdfArtifact | null>;
}

interface UseDashVoiceOCRParams {
  activeTier: string;
  autoScanUserId: string | null;
  setWhiteboardContent: (v: WhiteboardContent | null) => void;
  setLastResponse: (v: string) => void;
  setStreamingText: (v: string) => void;
  setIsProcessing: (v: boolean) => void;
  conversationHistoryRef: React.MutableRefObject<ConversationEntry[]>;
  activeRequestRef: React.MutableRefObject<{ abort: () => void } | null>;
  setConversationHistory: (v: ConversationEntry[]) => void;
  enqueueSpeech: (text: string) => void;
  persistOrbMessages: (msgs: ConversationEntry[]) => Promise<void>;
  logDashTrace: (event: string, payload?: Record<string, unknown>) => void;
  refreshAutoScanBudget: () => Promise<void>;
}

export function useDashVoiceOCR({
  activeTier,
  autoScanUserId,
  setWhiteboardContent,
  setLastResponse,
  setStreamingText,
  setIsProcessing,
  conversationHistoryRef,
  activeRequestRef,
  setConversationHistory,
  enqueueSpeech,
  persistOrbMessages,
  logDashTrace,
  refreshAutoScanBudget,
}: UseDashVoiceOCRParams) {
  const runOCRRequest = useCallback(async (params: RunOCRParams): Promise<void> => {
    const {
      url, accessToken, body, trimmed, ocrTask, shouldAutoExportPdf,
      shouldConsumeScannerQuota, attachedImageSource,
      turnId, turnStartedAt, turnTelemetryBase, updatedHistory,
      applyCriteriaGuardrails, exportPdfFromVoiceResponse,
    } = params;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body,
    });
    const data = await response.json().catch(() => ({} as Record<string, any>));
    if (!response.ok) {
      throw new Error(String(data?.error || data?.message || `Request failed (${response.status})`));
    }
    const ocr = data?.ocr;
    const confidence = typeof data?.confidence_score === 'number'
      ? data.confidence_score
      : typeof ocr?.confidence === 'number' ? ocr.confidence : null;
    const content = typeof data?.content === 'string'
      ? data.content : typeof ocr?.analysis === 'string' ? ocr.analysis : '';
    const cleaned = cleanRawJSON(content);
    const lowConfidenceHint =
      typeof confidence === 'number' && confidence <= 0.75
        ? `\n\nScan clarity: ${Math.round(confidence * 100)}%. For better accuracy, retake with clearer lighting and a flatter page.`
        : '';
    const displayText = (cleaned || 'I analyzed the image but did not find readable text.') + lowConfidenceHint;
    const criteriaGuard = await applyCriteriaGuardrails(displayText);
    const finalDisplayText = criteriaGuard.text || displayText;
    let resolvedDisplayText = finalDisplayText;
    let resolvedSpeechText = finalDisplayText;
    if (shouldAutoExportPdf) {
      const artifact = await exportPdfFromVoiceResponse(trimmed, finalDisplayText);
      if (artifact?.url) {
        resolvedDisplayText = `${finalDisplayText}\n\nPDF generated. Tap "Open latest PDF" below.`;
        resolvedSpeechText = `${finalDisplayText}\n\nYour PDF is ready.`;
      }
    }
    logDashTrace('ocr_response', {
      turnId, responseChars: resolvedDisplayText.length,
      responsePreview: resolvedDisplayText.slice(0, 160),
      ocrTask: ocrTask || 'document', criteriaWarning: criteriaGuard.warningCode || null,
    });
    const wb = extractWhiteboardContent(resolvedDisplayText);
    if (wb) setWhiteboardContent(wb);
    setLastResponse(stripWhiteboardFromDisplay(resolvedDisplayText));
    setStreamingText('');
    setIsProcessing(false);
    if (resolvedDisplayText) {
      const withResponse = [...updatedHistory, { role: 'assistant' as const, content: resolvedDisplayText }];
      conversationHistoryRef.current = withResponse;
      setConversationHistory(withResponse);
      persistOrbMessages(withResponse);
      // When Dash Board is shown, read the board content; otherwise read the response
      const ttsText = wb ? getWhiteboardTTSContent(wb) : resolvedSpeechText;
      if (ttsText) enqueueSpeech(ttsText);
    }
    if (shouldConsumeScannerQuota) {
      const consumeResult = await consumeAutoScanBudget(activeTier || 'free', 1, autoScanUserId);
      if (!consumeResult.allowed) {
        logDashTrace('auto_scan_budget_overrun', { turnId, source: attachedImageSource });
      }
      await refreshAutoScanBudget();
    }
    track('dash.turn.completed', buildDashTurnTelemetry({ ...turnTelemetryBase, latencyMs: Date.now() - turnStartedAt }));
    activeRequestRef.current = null;
  }, [
    activeTier, autoScanUserId,
    setWhiteboardContent, setLastResponse, setStreamingText, setIsProcessing,
    conversationHistoryRef, activeRequestRef, setConversationHistory,
    enqueueSpeech, persistOrbMessages, logDashTrace, refreshAutoScanBudget,
  ]);

  return { runOCRRequest };
}
