'use client';

import { useCallback, useRef, useEffect } from 'react';

type SoundType = 'notification' | 'ringtone' | 'ringback' | 'ringback_chime';

interface NotificationSoundOptions {
  volume?: number;
  loop?: boolean;
  vibrate?: boolean;
}

const SOUND_PATHS: Record<SoundType, string> = {
  notification: '/sounds/notification.mp3',
  ringtone: '/sounds/ringtone.mp3',
  ringback: '/sounds/ringback.mp3',
  ringback_chime: '/sounds/ringback_chime.mp3',
};

// Default vibration patterns
const VIBRATION_PATTERNS: Record<SoundType, number[]> = {
  notification: [200, 100, 200],
  ringtone: [500, 200, 500, 200, 500],
  ringback: [200, 100, 200, 100, 200],
  ringback_chime: [100, 50, 100],
};

/**
 * Hook for playing notification sounds with optional vibration
 * Provides native app-like notification feedback
 */
export function useNotificationSound() {
  const audioRefs = useRef<Map<SoundType, HTMLAudioElement>>(new Map());
  const currentlyPlaying = useRef<SoundType | null>(null);

  // Preload audio files on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Preload each sound
    Object.entries(SOUND_PATHS).forEach(([type, path]) => {
      const audio = new Audio(path);
      audio.preload = 'auto';
      audio.volume = 0.7;
      audioRefs.current.set(type as SoundType, audio);
    });

    return () => {
      // Clean up audio elements
      audioRefs.current.forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      audioRefs.current.clear();
    };
  }, []);

  /**
   * Play a notification sound with optional vibration
   */
  const play = useCallback((type: SoundType, options: NotificationSoundOptions = {}) => {
    if (typeof window === 'undefined') return;

    const { volume = 0.7, loop = false, vibrate = true } = options;

    // Get or create audio element
    let audio = audioRefs.current.get(type);
    if (!audio) {
      audio = new Audio(SOUND_PATHS[type]);
      audioRefs.current.set(type, audio);
    }

    // Configure and play
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.loop = loop;
    audio.currentTime = 0;
    currentlyPlaying.current = type;

    // Handle ended event
    audio.onended = () => {
      if (!loop) {
        currentlyPlaying.current = null;
      }
    };

    // Play audio (may fail on some browsers without user interaction)
    audio.play().catch((err) => {
      console.warn('[NotificationSound] Play failed:', err.message);
    });

    // Trigger vibration if supported and enabled
    if (vibrate && 'vibrate' in navigator) {
      try {
        navigator.vibrate(VIBRATION_PATTERNS[type]);
      } catch (e) {
        // Vibration not supported or failed silently
      }
    }
  }, []);

  /**
   * Stop currently playing sound
   */
  const stop = useCallback((type?: SoundType) => {
    if (typeof window === 'undefined') return;

    if (type) {
      const audio = audioRefs.current.get(type);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        if (currentlyPlaying.current === type) {
          currentlyPlaying.current = null;
        }
      }
    } else {
      // Stop all sounds
      audioRefs.current.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
      currentlyPlaying.current = null;
    }

    // Also stop vibration
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch (e) {
        // Ignore
      }
    }
  }, []);

  /**
   * Check if a sound is currently playing
   */
  const isPlaying = useCallback((type?: SoundType) => {
    if (type) {
      return currentlyPlaying.current === type;
    }
    return currentlyPlaying.current !== null;
  }, []);

  /**
   * Play notification sound (short single sound)
   */
  const playNotification = useCallback(() => {
    play('notification', { loop: false, vibrate: true });
  }, [play]);

  /**
   * Play ringtone (looping, for incoming calls)
   */
  const playRingtone = useCallback(() => {
    play('ringtone', { loop: true, vibrate: true });
  }, [play]);

  /**
   * Stop ringtone
   */
  const stopRingtone = useCallback(() => {
    stop('ringtone');
  }, [stop]);

  /**
   * Play ringback (looping, when waiting for call to connect)
   */
  const playRingback = useCallback(() => {
    play('ringback', { loop: true, vibrate: false });
  }, [play]);

  /**
   * Stop ringback
   */
  const stopRingback = useCallback(() => {
    stop('ringback');
  }, [stop]);

  return {
    play,
    stop,
    isPlaying,
    playNotification,
    playRingtone,
    stopRingtone,
    playRingback,
    stopRingback,
  };
}

/**
 * Global singleton instance for use outside React components
 * Uses WeakRef pattern to allow garbage collection when not in use
 */
let globalAudioInstances: Map<SoundType, HTMLAudioElement> | null = null;
let globalCleanupScheduled = false;

function scheduleGlobalCleanup(): void {
  if (globalCleanupScheduled || typeof window === 'undefined') return;
  
  globalCleanupScheduled = true;
  
  // Clean up after 5 minutes of inactivity
  setTimeout(() => {
    if (globalAudioInstances) {
      globalAudioInstances.forEach((audio) => {
        if (audio.paused) {
          audio.src = '';
        }
      });
      // Only clear if all are paused
      const allPaused = Array.from(globalAudioInstances.values()).every(a => a.paused);
      if (allPaused) {
        globalAudioInstances.clear();
        globalAudioInstances = null;
      }
    }
    globalCleanupScheduled = false;
  }, 5 * 60 * 1000);
}

function getGlobalAudio(type: SoundType): HTMLAudioElement {
  if (typeof window === 'undefined') {
    throw new Error('Audio not available on server');
  }

  if (!globalAudioInstances) {
    globalAudioInstances = new Map();
  }

  let audio = globalAudioInstances.get(type);
  if (!audio) {
    audio = new Audio(SOUND_PATHS[type]);
    audio.preload = 'auto';
    audio.volume = 0.7;
    globalAudioInstances.set(type, audio);
  }

  // Schedule cleanup when audio is used
  scheduleGlobalCleanup();

  return audio;
}

/**
 * Play notification sound from anywhere (non-hook usage)
 */
export function playNotificationSound(
  type: SoundType = 'notification',
  options: NotificationSoundOptions = {}
): void {
  if (typeof window === 'undefined') return;

  const { volume = 0.7, loop = false, vibrate = true } = options;

  try {
    const audio = getGlobalAudio(type);
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.loop = loop;
    audio.currentTime = 0;

    audio.play().catch((err) => {
      console.warn('[NotificationSound] Global play failed:', err.message);
    });

    if (vibrate && 'vibrate' in navigator) {
      navigator.vibrate(VIBRATION_PATTERNS[type]);
    }
  } catch (e) {
    console.warn('[NotificationSound] Error:', e);
  }
}

/**
 * Stop a specific sound or all sounds (non-hook usage)
 */
export function stopNotificationSound(type?: SoundType): void {
  if (typeof window === 'undefined' || !globalAudioInstances) return;

  if (type) {
    const audio = globalAudioInstances.get(type);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  } else {
    globalAudioInstances.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }

  if ('vibrate' in navigator) {
    navigator.vibrate(0);
  }
}
