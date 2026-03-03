/**
 * WhatsApp-Style Video Call Interface
 * 
 * A modern video call UI inspired by WhatsApp with:
 * - Floating local video preview (draggable)
 * - Minimizable call view
 * - Speaker/Bluetooth toggle
 * - Better control layout
 * - Smooth animations
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { assertSupabase } from '@/lib/supabase';
import { DeviceEventEmitter } from '@/lib/utils/eventEmitter';
import AudioModeCoordinator, { type AudioModeSession } from '@/lib/AudioModeCoordinator';
import { getPrewarmedCallObject } from '@/lib/calls/CallPrewarming';
import { sendIncomingCallPush } from '@/lib/calls/sendIncomingCallPush';
import { track } from '@/lib/analytics';
import { usePictureInPicture } from '@/hooks/usePictureInPicture';
import { useCallBackgroundHandler } from './hooks';
import { AddParticipantModal } from './AddParticipantModal';
import type { CallState, DailyParticipant } from './types';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// NOTE: Promise.any polyfill is loaded via Metro's getModulesRunBeforeMainModule
// in metro.config.js, which ensures it runs BEFORE any module initialization.
// No need for inline polyfill here.

// Lazy getter to avoid accessing supabase at module load time
const getSupabase = () => assertSupabase();

// KeepAwake tag for video calls
const VIDEO_CALL_KEEP_AWAKE_TAG = 'active-video-call';

// InCallManager for audio routing and ringback tones
let InCallManager: any = null;
try {
  InCallManager = require('react-native-incall-manager').default;
} catch (error) {
  console.warn('[VideoCall] InCallManager not available:', error);
}

// CRITICAL: Preload ringback sound at module level for instant playback
// This ensures the audio is ready when making outgoing calls
let RINGBACK_SOUND: any = null;
let RINGBACK_LOAD_ERROR: string | null = null;
try {
  RINGBACK_SOUND = require('@/assets/sounds/ringback.mp3');
  console.log('[VideoCall] ✅ Ringback sound loaded at module level');
} catch (error) {
  RINGBACK_LOAD_ERROR = String(error);
  console.warn('[VideoCall] ❌ Failed to load ringback sound:', error);
  // Try fallback to notification sound
  try {
    RINGBACK_SOUND = require('@/assets/sounds/notification.wav');
    RINGBACK_LOAD_ERROR = null;
    console.log('[VideoCall] ✅ Using notification.wav as ringback fallback');
  } catch (e2) {
    console.error('[VideoCall] ❌ Fallback sound also failed:', e2);
  }
}

// Note: Daily.co React Native SDK is conditionally imported
let Daily: any = null;
let DailyMediaView: any = null;
try {
  const dailyModule = require('@daily-co/react-native-daily-js');
  Daily = dailyModule.default;
  DailyMediaView = dailyModule.DailyMediaView;
} catch (error) {
  console.warn('[VideoCall] Daily.co SDK not available:', error);
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const LOCAL_VIDEO_WIDTH = 120;
const LOCAL_VIDEO_HEIGHT = 160;
const MINIMIZED_SIZE = 100;

interface WhatsAppStyleVideoCallProps {
  isOpen: boolean;
  onClose: () => void;
  roomName?: string;
  userName?: string;
  userPhoto?: string | null;
  remoteUserName?: string;
  remoteUserPhoto?: string | null;
  isOwner?: boolean;
  calleeId?: string;
  callId?: string;
  meetingUrl?: string;
  threadId?: string;
  onCallStateChange?: (state: CallState) => void;
  onMinimize?: () => void;
}

export function WhatsAppStyleVideoCall({
  isOpen,
  onClose,
  roomName,
  userName = 'You',
  userPhoto,
  remoteUserName = 'Participant',
  remoteUserPhoto,
  isOwner = false,
  calleeId,
  callId,
  meetingUrl,
  threadId,
  onCallStateChange,
  onMinimize,
}: WhatsAppStyleVideoCallProps) {
  const insets = useSafeAreaInsets();
  
  const [callState, setCallState] = useState<CallState>('idle');
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [localParticipant, setLocalParticipant] = useState<DailyParticipant | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<DailyParticipant[]>([]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showAddParticipants, setShowAddParticipants] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  // Screen share conflict detection
  const [remoteScreenSharerName, setRemoteScreenSharerName] = useState<string | null>(null);
  // View switching - user preference for main view
  const [preferLocalView, setPreferLocalView] = useState(false);
  // Call recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  // CRITICAL: State to trigger realtime subscription when call ID is set
  // Refs don't cause re-renders, so we need state to properly subscribe to call status changes
  const [activeCallId, setActiveCallId] = useState<string | null>(callId || null);
  const dailyRef = useRef<any>(null);
  const callIdRef = useRef<string | null>(callId || null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioSessionRef = useRef<AudioModeSession | null>(null);
  // Custom ringback via expo-audio (fallback when InCallManager ringback fails)
  const ringbackPlayerRef = useRef<AudioPlayer | null>(null);
  const ringbackStartedRef = useRef(false);
  const callTelemetryRef = useRef<{
    initStartedAt: number | null;
    tokenReceivedAt: number | null;
    joinStartedAt: number | null;
    joinedAt: number | null;
    ringbackStartedAt: number | null;
    firstRemoteAudioAt: number | null;
  }>({
    initStartedAt: null,
    tokenReceivedAt: null,
    joinStartedAt: null,
    joinedAt: null,
    ringbackStartedAt: null,
    firstRemoteAudioAt: null,
  });
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const controlsAnim = useRef(new Animated.Value(1)).current;
  
  // Ring timeout duration (30 seconds like WhatsApp)
  const RING_TIMEOUT_MS = 30000;
  const minimizedPosition = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - MINIMIZED_SIZE - 20, y: 100 })).current;
  const localVideoPosition = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - LOCAL_VIDEO_WIDTH - 16, y: insets.top + 16 })).current;

  // Picture-in-Picture mode for background video calls (Android)
  const { isInPipMode, isPipSupported, enterPipMode } = usePictureInPicture({
    // Auto-enter PiP when call is connected and app goes to background
    autoEnterOnBackground: isOpen && callState === 'connected',
    onEnterPiP: () => {
      console.log('[VideoCall] Entered PiP mode - video continues in floating window');
    },
    onExitPiP: () => {
      console.log('[VideoCall] Exited PiP mode');
    },
    // 16:9 landscape aspect ratio for video calls
    aspectRatioWidth: 16,
    aspectRatioHeight: 9,
  });

  // Background handling with foreground service for video calls
  useCallBackgroundHandler({
    callState,
    isCallActive: isOpen,
    callId: callIdRef.current,
    callerName: remoteUserName,
    callType: 'video',
    onReturnFromBackground: async () => {
      console.log('[VideoCall] Returned from background, isVideoEnabled:', isVideoEnabled);
      
      // Re-enable video when returning from background
      if (dailyRef.current && isVideoEnabled) {
        // Retry logic to ensure camera comes back on
        const enableCamera = async (attempt: number = 1) => {
          try {
            // First check current state
            const participants = dailyRef.current.participants();
            const localVideoState = participants?.local?.tracks?.video?.state;
            console.log('[VideoCall] Local video state on return:', localVideoState, 'attempt:', attempt);
            
            // Force enable regardless of current state
            await dailyRef.current.setLocalVideo(true);
            console.log('[VideoCall] ✅ Video re-enabled after background return');
            
            // Update participants to refresh video track
            setTimeout(() => updateParticipants(), 300);
          } catch (err) {
            console.warn('[VideoCall] Failed to re-enable video attempt', attempt, ':', err);
            // Retry up to 3 times with increasing delay
            if (attempt < 3) {
              setTimeout(() => enableCamera(attempt + 1), 500 * attempt);
            }
          }
        };
        
        // Small delay to let system stabilize
        setTimeout(() => enableCamera(), 200);
      }
    },
  });

  // Listen for mute toggle events from notification action buttons
  useEffect(() => {
    if (!isOpen) return;
    
    const muteListener = DeviceEventEmitter.addListener('call:toggle-mute', async () => {
      console.log('[VideoCall] 🔇 Toggle mute from notification');
      if (!dailyRef.current) return;
      try {
        await dailyRef.current.setLocalAudio(!isAudioEnabled);
        setIsAudioEnabled(!isAudioEnabled);
      } catch (err) {
        console.error('[VideoCall] Toggle audio error from notification:', err);
      }
    });
    
    const speakerListener = DeviceEventEmitter.addListener('call:toggle-speaker', () => {
      console.log('[VideoCall] 🔊 Toggle speaker from notification');
      // Inline speaker toggle to avoid dependency on toggleSpeaker which is defined later
      const newState = !isSpeakerOn;
      try {
        if (InCallManager) {
          InCallManager.setForceSpeakerphoneOn(newState);
          console.log('[VideoCall] Speaker toggled to:', newState ? 'speaker' : 'earpiece');
        }
        setIsSpeakerOn(newState);
      } catch (err) {
        console.error('[VideoCall] Toggle speaker error from notification:', err);
      }
    });
    
    return () => {
      muteListener.remove();
      speakerListener.remove();
    };
  }, [isOpen, isAudioEnabled, isSpeakerOn]);

  // Local video draggable
  const localVideoPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        localVideoPosition.setOffset({
          x: (localVideoPosition.x as any)._value,
          y: (localVideoPosition.y as any)._value,
        });
        localVideoPosition.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: localVideoPosition.x, dy: localVideoPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        localVideoPosition.flattenOffset();
        // Snap to edges
        const currentX = (localVideoPosition.x as any)._value;
        const snapX = currentX < SCREEN_WIDTH / 2 ? 16 : SCREEN_WIDTH - LOCAL_VIDEO_WIDTH - 16;
        Animated.spring(localVideoPosition.x, {
          toValue: snapX,
          useNativeDriver: false,
          tension: 100,
          friction: 10,
        }).start();
      },
    })
  ).current;

  // Update callIdRef when prop changes
  useEffect(() => {
    if (callId && !callIdRef.current) {
      callIdRef.current = callId;
    }
  }, [callId]);

  // Notify parent of state changes
  useEffect(() => {
    onCallStateChange?.(callState);
  }, [callState, onCallStateChange]);

  // Fade animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isOpen ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOpen, fadeAnim]);

  // Auto-hide controls
  useEffect(() => {
    if (callState === 'connected' && showControls) {
      controlsTimerRef.current = setTimeout(() => {
        Animated.timing(controlsAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setShowControls(false));
      }, 5000);
    }

    return () => {
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
    };
  }, [callState, showControls, controlsAnim]);

  // Call duration timer
  useEffect(() => {
    if (callState === 'connected') {
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [callState]);

  // Ringing timeout - end call if not answered within 30 seconds
  useEffect(() => {
    if (callState === 'connected' && ringingTimeoutRef.current) {
      console.log('[VideoCall] Call connected, clearing ring timeout');
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }
  }, [callState]);

  // Keep screen awake during video call
  useEffect(() => {
    const isCallActive = callState === 'connecting' || callState === 'ringing' || callState === 'connected';
    
    if (isOpen && isCallActive) {
      console.log('[VideoCall] Activating KeepAwake for video call');
      activateKeepAwakeAsync(VIDEO_CALL_KEEP_AWAKE_TAG).catch((err) => 
        console.warn('[VideoCall] Failed to activate KeepAwake:', err)
      );
    }
    
    return () => {
      console.log('[VideoCall] Deactivating KeepAwake');
      deactivateKeepAwake(VIDEO_CALL_KEEP_AWAKE_TAG);
    };
  }, [isOpen, callState]);

  // Format duration as MM:SS or HH:MM:SS
  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // CRITICAL: Sync activeCallId state with callId prop when set (callee case)
  // The prop (not ref) is used because props trigger re-renders when changed
  useEffect(() => {
    if (callId && !activeCallId) {
      console.log('[VideoCall] Syncing activeCallId from prop:', callId);
      setActiveCallId(callId);
      // Also update the ref for consistency
      if (!callIdRef.current) {
        callIdRef.current = callId;
      }
    }
  }, [callId, activeCallId]);

  // Listen for call status changes (other party hung up or rejected)
  // CRITICAL: Uses activeCallId STATE (not ref) to properly trigger re-subscription
  useEffect(() => {
    if (!activeCallId || callState === 'ended') {
      console.log('[VideoCall] No activeCallId or call ended, skipping realtime subscription');
      return;
    }

    console.log('[VideoCall] 🔔 Setting up realtime subscription for call:', activeCallId);

    const channel = getSupabase()
      .channel(`video-status-${activeCallId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'active_calls',
          filter: `call_id=eq.${activeCallId}`,
        },
        (payload: { new: { status: string } }) => {
          const newStatus = payload.new?.status;
          console.log('[VideoCall] 📣 Status changed:', newStatus, 'for call:', activeCallId);
          if (['ended', 'rejected', 'missed'].includes(newStatus)) {
            console.log('[VideoCall] Call ended/rejected/missed, cleaning up...');
            cleanupCall();
            setCallState('ended');
            onClose();
          }
        }
      )
      .subscribe((status) => {
        console.log('[VideoCall] Realtime subscription status:', status, 'for call:', activeCallId);
      });

    return () => {
      console.log('[VideoCall] Removing realtime subscription for call:', activeCallId);
      getSupabase().removeChannel(channel);
    };
  }, [activeCallId, callState, onClose]);

  // Cleanup call resources
  const cleanupCall = useCallback(async () => {
    // Release audio mode session
    if (audioSessionRef.current) {
      try {
        await audioSessionRef.current.release();
        console.log('[VideoCall] Audio session released');
        audioSessionRef.current = null;
      } catch (err) {
        console.warn('[VideoCall] Audio session release error:', err);
      }
    }
    
    // Stop custom ringback
    if (ringbackPlayerRef.current) {
      try {
        ringbackPlayerRef.current.pause();
        ringbackPlayerRef.current.remove();
      } catch (err) {
        // Ignore errors
      }
      ringbackPlayerRef.current = null;
      ringbackStartedRef.current = false;
    }
    
    // Stop InCallManager
    if (InCallManager) {
      try {
        InCallManager.stopRingback();
        InCallManager.stop();
        console.log('[VideoCall] InCallManager stopped');
      } catch (err) {
        console.warn('[VideoCall] InCallManager cleanup error:', err);
      }
    }
    
    // Stop Daily
    if (dailyRef.current) {
      try {
        dailyRef.current.leave();
        dailyRef.current.destroy();
      } catch (err) {
        console.warn('[VideoCall] Cleanup error:', err);
      }
      dailyRef.current = null;
    }
    
    // Clear active call ID state
    setActiveCallId(null);
  }, []);

  // Ringing timeout - end call if not answered within 30 seconds
  useEffect(() => {
    if (callState === 'ringing' && isOwner) {
      console.log('[VideoCall] Starting ring timeout:', RING_TIMEOUT_MS, 'ms');
      
      ringingTimeoutRef.current = setTimeout(async () => {
        console.log('[VideoCall] Ring timeout - no answer, marking as missed');
        
        // Update call status to missed
        if (callIdRef.current) {
          await getSupabase()
            .from('active_calls')
            .update({ status: 'missed' })
            .eq('call_id', callIdRef.current);
        }
        
        setError('No answer');
        setCallState('ended');
        
        // Haptic feedback for missed call
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        
        // Close the call UI after a brief delay
        setTimeout(() => {
          cleanupCall();
          onClose();
        }, 2000);
      }, RING_TIMEOUT_MS);
    }

    return () => {
      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }
    };
  }, [callState, isOwner, cleanupCall, onClose]);

  // Update participants state
  const updateParticipants = useCallback(() => {
    if (!dailyRef.current) return;

    const participants = dailyRef.current.participants();
    const local = participants.local;
    const remote = Object.values(participants).filter(
      (p: any) => !p.local
    ) as DailyParticipant[];

    // DEBUG: Log participant details
    console.log('[VideoCall] updateParticipants:', {
      totalParticipants: Object.keys(participants).length,
      participantKeys: Object.keys(participants),
      localSessionId: local?.session_id,
      localVideoState: local?.tracks?.video?.state,
      remoteCount: remote.length,
      remoteParticipants: remote.map((p: any) => ({
        sessionId: p.session_id,
        local: p.local,
        videoState: p.tracks?.video?.state,
        audioState: p.tracks?.audio?.state,
        hasVideoTrack: !!p.tracks?.video?.track,
        hasPersistentTrack: !!p.tracks?.video?.persistentTrack,
      })),
    });

    setLocalParticipant(local);
    setRemoteParticipants(remote);
  }, []);

  // Continuous earpiece enforcement during ringing/connecting
  // This prevents Android from auto-switching to speaker during ringback
  const earpieceEnforcerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  useEffect(() => {
    if (!InCallManager) return;
    
    const shouldEnforceEarpiece = (callState === 'connecting' || callState === 'ringing') && !isSpeakerOn;
    
    if (shouldEnforceEarpiece) {
      // Single enforcement on state transition — no interval loop
      // to avoid disrupting expo-audio ringback pipeline
      try {
        InCallManager.setForceSpeakerphoneOn(false);
        console.log('[VideoCall] Earpiece enforced on state transition');
      } catch (e) {
        console.warn('[VideoCall] Earpiece enforcement failed:', e);
      }

      earpieceEnforcerRef.current = setInterval(() => {
        if (!isSpeakerOn && (callState === 'connecting' || callState === 'ringing')) {
          try {
            InCallManager.setForceSpeakerphoneOn(false);
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
  }, [callState, isSpeakerOn]);

  /**
   * Play ringback tone for the caller while waiting for callee to answer.
   * We use expo-audio for stable earpiece routing on Android while ringing.
   */
  const playCustomRingback = useCallback(async (retryAttempt = 0) => {
    if (ringbackStartedRef.current && ringbackPlayerRef.current?.playing) {
      console.log('[VideoCall] Ringback already playing, skipping');
      return;
    }
    
    console.log('[VideoCall] 🔊 playCustomRingback called', {
      attempt: retryAttempt + 1,
      hasAsset: !!RINGBACK_SOUND,
    });
    
    // Use expo-audio with bundled sound for stable earpiece routing.
    if (!RINGBACK_SOUND) {
      console.error('[VideoCall] ❌ No ringback sound available');
      return;
    }
    
    const MAX_RETRIES = 3;
    const retryDelay = Math.min(500 * Math.pow(2, retryAttempt), 2000);
    
    try {
      console.log(`[VideoCall] 🔊 Starting ringback via expo-audio fallback (attempt ${retryAttempt + 1}/${MAX_RETRIES})`);
      
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        allowsRecording: true,
        shouldPlayInBackground: true,
        shouldRouteThroughEarpiece: true,
      });
      
      const player = createAudioPlayer(RINGBACK_SOUND);
      player.loop = true;
      player.volume = 1.0;
      ringbackPlayerRef.current = player;
      
      player.play();
      await new Promise(resolve => setTimeout(resolve, 200));
      
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
      
      if (retryAttempt < MAX_RETRIES - 1) {
        console.log(`[VideoCall] 🔄 Retrying ringback in ${retryDelay}ms...`);
        setTimeout(() => {
          playCustomRingback(retryAttempt + 1);
        }, retryDelay);
      }
    }
  }, []);

  /**
   * Stop custom ringback
   */
  const stopCustomRingback = useCallback(() => {
    if (ringbackStartedRef.current) {
      const startedAt = callTelemetryRef.current.ringbackStartedAt;
      track('edudash.calls.ringback_stopped', {
        call_type: 'video',
        duration_ms: typeof startedAt === 'number' ? Date.now() - startedAt : undefined,
      });
      callTelemetryRef.current.ringbackStartedAt = null;
    }
    // Stop expo-audio player if used
    if (ringbackPlayerRef.current) {
      try {
        ringbackPlayerRef.current.pause();
        ringbackPlayerRef.current.remove();
      } catch (e) {
        // Ignore errors
      }
      ringbackPlayerRef.current = null;
    }
    ringbackStartedRef.current = false;
  }, []);

  // InCallManager owns audio session; ringback audio is played via expo-audio.
  useEffect(() => {
    if (callState === 'connecting' || callState === 'ringing') {
      const initAudio = async () => {
        // STEP 1: Start InCallManager first to acquire audio session
        if (InCallManager) {
          try {
            InCallManager.start({ 
              media: 'audio',
              auto: false,
              ringback: ''
            });
            InCallManager.setForceSpeakerphoneOn(false);
            setIsSpeakerOn(false);
            InCallManager.setKeepScreenOn(true);
            console.log('[VideoCall] InCallManager started');
          } catch (err) {
            console.warn('[VideoCall] Failed to start InCallManager:', err);
          }
        }

        // STEP 2: Small delay to let audio session stabilize
        await new Promise(resolve => setTimeout(resolve, 150));

        // STEP 3: Set expo-audio mode AFTER InCallManager owns the session
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

        // STEP 4: Play ringback only for caller
        if (isOwner) {
          playCustomRingback();
        }
      };

      initAudio();
    } else if (callState === 'connected') {
      // Stop custom ringback when connected
      stopCustomRingback();
      
      if (InCallManager) {
        try {
          // Apply current speaker state (earpiece by default, unless user toggled)
          InCallManager.setForceSpeakerphoneOn(isSpeakerOn);
          console.log('[VideoCall] Call connected, audio on:', isSpeakerOn ? 'speaker' : 'earpiece');
        } catch (err) {
          console.warn('[VideoCall] Failed to update speaker state:', err);
        }
      }
    } else if (callState === 'ended' || callState === 'failed') {
      // Stop ringback on call end
      stopCustomRingback();
    }

    return () => {
      // Cleanup on unmount
      stopCustomRingback();
      if (InCallManager) {
        try {
          InCallManager.stop();
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    };
  }, [callState, isOwner, isSpeakerOn, playCustomRingback, stopCustomRingback]);

  // Initialize call
  useEffect(() => {
    if (!isOpen) return;
    if (!Daily) {
      setError('Video calls require a development build. Please rebuild the app.');
      setCallState('failed');
      return;
    }

    let isCleanedUp = false;

    const initializeCall = async () => {
      try {
        callTelemetryRef.current.initStartedAt = Date.now();
        callTelemetryRef.current.tokenReceivedAt = null;
        callTelemetryRef.current.joinStartedAt = null;
        callTelemetryRef.current.joinedAt = null;
        callTelemetryRef.current.ringbackStartedAt = null;
        callTelemetryRef.current.firstRemoteAudioAt = null;
        track('edudash.calls.init_started', { call_type: 'video', is_owner: isOwner });

        setCallState('connecting');
        setError(null);
        setCallDuration(0);

        // Get valid session token first
        let { data: sessionData, error: sessionError } = await getSupabase().auth.getSession();
        let accessToken = sessionData.session?.access_token;
        
        if (!accessToken || sessionError) {
          const { data: refreshData, error: refreshError } = await getSupabase().auth.refreshSession();
          if (refreshError || !refreshData.session?.access_token) {
            throw new Error('Not authenticated. Please sign in again.');
          }
          accessToken = refreshData.session.access_token;
          sessionData = refreshData;
        }

        const user = sessionData.session?.user;
        if (!user) {
          throw new Error('Not authenticated');
        }

        if (isCleanedUp) return;

        await cleanupCall();

        let roomUrl = meetingUrl;

        if (isOwner && !roomUrl) {
          // Create a new room via API
          const response = await fetch(
            `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/daily-rooms`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                name: `video-${Date.now()}`,
                isPrivate: true,
                expiryMinutes: 60,
                maxParticipants: 2,
              }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create room');
          }

          const { room } = await response.json();
          roomUrl = room.url;

          // Create call signaling record
          if (calleeId) {
            const newCallId = uuidv4();
            callIdRef.current = newCallId;
            // CRITICAL: Also set state to trigger realtime subscription
            setActiveCallId(newCallId);
            console.log('[VideoCall] 📞 Created call ID:', newCallId);

            const { data: callerProfile } = await getSupabase()
              .from('profiles')
              .select('first_name, last_name')
              .eq('auth_user_id', user.id)
              .maybeSingle();

            const callerName = callerProfile
              ? `${callerProfile.first_name || ''} ${callerProfile.last_name || ''}`.trim() || 'Someone'
              : 'Someone';

            await getSupabase().from('active_calls').insert({
              call_id: newCallId,
              caller_id: user.id,
              callee_id: calleeId,
              thread_id: threadId || null,
              call_type: 'video',
              status: 'ringing',
              caller_name: callerName,
              meeting_url: roomUrl,
            });

            // Keep call setup non-blocking while dispatching wake/push notifications.
            void sendIncomingCallPush({
              accessToken,
              calleeUserId: calleeId,
              callId: newCallId,
              callerId: user.id,
              callerName,
              callType: 'video',
              meetingUrl: roomUrl,
              threadId,
              source: 'VideoCall',
            })
              .then((pushResult) => {
                console.log('[VideoCall] incoming_call_push_dispatch', {
                  call_id: newCallId,
                  fcm_success_count: pushResult.fcmSuccessCount,
                  expo_fallback_sent: pushResult.expoFallbackSent,
                  platform_filter_used: pushResult.expoPlatformFilter,
                  error_codes: pushResult.errorCodes,
                });
              })
              .catch((err) => {
                console.warn('[VideoCall] incoming call push dispatch failed:', err);
              });

            await getSupabase().from('call_signals').insert({
              call_id: newCallId,
              from_user_id: user.id,
              to_user_id: calleeId,
              signal_type: 'offer',
              payload: {
                meeting_url: roomUrl,
                call_type: 'video',
                caller_name: callerName,
                thread_id: threadId,
              },
            });

            setCallState('ringing');
          }
        }

        if (!roomUrl) {
          throw new Error('No room URL available');
        }

        if (isCleanedUp) return;

        // Get room name from URL for token generation
        const actualRoomName = roomUrl.split('/').pop() || `video-${Date.now()}`;

        // Get meeting token for authentication
        console.log('[VideoCall] Getting meeting token for room:', actualRoomName);
        const tokenResponse = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/daily-token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              roomName: actualRoomName,
              userName: userName,
              isOwner: isOwner,
            }),
          }
        );

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json();
          console.warn('[VideoCall] Token fetch failed:', errorData);
          // Continue without token - room might be public
        }

        const tokenData = tokenResponse.ok ? await tokenResponse.json() : null;
        const meetingToken = tokenData?.token;

        callTelemetryRef.current.tokenReceivedAt = Date.now();
        track('edudash.calls.token_received', {
          call_type: 'video',
          ok: tokenResponse.ok,
          duration_ms: callTelemetryRef.current.initStartedAt
            ? callTelemetryRef.current.tokenReceivedAt - callTelemetryRef.current.initStartedAt
            : undefined,
        });

        if (meetingToken) {
          console.log('[VideoCall] ✅ Got meeting token');
        } else {
          console.log('[VideoCall] ⚠️ Joining without token (room may be public)');
        }

        if (isCleanedUp) return;

        // Create Daily call object (prefer prewarmed object to reduce startup latency)
        const daily =
          getPrewarmedCallObject(true) ||
          Daily.createCallObject({
            audioSource: true,
            videoSource: true,
          });

        dailyRef.current = daily;

        // Event listeners
        daily.on('joined-meeting', async () => {
          console.log('[VideoCall] Joined meeting');
          if (!callTelemetryRef.current.joinedAt) {
            callTelemetryRef.current.joinedAt = Date.now();
            track('edudash.calls.joined', {
              call_type: 'video',
              duration_ms: callTelemetryRef.current.initStartedAt
                ? callTelemetryRef.current.joinedAt - callTelemetryRef.current.initStartedAt
                : undefined,
              join_duration_ms: callTelemetryRef.current.joinStartedAt
                ? callTelemetryRef.current.joinedAt - callTelemetryRef.current.joinStartedAt
                : undefined,
            });
          }
          
          // CRITICAL: Subscribe to all tracks automatically (required for receiving remote video/audio)
          try {
            await daily.setSubscribeToTracksAutomatically(true);
            console.log('[VideoCall] ✅ Set auto-subscribe to tracks');
          } catch (err) {
            console.warn('[VideoCall] Failed to set auto-subscribe:', err);
          }
          
          // CRITICAL: Explicitly enable receiving video and audio from all participants
          try {
            await daily.updateReceiveSettings({ '*': { video: true, audio: true } });
            console.log('[VideoCall] ✅ Updated receive settings for video and audio');
          } catch (err) {
            console.warn('[VideoCall] Failed to update receive settings:', err);
          }
          
          // Explicitly enable camera and microphone after joining with retry
          const enableLocalMedia = async (attempt: number = 1) => {
            try {
              await daily.setLocalVideo(true);
              await daily.setLocalAudio(true);
              setIsVideoEnabled(true);
              setIsAudioEnabled(true);
              console.log('[VideoCall] ✅ Camera and mic enabled on attempt', attempt);
              
              // Force update participants to get video track state
              setTimeout(() => updateParticipants(), 500);
            } catch (err) {
              console.warn('[VideoCall] Failed to enable camera/mic attempt', attempt, ':', err);
              // Retry up to 3 times with 500ms delay
              if (attempt < 3) {
                setTimeout(() => enableLocalMedia(attempt + 1), 500);
              }
            }
          };
          
          await enableLocalMedia();
          
          // Don't set to connected yet if we're the caller waiting for the callee
          if (!isOwner || !calleeId) {
            // If answering a call or no callee, we're connected immediately
            setCallState('connected');
          } else {
            // Caller stays in ringing until callee joins
            console.log('[VideoCall] Waiting for callee to join...');
          }
          updateParticipants();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        });

        daily.on('left-meeting', () => {
          console.log('[VideoCall] Left meeting - closing call UI');
          setCallState('ended');
          // CRITICAL: Close the call interface when meeting is left
          onClose();
        });

        daily.on('participant-joined', () => {
          console.log('[VideoCall] Participant joined');
          updateParticipants();
          
          // When callee joins, switch from ringing to connected
          if (isOwner && calleeId) {
            console.log('[VideoCall] Callee joined! Switching to connected state');
            setCallState('connected');
          }
          
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        });

        daily.on('participant-left', () => {
          console.log('[VideoCall] Participant left');
          updateParticipants();
          
          // Check if all remote participants have left (1:1 call ended)
          setTimeout(() => {
            if (dailyRef.current) {
              const participants = dailyRef.current.participants();
              const remoteCount = Object.values(participants).filter((p: any) => !p.local).length;
              console.log('[VideoCall] Remote participants remaining:', remoteCount);
              
              if (remoteCount === 0 && (callState === 'connected' || callState === 'ringing')) {
                console.log('[VideoCall] Last remote participant left - ending call');
                // Update database and close
                if (callIdRef.current) {
                  getSupabase()
                    .from('active_calls')
                    .update({ status: 'ended', ended_at: new Date().toISOString() })
                    .eq('call_id', callIdRef.current)
                    .then(() => {
                      cleanupCall();
                      setCallState('ended');
                      onClose();
                    });
                } else {
                  cleanupCall();
                  setCallState('ended');
                  onClose();
                }
              }
            }
          }, 500);
        });

        daily.on('participant-updated', (event: any) => {
          const participant = event?.participant;
          console.log('[VideoCall] Participant updated:', {
            participant: participant?.session_id,
            videoState: participant?.tracks?.video?.state,
            audioState: participant?.tracks?.audio?.state,
            screenVideoState: participant?.tracks?.screenVideo?.state,
          });
          updateParticipants();

          // First remote audio telemetry (best-effort)
          if (
            participant &&
            participant.local === false &&
            participant?.tracks?.audio?.state === 'playable' &&
            !callTelemetryRef.current.firstRemoteAudioAt
          ) {
            callTelemetryRef.current.firstRemoteAudioAt = Date.now();
            track('edudash.calls.first_remote_audio', {
              call_type: 'video',
              duration_ms: callTelemetryRef.current.initStartedAt
                ? callTelemetryRef.current.firstRemoteAudioAt - callTelemetryRef.current.initStartedAt
                : undefined,
              join_to_audio_ms: callTelemetryRef.current.joinStartedAt
                ? callTelemetryRef.current.firstRemoteAudioAt - callTelemetryRef.current.joinStartedAt
                : undefined,
            });
          }
          
          // Screen share conflict detection
          // If remote participant started screen sharing while we're sharing, show alert
          if (!participant?.local && participant?.tracks?.screenVideo?.state === 'playable') {
            const remoteUserName = participant?.user_name || 'Another participant';
            setRemoteScreenSharerName(remoteUserName);
            
            // Only show alert if local user is also screen sharing
            if (isScreenSharing) {
              Alert.alert(
                'Screen Share Conflict',
                `${remoteUserName} started sharing their screen. Would you like to stop your screen share?`,
                [
                  { 
                    text: 'Keep Mine', 
                    style: 'cancel',
                    onPress: () => console.log('[VideoCall] User chose to keep their screen share')
                  },
                  { 
                    text: 'Stop Mine', 
                    style: 'destructive',
                    onPress: async () => {
                      if (dailyRef.current) {
                        try {
                          await dailyRef.current.stopScreenShare();
                          setIsScreenSharing(false);
                          console.log('[VideoCall] Stopped local screen share due to conflict');
                        } catch (err) {
                          console.error('[VideoCall] Failed to stop screen share:', err);
                        }
                      }
                    }
                  },
                ],
                { cancelable: true }
              );
            }
          } else if (!participant?.local && participant?.tracks?.screenVideo?.state !== 'playable') {
            // Remote stopped screen sharing
            setRemoteScreenSharerName(null);
          }
        });
        
        daily.on('track-started', async (event: any) => {
          const { participant, track } = event || {};
          
          console.log('[VideoCall] Track started:', {
            participant: participant?.session_id,
            track: track?.kind,
            isLocal: participant?.local,
          });
          
          updateParticipants();
          
          // For remote participants, ensure we're subscribed to their tracks
          if (!participant?.local && track?.kind) {
            try {
              // Verify receive settings are correct
              await daily.updateReceiveSettings({
                [participant.session_id]: { video: true, audio: true },
              });
              console.log('[VideoCall] ✅ Updated receive settings for remote participant:', participant.session_id);
            } catch (err) {
              console.warn('[VideoCall] Failed to update receive settings for participant:', err);
            }
          }
        });
        
        daily.on('track-stopped', (event: any) => {
          console.log('[VideoCall] Track stopped:', {
            participant: event?.participant?.session_id,
            track: event?.track?.kind,
          });
          updateParticipants();
        });

        daily.on('error', (event: any) => {
          console.error('[VideoCall] Error:', event);
          setError(event?.errorMsg || 'Call error');
          setCallState('failed');
        });
        
        daily.on('camera-error', (event: any) => {
          console.error('[VideoCall] Camera error:', event);
          setIsVideoEnabled(false);
        });
        
        // Recording events
        daily.on('recording-started', () => {
          console.log('[VideoCall] 🔴 Recording started');
          setIsRecording(true);
          setRecordingStartTime(Date.now());
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        });
        
        daily.on('recording-stopped', () => {
          console.log('[VideoCall] ⬛ Recording stopped');
          setIsRecording(false);
          setRecordingStartTime(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        });
        
        daily.on('recording-error', (event: any) => {
          console.error('[VideoCall] Recording error:', event);
          setIsRecording(false);
          setRecordingStartTime(null);
          setError('Recording failed');
          setTimeout(() => setError(null), 3000);
        });

        // CRITICAL: Request streaming audio mode from AudioModeCoordinator
        // This ensures WebRTC can properly capture and play audio, and coordinates
        // with other audio consumers (TTS, notifications) to prevent conflicts
        try {
          console.log('[VideoCall] Requesting streaming audio mode from coordinator...');
          audioSessionRef.current = await AudioModeCoordinator.requestAudioMode('streaming');
          console.log('[VideoCall] ✅ Audio session acquired:', audioSessionRef.current.id);
          
          // CRITICAL: Re-enforce earpiece AFTER AudioModeCoordinator applies settings
          // Wait a bit for audio routing to stabilize, then ensure InCallManager takes precedence
          setTimeout(() => {
            if (InCallManager) {
              try {
                InCallManager.setForceSpeakerphoneOn(false);
                console.log('[VideoCall] ✅ Re-enforced earpiece after AudioModeCoordinator');
              } catch (err) {
                console.warn('[VideoCall] Failed to re-enforce earpiece:', err);
              }
            }
          }, 200);
        } catch (audioModeError) {
          console.warn('[VideoCall] ⚠️ Failed to acquire audio mode (non-fatal):', audioModeError);
        }

        callTelemetryRef.current.joinStartedAt = Date.now();
        track('edudash.calls.join_started', {
          call_type: 'video',
          duration_ms: callTelemetryRef.current.initStartedAt
            ? callTelemetryRef.current.joinStartedAt - callTelemetryRef.current.initStartedAt
            : undefined,
        });

        await daily.join({ 
          url: roomUrl,
          token: meetingToken, // Include token for private rooms
          subscribeToTracksAutomatically: true,
          audioSource: true,
          videoSource: true,
        });
        
        // CRITICAL: Final earpiece enforcement after Daily.co join
        // This ensures InCallManager settings take precedence over any audio mode changes
        setTimeout(() => {
          if (InCallManager) {
            try {
              InCallManager.setForceSpeakerphoneOn(false);
              console.log('[VideoCall] ✅ Final earpiece enforcement after join');
            } catch (err) {
              console.warn('[VideoCall] Failed final earpiece enforcement:', err);
            }
          }
        }, 300);
      } catch (err) {
        console.error('[VideoCall] Init error:', err);
        setError(err instanceof Error ? err.message : 'Failed to start call');
        setCallState('failed');
      }
    };

    initializeCall();

    return () => {
      isCleanedUp = true;
      cleanupCall();
    };
  }, [isOpen, meetingUrl, userName, isOwner, calleeId, threadId, cleanupCall, updateParticipants]);

  // Show controls on tap
  const handleScreenTap = useCallback(() => {
    if (!showControls) {
      setShowControls(true);
      Animated.timing(controlsAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [showControls, controlsAnim]);

  // Toggle microphone
  const toggleAudio = useCallback(async () => {
    if (!dailyRef.current) return;
    try {
      await dailyRef.current.setLocalAudio(!isAudioEnabled);
      setIsAudioEnabled(!isAudioEnabled);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      console.error('[VideoCall] Toggle audio error:', err);
    }
  }, [isAudioEnabled]);

  // Toggle camera with retry logic
  const toggleVideo = useCallback(async () => {
    if (!dailyRef.current) {
      console.warn('[VideoCall] Cannot toggle video - Daily object not available');
      return;
    }
    
    const newState = !isVideoEnabled;
    console.log('[VideoCall] Toggling video to:', newState);
    
    // Retry logic for enabling camera (can fail if system hasn't released camera)
    const setVideo = async (enabled: boolean, attempt: number = 1) => {
      try {
        await dailyRef.current.setLocalVideo(enabled);
        setIsVideoEnabled(enabled);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        console.log('[VideoCall] ✅ Video toggled to', enabled, 'on attempt', attempt);
        
        // Update participants to get new track state
        setTimeout(() => updateParticipants(), 300);
      } catch (err) {
        console.warn('[VideoCall] Toggle video failed attempt', attempt, ':', err);
        
        // Only retry when ENABLING (turning camera on is more likely to need retry)
        if (enabled && attempt < 3) {
          console.log('[VideoCall] Retrying enable video...');
          setTimeout(() => setVideo(enabled, attempt + 1), 500);
        } else {
          setError(enabled ? 'Failed to enable camera. Try again.' : 'Failed to disable camera.');
          setTimeout(() => setError(null), 3000);
        }
      }
    };
    
    await setVideo(newState);
  }, [isVideoEnabled, updateParticipants]);

  // Flip camera
  const flipCamera = useCallback(async () => {
    if (!dailyRef.current) return;
    try {
      await dailyRef.current.cycleCamera();
      setIsFrontCamera(!isFrontCamera);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      console.error('[VideoCall] Flip camera error:', err);
    }
  }, [isFrontCamera]);

  // Toggle speaker
  const toggleSpeaker = useCallback(async () => {
    const newState = !isSpeakerOn;
    try {
      if (InCallManager) {
        InCallManager.setForceSpeakerphoneOn(newState);
        console.log('[VideoCall] Speaker toggled to:', newState ? 'speaker' : 'earpiece');
      }
      setIsSpeakerOn(newState);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      console.error('[VideoCall] Toggle speaker error:', err);
    }
  }, [isSpeakerOn]);

  // Toggle screen sharing
  const toggleScreenShare = useCallback(async () => {
    if (!dailyRef.current) return;
    
    // Check iOS screen share extension requirement
    if (Platform.OS === 'ios' && Platform.Version && Number(Platform.Version) < 14) {
      setError('Screen share requires iOS 14 or later');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    try {
      if (isScreenSharing) {
        await dailyRef.current.stopScreenShare();
        console.log('[VideoCall] Screen share stopped');
      } else {
        console.log('[VideoCall] Starting screen share...');
        await dailyRef.current.startScreenShare();
        console.log('[VideoCall] Screen share started');
      }
      setIsScreenSharing(!isScreenSharing);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err: any) {
      console.error('[VideoCall] Screen share error:', err);
      
      // Platform-specific error messages
      if (Platform.OS === 'ios') {
        // iOS requires Screen Share Extension to be set up
        if (err?.message?.includes('extension') || err?.message?.includes('broadcast')) {
          setError('Screen share extension not configured. Contact app developer.');
        } else if (err?.message?.includes('permission') || err?.message?.includes('denied')) {
          setError('Screen share permission denied');
        } else {
          setError('Screen share not available on this device');
        }
      } else {
        // Android errors
        if (err?.message?.includes('permission') || err?.message?.includes('denied')) {
          setError('Screen share permission denied');
        } else if (err?.message?.includes('FOREGROUND') || err?.message?.includes('mediaProjection')) {
          setError('Screen share not permitted. Please update the app.');
        } else {
          setError('Screen sharing failed. Try again.');
        }
      }
      setTimeout(() => setError(null), 4000);
    }
  }, [isScreenSharing]);

  // Copy meeting link to invite others
  const shareCallLink = useCallback(async () => {
    if (!meetingUrl) {
      setError('No meeting link available');
      setTimeout(() => setError(null), 3000);
      return;
    }
    try {
      const { Share } = require('react-native');
      await Share.share({
        message: `Join my video call: ${meetingUrl}`,
        title: 'Join Video Call',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('[VideoCall] Share error:', err);
    }
  }, [meetingUrl]);

  // Toggle call recording (only available to room owner)
  const toggleRecording = useCallback(async () => {
    if (!dailyRef.current) return;
    
    // Only room owner can start/stop recording
    if (!isOwner) {
      setError('Only the call host can start recording');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    try {
      if (isRecording) {
        console.log('[VideoCall] Stopping recording...');
        await dailyRef.current.stopRecording();
        setError('Recording stopped');
      } else {
        console.log('[VideoCall] Starting recording...');
        // Start cloud recording (stored in Daily.co cloud)
        await dailyRef.current.startRecording({
          type: 'cloud',
        });
        setError('Recording started');
      }
      setTimeout(() => setError(null), 2000);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err: any) {
      console.error('[VideoCall] Recording toggle error:', err);
      setError(err?.message || 'Recording failed');
      setTimeout(() => setError(null), 3000);
    }
  }, [isRecording, isOwner]);

  // Toggle view preference (local vs remote in main view)
  const toggleViewPreference = useCallback(() => {
    setPreferLocalView(prev => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log('[VideoCall] View preference toggled to:', !preferLocalView ? 'local' : 'remote');
  }, [preferLocalView]);

  // End call
  const handleEndCall = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    if (callIdRef.current) {
      // Update call status with ended_at timestamp to prevent race conditions
      await getSupabase()
        .from('active_calls')
        .update({ 
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('call_id', callIdRef.current);
    }

    cleanupCall();
    setCallState('ended');
    onClose();
  }, [cleanupCall, onClose]);

  // Minimize call
  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
    onMinimize?.();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [onMinimize]);

  if (!isOpen) return null;

  // Check if any remote participant is screen sharing
  const screenSharingParticipant = remoteParticipants.find(
    (p: any) => p.tracks?.screenVideo?.state === 'playable'
  );

  const mainParticipant = remoteParticipants[0] || localParticipant;
  const hasRemoteVideo = remoteParticipants[0]?.tracks?.video?.state === 'playable';
  const hasLocalVideo = localParticipant?.tracks?.video?.state === 'playable' && isVideoEnabled;
  // CRITICAL: Only show local video in main view if there are NO remote participants
  // If remote participant exists but video is off, show "Camera off" - NOT local video
  const hasRemoteParticipant = remoteParticipants.length > 0;
  const showLocalInMainView = !hasRemoteParticipant && hasLocalVideo;

  // Get the actual video track for local video (with fallbacks)
  const localVideoTrack = localParticipant?.tracks?.video?.persistentTrack 
    || localParticipant?.tracks?.video?.track 
    || null;
    
  // Determine which video track to show in main view
  // Priority: 1. Remote screen share, 2. User preference (if both videos available), 3. Remote video, 4. Local video
  const getMainVideoTrack = () => {
    // Screen share always takes priority
    if (screenSharingParticipant) {
      const screenTrack = screenSharingParticipant.tracks?.screenVideo;
      return screenTrack?.persistentTrack || screenTrack?.track || null;
    }
    
    // If user prefers local view and both videos available, show local
    if (preferLocalView && hasLocalVideo && hasRemoteVideo) {
      return localVideoTrack;
    }
    
    // Default: show remote if available
    if (hasRemoteVideo) {
      return remoteParticipants[0]?.tracks?.video?.persistentTrack || remoteParticipants[0]?.tracks?.video?.track || null;
    }
    
    // Fallback to local if no remote
    if (showLocalInMainView) {
      return localVideoTrack;
    }
    return null;
  };
  
  // Determine what's showing in main view for view switch button label
  const isShowingLocalInMain = preferLocalView && hasLocalVideo && hasRemoteVideo;

  // DEBUG: Log video rendering decision with full track details
  console.log('[VideoCall] Render decision:', {
    hasRemoteVideo,
    hasLocalVideo,
    hasRemoteParticipant,
    showLocalInMainView,
    isVideoEnabled,
    screenSharing: !!screenSharingParticipant,
    DailyMediaViewAvailable: !!DailyMediaView,
    localParticipantExists: !!localParticipant,
    localVideoState: localParticipant?.tracks?.video?.state,
    localHasPersistentTrack: !!localParticipant?.tracks?.video?.persistentTrack,
    localHasTrack: !!localParticipant?.tracks?.video?.track,
    localVideoTrackExists: !!localVideoTrack,
    remoteParticipantsCount: remoteParticipants.length,
    remoteVideoState: remoteParticipants[0]?.tracks?.video?.state,
  });

  // Minimized view (Picture-in-Picture)
  if (isMinimized) {
    return (
      <Animated.View
        style={[
          styles.minimizedContainer,
          {
            transform: minimizedPosition.getTranslateTransform(),
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setIsMinimized(false)}
          style={styles.minimizedContent}
        >
          {hasRemoteVideo && DailyMediaView ? (
            <DailyMediaView
              videoTrack={remoteParticipants[0]?.tracks?.video?.persistentTrack || remoteParticipants[0]?.tracks?.video?.track || null}
              audioTrack={remoteParticipants[0]?.tracks?.audio?.persistentTrack || remoteParticipants[0]?.tracks?.audio?.track || null}
              style={styles.minimizedVideo}
              objectFit="cover"
            />
          ) : (
            <View style={styles.minimizedPlaceholder}>
              <Ionicons name="videocam" size={24} color="#fff" />
            </View>
          )}
          <View style={styles.minimizedOverlay}>
            <Text style={styles.minimizedDuration}>{formatDuration(callDuration)}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.minimizedEndButton}
          onPress={handleEndCall}
        >
          <Ionicons name="call" size={16} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleScreenTap}
        style={styles.mainVideoContainer}
      >
        {/* Main Video View - Priority: screen share > remote video > local video */}
        {(screenSharingParticipant || hasRemoteVideo || showLocalInMainView) && DailyMediaView ? (
          <DailyMediaView
            videoTrack={getMainVideoTrack()}
            audioTrack={remoteParticipants[0]?.tracks?.audio?.persistentTrack || remoteParticipants[0]?.tracks?.audio?.track || null}
            style={styles.mainVideo}
            objectFit={screenSharingParticipant ? 'contain' : 'cover'}
            mirror={showLocalInMainView && !screenSharingParticipant ? isFrontCamera : false}
          />
        ) : (
          <LinearGradient
            colors={['#1a1a2e', '#16213e', '#0f3460']}
            style={styles.noVideoContainer}
          >
            {remoteUserPhoto ? (
              <Image source={{ uri: remoteUserPhoto }} style={styles.noVideoAvatar} />
            ) : (
              <View style={styles.noVideoAvatarPlaceholder}>
                <Ionicons name="person" size={80} color="rgba(255,255,255,0.5)" />
              </View>
            )}
            <Text style={styles.noVideoName}>{remoteUserName}</Text>
            <Text style={styles.noVideoStatus}>
              {callState === 'connecting' ? 'Connecting...' : 
               callState === 'ringing' ? 'Ringing...' :
               remoteParticipants.length === 0 ? 'Waiting for participant...' : 'Camera off'}
            </Text>
          </LinearGradient>
        )}
      </TouchableOpacity>
      
      {/* Screen Share Indicator */}
      {screenSharingParticipant && (
        <View style={styles.screenShareIndicator}>
          <Ionicons name="desktop-outline" size={16} color="#00f5ff" />
          <Text style={styles.screenShareText}>Screen sharing</Text>
        </View>
      )}

      {/* Local Video Preview (Draggable) */}
      {/* Show local video when:
          1. We have local video AND remote participants (PiP mode), OR
          2. We have local video AND no remote participants yet (show in main view area as preview) */}
      {hasLocalVideo && DailyMediaView ? (
        <Animated.View
          style={[
            styles.localVideoContainer,
            { transform: localVideoPosition.getTranslateTransform() },
          ]}
          {...localVideoPanResponder.panHandlers}
        >
          <DailyMediaView
            videoTrack={localParticipant?.tracks?.video?.persistentTrack || localParticipant?.tracks?.video?.track || null}
            audioTrack={null}
            style={[styles.localVideo, { width: LOCAL_VIDEO_WIDTH - 4, height: LOCAL_VIDEO_HEIGHT - 4 }]}
            objectFit="cover"
            mirror={isFrontCamera}
            zOrder={1}
          />
        </Animated.View>
      ) : (
        // Show placeholder if local video conditions not met during call
        callState === 'connected' && !hasLocalVideo && DailyMediaView && (
          <View style={[styles.localVideoContainer, { backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name={isVideoEnabled ? "videocam" : "videocam-off"} size={20} color="rgba(255,255,255,0.5)" />
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, marginTop: 4 }}>
              {isVideoEnabled ? 'Starting...' : 'Camera off'}
            </Text>
          </View>
        )
      )}

      {/* Top Bar */}
      <Animated.View style={[styles.topBar, { opacity: controlsAnim, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.topButton} onPress={handleMinimize}>
          <Ionicons name="chevron-down" size={28} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.callInfo}>
          <Text style={styles.callerName}>{remoteUserName}</Text>
          <Text style={styles.callDuration}>
            {callState === 'connected' ? formatDuration(callDuration) :
             callState === 'ringing' ? 'Ringing...' :
             callState === 'connecting' ? 'Connecting...' : ''}
          </Text>
        </View>

        <TouchableOpacity style={styles.topButton} onPress={flipCamera}>
          <Ionicons name="camera-reverse" size={24} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      {/* Error Message */}
      {/* Recording Indicator */}
      {isRecording && (
        <View style={[styles.recordingIndicator, { top: insets.top + 60 }]}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Recording</Text>
        </View>
      )}

      {error && (
        <View style={[styles.errorContainer, { top: insets.top + (isRecording ? 100 : 60) }]}>
          <Ionicons name="alert-circle" size={18} color="#fff" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Bottom Controls */}
      <Animated.View style={[styles.bottomControls, { opacity: controlsAnim, paddingBottom: insets.bottom + 16 }]}>
        {/* Secondary Controls Row - More features */}
        <View style={styles.secondaryControls}>
          <TouchableOpacity style={styles.secondaryButton} onPress={toggleSpeaker}>
            <Ionicons 
              name={isSpeakerOn ? 'volume-high' : 'volume-mute'} 
              size={24} 
              color="#fff" 
            />
            <Text style={styles.secondaryLabel}>Speaker</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={flipCamera}>
            <Ionicons name="camera-reverse" size={24} color="#fff" />
            <Text style={styles.secondaryLabel}>Flip</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.secondaryButton, isScreenSharing && styles.secondaryButtonActive]} 
            onPress={toggleScreenShare}
          >
            <Ionicons 
              name={isScreenSharing ? 'stop-circle' : 'share-outline'} 
              size={24} 
              color={isScreenSharing ? '#ef4444' : '#fff'} 
            />
            <Text style={[styles.secondaryLabel, isScreenSharing && { color: '#ef4444' }]}>
              {isScreenSharing ? 'Stop' : 'Share'}
            </Text>
          </TouchableOpacity>

          {/* View Switch - only show when both local and remote video available */}
          {hasRemoteVideo && hasLocalVideo && (
            <TouchableOpacity style={styles.secondaryButton} onPress={toggleViewPreference}>
              <Ionicons 
                name={isShowingLocalInMain ? 'person-circle' : 'people-circle'} 
                size={24} 
                color="#fff" 
              />
              <Text style={styles.secondaryLabel}>
                {isShowingLocalInMain ? 'Remote' : 'Local'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Recording - only show for room owner */}
          {isOwner && (
            <TouchableOpacity 
              style={[styles.secondaryButton, isRecording && styles.secondaryButtonActive]} 
              onPress={toggleRecording}
            >
              <Ionicons 
                name={isRecording ? 'stop-circle' : 'radio-button-on'} 
                size={24} 
                color={isRecording ? '#ef4444' : '#fff'} 
              />
              <Text style={[styles.secondaryLabel, isRecording && { color: '#ef4444' }]}>
                {isRecording ? 'Stop Rec' : 'Record'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowAddParticipants(true)}>
            <Ionicons name="person-add" size={24} color="#fff" />
            <Text style={styles.secondaryLabel}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Main Controls Row */}
        <View style={styles.mainControls}>
          <TouchableOpacity
            style={[styles.controlButton, !isVideoEnabled && styles.controlButtonOff]}
            onPress={toggleVideo}
          >
            <Ionicons
              name={isVideoEnabled ? 'videocam' : 'videocam-off'}
              size={28}
              color="#fff"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, !isAudioEnabled && styles.controlButtonOff]}
            onPress={toggleAudio}
          >
            <Ionicons
              name={isAudioEnabled ? 'mic' : 'mic-off'}
              size={28}
              color="#fff"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, styles.endCallButton]}
            onPress={handleEndCall}
          >
            <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
        </View>

        {/* Participant count indicator */}
        {remoteParticipants.length > 0 && (
          <View style={styles.participantCount}>
            <Ionicons name="people" size={16} color="#fff" />
            <Text style={styles.participantCountText}>{remoteParticipants.length + 1}</Text>
          </View>
        )}
      </Animated.View>

      {/* Add Participant Modal */}
      <AddParticipantModal
        visible={showAddParticipants}
        onClose={() => setShowAddParticipants(false)}
        callId={callIdRef.current}
        meetingUrl={meetingUrl || null}
        callerName={userName}
        callType="video"
        excludeUserIds={remoteParticipants.map(p => p.user_id).filter(Boolean)}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 9999,
  },
  mainVideoContainer: {
    flex: 1,
  },
  mainVideo: {
    flex: 1,
  },
  noVideoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noVideoAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
  },
  noVideoAvatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  noVideoName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  noVideoStatus: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
  },
  localVideoContainer: {
    position: 'absolute',
    width: LOCAL_VIDEO_WIDTH,
    height: LOCAL_VIDEO_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    backgroundColor: '#000',
    zIndex: 100,
  },
  localVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a2e',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  topButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callInfo: {
    alignItems: 'center',
  },
  callerName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  callDuration: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 2,
  },
  errorContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    padding: 12,
    borderRadius: 8,
  },
  errorText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 14,
    flex: 1,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  secondaryControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 60,
    marginBottom: 24,
  },
  secondaryButton: {
    alignItems: 'center',
  },
  secondaryLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  mainControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonOff: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  endCallButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FF3B30',
  },
  secondaryButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
    padding: 4,
  },
  participantCount: {
    position: 'absolute',
    top: 8,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  participantCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  minimizedContainer: {
    position: 'absolute',
    width: MINIMIZED_SIZE,
    height: MINIMIZED_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  minimizedContent: {
    flex: 1,
  },
  minimizedVideo: {
    flex: 1,
  },
  minimizedPlaceholder: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimizedOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  minimizedDuration: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  minimizedEndButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenShareIndicator: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 100,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 245, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  screenShareText: {
    color: '#00f5ff',
    fontSize: 13,
    fontWeight: '500',
  },
  recordingIndicator: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  recordingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default WhatsAppStyleVideoCall;
