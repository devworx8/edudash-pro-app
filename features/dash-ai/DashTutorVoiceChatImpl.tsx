/**
 * DashTutorVoiceChat - Voice Chat (Simple Voice-First Interface)
 *
 * Lightweight voice-first chat for quick conversations:
 * - Voice Orb for STT/TTS with language switching
 * - Streaming responses for quicker feedback
 * - Multilingual support (English, Afrikaans, isiZulu)
 * - Persistent chat history
 * 
 * Note: This is different from full "Dash Tutor" (homework helper with image upload)
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  Animated,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { getWelcomeMessage } from '@/lib/ai/constants';
import { formatTranscript } from '@/lib/voice/formatTranscript';
import { useWebTTS } from '@/lib/voice/useWebTTS';
import { getOrganizationType } from '@/lib/tenant/compat';
import { detectPhonicsIntent } from '@/lib/dash-ai/phonicsDetection';
import { assessPhonicsAttempt } from '@/lib/dash-ai/phonicsAssessmentClient';
import { buildPhonicsCoachingHint } from '@/lib/dash-ai/phonicsPrompt';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { classifyFullChatIntent } from '@/lib/dash-ai/fullChatIntent';
import {
  trackTutorFullChatHandoff,
  trackTutorPhonicsContractApplied,
} from '@/lib/ai/trackingEvents';
import { resolveAIProxyScopeFromRole } from '@/lib/ai/aiProxyScope';
import { dashAiDevLog } from '@/lib/dash-ai/dashAiDevLogger';
import { styles } from '@/components/super-admin/dash-ai-chat/DashAIChat.styles';
import { ChatMessage, ChatMessageData } from '@/components/super-admin/dash-ai-chat/ChatMessage';
import {
  DashTutorWhiteboard,
  extractWhiteboardContent,
  stripWhiteboardFromDisplay,
  type WhiteboardContent,
} from '@/components/ai/DashTutorWhiteboard';
import { ChatInput } from '@/components/super-admin/dash-ai-chat/ChatInput';
import {
  cleanForTTS,
  cleanRawJSON,
  splitForTTS,
  TTS_CHUNK_MAX_LEN,
} from '@/lib/dash-voice-utils';
import { shouldUsePhonicsMode } from '@/lib/dash-ai/phonicsDetection';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import { SUPPORTED_LANGUAGES } from '@/components/super-admin/voice-orb/useVoiceSTT';
import type { VoiceTranscriptMeta } from '@/components/super-admin/voice-orb';

const isWeb = Platform.OS === 'web';
let VoiceOrb: React.ForwardRefExoticComponent<any> | null = null;
if (!isWeb) {
  const voiceOrbModule = require('@/components/super-admin/voice-orb');
  VoiceOrb = voiceOrbModule.VoiceOrb;
}

type VoiceOrbRefType = {
  speakText: (
    text: string,
    language?: SupportedLanguage,
    options?: { phonicsMode?: boolean }
  ) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  isSpeaking: boolean;
};

const findLanguageName = (code: SupportedLanguage | null) => {
  if (!code) return null;
  const match = SUPPORTED_LANGUAGES.find((lang) => lang.code === code);
  return match?.name || code;
};

const CHAT_HISTORY_KEY = '@dash_tutor_voice_history';
const MAX_STORED_MESSAGES = 50;
const PHONICS_TARGET_STALE_MS = 20 * 60 * 1000;

type PendingPhonicsTarget = {
  referenceText: string;
  targetPhoneme: string;
  updatedAt: number;
  source: 'assistant' | 'learner';
};

const extractPhonicsTarget = (text: string, source: 'assistant' | 'learner'): PendingPhonicsTarget | null => {
  const value = String(text || '').trim().toLowerCase();
  if (!value || !detectPhonicsIntent(value)) return null;

  const slashMatch = value.match(/\/([a-z]{1,3})\//i);
  const blendMatch = value.match(/\b([a-z](?:-[a-z]){1,7})\b/i);
  const guidedWordMatch = value.match(/\b(?:say|repeat|read|sound out|blend)\s+["'“]?([a-z]{1,24})["'”]?/i);

  let referenceText = '';
  if (guidedWordMatch?.[1]) {
    referenceText = guidedWordMatch[1].toLowerCase();
  } else if (blendMatch?.[1]) {
    referenceText = blendMatch[1].replace(/-/g, '').toLowerCase();
  } else if (slashMatch?.[1]) {
    referenceText = slashMatch[1].toLowerCase();
  }

  if (!referenceText) return null;
  const targetPhoneme = String(slashMatch?.[1] || referenceText[0] || 'unknown').toLowerCase();

  return {
    referenceText,
    targetPhoneme,
    updatedAt: Date.now(),
    source,
  };
};

export default function DashTutorVoiceChat() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const normalizedRole = String(profile?.role || 'parent').toLowerCase();
  const aiScope = useMemo(() => resolveAIProxyScopeFromRole(normalizedRole), [normalizedRole]);
  const orgType = getOrganizationType(profile);

  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<SupportedLanguage | null>(null);
  const [voiceErrorBanner, setVoiceErrorBanner] = useState<string | null>(null);
  const [whiteboardContent, setWhiteboardContent] = useState<WhiteboardContent | null>(null);
  // Active phonics practice target — shown as a prominent "Practice Now" card
  const [phonicsPracticeTarget, setPhonicsPracticeTarget] = useState<PendingPhonicsTarget | null>(null);
  const [phonicsPracticeResult, setPhonicsPracticeResult] = useState<{ accuracy: number; encouragement: string } | null>(null);
  const practiceGlowAnim = useRef(new Animated.Value(0)).current;

  const listRef = useRef<FlashListRef<ChatMessageData>>(null);
  const voiceOrbRef = useRef<VoiceOrbRefType>(null);
  // Web fallback TTS — used when VoiceOrb is not available (web platform)
  const webTTS = useWebTTS();
  const isVoiceModeRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const speechQueueRef = useRef<string[]>([]);
  const ttsSessionRef = useRef<string | null>(null);
  const phonicsTargetRef = useRef<PendingPhonicsTarget | null>(null);
  const lastLowAccuracyPhonemeRef = useRef<{ targetPhoneme: string; updatedAt: number } | null>(null);

  const welcomeMessage: ChatMessageData = useMemo(() => ({
    id: 'welcome',
    role: 'assistant',
    content: getWelcomeMessage(normalizedRole),
    timestamp: new Date(),
  }), [normalizedRole]);

  useEffect(() => {
    isVoiceModeRef.current = isVoiceMode;
  }, [isVoiceMode]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // Pulse glow animation for the phonics practice card
  useEffect(() => {
    if (!phonicsPracticeTarget) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(practiceGlowAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(practiceGlowAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [phonicsPracticeTarget, practiceGlowAnim]);

  const languageLabel = useMemo(
    () => findLanguageName(preferredLanguage),
    [preferredLanguage]
  );

  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const stored = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ChatMessageData[];
          const messagesWithDates = parsed.map((msg) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }));
          if (messagesWithDates.length > 0 && messagesWithDates[0].id !== 'welcome') {
            setMessages(messagesWithDates);
          } else if (messagesWithDates.length === 0) {
            setMessages([welcomeMessage]);
          } else {
            setMessages(messagesWithDates);
          }
        } else {
          setMessages([welcomeMessage]);
        }
      } catch (error) {
        console.error('[DashTutorVoiceChat] Failed to load chat history:', error);
        setMessages([welcomeMessage]);
      } finally {
        setIsLoaded(true);
      }
    };

    loadChatHistory();
  }, [welcomeMessage]);

  useEffect(() => {
    if (!isLoaded || messages.length === 0) return;
    const saveChatHistory = async () => {
      try {
        const messagesToSave = messages.slice(-MAX_STORED_MESSAGES);
        await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messagesToSave));
      } catch (error) {
        console.error('[DashTutorVoiceChat] Failed to save chat history:', error);
      }
    };
    saveChatHistory();
  }, [messages, isLoaded]);

  const scrollToBottom = useCallback((animated = true) => {
    // Multiple strategies for reliable scrolling
    setTimeout(() => {
      requestAnimationFrame(() => {
        // Try native FlashList scrollToEnd
        listRef.current?.scrollToEnd({ animated });
        
        // Fallback: scroll to a very large offset to ensure we hit the bottom
        setTimeout(() => {
          listRef.current?.scrollToOffset({
            offset: 999999,
            animated: false,
          });
        }, animated ? 300 : 0);
      });
    }, 50);
  }, []);

  useEffect(() => {
    // Scroll immediately when messages change (including "Thinking..." indicator)
    scrollToBottom(true);
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!isVoiceMode) {
      speechQueueRef.current = [];
      ttsSessionRef.current = null;
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      voiceOrbRef.current?.stopSpeaking?.().catch(() => {});
    }
  }, [isVoiceMode]);

  const buildTutorContext = useCallback(() => {
    const context: string[] = [];
    const orgType = getOrganizationType(profile);
    
    context.push('You are Dash, an intelligent, friendly AI tutor for South African learners.');
    context.push('You are a full robotics-level AI tutor — smart, fast, and deeply interactive.');
    
    // Org-aware teaching approach
    if (orgType === 'preschool') {
      context.push('\n**Context:** You are helping preschool-age children (3-6 years old).');
      context.push('- Use very simple language and short sentences');
      context.push('- Focus on play-based learning: colors, shapes, counting, phonics, stories');
      context.push('- Be warm, encouraging, and use fun examples');
      context.push('- Keep explanations to 1-2 sentences at a time');
      context.push('- Use visual emoji representations for counting/colors');
    } else {
      context.push('\n**CAPS-ALIGNED TEACHING (South African Curriculum):**');
      context.push('- Follow CAPS (Curriculum Assessment Policy Statements) curriculum frameworks');
      context.push('- Mathematics: Numbers, Patterns, Space & Shape, Measurement, Data Handling');
      context.push('- English: Listening, Speaking, Reading, Writing, Language Structures');
      context.push('- Natural Sciences: Life & Living, Energy & Change, Matter & Materials, Earth & Beyond');
      context.push('- Social Sciences: Geography (SA provinces, climate) + History (heritage, key events)');
      context.push('- Use CAPS terminology: Learning Outcome, Assessment Standard, Content Area');
      context.push('- Reference SA-specific examples (Rand, SA geography, local culture)');
      context.push('');
      context.push('**Your Teaching Style (Socratic + Scaffolded):**');
      context.push('- Use the Socratic method — ask guiding questions instead of giving direct answers');
      context.push('- Break complex topics into micro-steps');
      context.push('- Celebrate wins, scaffold failures with hints and worked examples');
      context.push('- Adapt difficulty dynamically: simplify after 2+ wrong, increase after 3+ right');
      context.push('- For homework: show worked examples, explain the WHY behind each step');
    }
    
    context.push('\n**INTERACTIVE CAPABILITIES:**');
    context.push('- Can explain any subject with step-by-step breakdowns');
    context.push('- Can generate practice questions, quizzes, and mock tests');
    context.push('- Can analyze homework photos and provide feedback');
    context.push('- Can help with exam preparation (past papers, revision)');
    context.push('- Can teach phonics with pronunciation guidance');
    context.push('- Can provide real-time tutoring with adaptive difficulty');
    context.push('- Can search the web for current materials and sources when helpful');
    context.push('- Always provide encouragement and positive reinforcement');
    
    context.push('\n**Guidelines:**');
    context.push('- Keep responses concise (2-3 short paragraphs unless explaining complex concepts)');
    context.push('- If learner is wrong, give hints and guide them to the answer');
    context.push("- Adapt language complexity to the learner's level");
    context.push('- Ask one question at a time, wait for response');
    context.push('- Encourage curiosity and critical thinking');
    context.push('');
    context.push('**Whiteboard:** When explaining a concept (math steps, worked examples, diagrams), wrap the explanation in [WHITEBOARD]...[/WHITEBOARD]. Use ONLY for concept explanations. Inside: clear steps, numbers. End with "Does that make sense?"');
    context.push('**Multiplication tables:** Always go up to ×12 (not ×10). SA CAPS curriculum standard is 1–12.');
    context.push('');
    context.push('**Spelling Practice:** When running a spelling bee or spelling exercise, NEVER reveal the target word in plain text. Always use the spelling card format:');
    context.push('```spelling');
    context.push('{"type":"spelling_practice","word":"WORD_HERE","prompt":"Listen and spell the word","hint":"Optional sentence using the word","language":"en","hide_word_reveal":true}');
    context.push('```');
    context.push('The card hides the word and lets the student listen and type. Do NOT write "Here\'s your word: garden" in prose — put the word only inside the spelling card JSON.');
    context.push('**Deterministic Tutor Response Contract:**');
    context.push('- Use this structure when tutoring:');
    context.push('  Goal: one-line objective');
    context.push('  Steps: 2-4 short numbered steps');
    context.push('  Check: exactly one follow-up question');
    context.push('- Avoid raw JSON or tool metadata in learner-facing responses.');
    
    const lowAcc = lastLowAccuracyPhonemeRef.current;
    const lowAccFresh = lowAcc && (Date.now() - lowAcc.updatedAt) < PHONICS_TARGET_STALE_MS;
    if (lowAccFresh && lowAcc.targetPhoneme) {
      const lang = (preferredLanguage || 'en-ZA') as 'en-ZA' | 'zu-ZA' | 'af-ZA';
      const hint = buildPhonicsCoachingHint(lowAcc.targetPhoneme, lang);
      if (hint) context.push(`\n**${hint}**`);
    }

    if (preferredLanguage) {
      const name = findLanguageName(preferredLanguage) || preferredLanguage;
      context.push(`\n**Language:** User prefers ${name}. Always respond in ${name}.`);
      context.push('\n**CRITICAL for Voice/Audio:**');
      context.push('- NEVER add English pronunciation guides like "(tot-SEENS)" or phonetic spellings');
      context.push('- Write words naturally in the target language only');
      context.push('- The text-to-speech system will handle pronunciation correctly');
      context.push('- Write conversationally as if speaking face-to-face');
      context.push('- Use short sentences with natural pauses (periods, not semicolons)');
    }
    
    return context.join('\n');
  }, [preferredLanguage, profile]);

  const speakResponse = useCallback(async (text: string) => {
    if (!isVoiceModeRef.current) return;
    // On web, VoiceOrb is null — use the web TTS fallback instead
    const ttsTarget = voiceOrbRef.current ?? (isWeb ? webTTS : null);
    if (!ttsTarget) return;
    const cleanText = cleanForTTS(text);
    if (!cleanText) return;
    
    // Use sentence-aligned chunking for natural TTS with per-chunk language detection
    const chunks = splitForTTS(cleanText, TTS_CHUNK_MAX_LEN);
    if (chunks.length === 0) return;
    
    const sessionId = `dash_tutor_tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    ttsSessionRef.current = sessionId;
    console.log('[DashTutorVoiceChat][TTS] session:start', { sessionId, chunkCount: chunks.length });

    try {
      setIsSpeaking(true);
      isSpeakingRef.current = true;
      const phonicsMode = Boolean(phonicsTargetRef.current) || shouldUsePhonicsMode(cleanText);
      const stableLanguage = preferredLanguage || 'en-ZA';
      for (let idx = 0; idx < chunks.length; idx += 1) {
        const chunk = chunks[idx];
        if (ttsSessionRef.current !== sessionId || !isSpeakingRef.current) {
          console.log('[DashTutorVoiceChat][TTS] session:interrupted', { sessionId, atChunk: idx + 1 });
          break; // Barge-in support
        }
        console.log('[DashTutorVoiceChat][TTS] chunk:start', {
          sessionId,
          index: idx + 1,
          total: chunks.length,
          length: chunk.length,
          language: stableLanguage,
          phonicsMode,
        });
        await ttsTarget.speakText(chunk, stableLanguage, { phonicsMode });
        console.log('[DashTutorVoiceChat][TTS] chunk:end', { sessionId, index: idx + 1, total: chunks.length });
      }
    } catch (error) {
      console.error('[DashTutorVoiceChat] TTS error:', error);
    } finally {
      if (ttsSessionRef.current === sessionId) {
        console.log('[DashTutorVoiceChat][TTS] session:end', { sessionId });
        ttsSessionRef.current = null;
      }
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    }
  }, [preferredLanguage, webTTS]);

  const processSpeechQueue = useCallback(async () => {
    if (!isVoiceModeRef.current || isSpeakingRef.current) return;
    const next = speechQueueRef.current.shift();
    if (!next) return;
    await speakResponse(next);
    if (speechQueueRef.current.length > 0) {
      processSpeechQueue();
    }
  }, [speakResponse]);

  const enqueueSpeech = useCallback((text: string) => {
    const cleanText = cleanForTTS(text);
    if (!cleanText) return;
    speechQueueRef.current.push(cleanText);
    processSpeechQueue();
  }, [processSpeechQueue]);

  const clearChat = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(CHAT_HISTORY_KEY);
      setMessages([welcomeMessage]);
    } catch (error) {
      console.error('[DashTutorVoiceChat] Failed to clear chat history:', error);
    }
  }, [welcomeMessage]);

  const mapVoiceErrorToBanner = useCallback((errorMessage: string): string => {
    const normalized = String(errorMessage || '').toLowerCase();
    if (!normalized) return 'Voice recognition failed. Tap the mic and try again.';
    if (normalized.includes('not authenticated') || normalized.includes('token')) {
      return 'Voice recognition needs an active login. Please sign in again.';
    }
    if (normalized.includes('no school assigned')) {
      return 'Your account is missing a school link. Ask admin/principal to assign your school profile.';
    }
    if (normalized.includes('permission')) {
      return 'Microphone permission is required. Enable mic access and try again.';
    }
    if (normalized.includes('network') || normalized.includes('fetch') || normalized.includes('timeout')) {
      return 'Voice recognition needs a stable internet connection. Check connection and retry.';
    }
    if (normalized.includes('phonics') && normalized.includes('cloud tts')) {
      return 'Phonics voice needs cloud TTS. Azure voice is unavailable right now, so letter sounds may fail.';
    }
    return 'Voice recognition failed. Please try again or use text input.';
  }, []);

  const handleVoiceRecognitionError = useCallback((errorMessage: string) => {
    const banner = mapVoiceErrorToBanner(errorMessage);
    console.warn('[DashTutorVoiceChat] Voice recognition error:', errorMessage);
    setVoiceErrorBanner(banner);
  }, [mapVoiceErrorToBanner]);

  const updatePhonicsTarget = useCallback((assistantText: string) => {
    const extracted = extractPhonicsTarget(assistantText, 'assistant');
    if (extracted) {
      phonicsTargetRef.current = extracted;
      setPhonicsPracticeTarget(extracted);
      setPhonicsPracticeResult(null);
    }
  }, []);

  const submitPhonicsAssessment = useCallback(async (
    transcript: string,
    language?: SupportedLanguage,
    meta?: VoiceTranscriptMeta
  ) => {
    if (!meta?.audioBase64) return;

    const normalizedTranscript = String(transcript || '').trim();

    const activeTarget = phonicsTargetRef.current;
    const targetIsFresh = !!activeTarget && (Date.now() - activeTarget.updatedAt) < PHONICS_TARGET_STALE_MS;
    const learnerTarget = normalizedTranscript ? extractPhonicsTarget(normalizedTranscript, 'learner') : null;
    const shouldAssess = Boolean(learnerTarget) || Boolean(targetIsFresh);

    if (!shouldAssess) return;

    const resolvedTarget = targetIsFresh ? activeTarget : learnerTarget;
    // When child attempts a sound in isolation the transcript may be empty —
    // fall back to the target's referenceText so the assessment still runs.
    const referenceText = resolvedTarget?.referenceText || normalizedTranscript || resolvedTarget?.targetPhoneme || '';
    const targetPhoneme = resolvedTarget?.targetPhoneme || null;

    if (!referenceText) return;

    try {
      const result = await assessPhonicsAttempt({
        referenceText,
        targetPhoneme,
        targetLanguage: language || preferredLanguage || 'en-ZA',
        audioBase64: meta.audioBase64,
        audioContentType: meta.audioContentType,
      });

      if (result?.assessment) {
        const accuracy = result.assessment.target_phoneme_accuracy ?? result.assessment.accuracy_score ?? 0;
        const phoneme = result.assessment.target_phoneme || targetPhoneme;
        console.log('[DashTutorVoiceChat] Phonics attempt saved', {
          attemptId: result.attemptId,
          targetPhoneme: phoneme,
          accuracy,
        });

        // Update the Practice card with the result
        const score = Math.round(accuracy);
        const encouragement =
          score >= 80 ? 'Great job! 🌟' :
          score >= 60 ? 'Good try! Keep going!' :
          'Try again — you\'ve got this!';
        setPhonicsPracticeResult({ accuracy: score, encouragement });

        if (accuracy < 60 && phoneme) {
          lastLowAccuracyPhonemeRef.current = { targetPhoneme: phoneme, updatedAt: Date.now() };
        }
      }
    } catch (error) {
      console.warn('[DashTutorVoiceChat] Phonics assessment failed:', error);
    }
  }, [preferredLanguage]);

  const sendMessageRegular = async (
    text: string,
    history: ChatMessageData[],
    assistantId: string,
    token: string
  ) => {
    const payloadMessages = [
      ...history.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: text },
    ];

    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-proxy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          scope: aiScope,
          service_type: 'dash_conversation',
          payload: {
            messages: payloadMessages,
            context: buildTutorContext(),
          },
          stream: false,
          enable_tools: true,
          metadata: {
            role: normalizedRole,
            source: 'dash_voice_orb',
            org_type: getOrganizationType(profile),
            language: preferredLanguage || undefined,
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Request failed');
    }

    const responseText = data.content || data.response || '';
    const wb = extractWhiteboardContent(responseText);
    if (wb) setWhiteboardContent(wb);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantId
          ? { ...msg, content: responseText, isStreaming: false }
          : msg
      )
    );
    updatePhonicsTarget(responseText);
    lastLowAccuracyPhonemeRef.current = null;

    if (isVoiceModeRef.current && responseText) {
      enqueueSpeech(responseText);
    }
  };

  const sendMessageStreaming = async (
    text: string,
    history: ChatMessageData[],
    assistantId: string,
    token: string
  ) => {
    const payloadMessages = [
      ...history.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: text },
    ];

    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-proxy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          scope: aiScope,
          service_type: 'dash_conversation',
          payload: {
            messages: payloadMessages,
            context: buildTutorContext(),
          },
          stream: true,
          enable_tools: true,
          metadata: {
            role: normalizedRole,
            source: 'dash_voice_orb',
            org_type: getOrganizationType(profile),
            language: preferredLanguage || undefined,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errMsg = errorData?.message || errorData?.error || `Request failed: ${response.status}`;
      dashAiDevLog('voice_response_error', {
        status: response.status,
        message: errMsg,
        code: errorData?.code,
        rawError: errorData,
      });
      throw new Error(errMsg);
    }

    if (!response.body) {
      const fallbackText = await response.text();
      // Parse the fallback text to extract actual content, not raw JSON
      let cleaned = fallbackText;
      
      // Remove SSE formatting
      cleaned = cleaned.replace(/data:\s*/g, '').replace(/\[DONE\]/g, '');
      
      // Try to parse JSON chunks and extract text
      const lines = cleaned.split('\n').filter(l => l.trim());
      let extractedText = '';
      
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            extractedText += parsed.delta.text;
          } else if (typeof parsed.content === 'string') {
            extractedText += parsed.content;
          } else if (typeof parsed.text === 'string') {
            extractedText += parsed.text;
          }
        } catch {
          // If not JSON, use as-is (but only if we haven't extracted anything yet)
          if (!extractedText && !line.includes('content_block_delta')) {
            extractedText = line;
          }
        }
      }
      
      const finalText = extractedText.trim() || cleaned.trim();
      const cleanedText = cleanRawJSON(finalText);
      const wb = extractWhiteboardContent(cleanedText);
      if (wb) setWhiteboardContent(wb);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: cleanedText, isStreaming: false }
            : msg
        )
      );
      updatePhonicsTarget(cleanedText);
      lastLowAccuracyPhonemeRef.current = null;
      if (isVoiceModeRef.current && cleanedText) {
        enqueueSpeech(cleanedText);
      }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let sentenceBuffer = '';
    let pendingFlush: ReturnType<typeof setTimeout> | null = null;

    const scheduleFlush = () => {
      if (pendingFlush) return;
      pendingFlush = setTimeout(() => {
        pendingFlush = null;
        const cleanedResponse = cleanRawJSON(fullResponse);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: cleanedResponse, isStreaming: false }
              : msg
          )
        );
      }, 50);
    };

    const parseStreamDelta = (data: string) => {
      if (!data || data === '[DONE]') return '';
      try {
        const parsed = JSON.parse(data);
        
        // Skip tool use events
        if (parsed.type === 'tool_use' || parsed.tool_name) return '';
        
        // Handle content_block_delta format (Claude streaming)
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          return parsed.delta.text;
        }
        
        // Handle other delta formats
        if (typeof parsed.delta === 'string') return parsed.delta;
        if (parsed.delta && typeof parsed.delta.text === 'string') return parsed.delta.text;
        
        // Handle direct content/text
        if (typeof parsed.content === 'string') return parsed.content;
        if (typeof parsed.text === 'string') return parsed.text;
        
        // If we see raw content_block_delta in message, it means parsing failed earlier
        // Return empty to avoid showing raw JSON
        if (parsed.type === 'content_block_delta') return '';
        
      } catch {
        return '';
      }
      return '';
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          const data = line.substring(6).trim();
          if (data === '[DONE]') continue;

          const delta = parseStreamDelta(data);
          if (!delta) continue;

          fullResponse += delta;
          sentenceBuffer += delta;
          scheduleFlush();

          const sentenceEnd = /[.!?]\s/.test(sentenceBuffer);
          if (sentenceEnd && isVoiceModeRef.current) {
            const sentence = sentenceBuffer.trim();
            if (sentence.length > 4) {
              enqueueSpeech(sentence);
              sentenceBuffer = '';
            }
          }
        }
      }

      if (sentenceBuffer.trim() && isVoiceModeRef.current) {
        enqueueSpeech(sentenceBuffer.trim());
      }

      if (pendingFlush) {
        clearTimeout(pendingFlush);
        pendingFlush = null;
      }
      
      const cleanedResponse = cleanRawJSON(fullResponse);
      const wb = extractWhiteboardContent(cleanedResponse);
      if (wb) setWhiteboardContent(wb);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: cleanedResponse, isStreaming: false }
            : msg
        )
      );
      updatePhonicsTarget(cleanedResponse);
      lastLowAccuracyPhonemeRef.current = null;
    } catch (error) {
      console.error('[DashTutorVoiceChat] Streaming error:', error);
      
      // If fullResponse has content, save it even if stream failed
      if (fullResponse.trim()) {
        const cleanedResponse = cleanRawJSON(fullResponse);
        const wb = extractWhiteboardContent(cleanedResponse);
        if (wb) setWhiteboardContent(wb);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: cleanedResponse, isStreaming: false }
              : msg
          )
        );
        updatePhonicsTarget(cleanedResponse);
        lastLowAccuracyPhonemeRef.current = null;
        // Still try to speak if in voice mode
        if (isVoiceModeRef.current && cleanedResponse) {
          enqueueSpeech(cleanedResponse);
        }
      } else {
        // No content received, show error
        throw error;
      }
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isProcessing) return;
    const trimmed = text.trim();

    const flags = getFeatureFlagsSync();
    const handoffIntent = flags.dash_tutor_auto_handoff_v1 ? classifyFullChatIntent(trimmed) : null;
    if (handoffIntent) {
      trackTutorFullChatHandoff({
        intent: handoffIntent,
        source: 'dash_tutor_voice_chat',
        role: normalizedRole,
      });
      router.push({
        pathname: '/screens/dash-assistant',
        params: {
          source: 'dash_tutor_voice_chat',
          initialMessage: trimmed,
          resumePrompt: trimmed,
          mode: handoffIntent === 'quiz' ? 'tutor' : 'advisor',
          tutorMode: handoffIntent === 'quiz' ? 'quiz' : undefined,
          handoffIntent,
        },
      } as any);
      return;
    }

    if (flags.dash_tutor_phonics_strict_v1 && detectPhonicsIntent(trimmed)) {
      trackTutorPhonicsContractApplied({
        source: 'dash_tutor_voice_chat',
        role: normalizedRole,
      });
    }

    const userMessage: ChatMessageData = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);

    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '⏳ Thinking...',
        timestamp: new Date(),
        isStreaming: true,
      },
    ]);

    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-8);

    try {
      const supabase = assertSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in to continue');

      if (isVoiceModeRef.current) {
        await sendMessageStreaming(trimmed, history, assistantId, session.access_token);
      } else {
        await sendMessageRegular(trimmed, history, assistantId, session.access_token);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      const userFriendlyMessage = errorMessage.includes('log in') 
        ? '❌ Please log in to continue chatting with Dash.'
        : errorMessage.includes('network') || errorMessage.includes('fetch')
        ? '❌ Connection issue. Please check your internet and try again.'
        : `❌ Oops! ${errorMessage}\n\nPlease try asking again, or rephrase your question.`;
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: userFriendlyMessage, isStreaming: false }
            : msg
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoiceInput = useCallback((transcript: string, language?: SupportedLanguage, meta?: VoiceTranscriptMeta) => {
    const formatted = formatTranscript(transcript, language, {
      whisperFlow: true,
      summarize: true,
      preschoolMode: orgType === 'preschool',
      maxSummaryWords: orgType === 'preschool' ? 16 : 20,
    });
    if (language) setPreferredLanguage(language);
    if (voiceErrorBanner) setVoiceErrorBanner(null);

    // Always run phonics assessment when audio is present and there's a fresh target,
    // even if the STT transcript is empty (isolated sounds like "sss" may not transcribe).
    const hasFreshTarget =
      !!phonicsTargetRef.current &&
      (Date.now() - phonicsTargetRef.current.updatedAt) < PHONICS_TARGET_STALE_MS;
    if (meta?.audioBase64 && hasFreshTarget) {
      void submitPhonicsAssessment(formatted, language, meta);
    }

    if (formatted.trim()) {
      if (!meta?.audioBase64 || !hasFreshTarget) {
        void submitPhonicsAssessment(formatted, language, meta);
      }
      sendMessage(formatted);
    }
  }, [sendMessage, submitPhonicsAssessment, voiceErrorBanner, orgType]);

  const statusLabel = isProcessing
    ? 'Thinking...'
    : isListening
      ? 'Listening...'
      : isSpeaking
        ? 'Speaking...'
        : 'Ready';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => clearChat()} style={styles.headerButton}>
          <Ionicons name="refresh" size={22} color={theme.textSecondary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={[styles.headerIcon, { backgroundColor: theme.primary }]}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Voice Chat</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              {languageLabel ? `${statusLabel} • ${languageLabel}` : statusLabel}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setIsVoiceMode((prev) => !prev)}
        >
          <Ionicons
            name={isVoiceMode ? 'mic' : 'chatbubbles-outline'}
            size={22}
            color={isVoiceMode ? theme.primary : theme.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {whiteboardContent && (
        <DashTutorWhiteboard
          content={whiteboardContent}
          onDismiss={() => setWhiteboardContent(null)}
        />
      )}
      <FlashList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatMessage
            message={{
              ...item,
              content: item.role === 'assistant' ? stripWhiteboardFromDisplay(item.content) : item.content,
            }}
          />
        )}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollToBottom(true)}
        ListFooterComponent={<View style={{ height: 20 }} />}
      />

      {voiceErrorBanner && (
        <View style={[styles.voiceErrorBanner, { backgroundColor: theme.error + '20', borderColor: theme.error + '55' }]}>
          <Ionicons name="warning-outline" size={16} color={theme.error} />
          <Text style={[styles.voiceErrorText, { color: theme.error }]}>{voiceErrorBanner}</Text>
          <TouchableOpacity onPress={() => setVoiceErrorBanner(null)} style={styles.voiceErrorDismiss}>
            <Ionicons name="close" size={14} color={theme.error} />
          </TouchableOpacity>
        </View>
      )}

      {phonicsPracticeTarget && (
        <Animated.View
          style={[
            phonicsPracticeStyles.card,
            {
              backgroundColor: theme.surface,
              borderColor: '#6366f1',
              opacity: practiceGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
              transform: [{ scale: practiceGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.99, 1.01] }) }],
            },
          ]}
        >
          <View style={phonicsPracticeStyles.cardHeader}>
            <View style={phonicsPracticeStyles.iconBadge}>
              <Ionicons name="mic" size={16} color="#fff" />
            </View>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={[phonicsPracticeStyles.cardTitle, { color: theme.text }]}>Practice Time!</Text>
            <TouchableOpacity
              onPress={() => { setPhonicsPracticeTarget(null); setPhonicsPracticeResult(null); }}
              style={phonicsPracticeStyles.dismissBtn}
            >
              <Ionicons name="close" size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={phonicsPracticeStyles.phonemeRow}>
            <Text style={phonicsPracticeStyles.phonemeDisplay}>
              {phonicsPracticeTarget.targetPhoneme
                ? `/${phonicsPracticeTarget.targetPhoneme}/`
                : phonicsPracticeTarget.referenceText}
            </Text>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={[phonicsPracticeStyles.phonemeHint, { color: theme.textSecondary }]}>
              Say the sound out loud
            </Text>
          </View>

          {phonicsPracticeResult ? (
            <View style={phonicsPracticeStyles.resultRow}>
              <Ionicons
                name={phonicsPracticeResult.accuracy >= 60 ? 'checkmark-circle' : 'refresh-circle'}
                size={20}
                color={phonicsPracticeResult.accuracy >= 80 ? '#22c55e' : phonicsPracticeResult.accuracy >= 60 ? '#f59e0b' : '#ef4444'}
              />
              <Text style={[phonicsPracticeStyles.resultText, { color: theme.text }]}>
                {phonicsPracticeResult.encouragement}
                {phonicsPracticeResult.accuracy > 0 && ` (${phonicsPracticeResult.accuracy}%)`}
              </Text>
            </View>
          ) : (
            // eslint-disable-next-line i18next/no-literal-string
            <Text style={[phonicsPracticeStyles.listenHint, { color: theme.textSecondary }]}>
              <Ionicons name="ear-outline" size={13} /> Dash is listening when you speak…
            </Text>
          )}
        </Animated.View>
      )}

      {isVoiceMode && VoiceOrb && (
        <View style={[styles.voiceDock, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <View style={styles.voiceDockHeader}>
            <Text style={[styles.voiceDockTitle, { color: theme.text }]}>Voice Mode</Text>
            <TouchableOpacity
              style={styles.voiceDockCloseButton}
              onPress={() => setIsVoiceMode(false)}
            >
              <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
              <Text style={[styles.voiceDockCloseText, { color: theme.textSecondary }]}>Minimize</Text>
            </TouchableOpacity>
          </View>
          <VoiceOrb
            ref={voiceOrbRef}
            size={118}
            isListening={isListening}
            isSpeaking={isSpeaking}
            isParentProcessing={isProcessing}
            onStartListening={() => setIsListening(true)}
            onStopListening={() => setIsListening(false)}
            onTranscript={handleVoiceInput}
            onVoiceError={handleVoiceRecognitionError}
            autoStartListening
            autoRestartAfterTTS
          />
        </View>
      )}

      <ChatInput
        inputText={inputText}
        setInputText={setInputText}
        onSend={() => sendMessage(inputText)}
        isProcessing={isProcessing}
        isVoiceMode={isVoiceMode}
        onToggleVoiceMode={() => setIsVoiceMode(!isVoiceMode)}
      />
    </SafeAreaView>
  );
}

const phonicsPracticeStyles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    ...Platform.select({
      web: { boxShadow: '0 2px 12px rgba(99,102,241,0.18)' },
      default: { elevation: 4 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dismissBtn: {
    padding: 4,
  },
  phonemeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  phonemeDisplay: {
    fontSize: 32,
    fontWeight: '800',
    color: '#6366f1',
    letterSpacing: 2,
  },
  phonemeHint: {
    fontSize: 13,
    flex: 1,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  resultText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  listenHint: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
