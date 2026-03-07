'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import {
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Volume2,
  VolumeX,
  Minimize2,
  Maximize2,
  X,
  Loader2,
  AlertCircle,
  Users,
  MessageSquare,
} from 'lucide-react';

type CallState = 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed';

interface VideoCallInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  roomName?: string;
  meetingUrl?: string;
  userName?: string;
  isOwner?: boolean;
  calleeId?: string;
  threadId?: string;
  callId?: string; // Call ID for tracking (callee gets this from answering call)
  onCallStateChange?: (state: CallState) => void;
}

export const VideoCallInterface = ({
  isOpen,
  onClose,
  roomName,
  meetingUrl,
  userName,
  isOwner = false,
  calleeId,
  threadId,
  callId,
  onCallStateChange,
}: VideoCallInterfaceProps) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [callDuration, setCallDuration] = useState(0);

  const callFrameRef = useRef<HTMLDivElement>(null);
  const dailyCallRef = useRef<DailyCall | null>(null);
  const ringbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const callIdRef = useRef<string | null>(callId || null); // Initialize with prop if provided
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = createClient();

  // Update callIdRef when prop changes (for callee answering)
  useEffect(() => {
    if (callId && !callIdRef.current) {
      callIdRef.current = callId;
      console.log('[VideoCall] Call ID set from prop:', callId);
    }
  }, [callId]);

  // Update parent on state changes
  useEffect(() => {
    onCallStateChange?.(callState);
  }, [callState, onCallStateChange]);

  // Call timer
  useEffect(() => {
    if (callState === 'connected' && participantCount > 1) {
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
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
  }, [callState, participantCount]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Listen for call status changes (e.g., other party hung up)
  useEffect(() => {
    if (!callIdRef.current || callState === 'ended') return;

    const callId = callIdRef.current;
    console.log('[VideoCall] Setting up call status listener for:', callId);

    const channel = supabase
      .channel(`video-call-status-${callId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'active_calls',
          filter: `call_id=eq.${callId}`,
        },
        (payload: { new: { status: string } }) => {
          const newStatus = payload.new?.status;
          console.log('[VideoCall] Call status changed to:', newStatus);
          if (newStatus === 'ended' || newStatus === 'rejected' || newStatus === 'missed') {
            console.log('[VideoCall] Other party ended the call');
            // Clean up and close
            if (dailyCallRef.current) {
              try {
                dailyCallRef.current.leave();
                dailyCallRef.current.destroy();
              } catch (err) {
                // Ignore cleanup errors
              }
              dailyCallRef.current = null;
            }
            setCallState('ended');
            onClose();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [callState, onClose, supabase]);

  // Ringback tone for caller (dynamic import for better error handling)
  useEffect(() => {
    let isMounted = true;

    const playRingback = async () => {
      if ((callState === 'connecting' || callState === 'ringing') && isOwner) {
        console.log('[VideoCall] 🔊 Attempting to play ringback tone...', { callState, isOwner });
        
        try {
          // Try RingtoneService first (uses user preferences)
          const { default: RingtoneService } = await import('@/lib/services/ringtoneService');
          const audio = await RingtoneService.playRingtone('outgoing', { loop: true });
          if (isMounted && audio) {
            ringbackAudioRef.current = audio;
            console.log('[VideoCall] ✅ Ringback playing via RingtoneService');
            return;
          }
        } catch (err) {
          console.warn('[VideoCall] RingtoneService failed:', err);
        }
        
        // Fallback: Direct audio element
        if (isMounted) {
          console.log('[VideoCall] 🔄 Trying fallback ringback audio...');
          try {
            const fallbackAudio = new Audio('/sounds/ringback.mp3');
            fallbackAudio.loop = true;
            fallbackAudio.volume = 0.8;
            await fallbackAudio.play();
            ringbackAudioRef.current = fallbackAudio;
            console.log('[VideoCall] ✅ Ringback playing via fallback');
          } catch (fallbackErr) {
            console.error('[VideoCall] ❌ All ringback attempts failed:', fallbackErr);
          }
        }
      }
    };

    const stopRingback = () => {
      if (ringbackAudioRef.current) {
        console.log('[VideoCall] 🔇 Stopping ringback tone');
        try {
          ringbackAudioRef.current.pause();
          ringbackAudioRef.current.currentTime = 0;
        } catch (err) {
          // Ignore errors
        }
        ringbackAudioRef.current = null;
      }
    };

    if ((callState === 'connecting' || callState === 'ringing') && isOwner) {
      playRingback();
    } else {
      stopRingback();
    }

    return () => {
      isMounted = false;
      stopRingback();
    };
  }, [callState, isOwner]);

  // Initialize call
  useEffect(() => {
    if (!isOpen || (!roomName && !meetingUrl)) return;

    let isCleanedUp = false;

    const initializeCall = async () => {
      try {
        setCallState('connecting');
        setError(null);
        setCallDuration(0);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Not authenticated. Please sign in.');
        }
        const userId = user.id;

        // Wait for DOM to be ready
        await new Promise(resolve => setTimeout(resolve, 100));

        if (isCleanedUp) return;

        if (!callFrameRef.current) {
          throw new Error('Video container not ready. Please try again.');
        }

        // Destroy existing instance
        if (dailyCallRef.current) {
          dailyCallRef.current.destroy();
          dailyCallRef.current = null;
        }

        let roomUrl: string;

        if (meetingUrl) {
          roomUrl = meetingUrl;
        } else if (isOwner) {
          // Create P2P room
          const roomResponse = await fetch('/api/daily/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `Video Call - ${userName}`,
              isPrivate: true,
              expiryMinutes: 60,
              maxParticipants: 10,
              isP2P: true,
            }),
          });

          if (!roomResponse.ok) {
            const errorData = await roomResponse.json();
            throw new Error(errorData.error || 'Failed to create call room');
          }

          const { room } = await roomResponse.json();
          roomUrl = room.url;

          // Create call signaling record
          if (calleeId && !callIdRef.current) {
            const callId = crypto.randomUUID();
            callIdRef.current = callId;

            const { data: callerProfile } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', userId)
              .maybeSingle();

            const callerName = callerProfile
              ? `${callerProfile.first_name || ''} ${callerProfile.last_name || ''}`.trim() || 'Someone'
              : 'Someone';

            await supabase.from('active_calls').insert({
              call_id: callId,
              caller_id: userId,
              callee_id: calleeId,
              thread_id: threadId || null,
              call_type: 'video',
              status: 'ringing',
              caller_name: callerName,
              meeting_url: roomUrl,
            });

            await supabase.from('call_signals').insert({
              call_id: callId,
              from_user_id: userId,
              to_user_id: calleeId,
              signal_type: 'offer',
              payload: {
                meeting_url: roomUrl,
                call_type: 'video',
                caller_name: callerName,
                thread_id: threadId,
              },
            });

            // Send push notification for background/closed app
            try {
              const pushResponse = await fetch('/api/notifications/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: calleeId,
                  title: '📹 Incoming Video Call',
                  body: `${callerName} is calling...`,
                  tag: `call-${callId}`,
                  type: 'call',
                  requireInteraction: true,
                  url: '/dashboard',
                  data: { 
                    callId, 
                    callType: 'video', 
                    call_id: callId,
                    call_type: 'video',
                    callerId: userId, 
                    caller_id: userId,
                    callerName, 
                    caller_name: callerName,
                    roomUrl,
                    threadId: threadId || undefined,
                    thread_id: threadId || undefined,
                    type: 'call',
                  },
                }),
              });
              
              if (pushResponse.ok) {
                const result = await pushResponse.json();
                console.log('[VideoCall] Push notification sent:', result);
              } else {
                console.warn('[VideoCall] Push notification failed:', await pushResponse.text());
              }
            } catch (e) {
              console.warn('[VideoCall] Push notification error:', e);
            }

            setCallState('ringing');
          }
        } else {
          roomUrl = `https://edudashpro.daily.co/${roomName}`;
        }

        const actualRoomName = roomUrl.split('/').pop() || roomName || '';

        // Get token
        const response = await fetch('/api/daily/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName: actualRoomName,
            userName,
            isOwner,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to get meeting token');
        }

        const { token } = await response.json();

        if (isCleanedUp) return;

        // Create Daily call frame with Prebuilt UI
        const daily = DailyIframe.createFrame(callFrameRef.current, {
          showLeaveButton: false,
          showFullscreenButton: true,
          showLocalVideo: true,
          showParticipantsBar: true,
          
          // UI customization
          theme: {
            colors: {
              accent: '#6366f1',
              accentText: '#ffffff',
              background: '#1a1a2e',
              backgroundAccent: '#16213e',
              baseText: '#ffffff',
              border: '#0f3460',
              mainAreaBg: '#0f0e17',
              mainAreaBgAccent: '#16213e',
              mainAreaText: '#ffffff',
              supportiveText: '#a7a9be',
            },
          },
          
          iframeStyle: {
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: '12px',
          },
        });

        dailyCallRef.current = daily;

        // Event listeners
        daily
          .on('joined-meeting', () => {
            setCallState('connected');
            setParticipantCount(Object.keys(daily.participants()).length);
          })
          .on('left-meeting', () => {
            console.log('[VideoCall] Left meeting - closing call UI');
            setCallState('ended');
            onClose();
          })
          .on('participant-joined', () => {
            setParticipantCount(Object.keys(daily.participants()).length);
          })
          .on('participant-left', () => {
            const count = Object.keys(daily.participants()).length;
            setParticipantCount(count);
            console.log('[VideoCall] Participant left, remaining:', count);
            
            // Check if all remote participants have left
            const remoteCount = Object.values(daily.participants()).filter((p: any) => !p.local).length;
            if (remoteCount === 0) {
              console.log('[VideoCall] Last remote participant left - ending call');
              setTimeout(() => {
                if (dailyCallRef.current) {
                  try {
                    dailyCallRef.current.leave();
                    dailyCallRef.current.destroy();
                  } catch (err) {
                    // Ignore cleanup errors
                  }
                  dailyCallRef.current = null;
                }
                setCallState('ended');
                onClose();
              }, 500);
            }
          })
          .on('error', (event) => {
            console.error('[VideoCall] Daily error:', event);
            setError(event?.errorMsg || 'Call error occurred');
            setCallState('failed');
          });

        // Join the call
        await daily.join({
          url: roomUrl,
          token,
        });

      } catch (err) {
        console.error('[VideoCall] Initialization error:', err);
        setError(err instanceof Error ? err.message : 'Failed to start call');
        setCallState('failed');
      }
    };

    initializeCall();

    return () => {
      isCleanedUp = true;
      if (dailyCallRef.current) {
        dailyCallRef.current.destroy();
        dailyCallRef.current = null;
      }
    };
  }, [isOpen, roomName, meetingUrl, userName, isOwner, calleeId, threadId, supabase]);

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (!dailyCallRef.current) return;
    try {
      await dailyCallRef.current.setLocalVideo(!isVideoEnabled);
      setIsVideoEnabled(!isVideoEnabled);
    } catch (err) {
      console.error('[VideoCall] Toggle video error:', err);
    }
  }, [isVideoEnabled]);

  // Toggle audio
  const toggleAudio = useCallback(async () => {
    if (!dailyCallRef.current) return;
    try {
      await dailyCallRef.current.setLocalAudio(!isAudioEnabled);
      setIsAudioEnabled(!isAudioEnabled);
    } catch (err) {
      console.error('[VideoCall] Toggle audio error:', err);
    }
  }, [isAudioEnabled]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (!dailyCallRef.current) return;
    try {
      if (isScreenSharing) {
        await dailyCallRef.current.stopScreenShare();
      } else {
        await dailyCallRef.current.startScreenShare();
      }
      setIsScreenSharing(!isScreenSharing);
    } catch (err) {
      console.error('[VideoCall] Toggle screen share error:', err);
    }
  }, [isScreenSharing]);

  // Toggle speaker
  const toggleSpeaker = useCallback(() => {
    setIsSpeakerEnabled(!isSpeakerEnabled);
  }, [isSpeakerEnabled]);

  // End call and update database
  const handleEndCall = useCallback(async () => {
    // Update database status to 'ended'
    if (callIdRef.current) {
      try {
        await supabase
          .from('active_calls')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('call_id', callIdRef.current);
        console.log('[VideoCall] Updated call status to ended in database');
      } catch (err) {
        console.error('[VideoCall] Failed to update call status:', err);
      }
    }

    if (dailyCallRef.current) {
      try {
        await dailyCallRef.current.leave();
        dailyCallRef.current.destroy();
      } catch (err) {
        console.warn('[VideoCall] Error leaving call:', err);
      }
      dailyCallRef.current = null;
    }
    setCallState('ended');
    onClose();
  }, [onClose, supabase]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm flex items-center justify-center">
      <div
        className={`bg-gray-900 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
          isMinimized ? 'w-80 h-64' : 'w-full h-full max-w-7xl max-h-[95vh] m-4'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800/80 border-b border-gray-700">
          <div className="flex items-center gap-3">
            {/* Status indicator */}
            <div className={`w-2.5 h-2.5 rounded-full ${
              callState === 'connected' && participantCount > 1 ? 'bg-green-500 animate-pulse' :
              callState === 'connected' ? 'bg-blue-500 animate-pulse' :
              callState === 'ringing' ? 'bg-yellow-500 animate-pulse' :
              callState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              'bg-red-500'
            }`} />
            
            {/* Status text and timer */}
            <span className="text-sm font-medium text-white">
              {callState === 'connected' && participantCount > 1 
                ? `Connected • ${formatDuration(callDuration)}`
                : callState === 'connected' ? 'Waiting for others...'
                : callState === 'ringing' ? 'Ringing...'
                : callState === 'connecting' ? 'Connecting...'
                : callState === 'failed' ? 'Call Failed'
                : 'Video Call'}
            </span>

            {/* Participant count */}
            {participantCount > 0 && (
              <div className="flex items-center gap-1 text-gray-400 text-xs">
                <Users className="w-3.5 h-3.5" />
                <span>{participantCount}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              {isMinimized ? (
                <Maximize2 className="w-4 h-4 text-gray-400" />
              ) : (
                <Minimize2 className="w-4 h-4 text-gray-400" />
              )}
            </button>
            <button
              onClick={handleEndCall}
              className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-red-400" />
            </button>
          </div>
        </div>

        {/* Video Frame */}
        <div className="relative w-full h-[calc(100%-120px)] bg-black">
          {/* Always render the container */}
          <div
            ref={callFrameRef}
            className={`w-full h-full ${error || callState === 'connecting' || callState === 'ringing' ? 'opacity-0' : 'opacity-100'}`}
          />

          {/* Loading overlay */}
          {(callState === 'connecting' || callState === 'ringing') && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="text-center space-y-4">
                <div className="relative">
                  <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto" />
                  {callState === 'ringing' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Video className="w-6 h-6 text-blue-400" />
                    </div>
                  )}
                </div>
                <p className="text-white text-lg font-medium">
                  {callState === 'ringing' ? `Calling ${userName || 'User'}...` : 'Connecting...'}
                </p>
                {callState === 'ringing' && (
                  <p className="text-gray-400 text-sm">Waiting for answer</p>
                )}
              </div>
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="text-center space-y-4 p-6 max-w-md">
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
                <h3 className="text-xl font-semibold text-white">Call Failed</h3>
                <p className="text-gray-400">{error}</p>
                <button
                  onClick={handleEndCall}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 py-3 bg-gray-800/80 border-t border-gray-700">
          <div className="flex items-center justify-center gap-2">
            {/* Mic */}
            <button
              onClick={toggleAudio}
              disabled={callState !== 'connected'}
              className={`p-3 rounded-full transition-all ${
                isAudioEnabled
                  ? 'bg-gray-700 hover:bg-gray-600'
                  : 'bg-red-500 hover:bg-red-600'
              } disabled:opacity-50`}
              title={isAudioEnabled ? 'Mute' : 'Unmute'}
            >
              {isAudioEnabled ? (
                <Mic className="w-5 h-5 text-white" />
              ) : (
                <MicOff className="w-5 h-5 text-white" />
              )}
            </button>

            {/* Video */}
            <button
              onClick={toggleVideo}
              disabled={callState !== 'connected'}
              className={`p-3 rounded-full transition-all ${
                isVideoEnabled
                  ? 'bg-gray-700 hover:bg-gray-600'
                  : 'bg-red-500 hover:bg-red-600'
              } disabled:opacity-50`}
              title={isVideoEnabled ? 'Stop Video' : 'Start Video'}
            >
              {isVideoEnabled ? (
                <Video className="w-5 h-5 text-white" />
              ) : (
                <VideoOff className="w-5 h-5 text-white" />
              )}
            </button>

            {/* Screen Share */}
            <button
              onClick={toggleScreenShare}
              disabled={callState !== 'connected'}
              className={`p-3 rounded-full transition-all ${
                isScreenSharing
                  ? 'bg-blue-500 hover:bg-blue-600'
                  : 'bg-gray-700 hover:bg-gray-600'
              } disabled:opacity-50`}
              title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
            >
              {isScreenSharing ? (
                <MonitorOff className="w-5 h-5 text-white" />
              ) : (
                <Monitor className="w-5 h-5 text-white" />
              )}
            </button>

            {/* Speaker */}
            <button
              onClick={toggleSpeaker}
              disabled={callState !== 'connected'}
              className={`p-3 rounded-full transition-all ${
                isSpeakerEnabled
                  ? 'bg-gray-700 hover:bg-gray-600'
                  : 'bg-yellow-500 hover:bg-yellow-600'
              } disabled:opacity-50`}
              title={isSpeakerEnabled ? 'Speaker Off' : 'Speaker On'}
            >
              {isSpeakerEnabled ? (
                <Volume2 className="w-5 h-5 text-white" />
              ) : (
                <VolumeX className="w-5 h-5 text-white" />
              )}
            </button>

            {/* End Call */}
            <button
              onClick={handleEndCall}
              className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition-all ml-4"
              title="End Call"
            >
              <PhoneOff className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCallInterface;
