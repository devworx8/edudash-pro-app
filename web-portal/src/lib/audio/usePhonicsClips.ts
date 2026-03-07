'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PHONICS_CLIP_CATALOG,
  PHONICS_CLIP_MAP,
  type PhonicsClipId,
} from '@/lib/phonics/clipCatalog';

interface UsePhonicsClipsResult {
  clips: typeof PHONICS_CLIP_CATALOG;
  activeClipId: PhonicsClipId | null;
  playClip: (id: PhonicsClipId) => void;
  stop: () => void;
}

export function usePhonicsClips(): UsePhonicsClipsResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeClipId, setActiveClipId] = useState<PhonicsClipId | null>(null);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audioRef.current = null;
    setActiveClipId(null);
  }, []);

  const playClip = useCallback((id: PhonicsClipId) => {
    if (typeof window === 'undefined') return;

    if (activeClipId === id) {
      stop();
      return;
    }

    stop();

    const clip = PHONICS_CLIP_MAP[id];
    const audio = new Audio(clip.webPath);
    audio.preload = 'auto';
    audio.volume = 0.9;
    audio.onended = () => {
      setActiveClipId((current) => (current === id ? null : current));
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };

    audioRef.current = audio;
    setActiveClipId(id);
    audio.play().catch(() => {
      setActiveClipId(null);
      audioRef.current = null;
    });
  }, [activeClipId, stop]);

  useEffect(() => () => stop(), [stop]);

  return useMemo(
    () => ({
      clips: PHONICS_CLIP_CATALOG,
      activeClipId,
      playClip,
      stop,
    }),
    [activeClipId, playClip, stop],
  );
}
