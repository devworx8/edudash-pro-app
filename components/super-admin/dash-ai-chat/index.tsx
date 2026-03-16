/**
 * DashAIChat - ChatGPT-Style AI Assistant Interface
 * 
 * A full-screen chat interface with:
 * - Clean message bubbles with proper markdown rendering
 * - Voice Orb for speech input/output (like ChatGPT voice mode)
 * - Azure Speech Services integration for TTS/STT
 * - Smooth animations and professional design
 * - Persistent conversation history via AsyncStorage
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Share,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '../../../lib/supabase';
import { router } from 'expo-router';
import { styles } from './DashAIChat.styles';
import { ChatMessage, ChatMessageData } from './ChatMessage';
import { ChatInput } from './ChatInput';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DASH_WELCOME_MESSAGE, TOOL_MESSAGES } from '../../../lib/ai/constants';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as Clipboard from 'expo-clipboard';
import { toast } from '@/components/ui/ToastProvider';
import { normalizeForTTS } from '@/lib/dash-ai/ttsNormalize';
import { detectOCRTask, getOCRPromptForTask, isOCRIntent } from '@/lib/dash-ai/ocrPrompts';

// Storage keys
const CHAT_HISTORY_KEY = '@dash_ai_chat_history';
const MAX_STORED_MESSAGES = 50; // Limit to prevent storage bloat

// Conditional import for VoiceOrb
const isWeb = Platform.OS === 'web';
let VoiceOrb: React.ForwardRefExoticComponent<any> | null = null;

if (!isWeb) {
  // Only import on native platforms - use new refactored voice-orb module
  const voiceOrbModule = require('../voice-orb');
  VoiceOrb = voiceOrbModule.VoiceOrb;
}

// Import VoiceOrbRef type for the ref
type VoiceOrbRefType = {
  speakText: (text: string) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  isSpeaking: boolean;
};

interface DashAIChatProps {
  /** Initial system context for the AI */
  systemContext?: string;
  /** Callback when chat is closed */
  onClose?: () => void;
  /** Show as modal or full screen */
  mode?: 'modal' | 'screen';
}

function parseAiProxyAssistantText(data: any): string {
  const content = typeof data?.content === 'string'
    ? data.content
    : Array.isArray(data?.content) && data.content[0]?.text
      ? data.content[0].text
      : typeof data?.message?.content === 'string'
        ? data.message.content
        : typeof data?.response === 'string'
          ? data.response
          : '';

  if (typeof data?.ocr?.analysis === 'string' && data.ocr.analysis.trim()) {
    return data.ocr.analysis.trim();
  }

  const normalized = String(content || '').trim();
  if (!normalized.startsWith('{')) return normalized;

  try {
    const parsed = JSON.parse(normalized) as {
      analysis?: string;
      extracted_text?: string;
      confidence?: number;
    };
    if (!parsed || typeof parsed !== 'object') return normalized;
    const analysis = typeof parsed.analysis === 'string' ? parsed.analysis.trim() : '';
    const extracted = typeof parsed.extracted_text === 'string' ? parsed.extracted_text.trim() : '';
    const confidence = typeof parsed.confidence === 'number'
      ? `\n\nConfidence: ${Math.round(parsed.confidence * 100)}%`
      : '';
    if (!analysis && !extracted) return normalized;
    const extractedBlock = extracted ? `\n\nExtracted text:\n${extracted}` : '';
    return `${analysis || 'OCR complete.'}${extractedBlock}${confidence}`.trim();
  } catch {
    return normalized;
  }
}

export default function DashAIChat({ 
  systemContext,
  onClose,
  mode = 'screen' 
}: DashAIChatProps) {
  const { theme } = useTheme();
  
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const listRef = useRef<FlashListRef<ChatMessageData> | null>(null);
  const voiceOrbRef = useRef<VoiceOrbRefType>(null);
  const isVoiceModeRef = useRef(false);
  const actionDebounceRef = useRef<Record<string, number>>({});
  /** Tracks whether the user has manually scrolled away from the bottom */
  const isNearBottomRef = useRef(true);
  /** Promise for the currently playing TTS utterance (fire-and-forget first sentence during streaming) */
  const activeTTSPromiseRef = useRef<Promise<void> | null>(null);

  // Welcome message content
  const welcomeMessage: ChatMessageData = {
    id: 'welcome',
    role: 'assistant',
    content: DASH_WELCOME_MESSAGE,
    timestamp: new Date(),
  };

  // Load conversation history from AsyncStorage on mount
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const stored = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ChatMessageData[];
          // Convert timestamp strings back to Date objects
          const messagesWithDates = parsed.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }));
          console.log('[DashAIChat] Loaded', messagesWithDates.length, 'messages from storage');
          
          // If history exists but doesn't start with welcome, prepend it
          if (messagesWithDates.length > 0 && messagesWithDates[0].id !== 'welcome') {
            console.log('[DashAIChat] Continuing previous conversation');
            setMessages(messagesWithDates);
          } else if (messagesWithDates.length === 0) {
            // Empty history, show welcome
            setMessages([welcomeMessage]);
          } else {
            // Already has welcome, use as-is
            setMessages(messagesWithDates);
          }
        } else {
          // No history, show welcome message
          setMessages([welcomeMessage]);
        }
      } catch (error) {
        console.error('[DashAIChat] Failed to load chat history:', error);
        setMessages([welcomeMessage]);
      } finally {
        setIsLoaded(true);
      }
    };
    
    loadChatHistory();
  }, []);

  // Save conversation history to AsyncStorage when messages change
  useEffect(() => {
    if (!isLoaded || messages.length === 0) return;
    
    const saveChatHistory = async () => {
      try {
        // Only save last N messages to prevent storage bloat
        const messagesToSave = messages.slice(-MAX_STORED_MESSAGES);
        await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messagesToSave));
        console.log('[DashAIChat] Saved', messagesToSave.length, 'messages to storage');
      } catch (error) {
        console.error('[DashAIChat] Failed to save chat history:', error);
      }
    };
    
    saveChatHistory();
  }, [messages, isLoaded]);

  // Clear chat and reset to welcome message
  const clearChat = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(CHAT_HISTORY_KEY);
      setMessages([welcomeMessage]);
      console.log('[DashAIChat] Chat history cleared');
    } catch (error) {
      console.error('[DashAIChat] Failed to clear chat history:', error);
    }
  }, []);

  // Keep ref in sync with state for use in async functions
  useEffect(() => {
    isVoiceModeRef.current = isVoiceMode;
    console.log('[DashAIChat] Voice mode changed:', isVoiceMode);
  }, [isVoiceMode]);

  // Auto-scroll to bottom on new messages — only if user hasn't scrolled up
  useEffect(() => {
    if (!isNearBottomRef.current) return;
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  /** Track user scroll position to avoid fighting manual scroll-up */
  const handleScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    isNearBottomRef.current = distanceFromBottom < 150;
  }, []);

  /**
   * Send message to the superadmin-ai Edge Function
   * WITH STREAMING for faster voice responses
   */
  const sendMessage = async (text: string) => {
    if (!text.trim() || isProcessing) return;

    const userMessage: ChatMessageData = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);

    // Add placeholder for assistant response with loading indicator
    const assistantId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: TOOL_MESSAGES.FETCHING, // Show loading message
      timestamp: new Date(),
      isStreaming: true,
    }]);

    // Prepare history from previous messages (limit to last 10 for speed)
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10) // Only last 10 messages for faster response
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const supabase = assertSupabase();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Please log in to continue');
      }

      // Use streaming for voice mode, regular for text.
      const detectedOCRTask = detectOCRTask(text.trim());
      const ocrMode = isOCRIntent(text.trim()) || detectedOCRTask !== null;
      const useStreaming = isVoiceModeRef.current && !ocrMode;

      if (useStreaming) {
        // STREAMING MODE - for natural conversation
        await sendMessageStreaming(text.trim(), history, assistantId, session.access_token);
      } else {
        // REGULAR MODE - wait for full response
        await sendMessageRegular(text.trim(), history, assistantId, session.access_token, {
          ocrMode,
          ocrTask: detectedOCRTask || 'document',
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      
      setMessages(prev => prev.map(msg =>
        msg.id === assistantId
          ? {
              ...msg,
              content: `❌ **Error:** ${errorMessage}\n\nPlease try again.`,
              isStreaming: false,
            }
          : msg
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Regular non-streaming message send
   */
  const sendMessageRegular = async (
    text: string,
    history: any[],
    assistantId: string,
    token: string,
    options?: {
      ocrMode?: boolean;
      ocrTask?: 'homework' | 'document' | 'handwriting';
    }
  ) => {
    // Show "thinking" state
    setMessages(prev => prev.map(msg =>
      msg.id === assistantId
        ? { ...msg, content: '🤔 Thinking...', isStreaming: true }
        : msg
    ));

    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const superAdminEndpoint = `${baseUrl}/functions/v1/superadmin-ai`;
    const aiProxyEndpoint = `${baseUrl}/functions/v1/ai-proxy`;
    const traceId = `dash_ai_chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ocrMode = options?.ocrMode === true;
    const ocrTask = options?.ocrTask || 'document';

    let mode: 'superadmin' | 'ai_proxy' = ocrMode ? 'ai_proxy' : 'superadmin';
    let data: any = null;

    if (mode === 'superadmin') {
      const response = await fetch(superAdminEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'chat',
          message: text,
          history: history,
          max_tokens: 800,
        }),
      });

      data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        const errMsg = String(data?.error || data?.message || `Request failed: ${response.status}`);
        const lower = errMsg.toLowerCase();
        const fallback = response.status === 404 || response.status === 502 || response.status === 503
          || lower.includes('function not found')
          || lower.includes('superadmin-ai')
          || lower.includes('not deployed');
        if (!fallback) {
          throw new Error(errMsg);
        }
        mode = 'ai_proxy';
      }
    }

    if (mode === 'ai_proxy') {
      const aiResponse = await fetch(aiProxyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          scope: 'admin',
          service_type: ocrMode ? 'image_analysis' : 'chat_message',
          payload: {
            prompt: text,
            context: ocrMode ? getOCRPromptForTask(ocrTask) : undefined,
            messages: history,
            ocr_mode: ocrMode || undefined,
            ocr_task: ocrMode ? ocrTask : undefined,
            ocr_response_format: ocrMode ? 'json' : undefined,
          },
          stream: false,
          enable_tools: true,
          metadata: {
            role: 'super_admin',
            source: 'super_admin_dash_ai_chat',
            trace_id: traceId,
            ocr_mode: ocrMode,
            ocr_task: ocrMode ? ocrTask : undefined,
          },
        }),
      });

      data = await aiResponse.json().catch(() => ({}));
      if (!aiResponse.ok) {
        throw new Error(String(data?.error || data?.message || `Request failed: ${aiResponse.status}`));
      }
    }

    // If tool calls were made, log but don't speak them
    if (data.tool_calls && data.tool_calls.length > 0) {
      const toolNames = data.tool_calls.map((t: any) => t.name).join(', ');
      console.log('[DashAIChat] Tools used:', toolNames);
      // Don't add tool info to response text - it will be filtered by TTS preprocessing
    }

    // Update with actual response
    setMessages(prev => prev.map(msg =>
      msg.id === assistantId
        ? {
            ...msg,
            content: mode === 'superadmin'
              ? String(data.response || '')
              : parseAiProxyAssistantText(data),
            isStreaming: false,
            toolsUsed: data.tool_calls?.map((t: any) => t.name),
          }
        : msg
    ));

    // If in voice mode, speak the response (use ref to get latest value)
    const responseText = mode === 'superadmin'
      ? String(data.response || '')
      : parseAiProxyAssistantText(data);
    console.log('[DashAIChat] Checking TTS - isVoiceModeRef:', isVoiceModeRef.current, 'hasResponse:', !!responseText);
    if (isVoiceModeRef.current && responseText) {
      console.log('[DashAIChat] Triggering TTS for response');
      speakResponse(responseText);
    }
  };

  /**
   * Streaming message send with progressive TTS
   * Starts speaking as soon as first sentence arrives
   */
  const sendMessageStreaming = async (text: string, history: any[], assistantId: string, token: string) => {
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/superadmin-ai`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'chat',
          message: text,
          history: history,
          stream: true, // Request streaming
          max_tokens: 1200, // Balanced: long enough for thorough answers, fast enough for voice
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = String(errorData?.error || errorData?.message || `Request failed: ${response.status}`);
      const lower = message.toLowerCase();
      const fallback = response.status === 404 || response.status === 502 || response.status === 503
        || lower.includes('function not found')
        || lower.includes('superadmin-ai')
        || lower.includes('not deployed');
      if (fallback) {
        await sendMessageRegular(text, history, assistantId, token);
        return;
      }
      throw new Error(message);
    }

    // Check if streaming is supported
    if (!response.body) {
      // Fallback to regular if no streaming
      const data = await response.json();
      setMessages(prev => prev.map(msg =>
        msg.id === assistantId
          ? { ...msg, content: data.response, isStreaming: false }
          : msg
      ));
      if (data.response) speakResponse(data.response);
      return;
    }

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let sentenceBuffer = '';
    let hasStartedSpeaking = false;
    let sseCarry = '';

    try {
      const handleStreamData = (rawData: string) => {
        if (!rawData || rawData === '[DONE]') return;

        try {
          const parsed = JSON.parse(rawData);
          const content = parsed.delta || parsed.content || '';

          // Check if AI is using a tool
          if (parsed.type === 'tool_use' || parsed.tool_name) {
            const toolName = parsed.tool_name || parsed.name || 'a tool';
            console.log('[DashAIChat] AI using tool:', toolName);
            setMessages(prev => prev.map(msg =>
              msg.id === assistantId
                ? { ...msg, content: `🔍 Searching (${toolName})...`, isStreaming: true }
                : msg
            ));
            return;
          }

          fullResponse += content;
          sentenceBuffer += content;

          // Update message progressively
          setMessages(prev => prev.map(msg =>
            msg.id === assistantId
              ? { ...msg, content: fullResponse, isStreaming: true }
              : msg
          ));

          // Check if we have a complete sentence for TTS — speak first sentence early for fast audio start
          const sentenceEnd = /[.!?]\s/.test(sentenceBuffer);
          if (sentenceEnd && sentenceBuffer.trim().length > 20 && !hasStartedSpeaking) {
            const firstSentence = sentenceBuffer.trim();
            console.log('[DashAIChat] Starting TTS with first sentence:', firstSentence.substring(0, 50) + '...');
            // Fire-and-forget but save promise so we can await before speaking remainder
            activeTTSPromiseRef.current = speakResponse(firstSentence);
            hasStartedSpeaking = true;
            sentenceBuffer = '';
          }
        } catch {
          // Ignore non-JSON or partial lines
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseCarry += decoder.decode(value, { stream: true });
        const lines = sseCarry.split('\n');
        sseCarry = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) {
            continue;
          }
          handleStreamData(trimmed.slice(5).trim());
        }
      }

      const tail = sseCarry.trim();
      if (tail.startsWith('data:')) {
        handleStreamData(tail.slice(5).trim());
      }

      // Mark as complete
      setMessages(prev => prev.map(msg =>
        msg.id === assistantId
          ? { ...msg, content: fullResponse, isStreaming: false }
          : msg
      ));

      // Speak remaining text that accumulated after the first sentence.
      // Fire-and-forget — do NOT await here. Blocking sendMessageStreaming on TTS
      // keeps isProcessing=true while audio plays, which prevents the user from
      // typing and blocks the VoiceOrb from restarting its listen session.
      if (!hasStartedSpeaking && fullResponse.trim()) {
        // Short response: no sentence boundary was hit — speak it all now
        console.log('[DashAIChat] Speaking complete response');
        speakResponse(fullResponse);
      } else if (hasStartedSpeaking && sentenceBuffer.trim()) {
        // Remainder: first sentence is playing; chain the rest without blocking
        const remainder = sentenceBuffer.trim();
        console.log('[DashAIChat] Chaining remainder after first sentence, length:', remainder.length);
        const chainRemainder = async () => {
          try {
            if (activeTTSPromiseRef.current) {
              await activeTTSPromiseRef.current;
            }
          } catch {
            // First sentence was interrupted (barge-in/stop) — still speak remainder
          } finally {
            activeTTSPromiseRef.current = null;
          }
          speakResponse(remainder);
        };
        chainRemainder(); // intentional fire-and-forget
      }

    } catch (error) {
      console.error('[DashAIChat] Streaming error:', error);
      throw error;
    }
  };

  /**
   * Handle voice input from VoiceOrb
   */
  const handleVoiceInput = useCallback((transcript: string, _language?: string) => {
    if (transcript.trim()) {
      sendMessage(transcript);
    }
  }, []);

  /**
   * Speak response using Azure TTS via VoiceOrb
   * Includes retry logic in case ref isn't ready yet
   */
  const speakResponse = useCallback(async (text: string, retryCount = 0) => {
    // Only speak if in voice mode (use ref for latest value)
    if (!isVoiceModeRef.current) {
      console.log('[DashAIChat] Skipping TTS - not in voice mode (ref:', isVoiceModeRef.current, ')');
      return;
    }
    
    // Wait for ref to be available with retry
    if (!voiceOrbRef.current) {
      if (retryCount < 3) {
        console.log('[DashAIChat] VoiceOrb ref not ready, retrying in 500ms... (attempt', retryCount + 1, ')');
        setTimeout(() => speakResponse(text, retryCount + 1), 500);
        return;
      }
      console.log('[DashAIChat] VoiceOrb ref still not available after retries, skipping TTS');
      return;
    }
    
    try {
      setIsSpeaking(true);
      console.log('[DashAIChat] Speaking response via VoiceOrb, length:', text.length);
      const cleanText = normalizeForTTS(text);
      await voiceOrbRef.current.speakText(cleanText);
    } catch (error) {
      console.error('[DashAIChat] TTS error:', error);
    } finally {
      setIsSpeaking(false);
    }
  }, []); // No deps - uses refs for latest values

  const runDebouncedMessageAction = useCallback(async (key: string, action: () => Promise<void> | void) => {
    const now = Date.now();
    const last = actionDebounceRef.current[key] ?? 0;
    if (now - last < 500) {
      return;
    }
    actionDebounceRef.current[key] = now;
    await action();
  }, []);

  const handleCopyMessage = useCallback(async (message: ChatMessageData) => {
    await runDebouncedMessageAction(`copy:${message.id}`, async () => {
      try {
        await Clipboard.setStringAsync(message.content || '');
        toast.success('Message copied');
      } catch (err) {
        console.warn('[DashAIChat] Copy failed:', err);
        toast.error('Copy failed');
      }
    });
  }, [runDebouncedMessageAction]);

  const handleShareMessage = useCallback(async (message: ChatMessageData) => {
    await runDebouncedMessageAction(`share:${message.id}`, async () => {
      try {
        await Share.share({ message: message.content || '' });
      } catch (err) {
        console.warn('[DashAIChat] Share failed:', err);
      }
    });
  }, [runDebouncedMessageAction]);

  const handleRegenerateMessage = useCallback(async (message: ChatMessageData) => {
    await runDebouncedMessageAction(`regen:${message.id}`, async () => {
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
      if (userIndex < 0) return;

      await sendMessage(messages[userIndex].content);
    });
  }, [isProcessing, messages, runDebouncedMessageAction]);

  const renderMessage = useCallback(({ item }: { item: ChatMessageData }) => (
    <ChatMessage
      message={item}
      onCopy={handleCopyMessage}
      onShare={handleShareMessage}
      onRegenerate={item.role === 'assistant' ? handleRegenerateMessage : undefined}
      disableActions={isProcessing}
    />
  ), [handleCopyMessage, handleRegenerateMessage, handleShareMessage, isProcessing]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity 
          onPress={onClose || (() => router.back())}
          style={styles.headerButton}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <View style={[styles.headerIcon, { backgroundColor: theme.primary }]}>
            <Ionicons name="sparkles" size={18} color="#fff" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Dash AI Ops</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              {isProcessing ? 'Thinking...' : isSpeaking ? 'Speaking...' : 'Online'}
            </Text>
          </View>
        </View>
        
        <TouchableOpacity 
          style={styles.headerButton}
          onPress={clearChat}
        >
          <Ionicons name="refresh" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlashList
        ref={listRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        estimatedItemSize={120}
        style={styles.messagesContainer}
        contentContainerStyle={[styles.messagesContent, { paddingBottom: 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={100}
        extraData={{ isProcessing }}
      />

      {/* Voice Mode Overlay - Only on native platforms */}
      {isVoiceMode && VoiceOrb && (
        <View style={[styles.voiceModeOverlay, { backgroundColor: theme.background + 'F5' }]}>
          <VoiceOrb
            ref={voiceOrbRef}
            isListening={isListening}
            isSpeaking={isSpeaking}
            onStartListening={() => setIsListening(true)}
            onStopListening={() => setIsListening(false)}
            onTranscript={handleVoiceInput}
            onTTSStart={() => setIsSpeaking(true)}
            onTTSEnd={() => setIsSpeaking(false)}
            autoStartListening={true}
            autoRestartAfterTTS={true}
          />
          {/* Close button for voice mode */}
          <TouchableOpacity
            style={styles.voiceModeCloseButton}
            onPress={() => setIsVoiceMode(false)}
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input Area */}
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
