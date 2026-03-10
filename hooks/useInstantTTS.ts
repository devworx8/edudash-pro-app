/**
 * useInstantTTS - Hook for instant TTS playback
 * 
 * Provides ChatGPT-like instant TTS response through:
 * - Pre-buffering first chunk while text is being generated
 * - Streaming playback for reduced latency
 * - Automatic chunk management
 */

import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { assertSupabase } from '@/lib/supabase';
import { splitIntoSpeechChunks, InstantTTSPlayer } from '@/lib/voice/instantTTS';

interface UseInstantTTSOptions {
  language?: string;
  onStart?: () => void;
  onChunkReady?: (chunkId: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

interface UseInstantTTSReturn {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  isBuffering: boolean;
}

export function useInstantTTS(options: UseInstantTTSOptions = {}): UseInstantTTSReturn {
  const playerRef = useRef<InstantTTSPlayer | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  const speak = useCallback(async (text: string) => {
    // Stop any existing playback
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current = null;
    }

    // For web platform, use the instant TTS player
    if (Platform.OS === 'web') {
      try {
        const supabase = assertSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.access_token) {
          // Fall back to browser TTS
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            setIsSpeaking(true);
            options.onStart?.();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = options.language || 'en-ZA';
            utterance.rate = 0.9;
            
            utterance.onend = () => {
              setIsSpeaking(false);
              options.onComplete?.();
            };
            
            utterance.onerror = () => {
              setIsSpeaking(false);
              options.onError?.(new Error('Speech synthesis error'));
            };
            
            window.speechSynthesis.speak(utterance);
          }
          return;
        }

        setIsBuffering(true);
        
        playerRef.current = new InstantTTSPlayer(session.access_token, {
          language: options.language,
          onStart: () => {
            setIsBuffering(false);
            setIsSpeaking(true);
            options.onStart?.();
          },
          onChunkReady: options.onChunkReady,
          onComplete: () => {
            setIsSpeaking(false);
            setIsBuffering(false);
            options.onComplete?.();
          },
          onError: (error) => {
            setIsSpeaking(false);
            setIsBuffering(false);
            options.onError?.(error);
          },
        });

        await playerRef.current.addText(text);
      } catch (error) {
        setIsBuffering(false);
        setIsSpeaking(false);
        options.onError?.(error instanceof Error ? error : new Error('TTS failed'));
      }
    } else {
      // For native platforms, the voice orb handles TTS
      // This hook just provides the text chunking logic
      setIsSpeaking(true);
      options.onStart?.();
      
      const chunks = splitIntoSpeechChunks(text);
      // The actual TTS will be handled by the native voice orb
      // This is a placeholder for the native implementation
      
      setTimeout(() => {
        setIsSpeaking(false);
        options.onComplete?.();
      }, text.length * 50); // Approximate reading time
    }
  }, [options]);

  const stop = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current = null;
    }
    setIsSpeaking(false);
    setIsBuffering(false);

    // Also stop browser TTS if active
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    isBuffering,
  };
}

export default useInstantTTS;