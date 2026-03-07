import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { type AudioPlayer } from 'expo-audio';
import { assertSupabase } from '@/lib/supabase';
import { DeviceEventEmitter } from '@/lib/utils/eventEmitter';
import AudioModeCoordinator, { type AudioModeSession } from '@/lib/AudioModeCoordinator';
import { getPrewarmedCallObject } from '@/lib/calls/CallPrewarming';
import { sendIncomingCallPush } from '@/lib/calls/sendIncomingCallPush';
import { track } from '@/lib/analytics';
import { usePictureInPicture } from '@/hooks/usePictureInPicture';
import {
  useCallBackgroundHandler,
  useWhatsAppVideoCallAudioEffects,
  useWhatsAppVideoCallControls,
} from './hooks';
import { AddParticipantModal } from './AddParticipantModal';
import type { CallState, DailyParticipant } from './types';
import { LOCAL_VIDEO_WIDTH, MINIMIZED_SIZE, SCREEN_WIDTH } from './WhatsAppStyleVideoCall.constants';
import { WhatsAppStyleVideoCallPresentation } from './WhatsAppStyleVideoCallPresentation';
import {
  Daily,
  DailyMediaView,
  InCallManager,
  RINGBACK_SOUND,
  VIDEO_CALL_KEEP_AWAKE_TAG,
} from './WhatsAppStyleVideoCall.runtime';
import type { WhatsAppStyleVideoCallProps } from './WhatsAppStyleVideoCall.types';
import {
  formatCallDuration,
  getParticipantVideoTrack,
  logRenderDecision,
  resolveMainVideoTrack,
} from './WhatsAppStyleVideoCall.helpers';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// Lazy getter to avoid accessing supabase at module load time
const getSupabase = () => assertSupabase();

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
  const cleanupInProgressRef = useRef(false);
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

  const formatDuration = formatCallDuration;

  const cleanupCall = useCallback(async () => {
    if (cleanupInProgressRef.current) {
      return;
    }
    cleanupInProgressRef.current = true;

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
    cleanupInProgressRef.current = false;
  }, []);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCallId, callState, onClose, cleanupCall]);

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

  useWhatsAppVideoCallAudioEffects({
    callState,
    isOwner,
    isSpeakerOn,
    inCallManager: InCallManager,
    ringbackSound: RINGBACK_SOUND,
    ringbackPlayerRef,
    ringbackStartedRef,
    callTelemetryRef,
    setIsSpeakerOn,
  });

  // Initialize call
  useEffect(() => {
    if (!isOpen) return;
    if (!Daily) {
      setError('Video calls require a development build. Please rebuild the app.');
      setCallState('failed');
      return;
    }

    let isCleanedUp = false;

    const getErrorText = (error: unknown): string => {
      if (!error) return '';
      if (typeof error === 'string') return error;
      if (error instanceof Error && typeof error.message === 'string') return error.message;
      const maybeError = error as { errorMsg?: unknown; error?: { message?: unknown } };
      if (typeof maybeError.errorMsg === 'string') return maybeError.errorMsg;
      if (typeof maybeError.error?.message === 'string') return maybeError.error.message;
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    };

    const initializeCall = async () => {
      try {
        callTelemetryRef.current.initStartedAt = Date.now();
        callTelemetryRef.current.tokenReceivedAt = null;
        callTelemetryRef.current.joinStartedAt = null;
        callTelemetryRef.current.joinedAt = null;
        callTelemetryRef.current.ringbackStartedAt = null;
        callTelemetryRef.current.firstRemoteAudioAt = null;
        
        // Detect voice→video upgrade: meetingUrl provided AND isOwner
        const isUpgradeFromVoice = isOwner && !!meetingUrl;
        track('edudash.calls.init_started', { call_type: 'video', is_owner: isOwner, is_upgrade: isUpgradeFromVoice });

        // For upgrades, skip connecting/ringing states — the call is already active
        setCallState(isUpgradeFromVoice ? 'connected' : 'connecting');
        setError(null);
        if (!isUpgradeFromVoice) setCallDuration(0);

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

        if (isOwner && calleeId && calleeId === user.id) {
          console.warn('[VideoCall] Blocking self-call attempt');
          setError('You cannot call your own account.');
          setCallState('ended');
          setTimeout(() => onClose(), 500);
          return;
        }

        if (isCleanedUp) return;

        // Clean up previous call only if one exists (skip for fresh calls)
        if (dailyRef.current) {
          await cleanupCall();
        }

        let roomUrl = meetingUrl;

        // UPGRADE PATH: If meetingUrl is provided with isOwner, this is a
        // voice→video upgrade. Skip room creation, skip signaling — just join
        // the existing room with video enabled.
        const isUpgrade = isOwner && !!roomUrl;
        if (isUpgrade) {
          console.log('[VideoCall] 🔄 Voice→Video upgrade: reusing existing room', roomUrl);
          // Use existing callId if provided (from the upgrade)
          if (callId && !callIdRef.current) {
            callIdRef.current = callId;
            setActiveCallId(callId);
          }
        }

        if (isOwner && !roomUrl) {
          // Create a new room via API (fresh call, NOT an upgrade)
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
              .eq('id', user.id)
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

            // OPTIMIZATION: Fire signal insert in parallel with token fetch below
            const signalPromise = Promise.resolve(
              getSupabase().from('call_signals').insert({
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
              })
            ).then(() => console.log('[VideoCall] Signal sent'))
              .catch(err => console.warn('[VideoCall] Signal insert failed:', err));

            setCallState('ringing');
          }
        }

        if (!roomUrl) {
          throw new Error('No room URL available');
        }

        if (isCleanedUp) return;

        // OPTIMIZATION: Fetch token in parallel with Daily.co object creation
        const actualRoomName = roomUrl.split('/').pop() || `video-${Date.now()}`;
        console.log('[VideoCall] Getting token + creating call object in parallel...');

        const tokenPromise = fetch(
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
        ).then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            console.log('[VideoCall] ✅ Got meeting token');
            return data?.token as string | null;
          }
          console.warn('[VideoCall] Token fetch failed:', res.status);
          return null;
        }).catch((err) => {
          console.warn('[VideoCall] Token fetch error:', err);
          return null;
        });

        const meetingToken = await tokenPromise;

        callTelemetryRef.current.tokenReceivedAt = Date.now();
        track('edudash.calls.token_received', {
          call_type: 'video',
          ok: !!meetingToken,
          duration_ms: callTelemetryRef.current.initStartedAt
            ? callTelemetryRef.current.tokenReceivedAt - callTelemetryRef.current.initStartedAt
            : undefined,
        });

        if (isCleanedUp) return;

        // Create Daily call object (prefer prewarmed object to reduce startup latency)
        let daily = getPrewarmedCallObject(true);
        if (daily) {
          try {
            // Validate prewarmed instance before binding listeners / joining.
            daily.meetingState?.();
          } catch (err) {
            const prewarmedError = getErrorText(err);
            console.warn('[VideoCall] Discarding stale prewarmed Daily call object:', prewarmedError);
            try {
              daily.destroy?.();
            } catch {
              // Ignore stale object destroy errors.
            }
            daily = null;
          }
        }
        if (!daily) {
          daily = Daily.createCallObject({
            audioSource: true,
            videoSource: true,
          });
        }

        dailyRef.current = daily;
        const isCallDisposed = () => isCleanedUp || dailyRef.current !== daily;

        // Event listeners
        daily.on('joined-meeting', async () => {
          if (isCallDisposed()) return;
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
            if (isCallDisposed()) return;
            await daily.setSubscribeToTracksAutomatically(true);
            console.log('[VideoCall] ✅ Set auto-subscribe to tracks');
          } catch (err) {
            console.warn('[VideoCall] Failed to set auto-subscribe:', err);
          }
          
          // CRITICAL: Explicitly enable receiving video and audio from all participants
          try {
            if (isCallDisposed()) return;
            await daily.updateReceiveSettings({ '*': { video: true, audio: true } });
            console.log('[VideoCall] ✅ Updated receive settings for video and audio');
          } catch (err) {
            console.warn('[VideoCall] Failed to update receive settings:', err);
          }
          
          // Explicitly enable camera and microphone after joining with retry
          const enableLocalMedia = async (attempt: number = 1) => {
            try {
              if (isCallDisposed()) return;
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
          if (isCallDisposed()) return;
          console.log('[VideoCall] Left meeting - closing call UI');
          setCallState('ended');
          // CRITICAL: Close the call interface when meeting is left
          onClose();
        });

        daily.on('participant-joined', () => {
          if (isCallDisposed()) return;
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
          if (isCallDisposed()) return;
          console.log('[VideoCall] Participant left');
          updateParticipants();
          
          // Check if all remote participants have left (1:1 call ended)
          setTimeout(() => {
            if (isCallDisposed()) return;
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
          if (isCallDisposed()) return;
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
          if (isCallDisposed()) return;
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
              if (isCallDisposed()) return;
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
          if (isCallDisposed()) return;
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
            if (isCallDisposed()) return;
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

        if (isCallDisposed()) return;

        callTelemetryRef.current.joinStartedAt = Date.now();
        track('edudash.calls.join_started', {
          call_type: 'video',
          duration_ms: callTelemetryRef.current.initStartedAt
            ? callTelemetryRef.current.joinStartedAt - callTelemetryRef.current.initStartedAt
            : undefined,
        });

        try {
          await daily.join({
            url: roomUrl,
            ...(meetingToken ? { token: meetingToken } : {}), // Only include token when valid string
            subscribeToTracksAutomatically: true,
            audioSource: true,
            videoSource: true,
          });
        } catch (joinError) {
          const message = getErrorText(joinError);
          if (isCallDisposed() && /use after destroy/i.test(message)) {
            console.log('[VideoCall] Ignoring stale join error after cleanup');
            return;
          }
          throw joinError;
        }
        
        // CRITICAL: Final earpiece enforcement after Daily.co join
        // This ensures InCallManager settings take precedence over any audio mode changes
        setTimeout(() => {
          if (isCallDisposed()) return;
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
        const errText = getErrorText(err);
        if (
          /use after destroy/i.test(errText) &&
          (isCleanedUp || cleanupInProgressRef.current || !dailyRef.current)
        ) {
          console.log('[VideoCall] Ignoring stale init error after cleanup:', errText);
          return;
        }
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

  const {
    toggleAudio,
    toggleVideo,
    flipCamera,
    toggleSpeaker,
    toggleScreenShare,
    shareCallLink,
    toggleRecording,
    toggleViewPreference,
    handleEndCall,
    handleMinimize,
  } = useWhatsAppVideoCallControls({
    dailyRef,
    callIdRef,
    meetingUrl,
    isAudioEnabled,
    isVideoEnabled,
    isFrontCamera,
    isSpeakerOn,
    isScreenSharing,
    isRecording,
    isOwner,
    preferLocalView,
    cleanupCall,
    onClose,
    onMinimize,
    updateParticipants,
    setIsAudioEnabled,
    setIsVideoEnabled,
    setIsFrontCamera,
    setIsSpeakerOn,
    setIsScreenSharing,
    setPreferLocalView,
    setError,
    setCallState,
    setIsMinimized,
    inCallManager: InCallManager,
  });

  if (!isOpen) return null;

  // Check if any remote participant is screen sharing
  const screenSharingParticipant = remoteParticipants.find(
    (p: any) => p.tracks?.screenVideo?.state === 'playable'
  );

  const hasRemoteVideo = remoteParticipants[0]?.tracks?.video?.state === 'playable';
  const hasLocalVideo = localParticipant?.tracks?.video?.state === 'playable' && isVideoEnabled;
  // CRITICAL: Only show local video in main view if there are NO remote participants
  // If remote participant exists but video is off, show "Camera off" - NOT local video
  const hasRemoteParticipant = remoteParticipants.length > 0;
  const showLocalInMainView = !hasRemoteParticipant && hasLocalVideo;

  // Get the actual video track for local video (with fallbacks)
  const localVideoTrack = getParticipantVideoTrack(localParticipant);
    
  const getMainVideoTrack = () =>
    resolveMainVideoTrack({
      screenSharingParticipant,
      preferLocalView,
      hasLocalVideo,
      hasRemoteVideo,
      localVideoTrack,
      remoteParticipants,
      showLocalInMainView,
    });
  
  // Determine what's showing in main view for view switch button label
  const isShowingLocalInMain = preferLocalView && hasLocalVideo && hasRemoteVideo;

  logRenderDecision({
    hasRemoteVideo,
    hasLocalVideo,
    hasRemoteParticipant,
    showLocalInMainView,
    isVideoEnabled,
    screenSharing: !!screenSharingParticipant,
    dailyMediaViewAvailable: !!DailyMediaView,
    localParticipant,
    localVideoTrack,
    remoteParticipants,
  });

  return (
    <>
      <WhatsAppStyleVideoCallPresentation
        isMinimized={isMinimized}
        minimizedPosition={minimizedPosition}
        localVideoPosition={localVideoPosition}
        localVideoPanHandlers={localVideoPanResponder.panHandlers}
        fadeAnim={fadeAnim}
        controlsAnim={controlsAnim}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        DailyMediaView={DailyMediaView}
        remoteParticipants={remoteParticipants}
        localParticipant={localParticipant}
        screenSharingParticipant={screenSharingParticipant}
        remoteUserName={remoteUserName}
        remoteUserPhoto={remoteUserPhoto}
        callState={callState}
        callDuration={callDuration}
        error={error}
        isOwner={isOwner}
        isRecording={isRecording}
        isSpeakerOn={isSpeakerOn}
        isScreenSharing={isScreenSharing}
        isVideoEnabled={isVideoEnabled}
        isAudioEnabled={isAudioEnabled}
        isFrontCamera={isFrontCamera}
        hasRemoteVideo={hasRemoteVideo}
        hasLocalVideo={hasLocalVideo}
        showLocalInMainView={showLocalInMainView}
        isShowingLocalInMain={isShowingLocalInMain}
        getMainVideoTrack={getMainVideoTrack}
        formatDuration={formatDuration}
        onExpandFromMinimized={() => setIsMinimized(false)}
        onScreenTap={handleScreenTap}
        onEndCall={handleEndCall}
        onMinimize={handleMinimize}
        onFlipCamera={flipCamera}
        onToggleSpeaker={toggleSpeaker}
        onToggleScreenShare={toggleScreenShare}
        onToggleViewPreference={toggleViewPreference}
        onToggleRecording={toggleRecording}
        onShowAddParticipants={() => setShowAddParticipants(true)}
        onToggleVideo={toggleVideo}
        onToggleAudio={toggleAudio}
      />

      <AddParticipantModal
        visible={showAddParticipants}
        onClose={() => setShowAddParticipants(false)}
        callId={callIdRef.current}
        meetingUrl={meetingUrl || null}
        callerName={userName}
        callType="video"
        excludeUserIds={remoteParticipants.map((p) => p.user_id).filter((id): id is string => Boolean(id))}
      />
    </>
  );
}

export default WhatsAppStyleVideoCall;
