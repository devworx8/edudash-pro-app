/**
 * CourseVideoPlayer
 * 
 * Video player component for online courses with:
 * - Playback controls
 * - Progress tracking
 * - Auto-save progress
 * - Fullscreen support
 * - Speed control
 * 
 * Uses expo-video (SDK 54+) for modern video playback on native
 * Falls back to HTML5 video on web
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { percentWidth } from '@/lib/progress/clampPercent';
// Conditional imports for native video
let useVideoPlayer: any = null;
let VideoView: any = null;

if (Platform.OS !== 'web') {
  try {
    const expoVideo = require('expo-video');
    useVideoPlayer = expoVideo.useVideoPlayer;
    VideoView = expoVideo.VideoView;
  } catch (e) {
    console.warn('[CourseVideoPlayer] expo-video not available, using fallback');
  }
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_HEIGHT = (SCREEN_WIDTH * 9) / 16; // 16:9 aspect ratio

interface CourseVideoPlayerProps {
  videoUrl: string;
  courseId?: string;
  lessonId?: string;
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
  autoplay?: boolean;
  startTime?: number; // Resume from saved position
}

// Web fallback video player using HTML5 video
function WebVideoPlayer({
  videoUrl,
  autoplay,
  startTime,
  onProgress,
  onComplete,
}: CourseVideoPlayerProps) {
  return (
    <View style={webStyles.container}>
      <video
        src={videoUrl}
        autoPlay={autoplay}
        controls
        style={{ width: '100%', height: VIDEO_HEIGHT, backgroundColor: '#000', borderRadius: 12 }}
        onTimeUpdate={(e) => {
          const video = e.target as HTMLVideoElement;
          if (onProgress && video.duration > 0) {
            onProgress((video.currentTime / video.duration) * 100);
          }
        }}
        onEnded={() => onComplete?.()}
      />
    </View>
  );
}

const webStyles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 16,
  },
});

// Native video player using expo-video
function NativeVideoPlayer({
  videoUrl,
  autoplay = false,
  startTime = 0,
  onProgress,
  onComplete,
}: CourseVideoPlayerProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(theme);

  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [currentPosition, setCurrentPosition] = useState(startTime);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasCompletedRef = useRef(false);

  // Create video player with expo-video hook
  // Note: NativeVideoPlayer is only rendered when useVideoPlayer is available
  const playerCallback = useCallback((p: any) => {
    p.loop = false;
    p.timeUpdateEventInterval = 1;
    if (autoplay) {
      p.play();
    }
  }, [autoplay]);
  
  // useVideoPlayer is guaranteed to be available when NativeVideoPlayer is rendered
  const player = useVideoPlayer!(videoUrl, playerCallback);

  // Listen for player status changes
  useEffect(() => {
    if (!player) return;

    const statusSubscription = player.addListener('statusChange', (event: any) => {
      if (event.status === 'readyToPlay') {
        setIsLoading(false);
        setDuration(player.duration);
        if (startTime > 0) {
          player.currentTime = startTime;
        }
      } else if (event.status === 'loading') {
        setIsLoading(true);
      } else if (event.status === 'error') {
        setIsLoading(false);
        console.error('Video playback error:', event.error);
      }
    });

    const playingSubscription = player.addListener('playingChange', (event: any) => {
      setIsPlaying(event.isPlaying);
    });

    const timeUpdateSubscription = player.addListener('timeUpdate', (event: any) => {
      setCurrentPosition(event.currentTime);
      if (player.duration > 0 && onProgress) {
        const progress = (event.currentTime / player.duration) * 100;
        onProgress(progress);
      }
    });

    const endSubscription = player.addListener('playToEnd', () => {
      if (!hasCompletedRef.current && onComplete) {
        hasCompletedRef.current = true;
        onComplete();
      }
    });

    return () => {
      statusSubscription.remove();
      playingSubscription.remove();
      timeUpdateSubscription.remove();
      endSubscription.remove();
    };
  }, [player, startTime, onProgress, onComplete]);

  // Auto-hide controls after 3 seconds
  useEffect(() => {
    if (isPlaying && showControls) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isPlaying, showControls]);

  const togglePlayPause = useCallback(() => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
      setShowControls(true);
    }
  }, [player, isPlaying]);

  const handleSeek = useCallback((position: number) => {
    if (!player || duration <= 0) return;
    const seekTime = (position / 100) * duration;
    player.currentTime = seekTime;
    setShowControls(true);
  }, [player, duration]);

  const changePlaybackRate = useCallback((rate: number) => {
    if (!player) return;
    player.playbackRate = rate;
    setPlaybackRate(rate);
  }, [player]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentPosition / duration) * 100 : 0;

  // If expo-video isn't available, show a message
  if (!VideoView || !player) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Ionicons name="videocam-off-outline" size={48} color={theme.textSecondary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary, marginTop: 12 }]}>
          Video player requires app rebuild
        </Text>
        <Text style={[styles.loadingText, { color: theme.textSecondary, fontSize: 12 }]}>
          Run: npx expo run:android
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.videoContainer}
        activeOpacity={1}
        onPress={() => setShowControls(!showControls)}
      >
        <VideoView
          style={styles.video}
          player={player}
          contentFit="contain"
          nativeControls={false}
          allowsFullscreen={true}
          onFullscreenEnter={() => setIsFullscreen(true)}
          onFullscreenExit={() => setIsFullscreen(false)}
        />

        {isLoading && (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={styles.loadingText}>
              {t('course.loading_video', { defaultValue: 'Loading video...' })}
            </Text>
          </View>
        )}

        {/* Video Overlay Controls */}
        {showControls && !isLoading && (
          <View style={styles.overlay}>
            <TouchableOpacity
              style={styles.playButton}
              onPress={togglePlayPause}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={48}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Controls Bar */}
        {showControls && !isLoading && (
          <View style={styles.controlsBar}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={togglePlayPause}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={24}
                color="#fff"
              />
            </TouchableOpacity>

            <Text style={styles.timeText}>{formatTime(currentPosition)}</Text>

            {/* Progress Bar */}
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: percentWidth(progress), backgroundColor: theme.primary },
                  ]}
                />
              </View>
              <TouchableOpacity
                style={styles.seekButton}
                onPressIn={() => {}}
                onPressOut={(e) => {
                  const { locationX } = e.nativeEvent;
                  const percentage = (locationX / SCREEN_WIDTH) * 100;
                  handleSeek(percentage);
                }}
              />
            </View>

            <Text style={styles.timeText}>{formatTime(duration)}</Text>

            {/* Speed Control */}
            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => {
                const rates = [0.75, 1.0, 1.25, 1.5, 2.0];
                const currentIndex = rates.indexOf(playbackRate);
                const nextIndex = (currentIndex + 1) % rates.length;
                changePlaybackRate(rates[nextIndex]);
              }}
            >
              <Text style={styles.speedText}>{playbackRate}x</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

export function CourseVideoPlayer(props: CourseVideoPlayerProps) {
  // Use web video player on web, native player on mobile
  // Fall back to web player if expo-video is not available
  if (Platform.OS === 'web' || !useVideoPlayer) {
    return <WebVideoPlayer {...props} />;
  }

  return <NativeVideoPlayer {...props} />;
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 16,
  },
  videoContainer: {
    width: '100%',
    height: VIDEO_HEIGHT,
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 14,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    gap: 8,
  },
  controlButton: {
    padding: 4,
  },
  timeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 45,
  },
  progressBarContainer: {
    flex: 1,
    height: 20,
    position: 'relative',
    justifyContent: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  seekButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  speedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});




