/**
 * Hook for managing AI settings
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  initAndMigrate, 
  getVoicePrefs,
  getVoiceChatPrefs,
  getChatUIPrefs,
  setVoicePrefs, 
  setVoiceChatPrefs,
  setChatUIPrefs,
  normalizeLanguageCode, 
  resolveDefaultVoiceId 
} from '@/lib/ai/dashSettings';
import { AISettings, DEFAULT_SETTINGS, TEST_MESSAGES, LANGUAGE_NAMES } from './types';

interface UseAISettingsReturn {
  settings: AISettings;
  loading: boolean;
  saving: boolean;
  streamingPref: boolean;
  dashAIInstance: any;
  handleSettingsChange: (key: string, value: any) => void;
  saveSettings: () => Promise<void>;
  resetToDefaults: () => void;
  testVoiceAdvanced: () => Promise<void>;
  toggleStreamingPref: (v: boolean) => Promise<void>;
  computeSignature: (s: AISettings) => string;
  lastSavedRef: React.MutableRefObject<string>;
}

const STREAMING_PREF_KEY = '@dash_streaming_enabled';
const STREAMING_PREF_USER_SET_KEY = '@dash_streaming_pref_user_set';

function getDefaultVoiceTypeForLanguage(lang: string): string {
  const langNorm = normalizeLanguageCode(lang);
  return langNorm === 'en'
    ? 'en-ZA-LukeNeural'
    : resolveDefaultVoiceId(langNorm, 'female');
}

export function useAISettings(): UseAISettingsReturn {
  const [dashAIInstance, setDashAIInstance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AISettings>({ ...DEFAULT_SETTINGS, localProcessing: Platform.OS === 'ios' });
  const [streamingPref, setStreamingPref] = useState<boolean>(true);
  const lastSavedRef = useRef<string>('');

  const computeSignature = useCallback((s: AISettings) => {
    const langNorm = normalizeLanguageCode(s.voiceLanguage);
    return JSON.stringify({
      personality: s.personality,
      customInstructions: s.customInstructions?.trim() || '',
      userContext: s.userContext?.trim() || '',
      teachingStyle: s.teachingStyle,
      voice: {
        enabled: !!s.voiceEnabled,
        responseLanguage: normalizeLanguageCode(s.responseLanguage || s.voiceLanguage),
        strictLanguageMode: !!s.strictLanguageMode,
        language: langNorm,
        voiceType: s.voiceType,
        rate: Number(s.voiceRate?.toFixed?.(2) ?? s.voiceRate),
        pitch: Number(s.voicePitch?.toFixed?.(2) ?? s.voicePitch),
        volume: Number(s.voiceVolume?.toFixed?.(2) ?? s.voiceVolume),
      },
      chat: { 
        autoSpeak: !!s.autoReadResponses,
        autoVoiceReply: !!s.autoVoiceReply,
        enterToSend: !!s.enterToSend,
        showTypingIndicator: !!s.showTypingIndicator,
        autoSuggestQuestions: !!s.autoSuggestQuestions,
        contextualHelp: !!s.contextualHelp,
      },
    });
  }, []);

  // Load DashAI instance
  useEffect(() => {
    (async () => {
      try {
        const { getAssistant } = await import('@/services/core/getAssistant');
        const inst = await getAssistant();
        setDashAIInstance(inst);
      } catch (error) {
        console.error('[useAISettings] Failed to load DashAI:', error);
      }
    })();
  }, []);

  // Load streaming preference
  useEffect(() => {
    (async () => {
      try {
        const [v, userSet] = await Promise.all([
          AsyncStorage.getItem(STREAMING_PREF_KEY),
          AsyncStorage.getItem(STREAMING_PREF_USER_SET_KEY),
        ]);
        if (userSet === 'true') {
          setStreamingPref(v !== 'false');
        } else {
          // Migration: legacy builds defaulted streaming to false unintentionally.
          setStreamingPref(true);
          await AsyncStorage.multiSet([
            [STREAMING_PREF_KEY, 'true'],
            [STREAMING_PREF_USER_SET_KEY, 'false'],
          ]);
        }
      } catch (e) {
        if (__DEV__) console.warn('[useAISettings] load streaming pref', e);
        setStreamingPref(true);
      }
    })();
  }, []);

  // Initialize settings from DashAI
  useEffect(() => {
    if (!dashAIInstance) return;
    
    const initializeSettings = async () => {
      try {
        setLoading(true);
        await dashAIInstance.initialize();
        try { await initAndMigrate(); } catch (e) { if (__DEV__) console.warn('[useAISettings] migration warn', e); }
        
        const [voicePrefs, voiceChatPrefs, chatUiPrefs] = await Promise.all([
          getVoicePrefs().catch(() => null),
          getVoiceChatPrefs().catch(() => null),
          getChatUIPrefs().catch(() => null),
        ]);

        const personality = dashAIInstance.getPersonality?.() || {};
        const memory = (typeof dashAIInstance.getMemoryItems === 'function')
          ? dashAIInstance.getMemoryItems()
          : (typeof dashAIInstance.getMemory === 'function' ? dashAIInstance.getMemory() : []);
        
        const defaultSettings = { ...DEFAULT_SETTINGS, localProcessing: Platform.OS === 'ios' };
        const voiceLanguage = normalizeLanguageCode(
          voicePrefs?.language || personality.voice_settings?.language || defaultSettings.voiceLanguage
        );
        const responseLanguage = normalizeLanguageCode(
          personality.response_language || voicePrefs?.language || personality.voice_settings?.language || defaultSettings.responseLanguage
        );
        const autoSpeak = voiceChatPrefs?.autoSpeak ?? defaultSettings.autoReadResponses;
        const voiceEnabled = voiceChatPrefs?.voiceEnabled ?? defaultSettings.voiceEnabled;
        
        const loadedSettings: AISettings = {
          ...defaultSettings,
          personality: (personality.response_style === 'professional' ? 'professional' : 
                        personality.response_style === 'casual' ? 'casual' : 
                        personality.response_style === 'formal' ? 'formal' : 'encouraging'),
          voiceLanguage,
          responseLanguage,
          strictLanguageMode: !!personality.strict_language_mode,
          voiceType: voicePrefs?.voice_id || personality.voice_settings?.voice_id || personality.voice_settings?.voice || getDefaultVoiceTypeForLanguage(voiceLanguage),
          voiceRate: voicePrefs?.speaking_rate ?? personality.voice_settings?.rate ?? defaultSettings.voiceRate,
          voicePitch: voicePrefs?.pitch ?? personality.voice_settings?.pitch ?? defaultSettings.voicePitch,
          voiceVolume: voicePrefs?.volume ?? personality.voice_settings?.volume ?? defaultSettings.voiceVolume,
          voiceEnabled,
          autoReadResponses: autoSpeak,
          autoVoiceReply: autoSpeak,
          enterToSend: chatUiPrefs?.enterToSend ?? defaultSettings.enterToSend,
          showTypingIndicator: chatUiPrefs?.showTypingIndicator ?? defaultSettings.showTypingIndicator,
          autoSuggestQuestions: chatUiPrefs?.autoSuggestQuestions ?? defaultSettings.autoSuggestQuestions,
          contextualHelp: chatUiPrefs?.contextualHelp ?? defaultSettings.contextualHelp,
          memoryEnabled: memory && memory.length > 0,
          customInstructions: personality.personality_traits?.join(', ') || '',
        };
        
        setSettings(loadedSettings);
        lastSavedRef.current = computeSignature(loadedSettings);
      } catch (error) {
        console.error('Failed to initialize Dash AI:', error);
        Alert.alert('Error', 'Failed to load enhanced Dash AI settings');
      } finally {
        setLoading(false);
      }
    };
    
    initializeSettings();
  }, [dashAIInstance, computeSignature]);

  const handleSettingsChange = useCallback((key: string, value: any) => {
    setSettings(prev => {
      if ((prev as any)[key] === value) return prev;
      if (key === 'autoVoiceReply') {
        return { ...prev, autoVoiceReply: value, autoReadResponses: value };
      }
      if (key === 'autoReadResponses') {
        return { ...prev, autoReadResponses: value, autoVoiceReply: value };
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const toggleStreamingPref = useCallback(async (v: boolean) => {
    setStreamingPref(v);
    try {
      await AsyncStorage.multiSet([
        [STREAMING_PREF_KEY, v ? 'true' : 'false'],
        [STREAMING_PREF_USER_SET_KEY, 'true'],
      ]);
    } catch (e) {
      if (__DEV__) console.warn('[useAISettings] save streaming pref', e);
    }
  }, []);

  const saveSettings = useCallback(async () => {
    try {
      setSaving(true);
      const sig = computeSignature(settings);
      if (sig === lastSavedRef.current) { setSaving(false); return; }
      
      const dashPersonality = {
        ...(dashAIInstance.getPersonality?.() || {}),
        personality_traits: [
          settings.personality,
          'educational',
          'supportive',
          ...(settings.customInstructions ? settings.customInstructions.split(',').map(s => s.trim()) : [])
        ].filter(Boolean),
        response_style: settings.personality,
        voice_settings: {
          language: settings.responseLanguage || settings.voiceLanguage,
          voice: settings.voiceType,
          voice_id: /Neural$/i.test(settings.voiceType || '') ? settings.voiceType : undefined,
          rate: settings.voiceRate,
          pitch: settings.voicePitch,
          volume: settings.voiceVolume
        },
        user_context: settings.userContext,
        teaching_style: settings.teachingStyle,
        // Language enforcement settings
        response_language: settings.responseLanguage || settings.voiceLanguage,
        strict_language_mode: settings.strictLanguageMode || false
      };
      
      await dashAIInstance.savePersonality(dashPersonality);

      try {
        const langNorm = normalizeLanguageCode(settings.voiceLanguage);
        const isProviderVoice = /Neural$/i.test(settings.voiceType || '');
        const gender = settings.voiceType === 'male' ? 'male' : 'female';
        const voice_id = isProviderVoice ? settings.voiceType : resolveDefaultVoiceId(langNorm, gender as any);
        await setVoicePrefs({
          language: langNorm as any,
          voice_id,
          speaking_rate: settings.voiceRate,
          pitch: settings.voicePitch,
          volume: settings.voiceVolume,
        });
      } catch (e) {
        console.warn('[useAISettings] Failed to persist voice preferences:', e);
      }

      try {
        const autoSpeak = !!(settings.autoReadResponses || settings.autoVoiceReply);
        await setVoiceChatPrefs({ 
          autoSpeak, 
          voiceEnabled: !!settings.voiceEnabled 
        });
      } catch (e) {
        if (__DEV__) console.warn('[useAISettings] Failed to persist voice chat prefs:', e);
      }

      try {
        await setChatUIPrefs({
          enterToSend: !!settings.enterToSend,
          showTypingIndicator: !!settings.showTypingIndicator,
          autoSuggestQuestions: !!settings.autoSuggestQuestions,
          contextualHelp: !!settings.contextualHelp,
        });
        // Legacy key for compatibility
        await AsyncStorage.setItem('@dash_ai_enter_to_send', settings.enterToSend ? 'true' : 'false');
        await AsyncStorage.setItem('@dash_ai_show_typing_indicator', settings.showTypingIndicator ? 'true' : 'false');
      } catch (e) {
        if (__DEV__) console.warn('[useAISettings] Failed to persist chat prefs:', e);
      }

      lastSavedRef.current = sig;
    } catch (error) {
      console.error('Failed to save enhanced settings:', error);
      Alert.alert('Save Error', 'Failed to save some settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [settings, dashAIInstance, computeSignature]);

  const testVoiceAdvanced = useCallback(async () => {
    try {
      const langNorm = normalizeLanguageCode(settings.voiceLanguage);
      const isProviderVoice = /Neural$/i.test(settings.voiceType || '');
      const gender = settings.voiceType === 'male' ? 'male' : 'female';
      const voice_id = isProviderVoice ? settings.voiceType : resolveDefaultVoiceId(langNorm, gender as any);
      
      await setVoicePrefs({
        language: langNorm as any,
        voice_id,
        speaking_rate: settings.voiceRate,
        pitch: settings.voicePitch,
        volume: settings.voiceVolume,
      });
      
      const dashPersonality = {
        ...(dashAIInstance.getPersonality?.() || {}),
        personality_traits: [settings.personality, 'educational', 'supportive'],
        response_style: settings.personality,
        voice_settings: {
          language: settings.voiceLanguage,
          voice: settings.voiceType,
          voice_id: /Neural$/i.test(settings.voiceType || '') ? settings.voiceType : undefined,
          rate: settings.voiceRate,
          pitch: settings.voicePitch,
          volume: settings.voiceVolume
        },
      };
      await dashAIInstance.savePersonality(dashPersonality);
      
      const langKey = langNorm as keyof typeof TEST_MESSAGES;
      const messages = TEST_MESSAGES[langKey] || TEST_MESSAGES.en;
      const content = messages[settings.personality] || messages.encouraging;
      
      const msg = { id: `msg_test_${Date.now()}`, type: 'assistant' as const, content, timestamp: Date.now() };
      await dashAIInstance.speakResponse(msg as any);
      
      const langName = LANGUAGE_NAMES[langNorm] || langNorm;
      const voiceName = voice_id.replace(/Neural$/i, '').replace(/-/g, ' ');
      
      Alert.alert(
        'Voice Test Complete',
        `Testing ${langName} voice: ${voiceName}\n\nRate: ${settings.voiceRate.toFixed(1)}x | Pitch: ${settings.voicePitch.toFixed(1)}x`
      );
    } catch (error) {
      console.error('[Voice Test] Failed:', error);
      Alert.alert('Voice Test Failed', 'Could not test voice settings.');
    }
  }, [settings, dashAIInstance]);

  const resetToDefaults = useCallback(() => {
    Alert.alert(
      'Reset to Defaults',
      'This will reset all enhanced settings to their default values.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setSettings({
              ...DEFAULT_SETTINGS,
              localProcessing: Platform.OS === 'ios',
              voiceType: getDefaultVoiceTypeForLanguage(DEFAULT_SETTINGS.voiceLanguage),
            });
            Alert.alert('Settings Reset', 'All settings have been reset to defaults');
          }
        }
      ]
    );
  }, []);

  return {
    settings,
    loading,
    saving,
    streamingPref,
    dashAIInstance,
    handleSettingsChange,
    saveSettings,
    resetToDefaults,
    testVoiceAdvanced,
    toggleStreamingPref,
    computeSignature,
    lastSavedRef,
  };
}
