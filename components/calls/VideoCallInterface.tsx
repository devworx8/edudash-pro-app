import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  AppStateStatus,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import type { CallState, DailyParticipant } from './types';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { usePictureInPicture } from '@/hooks/usePictureInPicture';
import { useBottomInset } from '@/hooks/useBottomInset';
import { 
  prewarmCallSystem, 
  getPrewarmedCallObject, 
  disposePrewarmedCallObject 
} from '@/lib/calls/CallPrewarming';
import { sendIncomingCallPush } from '@/lib/calls/sendIncomingCallPush';
const getSupabase = () => assertSupabase();
let InCallManager: any = null;
try {
  InCallManager = require('react-native-incall-manager').default;
} catch (error) {
  console.warn('[VideoCall] InCallManager not available:', error);
}
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
interface VideoCallInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  roomName?: string;
  userName?: string;
  isOwner?: boolean;
  calleeId?: string;
  callId?: string;
  meetingUrl?: string;
  onCallStateChange?: (state: CallState) => void;
  role?: 'teacher' | 'parent' | 'student';
}
export function VideoCallInterface({
  isOpen,
  onClose,
  roomName,
  userName = 'User',
  isOwner = false,
  calleeId,
  callId,
  meetingUrl,
  onCallStateChange,
  role = 'teacher',
}: VideoCallInterfaceProps) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomInset = useBottomInset();
  const [callDuration, setCallDuration] = useState(0);
  const [localParticipant, setLocalParticipant] = useState<DailyParticipant | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<DailyParticipant[]>([]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true); // Default speaker for video calls
  const [isHandRaised, setIsHandRaised] = useState(false); // For participant hand raising
  const [activeCallId, setActiveCallId] = useState<string | null>(callId || null);
  const isParticipant = role === 'parent' || role === 'student';
  const canScreenShare = !isParticipant; // Only teachers/owners can screen share
  const canInvite = !isParticipant; // Only teachers/owners can invite
  const canRaiseHand = isParticipant; // Only participants can raise hand
  const dailyRef = useRef<any>(null);
  const callIdRef = useRef<string | null>(callId || null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const videoWasEnabledBeforeBackground = useRef<boolean>(true);
  const isCallActive = callState === 'connected' || callState === 'connecting' || callState === 'ringing';
  const { isInPipMode, isPipSupported } = usePictureInPicture({
    autoEnterOnBackground: isCallActive && isVideoEnabled,
    onEnterPiP: () => {
      console.log('[VideoCall] Entered PiP mode - keeping video active');
    },
    onExitPiP: () => {
      console.log('[VideoCall] Exited PiP mode');
    },
  });
  useEffect(() => {
    if (callId && !callIdRef.current) {
      callIdRef.current = callId;
      setActiveCallId(callId);
    }
  }, [callId]);
  useEffect(() => {
    onCallStateChange?.(callState);
  }, [callState, onCallStateChange]);
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isOpen ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOpen, fadeAnim]);
  useEffect(() => {
    if (!isOpen) {
      disposePrewarmedCallObject();
      return;
    }
    prewarmCallSystem(true).catch((err) => {
      console.warn('[VideoCall] Prewarm failed (non-fatal):', err);
    });
  }, [isOpen]);
  useEffect(() => {
    if (callState === 'connected' && remoteParticipants.length > 0) {
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
  }, [callState, remoteParticipants.length]);
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  useEffect(() => {
    if (!activeCallId || callState === 'ended') {
      console.log('[VideoCall] No activeCallId yet or call ended, skipping realtime subscription');
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
  const cleanupCall = useCallback(() => {
    if (InCallManager) {
      try {
        InCallManager.stop();
        console.log('[VideoCall] InCallManager stopped');
      } catch (err) {
        console.warn('[VideoCall] InCallManager cleanup error:', err);
      }
    }
    if (dailyRef.current) {
      try {
        dailyRef.current.leave();
        dailyRef.current.destroy();
      } catch (err) {
        console.warn('[VideoCall] Cleanup error:', err);
      }
      dailyRef.current = null;
    }
  }, []);
  useEffect(() => {
    if (!InCallManager) return;
    if (!isOpen) return;
    if (callState === 'connecting' || callState === 'ringing') {
      try {
        InCallManager.start({ 
          media: 'video', // Video calls default to speaker
          auto: false,
          ringback: isOwner ? '_DEFAULT_' : ''
        });
        InCallManager.setForceSpeakerphoneOn(true);
        InCallManager.setKeepScreenOn(true);
        console.log('[VideoCall] Started InCallManager for video call (speaker)');
      } catch (err) {
        console.warn('[VideoCall] Failed to start InCallManager:', err);
      }
    }
    return () => {
      if (callState === 'ended' || callState === 'failed') {
        try {
          InCallManager.stop();
        } catch (err) {
        }
      }
    };
  }, [callState, isOpen, isOwner]);
  useEffect(() => {
    if (!isCallActive || !dailyRef.current) return;
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;
      console.log('[VideoCall] App state change:', previousState, '->', nextAppState, {
        isPipSupported,
        isInPipMode,
        isVideoEnabled,
      });
      if (previousState === 'active' && (nextAppState === 'background' || nextAppState === 'inactive')) {
        if (!isPipSupported) {
          videoWasEnabledBeforeBackground.current = isVideoEnabled;
          if (isVideoEnabled && dailyRef.current) {
            console.log('[VideoCall] Pausing video for background (no PiP)');
            try {
              await dailyRef.current.setLocalVideo(false);
              setIsVideoEnabled(false);
            } catch (err) {
              console.warn('[VideoCall] Failed to pause video:', err);
            }
          }
        } else {
          console.log('[VideoCall] Keeping video active for PiP mode');
          if (InCallManager) {
            try {
              InCallManager.setKeepScreenOn(false); // Allow screen off in PiP
            } catch (err) {
              console.warn('[VideoCall] InCallManager error:', err);
            }
          }
        }
      }
      if ((previousState === 'background' || previousState === 'inactive') && nextAppState === 'active') {
        if (!isPipSupported && videoWasEnabledBeforeBackground.current && !isVideoEnabled && dailyRef.current) {
          console.log('[VideoCall] Resuming video from background');
          try {
            await dailyRef.current.setLocalVideo(true);
            setIsVideoEnabled(true);
          } catch (err) {
            console.warn('[VideoCall] Failed to resume video:', err);
          }
        }
        if (InCallManager) {
          try {
            InCallManager.setKeepScreenOn(true);
          } catch (err) {
            console.warn('[VideoCall] InCallManager error:', err);
          }
        }
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [isCallActive, isPipSupported, isInPipMode, isVideoEnabled]);
  const updateParticipants = useCallback(() => {
    if (!dailyRef.current) return;
    const participants = dailyRef.current.participants();
    const local = participants.local;
    const remote = Object.entries(participants)
      .filter(([key, p]: [string, any]) => key !== 'local' && !p.local)
      .map(([_, p]) => p) as DailyParticipant[];
    console.log('[VideoCall] Participants updated:', {
      localSessionId: local?.session_id,
      remoteCount: remote.length,
      remoteSessionIds: remote.map((p: any) => p.session_id),
    });
    setLocalParticipant(local);
    setRemoteParticipants(remote);
  }, []);
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
        setCallState('connecting');
        setError(null);
        setCallDuration(0);
        let { data: sessionData, error: sessionError } = await getSupabase().auth.getSession();
        let accessToken = sessionData.session?.access_token;
        if (!accessToken || sessionError) {
          console.log('[VideoCall] Session missing or expired, attempting refresh...');
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
        cleanupCall();
        let roomUrl = meetingUrl;
        if (isOwner && !roomUrl) {
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
                maxParticipants: 10, // Support group calls (3-10 participants)
              }),
            }
          );
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create room');
          }
          const { room } = await response.json();
          roomUrl = room.url;
          if (calleeId) {
            const newCallId = uuidv4(); // Generate proper UUID
            callIdRef.current = newCallId;
            setActiveCallId(newCallId);
            console.log('[VideoCall] 📞 Created call ID:', newCallId);
            const { data: callerProfile } = await getSupabase()
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', user.id)
              .maybeSingle();
            const callerName = callerProfile
              ? `${callerProfile.first_name || ''} ${callerProfile.last_name || ''}`.trim() ||
                'Someone'
              : 'Someone';
            await getSupabase().from('active_calls').insert({
              call_id: newCallId,
              caller_id: user.id,
              callee_id: calleeId,
              call_type: 'video',
              status: 'ringing',
              caller_name: callerName,
              meeting_url: roomUrl,
            });
            void sendIncomingCallPush({
              accessToken,
              calleeUserId: calleeId,
              callId: newCallId,
              callerId: user.id,
              callerName,
              callType: 'video',
              meetingUrl: roomUrl,
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
              },
            });
            setCallState('ringing');
          }
        }
        if (!roomUrl) {
          throw new Error('No room URL available');
        }
        if (isCleanedUp) return;
        const actualRoomName = roomUrl.split('/').pop() || `video-${Date.now()}`;
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
        }
        const tokenData = tokenResponse.ok ? await tokenResponse.json() : null;
        const meetingToken = tokenData?.token;
        if (meetingToken) {
          console.log('[VideoCall] ✅ Got meeting token');
        } else {
          console.log('[VideoCall] ⚠️ Joining without token (room may be public)');
        }
        if (isCleanedUp) return;
        console.log('[VideoCall] Getting Daily call object (prewarmed if available)...');
        const daily = getPrewarmedCallObject(true) || Daily.createCallObject({
          audioSource: true,
          videoSource: true,
        });
        dailyRef.current = daily;
        daily.on('joined-meeting', async () => {
          console.log('[VideoCall] Joined meeting');
          try {
            await daily.setSubscribeToTracksAutomatically(true);
            await daily.updateReceiveSettings({ '*': { video: true, audio: true } });
            console.log('[VideoCall] ✅ Configured to receive all tracks');
          } catch (err) {
            console.warn('[VideoCall] Failed to configure track receiving:', err);
          }
          const enableLocalMedia = async (attempt: number = 1) => {
            try {
              await daily.setLocalVideo(true);
              await daily.setLocalAudio(true);
              setIsVideoEnabled(true);
              setIsAudioEnabled(true);
              console.log('[VideoCall] ✅ Local media enabled on attempt', attempt);
              setTimeout(() => updateParticipants(), 300);
            } catch (err) {
              console.warn('[VideoCall] Enable local media failed attempt', attempt, ':', err);
              if (attempt < 3) {
                setTimeout(() => enableLocalMedia(attempt + 1), 500);
              }
            }
          };
          await enableLocalMedia();
          setCallState('connected');
          updateParticipants();
        });
        daily.on('left-meeting', () => {
          console.log('[VideoCall] Left meeting - closing call UI');
          setCallState('ended');
          onClose();
        });
        daily.on('participant-joined', () => {
          console.log('[VideoCall] Participant joined');
          updateParticipants();
        });
        daily.on('participant-left', () => {
          console.log('[VideoCall] Participant left');
          updateParticipants();
          setTimeout(() => {
            if (dailyRef.current) {
              const participants = dailyRef.current.participants();
              const remoteCount = Object.values(participants).filter((p: any) => !p.local).length;
              console.log('[VideoCall] Remote participants remaining:', remoteCount);
              if (remoteCount === 0 && callState === 'connected') {
                console.log('[VideoCall] Last remote participant left - ending call');
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
        daily.on('participant-updated', () => {
          updateParticipants();
        });
        daily.on('error', (event: any) => {
          console.error('[VideoCall] Error:', event);
          setError(event?.errorMsg || 'Call error');
          setCallState('failed');
        });
        console.log('[VideoCall] Joining room:', roomUrl, 'with token:', !!meetingToken);
        await daily.join({
          url: roomUrl,
          ...(meetingToken ? { token: meetingToken } : {}), // Only include token when valid string
          subscribeToTracksAutomatically: true,
          audioSource: true,
          videoSource: true,
        });
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
  }, [isOpen, meetingUrl, userName, isOwner, calleeId, cleanupCall, updateParticipants]);
  const toggleAudio = useCallback(async () => {
    if (!dailyRef.current) return;
    try {
      await dailyRef.current.setLocalAudio(!isAudioEnabled);
      setIsAudioEnabled(!isAudioEnabled);
    } catch (err) {
      console.error('[VideoCall] Toggle audio error:', err);
    }
  }, [isAudioEnabled]);
  const toggleVideo = useCallback(async () => {
    if (!dailyRef.current) {
      console.warn('[VideoCall] Cannot toggle video - Daily object not available');
      return;
    }
    const newState = !isVideoEnabled;
    console.log('[VideoCall] Toggling video to:', newState);
    const setVideo = async (enabled: boolean, attempt: number = 1) => {
      try {
        await dailyRef.current.setLocalVideo(enabled);
        setIsVideoEnabled(enabled);
        console.log('[VideoCall] ✅ Video toggled to', enabled, 'on attempt', attempt);
        setTimeout(() => {
          const participants = dailyRef.current?.participants();
          if (participants) {
            const remote = Object.entries(participants)
              .filter(([id]) => id !== 'local')
              .map(([id, p]) => ({ sessionId: id, ...(p as Record<string, unknown>) })) as unknown as DailyParticipant[];
            setRemoteParticipants(remote);
          }
        }, 300);
      } catch (err) {
        console.warn('[VideoCall] Toggle video failed attempt', attempt, ':', err);
        if (enabled && attempt < 3) {
          console.log('[VideoCall] Retrying enable video...');
          setTimeout(() => setVideo(enabled, attempt + 1), 500);
        } else {
          setError(enabled ? 'Failed to enable camera. Please try again.' : 'Failed to disable camera.');
          setTimeout(() => setError(null), 3000);
        }
      }
    };
    await setVideo(newState);
  }, [isVideoEnabled]);
  const flipCamera = useCallback(async () => {
    if (!dailyRef.current) return;
    try {
      await dailyRef.current.cycleCamera();
      setIsFrontCamera(!isFrontCamera);
    } catch (err) {
      console.error('[VideoCall] Flip camera error:', err);
    }
  }, [isFrontCamera]);
  const toggleSpeaker = useCallback(() => {
    const newState = !isSpeakerOn;
    try {
      if (InCallManager) {
        InCallManager.setForceSpeakerphoneOn(newState);
        console.log('[VideoCall] Speaker toggled to:', newState ? 'speaker' : 'earpiece');
      }
      setIsSpeakerOn(newState);
    } catch (err) {
      console.error('[VideoCall] Toggle speaker error:', err);
    }
  }, [isSpeakerOn]);
  const toggleScreenShare = useCallback(async () => {
    if (!dailyRef.current) return;
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
    } catch (err: any) {
      console.error('[VideoCall] Screen share error:', err);
      if (Platform.OS === 'ios') {
        if (err?.message?.includes('extension') || err?.message?.includes('broadcast')) {
          setError('Screen share extension not configured. Contact app developer.');
        } else if (err?.message?.includes('permission') || err?.message?.includes('denied')) {
          setError('Screen share permission denied');
        } else {
          setError('Screen share not available on this device');
        }
      } else {
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
    } catch (err) {
      console.error('[VideoCall] Share error:', err);
    }
  }, [meetingUrl]);
  const toggleHandRaise = useCallback(() => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    if (dailyRef.current) {
      try {
        dailyRef.current.sendAppMessage({ type: 'hand_raise', raised: newState, userName }, '*');
        console.log('[VideoCall] Hand raise:', newState ? 'raised' : 'lowered');
      } catch (err) {
        console.warn('[VideoCall] Failed to send hand raise signal:', err);
      }
    }
  }, [isHandRaised, userName]);
  const handleEndCall = useCallback(async () => {
    console.log('[VideoCall] Ending call');
    if (callIdRef.current) {
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
  if (!isOpen) return null;
  const screenSharingParticipant = remoteParticipants.find(
    (p: any) => p.tracks?.screenVideo?.state === 'playable'
  );
  const hasRemoteParticipant = remoteParticipants.length > 0;
  const mainParticipant = hasRemoteParticipant ? remoteParticipants[0] : localParticipant;
  const getMainVideoTrack = () => {
    if (screenSharingParticipant) {
      const screenTrack = screenSharingParticipant.tracks?.screenVideo;
      return screenTrack?.persistentTrack || screenTrack?.track || null;
    }
    if (mainParticipant?.tracks?.video?.state === 'playable') {
      return mainParticipant.tracks?.video?.persistentTrack || mainParticipant.tracks?.video?.track || null;
    }
    return null;
  };
  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Main Video View - Shows screen share if active, otherwise remote/local video */}
      <View style={styles.mainVideoContainer}>
        {mainParticipant && DailyMediaView ? (
          <DailyMediaView
            videoTrack={getMainVideoTrack()}
            audioTrack={mainParticipant.tracks?.audio?.persistentTrack || mainParticipant.tracks?.audio?.track || null}
            style={styles.mainVideo}
            objectFit={screenSharingParticipant ? 'contain' : 'cover'}
          />
        ) : (
          <View style={styles.noVideoPlaceholder}>
            <Ionicons name="person" size={80} color="rgba(255,255,255,0.3)" />
            <Text style={styles.noVideoText}>
              {callState === 'connecting' ? 'Connecting...' : 'No video'}
            </Text>
          </View>
        )}
      </View>
      {/* Local Video Preview (Picture-in-Picture) */}
      {DailyMediaView && (
        <View style={styles.localVideoContainer}>
          {localParticipant && isVideoEnabled && localParticipant.tracks?.video?.state === 'playable' ? (
            <DailyMediaView
              videoTrack={localParticipant?.tracks?.video?.persistentTrack || localParticipant?.tracks?.video?.track || null}
              audioTrack={null}
              style={styles.localVideo}
              objectFit="cover"
              mirror={isFrontCamera}
            />
          ) : (
            <View style={styles.localVideoPlaceholder}>
              <Ionicons name={!isVideoEnabled ? "videocam-off" : "person"} size={24} color="rgba(255,255,255,0.5)" />
              <Text style={styles.localVideoPlaceholderText}>
                {!isVideoEnabled ? 'Camera off' : callState === 'connecting' ? 'Starting...' : 'No video'}
              </Text>
            </View>
          )}
        </View>
      )}
      {/* Remote participant camera when they're screen sharing (show in secondary PIP) */}
      {screenSharingParticipant && screenSharingParticipant.tracks?.video?.state === 'playable' && DailyMediaView && (
        <View style={[styles.localVideoContainer, { top: Platform.OS === 'ios' ? 210 : 190 }]}>
          <DailyMediaView
            videoTrack={screenSharingParticipant.tracks?.video?.persistentTrack || screenSharingParticipant.tracks?.video?.track || null}
            audioTrack={null}
            style={styles.localVideo}
            objectFit="cover"
          />
        </View>
      )}
      {/* Screen Share Indicator */}
      {screenSharingParticipant && (
        <View style={styles.screenShareIndicator}>
          <Ionicons name="desktop-outline" size={16} color="#00f5ff" />
          <Text style={styles.screenShareText}>Screen sharing</Text>
        </View>
      )}
      {/* Call Info Overlay */}
      <View style={styles.topOverlay}>
        <View style={styles.callInfo}>
          <Text style={styles.callerName}>{userName}</Text>
          <Text style={styles.callDuration}>
            {callState === 'connected'
              ? formatDuration(callDuration)
              : callState === 'ringing'
              ? 'Ringing...'
              : callState === 'connecting'
              ? 'Connecting...'
              : 'Call ended'}
          </Text>
        </View>
      </View>
      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={20} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {/* Hand Raised Indicator (for participants) */}
      {isHandRaised && (
        <View style={styles.handRaisedIndicator}>
          <Ionicons name="hand-left" size={16} color="#fbbf24" />
          <Text style={styles.handRaisedText}>Hand Raised</Text>
        </View>
      )}
      {/* Controls */}
      <View style={[styles.controlsContainer, { paddingBottom: bottomInset + 16 }]}>
        {/* Secondary Row - Role-based features */}
        <View style={styles.secondaryControls}>
          <TouchableOpacity style={styles.secondaryButton} onPress={toggleSpeaker}>
            <Ionicons 
              name={isSpeakerOn ? 'volume-high' : 'volume-mute'} 
              size={22} 
              color="#ffffff" 
            />
            <Text style={styles.secondaryLabel}>Speaker</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={flipCamera}>
            <Ionicons name="camera-reverse" size={22} color="#ffffff" />
            <Text style={styles.secondaryLabel}>Flip</Text>
          </TouchableOpacity>
          {/* Screen Share - Only for teachers */}
          {canScreenShare && (
            <TouchableOpacity 
              style={[styles.secondaryButton, isScreenSharing && styles.secondaryButtonActive]} 
              onPress={toggleScreenShare}
            >
              <Ionicons 
                name={isScreenSharing ? 'stop-circle' : 'share-outline'} 
                size={22} 
                color={isScreenSharing ? '#ef4444' : '#ffffff'} 
              />
              <Text style={[styles.secondaryLabel, isScreenSharing && { color: '#ef4444' }]}>
                {isScreenSharing ? 'Stop' : 'Share'}
              </Text>
            </TouchableOpacity>
          )}
          {/* Hand Raise - Only for participants (parents/students) */}
          {canRaiseHand && (
            <TouchableOpacity 
              style={[styles.secondaryButton, isHandRaised && styles.secondaryButtonActive]} 
              onPress={toggleHandRaise}
            >
              <Ionicons 
                name="hand-left" 
                size={22} 
                color={isHandRaised ? '#fbbf24' : '#ffffff'} 
              />
              <Text style={[styles.secondaryLabel, isHandRaised && { color: '#fbbf24' }]}>
                {isHandRaised ? 'Lower' : 'Raise'}
              </Text>
            </TouchableOpacity>
          )}
          {/* Invite - Only for teachers */}
          {canInvite && (
            <TouchableOpacity style={styles.secondaryButton} onPress={shareCallLink}>
              <Ionicons name="person-add" size={22} color="#ffffff" />
              <Text style={styles.secondaryLabel}>Invite</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Main Controls */}
        <View style={styles.controls}>
          {/* Toggle Video */}
          <TouchableOpacity
            style={[styles.controlButton, !isVideoEnabled && styles.controlButtonOff]}
            onPress={toggleVideo}
          >
            <Ionicons
              name={isVideoEnabled ? 'videocam' : 'videocam-off'}
              size={24}
              color="#ffffff"
            />
          </TouchableOpacity>
          {/* Toggle Audio */}
          <TouchableOpacity
            style={[styles.controlButton, !isAudioEnabled && styles.controlButtonOff]}
            onPress={toggleAudio}
          >
            <Ionicons
              name={isAudioEnabled ? 'mic' : 'mic-off'}
              size={24}
              color="#ffffff"
            />
          </TouchableOpacity>
          {/* End Call */}
          <TouchableOpacity
            style={[styles.controlButton, styles.endCallButton]}
            onPress={handleEndCall}
          >
            <Ionicons name="call" size={24} color="#ffffff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
        </View>
        {/* Participant count */}
        {remoteParticipants.length > 0 && (
          <View style={styles.participantCount}>
            <Ionicons name="people" size={14} color="#ffffff" />
            <Text style={styles.participantCountText}>{remoteParticipants.length + 1}</Text>
          </View>
        )}
      </View>
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
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#0a0a0f',
    zIndex: 9999,
  },
  mainVideoContainer: {
    flex: 1,
  },
  mainVideo: {
    flex: 1,
  },
  noVideoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
  },
  noVideoText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    marginTop: 16,
  },
  localVideoContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 16,
    width: 100,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#00f5ff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    backgroundColor: '#1a1a2e',
  },
  localVideo: {
    flex: 1,
  },
  localVideoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
  },
  localVideoPlaceholderText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'linear-gradient(rgba(0,0,0,0.6), transparent)',
  },
  callInfo: {
    alignItems: 'flex-start',
  },
  callerName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  callDuration: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginTop: 4,
  },
  errorContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 100,
    left: 16,
    right: 120,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    padding: 12,
    borderRadius: 8,
  },
  errorText: {
    color: '#ffffff',
    marginLeft: 8,
    fontSize: 14,
    flex: 1,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  secondaryControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginBottom: 20,
  },
  secondaryButton: {
    alignItems: 'center',
    padding: 4,
  },
  secondaryButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
  },
  secondaryLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    marginTop: 4,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonOff: {
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
  },
  endCallButton: {
    backgroundColor: '#ef4444',
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  participantCount: {
    position: 'absolute',
    top: 8,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  participantCountText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
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
  handRaisedIndicator: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 100,
    right: 130,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  handRaisedText: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '500',
  },
});
export default VideoCallInterface;
