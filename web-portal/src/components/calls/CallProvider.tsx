'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, Component, type ErrorInfo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { VoiceCallInterface } from './VoiceCallInterface';
import { VideoCallInterface } from './VideoCallInterface';
import { IncomingCallOverlay } from './IncomingCallOverlay';
import { usePresence } from '@/lib/hooks/usePresence';

// Simple error boundary for call components
interface CallErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

interface CallErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class CallErrorBoundary extends Component<CallErrorBoundaryProps, CallErrorBoundaryState> {
  constructor(props: CallErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): CallErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[CallErrorBoundary] Error caught:', error, errorInfo);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          padding: 20,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📞</div>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Call Error</div>
          <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 20, textAlign: 'center' }}>
            Something went wrong with the call.
          </div>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '12px 24px',
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface ActiveCall {
  id: string;
  call_id: string;
  caller_id: string;
  callee_id: string;
  thread_id?: string | null;
  call_type: 'voice' | 'video';
  status: 'ringing' | 'connected' | 'ended' | 'rejected' | 'missed' | 'busy';
  caller_name?: string;
  meeting_url?: string;
  started_at: string;
}

interface CallSignalPayload {
  meeting_url?: string;
  call_type?: 'voice' | 'video';
  caller_name?: string;
  thread_id?: string;
}

interface CallSignal {
  id: string;
  call_id: string;
  from_user_id: string;
  to_user_id: string;
  signal_type: string;
  payload: CallSignalPayload | null;
  created_at: string;
}

interface CallContextType {
  startVoiceCall: (userId: string, userName?: string, options?: CallStartOptions) => void;
  startVideoCall: (userId: string, userName?: string, options?: CallStartOptions) => void;
  incomingCall: ActiveCall | null;
  isCallActive: boolean;
  isInActiveCall: boolean;
  returnToCall: () => void;
  isUserOnline: (userId: string) => boolean;
  getLastSeenText: (userId: string) => string;
}

interface CallStartOptions {
  threadId?: string;
}

const CallContext = createContext<CallContextType | null>(null);

export function useCall() {
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
  const supabase = createClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<ActiveCall | null>(null);
  const [isCallInterfaceOpen, setIsCallInterfaceOpen] = useState(false);
  const [outgoingCall, setOutgoingCall] = useState<{
    userId: string;
    userName?: string;
    callType: 'voice' | 'video';
    threadId?: string;
    roomName: string;
    callId?: string;
    meetingUrl?: string;
  } | null>(null);
  const [answeringCall, setAnsweringCall] = useState<ActiveCall | null>(null);
  
  // Track presence for online/offline detection
  const { isUserOnline, getLastSeenText } = usePresence(currentUserId ?? undefined);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: { user?: { id: string } } | null) => {
      setCurrentUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Listen for service worker messages (push notification clicks)
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleServiceWorkerMessage = async (event: MessageEvent) => {
      console.log('[CallProvider] Service worker message received:', event.data);
      
      if (event.data?.type === 'ANSWER_CALL') {
        const { callId, callType, callerName, roomUrl } = event.data;
        console.log('[CallProvider] Answering call from push notification:', callId);
        
        // Fetch the full call record from DB
        const { data: call } = await supabase
          .from('active_calls')
          .select('*')
          .eq('call_id', callId)
          .maybeSingle();
        
        if (call && call.status === 'ringing') {
          // Auto-answer the call
          setAnsweringCall({
            ...call,
            meeting_url: roomUrl || call.meeting_url,
            call_type: callType || call.call_type,
            caller_name: callerName || call.caller_name,
          });
          setIsCallInterfaceOpen(true);
          setIncomingCall(null);
        }
      } else if (event.data?.type === 'REJECT_CALL') {
        const { callId } = event.data;
        console.log('[CallProvider] Rejecting call from push notification:', callId);
        
        // Update call status to rejected
        await supabase
          .from('active_calls')
          .update({ status: 'rejected' })
          .eq('call_id', callId);
        
        setIncomingCall(null);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [supabase]);

  // Listen for incoming calls
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
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
          console.log('[CallProvider] Raw realtime payload:', JSON.stringify(payload.new, null, 2));
          const call = payload.new as ActiveCall;
          console.log('[CallProvider] Incoming call received:', {
            callId: call.call_id,
            callType: call.call_type,
            status: call.status,
            meetingUrl: call.meeting_url,
            callerId: call.caller_id,
          });
          
          if (call.status === 'ringing') {
            // Always fetch the full call record from DB to ensure we have all fields
            // Realtime payloads sometimes don't include all columns
            let meetingUrl = call.meeting_url;
            
            if (!meetingUrl) {
              console.log('[CallProvider] meeting_url not in payload, fetching from DB...');
              
              // Small delay to ensure the record is fully committed
              await new Promise(resolve => setTimeout(resolve, 300));
              
              // Fetch with exponential backoff retry (5 attempts with increasing delays)
              let lastError: { message?: string } | null = null;
              const maxAttempts = 5;
              const baseDelay = 500; // Start with 500ms delay
              
              for (let attempt = 0; attempt < maxAttempts; attempt++) {
                // Try fetching from active_calls first
                // Use maybeSingle() to avoid 406 error when call doesn't exist yet
                const { data: fullCall, error } = await supabase
                  .from('active_calls')
                  .select('*')
                  .eq('call_id', call.call_id)
                  .maybeSingle();
                
                if (fullCall?.meeting_url) {
                  meetingUrl = fullCall.meeting_url;
                  console.log('[CallProvider] Got meeting_url from active_calls (attempt', attempt + 1, '):', meetingUrl);
                  break;
                }
                
                if (error) {
                  lastError = error;
                  console.warn('[CallProvider] DB fetch attempt', attempt + 1, 'failed:', error.message);
                }
                
                // Fallback: Try fetching from call_signals table as backup
                if (!meetingUrl) {
                  const { data: signalData } = await supabase
                    .from('call_signals')
                    .select('payload')
                    .eq('call_id', call.call_id)
                    .eq('signal_type', 'offer')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  
                  const signalPayload = signalData?.payload as CallSignalPayload | null;
                  if (signalPayload?.meeting_url) {
                    meetingUrl = signalPayload.meeting_url;
                    console.log('[CallProvider] Got meeting_url from call_signals fallback:', meetingUrl);
                    break;
                  }
                }
                
                // Exponential backoff: wait longer between each retry
                if (attempt < maxAttempts - 1) {
                  const delay = baseDelay * Math.pow(1.5, attempt); // 500ms, 750ms, 1125ms, 1687ms
                  console.log(`[CallProvider] Waiting ${Math.round(delay)}ms before retry...`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
              }
              
              if (!meetingUrl) {
                console.error('[CallProvider] Failed to get meeting_url after', maxAttempts, 'attempts', lastError?.message);
              }
            }
            
            // Fetch caller name from profiles
            const { data: profile } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', call.caller_id)
              .maybeSingle();
            
            const callerName = profile 
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'
              : 'Unknown';

            setIncomingCall({ ...call, meeting_url: meetingUrl, caller_name: callerName });
            console.log('[CallProvider] Incoming call set with meeting_url:', meetingUrl);
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
        (payload: { new: ActiveCall }) => {
          const call = payload.new as ActiveCall;
          if (call.status === 'ended' || call.status === 'rejected' || call.status === 'missed') {
            if (incomingCall?.call_id === call.call_id) {
              setIncomingCall(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, supabase, incomingCall]);

  // Listen for call signal payloads (e.g., meeting_url)
  useEffect(() => {
    if (!currentUserId) return;

    const signalChannel = supabase
      .channel(`call-signals-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `to_user_id=eq.${currentUserId}`,
        },
        (payload: { new: CallSignal }) => {
          const signal = payload.new;
          const signalPayload = signal.payload || null;

          if (signal.signal_type === 'upgrade_to_video' || signal.signal_type === 'upgrade_ack') {
            const meetingUrl = signalPayload?.meeting_url;
            const threadId = signalPayload?.thread_id;

            setIncomingCall((prev) => {
              if (!prev || prev.call_id !== signal.call_id) return prev;
              return {
                ...prev,
                call_type: 'video',
                meeting_url: meetingUrl || prev.meeting_url,
                thread_id: threadId || prev.thread_id,
              };
            });

            setAnsweringCall((prev) => {
              if (!prev || prev.call_id !== signal.call_id) return prev;
              return {
                ...prev,
                call_type: 'video',
                meeting_url: meetingUrl || prev.meeting_url,
                thread_id: threadId || prev.thread_id,
              };
            });

            setOutgoingCall((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                callType: 'video',
                callId: prev.callId || signal.call_id,
                meetingUrl: meetingUrl || prev.meetingUrl,
                threadId: threadId || prev.threadId,
              };
            });

            if (signal.signal_type === 'upgrade_to_video' && currentUserId) {
              supabase.from('call_signals').insert({
                call_id: signal.call_id,
                from_user_id: currentUserId,
                to_user_id: signal.from_user_id,
                signal_type: 'upgrade_ack',
                payload: {
                  call_type: 'video',
                  meeting_url: meetingUrl,
                  thread_id: threadId,
                },
              }).catch((ackErr: unknown) => {
                console.warn('[CallProvider] Failed to send upgrade ack:', ackErr);
              });
            }
            return;
          }

          if (signal.signal_type !== 'offer') return;

          const meetingUrl = signalPayload?.meeting_url;
          if (!meetingUrl) return;

          setIncomingCall((prev) => {
            if (prev && prev.call_id === signal.call_id) {
              if (prev.meeting_url === meetingUrl) return prev;
              console.log('[CallProvider] Hydrated meeting_url from offer signal');
              return { ...prev, meeting_url: meetingUrl };
            }

            // If active_calls payload hasn't arrived yet, create a placeholder entry
            console.log('[CallProvider] Creating placeholder incoming call from offer signal');
            return {
              id: signal.id,
              call_id: signal.call_id,
              caller_id: signal.from_user_id,
              callee_id: signal.to_user_id,
              call_type: (signalPayload?.call_type as 'voice' | 'video') || 'voice',
              status: 'ringing',
              caller_name: signalPayload?.caller_name || 'Unknown',
              meeting_url: meetingUrl,
              thread_id: signalPayload?.thread_id,
              started_at: signal.created_at,
            } as ActiveCall;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(signalChannel);
    };
  }, [currentUserId, supabase]);

  // Start voice call (Daily.co audio-only)
  const startVoiceCall = useCallback((userId: string, userName?: string, options?: CallStartOptions) => {
    if (!currentUserId) {
      console.error('[CallProvider] Cannot start call - no current user');
      alert('Unable to start call. Please sign in and try again.');
      return;
    }
    
    // Check if user is online before starting call
    if (!isUserOnline(userId)) {
      const lastSeenText = getLastSeenText(userId);
      const confirmed = confirm(
        `${userName || 'This user'} appears to be offline (${lastSeenText}). ` +
        'They may not receive your call. Do you want to continue?'
      );
      if (!confirmed) {
        console.log('[CallProvider] User cancelled call to offline user');
        return;
      }
    }
    
    // VoiceCallInterface will create the Daily.co room and active_calls record
    setOutgoingCall({
      userId,
      userName,
      callType: 'voice',
      threadId: options?.threadId,
      roomName: `voice-${Date.now()}`,
    });
    setIsCallInterfaceOpen(true);
  }, [currentUserId, isUserOnline, getLastSeenText]);

  // Start video call (Daily.co-based)
  const startVideoCall = useCallback((userId: string, userName?: string, options?: CallStartOptions) => {
    if (!currentUserId) {
      console.error('[CallProvider] Cannot start call - no current user');
      alert('Unable to start call. Please sign in and try again.');
      return;
    }
    
    // Check if user is online before starting call
    if (!isUserOnline(userId)) {
      const lastSeenText = getLastSeenText(userId);
      const confirmed = confirm(
        `${userName || 'This user'} appears to be offline (${lastSeenText}). ` +
        'They may not receive your call. Do you want to continue?'
      );
      if (!confirmed) {
        console.log('[CallProvider] User cancelled call to offline user');
        return;
      }
    }
    
    setOutgoingCall({
      userId,
      userName,
      callType: 'video',
      threadId: options?.threadId,
      roomName: `call-${Date.now()}`,
    });
    setIsCallInterfaceOpen(true);
  }, [currentUserId, isUserOnline, getLastSeenText]);

  // Helper function to fetch meeting URL when it's missing
  const fetchMeetingUrl = useCallback(async (callId: string): Promise<string | undefined> => {
    const maxAttempts = 5;
    const baseDelay = 500;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Try fetching from active_calls first
      const { data: callData } = await supabase
        .from('active_calls')
        .select('meeting_url')
        .eq('call_id', callId)
        .maybeSingle();
      
      if (callData?.meeting_url) {
        console.log('[CallProvider] fetchMeetingUrl: Got URL from active_calls (attempt', attempt + 1, ')');
        return callData.meeting_url;
      }
      
      // Fallback: Try fetching from call_signals table
      const { data: signalData } = await supabase
        .from('call_signals')
        .select('payload')
        .eq('call_id', callId)
        .eq('signal_type', 'offer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const signalPayload = signalData?.payload as CallSignalPayload | null;
      if (signalPayload?.meeting_url) {
        console.log('[CallProvider] fetchMeetingUrl: Got URL from call_signals (attempt', attempt + 1, ')');
        return signalPayload.meeting_url;
      }
      
      // Exponential backoff
      if (attempt < maxAttempts - 1) {
        const delay = baseDelay * Math.pow(1.5, attempt);
        console.log(`[CallProvider] fetchMeetingUrl: Waiting ${Math.round(delay)}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.error('[CallProvider] fetchMeetingUrl: Failed after', maxAttempts, 'attempts');
    return undefined;
  }, [supabase]);

  // State to track if we're connecting to a call
  const [isConnecting, setIsConnecting] = useState(false);

  // Answer incoming call
  const answerIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    
    let callToAnswer = { ...incomingCall };
    
    // If meeting_url is missing, try to fetch it
    if (!callToAnswer.meeting_url) {
      console.log('[CallProvider] Meeting URL missing, fetching before answering...');
      setIsConnecting(true);
      
      const url = await fetchMeetingUrl(callToAnswer.call_id);
      
      if (url) {
        callToAnswer = { ...callToAnswer, meeting_url: url };
        console.log('[CallProvider] Successfully fetched meeting URL before answering');
      } else {
        console.error('[CallProvider] Could not fetch meeting URL, proceeding anyway');
      }
      
      setIsConnecting(false);
    }
    
    setAnsweringCall(callToAnswer);
    setIncomingCall(null);
    setIsCallInterfaceOpen(true);
  }, [incomingCall, fetchMeetingUrl]);

  // Reject incoming call
  const rejectIncomingCall = useCallback(async () => {
    if (!incomingCall || !currentUserId) return;

    await supabase
      .from('active_calls')
      .update({ status: 'rejected', ended_at: new Date().toISOString() })
      .eq('call_id', incomingCall.call_id);

    // Send rejection signal
    await supabase.from('call_signals').insert({
      call_id: incomingCall.call_id,
      from_user_id: currentUserId,
      to_user_id: incomingCall.caller_id,
      signal_type: 'call-rejected',
      payload: { reason: 'rejected' },
    });

    setIncomingCall(null);
  }, [incomingCall, currentUserId, supabase]);

  // Close call interface
  const handleCallClose = useCallback(() => {
    setIsCallInterfaceOpen(false);
    setOutgoingCall(null);
    setAnsweringCall(null);
  }, []);

  // Return to active call
  const returnToCall = useCallback(() => {
    if (outgoingCall || answeringCall) {
      setIsCallInterfaceOpen(true);
    }
  }, [outgoingCall, answeringCall]);

  const isCallActive = isCallInterfaceOpen || !!incomingCall;
  const isInActiveCall = !!(outgoingCall || answeringCall);

  return (
    <CallContext.Provider value={{ 
      startVoiceCall, 
      startVideoCall, 
      incomingCall, 
      isCallActive, 
      isInActiveCall, 
      returnToCall,
      isUserOnline,
      getLastSeenText
    }}>
      {children}

      {/* Floating "Return to Call" button when in active call but interface is closed */}
      {isInActiveCall && !isCallInterfaceOpen && (
        <div
          onClick={returnToCall}
          style={{
            position: 'fixed',
            bottom: 100,
            left: 20,
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
            borderRadius: 50,
            boxShadow: '0 8px 32px rgba(59, 130, 246, 0.4)',
            cursor: 'pointer',
            animation: 'pulse-call 2s ease-in-out infinite',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M15 10l-4 4l6 6l4-16l-18 7l7 2l2 7l3-6" />
            </svg>
          </div>
          <div style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>
            Return to Call
          </div>
        </div>
      )}

      {/* Incoming call overlay - full screen for mobile-first UX */}
      <IncomingCallOverlay
        isVisible={!!incomingCall && !answeringCall}
        callerName={incomingCall?.caller_name}
        callType={incomingCall?.call_type || 'voice'}
        onAnswer={answerIncomingCall}
        onReject={rejectIncomingCall}
        isConnecting={isConnecting}
      />

      {/* Call interfaces wrapped in error boundary */}
      <CallErrorBoundary onError={(err) => {
        console.error('[CallProvider] Call interface error:', err);
        handleCallClose();
      }}>
        {/* Voice call interface for outgoing calls (Daily.co audio-only) */}
        {outgoingCall && outgoingCall.callType === 'voice' && (
          <VoiceCallInterface
            isOpen={isCallInterfaceOpen && !answeringCall}
            onClose={handleCallClose}
            roomName={outgoingCall.roomName}
            userName={outgoingCall.userName}
            isOwner={true}
            calleeId={outgoingCall.userId}
            threadId={outgoingCall.threadId}
            callId={outgoingCall.callId}
            meetingUrl={outgoingCall.meetingUrl}
          />
        )}

        {/* Video call interface for outgoing calls */}
        {outgoingCall && outgoingCall.callType === 'video' && (
          <VideoCallInterface
            isOpen={isCallInterfaceOpen && !answeringCall}
            onClose={handleCallClose}
            roomName={outgoingCall.roomName}
            userName={outgoingCall.userName}
            isOwner={true}
            calleeId={outgoingCall.userId}
            threadId={outgoingCall.threadId}
            callId={outgoingCall.callId}
            meetingUrl={outgoingCall.meetingUrl}
          />
        )}

        {/* Voice call interface for answering calls (Daily.co audio-only) */}
        {answeringCall && answeringCall.call_type === 'voice' && answeringCall.meeting_url && (
          <VoiceCallInterface
            isOpen={isCallInterfaceOpen}
            onClose={handleCallClose}
            roomName={answeringCall.meeting_url.split('/').pop() || `voice-${answeringCall.call_id}`}
            userName={answeringCall.caller_name}
            isOwner={false}
            callId={answeringCall.call_id}
            threadId={answeringCall.thread_id || undefined}
            meetingUrl={answeringCall.meeting_url}
          />
        )}

        {/* Video call interface for answering calls */}
        {answeringCall && answeringCall.meeting_url && answeringCall.call_type === 'video' && (
          <VideoCallInterface
            isOpen={isCallInterfaceOpen}
            onClose={handleCallClose}
            roomName={answeringCall.meeting_url.split('/').pop() || `call-${answeringCall.call_id}`}
            userName={answeringCall.caller_name}
            isOwner={false}
            callId={answeringCall.call_id}
            threadId={answeringCall.thread_id || undefined}
            meetingUrl={answeringCall.meeting_url}
          />
        )}
      </CallErrorBoundary>

      {/* Animation styles */}
      <style jsx global>{`
        @keyframes pulse-call {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 8px 32px rgba(34, 197, 94, 0.4);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 12px 40px rgba(34, 197, 94, 0.6);
          }
        }
      `}</style>
    </CallContext.Provider>
  );
}
