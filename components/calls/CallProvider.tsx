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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from '@/lib/utils/eventEmitter';
import { assertSupabase } from '@/lib/supabase';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { BadgeCoordinator } from '@/lib/BadgeCoordinator';
import {
  getPendingCall,
  cancelIncomingCallNotification,
  setupForegroundCallHandler,
  type IncomingCallData,
} from '@/lib/calls/CallHeadlessTask';
import { 
  checkForIncomingCallOnLaunch, 
  cancelIncomingCallNotification as cancelBackgroundCallNotification 
} from '@/lib/calls/CallBackgroundNotification';
import { setupIncomingCallNotifications } from '@/lib/calls/setupPushNotifications';
import { callKeepManager } from '@/lib/calls/callkeep-manager';
import { prewarmCallSystem } from '@/lib/calls/CallPrewarming';
import { toast } from '@/components/ui/ToastProvider';
import { track } from '@/lib/analytics';
const getSupabase = () => assertSupabase();
import { VoiceCallInterface } from './VoiceCallInterface';
import { WhatsAppStyleVideoCall } from './WhatsAppStyleVideoCall';
import { WhatsAppStyleIncomingCall } from './WhatsAppStyleIncomingCall';
import {
  CALL_NOTIFICATION_EVENTS,
  PENDING_RETURN_TO_CALL_KEY,
  setupForegroundEventListener,
} from './hooks/useCallBackgroundHandler';
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
const isCallsEnabled = () => {
  const flags = getFeatureFlagsSync();
  return flags.video_calls_enabled || flags.voice_calls_enabled;
};
function extractIncomingTargetUserId(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const target = data.callee_id || data.user_id || data.recipient_id || data.target_user_id;
  return typeof target === 'string' && target.trim().length > 0 ? target : null;
}
function isIncomingCallForCurrentUser(
  data: Record<string, unknown> | null | undefined,
  currentUserId: string | null,
): boolean {
  if (!currentUserId) return true;
  const targetUserId = extractIncomingTargetUserId(data);
  return !targetUserId || targetUserId === currentUserId;
}
const CallContext = createContext<CallContextType | null>(null);
export function useCallSafe(): CallContextType | null {
  return useContext(CallContext);
}
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
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const callsEnabled = isCallsEnabled();
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
  const presence = usePresence(currentUserId);
  const isUserOnline = presence.isUserOnline;
  const getLastSeenText = presence.getLastSeenText;
  const refreshPresence = presence.refreshPresence;
  const recordActivity = presence.recordActivity;
  useEffect(() => {
    const unsubscribeForegroundEvents = callsEnabled
      ? setupForegroundEventListener()
      : () => {};
    const getUser = async () => {
      const { data: { user } } = await getSupabase().auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
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
    };
  }, [callsEnabled]);
  useEffect(() => {
    if (!callsEnabled) return;
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const prevState = appStateRef.current;
      if (prevState === nextAppState) return; // skip redundant transitions
      appStateRef.current = nextAppState;
      if (nextAppState === 'active' && prevState !== 'active') {
        console.log('[CallProvider] App foregrounded from', prevState);
        void checkPendingReturnToCall();
        checkPendingCall();
      }
    });
    return () => subscription.remove();
  }, [callsEnabled]);
  useEffect(() => {
    if (!callsEnabled || Platform.OS !== 'android') return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (incomingCall && !answeringCall) {
        console.log('[CallProvider] Back button pressed - rejecting incoming call');
        rejectCallRef.current();
        return true; // Prevent default back behavior
      }
      if (isCallInterfaceOpen && (answeringCall || outgoingCall)) {
        console.log('[CallProvider] Back button pressed - minimizing call (call continues)');
        setIsCallInterfaceOpen(false);
        return true; // Prevent default back behavior
      }
      return false; // Let default back behavior happen
    });
    return () => backHandler.remove();
  }, [callsEnabled, incomingCall, answeringCall, outgoingCall, isCallInterfaceOpen]);
  const checkPendingCall = useCallback(async () => {
    try {
      let pendingCall = await getPendingCall();
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
        if (
          outgoingCall &&
          pendingCall.caller_id &&
          outgoingCall.userId === pendingCall.caller_id
        ) {
          console.log('[CallProvider] Ignoring pending incoming call while outgoing call to same peer is active');
          return;
        }
        if (
          pendingCall.callee_id &&
          currentUserId &&
          pendingCall.callee_id !== currentUserId
        ) {
          console.log('[CallProvider] Ignoring pending call not targeted to current user:', {
            callId: pendingCall.call_id,
            target: pendingCall.callee_id,
            currentUserId,
          });
          return;
        }
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
        prewarmCallSystem(pendingCall.call_type === 'video').catch(err => {
          console.warn('[CallProvider] Prewarm on pending call failed:', err);
        });
      }
    } catch (error) {
      console.error('[CallProvider] Error checking pending call:', error);
    }
  }, [currentUserId, outgoingCall]);
  const checkPendingReturnToCall = useCallback(async () => {
    try {
      const payload = await AsyncStorage.getItem(PENDING_RETURN_TO_CALL_KEY);
      if (!payload) return;
      await AsyncStorage.removeItem(PENDING_RETURN_TO_CALL_KEY);
      let timestamp = 0;
      try {
        const parsed = JSON.parse(payload);
        timestamp = Number(parsed?.timestamp || 0);
      } catch {
        timestamp = 0;
      }
      if (timestamp > 0 && Date.now() - timestamp > 120000) {
        return;
      }
      if (answeringCall || outgoingCall) {
        console.log('[CallProvider] Restoring active call UI from notification press');
        setIsCallInterfaceOpen(true);
      }
    } catch (error) {
      console.warn('[CallProvider] Failed to restore call UI from pending notification action:', error);
    }
  }, [answeringCall, outgoingCall]);
  useEffect(() => {
    if (!callsEnabled) return;
    checkPendingCall();
  }, [callsEnabled, checkPendingCall]);
  const incomingCallRef = React.useRef(incomingCall);
  incomingCallRef.current = incomingCall;
  const answerCallRef = React.useRef<() => void>(() => {});
  const rejectCallRef = React.useRef<() => Promise<void>>(async () => {});
  const answeringCallRef = React.useRef(answeringCall);
  answeringCallRef.current = answeringCall;
  const outgoingCallRef = React.useRef(outgoingCall);
  outgoingCallRef.current = outgoingCall;
  const currentUserIdRef = React.useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const setIncomingCallRef = React.useRef(setIncomingCall);
  setIncomingCallRef.current = setIncomingCall;
  const endCallRef = React.useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    if (!callsEnabled) return;
    console.log('[CallProvider] Setting up notification action listeners');
    const endCallListener = DeviceEventEmitter.addListener(
      CALL_NOTIFICATION_EVENTS.END_CALL,
      () => {
        console.log('[CallProvider] 🛑 END_CALL event received from notification');
        if (endCallRef.current) {
          endCallRef.current();
        }
      }
    );
    const muteListener = DeviceEventEmitter.addListener(
      CALL_NOTIFICATION_EVENTS.MUTE,
      () => {
        console.log('[CallProvider] 🔇 MUTE event received from notification');
        DeviceEventEmitter.emit('call:toggle-mute');
      }
    );
    const speakerListener = DeviceEventEmitter.addListener(
      CALL_NOTIFICATION_EVENTS.SPEAKER,
      () => {
        console.log('[CallProvider] 🔊 SPEAKER event received from notification');
        DeviceEventEmitter.emit('call:toggle-speaker');
      }
    );
    const returnListener = DeviceEventEmitter.addListener(
      CALL_NOTIFICATION_EVENTS.RETURN,
      () => {
        console.log('[CallProvider] ↩️ RETURN event received from call notification');
        if (answeringCallRef.current || outgoingCallRef.current) {
          setIsCallInterfaceOpen(true);
        }
      }
    );
    return () => {
      endCallListener.remove();
      muteListener.remove();
      speakerListener.remove();
      returnListener.remove();
    };
  }, [callsEnabled]);
  useEffect(() => {
    if (!callsEnabled) return;
    const answerListener = DeviceEventEmitter.addListener('call:notification:answer', async (payload: any) => {
      const callId = typeof payload?.call_id === 'string' ? payload.call_id : null;
      if (!callId) return;
      if (!isIncomingCallForCurrentUser(payload as Record<string, unknown>, currentUserIdRef.current)) {
        console.log('[CallProvider] Ignoring Notifee answer - target user mismatch');
        return;
      }
      await cancelIncomingCallNotification(callId);
      await cancelBackgroundCallNotification(callId);
      await BadgeCoordinator.clearCategory('incomingCall');
      Vibration.cancel();
      if (incomingCallRef.current?.call_id === callId) {
        answerCallRef.current();
        return;
      }
      const { data: call } = await getSupabase()
        .from('active_calls')
        .select('id, call_id, caller_id, callee_id, call_type, status, meeting_url, started_at, ended_at, duration_seconds, caller_name')
        .eq('call_id', callId)
        .maybeSingle();
      if (!call) return;
      const { data: profile } = await getSupabase()
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', call.caller_id)
        .maybeSingle();
      const callerName = profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'
        : (payload?.caller_name as string) || 'Unknown';
      const activeCall: ActiveCall = {
        ...call,
        caller_name: callerName,
        meeting_url: call.meeting_url || (payload?.meeting_url as string),
      };
      setAnsweringCall(activeCall);
      setIsCallInterfaceOpen(true);
      setCallState('connecting');
    });
    const declineListener = DeviceEventEmitter.addListener('call:notification:decline', async (payload: any) => {
      const callId = typeof payload?.call_id === 'string' ? payload.call_id : null;
      if (!callId) return;
      if (!isIncomingCallForCurrentUser(payload as Record<string, unknown>, currentUserIdRef.current)) {
        console.log('[CallProvider] Ignoring Notifee decline - target user mismatch');
        return;
      }
      await cancelIncomingCallNotification(callId);
      await cancelBackgroundCallNotification(callId);
      await BadgeCoordinator.clearCategory('incomingCall');
      Vibration.cancel();
      if (incomingCallRef.current?.call_id === callId) {
        rejectCallRef.current();
        return;
      }
      await getSupabase()
        .from('active_calls')
        .update({ status: 'rejected', ended_at: new Date().toISOString() })
        .eq('call_id', callId);
    });
    return () => {
      answerListener.remove();
      declineListener.remove();
    };
  }, [callsEnabled]);
  useEffect(() => {
    if (!callsEnabled) return;
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data;
      if (data?.type !== 'incoming_call') return;
      if (!isIncomingCallForCurrentUser(data as Record<string, unknown>, currentUserIdRef.current)) {
        console.log('[CallProvider] Ignoring notification action - target user mismatch');
        return;
      }
      const actionId = response.actionIdentifier;
      const callId = data.call_id as string;
      console.log('[CallProvider] Notification action received:', { actionId, callId });
      Vibration.cancel();
      await cancelIncomingCallNotification(callId);
      await BadgeCoordinator.clearCategory('incomingCall');
      if (actionId === 'ANSWER' || actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        console.log('[CallProvider] Answering call from notification:', callId);
        if (incomingCallRef.current?.call_id === callId) {
          answerCallRef.current();
        } else {
          const { data: call } = await getSupabase()
            .from('active_calls')
            .select('id, call_id, caller_id, callee_id, call_type, status, meeting_url, started_at, ended_at, duration_seconds, caller_name')
            .eq('call_id', callId)
            .maybeSingle();
          if (call) {
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
        console.log('[CallProvider] Declining call from notification:', callId);
        if (incomingCallRef.current?.call_id === callId) {
          rejectCallRef.current();
        } else {
          await getSupabase()
            .from('active_calls')
            .update({ status: 'rejected', ended_at: new Date().toISOString() })
            .eq('call_id', callId);
        }
      }
    });
    return () => subscription.remove();
  }, [callsEnabled]); // Only depend on callsEnabled, use refs for other values
  useEffect(() => {
    if (!callsEnabled) return;
    console.log('[CallProvider] Setting up notification RECEIVED listener');
    const subscription = Notifications.addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data;
      if (data?.type !== 'incoming_call') return;
      if (!isIncomingCallForCurrentUser(data as Record<string, unknown>, currentUserIdRef.current)) {
        console.log('[CallProvider] Ignoring notification - target user mismatch');
        return;
      }
      console.log('[CallProvider] 📱 Notification received:', {
        callId: data.call_id,
        callerName: data.caller_name,
        hasIncomingCall: !!incomingCallRef.current,
        hasAnsweringCall: !!answeringCallRef.current,
        hasOutgoingCall: !!outgoingCallRef.current,
      });
      if (data.caller_id && data.caller_id === currentUserIdRef.current) {
        console.log('[CallProvider] Ignoring notification - we are the caller');
        return;
      }
      if (incomingCallRef.current?.call_id === data.call_id || answeringCallRef.current || outgoingCallRef.current) {
        console.log('[CallProvider] Ignoring notification - already handling call');
        return;
      }
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
      }
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
      prewarmCallSystem(activeCall.call_type === 'video').catch(err => {
        console.warn('[CallProvider] Prewarm on notification failed (non-fatal):', err);
      });
      Vibration.vibrate([0, 1000, 500, 1000, 500, 1000], true);
    });
    return () => {
      console.log('[CallProvider] Removing notification RECEIVED listener');
      subscription.remove();
    };
  }, [callsEnabled]); // Only depend on callsEnabled, use refs for other values
  useEffect(() => {
    if (!callsEnabled) return;
    const unsubscribe = setupForegroundCallHandler(async (callData: IncomingCallData) => {
      const incomingPayload: Record<string, unknown> = { ...callData };
      if (!isIncomingCallForCurrentUser(incomingPayload, currentUserIdRef.current)) {
        console.log('[CallProvider] Ignoring foreground FCM call - target user mismatch');
        return;
      }
      if (callData.caller_id && callData.caller_id === currentUserIdRef.current) {
        console.log('[CallProvider] Ignoring foreground FCM call - we are the caller');
        return;
      }
      if (
        incomingCallRef.current?.call_id === callData.call_id ||
        answeringCallRef.current ||
        outgoingCallRef.current
      ) {
        console.log('[CallProvider] Ignoring foreground FCM call - already handling call');
        return;
      }
      try {
        const { data: callRecord } = await getSupabase()
          .from('active_calls')
          .select('status, ended_at')
          .eq('call_id', callData.call_id)
          .maybeSingle();
        if (!callRecord || callRecord.status === 'ended' || callRecord.ended_at) {
          console.log('[CallProvider] Ignoring foreground FCM call - call no longer active:', callData.call_id);
          return;
        }
      } catch (error) {
        console.warn('[CallProvider] Foreground FCM active call check failed:', error);
      }
      const activeCall: ActiveCall = {
        id: callData.call_id,
        call_id: callData.call_id,
        caller_id: callData.caller_id,
        callee_id: callData.callee_id || currentUserIdRef.current || '',
        thread_id: (callData as any).thread_id || null,
        caller_name: callData.caller_name || 'Unknown',
        call_type: callData.call_type || 'voice',
        status: 'ringing',
        meeting_url: callData.meeting_url,
        started_at: new Date().toISOString(),
      };
      console.log('[CallProvider] Setting incoming call from foreground FCM:', activeCall.call_id);
      setIncomingCallRef.current(activeCall);
      prewarmCallSystem(activeCall.call_type === 'video').catch((err) => {
        console.warn('[CallProvider] Prewarm on foreground FCM call failed (non-fatal):', err);
      });
      Vibration.vibrate([0, 1000, 500, 1000, 500, 1000], true);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [callsEnabled]);
  useEffect(() => {
    if (!currentUserId || !callsEnabled) return;
    console.log('[CallProvider] Setting up incoming call listener for user:', currentUserId);
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
          if (call.caller_id === currentUserId) {
            console.log('[CallProvider] Ignoring own outgoing call INSERT:', call.call_id);
            return;
          }
          if (outgoingCallRef.current && outgoingCallRef.current.userId === call.caller_id) {
            console.log('[CallProvider] Ignoring incoming INSERT while outgoing call to same peer is active:', call.call_id);
            return;
          }
          if (call.status === 'ended' || call.ended_at) {
            console.log('[CallProvider] Ignoring ended call:', call.call_id);
            return;
          }
          if (call.status === 'ringing') {
            let meetingUrl = call.meeting_url;
            if (!meetingUrl) {
              console.log('[CallProvider] Fetching meeting_url from DB...');
              await new Promise((resolve) => setTimeout(resolve, 300));
              const { data: fullCall } = await getSupabase()
                .from('active_calls')
                .select('call_id, meeting_url')
                .eq('call_id', call.call_id)
                .maybeSingle();
              if (fullCall?.meeting_url) {
                meetingUrl = fullCall.meeting_url;
              }
            }
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
          if (signal.to_user_id !== currentUserId) {
            console.log('[CallProvider] Ignoring signal not addressed to current user:', signal.call_id);
            return;
          }
          if (signal.from_user_id === currentUserId) {
            console.log('[CallProvider] Ignoring self-originated signal:', signal.call_id);
            return;
          }
          if (
            signal.signal_type === 'offer' &&
            outgoingCallRef.current &&
            (
              outgoingCallRef.current.callId === signal.call_id ||
              outgoingCallRef.current.userId === signal.from_user_id
            )
          ) {
            console.log('[CallProvider] Ignoring offer signal while outgoing call to same peer is active:', signal.call_id);
            return;
          }
          if (signal.signal_type === 'upgrade_to_video' || signal.signal_type === 'upgrade_ack') {
            setIsSwitchingMode(true);
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
            setTimeout(() => setIsSwitchingMode(false), 4000);
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
  const startVoiceCall = useCallback(
    async (userId: string, userName?: string, options?: CallStartOptions) => {
      if (!currentUserId || !callsEnabled) {
        console.warn('[CallProvider] Cannot start call - user not logged in or calls disabled');
        Alert.alert('Unable to Call', 'Please sign in and ensure calls are enabled.');
        return;
      }
      if (userId === currentUserId) {
        Alert.alert('Unable to Call', 'You cannot call your own account.');
        return;
      }
      track('edudash.calls.start_click', { call_type: 'voice' });
      console.log('[CallProvider] Refreshing presence before call check (non-blocking)...');
      void refreshPresence().catch((err) => {
        console.warn('[CallProvider] Presence refresh failed (non-blocking):', err);
      });
      const userOnline = isUserOnline(userId);
      const lastSeenText = getLastSeenText(userId);
      console.log('[CallProvider] Presence check:', {
        userId,
        userName,
        userOnline,
        lastSeenText
      });
      if (!userOnline) {
        console.log('[CallProvider] User offline, will send push notification');
        toast.info(`${userName || 'User'} appears offline. They'll receive a notification.`);
      }
      console.log('[CallProvider] Starting call (user online:', userOnline, ')');
      setIncomingCall(null);
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
  const startVideoCall = useCallback(
    async (userId: string, userName?: string, options?: CallStartOptions) => {
      if (!currentUserId || !callsEnabled) {
        console.warn('[CallProvider] Cannot start call - user not logged in or calls disabled');
        Alert.alert('Unable to Call', 'Please sign in and ensure calls are enabled.');
        return;
      }
      if (userId === currentUserId) {
        Alert.alert('Unable to Call', 'You cannot call your own account.');
        return;
      }
      track('edudash.calls.start_click', { call_type: 'video' });
      console.log('[CallProvider] Refreshing presence before video call check (non-blocking)...');
      void refreshPresence().catch((err) => {
        console.warn('[CallProvider] Presence refresh failed (non-blocking):', err);
      });
      const userOnline = isUserOnline(userId);
      const lastSeenText = getLastSeenText(userId);
      console.log('[CallProvider] Video presence check:', {
        userId,
        userName,
        userOnline,
        lastSeenText
      });
      if (!userOnline) {
        console.log('[CallProvider] User offline, will send push notification for video call');
        toast.info(`${userName || 'User'} appears offline. They'll receive a notification.`);
      }
      console.log('[CallProvider] Starting video call (user online:', userOnline, ')');
      setIncomingCall(null);
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
  const answerCall = useCallback(async () => {
    if (!incomingCall) return;
    console.log('[CallProvider] ✅ Answering call:', {
      callId: incomingCall.call_id,
      meetingUrl: incomingCall.meeting_url,
      callerName: incomingCall.caller_name,
    });
    await cancelIncomingCallNotification(incomingCall.call_id);
    await cancelBackgroundCallNotification(incomingCall.call_id);
    await BadgeCoordinator.clearCategory('incomingCall');
    Vibration.cancel();
    await callKeepManager.reportConnected(incomingCall.call_id);
    setAnsweringCall(incomingCall);
    setIsCallInterfaceOpen(true);
    setIncomingCall(null);
    setCallState('connecting');
  }, [incomingCall]);
  answerCallRef.current = answerCall;
  const rejectCall = useCallback(async () => {
    if (!incomingCall) return;
    console.log('[CallProvider] Rejecting call:', incomingCall.call_id);
    await cancelIncomingCallNotification(incomingCall.call_id);
    await cancelBackgroundCallNotification(incomingCall.call_id);
    await BadgeCoordinator.clearCategory('incomingCall');
    Vibration.cancel();
    await callKeepManager.endCall(incomingCall.call_id);
    await getSupabase()
      .from('active_calls')
      .update({ status: 'rejected', ended_at: new Date().toISOString() })
      .eq('call_id', incomingCall.call_id);
    setIncomingCall(null);
    setCallState('idle');
  }, [incomingCall]);
  rejectCallRef.current = rejectCall;
  const endCall = useCallback(async () => {
    const callId = answeringCall?.call_id || outgoingCall?.userId;
    console.log('[CallProvider] Ending call:', callId);
    if (callId) {
      await callKeepManager.endCall(callId);
    }
    if (answeringCall?.call_id) {
      await getSupabase()
        .from('active_calls')
        .update({ 
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('call_id', answeringCall.call_id);
    }
    if (outgoingCall?.userId) {
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
    setTimeout(() => setCallState('idle'), 1000);
  }, [answeringCall, outgoingCall, currentUserId]);
  endCallRef.current = endCall;
  const returnToCall = useCallback(() => {
    if (answeringCall || outgoingCall) {
      setIsCallInterfaceOpen(true);
    }
  }, [answeringCall, outgoingCall]);
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
      await getSupabase()
        .from('active_calls')
        .update({ call_type: 'video' })
        .eq('call_id', callRecord.call_id);
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
      setTimeout(() => setIsSwitchingMode(false), 3000);
    }
  }, [answeringCall, currentUserId, isSwitchingMode, outgoingCall]);
  const isCallActive = isCallInterfaceOpen || !!incomingCall;
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
          isSwitchingMode={isSwitchingMode}
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
          isSwitchingMode={isSwitchingMode}
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
