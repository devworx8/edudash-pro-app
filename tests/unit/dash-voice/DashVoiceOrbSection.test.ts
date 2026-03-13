import React from 'react';
import { fireEvent, render } from '@testing-library/react-native/pure';
import { DashVoiceOrbSection } from '@/components/dash-voice/DashVoiceOrbSection';
import type { VoiceOrbRef } from '@/features/super-admin/voice-orb/types';

jest.mock('react-native', () => {
  const React = require('react');
  const makeElement = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);

  return {
    Platform: { OS: 'ios', select: (obj: any) => obj.ios || obj.default },
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    StyleSheet: {
      create: (styles: any) => styles,
      flatten: (style: any) => style,
    },
    View: makeElement('View'),
    Text: makeElement('Text'),
    TouchableOpacity: makeElement('TouchableOpacity'),
    ActivityIndicator: makeElement('ActivityIndicator'),
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, name || 'icon');
  },
}));

jest.mock('@/components/dash-orb/DashOrb', () => ({
  DashOrb: () => null,
}));

jest.mock('@/components/dash-orb/CosmicOrb', () => ({
  CosmicOrb: () => null,
}));

jest.mock('@/components/dash-orb/PremiumCosmicOrb', () => ({
  PremiumCosmicOrb: () => null,
}));

describe('DashVoiceOrbSection', () => {
  const theme = {
    primary: '#7c3aed',
    textSecondary: '#94a3b8',
  };

  let lastVoiceOrbProps: Record<string, unknown> | null;
  let toggleListeningMock: jest.Mock;

  const MockVoiceOrb = React.forwardRef<VoiceOrbRef, Record<string, unknown>>((props, ref) => {
    lastVoiceOrbProps = props;
    React.useImperativeHandle(ref, () => ({
      speakText: jest.fn(async () => undefined),
      stopSpeaking: jest.fn(async () => undefined),
      setMuted: jest.fn(async () => undefined),
      startListening: jest.fn(async () => undefined),
      stopListening: jest.fn(async () => undefined),
      toggleListening: toggleListeningMock,
      isSpeaking: false,
      isMuted: false,
    }));
    return null;
  });

  const renderSection = () => {
    const voiceOrbRef = React.createRef<VoiceOrbRef>();
    return render(
      React.createElement(DashVoiceOrbSection, {
        VoiceOrb: MockVoiceOrb,
        voiceOrbRef,
        voiceDictationProbeRef: { current: null },
        isListening: false,
        isSpeaking: false,
        isProcessing: false,
        streamingText: '',
        restartBlocked: false,
        orbRenderSize: 160,
        showTranscript: false,
        orgType: 'school',
        preferredLanguage: 'en-ZA',
        theme,
        orbTier: 'free',
        onStopListening: jest.fn(),
        onStartListening: jest.fn(),
        onPartialTranscript: jest.fn(),
        onTranscript: jest.fn(),
        onVoiceError: jest.fn(),
        onMuteChange: jest.fn(),
        onTTSStart: jest.fn(),
        onTTSEnd: jest.fn(),
        onLanguageChange: jest.fn(),
      })
    );
  };

  beforeEach(() => {
    lastVoiceOrbProps = null;
    toggleListeningMock = jest.fn(async () => undefined);
  });

  it('disables automatic barge-in while keeping post-TTS restart enabled', () => {
    renderSection();

    expect(lastVoiceOrbProps).toMatchObject({
      autoRestartAfterTTS: true,
      enableAutomaticBargeInDuringTTS: false,
    });
  });

  it('routes mic button presses to the hidden orb controller', () => {
    const { getByText } = renderSection();

    fireEvent.press(getByText('mic-outline'));

    expect(toggleListeningMock).toHaveBeenCalledTimes(1);
  });
});
