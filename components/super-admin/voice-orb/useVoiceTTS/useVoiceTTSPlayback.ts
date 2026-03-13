/**
 * useVoiceTTSPlayback — AudioPlayer lifecycle management sub-hook.
 *
 * Handles create/play/stop/cleanup of expo-audio players with aggressive
 * polling for fast completion detection. Tuned for minimal inter-chunk
 * gap so speech sounds fluent when chunks are played back-to-back.
 *
 * @module components/super-admin/voice-orb/useVoiceTTS/useVoiceTTSPlayback
 */

import { useCallback, useEffect, useRef } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

// Faster polling detects end-of-playback sooner, reducing inter-chunk gap.
const POLL_INTERVAL_MS = 60;
const END_CONFIDENCE_REQUIRED = 2;
const NEAR_END_STALL_TICKS = 3;
const MIN_RELIABLE_DURATION_MS = 300;

export interface VoiceTTSPlaybackHandle {
  playerRef: React.MutableRefObject<AudioPlayer | null>;
  stopPlayback: () => Promise<void>;
  playAudioUrl: (audioUrl: string, timeoutMs: number) => Promise<void>;
  estimatePlaybackTimeoutMs: (text: string) => number;
}

export function useVoiceTTSPlayback(): VoiceTTSPlaybackHandle {
  const playerRef = useRef<AudioPlayer | null>(null);
  const playbackIdRef = useRef(0);
  const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioModeConfiguredRef = useRef(false);

  const clearPlaybackTimers = useCallback(() => {
    if (playbackIntervalRef.current) { clearInterval(playbackIntervalRef.current); playbackIntervalRef.current = null; }
    if (playbackTimeoutRef.current) { clearTimeout(playbackTimeoutRef.current); playbackTimeoutRef.current = null; }
  }, []);

  const cleanupPlayer = useCallback((player?: AudioPlayer | null) => {
    if (!player) return;
    try { player.pause(); } catch { /* ignore */ }
    try { player.release(); } catch { /* ignore */ }
    if (playerRef.current === player) playerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      Speech.stop();
      clearPlaybackTimers();
      cleanupPlayer(playerRef.current);
    };
  }, [clearPlaybackTimers, cleanupPlayer]);

  const stopPlayback = useCallback(async () => {
    try {
      Speech.stop();
      playbackIdRef.current += 1;
      clearPlaybackTimers();
      cleanupPlayer(playerRef.current);
    } catch (err) {
      console.error('[VoiceTTS] Error stopping playback:', err);
    }
  }, [clearPlaybackTimers, cleanupPlayer]);

  const estimatePlaybackTimeoutMs = useCallback((text: string): number => {
    const estimated = (text || '').length * 100;
    return Math.min(90000, Math.max(15000, estimated));
  }, []);

  const playAudioUrl = useCallback((audioUrl: string, timeoutMs: number): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
      if (!audioModeConfiguredRef.current) {
        try {
          await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
          audioModeConfiguredRef.current = true;
        } catch (modeErr) {
          console.warn('[VoiceTTS] Audio mode config failed (non-fatal):', modeErr);
        }
      }

      let settled = false;
      let hasStarted = false;
      let stallTicks = 0;
      let endConfidenceTicks = 0;
      let lastPositionMs = 0;
      let peakDurationMs = 0;
      const playbackId = playbackIdRef.current + 1;
      playbackIdRef.current = playbackId;
      clearPlaybackTimers();
      cleanupPlayer(playerRef.current);

      const finalize = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearPlaybackTimers();
        // Release player only on error; on success the caller may start next
        // chunk immediately and a tiny overlap with cleanup is acceptable.
        if (err) {
          cleanupPlayer(playerRef.current);
        } else {
          const p = playerRef.current;
          playerRef.current = null;
          // Defer cleanup to avoid blocking the next chunk's start
          setTimeout(() => cleanupPlayer(p), 20);
        }
        err ? reject(err) : resolve();
      };

      let player: AudioPlayer | null = null;
      try {
        player = createAudioPlayer(audioUrl);
        playerRef.current = player;
        player.play();
      } catch {
        finalize(new Error('AUDIO_PLAYER_INIT_FAILED'));
        return;
      }

      playbackIntervalRef.current = setInterval(() => {
        if (playbackIdRef.current !== playbackId) { finalize(); return; }
        if (!player) { finalize(new Error('AUDIO_PLAYER_MISSING')); return; }

        let playing = false, durationMs = 0, positionMs = 0;
        try {
          playing = player.playing;
          durationMs = (player.duration || 0) * 1000;
          positionMs = (player.currentTime || 0) * 1000;
        } catch {
          finalize(new Error('AUDIO_PLAYER_STATUS_ERROR'));
          return;
        }

        if (durationMs > peakDurationMs) peakDurationMs = durationMs;

        if (playing) {
          hasStarted = true;
          stallTicks = 0;
          endConfidenceTicks = 0;
          if (positionMs > lastPositionMs) lastPositionMs = positionMs;
          return;
        }

        if (!hasStarted) return;
        const hasProgressed = positionMs > lastPositionMs + 15;
        if (hasProgressed) { lastPositionMs = positionMs; stallTicks = 0; endConfidenceTicks = 0; } else { stallTicks += 1; }

        const stableDuration = peakDurationMs >= MIN_RELIABLE_DURATION_MS;
        const reachedEnd = stableDuration && positionMs >= Math.max(peakDurationMs - 200, 0);
        if (reachedEnd) { if (++endConfidenceTicks >= END_CONFIDENCE_REQUIRED) finalize(); return; }

        const nearEndStall = stableDuration && positionMs >= peakDurationMs * 0.93 && stallTicks >= NEAR_END_STALL_TICKS;
        if (nearEndStall) finalize();
      }, POLL_INTERVAL_MS);

      playbackTimeoutRef.current = setTimeout(() => {
        if (!hasStarted) { finalize(new Error('AUDIO_PLAYBACK_TIMEOUT')); return; }
        // If we've made significant progress, treat timeout as natural end
        const progress = peakDurationMs > 0 ? lastPositionMs / peakDurationMs : 0;
        finalize(progress < 0.7 ? new Error('AUDIO_PLAYBACK_STALL') : undefined);
      }, timeoutMs);
    });
  }, [clearPlaybackTimers, cleanupPlayer]);

  return { playerRef, stopPlayback, playAudioUrl, estimatePlaybackTimeoutMs };
}
