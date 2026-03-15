/**
 * hooks/dash-ai/useDashAIPrefs.ts
 *
 * Chat preferences loading extracted from useDashAssistantImpl.
 * Loads voice, UI, streaming, and input preferences from AsyncStorage
 * and the dashSettings module. Called on init and on screen focus.
 */

import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getChatUIPrefs,
  getVoiceChatPrefs,
  getVoiceInputPrefs,
  initAndMigrate,
} from '@/lib/ai/dashSettings';
import {
  resolveAutoSpeakPreference,
} from '@/features/dash-assistant/voiceAutoSpeakPolicy';

// ─── Types ──────────────────────────────────────────────────

export interface DashAIPrefsState {
  voiceEnabled: boolean;
  autoSpeakResponses: boolean;
  showTypingIndicator: boolean;
  autoSuggestQuestions: boolean;
  contextualHelp: boolean;
  enterToSend: boolean;
  streamingEnabledPref: boolean;
  voiceAutoSend: boolean;
  voiceAutoSendSilenceMs: number;
  voiceWhisperFlowEnabled: boolean;
  voiceWhisperFlowSummaryEnabled: boolean;
}

export interface UseDashAIPrefsReturn extends DashAIPrefsState {
  setVoiceEnabled: (v: boolean) => void;
  setAutoSpeakResponses: (v: boolean) => void;
  setShowTypingIndicator: (v: boolean) => void;
  setAutoSuggestQuestions: (v: boolean) => void;
  setContextualHelp: (v: boolean) => void;
  setEnterToSend: (v: boolean) => void;
  setStreamingEnabledPref: (v: boolean) => void;
  setVoiceAutoSend: (v: boolean) => void;
  setVoiceAutoSendSilenceMs: (v: number) => void;
  setVoiceWhisperFlowEnabled: (v: boolean) => void;
  setVoiceWhisperFlowSummaryEnabled: (v: boolean) => void;
  loadChatPrefs: () => Promise<void>;
}

// ─── Hook ───────────────────────────────────────────────────

export function useDashAIPrefs(profileRole: string | null | undefined): UseDashAIPrefsReturn {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoSpeakResponses, setAutoSpeakResponses] = useState(true);
  const [showTypingIndicator, setShowTypingIndicator] = useState(true);
  const [autoSuggestQuestions, setAutoSuggestQuestions] = useState(true);
  const [contextualHelp, setContextualHelp] = useState(true);
  const [enterToSend, setEnterToSend] = useState(true);
  const [streamingEnabledPref, setStreamingEnabledPref] = useState(true);
  const [voiceAutoSend, setVoiceAutoSend] = useState(false);
  const [voiceAutoSendSilenceMs, setVoiceAutoSendSilenceMs] = useState(900);
  const [voiceWhisperFlowEnabled, setVoiceWhisperFlowEnabled] = useState(true);
  const [voiceWhisperFlowSummaryEnabled, setVoiceWhisperFlowSummaryEnabled] = useState(true);

  const loadChatPrefs = useCallback(async () => {
    try {
      try { await initAndMigrate(); } catch (e) {
        if (__DEV__) console.warn('[useDashAIPrefs] migration warn', e);
      }

      const [voiceChatPrefs, chatUiPrefs, voiceInputPrefs, rawVoicePrefs] = await Promise.all([
        getVoiceChatPrefs(),
        getChatUIPrefs(),
        getVoiceInputPrefs(profileRole || null),
        AsyncStorage.getItem('@dash_voice_prefs'),
      ]);

      let explicitAutoSpeak: boolean | null = null;
      if (rawVoicePrefs) {
        try {
          const parsedPrefs = JSON.parse(rawVoicePrefs) as { autoSpeak?: unknown };
          if (typeof parsedPrefs?.autoSpeak === 'boolean') {
            explicitAutoSpeak = parsedPrefs.autoSpeak;
          }
        } catch {
          // Intentionally ignore parse failures and use role defaults.
        }
      }

      setVoiceEnabled(voiceChatPrefs.voiceEnabled ?? true);
      setAutoSpeakResponses(
        resolveAutoSpeakPreference({
          role: profileRole || null,
          explicitAutoSpeak,
          hasExplicitPreference: typeof explicitAutoSpeak === 'boolean',
        }),
      );
      setShowTypingIndicator(chatUiPrefs.showTypingIndicator ?? true);
      setAutoSuggestQuestions(chatUiPrefs.autoSuggestQuestions ?? true);
      setContextualHelp(chatUiPrefs.contextualHelp ?? true);
      setVoiceAutoSend(voiceInputPrefs.autoSend);
      setVoiceAutoSendSilenceMs(voiceInputPrefs.autoSendSilenceMs);
      setVoiceWhisperFlowEnabled(voiceInputPrefs.whisperFlowEnabled ?? true);
      setVoiceWhisperFlowSummaryEnabled(voiceInputPrefs.whisperFlowSummaryEnabled ?? true);
      if (typeof chatUiPrefs.enterToSend === 'boolean') {
        setEnterToSend(chatUiPrefs.enterToSend);
      }

      try {
        const [streamingPref, streamingPrefUserSet] = await Promise.all([
          AsyncStorage.getItem('@dash_streaming_enabled'),
          AsyncStorage.getItem('@dash_streaming_pref_user_set'),
        ]);
        if (streamingPrefUserSet === 'true') {
          setStreamingEnabledPref(streamingPref !== 'false');
        } else {
          setStreamingEnabledPref(true);
          void AsyncStorage.multiSet([
            ['@dash_streaming_enabled', 'true'],
            ['@dash_streaming_pref_user_set', 'false'],
          ]);
        }
      } catch {
        setStreamingEnabledPref(true);
      }
    } catch {
      try {
        const enterToSendSetting = await AsyncStorage.getItem('@dash_ai_enter_to_send');
        if (enterToSendSetting !== null) {
          setEnterToSend(enterToSendSetting === 'true');
        }
      } catch {}
    }
  }, [profileRole]);

  return {
    voiceEnabled, setVoiceEnabled,
    autoSpeakResponses, setAutoSpeakResponses,
    showTypingIndicator, setShowTypingIndicator,
    autoSuggestQuestions, setAutoSuggestQuestions,
    contextualHelp, setContextualHelp,
    enterToSend, setEnterToSend,
    streamingEnabledPref, setStreamingEnabledPref,
    voiceAutoSend, setVoiceAutoSend,
    voiceAutoSendSilenceMs, setVoiceAutoSendSilenceMs,
    voiceWhisperFlowEnabled, setVoiceWhisperFlowEnabled,
    voiceWhisperFlowSummaryEnabled, setVoiceWhisperFlowSummaryEnabled,
    loadChatPrefs,
  };
}
