/**
 * usePlaygroundAudio — Sound Effects Hook for Playground Activities
 *
 * Provides game sound effects via expo-audio:
 * - Bundled essential SFX (correct, wrong, celebrate, tap, whoosh, star)
 * - On-demand fetching of thematic sounds from Supabase Storage
 * - Local caching with expo-file-system
 * - Preload API for zero-latency during gameplay
 *
 * ≤200 lines (WARP.md)
 */

import { useCallback, useRef, useEffect } from 'react';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '@/lib/logger';

// ── Bundled SFX asset requires ──────────────────────────────

const BUNDLED_SOUNDS = {
  correct: require('@/assets/sounds/playground/correct.mp3'),
  wrong: require('@/assets/sounds/playground/wrong.mp3'),
  celebrate: require('@/assets/sounds/playground/celebrate.mp3'),
  tap: require('@/assets/sounds/playground/tap.mp3'),
  whoosh: require('@/assets/sounds/playground/whoosh.mp3'),
  star: require('@/assets/sounds/playground/star.mp3'),
  flip: require('@/assets/sounds/playground/flip.mp3'),
  match: require('@/assets/sounds/playground/match.mp3'),
  pop: require('@/assets/sounds/playground/pop.mp3'),
  countdown: require('@/assets/sounds/playground/countdown.mp3'),
} as const;

type BundledSoundName = keyof typeof BUNDLED_SOUNDS;

const CACHE_DIR = `${FileSystem.cacheDirectory}playground-sounds/`;

// ── Hook ─────────────────────────────────────────────────────

export interface UsePlaygroundAudioReturn {
  /** Play a bundled sound effect */
  playSound: (name: BundledSoundName) => void;
  /** Convenience shortcuts */
  playCorrect: () => void;
  playWrong: () => void;
  playCelebrate: () => void;
  playTap: () => void;
  playFlip: () => void;
  playMatch: () => void;
  playPop: () => void;
  /** Fetch & play a remote sound (e.g. animal sounds) from Supabase Storage */
  playRemoteSound: (url: string) => Promise<void>;
  /** Preload remote sounds for an activity (call before gameplay) */
  preloadSounds: (urls: string[]) => Promise<void>;
  /** Stop all current playback */
  stopAll: () => void;
}

export function usePlaygroundAudio(): UsePlaygroundAudioReturn {
  const activePlayersRef = useRef<AudioPlayer[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // Ensure cache directory exists
    FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => {});
    return () => {
      mountedRef.current = false;
      // Cleanup all active players
      activePlayersRef.current.forEach(p => {
        try { p.remove(); } catch { /* safe */ }
      });
      activePlayersRef.current = [];
    };
  }, []);

  const playSound = useCallback((name: BundledSoundName) => {
    try {
      const source = BUNDLED_SOUNDS[name];
      if (!source) return;
      const player = createAudioPlayer(source);
      activePlayersRef.current.push(player);
      player.play();
      // Auto-cleanup after 5s (most SFX are <2s)
      setTimeout(() => {
        try {
          player.remove();
          activePlayersRef.current = activePlayersRef.current.filter(p => p !== player);
        } catch { /* safe */ }
      }, 5000);
    } catch (err) {
      logger.warn('[PlaygroundAudio] Failed to play sound:', name, err);
    }
  }, []);

  const getCachedPath = useCallback((url: string): string => {
    const hash = url.split('/').pop() || url.replace(/[^a-zA-Z0-9]/g, '_');
    return `${CACHE_DIR}${hash}`;
  }, []);

  const playRemoteSound = useCallback(async (url: string) => {
    try {
      const cached = getCachedPath(url);
      const info = await FileSystem.getInfoAsync(cached);
      const uri = info.exists ? cached : url;

      // Cache in background if not yet cached
      if (!info.exists) {
        FileSystem.downloadAsync(url, cached).catch(() => {});
      }

      const player = createAudioPlayer(uri);
      activePlayersRef.current.push(player);
      player.play();
      setTimeout(() => {
        try {
          player.remove();
          activePlayersRef.current = activePlayersRef.current.filter(p => p !== player);
        } catch { /* safe */ }
      }, 10000);
    } catch (err) {
      logger.warn('[PlaygroundAudio] Remote sound failed:', url, err);
    }
  }, [getCachedPath]);

  const preloadSounds = useCallback(async (urls: string[]) => {
    await Promise.allSettled(
      urls.map(async (url) => {
        const cached = getCachedPath(url);
        const info = await FileSystem.getInfoAsync(cached);
        if (!info.exists) {
          await FileSystem.downloadAsync(url, cached);
        }
      }),
    );
  }, [getCachedPath]);

  const stopAll = useCallback(() => {
    activePlayersRef.current.forEach(p => {
      try { p.pause(); p.remove(); } catch { /* safe */ }
    });
    activePlayersRef.current = [];
  }, []);

  return {
    playSound,
    playCorrect: useCallback(() => playSound('correct'), [playSound]),
    playWrong: useCallback(() => playSound('wrong'), [playSound]),
    playCelebrate: useCallback(() => playSound('celebrate'), [playSound]),
    playTap: useCallback(() => playSound('tap'), [playSound]),
    playFlip: useCallback(() => playSound('flip'), [playSound]),
    playMatch: useCallback(() => playSound('match'), [playSound]),
    playPop: useCallback(() => playSound('pop'), [playSound]),
    playRemoteSound,
    preloadSounds,
    stopAll,
  };
}
