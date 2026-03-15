/**
 * DashOrb - Floating AI Assistant for Super Admin Dashboard
 *
 * TODO(refactor): This file is ~2600 lines — well over the 500-line guideline.
 * Candidate sub-modules to extract:
 *   - DashOrbStyles.ts             (StyleSheet.create block)
 *   - useDashOrbState.ts           (core state + animation refs)
 *   - DashOrbToolPanel.tsx          (tool result / action-card sub-component)
 *   - DashOrbMessageList.tsx        (message list rendering)
 *   - useDashOrbTools.ts           (tool execution, build triggers, analytics queries)
 * Keep the public component (`DashOrbImpl`) intact as a façade.
 *
 * A powerful floating orb that provides real AI-powered operations:
 * - Query platform analytics and metrics
 * - Manage users, schools, subscriptions
 * - Trigger EAS builds (Android/iOS)
 * - Search codebase via GitHub API
 * - Execute database queries
 * - Send announcements
 * - Generate reports
 * - Manage feature flags
 * 
 * Connects to superadmin-ai Edge Function for secure API access.
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Animated,
  Easing,
  TouchableOpacity,
  PanResponder,
  Dimensions,
  View,
  Text,
  Platform,
  Share,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { assertSupabase } from '@/lib/supabase';
import { createDashOrbStyles } from '@/components/dash-orb/DashOrb.styles';
import { ChatModal, ChatMessage } from '@/components/dash-orb/ChatModal';
import { QuickAction } from '@/components/dash-orb/QuickActions';
import { DashToolsModal } from '@/components/ai/DashToolsModal';
import HomeworkScanner, { type HomeworkScanResult } from '@/components/ai/HomeworkScanner';
import { useVoiceTTS } from '@/components/super-admin/voice-orb/useVoiceTTS';
import { useVoiceRecorder } from '@/components/super-admin/voice-orb/useVoiceRecorder';
import { useVoiceSTT } from '@/components/super-admin/voice-orb/useVoiceSTT';
import { formatTranscript } from '@/lib/voice/formatTranscript';
import { useOnDeviceVoice } from '@/hooks/useOnDeviceVoice';
import { useWakeWord } from '@/hooks/useWakeWord';
import { useDashChatModelPreference } from '@/hooks/useDashChatModelPreference';
import { CosmicOrb } from '@/components/dash-orb/CosmicOrb';
import { useOrbStreaming } from '@/hooks/dash-orb/useOrbStreaming';
import { sanitizeInput, validateCommand, RateLimiter } from '@/lib/security/validators';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { isSuperAdmin } from '@/lib/roleUtils';
import { getOrganizationType } from '@/lib/tenant/compat';
import {
  shouldGreetToday,
  buildDynamicGreeting,
} from '@/lib/ai/greetingManager';
import { calculateAge } from '@/lib/date-utils';
import * as Clipboard from 'expo-clipboard';
import { toast } from '@/components/ui/ToastProvider';
import { ToolRegistry } from '@/services/AgentTools';
import { getDashToolShortcutsForRole } from '@/lib/ai/toolCatalog';
import { formatToolResultMessage } from '@/lib/ai/toolUtils';
import { planToolCall, shouldAttemptToolPlan } from '@/lib/ai/toolPlanner';
import type { DashAttachment } from '@/services/dash-ai/types';
import { pickImages } from '@/services/AttachmentService';
import {
  detectOCRTask,
  getCriteriaResponsePrompt,
  getOCRPromptForTask,
  isOCRIntent,
  isShortOrAttachmentOnlyPrompt,
} from '@/lib/dash-ai/ocrPrompts';
import { shouldUsePhonicsMode } from '@/lib/dash-ai/phonicsDetection';
import { buildImagePayloadsFromAttachments } from '@/lib/dash-ai/imagePayloadBuilder';
import { resolveDashPolicy } from '@/lib/dash-ai/DashPolicyResolver';
import { resolveAgeBand } from '@/lib/dash-ai/learnerContext';
import { classifyResponseMode } from '@/lib/dash-ai/responseMode';
import { detectLanguageOverrideFromText, resolveResponseLocale } from '@/lib/dash-ai/languageRouting';
import {
  consumeAutoScanBudget,
  FREE_IMAGE_BUDGET_PER_DAY,
  loadImageBudget,
  trackImageUsage,
  loadAutoScanBudget,
} from '@/lib/dash-ai/imageBudget';
import { countScannerAttachments } from '@/lib/dash-ai/retakeFlow';
import { logger } from '@/lib/logger';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { classifyFullChatIntent } from '@/lib/dash-ai/fullChatIntent';
import { trackTutorFullChatHandoff } from '@/lib/ai/trackingEvents';
import { resolveAIProxyScopeFromRole } from '@/lib/ai/aiProxyScope';
import { shouldEnableVoiceTurnTools } from '@/lib/dash-voice-utils';

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  AsyncStorage = null;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DashOrbProps {
  /** Position of the orb */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Size of the orb */
  size?: number;
  /** Callback when a command is executed */
  onCommandExecuted?: (command: string, result: unknown) => void;
  /** Start expanded (useful for full-screen mode) */
  autoOpen?: boolean;
  /** Hide floating button (useful for full-screen mode) */
  hideButton?: boolean;
  /** Optional learner context for parent tutoring */
  learnerContext?: {
    ageYears?: number | null;
    grade?: string | null;
    name?: string | null;
    schoolType?: string | null;
  };
  /** Lock the orb and show upgrade prompt instead of chat */
  locked?: boolean;
  /** Optional title/message for locked prompt */
  lockedTitle?: string;
  lockedMessage?: string;
  lockedCtaLabel?: string;
  onUpgradePress?: () => void;
}

type ExecuteCommandResult = {
  text: string;
  ok: boolean;
  ocrMode: boolean;
};

export default function DashOrb({
  position = 'bottom-right',
  size = 60,
  onCommandExecuted,
  autoOpen = false,
  hideButton = false,
  learnerContext,
  locked = false,
  lockedTitle,
  lockedMessage,
  lockedCtaLabel,
  onUpgradePress,
}: DashOrbProps) {
  const { profile, user } = useAuth();
  const autoScanUserId = String(user?.id || profile?.id || '').trim() || null;
  const { theme } = useTheme();
  const styles = useMemo(() => createDashOrbStyles(theme), [theme]);
  const userRole = profile?.role?.toLowerCase() || '';
  const normalizedRole = userRole || 'guest';
  const isUserSuperAdmin = isSuperAdmin(normalizedRole);
  const orgType = getOrganizationType(profile);
  const ageBand = useMemo(
    () => resolveAgeBand(learnerContext?.ageYears, learnerContext?.grade) || 'adult',
    [learnerContext?.ageYears, learnerContext?.grade]
  );

  const dashPolicy = useMemo(
    () =>
      resolveDashPolicy({
        profile: profile || null,
        role: normalizedRole,
        orgType,
        learnerContext: {
          ageBand,
          grade: learnerContext?.grade || null,
        },
      }),
    [ageBand, learnerContext?.grade, normalizedRole, orgType, profile]
  );
  const learnerAgeYears = typeof learnerContext?.ageYears === 'number' ? learnerContext.ageYears : null;
  const learnerGrade = learnerContext?.grade || null;
  const learnerName = learnerContext?.name || null;
  const tierLabel = String(
    (profile as any)?.subscription_tier ||
    (profile as any)?.tier ||
    (profile as any)?.current_tier ||
    ''
  ).toLowerCase();
  const isFreeImageBudgetTier = tierLabel === 'free' || tierLabel === 'trialing' || tierLabel === 'trial';
  const [isExpanded, setIsExpanded] = useState(!!autoOpen);
  const [inputText, setInputText] = useState('');
  const [, setLiveTranscript] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(!learnerContext);
  const [pendingTutorIntent, setPendingTutorIntent] = useState<{ prompt: string; label?: string } | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<DashAttachment[]>([]);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [remainingAutoScans, setRemainingAutoScans] = useState<number | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [whisperModeEnabled, setWhisperModeEnabled] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isListeningForCommand, setIsListeningForCommand] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'en-ZA' | 'af-ZA' | 'zu-ZA'>('en-ZA');
  const { selectedModel, setSelectedModel, allModels: modelPickerModels, canSelectModel: canSelectOrbModel } = useDashChatModelPreference();
  const [memorySnapshot, setMemorySnapshot] = useState('');
  const [quickActionAge, setQuickActionAge] = useState('auto');
  const [quickActionPrompt, setQuickActionPrompt] = useState('');
  const wakeWordAvailable = Platform.OS !== 'web' && !!process.env.EXPO_PUBLIC_PICOVOICE_ACCESS_KEY;
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [showUpgradeBubble, setShowUpgradeBubble] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [, setSimulatedVisemeId] = useState(0);
  const upgradeAnim = useRef(new Animated.Value(0)).current;
  const upgradeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const onDeviceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isListeningForCommandRef = useRef(false);
  const whisperModeEnabledRef = useRef(true);
  const shouldRestartListeningRef = useRef(false);
  const triggerListeningRef = useRef<(() => void) | null>(null);
  const handleSendRef = useRef<(text: string) => Promise<void>>(async () => {});

  const getRemainingOrbImageSlots = useCallback(async () => {
    if (!isFreeImageBudgetTier) return Number.POSITIVE_INFINITY;
    const budget = await loadImageBudget();
    const selectedCount = pendingAttachments.filter((attachment) => attachment.kind === 'image').length;
    return Math.max(0, budget.remainingCount - selectedCount);
  }, [isFreeImageBudgetTier, pendingAttachments]);

  const refreshAutoScanBudget = useCallback(async () => {
    const budget = await loadAutoScanBudget(tierLabel || 'free', autoScanUserId);
    setRemainingAutoScans(budget.remainingCount);
  }, [autoScanUserId, tierLabel]);

  useEffect(() => {
    void refreshAutoScanBudget();
  }, [refreshAutoScanBudget]);

  const normalizeSupportedLanguage = (lang?: string | null): 'en-ZA' | 'af-ZA' | 'zu-ZA' | null => {
    if (!lang) return null;
    if (lang === 'en-ZA' || lang === 'af-ZA' || lang === 'zu-ZA') return lang;
    return null;
  };

  const resolveAgeGroupFromYears = (ageYears?: number | null) => {
    if (!ageYears && ageYears !== 0) return null;
    if (ageYears <= 5) return '3-5';
    if (ageYears <= 8) return '6-8';
    if (ageYears <= 12) return '9-12';
    if (ageYears <= 15) return '13-15';
    if (ageYears <= 18) return '16-18';
    return 'adult';
  };

  const resolveGradeBand = (ageGroup: string) => {
    switch (ageGroup) {
      case '3-5':
        return 'Grade R / Reception';
      case '6-8':
        return 'Grades 1-3';
      case '9-12':
        return 'Grades 4-6';
      case '13-15':
        return 'Grades 7-9';
      case '16-18':
        return 'Grades 10-12';
      case 'adult':
        return 'Adult learners';
      default:
        return null;
    }
  };

  useEffect(() => {
    isListeningForCommandRef.current = isListeningForCommand;
  }, [isListeningForCommand]);

  useEffect(() => {
    whisperModeEnabledRef.current = whisperModeEnabled;
  }, [whisperModeEnabled]);

  const toolShortcuts = useMemo(() => {
    const policyToolNames = new Set(dashPolicy.toolShortcuts);
    const shortcuts = getDashToolShortcutsForRole(normalizedRole);
    const orderedShortcuts = [
      ...shortcuts.filter((tool) => policyToolNames.has(tool.name)),
      ...shortcuts.filter((tool) => !policyToolNames.has(tool.name)),
    ];
    return orderedShortcuts.filter((tool) => ToolRegistry.hasTool(tool.name));
  }, [dashPolicy.toolShortcuts, normalizedRole]);

  const autoToolShortcuts = useMemo(() => {
    // Include all tool categories that should be auto-invoked when relevant
    return toolShortcuts.filter((tool) =>
      tool.category === 'caps' ||
      tool.category === 'data' ||
      tool.category === 'navigation' ||
      tool.category === 'communication' ||
      tool.category === 'support'
    );
  }, [toolShortcuts]);

  const plannerTools = useMemo(() => {
    return autoToolShortcuts
      .map((tool) => {
        const registryTool = ToolRegistry.getTool(tool.name);
        return {
          name: tool.name,
          description: tool.description || registryTool?.description || tool.label,
          parameters: registryTool?.parameters,
        };
      })
      .filter((tool) => !!tool.name);
  }, [autoToolShortcuts]);
  
  const rateLimiter = useRef(new RateLimiter(10, 60000)).current;
  
  // SSE streaming + sentence-level TTS pipelining
  const { streamResponse, cancelStream } = useOrbStreaming();
  const ttsSentenceQueueRef = useRef<string[]>([]);
  const isSpeakingSentenceRef = useRef(false);

  // Dash TTS single source of truth: useVoiceTTS (Azure + device fallback; @/components/super-admin/voice-orb/useVoiceTTS)
  const voiceTTS = useVoiceTTS();
  const { speak, stop: stopSpeaking, isSpeaking } = Platform.OS !== 'web'
    ? voiceTTS
    : { speak: async () => {}, stop: async () => {}, isSpeaking: false };
  const lastTTSErrorRef = useRef<string>('');
  
  // Voice input integration - useVoiceRecorder returns [state, actions, audioLevel] tuple
  const voiceRecorderHookResult = useVoiceRecorder();
  const voiceRecorderResult = Platform.OS !== 'web' ? voiceRecorderHookResult : null;
  const voiceRecorderState = voiceRecorderResult ? voiceRecorderResult[0] : null;
  const voiceRecorderActions = voiceRecorderResult ? voiceRecorderResult[1] : null;
  const voiceSTTHookResult = useVoiceSTT({ preschoolId: profile?.organization_id || profile?.preschool_id || null });
  const voiceSTT = Platform.OS !== 'web' ? voiceSTTHookResult : null;
  const orbState = useMemo<'idle' | 'listening' | 'thinking' | 'speaking'>(() => {
    if (isSpeaking) return 'speaking';
    if (isProcessing) return 'thinking';
    if (isListeningForCommand || Boolean(voiceRecorderState?.isRecording)) return 'listening';
    return 'idle';
  }, [isSpeaking, isProcessing, isListeningForCommand, voiceRecorderState?.isRecording]);
  useEffect(() => {
    if (!isSpeaking && !isSpeakingSentenceRef.current && ttsSentenceQueueRef.current.length === 0) {
      setIsMicMuted(false);
    }
  }, [isSpeaking]);

  useEffect(() => {
    if (!isSpeaking) {
      setSimulatedVisemeId(0);
      return;
    }

    // When real viseme events arrive via useOrbStreaming's onVisemeEvent
    // callback, they set simulatedVisemeId directly. This fallback only
    // fires when no viseme events have been scheduled (e.g. device TTS
    // fallback path). Check if any scheduled viseme is active by using
    // a low-frequency idle mouth movement instead of random cycling.
    const idleCycle = [0, 1, 3, 1, 0, 4, 6, 4, 0];
    let idx = 0;
    const timer = setInterval(() => {
      idx = (idx + 1) % idleCycle.length;
      setSimulatedVisemeId(idleCycle[idx]);
    }, 200);

    return () => clearInterval(timer);
  }, [isSpeaking]);
  const onDeviceVoice = useOnDeviceVoice({
    language: selectedLanguage,
    onPartialResult: (text) => {
      if (!isListeningForCommandRef.current) return;
      setLiveTranscript(text);
      setInputText(text);
    },
    onFinalResult: async (text) => {
      if (!text || !text.trim()) return;
      if (onDeviceTimeoutRef.current) {
        clearTimeout(onDeviceTimeoutRef.current);
        onDeviceTimeoutRef.current = null;
      }
      setLiveTranscript('');
      setInputText('');
      setMessages(prev => prev.filter(m => !m.id.startsWith('listening-')));
      setIsListeningForCommand(false);
      const language = selectedLanguage;
      const formatted = formatTranscript(text, language, {
        whisperFlow: true,
        summarize: true,
        preschoolMode: orgType === 'preschool',
        maxSummaryWords: orgType === 'preschool' ? 16 : 20,
      });
      shouldRestartListeningRef.current = whisperModeEnabledRef.current;
      await handleSendRef.current(formatted);
    },
    onError: (errorMsg) => {
      console.warn('[DashOrb] On-device voice error:', errorMsg);
      if (onDeviceTimeoutRef.current) {
        clearTimeout(onDeviceTimeoutRef.current);
        onDeviceTimeoutRef.current = null;
      }
      setLiveTranscript('');
      if (isListeningForCommandRef.current) {
        setIsListeningForCommand(false);
        setMessages(prev => prev.filter(m => !m.id.startsWith('listening-')));
        toast.info('Voice input unavailable. Tap mic to try again.');
      }
    },
  });

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!voiceEnabled) return;
    const err = voiceTTS.error?.trim();
    if (!err) return;
    if (lastTTSErrorRef.current === err) return;
    lastTTSErrorRef.current = err;
    toast.info(err, 'Dash Voice');
    console.warn('[DashOrb] TTS warning:', err);
  }, [voiceEnabled, voiceTTS.error]);
  
  // Wake word detection
  const wakeWord = useWakeWord({
    onWakeWord: () => {
      console.log('[DashOrb] Wake word "Hey Dash" detected!');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      handleWakeWordDetected();
    },
    enabled: wakeWordEnabled && wakeWordAvailable && !locked,
    useFallback: false, // Use Porcupine for "Hey Dash" wake word detection
  });

  // Wake-word on by default (hands-free). User can toggle off in settings.
  useEffect(() => {
    if (!voiceEnabled) return;
    if (!wakeWordAvailable) return;
    setWakeWordEnabled(true);
    wakeWord.startListening();
  }, [voiceEnabled, wakeWordAvailable]);
  
  // Animations & Gestures
  const pan = useRef(new Animated.ValueXY()).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;
  
  // Store animation instances to stop/start them
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const glowLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  
  // Initialize position
  useEffect(() => {
    let initialX = SCREEN_WIDTH - size - 20;
    let initialY = SCREEN_HEIGHT - size - 100; // Account for tab bar

    switch (position) {
      case 'bottom-left':
        initialX = 20;
        initialY = SCREEN_HEIGHT - size - 100;
        break;
      case 'top-right':
        initialX = SCREEN_WIDTH - size - 20;
        initialY = 100;
        break;
      case 'top-left':
        initialX = 20;
        initialY = 100;
        break;
    }
    
    pan.setValue({ x: initialX, y: initialY });
  }, [position, size]);

  useEffect(() => {
    if (autoOpen && !locked) {
      setIsExpanded(true);
    }
  }, [autoOpen, locked]);

  useEffect(() => {
    return () => {
      if (upgradeTimerRef.current) {
        clearTimeout(upgradeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!locked) {
      setShowUpgradeBubble(false);
      upgradeAnim.setValue(0);
    }
  }, [locked, upgradeAnim]);

  const chatStorageKey = user?.id ? `@dash_orb_chat_${user.id}` : '@dash_orb_chat_guest';
  const memoryStorageKey = user?.id ? `@dash_orb_memory_${user.id}` : '@dash_orb_memory_guest';

  useEffect(() => {
    if (!AsyncStorage) return;
    let isMounted = true;
    const loadHistory = async () => {
      try {
        const [storedChat, storedMemory] = await Promise.all([
          AsyncStorage.getItem(chatStorageKey),
          AsyncStorage.getItem(memoryStorageKey),
        ]);

        if (storedMemory && isMounted) {
          try {
            const parsedMemory = JSON.parse(storedMemory) as { summary?: string };
            setMemorySnapshot(typeof parsedMemory?.summary === 'string' ? parsedMemory.summary : '');
          } catch {
            setMemorySnapshot('');
          }
        }

        if (!storedChat) {
          return;
        }
        const parsed = JSON.parse(storedChat) as Array<Omit<ChatMessage, 'timestamp'> & { timestamp: string }>;
        if (!Array.isArray(parsed)) return;
        const hydrated = parsed.map((msg) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
          isLoading: false,
          isStreaming: false,
        })) as ChatMessage[];
        if (isMounted) {
          setMessages(hydrated);
          setShowQuickActions(hydrated.length === 0);
        }
      } catch (err) {
        console.warn('[DashOrb] Failed to load chat history:', err);
      }
    };
    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [chatStorageKey, memoryStorageKey]);

  useEffect(() => {
    if (!AsyncStorage) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    saveTimerRef.current = setTimeout(async () => {
      try {
        const serializable = messages
          .filter((msg) => !msg.isLoading && !msg.isStreaming)
          .map((msg) => ({
            ...msg,
            isLoading: false,
            isStreaming: false,
            toolCalls: undefined,
            timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : new Date().toISOString(),
          }));
        await AsyncStorage.setItem(chatStorageKey, JSON.stringify(serializable));
      } catch (err) {
        console.warn('[DashOrb] Failed to save chat history:', err);
      }
    }, 1200);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [messages, chatStorageKey]);

  const getMemorySpeakerLabel = useCallback((messageRole: ChatMessage['role']) => {
    if (messageRole !== 'user') return 'Dash';
    if (isUserSuperAdmin) return 'Operator';
    if (normalizedRole === 'parent') return 'Parent';
    if (normalizedRole === 'student' || normalizedRole === 'learner') return 'Learner';
    if (normalizedRole === 'teacher' || normalizedRole === 'principal' || normalizedRole === 'admin') return 'Staff';
    return 'User';
  }, [isUserSuperAdmin, normalizedRole]);

  useEffect(() => {
    const summary = messages
      .filter((msg) => (msg.role === 'user' || msg.role === 'assistant') && !msg.isLoading)
      .slice(-6)
      .map((msg) => `${getMemorySpeakerLabel(msg.role)}: ${msg.content}`)
      .join(' | ')
      .slice(0, 500);

    setMemorySnapshot((prev) => (prev === summary ? prev : summary));

    if (!AsyncStorage) return;
    const timer = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(memoryStorageKey, JSON.stringify({
          summary,
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        console.warn('[DashOrb] Failed to save conversation memory:', err);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [getMemorySpeakerLabel, messages, memoryStorageKey]);

  useEffect(() => {
    return () => {
      if (streamingTimerRef.current) {
        clearTimeout(streamingTimerRef.current);
        streamingTimerRef.current = null;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  const streamResponseToMessage = async (messageId: string, fullText: string) => {
    if (streamingTimerRef.current) {
      clearTimeout(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }

    if (!fullText) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === messageId ? { ...msg, content: '', isLoading: false, isStreaming: false } : msg
        )
      );
      return;
    }

    // Use larger chunks and longer intervals to reduce re-renders
    // and prevent flickering/bouncing. ~8 updates/sec max.
    const total = fullText.length;
    const step = 80;
    const intervalMs = 35;
    let index = 0;

    return new Promise<void>((resolve) => {
      const tick = () => {
        index = Math.min(total, index + step);
        const isComplete = index >= total;
        setMessages(prev =>
          prev.map(msg =>
            msg.id === messageId
              ? {
                  ...msg,
                  content: fullText.slice(0, index),
                  isLoading: false,
                  isStreaming: !isComplete,
                }
              : msg
          )
        );
        if (isComplete) {
          streamingTimerRef.current = null;
          resolve();
          return;
        }
        streamingTimerRef.current = setTimeout(tick, intervalMs);
      };
      tick();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        // Stop pulse loop to avoid animation conflict
        pulseLoopRef.current?.stop();
        glowLoopRef.current?.stop();
        setIsDragging(true);

        if (showUpgradeBubble) {
          if (upgradeTimerRef.current) {
            clearTimeout(upgradeTimerRef.current);
            upgradeTimerRef.current = null;
          }
          upgradeAnim.stopAnimation();
          upgradeAnim.setValue(1);
        }
        
        dragStartRef.current = {
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        };
        pan.setOffset({ ...dragStartRef.current });
        pan.setValue({ x: 0, y: 0 });
        
        // Haptic feedback on grab
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        // Scale down slightly when dragging
        Animated.spring(pulseAnim, {
          toValue: 0.9,
          useNativeDriver: false,
        }).start();
      },
      onPanResponderMove: (_, gestureState) => {
        const edgePadding = 16;
        const topLimit = 80;
        const bottomLimit = 120;
        const horizontalLimit = SCREEN_WIDTH * 0.42;
        const minX = position.includes('left') ? edgePadding : Math.max(edgePadding, horizontalLimit);
        const maxX = position.includes('left')
          ? Math.min(SCREEN_WIDTH * 0.58 - size, SCREEN_WIDTH - size - edgePadding)
          : SCREEN_WIDTH - size - edgePadding;
        const minY = topLimit;
        const maxY = SCREEN_HEIGHT - size - bottomLimit;

        const rawX = dragStartRef.current.x + gestureState.dx;
        const rawY = dragStartRef.current.y + gestureState.dy;
        const clampedX = Math.max(minX, Math.min(maxX, rawX));
        const clampedY = Math.max(minY, Math.min(maxY, rawY));

        pan.setValue({
          x: clampedX - dragStartRef.current.x,
          y: clampedY - dragStartRef.current.y,
        });
      },
      onPanResponderRelease: () => {
        pan.flattenOffset();
        setIsDragging(false);

        if (locked && showUpgradeBubble) {
          if (upgradeTimerRef.current) {
            clearTimeout(upgradeTimerRef.current);
          }
          upgradeTimerRef.current = setTimeout(() => {
            Animated.timing(upgradeAnim, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start(() => setShowUpgradeBubble(false));
          }, 2600);
        }
        
        // Snap to nearest edge logic could go here
        
        // Restore scale and restart pulse loop
        Animated.spring(pulseAnim, {
          toValue: 1,
          useNativeDriver: false,
        }).start(() => {
          // Restart pulse loop after scale animation completes
          pulseLoopRef.current?.start();
          glowLoopRef.current?.start();
        });
      },
    })
  ).current;
  
  // Pulsing animation for the orb (only when not dragging)
  useEffect(() => {
    if (isDragging) {
      pulseLoopRef.current?.stop();
      glowLoopRef.current?.stop();
      return;
    }
    
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false, // Must match PanResponder setting
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false, // Must match PanResponder setting
        }),
      ])
    );
    
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false, // Must match PanResponder setting
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false, // Must match PanResponder setting
        }),
      ])
    );

    pulseLoopRef.current = pulse;
    glowLoopRef.current = glow;
    
    pulse.start();
    glow.start();

    return () => {
      pulse.stop();
      glow.stop();
    };
  }, [isDragging]);

  // Rotation animation when processing
  useEffect(() => {
    if (isProcessing) {
      const rotation = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: false, // Consistent with all other animations
        })
      );
      rotation.start();
      return () => rotation.stop();
    } else {
      rotateAnim.setValue(0);
    }
  }, [isProcessing]);

  // Expand/collapse animation
  useEffect(() => {
    Animated.spring(expandAnim, {
      toValue: isExpanded ? 1 : 0,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  }, [isExpanded]);

  const handleOrbPress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (locked) {
      if (upgradeTimerRef.current) {
        clearTimeout(upgradeTimerRef.current);
      }
      setShowUpgradeBubble(true);
      Animated.timing(upgradeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
      upgradeTimerRef.current = setTimeout(() => {
        Animated.timing(upgradeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setShowUpgradeBubble(false));
      }, 3600);
      return;
    }
    
    // If speaking or TTS pipeline is active, interrupt and restart listening
    const ttsPipelineActive = isSpeaking || isSpeakingSentenceRef.current || ttsSentenceQueueRef.current.length > 0;
    if (ttsPipelineActive) {
      console.log('[DashOrb] User interrupted TTS - restarting voice input');
      ttsSentenceQueueRef.current = [];
      isSpeakingSentenceRef.current = false;
      await stopSpeaking();
      setTimeout(() => {
        if (!voiceEnabled) return;
        if (isListeningForCommandRef.current) return;
        if (isProcessing) return;
        handleMicPress();
      }, 260);
      return;
    }
    
    setIsExpanded(true);
    if (messages.length === 0) {
      if (!showQuickActions) {
        // Dynamic greeting with once-per-day guard
        (async () => {
          const shouldGreet = await shouldGreetToday(user?.id);
          const greeting = shouldGreet
            ? buildDynamicGreeting({
                userName: profile?.first_name || profile?.full_name?.split(' ')[0] || null,
                role: normalizedRole,
                orgType: getOrganizationType(profile) || null,
              })
            : profile?.first_name
              ? `Hey ${profile.first_name}, what can I help with?`
              : 'What can I help with?';
          setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: greeting,
            timestamp: new Date(),
          }]);
        })();
      }
    }
  };

  const handleWakeWordDetected = async () => {
    console.log('[DashOrb] Wake word detected');

    if (isMicMuted) {
      console.log('[DashOrb] Mic is muted - ignoring wake word');
      return;
    }

    if (locked) {
      console.log('[DashOrb] Screen is locked - ignoring wake word');
      if (upgradeTimerRef.current) {
        clearTimeout(upgradeTimerRef.current);
      }
      setShowUpgradeBubble(true);
      Animated.timing(upgradeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
      upgradeTimerRef.current = setTimeout(() => {
        Animated.timing(upgradeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setShowUpgradeBubble(false));
      }, 3600);
      return;
    }

    // ✅ BARGE-IN: if Dash is speaking (or TTS pipeline active or streaming), stop immediately and listen
    try {
      const bargeInNeeded = isSpeaking || isSpeakingSentenceRef.current || ttsSentenceQueueRef.current.length > 0;
      if (bargeInNeeded) {
        console.log('[DashOrb] Barge-in: stopping TTS pipeline');
        ttsSentenceQueueRef.current = [];
        isSpeakingSentenceRef.current = false;
        await Promise.resolve(stopSpeaking());
      }
      if (isProcessing) {
        console.log('[DashOrb] Barge-in: cancelling stream');
        cancelStream?.();
      }
    } catch { /* barge-in best-effort */ }

    setIsExpanded(true);

    if (!voiceEnabled) {
      console.log('[DashOrb] Voice is disabled - not starting command listening');
      return;
    }

    setIsListeningForCommand(true);
    
    // Add listening indicator message
    setMessages(prev => [...prev, {
      id: `listening-${Date.now()}`,
      role: 'system',
      content: '🎤 Listening...',
      timestamp: new Date(),
    }]);

    const canUseOnDevice = Platform.OS !== 'web' && onDeviceVoice.isAvailable;
    if (canUseOnDevice) {
      try {
        setIsListeningForCommand(true);
        setLiveTranscript('');
        setInputText('');
        onDeviceVoice.clearResults();
        await onDeviceVoice.startListening();

        if (onDeviceTimeoutRef.current) {
          clearTimeout(onDeviceTimeoutRef.current);
        }
        onDeviceTimeoutRef.current = setTimeout(() => {
          onDeviceVoice.stopListening();
          setLiveTranscript('');
          setInputText('');
          setIsListeningForCommand(false);
          setMessages(prev => prev.filter(m => !m.id.startsWith('listening-')));
        }, 10000);
        return;
      } catch (err) {
        console.warn('[DashOrb] On-device voice failed, falling back to server STT:', err);
      }
    }

    try {
      // Start recording using the actions from the hook tuple
      if (voiceRecorderActions && voiceSTT) {
        const started = await voiceRecorderActions.startRecording();
        if (!started) {
          console.error('[DashOrb] Failed to start recording');
          setIsListeningForCommand(false);
          setMessages(prev => prev.filter(m => !m.id.startsWith('listening-')));
          return;
        }
        
        // Wait for speech to complete (voiceRecorder will auto-stop on silence)
        // Poll for recording status
        const checkRecording = setInterval(async () => {
          if (voiceRecorderState && !voiceRecorderState.isRecording) {
            clearInterval(checkRecording);
            
            // Get the audio URI by stopping recording
            const audioUri = await voiceRecorderActions.stopRecording();
            if (audioUri) {
              // Transcribe the audio (default to South African English)
              const transcriptResult = await voiceSTT.transcribe(audioUri, 'auto');
              
              if (transcriptResult && transcriptResult.text && transcriptResult.text.trim()) {
                const normalized = normalizeSupportedLanguage(transcriptResult.language);
                if (normalized) setSelectedLanguage(normalized);
                // Remove listening message
                setMessages(prev => prev.filter(m => !m.id.startsWith('listening-')));
                
                // Process the voice command
                const formatted = formatTranscript(
                  transcriptResult.text,
                  transcriptResult.language || normalized || undefined,
                  {
                    whisperFlow: true,
                    summarize: true,
                    preschoolMode: orgType === 'preschool',
                    maxSummaryWords: orgType === 'preschool' ? 16 : 20,
                  }
                );
                shouldRestartListeningRef.current = whisperModeEnabledRef.current;
                await handleSend(formatted);
              }
            }
            setIsListeningForCommand(false);
          }
        }, 500);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkRecording);
          if (voiceRecorderState?.isRecording) {
            voiceRecorderActions.stopRecording();
          }
          setIsListeningForCommand(false);
          setMessages(prev => prev.filter(m => !m.id.startsWith('listening-')));
        }, 10000);
      }
    } catch (err) {
      console.error('[DashOrb] Voice input error:', err);
      setIsListeningForCommand(false);
      setMessages(prev => prev.filter(m => !m.id.startsWith('listening-')));
    }
  };

  useEffect(() => {
    triggerListeningRef.current = () => {
      void handleWakeWordDetected();
    };
  }, [handleWakeWordDetected]);

  const handleMicPress = async () => {
    const ttsPipelineActive = isSpeaking || isSpeakingSentenceRef.current || ttsSentenceQueueRef.current.length > 0;
    if (ttsPipelineActive) {
      setIsMicMuted(prev => !prev);
      return;
    }

    if (isListeningForCommand) {
      shouldRestartListeningRef.current = false;
      if (onDeviceTimeoutRef.current) {
        clearTimeout(onDeviceTimeoutRef.current);
        onDeviceTimeoutRef.current = null;
      }
      if (onDeviceVoice.isListening) {
        await onDeviceVoice.stopListening();
      }
      if (voiceRecorderState?.isRecording) {
        await voiceRecorderActions?.stopRecording();
      }
      setLiveTranscript('');
      setInputText('');
      setMessages(prev => prev.filter(m => !m.id.startsWith('listening-')));
      setIsListeningForCommand(false);
    } else {
      await handleWakeWordDetected();
    }
  };

  const handleStopActivity = useCallback(async () => {
    shouldRestartListeningRef.current = false;
    if (onDeviceTimeoutRef.current) {
      clearTimeout(onDeviceTimeoutRef.current);
      onDeviceTimeoutRef.current = null;
    }

    ttsSentenceQueueRef.current = [];
    isSpeakingSentenceRef.current = false;

    try {
      cancelStream?.();
    } catch { /* best-effort */ }
    try {
      if (onDeviceVoice.isListening) {
        await onDeviceVoice.stopListening();
      }
    } catch { /* best-effort */ }
    try {
      if (voiceRecorderState?.isRecording) {
        await voiceRecorderActions?.stopRecording();
      }
    } catch { /* best-effort */ }
    try {
      await Promise.resolve(stopSpeaking());
    } catch { /* best-effort */ }

    setIsListeningForCommand(false);
    setIsProcessing(false);
    setLiveTranscript('');
    setMessages((prev) =>
      prev
        .filter((message) => !message.id.startsWith('listening-'))
        .map((message) =>
          message.isLoading || message.isStreaming
            ? {
                ...message,
                isLoading: false,
                isStreaming: false,
                toolCalls: undefined,
                content: message.content
                  ? `${message.content}\n\n(Stopped)`
                  : '(Stopped)',
              }
            : message
        )
    );
  }, [cancelStream, onDeviceVoice, stopSpeaking, voiceRecorderActions, voiceRecorderState?.isRecording]);

  useEffect(() => {
    if (!whisperModeEnabled) return;
    if (!shouldRestartListeningRef.current) return;
    if (isProcessing || isSpeaking || isListeningForCommand) return;

    const timer = setTimeout(() => {
      if (!whisperModeEnabledRef.current) return;
      if (isProcessing || isSpeaking || isListeningForCommandRef.current) return;
      if (isSpeakingSentenceRef.current || ttsSentenceQueueRef.current.length > 0) return;
      shouldRestartListeningRef.current = false;
      triggerListeningRef.current?.();
    }, 650);

    return () => clearTimeout(timer);
  }, [whisperModeEnabled, isProcessing, isSpeaking, isListeningForCommand]);

  const buildImagePayloads = useCallback(async (attachments: DashAttachment[]) => {
    return buildImagePayloadsFromAttachments({
      attachments,
    });
  }, []);

  const handleOrbAttach = useCallback(async () => {
    if (isProcessing) return;
    try {
      const remainingSlots = await getRemainingOrbImageSlots();
      if (remainingSlots <= 0) {
        toast.info(`Daily image limit reached (${FREE_IMAGE_BUDGET_PER_DAY}). Upgrade for more.`);
        return;
      }
      const picked = await pickImages();
      if (!picked || picked.length === 0) return;

      const allowed = Number.isFinite(remainingSlots) ? picked.slice(0, remainingSlots) : picked;
      if (allowed.length === 0) {
        toast.info(`Daily image limit reached (${FREE_IMAGE_BUDGET_PER_DAY}). Upgrade for more.`);
        return;
      }

      setPendingAttachments((prev) => [...prev, ...allowed].slice(0, 5));
      if (allowed.length < picked.length) {
        toast.info(`Added ${allowed.length}/${picked.length} images (daily free limit).`);
      } else {
        toast.success(`${allowed.length} image${allowed.length === 1 ? '' : 's'} attached`);
      }
    } catch (error) {
      console.warn('[DashOrb] Failed to attach images:', error);
      toast.error('Could not attach image');
    }
  }, [getRemainingOrbImageSlots, isProcessing]);

  const handleOrbCamera = useCallback(async () => {
    if (isProcessing) return;
    setScannerVisible(true);
  }, [isProcessing]);

  const handleScannerScanned = useCallback(async (result: HomeworkScanResult) => {
    if (!result?.base64) return;
    const remainingSlots = await getRemainingOrbImageSlots();
    if (remainingSlots <= 0) {
      setScannerVisible(false);
      toast.info(`Daily image limit reached (${FREE_IMAGE_BUDGET_PER_DAY}). Upgrade for more.`);
      return;
    }
    const attachment: DashAttachment = {
      id: `attach_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: `homework_scan_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      size: Math.max(0, Math.floor(result.base64.length * 0.75)),
      bucket: 'attachments',
      storagePath: '',
      kind: 'image',
      status: 'pending',
      previewUri: result.uri,
      uploadProgress: 0,
      meta: {
        base64: result.base64,
        image_base64: result.base64,
        image_media_type: 'image/jpeg',
        width: result.width,
        height: result.height,
        source: 'homework_scanner',
      },
    };
    setPendingAttachments((prev) => [...prev, attachment].slice(0, 5));
    void refreshAutoScanBudget();
    setScannerVisible(false);
    toast.success('Homework scan attached');
  }, [getRemainingOrbImageSlots, refreshAutoScanBudget]);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed && pendingAttachments.length === 0) return;
    const flags = getFeatureFlagsSync();
    const handoffIntent = flags.dash_tutor_auto_handoff_v1 ? classifyFullChatIntent(trimmed) : null;

    if (handoffIntent && !isEditing && !pendingTutorIntent) {
      trackTutorFullChatHandoff({
        intent: handoffIntent,
        source: 'dash_orb',
        role: normalizedRole,
      });
      setIsExpanded(false);
      router.push({
        pathname: '/screens/dash-assistant',
        params: {
          source: 'dash_orb',
          initialMessage: trimmed,
          resumePrompt: trimmed,
          mode: handoffIntent === 'quiz' ? 'tutor' : 'advisor',
          tutorMode: handoffIntent === 'quiz' ? 'quiz' : undefined,
          handoffIntent,
        },
      } as any);
      return;
    }

    if (isEditing && editingMessageId) {
      const index = messages.findIndex((m) => m.id === editingMessageId);
      const baseMessages = index >= 0 ? messages.slice(0, index) : messages;
      setIsEditing(false);
      setEditingMessageId(null);
      await processCommand(trimmed, undefined, {
        baseMessages,
        attachments: pendingAttachments,
      });
      setPendingAttachments([]);
      return;
    }
    if (pendingTutorIntent) {
      const mergedPrompt = buildTutorPrompt(pendingTutorIntent.prompt, {
        topicHint: trimmed,
        requireDetails: false,
      });
      setPendingTutorIntent(null);
      await processCommand(mergedPrompt, trimmed, { attachments: pendingAttachments });
      setPendingAttachments([]);
      return;
    }
    await processCommand(trimmed || 'Please analyze this image.', undefined, { attachments: pendingAttachments });
    setPendingAttachments([]);
  };

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const quickIntents = useMemo(() => {
    if (learnerContext) return [];
    const actions = Array.isArray(dashPolicy.quickActions) ? dashPolicy.quickActions : [];
    if (actions.length > 0) {
      return actions.map((a) => ({ id: a.id, label: a.label, prompt: a.prompt }));
    }

    // Fallback (should be rare): keep a few safe defaults.
    return [
      { id: 'explain', label: 'Explain', prompt: 'Explain this in simple steps and ask one check question.' },
      { id: 'practice', label: 'Practice', prompt: 'Give me one practice task and then evaluate my answer.' },
      { id: 'summarize', label: 'Summarize', prompt: 'Summarize this into key points and one next action.' },
    ];
  }, [dashPolicy.quickActions, learnerContext]);

  const handleQuickIntent = useCallback((intent: { id: string; label: string; prompt: string }) => {
    if (isProcessing) return;

    if (intent.id === 'summarize') {
      const lastAssistant = [...messages].reverse().find((msg) => msg.role === 'assistant' && !msg.isLoading);
      if (lastAssistant?.content) {
        void handleSend(`Summarize this response for parent and child:\n${lastAssistant.content}`);
        return;
      }
    }

    if (intent.id === 'translate') {
      const lastAssistant = [...messages].reverse().find((msg) => msg.role === 'assistant' && !msg.isLoading);
      if (lastAssistant?.content) {
        void handleSend(`Translate this into simpler language for a parent and child:\n${lastAssistant.content}`);
        return;
      }
    }

    void handleSend(intent.prompt);
  }, [isProcessing, messages, handleSend]);

  const processCommand = async (
    command: string,
    displayOverride?: string,
    options?: {
      baseMessages?: ChatMessage[];
      historyOverride?: Array<{ role: string; content: string }>;
      skipUserMessage?: boolean;
      attachments?: DashAttachment[];
    }
  ) => {
    // Sanitize input
    const sanitized = sanitizeInput(command, 2000);
    const explicitLanguage = detectLanguageOverrideFromText(sanitized);
    const responseMode = classifyResponseMode({
      text: sanitized,
      hasAttachments: (options?.attachments?.length || 0) > 0,
    });
    const requestLanguage = resolveResponseLocale({
      explicitOverride: explicitLanguage,
      responseText: sanitized,
      fallbackPreference: selectedLanguage,
    });
    const languageSource = requestLanguage.source || (explicitLanguage ? 'explicit_override' : 'preference');
    
    // Validate command
    const validation = validateCommand(sanitized);
    if (!validation.valid) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Invalid command: ${validation.error}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }
    
    // Check rate limit
    if (!rateLimiter.isAllowed('dashOrb')) {
      const remaining = rateLimiter.getRemaining('dashOrb');
      const errorMessage: ChatMessage = {
        id: `rate-limit-${Date.now()}`,
        role: 'assistant',
        content: `⏱️ Rate limit exceeded. Please wait a moment before trying again. (${remaining} requests remaining)`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }
    
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: displayOverride ? sanitizeInput(displayOverride, 2000) : sanitized,
      timestamp: new Date(),
      attachments: options?.attachments && options.attachments.length > 0
        ? options.attachments
        : undefined,
    };
    setInputText('');
    setIsProcessing(true);
    setShowQuickActions(false);

    // Add user message immediately
    setMessages((prev) => {
      const base = options?.baseMessages ?? prev;
      const next = [...base];
      if (!options?.skipUserMessage) {
        next.push(userMessage);
      }
      return next;
    });

    // Auto tool call (low-risk only)
    let toolContextEntry: { role: 'assistant'; content: string } | null = null;
    if (!options?.skipUserMessage) {
      const autoTool = await runAutoToolIfNeeded(sanitized);
      if (autoTool?.toolChatMessage?.content) {
        toolContextEntry = { role: 'assistant', content: autoTool.toolChatMessage.content };
      }
    }

    const thinkingId = `thinking-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: thinkingId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isLoading: true,
        toolCalls: detectToolsNeeded(command),
      },
    ]);

    try {
      const baseHistory = options?.historyOverride ?? (options?.baseMessages ?? messages)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));
      const history = toolContextEntry ? [...baseHistory, toolContextEntry] : baseHistory;

      const attachmentsForTurn = options?.attachments || [];
      const forceNonStreaming = attachmentsForTurn.length > 0;

      if (forceNonStreaming) {
        const result = await executeCommand(command, history, attachmentsForTurn);
        await streamResponseToMessage(thinkingId, result.text);
        setMessages(prev =>
          prev.map(msg =>
            msg.id === thinkingId ? { ...msg, toolCalls: undefined } : msg
          )
        );

        const scannedAttachmentCount = countScannerAttachments(attachmentsForTurn);
        if (scannedAttachmentCount > 0 && result.ok && result.ocrMode) {
          const consumeResult = await consumeAutoScanBudget(
            tierLabel || 'free',
            scannedAttachmentCount,
            autoScanUserId
          );
          if (!consumeResult.allowed) {
            logger.info('DashOrb.autoScanBudgetRaceDetected', {
              scannedAttachmentCount,
              tier: tierLabel || 'free',
              source: 'processCommand',
            });
          }
          await refreshAutoScanBudget();
        }

        if (voiceEnabled && Platform.OS !== 'web') {
          const resolvedTTSLocale = resolveResponseLocale({
            explicitOverride: requestLanguage.locale,
            responseText: result.text,
            fallbackPreference: selectedLanguage,
          }).locale;
          const ttsLanguage = normalizeSupportedLanguage(resolvedTTSLocale) || selectedLanguage;
          if (ttsLanguage !== selectedLanguage) {
            setSelectedLanguage(ttsLanguage);
          }
          lastTTSErrorRef.current = '';
          try {
            const phonicsMode = shouldUsePhonicsMode(result.text, {
              ageYears: learnerAgeYears,
              gradeLevel: learnerGrade || null,
              schoolType: learnerContext?.schoolType || null,
              organizationType: learnerContext?.schoolType || null,
            });
            await speak(result.text, ttsLanguage, { phonicsMode });
          } catch (ttsErr) {
            console.warn('[DashOrb] TTS error (non-fatal):', ttsErr);
          }
        }
        onCommandExecuted?.(command, result.text);
      } else {
        const supabase = assertSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated.');

        const endpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-proxy`;

        const isLearnerRole = ['student', 'learner'].includes(normalizedRole);
        const ageYears = isLearnerRole
          ? (profile?.date_of_birth ? calculateAge(profile.date_of_birth) : null)
          : (normalizedRole === 'parent' ? learnerAgeYears : null);
        const streamPhonicsMode = shouldUsePhonicsMode(command, {
          ageYears: learnerAgeYears,
          gradeLevel: learnerGrade || null,
          schoolType: learnerContext?.schoolType || null,
          organizationType: learnerContext?.schoolType || null,
        });
        const aiScope = resolveAIProxyScopeFromRole(normalizedRole);
        const streamCriteriaIntent = Boolean(getCriteriaResponsePrompt(command));
        const enableToolsForStreamTurn = shouldEnableVoiceTurnTools(command, {
          hasAttachment: false,
          ocrMode: false,
          criteriaIntent: streamCriteriaIntent,
        });
        const traceId = `dash_orb_stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const streamBody: Record<string, unknown> = {
          scope: aiScope,
          service_type: 'dash_conversation',
          payload: {
            prompt: command,
            model: selectedModel,
            context: [
              history.length > 0 ? history.map(h => `${h.role}: ${h.content}`).join('\n') : null,
              memorySnapshot ? `Conversation memory snapshot: ${memorySnapshot}` : null,
              learnerName ? `Learner name: ${learnerName}.` : null,
              learnerGrade ? `Learner grade: ${learnerGrade}.` : null,
              ageYears ? `Learner age: ${ageYears}. Provide age-appropriate, child-safe guidance.` : null,
              normalizedRole ? `Role: ${normalizedRole}.` : null,
              dashPolicy.systemPromptAddendum,
            ].filter(Boolean).join('\n\n') || undefined,
          },
          stream: true,
          enable_tools: enableToolsForStreamTurn,
          metadata: {
            role: normalizedRole,
            model: selectedModel,
            source: 'dash_orb_stream',
            dash_mode: dashPolicy.defaultMode,
            response_mode: responseMode,
            language_source: languageSource,
            detected_language: requestLanguage.locale || undefined,
            stream_tool_mode: enableToolsForStreamTurn ? 'enabled' : 'deferred',
            trace_id: traceId,
          },
        };

        const MAX_TTS_BATCH_SENTENCES = 3;
        const MAX_TTS_BATCH_CHARS = 420;
        const processTTSQueue = async () => {
          if (isSpeakingSentenceRef.current) return;
          const queue = ttsSentenceQueueRef.current;
          const batch: string[] = [];
          while (queue.length > 0 && batch.length < MAX_TTS_BATCH_SENTENCES) {
            const candidate = queue[0] ?? '';
            const ifAdded = batch.length === 0 ? candidate : `${batch.join(' ')} ${candidate}`;
            if (ifAdded.length > MAX_TTS_BATCH_CHARS) break;
            batch.push(queue.shift()!);
          }
          if (batch.length === 0) return;
          const textToSpeak = batch.join(' ').trim();
          if (!textToSpeak) {
            if (queue.length > 0) processTTSQueue();
            return;
          }
          isSpeakingSentenceRef.current = true;
          try {
            const resolvedTTSLocale = resolveResponseLocale({
              explicitOverride: requestLanguage.locale,
              responseText: textToSpeak,
              fallbackPreference: selectedLanguage,
            }).locale;
            const ttsLang = normalizeSupportedLanguage(resolvedTTSLocale) || selectedLanguage;
            const pm = shouldUsePhonicsMode(textToSpeak, {
              ageYears: learnerAgeYears,
              gradeLevel: learnerGrade || null,
              schoolType: learnerContext?.schoolType || null,
              organizationType: learnerContext?.schoolType || null,
            });
            await speak(textToSpeak, ttsLang, { phonicsMode: pm });
          } catch (e) {
            console.warn('[DashOrb] Sentence TTS error:', e);
          } finally {
            isSpeakingSentenceRef.current = false;
            if (ttsSentenceQueueRef.current.length > 0) processTTSQueue();
          }
        };

        ttsSentenceQueueRef.current = [];
        isSpeakingSentenceRef.current = false;

        await new Promise<void>((resolve, reject) => {
          streamResponse(
            {
              endpoint,
              body: streamBody,
              accessToken: session.access_token,
              phonicsMode: streamPhonicsMode,
            },
            {
              onTextChunk: (_chunk, accumulated) => {
                // Update message content in real-time as chunks arrive
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === thinkingId
                      ? { ...msg, content: accumulated, isLoading: false, isStreaming: true }
                      : msg
                  )
                );
              },
              onSentenceReady: (sentence) => {
                // Queue sentence for TTS (starts speaking while AI continues)
                if (voiceEnabled && Platform.OS !== 'web') {
                  ttsSentenceQueueRef.current.push(sentence);
                  const sentenceLocale = resolveResponseLocale({
                    explicitOverride: requestLanguage.locale,
                    responseText: sentence,
                    fallbackPreference: selectedLanguage,
                  }).locale;
                  const normalizedSentenceLocale = normalizeSupportedLanguage(sentenceLocale);
                  if (normalizedSentenceLocale && normalizedSentenceLocale !== selectedLanguage) {
                    setSelectedLanguage(normalizedSentenceLocale);
                  }
                  processTTSQueue();
                }
              },
              onVisemeEvent: (evt) => {
                // Drive real viseme animation on the orb
                setSimulatedVisemeId(evt.visemeId);
              },
              onComplete: (fullText) => {
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === thinkingId
                      ? { ...msg, content: fullText, isStreaming: false, toolCalls: undefined }
                      : msg
                  )
                );
                onCommandExecuted?.(command, fullText);
                resolve();
              },
              onError: (err) => {
                reject(err);
              },
            },
          );
        });
      }

      if (isFreeImageBudgetTier && (options?.attachments?.length || 0) > 0) {
        const usedImages = (options?.attachments || []).filter((attachment) => attachment.kind === 'image').length;
        if (usedImages > 0) {
          await trackImageUsage(usedImages).catch((error) => {
            console.warn('[DashOrb] Failed to track free image usage:', error);
          });
        }
      }
    } catch (error) {
      setMessages(prev => prev.map(msg => 
        msg.id === thinkingId 
          ? { ...msg, content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, isLoading: false }
          : msg
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  const detectToolsNeeded = (command: string): ChatMessage['toolCalls'] => {
    const tools: ChatMessage['toolCalls'] = [];
    const lowerCommand = command.toLowerCase();
    
    // DevOps tools
    if (lowerCommand.includes('build') || lowerCommand.includes('eas')) {
      tools.push({ name: 'eas_trigger_build', status: 'pending' });
    }
    if (lowerCommand.includes('commit') || lowerCommand.includes('git')) {
      tools.push({ name: 'github_get_commits', status: 'pending' });
    }
    if (lowerCommand.includes('pull request') || lowerCommand.includes('pr')) {
      tools.push({ name: 'github_list_prs', status: 'pending' });
    }
    
    // Platform analytics
    if (lowerCommand.includes('stat') || lowerCommand.includes('metric') || lowerCommand.includes('analytics')) {
      tools.push({ name: 'get_platform_stats', status: 'pending' });
    }
    if (lowerCommand.includes('ai usage') || lowerCommand.includes('token')) {
      tools.push({ name: 'get_ai_usage', status: 'pending' });
    }
    if (lowerCommand.includes('report') || lowerCommand.includes('revenue')) {
      tools.push({ name: 'generate_report', status: 'pending' });
    }
    
    // User/School management
    if (lowerCommand.includes('school') || lowerCommand.includes('preschool')) {
      tools.push({ name: 'list_schools', status: 'pending' });
    }
    if (lowerCommand.includes('user') || lowerCommand.includes('principal') || lowerCommand.includes('teacher')) {
      tools.push({ name: 'list_users', status: 'pending' });
    }
    
    // Database queries
    if (lowerCommand.includes('query') || lowerCommand.includes('select') || lowerCommand.includes('count')) {
      tools.push({ name: 'query_database', status: 'pending' });
    }
    
    // Feature flags
    if (lowerCommand.includes('feature') || lowerCommand.includes('flag')) {
      tools.push({ name: 'manage_feature_flag', status: 'pending' });
    }
    
    // Announcements
    if (lowerCommand.includes('announce') || lowerCommand.includes('broadcast')) {
      tools.push({ name: 'send_announcement', status: 'pending' });
    }

    // Visual generation tools
    if (/\b(image|picture|poster|illustration|draw|visual)\b/.test(lowerCommand)) {
      tools.push({ name: 'generate_image', status: 'pending' });
    }
    // PDF-generating tools are intentionally disabled.
    
    return tools.length > 0 ? tools : [{ name: 'ai_analysis', status: 'pending' }];
  };

  const handleRunTool = async (toolName: string, params: Record<string, any>) => {
    const tool = ToolRegistry.getTool(toolName);
    const label = toolShortcuts.find((item) => item.name === toolName)?.label || toolName;

    if (!tool) {
      const errorMsg = `Tool "${toolName}" not found in allowlist.`;
      logger.warn('DashOrb.handleRunTool', { toolName, error: 'not_registered' });
      setMessages((prev) => [
        ...prev,
        { id: `tool_err_${Date.now()}`, role: 'assistant', content: errorMsg, timestamp: new Date() },
      ]);
      return;
    }

    // Age-band tool safety gate: block risky tools for minors
    const toolRisk = (tool as any)?.risk || (tool as any)?.riskLevel || 'low';
    const isMinor = ageBand !== 'adult' && ageBand !== '16-18';
    if (isMinor && (toolRisk === 'high' || toolRisk === 'medium')) {
      const blockedMsg = `This action isn't available for younger learners. Ask a parent or teacher for help.`;
      logger.info('DashOrb.toolBlocked', { toolName, ageBand, toolRisk });
      setMessages((prev) => [
        ...prev,
        { id: `tool_blocked_${Date.now()}`, role: 'assistant', content: blockedMsg, timestamp: new Date() },
      ]);
      return;
    }

    let supabaseClient: any = null;
    try {
      supabaseClient = assertSupabase();
    } catch { /* fallback to null */ }

    const traceId = `dash_orb_manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const context = {
      profile,
      user,
      supabase: supabaseClient,
      role: normalizedRole || 'parent',
      tier: (profile as any)?.tier || 'free',
      organizationId: (profile as any)?.organization_id || (profile as any)?.preschool_id || null,
      hasOrganization: Boolean((profile as any)?.organization_id || (profile as any)?.preschool_id),
      isGuest: !user?.id,
      ageBand,
      trace_id: traceId,
      tool_plan: {
        source: 'dash_orb.run_tool',
        tool: toolName,
      },
    };

    const startMs = Date.now();
    const result = await ToolRegistry.execute(toolName, params, context);
    const durationMs = Date.now() - startMs;
    const message = formatToolResultMessage(label, result);

    // Traceable tool call log
    logger.info('DashOrb.toolExecuted', {
      traceId,
      tool: toolName,
      args: params,
      success: (result as any)?.success !== false,
      durationMs,
      ageBand,
      source: 'manual',
    });

    setMessages((prev) => [
      ...prev,
      {
        id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        content: message,
        timestamp: new Date(),
      },
    ]);
  };

  const runAutoToolIfNeeded = async (userText: string) => {
    if (!shouldAttemptToolPlan(userText)) return null;
    if (plannerTools.length === 0) return null;

    let supabaseClient: any = null;
    try {
      supabaseClient = assertSupabase();
    } catch {
      return null;
    }

    const plan = await planToolCall({
      supabaseClient,
      role: normalizedRole || 'parent',
      message: userText,
      tools: plannerTools,
    });

    if (!plan?.tool) return null;
    const toolName = plan.tool;

    // Age-band tool safety gate for auto-planned tools
    if (!ToolRegistry.hasTool(toolName)) {
      logger.warn('DashOrb.autoTool.notRegistered', { toolName });
      return null;
    }
    const autoTool = ToolRegistry.getTool(toolName);
    const autoToolRisk = (autoTool as any)?.risk || (autoTool as any)?.riskLevel || 'low';
    const isMinorAuto = ageBand !== 'adult' && ageBand !== '16-18';
    if (isMinorAuto && (autoToolRisk === 'high' || autoToolRisk === 'medium')) {
      logger.info('DashOrb.autoTool.blocked', { toolName, ageBand, autoToolRisk });
      return null;
    }

    const traceId = `dash_orb_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startMs = Date.now();

    const execution = await ToolRegistry.execute(toolName, plan.parameters || {}, {
      profile,
      user,
      supabase: supabaseClient,
      role: normalizedRole || 'parent',
      tier: (profile as any)?.tier || 'free',
      organizationId: (profile as any)?.organization_id || (profile as any)?.preschool_id || null,
      hasOrganization: Boolean((profile as any)?.organization_id || (profile as any)?.preschool_id),
      isGuest: !user?.id,
      ageBand,
      trace_id: traceId,
      tool_plan: {
        source: 'dash_orb.auto_planner',
        tool: toolName,
      },
    });

    const durationMs = Date.now() - startMs;
    const label = autoToolShortcuts.find((tool) => tool.name === toolName)?.label || toolName;
    const toolMessage = formatToolResultMessage(label, execution);

    // Traceable tool call log
    logger.info('DashOrb.toolExecuted', {
      traceId,
      tool: toolName,
      args: plan.parameters,
      success: (execution as any)?.success !== false,
      durationMs,
      ageBand,
      source: 'auto_planner',
    });

    const toolChatMessage: ChatMessage = {
      id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      content: toolMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, toolChatMessage]);

    return {
      toolName,
      execution,
      toolChatMessage,
    };
  };

  /**
   * Execute command via AI Edge Function
   * Uses superadmin-ai for super admins with runtime fallback to ai-proxy.
   */
  const executeCommand = async (
    command: string,
    history: Array<{ role: string; content: string }> = [],
    attachments: DashAttachment[] = []
  ): Promise<ExecuteCommandResult> => {
    let attemptedOCRMode = false;
    try {
      const supabase = assertSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const isLearnerRole = ['student', 'learner'].includes(normalizedRole);
      const ageYears = isLearnerRole
        ? (profile?.date_of_birth ? calculateAge(profile.date_of_birth) : null)
        : (normalizedRole === 'parent' ? learnerAgeYears : null);

      const ageContext = ageYears
        ? `Learner age: ${ageYears}. Provide age-appropriate, child-safe guidance.`
        : (isLearnerRole ? 'Provide age-appropriate, child-safe guidance.' : undefined);
      const gradeContext = learnerGrade ? `Learner grade: ${learnerGrade}.` : undefined;
      const nameContext = learnerName ? `Learner name: ${learnerName}.` : undefined;
      const schoolTypeContext = learnerContext?.schoolType ? `School type: ${learnerContext.schoolType}.` : undefined;

      const roleContext = isTutorRole
        ? 'Role: Parent/Student tutor. Use diagnose → teach → practice. Start with one diagnostic question and WAIT. Ask one question at a time. Avoid teacher/admin-only sections.'
        : (normalizedRole ? `Role: ${normalizedRole}. Provide role-appropriate guidance.` : undefined);

      const lessonContext = isTutorRole
        ? 'If asked for a lesson plan, output a learner-ready mini-lesson with examples, practice, and a quick check question. Add 1-2 tips for parents to help at home.'
        : undefined;

      const traceId = `dash_orb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const explicitLanguage = detectLanguageOverrideFromText(command);
      const responseMode = classifyResponseMode({
        text: command,
        hasAttachments: attachments.length > 0,
      });
      const languageResolution = resolveResponseLocale({
        explicitOverride: explicitLanguage,
        responseText: command,
        fallbackPreference: selectedLanguage,
      });
      const languageSource = languageResolution.source || (explicitLanguage ? 'explicit_override' : 'preference');
      const superAdminEndpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/superadmin-ai`;
      const aiProxyEndpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-proxy`;
      const images = await buildImagePayloads(attachments);
      const detectedOCRTask = images.length > 0 ? detectOCRTask(command) : null;
      const ocrMode = images.length > 0 && (
        isOCRIntent(command) ||
        detectedOCRTask !== null ||
        isShortOrAttachmentOnlyPrompt(command)
      );
      attemptedOCRMode = ocrMode;
      const ocrTask = detectedOCRTask || 'document';
      const attachmentContext = attachments.length > 0
        ? [
            'ATTACHMENTS:',
            ...attachments.map((attachment) => {
              const sizeLabel = typeof attachment.size === 'number' && attachment.size > 0
                ? ` (${Math.round(attachment.size / 1024)} KB)`
                : '';
              return `- ${attachment.name || 'Attachment'} [${attachment.kind || 'file'}]${sizeLabel}`;
            }),
          ].join('\n')
        : null;
      const criteriaContext = getCriteriaResponsePrompt(command);
      const ocrContext = ocrMode ? getOCRPromptForTask(ocrTask) : null;
      const aiScope = resolveAIProxyScopeFromRole(normalizedRole);
      const enableToolsForTurn = shouldEnableVoiceTurnTools(command, {
        hasAttachment: images.length > 0,
        ocrMode,
        criteriaIntent: Boolean(criteriaContext),
      });

      const aiProxyBody = {
        scope: aiScope,
        service_type: ocrMode ? 'image_analysis' : 'dash_conversation',
        payload: {
          prompt: command,
          model: selectedModel,
          images: images.length > 0 ? images : undefined,
          ocr_mode: ocrMode || undefined,
          ocr_task: ocrMode ? ocrTask : undefined,
          ocr_response_format: ocrMode ? 'json' : undefined,
          context: [
            history.length > 0 ? history.map((h) => `${h.role}: ${h.content}`).join('\n') : null,
            memorySnapshot ? `Conversation memory snapshot: ${memorySnapshot}` : null,
            attachmentContext,
            criteriaContext,
            ocrContext,
            nameContext,
            gradeContext,
            schoolTypeContext,
            ageContext,
            roleContext,
            lessonContext,
            dashPolicy.systemPromptAddendum,
          ].filter(Boolean).join('\n\n') || undefined,
        },
        stream: false,
        enable_tools: enableToolsForTurn,
        metadata: {
          role: normalizedRole,
          model: selectedModel,
          source: 'dash_orb',
          dash_mode: dashPolicy.defaultMode,
          response_mode: responseMode,
          language_source: languageSource,
          detected_language: languageResolution.locale || undefined,
          age_years: ageYears ?? undefined,
          has_image: images.length > 0,
          attachment_count: attachments.length,
          ocr_mode: ocrMode,
          ocr_task: ocrMode ? ocrTask : undefined,
          stream_tool_mode: enableToolsForTurn ? 'enabled' : 'deferred',
          trace_id: traceId,
          tool_plan: {
            source: 'dash_orb.executeCommand',
            history_count: history.length,
          },
        },
      };

      const superAdminBody = {
        action: 'chat',
        message: command,
        history,
        max_tokens: 1024,
      };

      const toReadableOCRText = (raw: string): string | null => {
        const value = String(raw || '').trim();
        if (!value.startsWith('{')) return null;
        try {
          const parsed = JSON.parse(value) as {
            extracted_text?: string;
            analysis?: string;
            confidence?: number;
            document_type?: string;
          };
          if (!parsed || typeof parsed !== 'object') return null;
          const analysis = typeof parsed.analysis === 'string' ? parsed.analysis.trim() : '';
          const extracted = typeof parsed.extracted_text === 'string' ? parsed.extracted_text.trim() : '';
          if (!analysis && !extracted) return null;
          const confidencePct = typeof parsed.confidence === 'number'
            ? `\n\nConfidence: ${Math.round(parsed.confidence * 100)}%`
            : '';
          const documentType = typeof parsed.document_type === 'string'
            ? `Document type: ${parsed.document_type}`
            : '';
          const extractedBlock = extracted
            ? `\n\nExtracted text:\n${extracted}`
            : '';
          return [analysis || documentType, documentType && analysis ? '' : null, extractedBlock, confidencePct]
            .filter(Boolean)
            .join('');
        } catch {
          return null;
        }
      };

      const parseAiProxyResponse = (data: any): string => {
        if (typeof data?.ocr?.analysis === 'string') return data.ocr.analysis;
        if (typeof data?.content === 'string') {
          return toReadableOCRText(data.content) || data.content;
        }
        if (Array.isArray(data?.content) && data.content[0]?.text) return data.content[0].text;
        if (typeof data?.message?.content === 'string') return data.message.content;
        if (typeof data?.text === 'string') return data.text;
        if (typeof data?.response === 'string') return data.response;
        if (data?.success && data?.content) return typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
        console.warn('[DashOrb] Unknown ai-proxy response format:', Object.keys(data || {}));
        return 'I received your message but could not parse the response.';
      };

      const isFallbackWorthy = (status: number, message: string): boolean => {
        const lower = message.toLowerCase();
        return (
          status === 404 ||
          status === 502 ||
          status === 503 ||
          lower.includes('function not found') ||
          lower.includes('superadmin-ai') ||
          lower.includes('not deployed')
        );
      };

      const invoke = async (
        endpoint: string,
        body: Record<string, unknown>
      ): Promise<{ ok: boolean; status: number; data: any }> => {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        });

        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, status: response.status, data };
      };

      const forceAiProxy = ocrMode || images.length > 0;
      let mode: 'superadmin' | 'ai_proxy' = isUserSuperAdmin && !forceAiProxy ? 'superadmin' : 'ai_proxy';
      let response = await invoke(
        mode === 'superadmin' ? superAdminEndpoint : aiProxyEndpoint,
        mode === 'superadmin' ? superAdminBody : aiProxyBody
      );

      if (!response.ok && mode === 'superadmin') {
        const message = String(response.data?.error || response.data?.message || `Request failed: ${response.status}`);
        if (isFallbackWorthy(response.status, message)) {
          console.warn('[DashOrb] superadmin-ai unavailable, falling back to ai-proxy', {
            status: response.status,
            message,
          });
          mode = 'ai_proxy';
          response = await invoke(aiProxyEndpoint, aiProxyBody);
        }
      }

      if (!response.ok) {
        const rawError = response.data?.error || response.data?.message || `Request failed: ${response.status}`;
        console.warn('[DashOrb] AI error payload:', response.data);
        if (typeof rawError === 'string' && rawError.toLowerCase().includes('ai_proxy_error')) {
          throw new Error('AI service is temporarily unavailable. Please try again shortly.');
        }
        throw new Error(rawError);
      }

      console.log('[DashOrb] AI Response data:', JSON.stringify(response.data, null, 2).substring(0, 500));

      if (mode === 'superadmin') {
        if (!response.data?.success) {
          const fallbackError = String(response.data?.error || response.data?.message || 'Unknown error occurred');
          if (isFallbackWorthy(200, fallbackError)) {
            const fallback = await invoke(aiProxyEndpoint, aiProxyBody);
            if (!fallback.ok) {
              throw new Error(fallback.data?.error || fallback.data?.message || 'Fallback ai-proxy request failed');
            }
            return {
              text: parseAiProxyResponse(fallback.data),
              ok: true,
              ocrMode,
            };
          }
          throw new Error(fallbackError);
        }

        let formattedResponse = String(response.data?.response || '');
        // Keep token/tool telemetry out of the conversational response body.
        // It creates noisy UX and gets read aloud by TTS.
        return {
          text: formattedResponse,
          ok: true,
          ocrMode: false,
        };
      }

      return {
        text: parseAiProxyResponse(response.data),
        ok: true,
        ocrMode,
      };
      
    } catch (error) {
      console.error('[DashOrb] Command execution error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('Not authenticated')) {
        return {
          text: '⚠️ **Authentication Required**\n\nPlease log out and log back in to refresh your session.',
          ok: false,
          ocrMode: attemptedOCRMode,
        };
      }
      
      if (errorMessage.includes('Super admin')) {
        return {
          text: '🔒 **Access Denied**\n\nThis feature requires Super Admin privileges.',
          ok: false,
          ocrMode: attemptedOCRMode,
        };
      }
      
      if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
        return {
          text: '📊 **AI Quota Exceeded**\n\nYou\'ve reached your AI usage limit. Please try again later or upgrade your subscription.',
          ok: false,
          ocrMode: attemptedOCRMode,
        };
      }
      
      if (errorMessage.includes('ANTHROPIC_API_KEY')) {
        return {
          text: '⚙️ **Configuration Required**\n\nThe AI service is not configured. Please contact support.',
          ok: false,
          ocrMode: attemptedOCRMode,
        };
      }
      
      return {
        text: `❌ **Error**\n\n${errorMessage}\n\nPlease try again or contact support if the issue persists.`,
        ok: false,
        ocrMode: attemptedOCRMode,
      };
    }
  };

  const isTutorRole = ['parent', 'student', 'learner'].includes(normalizedRole);

  const buildTutorPrompt = (basePrompt: string, options?: { topicHint?: string | null; requireDetails?: boolean }) => {
    const ageYears = ['student', 'learner'].includes(normalizedRole)
      ? (profile?.date_of_birth ? calculateAge(profile.date_of_birth) : null)
      : learnerAgeYears;
    const autoAgeGroup = quickActionAge === 'auto' ? resolveAgeGroupFromYears(ageYears) : null;
    const effectiveAgeGroup = quickActionAge === 'auto' ? (autoAgeGroup || 'auto') : quickActionAge;

    const ageLabel = effectiveAgeGroup === 'adult'
      ? 'adult learners'
      : effectiveAgeGroup !== 'auto'
        ? `ages ${effectiveAgeGroup}`
        : (ageYears ? `age ${ageYears}` : '');
    const gradeBand = effectiveAgeGroup !== 'auto' ? resolveGradeBand(effectiveAgeGroup) : null;
    const learnerHint = gradeBand
      ? `${gradeBand}${ageLabel ? ` (${ageLabel})` : ''}`
      : (ageLabel || '');

    const roleDirective = isTutorRole
      ? 'Audience: parent/student. Use tutoring mode. Avoid teacher/admin-only sections. If generating a lesson, make it learner-ready with examples and practice plus 2 parent tips.'
      : normalizedRole
        ? `Audience: ${normalizedRole}. Provide role-appropriate guidance.`
        : 'Audience: general.';

    const interactionRules = isTutorRole
      ? 'Diagnose → Teach → Practice loop. Start with ONE short diagnostic question and WAIT. Ask one question at a time; do not proceed until the learner answers.'
      : 'Be concise and practical. Ask 1–2 clarifying questions if needed.';

    const detailRule = options?.requireDetails
      ? 'If topic or grade is missing, ask: "Which grade and topic should I use?" and wait.'
      : '';

    return [
      'Start a NEW topic and ignore earlier context.',
      basePrompt,
      roleDirective,
      learnerHint ? `Learner profile: ${learnerHint}.` : '',
      learnerGrade ? `Learner grade: ${learnerGrade}.` : '',
      options?.topicHint ? `Topic: ${options.topicHint}.` : '',
      interactionRules,
      detailRule,
    ].filter(Boolean).join(' ');
  };

  const handleQuickAction = (action: QuickAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const customHint = quickActionPrompt.trim();
    const tutorBasePrompt = isTutorRole ? (() => {
      switch (action.id) {
        case 'gen-lesson':
          return 'Create a learner-friendly mini lesson (not a teacher lesson plan).';
        case 'gen-stem':
          return 'Design a hands-on STEM activity a parent/student can do at home.';
        case 'gen-curriculum':
          return 'Create a 4-week learning path for a learner with weekly goals and simple activities.';
        case 'gen-worksheet':
          return 'Create a short student worksheet with worked examples and answers.';
        case 'gen-digital':
          return 'Create a digital skills mini lesson for a learner.';
        default:
          return action.command;
      }
    })() : action.command;

    const topicHint = customHint || (!isTutorRole ? action.defaultTopic : null);
    const needsDetails = isTutorRole && !customHint;

    if (action.category === 'education' && needsDetails) {
      setPendingTutorIntent({ prompt: tutorBasePrompt, label: action.label });
      setShowQuickActions(false);
      setMessages(prev => [...prev, {
        id: `clarify-${Date.now()}`,
        role: 'assistant',
        content: 'Great — which grade and topic should I use?',
        timestamp: new Date(),
      }]);
      return;
    }

    const enhancedCommand = action.category === 'education'
      ? buildTutorPrompt(tutorBasePrompt, {
          topicHint: topicHint || undefined,
          requireDetails: false,
        })
      : [
          'Start a NEW topic and ignore earlier context.',
          action.command,
          customHint ? `Additional details: ${customHint}` : '',
        ].filter(Boolean).join(' ');

    processCommand(enhancedCommand, `${action.label}${customHint ? ` · ${customHint}` : ''}`);
  };

  return (
    <>
      {/* Floating Orb Button */}
      {!hideButton && (
        <Animated.View
          style={[
            styles.orbContainer,
            {
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { scale: pulseAnim }
              ],
              // Remove fixed positioning as we use transform
              bottom: undefined,
              right: undefined,
              left: undefined,
              top: undefined,
            },
          ]}
          {...panResponder.panHandlers}
        >
          {locked && (
            <Animated.View
              pointerEvents={showUpgradeBubble ? 'auto' : 'none'}
              style={[
                styles.upgradeBubble,
                position.includes('right')
                  ? { right: size + 14 }
                  : { left: size + 14 },
                { top: size * 0.12 },
                {
                  opacity: upgradeAnim,
                  transform: [
                    {
                      translateX: upgradeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: position.includes('right') ? [12, 0] : [-12, 0],
                      }),
                    },
                    {
                      scale: upgradeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.upgradeBubbleTitle}>
                {lockedTitle || 'Dash Orb Locked'}
              </Text>
              <Text style={styles.upgradeBubbleText}>
                {lockedMessage || 'Upgrade to Parent Plus to unlock the Dash Orb.'}
              </Text>
              <View style={styles.upgradeBubbleActions}>
                <TouchableOpacity
                  style={styles.upgradeButton}
                  onPress={() => {
                    if (upgradeTimerRef.current) {
                      clearTimeout(upgradeTimerRef.current);
                      upgradeTimerRef.current = null;
                    }
                    setShowUpgradeBubble(false);
                    Animated.timing(upgradeAnim, {
                      toValue: 0,
                      duration: 160,
                      useNativeDriver: true,
                    }).start();
                    if (onUpgradePress) {
                      onUpgradePress();
                    } else {
                      router.push('/screens/subscription-setup');
                    }
                  }}
                >
                  <Text style={styles.upgradeButtonText}>
                    {lockedCtaLabel || 'Upgrade'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
          <TouchableOpacity
            onPress={handleOrbPress}
            activeOpacity={0.9}
            style={{ width: size, height: size }}
          >
            <CosmicOrb
              size={size}
              isProcessing={orbState === 'thinking' || orbState === 'listening'}
              isSpeaking={orbState === 'speaking'}
            />
            
            {/* Center icon */}
            <View
              style={{
                position: 'absolute',
                width: size,
                height: size,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons 
                name={isSpeaking && isMicMuted ? 'mic-off' : isSpeaking ? 'mic' : isProcessing ? 'sync' : 'sparkles'} 
                size={size * 0.35} 
                color={isSpeaking && isMicMuted ? '#ef4444' : '#ffffff'} 
              />
            </View>
            {locked && (
              <View
                style={[
                  styles.lockBadge,
                  {
                    width: size * 0.32,
                    height: size * 0.32,
                    borderRadius: size * 0.16,
                  },
                ]}
              >
                <Ionicons name="lock-closed" size={size * 0.18} color="#ffffff" />
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Expanded Chat Modal */}
      <ChatModal
        visible={isExpanded}
        onClose={() => {
          setIsExpanded(false);
          if (hideButton) {
            router.back();
          }
        }}
        messages={messages}
        inputText={inputText}
        setInputText={setInputText}
        onSend={handleSend}
        isProcessing={isProcessing}
        showQuickActions={showQuickActions}
        onQuickAction={handleQuickAction}
        quickActionAge={quickActionAge}
        onQuickActionAgeChange={setQuickActionAge}
        quickActionPrompt={quickActionPrompt}
        onQuickActionPromptChange={setQuickActionPrompt}
        onSendPrompt={(prompt, label) => {
          const customHint = quickActionPrompt.trim();
          const needsDetails = isTutorRole && !customHint;
          if (needsDetails) {
            setPendingTutorIntent({ prompt, label });
            setShowQuickActions(false);
            setMessages(prev => [...prev, {
              id: `clarify-${Date.now()}`,
              role: 'assistant',
              content: 'Great — which grade and topic should I use?',
              timestamp: new Date(),
            }]);
            return;
          }
          const enhanced = buildTutorPrompt(prompt, {
            topicHint: customHint || undefined,
            requireDetails: false,
          });
          processCommand(enhanced, label || customHint || 'Quick action');
        }}
        onBackToQuickActions={() => {
          setShowQuickActions(prev => !prev);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        isSpeaking={isSpeaking}
        isMicMuted={isMicMuted}
        voiceEnabled={voiceEnabled}
        whisperModeEnabled={whisperModeEnabled}
        onToggleWhisperMode={() => {
          setWhisperModeEnabled((prev) => !prev);
          shouldRestartListeningRef.current = false;
        }}
        onToggleVoice={() => {
          setVoiceEnabled(!voiceEnabled);
          if (isSpeaking) stopSpeaking();
        }}
        isListeningForCommand={isListeningForCommand}
        onMicPress={handleMicPress}
        onStopActivity={handleStopActivity}
        wakeWordEnabled={wakeWordEnabled}
        onToggleWakeWord={() => {
          if (!wakeWordEnabled && !wakeWordAvailable) {
            setMessages(prev => [...prev, {
              id: `wakeword-unavailable-${Date.now()}`,
              role: 'system',
              content: 'Wake word requires a Picovoice access key. Add EXPO_PUBLIC_PICOVOICE_ACCESS_KEY to enable "Hey Dash".',
              timestamp: new Date(),
            }]);
            return;
          }
          const newState = !wakeWordEnabled;
          setWakeWordEnabled(newState);
          if (newState) {
            wakeWord.startListening();
          } else {
            wakeWord.stopListening();
          }
        }}
        onOpenSettings={() => router.push('/screens/dash-ai-settings' as any)}
        models={modelPickerModels}
        selectedModelId={selectedModel}
        canSelectModel={canSelectOrbModel}
        onSelectModel={(modelId) => setSelectedModel(modelId)}
        onLockedModelPress={() => { router.push('/screens/subscription-setup?reason=model_selection&source=dash_orb' as any); }}
        onOpenTools={toolShortcuts.length > 0 ? () => setShowToolsModal(true) : undefined}
        onAttachFile={handleOrbAttach}
        onTakePhoto={handleOrbCamera}
        attachmentCount={pendingAttachments.length}
        quickIntents={quickIntents}
        onQuickIntent={handleQuickIntent}
        memorySnapshot={memorySnapshot}
        inlineReplyEnabled={isTutorRole}
        onCopyMessage={async (message) => {
          try {
            const content = message.content || '';
            if (Clipboard?.setStringAsync) {
              await Clipboard.setStringAsync(content);
            } else if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
              await (navigator as any).clipboard.writeText(content);
            }
            toast.success('Copied to clipboard');
          } catch (err) {
            console.warn('[DashOrb] Copy failed:', err);
            toast.error('Copy failed');
          }
        }}
        onShareMessage={async (message) => {
          try {
            await Share.share({ message: message.content || '' });
          } catch (err) {
            console.warn('[DashOrb] Share failed:', err);
          }
        }}
        onEditMessage={(message) => {
          if (isProcessing) return;
          if (message.role !== 'user') return;
          setInputText(message.content);
          setIsEditing(true);
          setEditingMessageId(message.id);
          setShowQuickActions(false);
        }}
        onRegenerateMessage={(message) => {
          if (isProcessing) return;
          const targetIndex = messages.findIndex((m) => m.id === message.id);
          if (targetIndex === -1) return;
          let userIndex = -1;
          for (let i = targetIndex; i >= 0; i -= 1) {
            if (messages[i].role === 'user') {
              userIndex = i;
              break;
            }
          }
          if (userIndex === -1) return;
          const lastUserMessage = messages[userIndex];
          const baseMessages = messages.slice(0, userIndex + 1);
          const historyOverride = messages.slice(0, userIndex)
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role, content: m.content }));
          processCommand(lastUserMessage.content, undefined, {
            baseMessages,
            historyOverride,
            skipUserMessage: true,
          });
        }}
        onFeedback={(message, rating) => {
          toast.success(rating === 'up' ? 'Thanks for the feedback!' : 'Feedback noted.');
        }}
        onNewChat={async () => {
          setMessages([]);
          setShowQuickActions(true);
          setInputText('');
          setIsEditing(false);
          setEditingMessageId(null);
          if (AsyncStorage) {
      try { await AsyncStorage.removeItem(chatStorageKey); } catch { /* best-effort */ }
          }
        }}
        onExportChat={async () => {
          const transcript = messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => `${m.role === 'user' ? 'You' : 'Dash'}: ${m.content}`)
            .join('\n\n');
          try {
            await Share.share({ message: transcript || 'No messages yet.' });
          } catch (err) {
            console.warn('[DashOrb] Export failed:', err);
          }
        }}
        onOpenHistory={() => router.push('/screens/dash-conversations-history' as any)}
        onContinueFullChat={() => {
          setIsExpanded(false);
          const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
          router.push({
            pathname: '/screens/dash-assistant',
            params: {
              source: 'orb',
              resumePrompt: lastUserMsg?.content || '',
            },
          } as any);
        }}
        isEditing={isEditing}
        onCancelEdit={() => {
          setIsEditing(false);
          setEditingMessageId(null);
        }}
      />
      <HomeworkScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanned={handleScannerScanned}
        title="Scan Homework"
        tier={tierLabel || 'free'}
        remainingScans={remainingAutoScans}
        userId={autoScanUserId}
      />
      <DashToolsModal
        visible={showToolsModal}
        onClose={() => setShowToolsModal(false)}
        tools={toolShortcuts}
        getToolSchema={(toolName) => ToolRegistry.getTool(toolName)?.parameters}
        onRunTool={handleRunTool}
      />
    </>
  );
}
