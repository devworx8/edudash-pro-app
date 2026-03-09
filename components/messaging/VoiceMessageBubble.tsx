/**
 * VoiceMessageBubble.tsx
 *
 * WhatsApp-style voice message player component using expo-audio
 * Supports background playback with media controls
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { assertSupabase } from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

import type { MessageReaction } from './types';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface VoiceMessageBubbleProps {
  /** URL or storage path to the audio file */
  audioUrl: string;
  /** Duration in seconds (from message metadata) */
  duration?: number;
  /** Whether this is the current user's message */
  isOwnMessage?: boolean;
  /** Timestamp to display */
  timestamp?: string;
  /** Sender name (for received messages) */
  senderName?: string;
  /** Whether message has been read */
  isRead?: boolean;
  /** Long press handler for context menu (reactions, reply, forward, delete) */
  onLongPress?: () => void;
  /** Called when playback finishes - use for continuous play */
  onPlaybackFinished?: () => void;
  /** Called when user taps "next" in media controls */
  onPlayNext?: () => void;
  /** Called when user taps "previous" in media controls */
  onPlayPrevious?: () => void;
  /** Whether there's a next message to play */
  hasNext?: boolean;
  /** Whether there's a previous message to play */
  hasPrevious?: boolean;
  /** Auto-start playback when true (for continuous play */
  autoPlay?: boolean;
  /** Custom styles */
  style?: object;
  /** Theme colors */
  theme?: {
    primary?: string;
    background?: string;
    text?: string;
    textSecondary?: string;
  };
  /** Message reactions */
  reactions?: MessageReaction[];
  /** Message ID for reaction handling */
  messageId?: string;
  /** Handler for clicking on reaction to delete it */
  onReactionPress?: (messageId: string, emoji: string) => void;
  /** Handler for long-press on reaction to show who reacted */
  onReactionLongPress?: (emoji: string, reactedByUserIds: string[]) => void;
  /** Group chats open reaction details on tap instead of treating taps as remove */
  showReactionDetailsOnPress?: boolean;
  /** Transcription text (pre-fetched from useVoiceTranscription cache) */
  transcriptionText?: string;
  /** Whether this message is currently being transcribed */
  isTranscribing?: boolean;
  /** Called when user taps the transcribe button */
  onTranscribe?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_THEME = {
  primary: '#25D366',
  background: '#075E54',
  text: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.7)', // More visible on green
};

const WAVEFORM_BARS = 28;
const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format seconds to mm:ss
 */
function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function generateWaveformFromUrl(url: string): number[] {
  const bars: number[] = [];
  let hash = 0;

  // Simple hash from URL
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }

  // Generate bar heights (0.2 to 1.0)
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    const seed = Math.abs((hash * (i + 1)) % 100);
    bars.push(0.2 + (seed / 100) * 0.8);
  }

  return bars;
}

/**
 * Get signed URL for Supabase storage paths
 */
async function getSignedUrl(path: string): Promise<string | null> {
  // If it's already a full URL, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  try {
    const supabase = assertSupabase();
    const { data, error } = await supabase.storage
      .from('voice_recordings')
      .createSignedUrl(path, 3600); // 1 hour expiry

    if (error) {
      // Log concisely - file may have been deleted
      if (__DEV__) {
        console.warn('[VoiceMessageBubble] Audio not found:', path);
      }
      return null;
    }

    return data?.signedUrl || null;
  } catch (err) {
    if (__DEV__) {
      console.warn('[VoiceMessageBubble] Failed to get signed URL for:', path);
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function VoiceMessageBubble({
  audioUrl,
  duration: providedDuration,
  isOwnMessage = false,
  timestamp,
  senderName,
  isRead,
  onLongPress,
  onPlaybackFinished,
  onPlayNext,
  onPlayPrevious,
  hasNext = false,
  hasPrevious = false,
  autoPlay = false,
  style,
  theme: customTheme,
  reactions,
  messageId,
  onReactionPress,
  onReactionLongPress,
  showReactionDetailsOnPress = false,
  transcriptionText,
  isTranscribing = false,
  onTranscribe,
}: VoiceMessageBubbleProps) {
  const theme = { ...DEFAULT_THEME, ...customTheme };
  
  // Get all reactions with counts > 0
  const activeReactions = reactions?.filter(r => r.count > 0) || [];

  // ─── State ─────────────────────────────────────────────────────────────────
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);

  // Waveform animation refs
  const waveformAnimations = useRef<Animated.Value[]>(
    Array.from({ length: WAVEFORM_BARS }, () => new Animated.Value(0))
  ).current;

  // ─── Resolve Audio URL ─────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function resolveUrl() {
      setIsLoading(true);
      setError(null);

      try {
        const url = await getSignedUrl(audioUrl);
        if (mounted) {
          if (url) {
            setResolvedUrl(url);
          } else {
            setError('Could not load audio');
          }
        }
      } catch (err) {
        if (mounted) {
          setError('Failed to load audio');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    resolveUrl();

    return () => {
      mounted = false;
    };
  }, [audioUrl]);

  // ─── Configure Audio Mode ──────────────────────────────────────────────────
  useEffect(() => {
    async function configureAudio() {
      try {
        // BLUETOOTH FIX: Don't specify shouldRouteThroughEarpiece
        // This allows the system to maintain Bluetooth routing if connected
        // Previously, setting shouldRouteThroughEarpiece: false would force speaker
        // and disconnect Bluetooth headsets
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
          interruptionModeAndroid: 'doNotMix',
          allowsRecording: false,
          // shouldRouteThroughEarpiece: false, // REMOVED - preserves Bluetooth routing
        });
        if (__DEV__) {
          console.log('[VoiceMessageBubble] Audio mode configured (Bluetooth-aware)');
        }
      } catch (err) {
        console.error('[VoiceMessageBubble] Failed to configure audio mode:', err);
      }
    }

    configureAudio();
  }, []);

  // ─── Audio Player Hook ─────────────────────────────────────────────────────
  const player = useAudioPlayer(resolvedUrl || undefined);
  const status = useAudioPlayerStatus(player);

  // ─── Derived State ─────────────────────────────────────────────────────────
  const isPlaying = status?.playing ?? false;
  const isLoaded = status?.isLoaded ?? false;
  const currentTime = status?.currentTime ?? 0;
  const audioDuration = status?.duration ?? providedDuration ?? 0;
  const didJustFinish = status?.didJustFinish ?? false;

  // Progress (0 to 1)
  const progress = useMemo(() => {
    if (isSeeking) return seekPosition;
    if (!audioDuration || audioDuration === 0) return 0;
    return Math.min(currentTime / audioDuration, 1);
  }, [currentTime, audioDuration, isSeeking, seekPosition]);

  // Display duration
  const displayDuration = useMemo(() => {
    if (isPlaying || currentTime > 0) {
      return formatDuration(currentTime);
    }
    return formatDuration(audioDuration || providedDuration || 0);
  }, [isPlaying, currentTime, audioDuration, providedDuration]);

  // Generate waveform bars
  const waveformBars = useMemo(
    () => generateWaveformFromUrl(audioUrl),
    [audioUrl]
  );

  // ─── Handle Finish ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (didJustFinish) {
      // PAUSE first, then reset to beginning and clear lock screen
      player.pause();
      player.seekTo(0);
      player.setActiveForLockScreen(false);
      
      // Notify parent for continuous playback
      onPlaybackFinished?.();
    }
  }, [didJustFinish, player, onPlaybackFinished]);

  // ─── Auto Play (for continuous playback) ───────────────────────────────────
  useEffect(() => {
    if (autoPlay && isLoaded && !error) {
      // Start playback automatically (even if currently playing from a previous message)
      console.log('[VoiceMessageBubble] Auto-play triggered, isPlaying:', isPlaying, 'isLoaded:', isLoaded);
      (async () => {
        try {
          // Stop any current playback first
          if (isPlaying) {
            await player.pause();
            await player.seekTo(0);
          }
          
          await setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: 'doNotMix',
            interruptionModeAndroid: 'doNotMix',
            allowsRecording: false,
          });
          player.setPlaybackRate(playbackSpeed);
          player.setActiveForLockScreen(true, {
            title: 'Voice Message',
            artist: 'EduDash Pro',
          }, {
            showSeekBackward: hasPrevious,
            showSeekForward: hasNext,
          });
          await player.play();
          console.log('[VoiceMessageBubble] Auto-play started successfully');
        } catch (err) {
          console.error('[VoiceMessageBubble] Auto-play error:', err);
        }
      })();
    }
  }, [autoPlay, isLoaded, error, player, playbackSpeed, hasPrevious, hasNext, onPlayPrevious, onPlayNext]);

  // ─── Waveform Animation ────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      // Animate waveform bars
      const animations = waveformAnimations.map((anim, index) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1,
              duration: 200 + (index % 5) * 50,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0,
              duration: 200 + (index % 5) * 50,
              useNativeDriver: true,
            }),
          ])
        );
      });

      Animated.parallel(animations).start();

      return () => {
        animations.forEach((anim) => anim.stop());
      };
    } else {
      // Reset animations
      waveformAnimations.forEach((anim) => anim.setValue(0));
    }
  }, [isPlaying, waveformAnimations]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(async () => {
    if (!isLoaded || error) return;

    try {
      if (isPlaying) {
        await player.pause();
        // Remove from lock screen when paused
        player.setActiveForLockScreen(false);
      } else {
        // Re-configure audio mode before playing to ensure background works
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
          interruptionModeAndroid: 'doNotMix',
          allowsRecording: false,
        });
        
        // Set playback speed
        player.setPlaybackRate(playbackSpeed);
        
        // Enable lock screen controls with metadata and navigation BEFORE playing
        // This starts the Android foreground service for background playback
        player.setActiveForLockScreen(true, {
          title: 'Voice Message',
          artist: 'EduDash Pro',
        }, {
          showSeekBackward: hasPrevious,
          showSeekForward: hasNext,
        });
        await player.play();
      }
    } catch (err) {
      console.error('[VoiceMessageBubble] Play/pause error:', err);
    }
  }, [isLoaded, isPlaying, player, error, playbackSpeed, hasPrevious, hasNext, onPlayPrevious, onPlayNext]);

  // Cycle through playback speeds (1x → 1.5x → 2x → 1x)
  const handleSpeedChange = useCallback(() => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackSpeed(newSpeed);
    
    // Apply immediately if playing
    if (isPlaying) {
      player.setPlaybackRate(newSpeed);
    }
    
    Vibration.vibrate(20);
  }, [playbackSpeed, isPlaying, player]);

  // Handle long press with haptic feedback
  const handleLongPress = useCallback(() => {
    Vibration.vibrate(50);
    onLongPress?.();
  }, [onLongPress]);

  // ─── Clean up lock screen on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      // Clear lock screen controls when component unmounts
      try {
        player.clearLockScreenControls();
      } catch {
        // Ignore errors on cleanup
      }
    };
  }, [player]);

  const handleSeek = useCallback(
    async (normalizedPosition: number) => {
      if (!isLoaded || !audioDuration) return;

      const seekTime = normalizedPosition * audioDuration;
      try {
        await player.seekTo(seekTime);
      } catch (err) {
        console.error('[VoiceMessageBubble] Seek error:', err);
      }
    },
    [isLoaded, audioDuration, player]
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  // Loading state
  if (isLoading) {
    return (
      <View 
        style={[
          styles.container, 
          styles.loading, 
          { alignSelf: isOwnMessage ? 'flex-end' : 'flex-start' },
          style
        ]}
      >
        <EduDashSpinner size="small" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading audio...
        </Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View 
        style={[
          styles.container, 
          styles.error, 
          { alignSelf: isOwnMessage ? 'flex-end' : 'flex-start' },
          style
        ]}
      >
        <Ionicons name="alert-circle" size={24} color="#FF6B6B" />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <Pressable
      onLongPress={handleLongPress}
      delayLongPress={300}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: isOwnMessage ? theme.primary : theme.background,
          alignSelf: isOwnMessage ? 'flex-end' : 'flex-start',
          opacity: pressed ? 0.9 : 1,
          transform: pressed ? [{ scale: 0.98 }] : [{ scale: 1 }],
        },
        style,
      ]}
    >
      {/* Sender name for received messages */}
      {!isOwnMessage && senderName && (
        <Text style={[styles.senderName, { color: theme.primary }]} numberOfLines={1}>
          {senderName}
        </Text>
      )}
      
      <View style={styles.contentRow}>
        {/* Play/Pause Button */}
        <TouchableOpacity
          style={[styles.playButton, { backgroundColor: isOwnMessage ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)' }]}
          onPress={handlePlayPause}
          activeOpacity={0.7}
          disabled={!isLoaded}
        >
          {!isLoaded ? (
            <EduDashSpinner size="small" color={theme.text} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={22}
              color={theme.text}
              style={!isPlaying ? { marginLeft: 2 } : undefined}
            />
          )}
        </TouchableOpacity>

        {/* Waveform + Controls */}
        <View style={styles.waveformContainer}>
          <View style={styles.waveform}>
            {waveformBars.map((height, index) => {
              const barProgress = index / WAVEFORM_BARS;
              const isActive = barProgress <= progress;

              return (
                <Animated.View
                  key={index}
                  style={[
                    styles.waveformBar,
                    {
                      height: 4 + height * 20, // Fixed height calculation
                      backgroundColor: isActive ? theme.text : theme.textSecondary,
                      opacity: isActive ? 1 : 0.4,
                      transform: [
                        {
                          scaleY: waveformAnimations[index].interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.2],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              );
            })}
          </View>

          {/* Duration Row */}
          <View style={styles.durationRow}>
            <Text style={[styles.duration, { color: theme.text }]}>
              {displayDuration}
            </Text>
            
            {/* Speed Control Button */}
            <TouchableOpacity
              onPress={handleSpeedChange}
              style={[
                styles.speedButton,
                { backgroundColor: isOwnMessage ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)' }
              ]}
              activeOpacity={0.7}
            >
              <Text style={[styles.speedText, { color: theme.text }]}>
                {playbackSpeed}x
              </Text>
            </TouchableOpacity>
            
            {timestamp && (
              <Text style={[styles.timestamp, { color: isOwnMessage ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.7)' }]}>
                {timestamp}
              </Text>
            )}
          </View>
        </View>
        
        {/* Mic icon indicator */}
        <Ionicons 
          name="mic" 
          size={16} 
          color={isOwnMessage ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.7)'} 
          style={styles.micIcon}
        />
      </View>
      
      {/* Transcribe button + transcription text */}
      {onTranscribe && !transcriptionText && !isTranscribing && (
        <TouchableOpacity
          style={styles.transcribeButton}
          onPress={onTranscribe}
          activeOpacity={0.7}
        >
          <Ionicons name="document-text-outline" size={13} color={theme.textSecondary} />
          <Text style={[styles.transcribeLabel, { color: theme.textSecondary }]}>
            Transcribe
          </Text>
        </TouchableOpacity>
      )}
      {isTranscribing && (
        <View style={styles.transcribingRow}>
          <EduDashSpinner size="small" color={theme.textSecondary} />
          <Text style={[styles.transcribeLabel, { color: theme.textSecondary }]}>
            Transcribing...
          </Text>
        </View>
      )}
      {transcriptionText && (
        <View style={styles.transcriptionCard}>
          <Text style={[styles.transcriptionText, { color: theme.text }]}>
            {transcriptionText}
          </Text>
        </View>
      )}

      {/* Reaction display below bubble - show all reactions with counts */}
      {activeReactions.length > 0 && (
        <View
          style={[
            styles.reactionsBelowBubble,
            isOwnMessage ? styles.reactionsBelowOwn : styles.reactionsBelowOther
          ]}
        >
          {activeReactions.map((reaction) => (
            <TouchableOpacity
              key={reaction.emoji}
              style={[
                styles.reactionPill,
                reaction.hasReacted && styles.reactionPillActive
              ]}
              onPress={() => {
                const ids = reaction.reactedByUserIds ?? [];
                if (showReactionDetailsOnPress && ids.length > 0 && onReactionLongPress) {
                  onReactionLongPress(reaction.emoji, ids);
                  return;
                }
                if (messageId) onReactionPress?.(messageId, reaction.emoji);
              }}
              onLongPress={() => {
                const ids = reaction.reactedByUserIds ?? [];
                if (ids.length > 0 && onReactionLongPress) onReactionLongPress(reaction.emoji, ids);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
              {reaction.count > 1 && (
                <Text style={styles.reactionCount}>{reaction.count}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    padding: 10,
    paddingBottom: 8,
    borderRadius: 16,
    minWidth: 220,
    maxWidth: 300,
    marginVertical: 5,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 2,
  },
  loading: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingVertical: 16,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
  },
  error: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingVertical: 16,
  },
  errorText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#FF6B6B',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  waveformContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    gap: 2,
    overflow: 'hidden',
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
    minHeight: 4,
    maxHeight: 24,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  duration: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  speedButton: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  speedText: {
    fontSize: 11,
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 10,
    marginLeft: 'auto',
  },
  micIcon: {
    marginLeft: 6,
    opacity: 0.6,
  },
  reactionsBelowBubble: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  reactionsBelowOwn: {
    justifyContent: 'flex-end',
    marginRight: 8,
  },
  reactionsBelowOther: {
    justifyContent: 'flex-start',
    marginLeft: 8,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    gap: 2,
  },
  reactionPillActive: {
    borderColor: 'rgba(59, 130, 246, 0.5)',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  reactionEmoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  reactionCount: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  transcribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  transcribingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  transcribeLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  transcriptionCard: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  transcriptionText: {
    fontSize: 13,
    lineHeight: 18,
  },
});

// Named export for compatibility with existing imports
export { VoiceMessageBubble };
