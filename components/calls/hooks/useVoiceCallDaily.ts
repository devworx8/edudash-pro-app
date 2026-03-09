/**
 * Voice Call Daily.co Hook
 * 
 * Manages Daily.co SDK integration:
 * - Room creation via Edge Function
 * - Joining/leaving calls
 * - Event handling (joined, left, participant changes, errors)
 * - Call signaling via Supabase
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AudioModule } from 'expo-audio';
import { assertSupabase } from '@/lib/supabase';
import AudioModeCoordinator, { type AudioModeSession } from '@/lib/AudioModeCoordinator';
// CallKeep removed - broken with Expo SDK 54+ (duplicate method exports)
// See: https://github.com/react-native-webrtc/react-native-callkeep/issues/866-869
import type { CallState } from '../types';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// InCallManager for audio routing
let InCallManager: any = null;
try {
  InCallManager = require('react-native-incall-manager').default;
} catch (error) {
  console.warn('[VoiceCallDaily] InCallManager not available:', error);
}

// NOTE: Promise.any polyfill is loaded via Metro's getModulesRunBeforeMainModule
// in metro.config.js, which ensures it runs BEFORE any module initialization.
// This ensures Daily.co SDK gets the polyfilled Promise at module load time.

// SAFETY NET: Ensure Promise.any is available RIGHT BEFORE Daily.co loads.
// This catches edge cases where the Metro shim didn't stick on Hermes.
if (typeof Promise.any !== 'function') {
  console.warn('[VoiceCallDaily] ⚠️ Promise.any missing — installing inline polyfill');
  (Promise as any).any = function promiseAny(iterable: Iterable<any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const arr = Array.from(iterable);
      if (arr.length === 0) { reject(new Error('All promises were rejected')); return; }
      const errors: any[] = new Array(arr.length);
      let rejections = 0;
      let done = false;
      arr.forEach((p, i) => {
        Promise.resolve(p).then(
          (v) => { if (!done) { done = true; resolve(v); } },
          (e) => {
            if (!done) {
              errors[i] = e;
              rejections++;
              if (rejections === arr.length) reject(new Error('All promises were rejected'));
            }
          }
        );
      });
    });
  };
  // Also patch globalThis in case Daily.co references it there
  if (typeof globalThis !== 'undefined' && globalThis.Promise) {
    (globalThis as any).Promise.any = (Promise as any).any;
  }
}

// Lazy Supabase getter
const getSupabase = () => assertSupabase();

// Call prewarming utilities for faster connection
import { 
  prewarmCallSystem, 
  getPrewarmedCallObject, 
  disposePrewarmedCallObject,
  hasValidSession,
} from '@/lib/calls/CallPrewarming';
import { sendIncomingCallPush } from '@/lib/calls/sendIncomingCallPush';

// Daily.co SDK - conditionally imported (worked before expo-audio changes)
let Daily: any = null;
try {
  Daily = require('@daily-co/react-native-daily-js').default;
  console.log('[VoiceCallDaily] Daily SDK loaded directly');
} catch (error) {
  console.warn('[VoiceCallDaily] Daily.co SDK not available:', error);
}

export interface VoiceCallDailyOptions {
  isOpen: boolean;
  meetingUrl?: string;
  userName?: string;
  isOwner: boolean;
  calleeId?: string;
  /** Initial call ID (for callee answering an existing call) */
  initialCallId?: string | null;
  threadId?: string;
  isSwitchingMode?: boolean;
  isSpeakerEnabled: boolean;
  dailyRef: React.MutableRefObject<any>;
  callIdRef: React.MutableRefObject<string | null>;
  setCallState: (state: CallState) => void;
  setError: (error: string | null) => void;
  setParticipantCount: (count: number) => void;
  setIsAudioEnabled: (enabled: boolean) => void;
  setIsSpeakerEnabled: (enabled: boolean) => void;
  setCallDuration: (duration: number) => void;
  stopAudio: () => void;
  onClose: () => void;
}

export interface VoiceCallDailyReturn {
  toggleAudio: () => Promise<void>;
  endCall: () => Promise<void>;
  cleanupCall: () => void;
  isDailyAvailable: boolean;
}

export function useVoiceCallDaily({
  isOpen,
  meetingUrl,
  userName,
  isOwner,
  calleeId,
  initialCallId,
  threadId,
  isSwitchingMode = false,
  isSpeakerEnabled,
  dailyRef,
  callIdRef,
  setCallState,
  setError,
  setParticipantCount,
  setIsAudioEnabled,
  setIsSpeakerEnabled,
  setCallDuration,
  stopAudio,
  onClose,
}: VoiceCallDailyOptions): VoiceCallDailyReturn {
  
  // Audio mode session ref for cleanup
  const audioSessionRef = useRef<AudioModeSession | null>(null);
  
  // CRITICAL: Ref to track endCall function for use in event handlers
  // This solves the closure issue where event handlers capture stale function references
  const endCallRef = useRef<(() => Promise<void>) | null>(null);
  
  // Guard against re-entrant cleanup (prevents 4+ duplicate "Call ended" cycles)
  const cleanupInProgressRef = useRef(false);
  
  // CRITICAL: State to trigger realtime subscription when call ID is set
  // Refs don't cause re-renders, so we need a state variable to trigger the subscription effect
  // Initialize with initialCallId if provided (callee case)
  const [activeCallId, setActiveCallId] = useState<string | null>(initialCallId || null);
  
  // Cleanup call resources
  const cleanupCall = useCallback(async () => {
    // Prevent duplicate cleanup cycles
    if (cleanupInProgressRef.current) {
      console.log('[VoiceCallDaily] Cleanup already in progress — skipping');
      return;
    }
    cleanupInProgressRef.current = true;
    console.log('[VoiceCallDaily] Cleaning up call resources');
    
    if (dailyRef.current) {
      try {
        dailyRef.current.leave();
        dailyRef.current.destroy();
        console.log('[VoiceCallDaily] Daily call object cleaned up');
      } catch (err) {
        console.warn('[VoiceCallDaily] Cleanup error:', err);
      }
      dailyRef.current = null;
    }
    
    // Release audio mode session
    if (audioSessionRef.current) {
      try {
        await audioSessionRef.current.release();
        console.log('[VoiceCallDaily] Audio session released');
        audioSessionRef.current = null;
      } catch (err) {
        console.warn('[VoiceCallDaily] Audio session release error:', err);
      }
    }
    
    // Clear active call ID state
    setActiveCallId(null);
    
    // CRITICAL: Must await to ensure audio refs are reset before state changes
    await stopAudio();
    
    // Reset guard after short delay so a NEW call can clean up normally
    setTimeout(() => { cleanupInProgressRef.current = false; }, 500);
  }, [dailyRef, stopAudio]);

  // CRITICAL: Sync activeCallId state with initialCallId prop when set (callee case)
  // This ensures the realtime subscription is set up for both caller and callee
  // The prop (not ref) is used because props trigger re-renders when changed
  useEffect(() => {
    if (initialCallId && !activeCallId) {
      console.log('[VoiceCallDaily] Syncing activeCallId from prop:', initialCallId);
      setActiveCallId(initialCallId);
      // Also update the ref for consistency
      if (!callIdRef.current) {
        callIdRef.current = initialCallId;
      }
    }
  }, [initialCallId, activeCallId, callIdRef]);

  // Listen for call status changes (other party hung up or rejected)
  // CRITICAL: Uses activeCallId STATE (not ref) to properly trigger re-subscription
  // when the call is created. Refs don't cause re-renders, so we need state.
  useEffect(() => {
    if (!activeCallId) {
      console.log('[VoiceCallDaily] No activeCallId yet, skipping realtime subscription');
      return;
    }

    console.log('[VoiceCallDaily] 🔔 Setting up realtime subscription for call:', activeCallId);
    
    const channel = getSupabase()
      .channel(`voice-status-${activeCallId}`)
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
          console.log('[VoiceCallDaily] 📣 Status changed:', newStatus, 'for call:', activeCallId);
          if (['ended', 'rejected', 'missed'].includes(newStatus)) {
            console.log('[VoiceCallDaily] Call ended/rejected/missed, cleaning up...');
            cleanupCall();
            setCallState('ended');
            onClose();
          }
        }
      )
      .subscribe((status) => {
        console.log('[VoiceCallDaily] Realtime subscription status:', status, 'for call:', activeCallId);
      });

    return () => {
      console.log('[VoiceCallDaily] Removing realtime subscription for call:', activeCallId);
      getSupabase().removeChannel(channel);
    };
  }, [activeCallId, cleanupCall, setCallState, onClose]);

  // OPTIMIZATION: Prewarm call system when UI opens (before user initiates)
  // This pre-creates call object, requests permissions, and validates session
  useEffect(() => {
    if (!isOpen) {
      // Dispose prewarmed objects when call UI closes
      disposePrewarmedCallObject();
      return;
    }
    
    // Start prewarming in background - don't block UI
    prewarmCallSystem(false).catch((err) => {
      console.warn('[VoiceCallDaily] Prewarm failed (non-fatal):', err);
    });
  }, [isOpen]);

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
        // Clean up previous call only if one exists (skip for fresh calls)
        if (dailyRef.current) {
          await cleanupCall();
        }
        
        setCallState('connecting');
        setError(null);
        setCallDuration(0);
        setIsSpeakerEnabled(false);
        console.log('[VoiceCallDaily] Initializing call with earpiece default');

        // OPTIMIZATION: Get session and only refresh if needed
        console.log('[VoiceCallDaily] Getting session...');
        let { data: sessionData, error: sessionError } = await getSupabase().auth.getSession();
        let accessToken = sessionData.session?.access_token;
        
        // Only refresh if token is missing or invalid
        if (!accessToken || sessionError) {
          console.log('[VoiceCallDaily] Refreshing session (no valid token)...');
          const { data: refreshData, error: refreshError } = await getSupabase().auth.refreshSession();
          
          if (refreshData?.session?.access_token) {
            accessToken = refreshData.session.access_token;
            sessionData = refreshData;
            console.log('[VoiceCallDaily] Session refreshed successfully');
          } else {
            console.warn('[VoiceCallDaily] No valid session:', refreshError || sessionError);
            throw new Error('Please sign in to make calls.');
          }
        } else {
          console.log('[VoiceCallDaily] Using existing session token (skip refresh)');
        }

        const user = sessionData.session?.user;
        if (!user) {
          throw new Error('Please sign in to make calls.');
        }

        if (isOwner && calleeId && calleeId === user.id) {
          console.warn('[VoiceCallDaily] Blocking self-call attempt');
          setError('You cannot call your own account.');
          setCallState('ended');
          setTimeout(() => onClose(), 500);
          return;
        }

        if (isCleanedUp) return;

        let roomUrl = meetingUrl;

        if (isOwner && !roomUrl) {
          // OPTIMIZATION: Parallelize room creation and profile fetch
          console.log('[VoiceCallDaily] Creating room and fetching profile...');
          
          const [roomResponse, profileData] = await Promise.all([
            fetch(
              `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/daily-rooms`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                  name: `voice-${Date.now()}`,
                  isPrivate: true,
                  expiryMinutes: 60,
                  maxParticipants: 10, // Support group calls (3-10 participants)
                }),
              }
            ),
            calleeId ? getSupabase()
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', user.id)
              .maybeSingle() : Promise.resolve({ data: null, error: null })
          ]);

          if (!roomResponse.ok) {
            let errorMsg = 'Failed to create room';
            try {
              const errorData = await roomResponse.json();
              errorMsg = errorData.error || errorData.message || errorMsg;
            } catch (e) {
              errorMsg = `HTTP ${roomResponse.status}: ${roomResponse.statusText || 'Unknown error'}`;
            }
            throw new Error(errorMsg);
          }

          const { room } = await roomResponse.json();
          roomUrl = room.url;
          console.log('[VoiceCallDaily] Room created:', roomUrl);

          // Create call signaling record
          if (calleeId) {
            const newCallId = uuidv4();
            callIdRef.current = newCallId;
            // CRITICAL: Also set state to trigger realtime subscription
            setActiveCallId(newCallId);
            console.log('[VoiceCallDaily] 📞 Created call ID:', newCallId);

            const callerName = profileData.data
              ? `${profileData.data.first_name || ''} ${profileData.data.last_name || ''}`.trim() || 'Someone'
              : 'Someone';

            const { error: callError } = await getSupabase().from('active_calls').insert({
              call_id: newCallId,
              caller_id: user.id,
              callee_id: calleeId,
              thread_id: threadId || null,
              call_type: 'voice',
              status: 'ringing',
              caller_name: callerName,
              meeting_url: roomUrl,
            });

            if (callError) {
              console.error('[VoiceCallDaily] Failed to insert active_call:', callError);
              throw callError;
            }

            // Keep call setup non-blocking while dispatching wake/push notifications.
            void sendIncomingCallPush({
              accessToken,
              calleeUserId: calleeId,
              callId: newCallId,
              callerId: user.id,
              callerName,
              callType: 'voice',
              meetingUrl: roomUrl,
              threadId,
              source: 'VoiceCallDaily',
            })
              .then((pushResult) => {
                console.log('[VoiceCallDaily] incoming_call_push_dispatch', {
                  call_id: newCallId,
                  fcm_success_count: pushResult.fcmSuccessCount,
                  expo_fallback_sent: pushResult.expoFallbackSent,
                  platform_filter_used: pushResult.expoPlatformFilter,
                  error_codes: pushResult.errorCodes,
                });
              })
              .catch((err) => {
                console.warn('[VoiceCallDaily] incoming call push dispatch failed:', err);
              });

            // NOTE: CallKeep removed - library broken with Expo SDK 54+ (duplicate method exports)
            // Incoming calls now rely on push notifications + WhatsAppStyleIncomingCall UI

            // OPTIMIZATION: Fire signal insert in parallel with token fetch below
            // (non-critical for call setup — peer gets notified via push + realtime)
            const signalPromise = Promise.resolve(
              getSupabase().from('call_signals').insert({
                call_id: newCallId,
                from_user_id: user.id,
                to_user_id: calleeId,
                signal_type: 'offer',
                payload: {
                  meeting_url: roomUrl,
                  call_type: 'voice',
                  caller_name: callerName,
                  thread_id: threadId,
                },
              })
            ).then(() => console.log('[VoiceCallDaily] Signal sent'))
              .catch(err => console.warn('[VoiceCallDaily] Signal insert failed:', err));

            setCallState('ringing');
          }
        }

        if (!roomUrl) {
          throw new Error('No room URL available');
        }

        if (isCleanedUp) return;

        // OPTIMIZATION: Fetch token in parallel with Daily.co object creation
        const actualRoomName = roomUrl.split('/').pop() || `voice-${Date.now()}`;
        console.log('[VoiceCallDaily] Getting token + creating call object in parallel...');

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
            console.log('[VoiceCallDaily] ✅ Got meeting token');
            return data?.token as string | null;
          }
          console.warn('[VoiceCallDaily] Token fetch failed:', res.status);
          return null;
        }).catch((err) => {
          console.warn('[VoiceCallDaily] Token fetch error:', err);
          return null;
        });

        const meetingToken = await tokenPromise;

        if (isCleanedUp) return;

        // OPTIMIZATION: Use prewarmed call object if available, otherwise create new one
        console.log('[VoiceCallDaily] Getting Daily call object (prewarmed if available)...');
        const daily = getPrewarmedCallObject(false) || Daily.createCallObject({
          audioSource: true,
          videoSource: false,
        });

        dailyRef.current = daily;

        const updateParticipantCount = () => {
          if (dailyRef.current) {
            const participants = dailyRef.current.participants();
            setParticipantCount(Object.keys(participants).length);
          }
        };

        // Event listeners
        daily.on('joined-meeting', async () => {
          console.log('[VoiceCallDaily] Joined meeting');
          
          // CRITICAL: Ensure we subscribe to all tracks automatically
          try {
            await daily.setSubscribeToTracksAutomatically(true);
            console.log('[VoiceCallDaily] Set auto-subscribe to tracks');
          } catch (err) {
            console.warn('[VoiceCallDaily] Failed to set auto-subscribe:', err);
          }
          
          // CRITICAL: Explicitly enable receiving audio from all participants
          try {
            await daily.updateReceiveSettings({ '*': { audio: true, video: false } });
            console.log('[VoiceCallDaily] Updated receive settings for audio');
          } catch (err) {
            console.warn('[VoiceCallDaily] Failed to update receive settings:', err);
          }
          
          // Enable local audio using React Native compatible method
          try {
            // Note: audioSource: true was passed in join options
            // setLocalAudio enables our audio track
            daily.setLocalAudio(true);
            setIsAudioEnabled(true);
            console.log('[VoiceCallDaily] Local audio enabled on join');
          } catch (micError) {
            console.warn('[VoiceCallDaily] Failed to enable microphone on join:', micError);
          }
          
          if (!isOwner || !calleeId) {
            setCallState('connected');
          }
          updateParticipantCount();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        });

        daily.on('left-meeting', () => {
          console.log('[VoiceCallDaily] Left meeting - closing call UI');
          if (cleanupInProgressRef.current) {
            console.log('[VoiceCallDaily] left-meeting occurred during cleanup; skipping close callback');
            return;
          }
          setCallState('ended');
          stopAudio();
          // CRITICAL: Close the call interface when meeting is left
          onClose();
        });

        daily.on('participant-joined', (event: any) => {
          const participant = event?.participant;
          const isLocalParticipant = participant?.local === true;
          console.log('[VoiceCallDaily] Participant joined:', { isLocal: isLocalParticipant });

          updateParticipantCount();

          if (isLocalParticipant) return;

          console.log('[VoiceCallDaily] Remote participant joined - connected');
          setCallState('connected');

          // NOTE: CallKeep removed - library broken with Expo SDK 54+
          // Call connected state handled via setCallState above

          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        });

        daily.on('participant-left', (event: any) => {
          console.log('[VoiceCallDaily] Participant left:', event?.participant?.user_id);
          updateParticipantCount();
          
          // If a remote participant left and we're in a 1:1 call, end the call
          const participants = daily.participants();
          const remoteParticipants = Object.values(participants).filter((p: any) => !p.local);
          
          // End call if no remote participants remain (the other party hung up).
          // Guard voice->video upgrades: remote leaves voice room briefly while
          // both peers re-join with video; that should not end the call.
          if (remoteParticipants.length === 0) {
            console.log('[VoiceCallDaily] Last remote participant left - ending call');
            // Small delay to let any final events process
            setTimeout(async () => {
              if (cleanupInProgressRef.current) {
                console.log('[VoiceCallDaily] Skip participant-left end while cleanup is in progress');
                return;
              }

              if (isSwitchingMode) {
                console.log('[VoiceCallDaily] Skip participant-left end during local switch-to-video');
                return;
              }

              const activeId = callIdRef.current;
              if (activeId) {
                try {
                  const { data: activeCall } = await getSupabase()
                    .from('active_calls')
                    .select('call_type, status, ended_at')
                    .eq('call_id', activeId)
                    .maybeSingle();

                  if (
                    activeCall?.call_type === 'video' &&
                    activeCall.status !== 'ended' &&
                    !activeCall.ended_at
                  ) {
                    console.log('[VoiceCallDaily] Skip participant-left end because call upgraded to video');
                    return;
                  }
                } catch (statusError) {
                  console.warn('[VoiceCallDaily] Failed to verify call status after participant-left:', statusError);
                }
              }

              // Use ref to get the latest endCall function
              if (endCallRef.current) {
                endCallRef.current();
              } else {
                // Fallback: directly cleanup and close
                console.log('[VoiceCallDaily] endCallRef not set, using direct cleanup');
                cleanupCall();
                setCallState('ended');
                onClose();
              }
            }, 650);
          }
          
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        });

        daily.on('error', (event: any) => {
          const errorMsg = event?.errorMsg || event?.error || 'Unknown error';
          
          let userFriendlyError = errorMsg;
          if (errorMsg.includes('network') || errorMsg.includes('connection')) {
            userFriendlyError = 'Connection failed. Please check your internet connection.';
          } else if (errorMsg.includes('permission') || errorMsg.includes('microphone')) {
            userFriendlyError = 'Microphone permission denied. Please enable it in settings.';
          } else if (errorMsg.includes('timeout')) {
            userFriendlyError = 'Connection timeout. Please try again.';
          } else if (errorMsg.includes('not found') || errorMsg.includes('404')) {
            userFriendlyError = 'Call room not found. The call may have ended.';
          }
          
          setError(userFriendlyError);
          setCallState('failed');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        });

        // Handle network quality and reconnection events
        daily.on('network-quality-change', (event: any) => {
          const { quality, threshold } = event || {};
          console.log('[VoiceCallDaily] Network quality:', quality, 'threshold:', threshold);
        });

        // Handle network connection state for background recovery
        daily.on('network-connection', async (event: any) => {
          const { type, event: eventType } = event || {};
          console.log('[VoiceCallDaily] Network connection:', type, eventType);
          
          if (eventType === 'interrupted') {
            console.log('[VoiceCallDaily] Connection interrupted - will attempt reconnect');
            // Connection is interrupted but Daily.co will attempt automatic reconnection
          } else if (eventType === 'connected') {
            console.log('[VoiceCallDaily] Connection restored');
            // Re-enable audio after reconnection with retry
            // Note: We don't have isAudioEnabledRef, so check current state from Daily.co
            if (dailyRef.current) {
              try {
                // Wait for connection to stabilize
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // Check if audio was enabled before interruption
                const currentAudio = dailyRef.current.localAudio();
                if (currentAudio !== false) {
                  // Re-enable with setLocalAudio (RN compatible)
                  dailyRef.current.setLocalAudio(true);
                  console.log('[VoiceCallDaily] Re-enabled mic after reconnect');
                }
              } catch (e) {
                console.warn('[VoiceCallDaily] Failed to re-enable audio:', e);
              }
            }
          }
        });

        // Track remote audio - critical for hearing the other party
        daily.on('track-started', async (event: any) => {
          const { participant, track } = event || {};
          
          console.log('[VoiceCallDaily] Track started:', {
            kind: track?.kind,
            isLocal: participant?.local,
            participantId: participant?.user_id,
          });
          
          // Only care about remote audio tracks
          if (participant?.local || track?.kind !== 'audio') {
            return;
          }
          
          console.log('[VoiceCallDaily] Remote audio track started - ensuring playback');
          
          // Immediately try to update receive settings to ensure audio is received
          try {
            if (dailyRef.current) {
              await dailyRef.current.updateReceiveSettings({
                [participant.session_id]: { audio: true },
                '*': { audio: true, video: false },
              });
              console.log('[VoiceCallDaily] Updated receive settings for participant:', participant.session_id);
            }
          } catch (err) {
            console.warn('[VoiceCallDaily] Failed to update receive settings:', err);
          }
          
          // Verify all remote participants have playable audio after a short delay
          setTimeout(() => {
            if (!dailyRef.current) return;
            
            const participants = dailyRef.current.participants();
            const remoteParticipants = Object.values(participants || {}).filter(
              (p: any) => !p.local
            );
            
            remoteParticipants.forEach(async (p: any) => {
              const audioState = p.tracks?.audio?.state;
              const audioBlocked = p.tracks?.audio?.blocked;
              const audioOff = p.tracks?.audio?.off;
              
              console.log('[VoiceCallDaily] Remote participant audio state:', {
                participantId: p.user_id,
                sessionId: p.session_id,
                audioState,
                audioBlocked,
                audioOff,
                isSpeakerEnabled,
              });
              
              // If audio is blocked or not playable, try to unblock
              if (audioBlocked || (audioState && audioState !== 'playable' && audioState !== 'sendable')) {
                console.warn('[VoiceCallDaily] Remote audio not playable - attempting to unblock');
                try {
                  await dailyRef.current.updateReceiveSettings({
                    [p.session_id]: { audio: true },
                  });
                  console.log('[VoiceCallDaily] Unblocked audio for:', p.session_id);
                } catch (err) {
                  console.warn('[VoiceCallDaily] Failed to unblock audio:', err);
                }
              }
            });
          }, 300);
        });

        // Note: Mic permissions already handled by CallPrewarming prewarmCallSystem()
        // and by startAudioOff: false in the join options below
        
        console.log('[VoiceCallDaily] Preparing to join with auto-subscribe enabled...');

        // CRITICAL: Request streaming audio mode from AudioModeCoordinator
        // This ensures WebRTC can properly capture and play audio, and coordinates
        // with other audio consumers (TTS, notifications) to prevent conflicts
        try {
          console.log('[VoiceCallDaily] Requesting streaming audio mode from coordinator...');
          audioSessionRef.current = await AudioModeCoordinator.requestAudioMode('streaming');
          console.log('[VoiceCallDaily] ✅ Audio session acquired:', audioSessionRef.current.id);
          
          // Single earpiece enforcement after AudioModeCoordinator
          if (InCallManager) {
            try {
              InCallManager.setForceSpeakerphoneOn(false);
              console.log('[VoiceCallDaily] ✅ Earpiece set after AudioModeCoordinator');
            } catch (err) {
              console.warn('[VoiceCallDaily] Failed earpiece enforcement:', err);
            }
          }
        } catch (audioModeError) {
          console.warn('[VoiceCallDaily] ⚠️ Failed to acquire audio mode (non-fatal):', audioModeError);
          // Fallback: try direct AudioModule call
          try {
            await AudioModule.setAudioModeAsync({
              allowsRecording: true,
              playsInSilentMode: true,
              shouldPlayInBackground: true,
              shouldRouteThroughEarpiece: true,
              interruptionMode: 'duckOthers',
              interruptionModeAndroid: 'duckOthers',
            });
            console.log('[VoiceCallDaily] ✅ Audio session activated via fallback');
          } catch (fallbackError) {
            console.warn('[VoiceCallDaily] ⚠️ Fallback audio mode also failed:', fallbackError);
          }
        }

        // Join the call with explicit audio-only settings
        // CRITICAL: Explicitly disable video to prevent Daily.co from treating this as video call
        console.log('[VoiceCallDaily] Joining room:', roomUrl, 'with token:', !!meetingToken);
        await daily.join({ 
          url: roomUrl,
          ...(meetingToken ? { token: meetingToken } : {}), // Only include token when valid string
          audioSource: true,
          videoSource: false, // Explicitly false for voice-only calls
          // Ensure we receive all participant audio
          subscribeToTracksAutomatically: true,
          // Explicitly set local video to false to prevent any video initialization
          startVideoOff: true,
          startAudioOff: false,
        });
        
        // CRITICAL: Explicitly disable video after join to ensure it stays audio-only
        try {
          await daily.setLocalVideo(false);
          console.log('[VoiceCallDaily] ✅ Explicitly disabled local video (audio-only call)');
        } catch (videoError) {
          console.warn('[VoiceCallDaily] Failed to disable video (non-fatal):', videoError);
        }

        // Single earpiece enforcement after join (audio hook handles ongoing routing)
        if (InCallManager) {
          try {
            InCallManager.setForceSpeakerphoneOn(false);
            console.log('[VoiceCallDaily] ✅ Earpiece set after join');
          } catch (err) {
            console.warn('[VoiceCallDaily] Failed earpiece enforcement:', err);
          }
        }
        
        console.log('[VoiceCallDaily] Joined successfully, audio managed by useVoiceCallAudio');

        // FAST mic enable: permissions already granted by prewarm/earlier request
        // startAudioOff: false already requested mic, just verify and retry if needed
        let micEnabled = false;
        
        try {
          // Quick mic enable with minimal retry (3 attempts × 150ms = 450ms max)
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              console.log(`[VoiceCallDaily] Mic enable attempt ${attempt}/3`);
              daily.setLocalAudio(true);
              
              // Quick verify
              await new Promise(resolve => setTimeout(resolve, 100));
              const localAudio = daily.localAudio();
              
              if (localAudio) {
                micEnabled = true;
                setIsAudioEnabled(true);
                console.log('[VoiceCallDaily] ✅ Microphone enabled');
                break;
              } else {
                console.warn(`[VoiceCallDaily] Attempt ${attempt} - mic not yet active`);
                if (attempt < 3) {
                  await new Promise(resolve => setTimeout(resolve, 150));
                }
              }
            } catch (micError) {
              console.warn(`[VoiceCallDaily] Attempt ${attempt} error:`, micError);
              if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 150));
              }
            }
          }
          
          if (!micEnabled) {
            console.error('[VoiceCallDaily] ❌ Failed to enable microphone after 3 attempts');
            setError('Could not enable microphone. Please check your device settings.');
          }
        } catch (audioError) {
          console.error('[VoiceCallDaily] ❌ Audio setup error:', audioError);
          setError('Audio setup failed. Please restart the app.');
        }

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to start call';
        
        let userFriendlyError = errorMsg;
        if (errorMsg.includes('network') || errorMsg.includes('failed to fetch')) {
          userFriendlyError = 'No internet connection. Please check your network and try again.';
        } else if (errorMsg.includes('timeout')) {
          userFriendlyError = 'Connection timeout. The other person may be offline.';
        } else if (errorMsg.includes('No room URL')) {
          userFriendlyError = 'Failed to create call room. Please try again.';
        }
        
        setError(userFriendlyError);
        setCallState('failed');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    };

    initializeCall();

    return () => {
      isCleanedUp = true;
      cleanupCall();
    };
  }, [isOpen, meetingUrl, userName, isOwner, calleeId, threadId, isSwitchingMode]);

  // Toggle microphone - use setLocalAudio for reliable mute/unmute
  const toggleAudio = useCallback(async () => {
    if (!dailyRef.current) return;
    
    try {
      // Get current mute state from localAudio()
      const currentlyEnabled = dailyRef.current.localAudio();
      const newState = !currentlyEnabled;
      
      // Use setLocalAudio - React Native compatible method
      dailyRef.current.setLocalAudio(newState);
      setIsAudioEnabled(newState);
      console.log('[VoiceCallDaily] Audio toggled:', { was: currentlyEnabled, now: newState });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (err) {
      console.warn('[VoiceCallDaily] Toggle audio error:', err);
    }
  }, [dailyRef, setIsAudioEnabled]);

  // End call
  const endCall = useCallback(async () => {
    console.log('[VoiceCallDaily] Ending call');

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
  }, [callIdRef, cleanupCall, setCallState, onClose]);

  // Keep ref updated with latest endCall function for use in event handlers
  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  return {
    toggleAudio,
    endCall,
    cleanupCall,
    isDailyAvailable: !!Daily,
  };
}
