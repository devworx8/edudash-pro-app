/**
 * Voice Call Interface (React Native) - Refactored
 * 
 * Audio-only call interface using Daily.co React Native SDK.
 * Provides controls for mute, speaker, and end call.
 * 
 * This is the main orchestration component that composes:
 * - useVoiceCallState: State management
 * - useVoiceCallAudio: InCallManager audio routing
 * - useVoiceCallDaily: Daily.co SDK integration
 * - useVoiceCallTimeout: Ring timeout handling
 * - VoiceCallControls: Control buttons
 * - VoiceCallInfo: Caller info display
 * - VoiceCallHeader: Header with minimize
 * - VoiceCallError: Error display
 * - VoiceCallMinimized: Minimized view
 */

import React, { useCallback, useEffect } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  View,
  Platform,
  BackHandler,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { DeviceEventEmitter } from '@/lib/utils/eventEmitter';
import type { CallState } from './types';

// Hooks
import {
  useVoiceCallState,
  useVoiceCallAudio,
  useVoiceCallDaily,
  useVoiceCallTimeout,
  useCallBackgroundHandler,
} from './hooks';
import { usePictureInPicture } from '@/hooks/usePictureInPicture';

// Components
import { VoiceCallControls } from './VoiceCallControls';
import { VoiceCallHeader } from './VoiceCallHeader';
import { VoiceCallInfo } from './VoiceCallInfo';
import { VoiceCallError } from './VoiceCallError';
import { VoiceCallMinimized } from './VoiceCallMinimized';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface VoiceCallInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  roomName?: string;
  userName?: string;
  isOwner?: boolean;
  calleeId?: string;
  callId?: string;
  meetingUrl?: string;
  threadId?: string;
  isSwitchingMode?: boolean;
  onCallStateChange?: (state: CallState) => void;
  /** Optional callback to switch from voice to video call */
  onSwitchToVideo?: () => void;
}

export function VoiceCallInterface({
  isOpen,
  onClose,
  roomName,
  userName = 'User',
  isOwner = false,
  calleeId,
  callId,
  meetingUrl,
  threadId,
  isSwitchingMode = false,
  onCallStateChange,
  onSwitchToVideo,
}: VoiceCallInterfaceProps) {
  // Safe area insets for bottom navigation bar
  const insets = useSafeAreaInsets();
  
  // State management
  const state = useVoiceCallState({
    isOpen,
    callId,
    onCallStateChange,
  });

  // Audio routing (InCallManager)
  const audio = useVoiceCallAudio({
    callState: state.callState,
    isOwner,
    isSpeakerEnabled: state.isSpeakerEnabled,
    setIsSpeakerEnabled: state.setIsSpeakerEnabled,
  });

  // Daily.co SDK
  const daily = useVoiceCallDaily({
    isOpen,
    meetingUrl,
    userName,
    isOwner,
    calleeId,
    initialCallId: callId,
    threadId,
    isSwitchingMode,
    isSpeakerEnabled: state.isSpeakerEnabled,
    dailyRef: state.dailyRef,
    callIdRef: state.callIdRef,
    setCallState: state.setCallState,
    setError: state.setError,
    setParticipantCount: state.setParticipantCount,
    setIsAudioEnabled: state.setIsAudioEnabled,
    setIsSpeakerEnabled: state.setIsSpeakerEnabled,
    setCallDuration: state.setCallDuration,
    stopAudio: audio.stopAudio,
    onClose,
  });

  // Ring timeout
  useVoiceCallTimeout({
    callState: state.callState,
    isOwner,
    callIdRef: state.callIdRef,
    setError: state.setError,
    setCallState: state.setCallState,
    cleanupCall: daily.cleanupCall,
    onClose,
  });

  // Background handling (KeepAwake + foreground service for background calls)
  useCallBackgroundHandler({
    callState: state.callState,
    isCallActive: isOpen,
    callId: state.callIdRef.current,
    callerName: userName,
    callType: 'voice',
    onReturnFromBackground: () => {
      console.log('[VoiceCallInterface] Returned from background');
      // Re-enable audio when returning from background
      if (state.dailyRef.current && state.isAudioEnabled) {
        try {
          state.dailyRef.current.setLocalAudio(true);
        } catch (err) {
          console.warn('[VoiceCallInterface] Failed to re-enable audio after background:', err);
        }
      }
    },
  });

  // Picture-in-Picture mode for background calls (Android)
  const { isInPipMode, isPipSupported } = usePictureInPicture({
    // Auto-enter PiP when call is connected and app goes to background
    autoEnterOnBackground: isOpen && state.callState === 'connected',
    onEnterPiP: () => {
      console.log('[VoiceCallInterface] Entered PiP mode - call continues in floating window');
    },
    onExitPiP: () => {
      console.log('[VoiceCallInterface] Exited PiP mode');
    },
    // Portrait aspect ratio for voice call UI
    aspectRatioWidth: 9,
    aspectRatioHeight: 16,
  });

  // Handle Android back button - minimize instead of ending call
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'android') return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // If call is active (connecting, ringing, or connected), minimize instead of ending
      if (state.callState === 'connected' || state.callState === 'connecting' || state.callState === 'ringing') {
        console.log('[VoiceCallInterface] Back button pressed - minimizing call (not ending)');
        state.setIsMinimized(true);
        return true; // Prevent default back behavior
      }
      // For other states (idle, ended, error), allow normal back behavior
      return false;
    });

    return () => backHandler.remove();
  }, [isOpen, state.callState, state]);

  // Listen for mute toggle events from notification action buttons
  useEffect(() => {
    if (!isOpen) return;
    
    const muteListener = DeviceEventEmitter.addListener('call:toggle-mute', () => {
      console.log('[VoiceCallInterface] 🔇 Toggle mute from notification');
      daily.toggleAudio();
    });
    
    const speakerListener = DeviceEventEmitter.addListener('call:toggle-speaker', () => {
      console.log('[VoiceCallInterface] 🔊 Toggle speaker from notification');
      audio.toggleSpeaker();
    });
    
    return () => {
      muteListener.remove();
      speakerListener.remove();
    };
  }, [isOpen, daily, audio]);

  // Handlers
  const handleMinimize = useCallback(() => {
    state.setIsMinimized(true);
  }, [state]);

  const handleMaximize = useCallback(() => {
    state.setIsMinimized(false);
  }, [state]);

  const handleRetry = useCallback(() => {
    state.resetState();
    onClose();
  }, [state, onClose]);

  // Don't render if not open
  if (!isOpen) return null;

  // Minimized view
  if (state.isMinimized) {
    return (
      <VoiceCallMinimized
        callDuration={state.callDuration}
        formatDuration={state.formatDuration}
        onMaximize={handleMaximize}
        onEndCall={daily.endCall}
      />
    );
  }

  // Full view
  return (
    <Animated.View style={[styles.container, { opacity: state.fadeAnim }]}>
      <BlurView intensity={90} style={styles.blurView} tint="dark">
        <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          {/* Header */}
          <VoiceCallHeader onMinimize={handleMinimize} />

          {/* Call Info */}
          <VoiceCallInfo
            userName={userName}
            callState={state.callState}
            callDuration={state.callDuration}
            formatDuration={state.formatDuration}
            pulseAnim={state.pulseAnim}
          />

          {/* Error Message */}
          <VoiceCallError error={state.error} />

          {/* Controls */}
          <VoiceCallControls
            callState={state.callState}
            isAudioEnabled={state.isAudioEnabled}
            isSpeakerEnabled={state.isSpeakerEnabled}
            participantCount={state.participantCount}
            onToggleAudio={daily.toggleAudio}
            onToggleSpeaker={audio.toggleSpeaker}
            onEndCall={daily.endCall}
            onRetry={handleRetry}
            onSwitchToVideo={onSwitchToVideo}
          />
        </View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    zIndex: 9999,
  },
  blurView: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 15, 0.95)',
  },
  content: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 24,
  },
});

export default VoiceCallInterface;
