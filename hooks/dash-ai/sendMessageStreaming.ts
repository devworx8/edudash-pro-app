/**
 * hooks/dash-ai/sendMessageStreaming.ts
 *
 * Streaming message setup extracted from sendMessageInternal.
 * Creates the temporary streaming message, sets up the rAF-batched
 * chunk handler, and handles the streaming→non-streaming retry fallback.
 *
 * No React hooks — pure functions that operate on injected state setters.
 */

import type { DashMessage } from '@/services/dash-ai/types';
import type { IDashAIAssistant } from '@/services/dash-ai/DashAICompat';
import type { ResponseLifecycleTracker } from './types';
import { getStreamingPlaceholder } from '@/lib/dash-voice-utils';

// ─── Types ──────────────────────────────────────────────────

export interface StreamingSetup {
  tempStreamingMsgId: string;
  handleStreamChunk: (chunk: string) => void;
  cleanup: () => void;
  getStreamDraft: () => string;
}

export interface StreamingDeps {
  requestId: string;
  isCurrentRequest: () => boolean;
  setResponseLifecycleState: (id: string, state: string, text?: string) => void;
  setStreamingMessageId: (id: string | null) => void;
  setStreamingContent: (content: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<DashMessage[]>>;
  scrollToBottom: (opts: { animated: boolean; delay: number; force?: boolean }) => void;
  isNearBottomRef: { current: boolean };
  responseMode: string;
  selectedModel: string;
  logDashTrace: (event: string, payload?: Record<string, unknown>) => void;
  userText: string;
}

// ─── Setup streaming message + chunk handler ────────────────

export function createStreamingSetup(deps: StreamingDeps): StreamingSetup {
  const tempStreamingMsgId = `streaming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const streamStartAt = Date.now();
  let firstChunkAt: number | null = null;
  let lastStreamLogAt = 0;
  let hasReceivedFirstChunk = false;
  let streamTextDraft = '';
  let streamPaintFrame: number | null = null;
  let lastStreamAutoScrollAt = 0;

  const instantPlaceholder = getStreamingPlaceholder(deps.userText);
  deps.setResponseLifecycleState(deps.requestId, 'draft_streaming', instantPlaceholder);
  deps.setStreamingMessageId(tempStreamingMsgId);
  deps.setStreamingContent(instantPlaceholder);

  const tempStreamingMessage: DashMessage = {
    id: tempStreamingMsgId,
    type: 'assistant',
    content: instantPlaceholder,
    timestamp: Date.now(),
  };
  deps.setMessages(prev => [...prev, tempStreamingMessage]);

  const flushStreamDraft = () => {
    if (!deps.isCurrentRequest()) return;
    const currentDraft = streamTextDraft;
    deps.setStreamingContent(currentDraft);
    deps.setMessages((prevMessages) => {
      let changed = false;
      const next = prevMessages.map((msg) => {
        if (msg.id !== tempStreamingMsgId) return msg;
        if (msg.content === currentDraft) return msg;
        changed = true;
        return { ...msg, content: currentDraft };
      });
      return changed ? next : prevMessages;
    });
  };

  const handleStreamChunk = (chunk: string) => {
    if (!deps.isCurrentRequest()) return;
    if (firstChunkAt === null) {
      firstChunkAt = Date.now();
      if (__DEV__) {
        console.log('[useDashAssistant] Streaming first token latency (ms):', firstChunkAt - streamStartAt);
      }
      deps.logDashTrace('stream_first_chunk', {
        latencyMs: firstChunkAt - streamStartAt,
        messageId: tempStreamingMsgId,
        model: deps.selectedModel,
        responseMode: deps.responseMode,
      });
      if (deps.isNearBottomRef.current) {
        deps.scrollToBottom({ animated: false, delay: 0 });
      }
    }
    const now = Date.now();
    if (now - lastStreamLogAt > 900) {
      lastStreamLogAt = now;
      deps.logDashTrace('stream_progress', {
        elapsedMs: now - streamStartAt,
        chunkChars: chunk.length,
        chunkPreview: chunk.slice(0, 80),
      });
    }
    streamTextDraft = hasReceivedFirstChunk ? `${streamTextDraft}${chunk}` : chunk;
    hasReceivedFirstChunk = true;
    if (streamPaintFrame === null) {
      streamPaintFrame = requestAnimationFrame(() => {
        streamPaintFrame = null;
        flushStreamDraft();
      });
    }
    if (deps.isNearBottomRef.current && now - lastStreamAutoScrollAt > 700) {
      lastStreamAutoScrollAt = now;
      deps.scrollToBottom({ animated: false, delay: 0 });
    }
  };

  const cleanup = () => {
    if (__DEV__) {
      const totalMs = Date.now() - streamStartAt;
      console.log('[useDashAssistant] Streaming request completed (ms):', totalMs);
    }
    deps.logDashTrace('stream_done', {
      totalMs: Date.now() - streamStartAt,
      firstTokenLatencyMs: firstChunkAt ? firstChunkAt - streamStartAt : null,
      model: deps.selectedModel,
      responseMode: deps.responseMode,
    });
    if (streamPaintFrame !== null) {
      cancelAnimationFrame(streamPaintFrame);
      streamPaintFrame = null;
    }
    if (deps.isCurrentRequest()) {
      deps.setStreamingMessageId(null);
      deps.setStreamingContent('');
    }
    deps.setMessages(prev => prev.filter(msg => msg.id !== tempStreamingMsgId));
  };

  return {
    tempStreamingMsgId,
    handleStreamChunk,
    cleanup,
    getStreamDraft: () => streamTextDraft,
  };
}

// ─── Send with streaming + retry fallback ───────────────────

export interface StreamingSendOptions {
  dashInstance: IDashAIAssistant;
  outgoingText: string;
  conversationId: string;
  aiAttachments: any[];
  contextOverride: string | null;
  selectedModel: string;
  messagesOverride: any[];
  metadata: Record<string, any>;
  signal: AbortSignal;
  streamingEnabled: boolean;
  streamingSetup: StreamingSetup | null;
  logDashTrace: (event: string, payload?: Record<string, unknown>) => void;
  isCurrentRequest: () => boolean;
}

export async function sendWithStreamingFallback(options: StreamingSendOptions): Promise<DashMessage> {
  const {
    dashInstance,
    outgoingText,
    conversationId,
    aiAttachments,
    contextOverride,
    selectedModel,
    messagesOverride,
    metadata,
    signal,
    streamingEnabled,
    streamingSetup,
    logDashTrace,
    isCurrentRequest,
  } = options;

  const sendOptions = {
    contextOverride,
    modelOverride: selectedModel,
    messagesOverride,
    metadata,
    signal,
  } as const;

  if (streamingEnabled && streamingSetup) {
    try {
      const response = await dashInstance.sendMessage(
        outgoingText,
        conversationId || undefined,
        aiAttachments.length > 0 ? aiAttachments : undefined,
        streamingSetup.handleStreamChunk,
        sendOptions,
      );
      if (!isCurrentRequest()) throw new Error('Aborted');
      return response;
    } catch (streamError) {
      const aborted = streamError instanceof Error
        && (streamError.name === 'AbortError' || streamError.message === 'Aborted');
      if (aborted) throw streamError;

      console.warn('[useDashAssistant] Streaming failed, retrying without stream:', streamError);
      logDashTrace('stream_retry_non_stream', {
        error: streamError instanceof Error ? streamError.message : String(streamError),
        model: selectedModel,
      });

      const response = await dashInstance.sendMessage(
        outgoingText,
        conversationId || undefined,
        aiAttachments.length > 0 ? aiAttachments : undefined,
        undefined,
        sendOptions,
      );
      if (!isCurrentRequest()) throw new Error('Aborted');
      return response;
    } finally {
      streamingSetup.cleanup();
    }
  }

  // Non-streaming path
  const response = await dashInstance.sendMessage(
    outgoingText,
    conversationId || undefined,
    aiAttachments.length > 0 ? aiAttachments : undefined,
    undefined,
    sendOptions,
  );
  if (!isCurrentRequest()) throw new Error('Aborted');
  return response;
}
