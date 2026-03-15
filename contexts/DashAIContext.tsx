/**
 * DashAIContext — Shared AI state provider for DashAssistant and DashOrb.
 *
 * Both UIs mount this context and consume the same messages, streaming,
 * model selection, and tool-execution state. Eliminates the duplicated
 * state management that previously lived independently in each component.
 *
 * Architecture:
 *   app/_layout.tsx
 *     └── <DashAIProvider>          ← wraps entire app
 *           ├── DashAssistantImpl   ← consumes via useDashAIContext()
 *           └── DashOrbImpl         ← consumes via useDashAIContext()
 */

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

import type { DashMessage, DashConversation } from '@/services/dash-ai/types';
import type { IDashAIAssistant } from '@/services/dash-ai/DashAICompat';
import type { AIModelId } from '@/lib/ai/models';
import type { SpeechChunkProgress } from '@/hooks/dash-assistant/voiceHandlers';
import type { LearnerContext } from '@/lib/dash-ai/learnerContext';
import type { TutorSession } from '@/hooks/dash-assistant/tutorTypes';
import { useDashChatModelPreference } from '@/hooks/useDashChatModelPreference';
import { useSubscription } from '@/contexts/SubscriptionContext';

import type { AlertState, DashAIContextValue } from '@/hooks/dash-ai/types';

// ─── Context ────────────────────────────────────────────────

const DashAIContext = createContext<DashAIContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────

export function DashAIProvider({ children }: { children: React.ReactNode }) {
  // Core state
  const [messages, setMessages] = useState<DashMessage[]>([]);
  const [conversation, setConversation] = useState<DashConversation | null>(null);
  const [dashInstance, setDashInstance] = useState<IDashAIAssistant | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Loading / streaming
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<
    'uploading' | 'analyzing' | 'thinking' | 'responding' | null
  >(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');

  // Tool execution
  const [hasActiveToolExecution, setHasActiveToolExecution] = useState(false);
  const [activeToolLabel, setActiveToolLabel] = useState<string | null>(null);

  // TTS / speech
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [speechChunkProgress, setSpeechChunkProgress] = useState<SpeechChunkProgress | null>(null);

  // Model selection (shared by Orb + Assistant)
  const { availableModels, selectedModel, setSelectedModel } = useDashChatModelPreference();

  // Learner / tutor state
  const [learnerContext, setLearnerContext] = useState<LearnerContext | null>(null);
  const [tutorSession, setTutorSession] = useState<TutorSession | null>(null);

  // Subscription (read-only passthrough)
  const { tier, ready: subReady } = useSubscription();

  // Alert system (replaces native Alert.alert)
  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    title: '',
    message: '',
  });
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false }));
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
  }, []);

  const showAlert = useCallback((config: Omit<AlertState, 'visible'>) => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    setAlertState({ ...config, visible: true });
    if (config.autoDismissMs && config.autoDismissMs > 0) {
      autoDismissTimerRef.current = setTimeout(() => {
        setAlertState((prev) => ({ ...prev, visible: false }));
        autoDismissTimerRef.current = null;
      }, config.autoDismissMs);
    }
  }, []);

  // Assemble context value
  const value: DashAIContextValue = {
    // State
    messages,
    conversation,
    dashInstance,
    isInitialized,
    isLoading,
    loadingStatus,
    streamingMessageId,
    streamingContent,
    hasActiveToolExecution,
    activeToolLabel,
    isSpeaking,
    speakingMessageId,
    speechChunkProgress,
    availableModels,
    selectedModel,
    learnerContext,
    tutorSession,
    tier,
    subReady,
    // Actions
    setMessages,
    setConversation,
    setDashInstance,
    setIsInitialized,
    setIsLoading,
    setLoadingStatus,
    setStreamingMessageId,
    setStreamingContent,
    setHasActiveToolExecution,
    setActiveToolLabel,
    setIsSpeaking,
    setSpeakingMessageId,
    setSpeechChunkProgress,
    setSelectedModel,
    setLearnerContext,
    setTutorSession,
    showAlert,
    hideAlert,
    alertState,
  };

  return <DashAIContext.Provider value={value}>{children}</DashAIContext.Provider>;
}

// ─── Consumer hook ──────────────────────────────────────────

export function useDashAIContext(): DashAIContextValue {
  const ctx = useContext(DashAIContext);
  if (!ctx) {
    throw new Error('useDashAIContext must be used inside <DashAIProvider>');
  }
  return ctx;
}

/**
 * Safe accessor that returns null when outside the provider tree.
 * Useful for components that render before the provider mounts.
 */
export function useDashAIContextSafe(): DashAIContextValue | null {
  return useContext(DashAIContext);
}
