/**
 * useVoiceTTSPlayback — AudioPlayer lifecycle management sub-hook.
 *
 * Handles create/play/stop/cleanup of expo-audio players with robust
 * end-of-playback detection. Uses a multi-signal approach to determine
 * when audio has finished playing, avoiding both premature cutoff and
 * hanging on stalled players.
 *
 * @module components/super-admin/voice-orb/useVoiceTTS/useVoiceTTSPlayback
 */

import { useCallback, useEffect, useRef } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

/** How many consecutive "looks done" ticks before we accept playback is complete */
const END_CONFIDENCE_REQUIRED = 3;
/** Ticks of no progress near end before we treat as stalled and finalize */
const NEAR_END_STALL_TICKS = 4;
/** Minimum reported duration before we trust the duration value */
const MIN_RELIABLE_DURATION_MS = 300;
/** Polling interval — faster polling means earlier end detection */
const POLL_INTERVAL_MS = 80;
/** Grace period after player.playing goes false to allow for buffering hiccups */
const PLAYBACK_PAUSE_GRACE_TICKS = 2;

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
    // ~80ms per character is generous enough for slow speech rates.
    // Minimum 15s, maximum 90s. Shorter max than before to fail-fast on broken playback.
    const estimated = (text || '').length * 80;
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
      let pauseGraceTicks = 0;
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
        cleanupPlayer(playerRef.current);
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
          pauseGraceTicks = 0;
          if (positionMs > lastPositionMs) lastPositionMs = positionMs;
          return;
        }

        if (!hasStarted) return;

        // Brief pauses can happen during buffering. Allow a small grace period.
        if (pauseGraceTicks < PLAYBACK_PAUSE_GRACE_TICKS) {
          pauseGraceTicks += 1;
          return;
        }

        const hasProgressed = positionMs > lastPositionMs + 10;
        if (hasProgressed) {
          lastPositionMs = positionMs;
          stallTicks = 0;
          endConfidenceTicks = 0;
        } else {
          stallTicks += 1;
        }

        const stableDuration = peakDurationMs >= MIN_RELIABLE_DURATION_MS;

        // Primary end signal: position is at or past the end of the track
        const reachedEnd = stableDuration && positionMs >= Math.max(peakDurationMs - 200, 0);
        if (reachedEnd) {
          endConfidenceTicks += 1;
          if (endConfidenceTicks >= END_CONFIDENCE_REQUIRED) { finalize(); return; }
        }

        // Secondary end signal: near end and stalled
        const nearEnd = stableDuration && positionMs >= peakDurationMs * 0.90;
        if (nearEnd && stallTicks >= NEAR_END_STALL_TICKS) { finalize(); return; }

        // Tertiary end signal: extended stall after significant playback
        const significantProgress = lastPositionMs > 1000;
        if (significantProgress && stallTicks >= 15) { finalize(); return; }
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
