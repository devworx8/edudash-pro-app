import { useCallback, useEffect, useRef } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { track } from '@/lib/analytics';
import type { CallState } from '../types';

interface UseWhatsAppVideoCallAudioEffectsParams {
  callState: CallState;
  isOwner: boolean;
  isSpeakerOn: boolean;
  inCallManager: any;
  ringbackSound: any;
  ringbackPlayerRef: React.MutableRefObject<AudioPlayer | null>;
  ringbackStartedRef: React.MutableRefObject<boolean>;
  callTelemetryRef: React.MutableRefObject<{
    ringbackStartedAt: number | null;
  }>;
  setIsSpeakerOn: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useWhatsAppVideoCallAudioEffects({
  callState,
  isOwner,
  isSpeakerOn,
  inCallManager,
  ringbackSound,
  ringbackPlayerRef,
  ringbackStartedRef,
  callTelemetryRef,
  setIsSpeakerOn,
}: UseWhatsAppVideoCallAudioEffectsParams): void {
  const earpieceEnforcerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!inCallManager) return;

    const shouldEnforceEarpiece = (callState === 'connecting' || callState === 'ringing') && !isSpeakerOn;

    if (shouldEnforceEarpiece) {
      try {
        inCallManager.setForceSpeakerphoneOn(false);
        console.log('[VideoCall] Earpiece enforced on state transition');
      } catch (e) {
        console.warn('[VideoCall] Earpiece enforcement failed:', e);
      }

      earpieceEnforcerRef.current = setInterval(() => {
        if (!isSpeakerOn && (callState === 'connecting' || callState === 'ringing')) {
          try {
            inCallManager.setForceSpeakerphoneOn(false);
          } catch {
            // best-effort route stabilization
          }
        }
      }, 1200);
    }

    return () => {
      if (earpieceEnforcerRef.current) {
        clearInterval(earpieceEnforcerRef.current);
        earpieceEnforcerRef.current = null;
      }
    };
  }, [callState, inCallManager, isSpeakerOn]);

  const playCustomRingback = useCallback(async (retryAttempt = 0) => {
    if (ringbackStartedRef.current && ringbackPlayerRef.current?.playing) {
      console.log('[VideoCall] Ringback already playing, skipping');
      return;
    }

    console.log('[VideoCall] 🔊 playCustomRingback called', {
      attempt: retryAttempt + 1,
      hasAsset: !!ringbackSound,
    });

    if (!ringbackSound) {
      console.error('[VideoCall] ❌ No ringback sound available');
      return;
    }

    const maxRetries = 3;
    const retryDelay = Math.min(500 * Math.pow(2, retryAttempt), 2000);

    try {
      console.log(`[VideoCall] 🔊 Starting ringback via expo-audio fallback (attempt ${retryAttempt + 1}/${maxRetries})`);

      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        allowsRecording: true,
        shouldPlayInBackground: true,
        shouldRouteThroughEarpiece: true,
      });

      const player = createAudioPlayer(ringbackSound);
      player.loop = true;
      player.volume = 1.0;
      ringbackPlayerRef.current = player;

      player.play();
      await new Promise((resolve) => setTimeout(resolve, 200));

      ringbackStartedRef.current = true;
      if (!callTelemetryRef.current.ringbackStartedAt) {
        callTelemetryRef.current.ringbackStartedAt = Date.now();
        track('edudash.calls.ringback_started', { call_type: 'video', source: 'expo-audio' });
      }
      console.log('[VideoCall] ✅ expo-audio ringback playing (fallback)');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (error) {
      console.error(`[VideoCall] ❌ expo-audio ringback failed (attempt ${retryAttempt + 1}):`, error);
      ringbackStartedRef.current = false;
      ringbackPlayerRef.current = null;

      if (retryAttempt < maxRetries - 1) {
        console.log(`[VideoCall] 🔄 Retrying ringback in ${retryDelay}ms...`);
        setTimeout(() => {
          void playCustomRingback(retryAttempt + 1);
        }, retryDelay);
      }
    }
  }, [callTelemetryRef, ringbackPlayerRef, ringbackSound, ringbackStartedRef]);

  const stopCustomRingback = useCallback(() => {
    if (ringbackStartedRef.current) {
      const startedAt = callTelemetryRef.current.ringbackStartedAt;
      track('edudash.calls.ringback_stopped', {
        call_type: 'video',
        duration_ms: typeof startedAt === 'number' ? Date.now() - startedAt : undefined,
      });
      callTelemetryRef.current.ringbackStartedAt = null;
    }
    if (ringbackPlayerRef.current) {
      try {
        ringbackPlayerRef.current.pause();
        ringbackPlayerRef.current.remove();
      } catch {
        // Ignore errors
      }
      ringbackPlayerRef.current = null;
    }
    ringbackStartedRef.current = false;
  }, [callTelemetryRef, ringbackPlayerRef, ringbackStartedRef]);

  useEffect(() => {
    if (callState === 'connecting' || callState === 'ringing') {
      const initAudio = async () => {
        if (inCallManager) {
          try {
            inCallManager.start({
              media: 'audio',
              auto: false,
              ringback: '',
            });
            inCallManager.setForceSpeakerphoneOn(false);
            setIsSpeakerOn(false);
            inCallManager.setKeepScreenOn(true);
            console.log('[VideoCall] InCallManager started');
          } catch (err) {
            console.warn('[VideoCall] Failed to start InCallManager:', err);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 150));

        try {
          await setAudioModeAsync({
            playsInSilentMode: true,
            interruptionMode: 'duckOthers',
            allowsRecording: true,
            shouldPlayInBackground: true,
            shouldRouteThroughEarpiece: true,
          });
        } catch (err) {
          console.warn('[VideoCall] setAudioModeAsync failed:', err);
        }

        if (isOwner) {
          void playCustomRingback();
        }
      };

      void initAudio();
    } else if (callState === 'connected') {
      stopCustomRingback();
      if (inCallManager) {
        try {
          inCallManager.setForceSpeakerphoneOn(isSpeakerOn);
          console.log('[VideoCall] Call connected, audio on:', isSpeakerOn ? 'speaker' : 'earpiece');
        } catch (err) {
          console.warn('[VideoCall] Failed to update speaker state:', err);
        }
      }
    } else if (callState === 'ended' || callState === 'failed') {
      stopCustomRingback();
    }

    return () => {
      stopCustomRingback();
      if (inCallManager) {
        try {
          inCallManager.stop();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [callState, inCallManager, isOwner, isSpeakerOn, playCustomRingback, setIsSpeakerOn, stopCustomRingback]);
}
