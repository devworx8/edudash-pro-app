import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { assertSupabase } from '@/lib/supabase';
import type { CallState } from '../types';

interface UseWhatsAppVideoCallControlsParams {
  dailyRef: React.MutableRefObject<any>;
  callIdRef: React.MutableRefObject<string | null>;
  meetingUrl?: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isFrontCamera: boolean;
  isSpeakerOn: boolean;
  isScreenSharing: boolean;
  isRecording: boolean;
  isOwner: boolean;
  preferLocalView: boolean;
  cleanupCall: () => Promise<void>;
  onClose: () => void;
  onMinimize?: () => void;
  updateParticipants: () => void;
  setIsAudioEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setIsVideoEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setIsFrontCamera: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSpeakerOn: React.Dispatch<React.SetStateAction<boolean>>;
  setIsScreenSharing: React.Dispatch<React.SetStateAction<boolean>>;
  setPreferLocalView: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setCallState: React.Dispatch<React.SetStateAction<CallState>>;
  setIsMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  inCallManager: any;
}

export function useWhatsAppVideoCallControls({
  dailyRef,
  callIdRef,
  meetingUrl,
  isAudioEnabled,
  isVideoEnabled,
  isFrontCamera,
  isSpeakerOn,
  isScreenSharing,
  isRecording,
  isOwner,
  preferLocalView,
  cleanupCall,
  onClose,
  onMinimize,
  updateParticipants,
  setIsAudioEnabled,
  setIsVideoEnabled,
  setIsFrontCamera,
  setIsSpeakerOn,
  setIsScreenSharing,
  setPreferLocalView,
  setError,
  setCallState,
  setIsMinimized,
  inCallManager,
}: UseWhatsAppVideoCallControlsParams) {
  const toggleAudio = useCallback(async () => {
    if (!dailyRef.current) return;
    try {
      await dailyRef.current.setLocalAudio(!isAudioEnabled);
      setIsAudioEnabled(!isAudioEnabled);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      console.error('[VideoCall] Toggle audio error:', err);
    }
  }, [dailyRef, isAudioEnabled, setIsAudioEnabled]);

  const toggleVideo = useCallback(async () => {
    if (!dailyRef.current) {
      console.warn('[VideoCall] Cannot toggle video - Daily object not available');
      return;
    }

    const newState = !isVideoEnabled;
    console.log('[VideoCall] Toggling video to:', newState);

    const setVideo = async (enabled: boolean, attempt: number = 1) => {
      try {
        await dailyRef.current.setLocalVideo(enabled);
        setIsVideoEnabled(enabled);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        console.log('[VideoCall] ✅ Video toggled to', enabled, 'on attempt', attempt);
        setTimeout(() => updateParticipants(), 300);
      } catch (err) {
        console.warn('[VideoCall] Toggle video failed attempt', attempt, ':', err);
        if (enabled && attempt < 3) {
          console.log('[VideoCall] Retrying enable video...');
          setTimeout(() => setVideo(enabled, attempt + 1), 500);
        } else {
          setError(enabled ? 'Failed to enable camera. Try again.' : 'Failed to disable camera.');
          setTimeout(() => setError(null), 3000);
        }
      }
    };

    await setVideo(newState);
  }, [dailyRef, isVideoEnabled, setIsVideoEnabled, setError, updateParticipants]);

  const flipCamera = useCallback(async () => {
    if (!dailyRef.current) return;
    try {
      await dailyRef.current.cycleCamera();
      setIsFrontCamera(!isFrontCamera);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      console.error('[VideoCall] Flip camera error:', err);
    }
  }, [dailyRef, isFrontCamera, setIsFrontCamera]);

  const toggleSpeaker = useCallback(async () => {
    const newState = !isSpeakerOn;
    try {
      if (inCallManager) {
        inCallManager.setForceSpeakerphoneOn(newState);
        console.log('[VideoCall] Speaker toggled to:', newState ? 'speaker' : 'earpiece');
      }
      setIsSpeakerOn(newState);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      console.error('[VideoCall] Toggle speaker error:', err);
    }
  }, [inCallManager, isSpeakerOn, setIsSpeakerOn]);

  const toggleScreenShare = useCallback(async () => {
    if (!dailyRef.current) return;

    if (Platform.OS === 'ios' && Platform.Version && Number(Platform.Version) < 14) {
      setError('Screen share requires iOS 14 or later');
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      if (isScreenSharing) {
        await dailyRef.current.stopScreenShare();
        console.log('[VideoCall] Screen share stopped');
      } else {
        console.log('[VideoCall] Starting screen share...');
        await dailyRef.current.startScreenShare();
        console.log('[VideoCall] Screen share started');
      }
      setIsScreenSharing(!isScreenSharing);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err: any) {
      console.error('[VideoCall] Screen share error:', err);

      if (Platform.OS === 'ios') {
        if (err?.message?.includes('extension') || err?.message?.includes('broadcast')) {
          setError('Screen share extension not configured. Contact app developer.');
        } else if (err?.message?.includes('permission') || err?.message?.includes('denied')) {
          setError('Screen share permission denied');
        } else {
          setError('Screen share not available on this device');
        }
      } else if (err?.message?.includes('permission') || err?.message?.includes('denied')) {
        setError('Screen share permission denied');
      } else if (err?.message?.includes('FOREGROUND') || err?.message?.includes('mediaProjection')) {
        setError('Screen share not permitted. Please update the app.');
      } else {
        setError('Screen sharing failed. Try again.');
      }
      setTimeout(() => setError(null), 4000);
    }
  }, [dailyRef, isScreenSharing, setError, setIsScreenSharing]);

  const shareCallLink = useCallback(async () => {
    if (!meetingUrl) {
      setError('No meeting link available');
      setTimeout(() => setError(null), 3000);
      return;
    }
    try {
      const { Share } = require('react-native');
      await Share.share({
        message: `Join my video call: ${meetingUrl}`,
        title: 'Join Video Call',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('[VideoCall] Share error:', err);
    }
  }, [meetingUrl, setError]);

  const toggleRecording = useCallback(async () => {
    if (!dailyRef.current) return;
    if (!isOwner) {
      setError('Only the call host can start recording');
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      if (isRecording) {
        console.log('[VideoCall] Stopping recording...');
        await dailyRef.current.stopRecording();
        setError('Recording stopped');
      } else {
        console.log('[VideoCall] Starting recording...');
        await dailyRef.current.startRecording({ type: 'cloud' });
        setError('Recording started');
      }
      setTimeout(() => setError(null), 2000);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err: any) {
      console.error('[VideoCall] Recording toggle error:', err);
      setError(err?.message || 'Recording failed');
      setTimeout(() => setError(null), 3000);
    }
  }, [dailyRef, isOwner, isRecording, setError]);

  const toggleViewPreference = useCallback(() => {
    setPreferLocalView((prev) => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log('[VideoCall] View preference toggled to:', !preferLocalView ? 'local' : 'remote');
  }, [preferLocalView, setPreferLocalView]);

  const handleEndCall = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    if (callIdRef.current) {
      await assertSupabase()
        .from('active_calls')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('call_id', callIdRef.current);
    }

    await cleanupCall();
    setCallState('ended');
    onClose();
  }, [callIdRef, cleanupCall, onClose, setCallState]);

  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
    onMinimize?.();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [onMinimize, setIsMinimized]);

  return {
    toggleAudio,
    toggleVideo,
    flipCamera,
    toggleSpeaker,
    toggleScreenShare,
    shareCallLink,
    toggleRecording,
    toggleViewPreference,
    handleEndCall,
    handleMinimize,
  };
}
