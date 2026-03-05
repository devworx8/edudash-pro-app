/**
 * Native Call Provider
 * 
 * Manages voice and video calls using Daily.co React Native SDK.
 * Feature-flagged: Only active when video_calls_enabled or voice_calls_enabled is true.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, AppStateStatus, Platform, Alert, Vibration, BackHandler } from 'react-native';
import * as Notifications from 'expo-notifications';
import { DeviceEventEmitter } from '@/lib/utils/eventEmitter';
import { assertSupabase } from '@/lib/supabase';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { BadgeCoordinator } from '@/lib/BadgeCoordinator';
// CallKeep removed - broken with Expo SDK 54+ (duplicate method exports)
// See: https://github.com/react-native-webrtc/react-native-callkeep/issues/866-869
import { getPendingCall, cancelIncomingCallNotification, type IncomingCallData } from '@/lib/calls/CallHeadlessTask';
import { 
  checkForIncomingCallOnLaunch, 
  cancelIncomingCallNotification as cancelBackgroundCallNotification 
} from '@/lib/calls/CallBackgroundNotification';
import { setupIncomingCallNotifications } from '@/lib/calls/setupPushNotifications';
import { callKeepManager } from '@/lib/calls/callkeep-manager';
import { prewarmCallSystem } from '@/lib/calls/CallPrewarming';
import { toast } from '@/components/ui/ToastProvider';
import { track } from '@/lib/analytics';

// Lazy getter to avoid accessing supabase at module load time
const getSupabase = () => assertSupabase();

import { VoiceCallInterface } from './VoiceCallInterface';
import { WhatsAppStyleVideoCall } from './WhatsAppStyleVideoCall';
import { WhatsAppStyleIncomingCall } from './WhatsAppStyleIncomingCall';
import { CALL_NOTIFICATION_EVENTS, setupForegroundEventListener } from './hooks/useCallBackgroundHandler';
import { usePresence } from '@/hooks/usePresence';
import type {
  ActiveCall,
  CallStartOptions,
  CallContextType,
  CallSignal,
  CallSignalPayload,
  CallState,
  OutgoingCallParams,
} from './types';
import type { PresenceStatus } from '@/hooks/usePresence';

// Feature flag check
const isCallsEnabled = () => {
  const flags = getFeatureFlagsSync();
  return flags.video_calls_enabled || flags.voice_calls_enabled;
};

const CallContext = createContext<CallContextType | null>(null);

/**
 * Safe version of useCall that returns null instead of throwing when context is missing.
 * Use this in components where calls are optional.
 */
export function useCallSafe(): CallContextType | null {
  return useContext(CallContext);
}

/**
 * Standard useCall hook - throws if used outside CallProvider.
 * Prefer useCallSafe() for optional call functionality.
 */
export function useCall(): CallContextType {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}

interface CallProviderProps {
  children: ReactNode;
}

export function CallProvider({ children }: CallProviderProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<ActiveCall | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<OutgoingCallParams | null>(null);
  const [isCallInterfaceOpen, setIsCallInterfaceOpen] = useState(false);
  const [answeringCall, setAnsweringCall] = useState<ActiveCall | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [callerPhotoUrl, setCallerPhotoUrl] = useState<string | null>(null);
  // appState tracked via ref only – setting React state here caused
  // full re-renders of the entire provider tree on every AppState flicker.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Check if calls feature is enabled
  const callsEnabled = isCallsEnabled();

  // Fetch caller photo when incoming call arrives
  useEffect(() => {
    if (!incomingCall?.caller_id) {
      setCallerPhotoUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getSupabase()
          .from('profiles')
          .select('avatar_url')
          .eq('id', incomingCall.caller_id)
          .maybeSingle();
        if (!cancelled && data?.avatar_url) {
          setCallerPhotoUrl(data.avatar_url);
        }
      } catch (e) {
        console.warn('[CallProvider] Failed to fetch caller photo:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [incomingCall?.caller_id]);
  
  // Track presence for online/offline detection.
  // Presence is used by messaging and should not be disabled when calls are off.
  const presence = usePresence(currentUserId);
  const isUserOnline = presence.isUserOnline;
  const getLastSeenText = presence.getLastSeenText;
  const refreshPresence = presence.refreshPresence;
  const recordActivity = presence.recordActivity;

  // Setup push notifications and get current user
  // NOTE: CallKeep removed - broken with Expo SDK 54+ (duplicate method exports)
  useEffect(() => {
    // Setup Notifee foreground event listener for call notification actions
    // This handles End Call / Mute button presses when app is in foreground
    const unsubscribeForegroundEvents = callsEnabled
      ? setupForegroundEventListener()
      : () => {};

    const getUser = async () => {
      const { data: { user } } = await getSupabase().auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        // Only setup incoming call push notifications when calls are enabled
        if (callsEnabled) {
          setupIncomingCallNotifications(user.id).catch((err) => {
            console.warn('[CallProvider] Failed to setup push notifications:', err);
          });
        }
      }
    };
    getUser();

    const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
      (_event, session) => {
        setCurrentUserId(session?.user?.id || null);
        if (callsEnabled && session?.user?.id) {
          setupIncomingCallNotifications(session.user.id).catch((err) => {
            console.warn('[CallProvider] Failed to setup push notifications on auth change:', err);
          });
        }
      }
    );

    return () => {
      subscription.unsubscribe();
      unsubscribeForegroundEvents();
      // CallKeep cleanup removed
    };
  }, [callsEnabled]);

  // Track app state for background handling
  useEffect(() => {
    if (!callsEnabled) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const prevState = appStateRef.current;
      if (prevState === nextAppState) return; // skip redundant transitions
      appStateRef.current = nextAppState;
      
      // When app comes to foreground from actual background, check for pending calls
      if (nextAppState === 'active' && prevState !== 'active') {
        console.log('[CallProvider] App foregrounded from', prevState);
        checkPendingCall();
      }
    });

    return () => subscription.remove();
  }, [callsEnabled]);

  // Handle Android hardware back button during calls
  useEffect(() => {
    if (!callsEnabled || Platform.OS !== 'android') return;
    
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // If there's an incoming call showing, reject it
      if (incomingCall && !answeringCall) {
        console.log('[CallProvider] Back button pressed - rejecting incoming call');
        rejectCallRef.current();
        return true; // Prevent default back behavior
      }
      
      // If in a call, minimize instead of ending
      if (isCallInterfaceOpen && (answeringCall || outgoingCall)) {
        console.log('[CallProvider] Back button pressed - minimizing call (call continues)');
        setIsCallInterfaceOpen(false);
        return true; // Prevent default back behavior
      }
      
      return false; // Let default back behavior happen
    });
    
    return () => backHandler.remove();
  }, [callsEnabled, incomingCall, answeringCall, outgoingCall, isCallInterfaceOpen]);
  
  // Check for pending calls saved by HeadlessJS task OR background notification handler
  // Includes retry logic for killed-app scenario where DB connection may not be ready
  const checkPendingCall = useCallback(async () => {
    try {
      // Check HeadlessJS pending call first (Firebase-based)
      let pendingCall = await getPendingCall();
      
      // If no HeadlessJS call, check Expo background notification
      if (!pendingCall) {
        const backgroundCall = await checkForIncomingCallOnLaunch();
        if (backgroundCall) {
          pendingCall = backgroundCall;
          console.log('[CallProvider] Found pending call from background notification:', backgroundCall.call_id);
        }
      } else {
        console.log('[CallProvider] Found pending call from HeadlessJS:', pendingCall.call_id);
      }
      
      if (pendingCall) {
        // CRITICAL: Verify call is still active before showing incoming call UI
        // Retry up to 3 times for killed-app scenario where DB connection may be slow
        let callStatus: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { data, error } = await getSupabase()
              .from('active_calls')
              .select('status, ended_at')
              .eq('call_id', pendingCall.call_id)
              .maybeSingle();
            
            if (!error && data) {
              callStatus = data;
              break;
            }
            
            if (attempt < 3) {
              console.log(`[CallProvider] DB check attempt ${attempt} failed, retrying...`);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (err) {
            console.warn(`[CallProvider] DB check attempt ${attempt} error:`, err);
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        }
        
        if (!callStatus) {
          console.log('[CallProvider] Call not found in database after retries');
          return;
        }
        
        // Check if call is still ringing (not ended, rejected, missed, or answered)
        const validStatuses = ['ringing', 'pending'];
        if (!validStatuses.includes(callStatus.status) || callStatus.ended_at) {
          console.log('[CallProvider] Call is no longer active:', {
            callId: pendingCall.call_id,
            status: callStatus.status,
            ended_at: callStatus.ended_at,
          });
          return;
        }
        
        console.log('[CallProvider] Call is still active, showing incoming call UI:', pendingCall.call_id);
        
        // Set as incoming call
        setIncomingCall({
          id: pendingCall.call_id,
          call_id: pendingCall.call_id,
          caller_id: pendingCall.caller_id,
          callee_id: currentUserId || '',
          thread_id: (pendingCall as any).thread_id || null,
          call_type: pendingCall.call_type,
          status: 'ringing',
          caller_name: pendingCall.caller_name,
          meeting_url: pendingCall.meeting_url,
          started_at: new Date().toISOString(),
        });
        
        // Pre-warm call system for faster answer
        prewarmCallSystem(pendingCall.call_type === 'video').catch(err => {
          console.warn('[CallProvider] Prewarm on pending call failed:', err);
        });
      }
    } catch (error) {
      console.error('[CallProvider] Error checking pending call:', error);
    }
  }, [currentUserId]);
  
  // Listen for CallKeep events (answer/end from native UI)
  // NOTE: CallKeep event listeners removed - library broken with Expo SDK 54+
  // Incoming calls now handled via push notifications + WhatsAppStyleIncomingCall UI
  useEffect(() => {
    if (!callsEnabled) return;
    
    // Check for pending calls on mount (from background notification)
    checkPendingCall();
    
    // No cleanup needed - CallKeep removed
  }, [callsEnabled, checkPendingCall]);

  // Refs for stable callback references in notification listeners
  // These refs hold the latest callback values and are updated after callbacks are defined
  const incomingCallRef = React.useRef(incomingCall);
  incomingCallRef.current = incomingCall;
  
  // Initialize callback refs with undefined - they're set after callbacks are defined below
  const answerCallRef = React.useRef<() => void>(() => {});
  
  const rejectCallRef = React.useRef<() => Promise<void>>(async () => {});
  
  // Additional refs for notification received listener
  const answeringCallRef = React.useRef(answeringCall);
  answeringCallRef.current = answeringCall;
  
  const outgoingCallRef = React.useRef(outgoingCall);
  outgoingCallRef.current = outgoingCall;
  
  const currentUserIdRef = React.useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  
  const setIncomingCallRef = React.useRef(setIncomingCall);
  setIncomingCallRef.current = setIncomingCall;

  // Ref for endCall to use in notification event listeners
  const endCallRef = React.useRef<() => Promise<void>>(() => Promise.resolve());

  // Listen for notification action button presses from foreground service
  // (End Call / Mute buttons on the ongoing call notification)
  useEffect(() => {
    if (!callsEnabled) return;
    
    console.log('[CallProvider] Setting up notification action listeners');
    
    // Handle "End Call" button press from notification
    const endCallListener = DeviceEventEmitter.addListener(
      CALL_NOTIFICATION_EVENTS.END_CALL,
      () => {
        console.log('[CallProvider] 🛑 END_CALL event received from notification');
        if (endCallRef.current) {
          endCallRef.current();
        }
      }
    );
    
    // Handle "Mute" button press from notification
    // Note: Mute state is managed within VoiceCallInterface/WhatsAppStyleVideoCall
    // We emit a global event that those components can listen to
    const muteListener = DeviceEventEmitter.addListener(
      CALL_NOTIFICATION_EVENTS.MUTE,
      () => {
        console.log('[CallProvider] 🔇 MUTE event received from notification');
        // Emit a more specific event for the active call interface to handle
        DeviceEventEmitter.emit('call:toggle-mute');
      }
    );
    
    // Handle "Speaker" button press from notification
    // Toggles between earpiece and speaker output
    const speakerListener = DeviceEventEmitter.addListener(
      CALL_NOTIFICATION_EVENTS.SPEAKER,
      () => {
        console.log('[CallProvider] 🔊 SPEAKER event received from notification');
        // Emit a more specific event for the active call interface to handle
        DeviceEventEmitter.emit('call:toggle-speaker');
      }
    );
    
    return () => {
      endCallListener.remove();
      muteListener.remove();
      speakerListener.remove();
    };
  }, [callsEnabled]);

  // Listen for notification responses (Answer/Decline from notification drawer)
  useEffect(() => {
    if (!callsEnabled) return;
    
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data;
      
      // Only handle incoming call notifications
      if (data?.type !== 'incoming_call') return;
      
      const actionId = response.actionIdentifier;
      const callId = data.call_id as string;
      
      console.log('[CallProvider] Notification action received:', { actionId, callId });
      
      // Cancel vibration immediately
      Vibration.cancel();
      
      // Cancel the notification
      await cancelIncomingCallNotification(callId);
      await BadgeCoordinator.clearCategory('incomingCall');
      
      if (actionId === 'ANSWER' || actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        // User tapped Answer or the notification itself
        console.log('[CallProvider] Answering call from notification:', callId);
        
        // Check if we have this as the current incoming call (using ref for latest value)
        if (incomingCallRef.current?.call_id === callId) {
          answerCallRef.current();
        } else {
          // Try to fetch call from DB and set it up
          const { data: call } = await getSupabase()
            .from('active_calls')
            .select('*')
            .eq('call_id', callId)
            .maybeSingle();
          
          if (call) {
            // Fetch caller name
            const { data: profile } = await getSupabase()
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', call.caller_id)
              .maybeSingle();
            
            const callerName = profile
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'
              : data.caller_name as string || 'Unknown';
            
            const activeCall: ActiveCall = {
              ...call,
              caller_name: callerName,
              meeting_url: call.meeting_url || data.meeting_url as string,
            };
            
            setAnsweringCall(activeCall);
            setIsCallInterfaceOpen(true);
            setCallState('connecting');
          }
        }
      } else if (actionId === 'DECLINE') {
        // User tapped Decline
        console.log('[CallProvider] Declining call from notification:', callId);
        
        if (incomingCallRef.current?.call_id === callId) {
          rejectCallRef.current();
        } else {
          // Update call status in DB
          await getSupabase()
            .from('active_calls')
            .update({ status: 'rejected', ended_at: new Date().toISOString() })
            .eq('call_id', callId);
        }
      }
    });
    
    return () => subscription.remove();
  }, [callsEnabled]); // Only depend on callsEnabled, use refs for other values

  // Listen for notifications RECEIVED (not just tapped) - handles background wake-up
  useEffect(() => {
    if (!callsEnabled) return;
    
    console.log('[CallProvider] Setting up notification RECEIVED listener');
    
    const subscription = Notifications.addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data;
      
      // Only handle incoming call notifications
      if (data?.type !== 'incoming_call') return;
      
      console.log('[CallProvider] 📱 Notification received:', {
        callId: data.call_id,
        callerName: data.caller_name,
        hasIncomingCall: !!incomingCallRef.current,
        hasAnsweringCall: !!answeringCallRef.current,
        hasOutgoingCall: !!outgoingCallRef.current,
      });
      
      // CRITICAL: Ignore notifications for calls WE initiated (we are the caller)
      if (data.caller_id && data.caller_id === currentUserIdRef.current) {
        console.log('[CallProvider] Ignoring notification - we are the caller');
        return;
      }
      
      // If we already have this call or are in a call, ignore (using refs)
      if (incomingCallRef.current?.call_id === data.call_id || answeringCallRef.current || outgoingCallRef.current) {
        console.log('[CallProvider] Ignoring notification - already handling call');
        return;
      }
      
      // Verify the call is still active (not ended) before showing UI
      try {
        const { data: callRecord } = await getSupabase()
          .from('active_calls')
          .select('status, ended_at')
          .eq('call_id', data.call_id)
          .maybeSingle();
        
        if (!callRecord || callRecord.status === 'ended' || callRecord.ended_at) {
          console.log('[CallProvider] Ignoring notification - call not found or already ended:', data.call_id);
          return;
        }
      } catch (err) {
        console.warn('[CallProvider] Error checking call status:', err);
        // Continue anyway - might be a race condition
      }
      
      // Show incoming call UI when notification is received
      // This handles the case where the app was woken by the notification
      const activeCall: ActiveCall = {
        id: data.call_id as string,
        call_id: data.call_id as string,
        caller_id: data.caller_id as string,
        callee_id: currentUserIdRef.current || '',
        thread_id: (data.thread_id as string | undefined) || null,
        caller_name: data.caller_name as string || 'Unknown',
        call_type: (data.call_type as 'voice' | 'video') || 'voice',
        status: 'ringing',
        meeting_url: data.meeting_url as string,
        started_at: new Date().toISOString(),
      };
      
      console.log('[CallProvider] Setting incoming call from notification:', activeCall.call_id);
      setIncomingCallRef.current(activeCall);
      
      // OPTIMIZATION: Pre-warm call system on notification so Daily.co is ready for answer
      prewarmCallSystem(activeCall.call_type === 'video').catch(err => {
        console.warn('[CallProvider] Prewarm on notification failed (non-fatal):', err);
      });
      
      // Start vibration for incoming call
      Vibration.vibrate([0, 1000, 500, 1000, 500, 1000], true);
    });
    
    return () => {
      console.log('[CallProvider] Removing notification RECEIVED listener');
      subscription.remove();
    };
  }, [callsEnabled]); // Only depend on callsEnabled, use refs for other values

  // Listen for incoming calls via Supabase Realtime
  useEffect(() => {
    if (!currentUserId || !callsEnabled) return;

    console.log('[CallProvider] Setting up incoming call listener for user:', currentUserId);

    // Push notifications (FCM/Expo) are the primary wake path for
    // background/terminated app states. Keep Realtime only as a foreground
    // enhancer to avoid depending on websocket delivery for wake-up scenarios.
    const channel = getSupabase()
      .channel(`incoming-calls-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'active_calls',
          filter: `callee_id=eq.${currentUserId}`,
        },
        async (payload: { new: ActiveCall }) => {
          console.log('[CallProvider] ✅ Incoming call INSERT detected:', payload.new);
          const call = payload.new;

          // CRITICAL: Ignore our own outgoing calls (caller_id = us)
          if (call.caller_id === currentUserId) {
            console.log('[CallProvider] Ignoring own outgoing call INSERT:', call.call_id);
            return;
          }

          // Ignore calls that are already ended or have ended_at set
          if (call.status === 'ended' || call.ended_at) {
            console.log('[CallProvider] Ignoring ended call:', call.call_id);
            return;
          }

          if (call.status === 'ringing') {
            // Fetch full call record to ensure we have meeting_url
            let meetingUrl = call.meeting_url;

            if (!meetingUrl) {
              console.log('[CallProvider] Fetching meeting_url from DB...');
              await new Promise((resolve) => setTimeout(resolve, 300));

              const { data: fullCall } = await getSupabase()
                .from('active_calls')
                .select('*')
                .eq('call_id', call.call_id)
                .maybeSingle();

              if (fullCall?.meeting_url) {
                meetingUrl = fullCall.meeting_url;
              }
            }

            // Fetch caller name
            const { data: profile } = await getSupabase()
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', call.caller_id)
              .maybeSingle();

            const callerName = profile
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'
              : 'Unknown';

            console.log('[CallProvider] Setting incoming call state:', {
              callId: call.call_id,
              callerName,
              meetingUrl: meetingUrl ? 'present' : 'missing',
            });

            // Display on native call screen (works when device is locked)
            await callKeepManager.displayIncomingCall(
              call.call_id,
              callerName,
              call.call_type === 'video'
            );

            setIncomingCall({
              ...call,
              meeting_url: meetingUrl,
              caller_name: callerName,
            });
            
            // OPTIMIZATION: Pre-warm call system immediately so Daily.co object
            // is ready when user presses Answer. This eliminates ~1-2s of latency.
            prewarmCallSystem(call.call_type === 'video').catch(err => {
              console.warn('[CallProvider] Prewarm on incoming call failed (non-fatal):', err);
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'active_calls',
          filter: `callee_id=eq.${currentUserId}`,
        },
        async (payload: { new: ActiveCall }) => {
          console.log('[CallProvider] ✅ Incoming call UPDATE detected:', payload.new);
          const call = payload.new;
          if (
            call.status === 'ended' ||
            call.status === 'rejected' ||
            call.status === 'missed'
          ) {
            // Cancel notification and vibration when call ends for any reason
            await cancelIncomingCallNotification(call.call_id);
            await BadgeCoordinator.clearCategory('incomingCall');
            Vibration.cancel();
            
            if (incomingCall?.call_id === call.call_id) {
              setIncomingCall(null);
              setCallState('ended');
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[CallProvider] Realtime subscription status:', status);
      });

    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [currentUserId, incomingCall, callsEnabled]);

  // Listen for call signals (backup for meeting_url)
  useEffect(() => {
    if (!currentUserId || !callsEnabled) return;

    const signalChannel = getSupabase()
      .channel(`call-signals-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `to_user_id=eq.${currentUserId}`,
        },
        async (payload: { new: CallSignal }) => {
          const signal = payload.new;
          const signalPayload = signal.payload as CallSignalPayload | null;

          if (signal.signal_type === 'upgrade_to_video' || signal.signal_type === 'upgrade_ack') {
            const nextMeetingUrl = signalPayload?.meeting_url;
            const nextThreadId = (signal.payload as any)?.thread_id as string | undefined;

            setIncomingCall((prev) => {
              if (!prev || prev.call_id !== signal.call_id) return prev;
              return {
                ...prev,
                call_type: 'video',
                meeting_url: nextMeetingUrl || prev.meeting_url,
                thread_id: nextThreadId || prev.thread_id,
              };
            });

            setAnsweringCall((prev) => {
              if (!prev || prev.call_id !== signal.call_id) return prev;
              return {
                ...prev,
                call_type: 'video',
                meeting_url: nextMeetingUrl || prev.meeting_url,
                thread_id: nextThreadId || prev.thread_id,
              };
            });

            setOutgoingCall((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                callType: 'video',
                callId: prev.callId || signal.call_id,
                meetingUrl: nextMeetingUrl || prev.meetingUrl,
                threadId: nextThreadId || prev.threadId,
                roomName: prev.roomName || `call-${signal.call_id}`,
              };
            });

            if (signal.signal_type === 'upgrade_to_video') {
              try {
                await getSupabase().from('call_signals').insert({
                  call_id: signal.call_id,
                  from_user_id: currentUserId,
                  to_user_id: signal.from_user_id,
                  signal_type: 'upgrade_ack',
                  payload: {
                    call_type: 'video',
                    meeting_url: nextMeetingUrl,
                    thread_id: nextThreadId,
                  },
                });
              } catch (ackError) {
                console.warn('[CallProvider] Failed to send upgrade ack:', ackError);
              }
            }
            return;
          }

          if (signal.signal_type !== 'offer') return;

          const meetingUrl = signalPayload?.meeting_url;
          if (!meetingUrl) return;

          setIncomingCall((prev) => {
            if (prev && prev.call_id === signal.call_id) {
              if (prev.meeting_url === meetingUrl) return prev;
              console.log('[CallProvider] Updated meeting_url from signal');
              return { ...prev, meeting_url: meetingUrl };
            }

            // Create placeholder if active_calls hasn't arrived yet
            console.log('[CallProvider] Creating placeholder from signal');
            return {
              id: signal.id,
              call_id: signal.call_id,
              caller_id: signal.from_user_id,
              callee_id: signal.to_user_id,
              call_type: signalPayload?.call_type || 'voice',
              status: 'ringing',
              caller_name: signalPayload?.caller_name || 'Unknown',
              meeting_url: meetingUrl,
              thread_id: (signal.payload as any)?.thread_id as string | undefined,
              started_at: signal.created_at,
            };
          });
        }
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(signalChannel);
    };
  }, [currentUserId, callsEnabled]);

  // Start voice call
  const startVoiceCall = useCallback(
    async (userId: string, userName?: string, options?: CallStartOptions) => {
      if (!currentUserId || !callsEnabled) {
        console.warn('[CallProvider] Cannot start call - user not logged in or calls disabled');
        Alert.alert('Unable to Call', 'Please sign in and ensure calls are enabled.');
        return;
      }
      
      track('edudash.calls.start_click', { call_type: 'voice' });

      // Refresh presence in the background (do not block call start UX).
      console.log('[CallProvider] Refreshing presence before call check (non-blocking)...');
      void refreshPresence().catch((err) => {
        console.warn('[CallProvider] Presence refresh failed (non-blocking):', err);
      });
      
      // Check if user is online
      const userOnline = isUserOnline(userId);
      const lastSeenText = getLastSeenText(userId);
      console.log('[CallProvider] Presence check:', {
        userId,
        userName,
        userOnline,
        lastSeenText
      });
      
      // Allow calls to offline users - they'll receive a push notification
      // Previously we blocked calls to offline users, but push notifications can wake the app
      if (!userOnline) {
        console.log('[CallProvider] User offline, will send push notification');
        toast.info(`${userName || 'User'} appears offline. They'll receive a notification.`);
      }
      
      console.log('[CallProvider] Starting call (user online:', userOnline, ')');
      
      setOutgoingCall({
        userId,
        userName,
        callType: 'voice',
        threadId: options?.threadId,
        roomName: `voice-${Date.now()}`,
      });
      setIsCallInterfaceOpen(true);
      setCallState('connecting');
    },
    [currentUserId, callsEnabled, isUserOnline, getLastSeenText, refreshPresence]
  );

  // Start video call
  const startVideoCall = useCallback(
    async (userId: string, userName?: string, options?: CallStartOptions) => {
      if (!currentUserId || !callsEnabled) {
        console.warn('[CallProvider] Cannot start call - user not logged in or calls disabled');
        Alert.alert('Unable to Call', 'Please sign in and ensure calls are enabled.');
        return;
      }
      
      track('edudash.calls.start_click', { call_type: 'video' });

      // Refresh presence in the background (do not block call start UX).
      console.log('[CallProvider] Refreshing presence before video call check (non-blocking)...');
      void refreshPresence().catch((err) => {
        console.warn('[CallProvider] Presence refresh failed (non-blocking):', err);
      });
      
      // Check if user is online
      const userOnline = isUserOnline(userId);
      const lastSeenText = getLastSeenText(userId);
      console.log('[CallProvider] Video presence check:', {
        userId,
        userName,
        userOnline,
        lastSeenText
      });
      
      // Allow calls to offline users - they'll receive a push notification
      if (!userOnline) {
        console.log('[CallProvider] User offline, will send push notification for video call');
        toast.info(`${userName || 'User'} appears offline. They'll receive a notification.`);
      }
      
      console.log('[CallProvider] Starting video call (user online:', userOnline, ')');
      
      setOutgoingCall({
        userId,
        userName,
        callType: 'video',
        threadId: options?.threadId,
        roomName: `call-${Date.now()}`,
      });
      setIsCallInterfaceOpen(true);
      setCallState('connecting');
    },
    [currentUserId, callsEnabled, isUserOnline, getLastSeenText, refreshPresence]
  );

  // Answer incoming call
  const answerCall = useCallback(async () => {
    if (!incomingCall) return;
    console.log('[CallProvider] ✅ Answering call:', {
      callId: incomingCall.call_id,
      meetingUrl: incomingCall.meeting_url,
      callerName: incomingCall.caller_name,
    });
    
    // Cancel both types of notifications and vibration
    await cancelIncomingCallNotification(incomingCall.call_id);
    await cancelBackgroundCallNotification(incomingCall.call_id);
    await BadgeCoordinator.clearCategory('incomingCall');
    Vibration.cancel();
    
    // Report to CallKeep that call is being answered
    await callKeepManager.reportConnected(incomingCall.call_id);
    
    setAnsweringCall(incomingCall);
    setIsCallInterfaceOpen(true);
    setIncomingCall(null);
    setCallState('connecting');
  }, [incomingCall]);

  // Keep ref updated with latest answerCall function for notification handlers
  answerCallRef.current = answerCall;

  // Reject incoming call
  const rejectCall = useCallback(async () => {
    if (!incomingCall) return;
    console.log('[CallProvider] Rejecting call:', incomingCall.call_id);

    // Cancel both types of notifications and vibration
    await cancelIncomingCallNotification(incomingCall.call_id);
    await cancelBackgroundCallNotification(incomingCall.call_id);
    await BadgeCoordinator.clearCategory('incomingCall');
    Vibration.cancel();

    // End call in CallKeep
    await callKeepManager.endCall(incomingCall.call_id);

    await getSupabase()
      .from('active_calls')
      .update({ status: 'rejected', ended_at: new Date().toISOString() })
      .eq('call_id', incomingCall.call_id);

    setIncomingCall(null);
    setCallState('idle');
  }, [incomingCall]);

  // Keep ref updated with latest rejectCall function for notification handlers
  rejectCallRef.current = rejectCall;

  // End current call
  const endCall = useCallback(async () => {
    const callId = answeringCall?.call_id || outgoingCall?.userId;
    console.log('[CallProvider] Ending call:', callId);

    // End call in CallKeep
    if (callId) {
      await callKeepManager.endCall(callId);
    }

    if (answeringCall?.call_id) {
      // Update call status with ended_at timestamp to prevent race conditions
      await getSupabase()
        .from('active_calls')
        .update({ 
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('call_id', answeringCall.call_id);
    }

    // Also update outgoing call if it exists
    if (outgoingCall?.userId) {
      // Use maybeSingle() instead of single() to avoid 406 error when no rows found
      const { data: callRecord } = await getSupabase()
        .from('active_calls')
        .select('call_id')
        .eq('caller_id', currentUserId)
        .eq('callee_id', outgoingCall.userId)
        .eq('status', 'ringing')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (callRecord?.call_id) {
        await getSupabase()
          .from('active_calls')
          .update({ 
            status: 'ended',
            ended_at: new Date().toISOString(),
          })
          .eq('call_id', callRecord.call_id);
      }
    }

    setIsCallInterfaceOpen(false);
    setOutgoingCall(null);
    setAnsweringCall(null);
    setCallState('ended');

    // Reset state after a short delay
    setTimeout(() => setCallState('idle'), 1000);
  }, [answeringCall, outgoingCall, currentUserId]);

  // Keep ref updated with latest endCall function for notification handlers
  endCallRef.current = endCall;

  // Return to active call (for minimized calls)
  const returnToCall = useCallback(() => {
    if (answeringCall || outgoingCall) {
      setIsCallInterfaceOpen(true);
    }
  }, [answeringCall, outgoingCall]);

  // Switch from voice to video without ending the active call session.
  // isSwitchingMode is set to true BEFORE the callType changes, and cleared
  // AFTER a short delay so the video component has mounted and joined.
  // During isSwitchingMode, participant-left events are suppressed on the
  // peer side (via the upgrade_to_video signal) to avoid premature call end.
  const switchToVideoCall = useCallback(async () => {
    if (!currentUserId || isSwitchingMode) return;

    const currentCallId = answeringCall?.call_id || outgoingCall?.callId || null;
    const peerUserId = answeringCall?.caller_id || outgoingCall?.userId || null;
    if (!peerUserId) return;

    setIsSwitchingMode(true);
    try {
      let callRecord: Pick<ActiveCall, 'call_id' | 'meeting_url' | 'thread_id'> | null = null;

      if (currentCallId) {
        const { data } = await getSupabase()
          .from('active_calls')
          .select('call_id, meeting_url, thread_id')
          .eq('call_id', currentCallId)
          .maybeSingle();
        callRecord = data as any;
      }

      if (!callRecord) {
        const { data } = await getSupabase()
          .from('active_calls')
          .select('call_id, meeting_url, thread_id')
          .eq('caller_id', currentUserId)
          .eq('callee_id', peerUserId)
          .in('status', ['ringing', 'connected'])
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        callRecord = data as any;
      }

      if (!callRecord?.call_id) {
        toast.warn('Could not locate an active call to upgrade.');
        return;
      }

      // Update call type to video in DB
      await getSupabase()
        .from('active_calls')
        .update({ call_type: 'video' })
        .eq('call_id', callRecord.call_id);

      // Send upgrade signal to peer
      await getSupabase().from('call_signals').insert({
        call_id: callRecord.call_id,
        from_user_id: currentUserId,
        to_user_id: peerUserId,
        signal_type: 'upgrade_to_video',
        payload: {
          call_type: 'video',
          meeting_url: callRecord.meeting_url,
          thread_id: callRecord.thread_id || outgoingCall?.threadId || answeringCall?.thread_id,
        },
      });

      // CRITICAL: Set callState to 'connected' to prevent the video component
      // from showing ringback or ringing UI — this is an upgrade, not a new call
      setCallState('connected');

      setOutgoingCall((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          callType: 'video',
          callId: callRecord?.call_id || prev.callId,
          meetingUrl: callRecord?.meeting_url || prev.meetingUrl,
          threadId: (callRecord?.thread_id as string | undefined) || prev.threadId,
          roomName: prev.roomName || `call-${callRecord?.call_id}`,
        };
      });

      setAnsweringCall((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          call_type: 'video',
          meeting_url: callRecord?.meeting_url || prev.meeting_url,
          thread_id: (callRecord?.thread_id as string | undefined) || prev.thread_id,
        };
      });
    } catch (error) {
      console.warn('[CallProvider] Failed to switch to video:', error);
      toast.error('Could not switch to video. Please try again.');
    } finally {
      // Delay clearing isSwitchingMode so the video component has time to mount
      // and join the room before participant-left events are processed
      setTimeout(() => setIsSwitchingMode(false), 3000);
    }
  }, [answeringCall, currentUserId, isSwitchingMode, outgoingCall]);

  // Calculate derived state
  const isCallActive = isCallInterfaceOpen || !!incomingCall;
  // isInActiveCall: true when we have an active call (regardless of UI state)
  // Used by FloatingCallOverlay to show mini call UI when modal is closed
  const isInActiveCall = !!(answeringCall || outgoingCall);

  const contextValue: CallContextType = {
    startVoiceCall,
    startVideoCall,
    answerCall,
    rejectCall,
    endCall,
    incomingCall,
    outgoingCall,
    isCallActive,
    isInActiveCall,
    isCallInterfaceOpen,
    callState,
    returnToCall,
    // Presence methods - unified single source to prevent duplicate subscriptions
    isUserOnline,
    getLastSeenText,
    refreshPresence,
    recordActivity,
  };

  return (
    <CallContext.Provider value={contextValue}>
      {children}
      
      {/* WhatsApp-Style Incoming call overlay */}
      {callsEnabled && (
        <WhatsAppStyleIncomingCall
          isVisible={!!incomingCall && !answeringCall}
          callerName={incomingCall?.caller_name || 'Unknown'}
          callerPhoto={callerPhotoUrl}
          callType={incomingCall?.call_type || 'voice'}
          onAnswer={answerCall}
          onReject={rejectCall}
          isConnecting={callState === 'connecting' || callState === 'connected'}
        />
      )}

      {/* Voice call interface for outgoing calls */}
      {callsEnabled && outgoingCall && outgoingCall.callType === 'voice' && (
        <VoiceCallInterface
          isOpen={isCallInterfaceOpen && !answeringCall}
          onClose={endCall}
          roomName={outgoingCall.roomName || `voice-${outgoingCall.userId}`}
          userName={outgoingCall.userName}
          isOwner={true}
          calleeId={outgoingCall.userId}
          callId={outgoingCall.callId}
          meetingUrl={outgoingCall.meetingUrl}
          threadId={outgoingCall.threadId}
          onSwitchToVideo={switchToVideoCall}
        />
      )}

      {/* WhatsApp-Style Video call interface for outgoing calls */}
      {callsEnabled && outgoingCall && outgoingCall.callType === 'video' && (
        <WhatsAppStyleVideoCall
          isOpen={isCallInterfaceOpen && !answeringCall}
          onClose={endCall}
          roomName={outgoingCall.roomName || `call-${outgoingCall.userId}`}
          userName={outgoingCall.userName}
          remoteUserName={outgoingCall.userName}
          isOwner={true}
          calleeId={outgoingCall.userId}
          callId={outgoingCall.callId}
          meetingUrl={outgoingCall.meetingUrl}
          threadId={outgoingCall.threadId}
        />
      )}

      {/* Voice call interface for answering calls */}
      {callsEnabled && answeringCall && answeringCall.call_type === 'voice' && answeringCall.meeting_url && (
        <VoiceCallInterface
          isOpen={isCallInterfaceOpen}
          onClose={endCall}
          roomName={answeringCall.meeting_url.split('/').pop() || `voice-${answeringCall.call_id}`}
          userName={answeringCall.caller_name}
          isOwner={false}
          callId={answeringCall.call_id}
          meetingUrl={answeringCall.meeting_url}
          threadId={answeringCall.thread_id || undefined}
          onSwitchToVideo={switchToVideoCall}
        />
      )}
      
      {callsEnabled && answeringCall && !answeringCall.meeting_url && (
        (() => {
          console.error('[CallProvider] ❌ Answering call but NO meeting_url!', answeringCall);
          return null;
        })()
      )}

      {/* WhatsApp-Style Video call interface for answering calls */}
      {callsEnabled && answeringCall && answeringCall.meeting_url && answeringCall.call_type === 'video' && (
        <WhatsAppStyleVideoCall
          isOpen={isCallInterfaceOpen}
          onClose={endCall}
          roomName={answeringCall.meeting_url.split('/').pop() || `call-${answeringCall.call_id}`}
          userName={answeringCall.caller_name}
          remoteUserName={answeringCall.caller_name}
          isOwner={false}
          callId={answeringCall.call_id}
          meetingUrl={answeringCall.meeting_url}
          threadId={answeringCall.thread_id || undefined}
        />
      )}
    </CallContext.Provider>
  );
}

export default CallProvider;
