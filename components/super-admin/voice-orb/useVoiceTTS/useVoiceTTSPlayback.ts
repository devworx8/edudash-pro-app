/**
 * useVoiceTTSPlayback — AudioPlayer lifecycle management sub-hook.
 * Handles create/play/stop/cleanup of expo-audio players and timing.
 * @module components/super-admin/voice-orb/useVoiceTTS/useVoiceTTSPlayback
 */

import { useCallback, useEffect, useRef } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

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
    const estimated = (text || '').length * 120;
    return Math.min(120000, Math.max(20000, estimated));
  }, []);

  const playAudioUrl = useCallback((audioUrl: string, timeoutMs: number): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
        });
      } catch (modeErr) {
        console.warn('[VoiceTTS] Audio mode config failed (non-fatal):', modeErr);
      }

      let settled = false;
      let hasStarted = false;
      let stallTicks = 0;
      let endConfidenceTicks = 0;
      let lastPositionMs = 0;
      let playbackStartedAtMs = 0;
      let stableDurationMs = 0;
      let durationStableTicks = 0;
      let lastRawDurationMs = 0;
      let lastSnapshot = { durationMs: 0, positionMs: 0, playing: false };
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
          lastSnapshot = { durationMs, positionMs, playing };
        } catch {
          finalize(new Error('AUDIO_PLAYER_STATUS_ERROR'));
          return;
        }

        if (durationMs > 0) {
          if (Math.abs(durationMs - lastRawDurationMs) < 50) {
            durationStableTicks += 1;
          } else {
            durationStableTicks = 0;
          }
          lastRawDurationMs = durationMs;
          if (durationStableTicks >= 3) stableDurationMs = durationMs;
        }

        if (playing) {
          if (!hasStarted) playbackStartedAtMs = Date.now();
          hasStarted = true;
          stallTicks = 0;
          endConfidenceTicks = 0;
          if (positionMs > lastPositionMs) lastPositionMs = positionMs;
          return;
        }
        if (!hasStarted) return;

        const elapsedSinceStartMs = Date.now() - playbackStartedAtMs;
        const hasProgressed = positionMs > lastPositionMs + 20;
        if (hasProgressed) { lastPositionMs = positionMs; stallTicks = 0; } else { stallTicks += 1; }

        const useDuration = stableDurationMs > 0 ? stableDurationMs : durationMs;
        const durationReliable = useDuration > 0 && durationStableTicks >= 3;

        const reachedEnd = durationReliable
          && positionMs >= Math.max(useDuration - 150, 0)
          && elapsedSinceStartMs > 500;
        if (reachedEnd) { if (++endConfidenceTicks >= 3) finalize(); return; }

        const nearEndStall = durationReliable
          && positionMs >= useDuration * 0.92
          && stallTicks >= 8
          && elapsedSinceStartMs > 800;
        if (nearEndStall) finalize();
      }, 100);

      playbackTimeoutRef.current = setTimeout(() => {
        if (!hasStarted) { finalize(new Error('AUDIO_PLAYBACK_TIMEOUT')); return; }
        if (lastSnapshot.playing) { finalize(new Error('AUDIO_PLAYBACK_TIMEOUT')); return; }
        const unfinished = lastSnapshot.durationMs > 0 && lastSnapshot.positionMs < lastSnapshot.durationMs * 0.8;
        finalize(unfinished ? new Error('AUDIO_PLAYBACK_STALL') : undefined);
      }, timeoutMs);
    });
  }, [clearPlaybackTimers, cleanupPlayer]);

  return { playerRef, stopPlayback, playAudioUrl, estimatePlaybackTimeoutMs };
}
