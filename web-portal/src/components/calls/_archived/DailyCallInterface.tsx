'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Minimize2,
  X,
  Volume2,
  VolumeX,
  SwitchCamera,
  Monitor,
  MonitorOff,
  Wifi,
  WifiOff,
} from 'lucide-react';

type CallState = 'idle' | 'creating-room' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed' | 'no-answer';

// Call timeout in milliseconds (30 seconds)
const CALL_TIMEOUT_MS = 30000;

interface DailyCallInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  callType: 'voice' | 'video';
  remoteUserId?: string;
  remoteUserName?: string;
  onCallStart?: () => void;
  onCallEnd?: () => void;
  // For answering incoming calls
  isIncoming?: boolean;
  incomingCallId?: string;
  meetingUrl?: string;
}

export const DailyCallInterface = ({
  isOpen,
  onClose,
  callType: initialCallType,
  remoteUserId,
  remoteUserName,
  onCallStart,
  onCallEnd,
  isIncoming = false,
  incomingCallId,
  meetingUrl: incomingMeetingUrl,
}: DailyCallInterfaceProps) => {
  const supabase = createClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentCallId, setCurrentCallId] = useState<string | null>(incomingCallId || null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [isVideoEnabled, setIsVideoEnabled] = useState(initialCallType === 'video');
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(incomingMeetingUrl || null);
  const [showRetryButton, setShowRetryButton] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<'good' | 'fair' | 'poor' | null>(null);

  // Daily.co refs
  const callObjectRef = useRef<DailyCall | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const ringbackAudioRef = useRef<HTMLAudioElement | null>(null);
  // Ref to track current call state to avoid stale closure issues
  const callStateRef = useRef<CallState>('idle');
  // Ref to prevent duplicate call attempts (React StrictMode / re-renders)
  const isJoiningRef = useRef<boolean>(false);
  
  // Remote participant
  const [remoteParticipant, setRemoteParticipant] = useState<DailyParticipant | null>(null);
  const [localParticipant, setLocalParticipant] = useState<DailyParticipant | null>(null);

  // Keep callStateRef in sync with callState
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    getUser();
  }, [supabase]);

  // Listen for call status updates (for caller to know when callee joins)
  useEffect(() => {
    if (!currentCallId || isIncoming) return;

    const channel = supabase
      .channel(`call-status-${currentCallId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'active_calls',
          filter: `call_id=eq.${currentCallId}`,
        },
        (payload: { new: { status: string } }) => {
          const newStatus = payload.new.status;
          console.log('[P2P Call] Call status updated:', newStatus);
          if (newStatus === 'connected') {
            // Clear timeout since call is answered
            if (callTimeoutRef.current) {
              clearTimeout(callTimeoutRef.current);
              callTimeoutRef.current = null;
            }
          } else if (newStatus === 'rejected') {
            console.log('[P2P Call] Call was rejected');
            setCallState('ended');
            setError('Call declined');
            // Clean up the call
            if (callObjectRef.current) {
              try {
                callObjectRef.current.leave();
                callObjectRef.current.destroy();
              } catch (e) {
                console.warn('[P2P Call] Error cleaning up after rejection:', e);
              }
              callObjectRef.current = null;
            }
          } else if (newStatus === 'missed') {
            setCallState('no-answer');
            setShowRetryButton(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentCallId, isIncoming, supabase]);

  // Play/stop ringback tone when ringing
  useEffect(() => {
    if (callState === 'ringing' && !isIncoming) {
      if (!ringbackAudioRef.current) {
        ringbackAudioRef.current = new Audio('/sounds/ringback.mp3');
        ringbackAudioRef.current.loop = true;
        ringbackAudioRef.current.volume = 0.5;
      }
      ringbackAudioRef.current.play().catch(console.warn);
    } else {
      if (ringbackAudioRef.current) {
        ringbackAudioRef.current.pause();
        ringbackAudioRef.current.currentTime = 0;
      }
    }

    return () => {
      if (ringbackAudioRef.current) {
        ringbackAudioRef.current.pause();
        ringbackAudioRef.current.currentTime = 0;
      }
    };
  }, [callState, isIncoming]);

  // Format call duration
  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Create a private room for 1-on-1 call
  const createPrivateRoom = useCallback(async (): Promise<string | null> => {
    try {
      console.log('[P2P Call] Requesting room from /api/daily/rooms...');
      const response = await fetch('/api/daily/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Call with ${remoteUserName || 'User'}`,
          preschoolId: 'private-call',
          maxParticipants: 2,
          expiryMinutes: 60,
          enableRecording: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[P2P Call] Room creation failed - Status:', response.status, 'Error:', errorData);
        // Handle specific error codes
        if (errorData.code === 'DAILY_API_KEY_MISSING' || response.status === 503) {
          setError('Video calls are not available. Please contact your administrator to configure video calling.');
        } else if (response.status === 401) {
          setError('Please sign in to make calls.');
        } else if (response.status === 403) {
          setError('You do not have permission to make calls. Only teachers can initiate calls.');
        } else {
          setError(errorData.message || 'Failed to set up call. Please try again.');
        }
        return null;
      }

      const data = await response.json();
      console.log('[P2P Call] Room creation response:', data);
      
      if (!data.room?.url) {
        console.error('[P2P Call] Room created but no URL returned:', data);
        setError('Failed to get room URL. Please try again.');
        return null;
      }
      
      return data.room.url;
    } catch (err) {
      console.error('[P2P Call] Error creating room:', err);
      setError('Network error. Please check your connection and try again.');
      return null;
    }
  }, [remoteUserName]);

  // Get meeting token
  const getMeetingToken = useCallback(async (roomName: string): Promise<string | null> => {
    try {
      const response = await fetch('/api/daily/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle specific error codes
        if (errorData.code === 'DAILY_API_KEY_MISSING' || response.status === 503) {
          setError('Video calls are not available. Please contact your administrator.');
        } else if (response.status === 401) {
          setError('Please sign in to join calls.');
        } else {
          setError(errorData.message || 'Failed to join call. Please try again.');
        }
        throw new Error(errorData.error || 'Failed to get token');
      }

      const data = await response.json();
      return data.token;
    } catch (err) {
      console.error('Error getting token:', err);
      return null;
    }
  }, []);

  // Join Daily.co room
  const joinRoom = useCallback(async (url: string) => {
    console.log('[P2P Call] Joining room:', url);
    try {
      // Check for WebRTC support first
      if (typeof window !== 'undefined' && !navigator.mediaDevices) {
        throw new Error('Your browser does not support video calls.');
      }

      // Check if WebRTC is available (might be blocked by browser settings or extensions)
      try {
        const testConnection = new RTCPeerConnection();
        testConnection.close();
      } catch (rtcError) {
        console.error('[P2P Call] WebRTC not available:', rtcError);
        throw new Error('Video calls are blocked in your browser. Please disable any VPN, ad blockers, or privacy extensions that may block WebRTC.');
      }

      // Clean up existing call object if any
      if (callObjectRef.current) {
        try {
          await callObjectRef.current.leave();
          await callObjectRef.current.destroy();
        } catch (e) {
          console.warn('[P2P Call] Error cleaning up previous call:', e);
        }
        callObjectRef.current = null;
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const roomName = url.split('/').pop() || '';
      console.log('[P2P Call] Getting token for room:', roomName);
      const token = await getMeetingToken(roomName);

      if (!token) {
        throw new Error('Failed to get meeting token');
      }
      console.log('[P2P Call] Token received');

      // Create Daily call object
      const callObject = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: initialCallType === 'video',
        allowMultipleCallInstances: true,
      });

      callObjectRef.current = callObject;

      // Set up event listeners
      callObject
        .on('joined-meeting', () => {
          console.log('[P2P Call] Joined meeting');
          const participants = callObject.participants();
          const local = participants.local;
          setLocalParticipant(local);
          setIsVideoEnabled(local.video);
          setIsAudioEnabled(local.audio);
          
          // Update local video
          if (localVideoRef.current && local.tracks?.video?.track) {
            localVideoRef.current.srcObject = new MediaStream([local.tracks.video.track]);
          }

          // Check if remote participant is already in the room
          Object.values(participants).forEach((p: DailyParticipant) => {
            if (!p.local) {
              console.log('[P2P Call] Found existing remote participant:', p.user_name);
              setRemoteParticipant(p);
              setCallState('connected');
              
              // Stop ringback
              if (ringbackAudioRef.current) {
                ringbackAudioRef.current.pause();
                ringbackAudioRef.current.currentTime = 0;
              }
              
              // Clear timeout
              if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = null;
              }
              
              // Start timer
              if (!callTimerRef.current) {
                callTimerRef.current = setInterval(() => {
                  setCallDuration((prev) => prev + 1);
                }, 1000);
              }
              
              // Update remote video and audio - attach both tracks to video element
              if (remoteVideoRef.current) {
                const tracks: MediaStreamTrack[] = [];
                if (p.tracks?.video?.track) tracks.push(p.tracks.video.track);
                if (p.tracks?.audio?.track) tracks.push(p.tracks.audio.track);
                if (tracks.length > 0) {
                  remoteVideoRef.current.srcObject = new MediaStream(tracks);
                  // Ensure audio plays
                  remoteVideoRef.current.muted = false;
                  remoteVideoRef.current.volume = 1.0;
                }
              }
            }
          });
        })
        .on('participant-joined', (event) => {
          console.log('[P2P Call] Participant joined:', event?.participant?.user_name, 'local:', event?.participant?.local);
          if (event?.participant && !event.participant.local) {
            setRemoteParticipant(event.participant);
            setCallState('connected');
            
            // Stop ringback audio immediately
            if (ringbackAudioRef.current) {
              ringbackAudioRef.current.pause();
              ringbackAudioRef.current.currentTime = 0;
            }
            
            // Clear timeout since call is answered
            if (callTimeoutRef.current) {
              clearTimeout(callTimeoutRef.current);
              callTimeoutRef.current = null;
            }

            // Start call timer
            if (!callTimerRef.current) {
              callTimerRef.current = setInterval(() => {
                setCallDuration((prev) => prev + 1);
              }, 1000);
            }

            // Update remote video and audio - attach both tracks
            if (remoteVideoRef.current) {
              const tracks: MediaStreamTrack[] = [];
              if (event.participant.tracks?.video?.track) tracks.push(event.participant.tracks.video.track);
              if (event.participant.tracks?.audio?.track) tracks.push(event.participant.tracks.audio.track);
              if (tracks.length > 0) {
                remoteVideoRef.current.srcObject = new MediaStream(tracks);
                remoteVideoRef.current.muted = false;
                remoteVideoRef.current.volume = 1.0;
              }
            }

            // Also update call status in database
            if (currentCallId) {
              supabase
                .from('active_calls')
                .update({ status: 'connected', answered_at: new Date().toISOString() })
                .eq('call_id', currentCallId)
                .then(() => console.log('[P2P Call] Updated call status to connected'));
            }
          }
        })
        .on('participant-updated', (event) => {
          if (event?.participant) {
            if (event.participant.local) {
              setLocalParticipant(event.participant);
              setIsVideoEnabled(event.participant.video);
              setIsAudioEnabled(event.participant.audio);
              
              if (localVideoRef.current && event.participant.tracks?.video?.track) {
                localVideoRef.current.srcObject = new MediaStream([event.participant.tracks.video.track]);
              }
            } else {
              setRemoteParticipant(event.participant);
              
              // Update remote video and audio
              if (remoteVideoRef.current) {
                const tracks: MediaStreamTrack[] = [];
                if (event.participant.tracks?.video?.track) tracks.push(event.participant.tracks.video.track);
                if (event.participant.tracks?.audio?.track) tracks.push(event.participant.tracks.audio.track);
                if (tracks.length > 0) {
                  remoteVideoRef.current.srcObject = new MediaStream(tracks);
                  remoteVideoRef.current.muted = false;
                  remoteVideoRef.current.volume = 1.0;
                }
              }
            }
          }
        })
        .on('participant-left', (event) => {
          if (event?.participant && !event.participant.local) {
            setRemoteParticipant(null);
            endCall();
          }
        })
        .on('track-started', (event) => {
          // Handle when audio/video tracks start
          if (event?.participant && !event.participant.local && event.track) {
            console.log('[P2P Call] Track started:', event.track.kind, 'from:', event.participant.user_name);
            if (remoteVideoRef.current) {
              const currentStream = remoteVideoRef.current.srcObject as MediaStream | null;
              const tracks: MediaStreamTrack[] = [];
              
              // Keep existing tracks and add new one
              if (currentStream) {
                currentStream.getTracks().forEach(t => {
                  if (t.kind !== event.track?.kind) tracks.push(t);
                });
              }
              tracks.push(event.track);
              
              remoteVideoRef.current.srcObject = new MediaStream(tracks);
              remoteVideoRef.current.muted = false;
              remoteVideoRef.current.volume = 1.0;
              
              // Ensure audio plays after user interaction
              remoteVideoRef.current.play().catch(e => {
                console.warn('[P2P Call] Autoplay blocked, will retry on user interaction:', e);
              });
            }
          }
        })
        .on('left-meeting', () => {
          setCallState('ended');
          setNetworkQuality(null);
        })
        .on('error', (e) => {
          console.error('Daily error:', e);
          setError(e?.errorMsg || 'Call error occurred');
          setCallState('failed');
          setShowRetryButton(true);
        })
        .on('network-quality-change', (event) => {
          // Network quality: 'good' | 'low' | 'very-low'
          if (event?.threshold) {
            const quality = event.threshold === 'good' ? 'good' : 
                          event.threshold === 'low' ? 'fair' : 'poor';
            setNetworkQuality(quality);
            console.log('[P2P Call] Network quality:', quality);
          }
        })
        .on('network-connection', (event) => {
          // Handle network connection status changes for reconnection
          if (event?.event === 'interrupted') {
            console.log('[P2P Call] Network interrupted, attempting reconnection...');
            setError('Connection interrupted. Reconnecting...');
          } else if (event?.event === 'connected') {
            console.log('[P2P Call] Network reconnected');
            setError(null);
          }
        });

      // Join the room
      console.log('[P2P Call] Caller joining room:', url, 'with token length:', token?.length);
      await callObject.join({
        url,
        token,
        startVideoOff: initialCallType !== 'video',
        startAudioOff: false,
      });
      console.log('[P2P Call] Caller successfully joined room');

      onCallStart?.();
    } catch (err) {
      console.error('Error joining room:', err);
      setError('Failed to join call');
      setCallState('failed');
      setShowRetryButton(true);
    }
  }, [getMeetingToken, initialCallType, onCallStart]);

  // Start outgoing call
  const startCall = useCallback(async () => {
    // Prevent duplicate call attempts (React StrictMode / rapid re-renders)
    if (isJoiningRef.current) {
      console.log('[P2P Call] Already joining, skipping duplicate startCall');
      return;
    }
    isJoiningRef.current = true;
    
    if (!currentUserId || !remoteUserId) {
      setError('Missing user information');
      isJoiningRef.current = false;
      return;
    }

    try {
      setCallState('creating-room');
      setError(null);

      // Create private room
      console.log('[P2P Call] Creating private room...');
      const newRoomUrl = await createPrivateRoom();
      
      // CRITICAL: Validate room URL before proceeding
      if (!newRoomUrl || typeof newRoomUrl !== 'string' || !newRoomUrl.startsWith('https://')) {
        console.error('[P2P Call] Invalid room URL returned:', newRoomUrl);
        setError('Failed to create call room. Please try again.');
        setCallState('failed');
        setShowRetryButton(true);
        isJoiningRef.current = false;
        return;
      }
      
      console.log('[P2P Call] Room created successfully:', newRoomUrl);
      setRoomUrl(newRoomUrl);

      // Generate call ID
      const callId = crypto.randomUUID();
      setCurrentCallId(callId);

      // Get caller's name
      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', currentUserId)
        .maybeSingle();
      
      const callerName = callerProfile 
        ? `${callerProfile.first_name || ''} ${callerProfile.last_name || ''}`.trim() || 'Someone'
        : 'Someone';

      // Create call record with room URL
      await supabase.from('active_calls').insert({
        call_id: callId,
        caller_id: currentUserId,
        callee_id: remoteUserId,
        call_type: initialCallType,
        status: 'ringing',
        caller_name: callerName,
        meeting_url: newRoomUrl,
      });

      // Send offer signal with meeting URL for resilience
      try {
        await supabase.from('call_signals').insert({
          call_id: callId,
          from_user_id: currentUserId,
          to_user_id: remoteUserId,
          signal_type: 'offer',
          payload: {
            meeting_url: newRoomUrl,
            call_type: initialCallType,
            caller_name: callerName,
          },
        });
      } catch (signalErr) {
        console.warn('Failed to send offer signal:', signalErr);
      }

      // Send push notification
      try {
        await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: remoteUserId,
            title: `Incoming ${initialCallType} call`,
            body: `${callerName} is calling...`,
            tag: `call-${callId}`,
            type: 'call',
            requireInteraction: true,
            data: {
              url: '/dashboard/parent/messages',
              callId,
              callType: initialCallType,
              callerId: currentUserId,
              callerName,
              roomUrl: newRoomUrl,
            },
          }),
        });
      } catch (notifErr) {
        console.warn('Failed to send call push notification:', notifErr);
      }

      setCallState('connecting');
      
      // Join the room
      await joinRoom(newRoomUrl);
      
      setCallState('ringing');

      // Set call timeout - use callStateRef to avoid stale closure
      callTimeoutRef.current = setTimeout(async () => {
        if (callStateRef.current === 'ringing') {
          await supabase
            .from('active_calls')
            .update({ status: 'missed', ended_at: new Date().toISOString() })
            .eq('call_id', callId);

          setCallState('no-answer');
          setError('No answer');
          setShowRetryButton(true);
          isJoiningRef.current = false;
        }
      }, CALL_TIMEOUT_MS);

    } catch (err) {
      console.error('Error starting call:', err);
      setCallState('failed');
      setShowRetryButton(true);
      isJoiningRef.current = false;
    }
  }, [currentUserId, remoteUserId, initialCallType, supabase, createPrivateRoom, joinRoom]);

  // State for fetching meeting URL
  const [isFetchingMeetingUrl, setIsFetchingMeetingUrl] = useState(false);

  // Helper function to fetch meeting URL when missing
  const fetchMeetingUrl = useCallback(async (callId: string): Promise<string | undefined> => {
    const maxAttempts = 5;
    const baseDelay = 500;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Try fetching from active_calls first
      // Use maybeSingle() to avoid 406 error when call doesn't exist
      const { data: callData } = await supabase
        .from('active_calls')
        .select('meeting_url')
        .eq('call_id', callId)
        .maybeSingle();
      
      if (callData?.meeting_url) {
        console.log('[P2P Call] fetchMeetingUrl: Got URL from active_calls (attempt', attempt + 1, ')');
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
      
      const signalPayload = signalData?.payload as { meeting_url?: string } | null;
      if (signalPayload?.meeting_url) {
        console.log('[P2P Call] fetchMeetingUrl: Got URL from call_signals (attempt', attempt + 1, ')');
        return signalPayload.meeting_url;
      }
      
      // Exponential backoff
      if (attempt < maxAttempts - 1) {
        const delay = baseDelay * Math.pow(1.5, attempt);
        console.log(`[P2P Call] fetchMeetingUrl: Waiting ${Math.round(delay)}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.error('[P2P Call] fetchMeetingUrl: Failed after', maxAttempts, 'attempts');
    return undefined;
  }, [supabase]);

  // Answer incoming call
  const answerCall = useCallback(async () => {
    // Prevent duplicate join attempts (React StrictMode / rapid re-renders)
    if (isJoiningRef.current) {
      console.log('[P2P Call] Already joining, skipping duplicate answerCall');
      return;
    }
    isJoiningRef.current = true;
    
    console.log('[P2P Call] Answering call, meetingUrl:', incomingMeetingUrl, 'callId:', incomingCallId);
    
    let meetingUrlToUse = incomingMeetingUrl;
    
    // If meeting URL is missing, try to fetch it
    if (!meetingUrlToUse && incomingCallId) {
      console.log('[P2P Call] Meeting URL missing, attempting to fetch...');
      setIsFetchingMeetingUrl(true);
      setCallState('connecting');
      setError('Connecting...');
      
      meetingUrlToUse = await fetchMeetingUrl(incomingCallId);
      
      setIsFetchingMeetingUrl(false);
      
      if (meetingUrlToUse) {
        console.log('[P2P Call] Successfully fetched meeting URL:', meetingUrlToUse);
        setRoomUrl(meetingUrlToUse);
        setError(null);
      }
    }
    
    if (!meetingUrlToUse) {
      setError('Unable to connect to call. Please try again.');
      setCallState('failed');
      setShowRetryButton(true);
      isJoiningRef.current = false;
      console.error('[P2P Call] No meeting URL for incoming call after fetch attempts');
      return;
    }

    // Store the call ID for status updates
    if (incomingCallId) {
      setCurrentCallId(incomingCallId);
    }

    try {
      setCallState('connecting');
      
      // Update call status first to notify caller
      if (incomingCallId) {
        await supabase
          .from('active_calls')
          .update({ status: 'connected', answered_at: new Date().toISOString() })
          .eq('call_id', incomingCallId);
        console.log('[P2P Call] Updated call status to connected');
      }
      
      await joinRoom(meetingUrlToUse);
      // Note: Don't set connected here - let the participant detection handle it
      console.log('[P2P Call] Join room completed, waiting for participants');
    } catch (err) {
      console.error('[P2P Call] Error answering call:', err);
      setCallState('failed');
      setError('Failed to answer call. Tap to retry.');
      setShowRetryButton(true);
      isJoiningRef.current = false;
    }
  }, [incomingMeetingUrl, incomingCallId, supabase, joinRoom, fetchMeetingUrl]);

  // End call
  const endCall = useCallback(async () => {
    // Reset joining flag to allow new calls
    isJoiningRef.current = false;
    
    // Clear timeouts
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    // Stop ringback
    if (ringbackAudioRef.current) {
      ringbackAudioRef.current.pause();
      ringbackAudioRef.current.currentTime = 0;
    }

    // Leave Daily.co room
    if (callObjectRef.current) {
      await callObjectRef.current.leave();
      await callObjectRef.current.destroy();
      callObjectRef.current = null;
    }

    // Clear timer
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    // Update database
    if (currentCallId) {
      await supabase
        .from('active_calls')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('call_id', currentCallId);
    }

    setCurrentCallId(null);
    setRoomUrl(null);
    setRemoteParticipant(null);
    setLocalParticipant(null);
    setCallState('ended');
    setCallDuration(0);
    setShowRetryButton(false);
    onCallEnd?.();
    
    setTimeout(() => {
      onClose();
    }, 1000);
  }, [currentCallId, supabase, onCallEnd, onClose]);

  // Retry call
  const retryCall = useCallback(async () => {
    // Reset joining flag for retry
    isJoiningRef.current = false;
    
    setCallState('idle');
    setError(null);
    setShowRetryButton(false);
    setCallDuration(0);
    
    setTimeout(() => {
      startCall();
    }, 100);
  }, [startCall]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (callObjectRef.current) {
      callObjectRef.current.setLocalVideo(!isVideoEnabled);
    }
  }, [isVideoEnabled]);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (callObjectRef.current) {
      callObjectRef.current.setLocalAudio(!isAudioEnabled);
    }
  }, [isAudioEnabled]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (!callObjectRef.current) return;
    
    try {
      if (isScreenSharing) {
        await callObjectRef.current.stopScreenShare();
      } else {
        await callObjectRef.current.startScreenShare();
      }
      setIsScreenSharing(!isScreenSharing);
    } catch (err) {
      console.error('Error toggling screen share:', err);
    }
  }, [isScreenSharing]);

  // Start call when opened (for outgoing calls)
  useEffect(() => {
    if (isOpen && callState === 'idle') {
      if (isIncoming && incomingMeetingUrl) {
        answerCall();
      } else if (!isIncoming) {
        startCall();
      }
    }
  }, [isOpen, callState, isIncoming, incomingMeetingUrl, startCall, answerCall]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callObjectRef.current) {
        callObjectRef.current.leave();
        callObjectRef.current.destroy();
      }
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
      }
      if (ringbackAudioRef.current) {
        ringbackAudioRef.current.pause();
        ringbackAudioRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  // Minimized view
  if (isMinimized) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 100,
          right: 20,
          width: 160,
          height: 120,
          borderRadius: 12,
          overflow: 'hidden',
          background: '#1a1a2e',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          cursor: 'pointer',
        }}
        onClick={() => setIsMinimized(false)}
      >
        {isVideoEnabled && localParticipant?.video ? (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
            }}
          >
            <Phone size={32} color="white" />
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            fontSize: 12,
            fontWeight: 600,
            color: 'white',
            background: 'rgba(0, 0, 0, 0.6)',
            padding: '2px 8px',
            borderRadius: 4,
          }}
        >
          {formatDuration(callDuration)}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            endCall();
          }}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 24,
            height: 24,
            borderRadius: 12,
            background: 'var(--danger)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={14} color="white" />
        </button>
      </div>
    );
  }

  // Full call interface
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#0f0f1a',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header - Mobile responsive */}
      <div
        style={{
          padding: 'clamp(12px, 3vw, 16px) clamp(12px, 3vw, 20px)',
          paddingTop: 'max(env(safe-area-inset-top), clamp(12px, 3vw, 16px))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 'clamp(16px, 4vw, 18px)', fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {remoteUserName || 'Unknown'}
            </h3>
            {initialCallType === 'video' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: isVideoEnabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                  fontSize: 'clamp(10px, 2.5vw, 11px)',
                  color: isVideoEnabled ? '#22c55e' : 'rgba(255, 255, 255, 0.6)',
                  flexShrink: 0,
                }}
              >
                <Video size={12} />
                <span className="hidden xs:inline">{isVideoEnabled ? 'Camera on' : 'Camera off'}</span>
              </span>
            )}
            {/* Network Quality Indicator */}
            {callState === 'connected' && networkQuality && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: networkQuality === 'good' ? 'rgba(34, 197, 94, 0.2)' : 
                             networkQuality === 'fair' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  fontSize: 11,
                  color: networkQuality === 'good' ? '#22c55e' : 
                         networkQuality === 'fair' ? '#fbbf24' : '#ef4444',
                }}
                title={`Network: ${networkQuality}`}
              >
                <Wifi size={12} />
                {networkQuality}
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'rgba(255, 255, 255, 0.7)' }}>
            {callState === 'creating-room' && 'Setting up call...'}
            {callState === 'connecting' && 'Connecting...'}
            {callState === 'ringing' && 'Ringing...'}
            {callState === 'connected' && formatDuration(callDuration)}
            {callState === 'ended' && 'Call ended'}
            {callState === 'no-answer' && 'No answer'}
            {callState === 'failed' && (error || 'Call failed')}
          </p>
        </div>
        <button
          onClick={() => setIsMinimized(true)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'white',
          }}
        >
          <Minimize2 size={20} />
        </button>
      </div>

      {/* Video Area */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* No Answer / Failed Overlay */}
        {(callState === 'no-answer' || callState === 'failed') && showRetryButton && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              gap: 24,
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                background: callState === 'no-answer' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PhoneOff size={40} color={callState === 'no-answer' ? '#fbbf24' : '#ef4444'} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'white' }}>
                {callState === 'no-answer' ? 'No Answer' : 'Call Failed'}
              </h3>
              <p style={{ margin: '8px 0 0', color: 'rgba(255, 255, 255, 0.6)', fontSize: 14 }}>
                {callState === 'no-answer' 
                  ? `${remoteUserName || 'User'} didn't answer`
                  : error || 'Unable to connect the call'
                }
              </p>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <button
                onClick={retryCall}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 28px',
                  borderRadius: 28,
                  background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
                  border: 'none',
                  color: 'white',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(124, 58, 237, 0.4)',
                }}
              >
                <Phone size={20} />
                Call Again
              </button>
              <button
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 28px',
                  borderRadius: 28,
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: 'white',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
                Close
              </button>
            </div>
          </div>
        )}

        {/* Remote video */}
        {remoteParticipant?.video ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              background: '#1a1a2e',
            }}
          />
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Pulsing ring animation */}
            {(callState === 'connecting' || callState === 'ringing' || callState === 'creating-room') && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 200,
                    height: 200,
                    borderRadius: '50%',
                    border: '2px solid rgba(124, 58, 237, 0.4)',
                    animation: 'pulse-ring 1.5s ease-out infinite',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 240,
                    height: 240,
                    borderRadius: '50%',
                    border: '2px solid rgba(124, 58, 237, 0.2)',
                    animation: 'pulse-ring 1.5s ease-out infinite 0.3s',
                  }}
                />
                <style>{`
                  @keyframes pulse-ring {
                    0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(1.4); opacity: 0; }
                  }
                `}</style>
              </>
            )}
            <div
              style={{
                width: 160,
                height: 160,
                borderRadius: 80,
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 64,
                fontWeight: 600,
                color: 'white',
                position: 'relative',
                zIndex: 1,
              }}
            >
              {(remoteUserName || 'U').charAt(0).toUpperCase()}
            </div>
          </div>
        )}

        {/* Local video PiP */}
        {isVideoEnabled && localParticipant?.video && (
          <div
            style={{
              position: 'absolute',
              bottom: 20,
              right: 20,
              width: 120,
              height: 160,
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            }}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
              }}
            />
          </div>
        )}
      </div>

      {/* Controls - Mobile responsive with safe area */}
      <div
        style={{
          padding: 'clamp(16px, 4vw, 24px) clamp(12px, 3vw, 20px) clamp(24px, 6vw, 40px)',
          paddingBottom: 'max(env(safe-area-inset-bottom), clamp(24px, 6vw, 40px))',
          display: 'flex',
          justifyContent: 'center',
          gap: 'clamp(10px, 3vw, 16px)',
          flexWrap: 'wrap',
        }}
      >
        {/* Mute */}
        <button
          onClick={toggleAudio}
          style={{
            width: 'clamp(48px, 12vw, 56px)',
            height: 'clamp(48px, 12vw, 56px)',
            borderRadius: 28,
            background: isAudioEnabled ? 'rgba(255, 255, 255, 0.1)' : 'rgba(239, 68, 68, 0.3)',
            border: !isAudioEnabled ? '2px solid rgba(239, 68, 68, 0.5)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {isAudioEnabled ? <Mic size={22} color="white" /> : <MicOff size={22} color="#ef4444" />}
        </button>

        {/* Video */}
        <button
          onClick={toggleVideo}
          style={{
            width: 'clamp(48px, 12vw, 56px)',
            height: 'clamp(48px, 12vw, 56px)',
            borderRadius: 28,
            background: isVideoEnabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            border: isVideoEnabled ? '2px solid rgba(34, 197, 94, 0.5)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {isVideoEnabled ? <Video size={22} color="#22c55e" /> : <VideoOff size={22} color="white" />}
        </button>

        {/* Screen share - hide on very small screens */}
        <button
          onClick={toggleScreenShare}
          className="hidden xs:flex"
          style={{
            width: 'clamp(48px, 12vw, 56px)',
            height: 'clamp(48px, 12vw, 56px)',
            borderRadius: 28,
            background: isScreenSharing ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            border: isScreenSharing ? '2px solid rgba(34, 197, 94, 0.5)' : 'none',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {isScreenSharing ? <MonitorOff size={22} color="#22c55e" /> : <Monitor size={22} color="white" />}
        </button>

        {/* End call */}
        <button
          onClick={endCall}
          style={{
            width: 'clamp(56px, 15vw, 72px)',
            height: 'clamp(48px, 12vw, 56px)',
            borderRadius: 28,
            background: '#ef4444',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
            transition: 'all 0.2s',
          }}
        >
          <PhoneOff size={24} color="white" />
        </button>
      </div>
    </div>
  );
};
