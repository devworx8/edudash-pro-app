/**
 * DashVoiceOrbSection — ORB + processing indicator for Dash Voice.
 *
 * Extracted from app/screens/dash-voice.tsx as part of the WARP refactor.
 */

import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { CosmicOrb } from '@/components/dash-orb/CosmicOrb';
import { s } from '@/app/screens/dash-voice.styles';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';

type DashVoiceDictationProbe = {
  run_id?: string;
  platform: 'mobile' | 'web';
  source: string;
  stt_start_at?: string;
  first_partial_at?: string;
  final_transcript_at?: string;
  commit_at?: string;
};

interface DashVoiceOrbSectionProps {
  VoiceOrb: React.ForwardRefExoticComponent<any> | null;
  voiceOrbRef: React.Ref<any>;
  voiceDictationProbeRef: React.MutableRefObject<DashVoiceDictationProbe | null>;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  streamingText: string;
  restartBlocked: boolean;
  orbRenderSize: number;
  showTranscript: boolean;
  orgType: string;
  preferredLanguage: SupportedLanguage;
  theme: any;
  onStopListening: () => void;
  onStartListening: () => void;
  onPartialTranscript: (text: string) => void;
  onTranscript: (transcript: string, language?: SupportedLanguage) => void;
  onVoiceError: (message: string) => void;
  onTTSStart: () => void;
  onTTSEnd: () => void;
  onLanguageChange: (lang: SupportedLanguage) => void;
}

export function DashVoiceOrbSection({
  VoiceOrb,
  voiceOrbRef,
  voiceDictationProbeRef,
  isListening,
  isSpeaking,
  isProcessing,
  streamingText,
  restartBlocked,
  orbRenderSize,
  showTranscript,
  orgType,
  preferredLanguage,
  theme,
  onStopListening,
  onStartListening,
  onPartialTranscript,
  onTranscript,
  onVoiceError,
  onTTSStart,
  onTTSEnd,
  onLanguageChange,
}: DashVoiceOrbSectionProps) {
  return (
    <>
      <View style={[s.orbContainer, { minHeight: orbRenderSize + 40, marginBottom: showTranscript ? 10 : 16 }]}>
        {VoiceOrb ? (
          <VoiceOrb
            ref={voiceOrbRef}
            isListening={isListening}
            isSpeaking={isSpeaking}
            isParentProcessing={isProcessing}
            onStopListening={onStopListening}
            onStartListening={() => {
              onStartListening();
              if (!voiceDictationProbeRef.current) {
                voiceDictationProbeRef.current = { platform: 'mobile', source: 'dash_voice_orb', stt_start_at: new Date().toISOString() };
              } else if (!voiceDictationProbeRef.current.stt_start_at) {
                voiceDictationProbeRef.current.stt_start_at = new Date().toISOString();
              }
            }}
            onPartialTranscript={(text: string) => {
              onPartialTranscript(text);
              if (!voiceDictationProbeRef.current) {
                voiceDictationProbeRef.current = { platform: 'mobile', source: 'dash_voice_orb', stt_start_at: new Date().toISOString() };
              }
              if (!voiceDictationProbeRef.current.first_partial_at && String(text || '').trim()) {
                voiceDictationProbeRef.current.first_partial_at = new Date().toISOString();
              }
            }}
            onTranscript={onTranscript}
            onVoiceError={onVoiceError}
            onTTSStart={onTTSStart}
            onTTSEnd={onTTSEnd}
            onLanguageChange={onLanguageChange}
            language={preferredLanguage}
            size={orbRenderSize}
            autoStartListening
            autoRestartAfterTTS
            restartBlocked={restartBlocked}
            preschoolMode={orgType === 'preschool'}
            showLiveTranscript={false}
          />
        ) : (
          <CosmicOrb size={orbRenderSize} isProcessing={isProcessing || isListening} isSpeaking={isSpeaking} />
        )}
      </View>

      {isProcessing && !streamingText && (
        <View style={s.processingRow}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[s.processingText, { color: theme.textSecondary }]}>Thinking...</Text>
        </View>
      )}
    </>
  );
}
