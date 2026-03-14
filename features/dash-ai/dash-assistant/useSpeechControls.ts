import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveSpeechControlsLayoutState } from '@/features/dash-ai/speechControls';
import type { DashMessage } from '@/services/dash-ai/types';
import { splitSpeechSegments } from './utils';

interface UseSpeechControlsParams {
  isSpeaking: boolean;
  speakingMessageId: string | null;
  speechChunkProgress: { chunkIndex: number; chunkCount: number } | null | undefined;
  messages: DashMessage[];
  speakResponse: (msg: DashMessage, opts?: { forceSpeak?: boolean }) => Promise<void>;
  stopSpeaking: () => Promise<void>;
}

export function useSpeechControls({
  isSpeaking,
  speakingMessageId,
  speechChunkProgress,
  messages,
  speakResponse,
  stopSpeaking,
}: UseSpeechControlsParams) {
  const [lastSpokenMessageId, setLastSpokenMessageId] = useState<string | null>(null);
  const [speechSegmentIndex, setSpeechSegmentIndex] = useState(0);

  useEffect(() => {
    if (!speakingMessageId) return;
    setLastSpokenMessageId(speakingMessageId);
    setSpeechSegmentIndex(0);
  }, [speakingMessageId]);

  useEffect(() => {
    if (!speechChunkProgress || speechChunkProgress.chunkCount <= 0) return;
    const bounded = Math.max(0, Math.min(speechChunkProgress.chunkIndex, speechChunkProgress.chunkCount - 1));
    setSpeechSegmentIndex((prev) => (prev === bounded ? prev : bounded));
  }, [speechChunkProgress]);

  const activeSpeechMessageId = speakingMessageId || lastSpokenMessageId;
  const activeSpeechMessage = useMemo(() => {
    if (!activeSpeechMessageId) return null;
    const match = messages.find((msg) => msg.id === activeSpeechMessageId);
    if (!match || match.type !== 'assistant') return null;
    return match;
  }, [messages, activeSpeechMessageId]);

  const speechSegments = useMemo(
    () => splitSpeechSegments(activeSpeechMessage?.content || ''),
    [activeSpeechMessage?.content],
  );
  const chunkCount = speechChunkProgress?.chunkCount || speechSegments.length;
  const rawChunkIndex = typeof speechChunkProgress?.chunkIndex === 'number'
    ? speechChunkProgress.chunkIndex : speechSegmentIndex;
  const displaySpeechIndex = Math.max(0, Math.min(rawChunkIndex, Math.max(0, chunkCount - 1)));
  const canSeekBack = displaySpeechIndex > 0 && speechSegments.length > 0;
  const canSeekForward = displaySpeechIndex < speechSegments.length - 1;
  const layout = resolveSpeechControlsLayoutState({
    isSpeaking, hasSpeechMessage: Boolean(activeSpeechMessage), chunkCount,
  });

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
    await speakResponse(replayMessage, { forceSpeak: true });
  }, [activeSpeechMessage, speechSegments, speakResponse, stopSpeaking]);

  const handleSpeakMessage = useCallback(
    (message: DashMessage) => { void speakResponse(message, { forceSpeak: true }); },
    [speakResponse],
  );

  const handleSpeechToggle = useCallback(() => {
    if (isSpeaking) { void stopSpeaking(); return; }
    void speakFromSegment(displaySpeechIndex);
  }, [displaySpeechIndex, isSpeaking, speakFromSegment, stopSpeaking]);

  return {
    showSpeechControls: layout.showControls,
    displaySpeechIndex,
    chunkCount,
    canSeekBack,
    canSeekForward,
    handleSpeakMessage,
    handleSpeechToggle,
    speakFromSegment,
  };
}