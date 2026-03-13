/**
 * DashVoiceOrbSection — ORB + processing indicator for Dash Voice.
 *
 * Tier-based orb visuals:
 * - free: DashOrb (shared glass-ring orb across web/native)
 * - starter: CosmicOrb (purple/teal concentric rings, purple core)
 * - premium/enterprise: PremiumCosmicOrb (premium cosmic orb with orbiting satellites)
 */

import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CosmicOrb } from '@/components/dash-orb/CosmicOrb';
import { PremiumCosmicOrb } from '@/components/dash-orb/PremiumCosmicOrb';
import { DashOrb } from '@/components/dash-orb/DashOrb';
import { s } from '@/app/screens/dash-voice.styles';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import type { CapabilityTier } from '@/lib/tiers';
import type { VoiceOrbRef } from '@/features/super-admin/voice-orb/types';

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
  voiceOrbRef: React.RefObject<VoiceOrbRef | null>;
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
  /** Capability tier determines which orb visual is displayed */
  orbTier?: CapabilityTier;
  onStopListening: () => void;
  onStartListening: () => void;
  onPartialTranscript: (text: string) => void;
  onTranscript: (transcript: string, language?: SupportedLanguage) => void;
  onVoiceError: (message: string) => void;
  onMuteChange: (muted: boolean) => void;
  /** Current mute state (propagated from VoiceOrb via onMuteChange) */
  isMuted?: boolean;
  onTTSStart: () => void;
  onTTSEnd: () => void;
  onLanguageChange: (lang: SupportedLanguage) => void;
}

const hiddenOrbStyle = StyleSheet.create({
  hidden: { position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 },
  micBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    marginTop: 12,
  },
});

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
  orbTier = 'free',
  isMuted = false,
  onStopListening,
  onStartListening,
  onPartialTranscript,
  onTranscript,
  onVoiceError,
  onMuteChange,
  onTTSStart,
  onTTSEnd,
  onLanguageChange,
}: DashVoiceOrbSectionProps) {
  const handleVisibleOrbPress = React.useCallback(() => {
    void voiceOrbRef.current?.toggleListening?.();
  }, [voiceOrbRef]);

  const voiceOrbElement = VoiceOrb ? (
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
      onMuteChange={onMuteChange}
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
  ) : null;

  // free tier — shared DashOrb visual on both web and native
  const showFreeOrb = orbTier === 'free';
  // starter tier — CosmicOrb visual (purple/teal rings)
  const showStarterOrb = orbTier === 'starter';
  // premium/enterprise — PremiumCosmicOrb visual (premium cosmic orb)
  const showPremiumOrb = orbTier === 'premium' || orbTier === 'enterprise';

  // Map processing/speaking state to DashOrb state prop
  const dashOrbState = isSpeaking ? 'speaking' as const
    : isProcessing ? 'thinking' as const
    : isListening ? 'listening' as const
    : 'idle' as const;

  return (
    <>
      <View style={[s.orbContainer, { minHeight: orbRenderSize + 40, marginBottom: showTranscript ? 10 : 16 }]}>
        {showFreeOrb ? (
          <>
            {voiceOrbElement && <View style={hiddenOrbStyle.hidden}>{voiceOrbElement}</View>}
            <TouchableOpacity activeOpacity={0.92} onPress={handleVisibleOrbPress}>
              <DashOrb size={orbRenderSize} state={dashOrbState} />
            </TouchableOpacity>
          </>
        ) : showStarterOrb ? (
          <>
            {voiceOrbElement && <View style={hiddenOrbStyle.hidden}>{voiceOrbElement}</View>}
            <TouchableOpacity activeOpacity={0.92} onPress={handleVisibleOrbPress}>
              <CosmicOrb size={orbRenderSize} isProcessing={isProcessing || isListening} isSpeaking={isSpeaking} />
            </TouchableOpacity>
          </>
        ) : showPremiumOrb ? (
          <>
            {voiceOrbElement && <View style={hiddenOrbStyle.hidden}>{voiceOrbElement}</View>}
            <TouchableOpacity activeOpacity={0.92} onPress={handleVisibleOrbPress}>
              <PremiumCosmicOrb size={orbRenderSize} isProcessing={isProcessing || isListening} isSpeaking={isSpeaking} />
            </TouchableOpacity>
          </>
        ) : (
          voiceOrbElement ?? <DashOrb size={orbRenderSize} state={dashOrbState} />
        )}
      </View>

      {/* Mic mute toggle — prevents background conversations from triggering Dash. Does NOT stop TTS. */}
      {(showFreeOrb || showStarterOrb || showPremiumOrb) && VoiceOrb && (
        <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
          <TouchableOpacity
            style={[
              hiddenOrbStyle.micBtn,
              {
                borderColor: isMuted ? '#ef4444' : 'rgba(255,255,255,0.2)',
                backgroundColor: isMuted ? 'rgba(239,68,68,0.15)' : 'transparent',
              },
            ]}
            onPress={() => voiceOrbRef.current?.setMuted(!isMuted)}
            activeOpacity={0.7}
            accessibilityLabel={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            <Ionicons
              name={isMuted ? 'mic-off' : 'mic'}
              size={22}
              color={isMuted ? '#ef4444' : 'rgba(255,255,255,0.6)'}
            />
          </TouchableOpacity>
        </View>
      )}

      {isProcessing && !streamingText && (
        <View style={s.processingRow}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[s.processingText, { color: theme.textSecondary }]}>Thinking...</Text>
        </View>
      )}
    </>
  );
}
