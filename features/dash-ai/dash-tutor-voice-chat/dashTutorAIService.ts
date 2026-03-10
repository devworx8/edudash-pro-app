/**
 * AI fetch helpers for DashTutorVoiceChat.
 * Pure async functions — all React state comes in via callbacks.
 */

import {
  extractWhiteboardContent,
  stripWhiteboardFromDisplay,
} from '@/components/ai/DashTutorWhiteboard';
import { cleanRawJSON } from '@/lib/dash-voice-utils';
import { dashAiDevLog } from '@/lib/dash-ai/dashAiDevLogger';
import type { ChatMessageData } from '@/components/super-admin/dash-ai-chat/ChatMessage';
import type { WhiteboardContent } from '@/components/ai/DashTutorWhiteboard';

export interface AICallbacks {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageData[]>>;
  setWhiteboardContent: (wb: WhiteboardContent | null) => void;
  updatePhonicsTarget: (text: string) => void;
  clearLowAccuracy: () => void;
  enqueueSpeech: (text: string) => void;
  isVoiceModeRef: React.MutableRefObject<boolean>;
}

function parseDelta(data: string): string {
  if (!data || data === '[DONE]') return '';
  try {
    const p = JSON.parse(data);
    if (p.type === 'tool_use' || p.tool_name) return '';
    if (p.type === 'content_block_delta' && p.delta?.text) return p.delta.text;
    if (typeof p.delta === 'string') return p.delta;
    if (p.delta?.text) return p.delta.text;
    if (typeof p.content === 'string') return p.content;
    if (typeof p.text === 'string') return p.text;
  } catch {}
  return '';
}

function finalise(
  text: string,
  assistantId: string,
  cbs: AICallbacks,
) {
  const cleaned = cleanRawJSON(text);
  const wb = extractWhiteboardContent(cleaned);
  if (wb) cbs.setWhiteboardContent(wb);
  cbs.setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantId ? { ...m, content: cleaned, isStreaming: false } : m,
    ),
  );
  cbs.updatePhonicsTarget(cleaned);
  cbs.clearLowAccuracy();
  if (cbs.isVoiceModeRef.current && cleaned) cbs.enqueueSpeech(cleaned);
}

export async function regularAI(
  payloadBase: object,
  token: string,
  assistantId: string,
  cbs: AICallbacks,
): Promise<void> {
  const response = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-proxy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...payloadBase, stream: false }),
    },
  );
  const data = await response.json();
  if (!response.ok || !data?.success) throw new Error(data?.message || data?.error || 'Request failed');
  const text = data.content || data.response || '';
  finalise(text, assistantId, cbs);
}

export async function streamAI(
  payloadBase: object,
  token: string,
  assistantId: string,
  cbs: AICallbacks,
): Promise<void> {
  // Add timeout for faster failure detection
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout for AI
  
  let response: Response;
  try {
    response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-proxy`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...payloadBase, stream: true }),
        signal: controller.signal,
      },
    );
  } catch (fetchError) {
    clearTimeout(timeoutId);
    if (fetchError instanceof Error && fetchError.name === 'AbortError') {
      throw new Error('AI request timed out');
    }
    throw fetchError;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    dashAiDevLog('voice_response_error', { status: response.status, message: err?.message, code: err?.code, rawError: err });
    throw new Error(err?.message || err?.error || `Request failed: ${response.status}`);
  }

  // Fallback: no streaming body
  if (!response.body) {
    const raw = await response.text();
    let extracted = '';
    raw.replace(/data:\s*/g, '').replace(/\[DONE\]/g, '').split('\n').filter(Boolean).forEach((line) => {
      try {
        const p = JSON.parse(line);
        if (p.delta?.text) extracted += p.delta.text;
        else if (typeof p.content === 'string') extracted += p.content;
      } catch {}
    });
    finalise((extracted || raw).trim(), assistantId, cbs);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  let sentenceBuffer = '';
  let pendingFlush: ReturnType<typeof setTimeout> | null = null;
  const FLUSH_INTERVAL_MS = 35; // Reduced from 50 for smoother streaming

  const scheduleFlush = () => {
    if (pendingFlush) return;
    pendingFlush = setTimeout(() => {
      pendingFlush = null;
      const c = cleanRawJSON(fullResponse);
      cbs.setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: c, isStreaming: false } : m)),
      );
    }, FLUSH_INTERVAL_MS);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        if (!line.trim() || !line.startsWith('data: ')) continue;
        const delta = parseDelta(line.substring(6).trim());
        if (!delta) continue;
        fullResponse += delta;
        sentenceBuffer += delta;
        scheduleFlush();
        if (/[.!?]\s/.test(sentenceBuffer) && cbs.isVoiceModeRef.current && sentenceBuffer.trim().length > 4) {
          cbs.enqueueSpeech(sentenceBuffer.trim());
          sentenceBuffer = '';
        }
      }
    }
    if (sentenceBuffer.trim() && cbs.isVoiceModeRef.current) cbs.enqueueSpeech(sentenceBuffer.trim());
    if (pendingFlush) { clearTimeout(pendingFlush); pendingFlush = null; }
    finalise(fullResponse, assistantId, cbs);
  } catch (error) {
    if (fullResponse.trim()) {
      finalise(fullResponse, assistantId, cbs);
    } else {
      throw error;
    }
  }
}

// Re-export stripWhiteboardFromDisplay for use in the component
export { stripWhiteboardFromDisplay };