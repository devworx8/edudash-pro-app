'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Minimize2,
  Maximize2,
  X,
  Loader2,
  User,
} from 'lucide-react';

type CallState = 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed';

interface VoiceCallInterfaceProps {
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

export const VoiceCallInterface = ({
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
}: VoiceCallInterfaceProps) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [callDuration, setCallDuration] = useState(0);

  const dailyCallRef = useRef<DailyCall | null>(null);
  const ringbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const callIdRef = useRef<string | null>(callId || null); // Initialize with prop if provided
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = createClient();

  // Update callIdRef when prop changes (for callee answering)
  useEffect(() => {
    if (callId && !callIdRef.current) {
      callIdRef.current = callId;
      console.log('[VoiceCall] Call ID set from prop:', callId);
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
    console.log('[VoiceCall] Setting up call status listener for:', callId);

    const channel = supabase
      .channel(`voice-call-status-${callId}`)
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
          console.log('[VoiceCall] Call status changed to:', newStatus);
          if (newStatus === 'ended' || newStatus === 'rejected' || newStatus === 'missed') {
            console.log('[VoiceCall] Other party ended the call');
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
        console.log('[VoiceCall] 🔊 Attempting to play ringback tone...', { callState, isOwner });
        
        try {
          // Try RingtoneService first (uses user preferences)
          const { default: RingtoneService } = await import('@/lib/services/ringtoneService');
          const audio = await RingtoneService.playRingtone('outgoing', { loop: true });
          if (isMounted && audio) {
            ringbackAudioRef.current = audio;
            console.log('[VoiceCall] ✅ Ringback playing via RingtoneService');
            return;
          }
        } catch (err) {
          console.warn('[VoiceCall] RingtoneService failed:', err);
        }
        
        // Fallback: Direct audio element
        if (isMounted) {
          console.log('[VoiceCall] 🔄 Trying fallback ringback audio...');
          try {
            const fallbackAudio = new Audio('/sounds/ringback.mp3');
            fallbackAudio.loop = true;
            fallbackAudio.volume = 0.8;
            await fallbackAudio.play();
            ringbackAudioRef.current = fallbackAudio;
            console.log('[VoiceCall] ✅ Ringback playing via fallback');
          } catch (fallbackErr) {
            console.error('[VoiceCall] ❌ All ringback attempts failed:', fallbackErr);
          }
        }
      }
    };

    const stopRingback = () => {
      if (ringbackAudioRef.current) {
        console.log('[VoiceCall] 🔇 Stopping ringback tone');
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

        if (isCleanedUp) return;

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
              name: `Voice Call - ${userName}`,
              isPrivate: true,
              expiryMinutes: 60,
              maxParticipants: 2,
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
              call_type: 'voice',
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
                call_type: 'voice',
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
                  title: '📞 Incoming Voice Call',
                  body: `${callerName} is calling...`,
                  tag: `call-${callId}`,
                  type: 'call',
                  requireInteraction: true,
                  url: '/dashboard', // Will be handled by service worker
                  data: { 
                    callId, 
                    callType: 'voice', 
                    call_id: callId,
                    call_type: 'voice',
                    callerId: userId, 
                    caller_id: userId,
                    callerName, 
                    caller_name: callerName,
                    roomUrl,
                    threadId: threadId || undefined,
                    thread_id: threadId || undefined,
                    type: 'call', // Important for service worker to identify call notifications
                  },
                }),
              });
              
              if (pushResponse.ok) {
                const result = await pushResponse.json();
                console.log('[VoiceCall] Push notification sent:', result);
              } else {
                console.warn('[VoiceCall] Push notification failed:', await pushResponse.text());
              }
            } catch (e) {
              console.warn('[VoiceCall] Push notification error:', e);
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

        // Create Daily call object (audio only - no iframe needed)
        const daily = DailyIframe.createCallObject({
          audioSource: true,
          videoSource: false, // Voice only - no video
        });

        dailyCallRef.current = daily;

        // Event listeners
        daily
          .on('joined-meeting', () => {
            setCallState('connected');
            setParticipantCount(Object.keys(daily.participants()).length);
          })
          .on('left-meeting', () => {
            console.log('[VoiceCall] Left meeting - closing call UI');
            setCallState('ended');
            onClose();
          })
          .on('participant-joined', () => {
            setParticipantCount(Object.keys(daily.participants()).length);
          })
          .on('participant-left', (event) => {
            const count = Object.keys(daily.participants()).length;
            setParticipantCount(count);
            console.log('[VoiceCall] Participant left, remaining:', count);
            
            // Check if all remote participants have left
            const remoteCount = Object.values(daily.participants()).filter((p: any) => !p.local).length;
            if (remoteCount === 0) {
              console.log('[VoiceCall] Last remote participant left - ending call');
              // Database listener should handle this, but ensure UI closes
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
            console.error('[VoiceCall] Daily error:', event);
            setError(event?.errorMsg || 'Call error occurred');
            setCallState('failed');
          });

        // Join the call
        await daily.join({
          url: roomUrl,
          token,
        });

      } catch (err) {
        console.error('[VoiceCall] Initialization error:', err);
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

  // Toggle audio
  const toggleAudio = useCallback(async () => {
    if (!dailyCallRef.current) return;
    try {
      await dailyCallRef.current.setLocalAudio(!isAudioEnabled);
      setIsAudioEnabled(!isAudioEnabled);
    } catch (err) {
      console.error('[VoiceCall] Toggle audio error:', err);
    }
  }, [isAudioEnabled]);

  // Toggle speaker (visual only - limited browser support)
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
        console.log('[VoiceCall] Updated call status to ended in database');
      } catch (err) {
        console.error('[VoiceCall] Failed to update call status:', err);
      }
    }

    if (dailyCallRef.current) {
      try {
        await dailyCallRef.current.leave();
        dailyCallRef.current.destroy();
      } catch (err) {
        console.warn('[VoiceCall] Error leaving call:', err);
      }
      dailyCallRef.current = null;
    }
    setCallState('ended');
    onClose();
  }, [onClose, supabase]);

  if (!isOpen) return null;

  // Minimized view - small floating pill
  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-24 left-4 z-[9999] bg-gradient-to-r from-green-600 to-green-500 rounded-full shadow-2xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:scale-105 transition-transform"
        onClick={() => setIsMinimized(false)}
      >
        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
          <Phone className="w-5 h-5 text-white" />
        </div>
        <div className="text-white">
          <div className="font-semibold text-sm">{userName || 'Voice Call'}</div>
          <div className="text-xs opacity-90">
            {callState === 'connected' && participantCount > 1 
              ? formatDuration(callDuration)
              : callState === 'ringing' ? 'Ringing...' : 'Connecting...'}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleEndCall(); }}
          className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600"
        >
          <PhoneOff className="w-4 h-4 text-white" />
        </button>
      </div>
    );
  }

  // Full voice call UI
  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <button
          onClick={() => setIsMinimized(true)}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <Minimize2 className="w-5 h-5 text-white/70" />
        </button>
        <div className="text-center">
          <div className="text-white/60 text-sm">
            {callState === 'connected' && participantCount > 1 
              ? formatDuration(callDuration)
              : callState === 'ringing' ? 'Ringing...' 
              : callState === 'connecting' ? 'Connecting...'
              : callState === 'failed' ? 'Call Failed'
              : 'Voice Call'}
          </div>
        </div>
        <button
          onClick={handleEndCall}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-white/70" />
        </button>
      </div>

      {/* Main content - Avatar and name */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Avatar */}
        <div className="relative mb-6">
          {/* Pulse rings when ringing/connecting */}
          {(callState === 'ringing' || callState === 'connecting') && (
            <>
              <div className="absolute inset-0 w-32 h-32 rounded-full bg-green-500/20 animate-ping" />
              <div className="absolute inset-0 w-32 h-32 rounded-full bg-green-500/10 animate-pulse" />
            </>
          )}
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-2xl">
            <User className="w-16 h-16 text-white" />
          </div>
          {/* Status indicator */}
          <div className={`absolute bottom-2 right-2 w-4 h-4 rounded-full border-2 border-gray-900 ${
            callState === 'connected' && participantCount > 1 ? 'bg-green-500' :
            callState === 'ringing' ? 'bg-yellow-500 animate-pulse' :
            callState === 'connecting' ? 'bg-blue-500 animate-pulse' :
            'bg-gray-500'
          }`} />
        </div>

        {/* Name */}
        <h2 className="text-2xl font-bold text-white mb-2">{userName || 'Unknown'}</h2>
        
        {/* Status text */}
        <p className="text-white/60 text-lg">
          {error ? error :
           callState === 'connected' && participantCount > 1 ? 'Connected' :
           callState === 'connected' && participantCount <= 1 ? 'Waiting for answer...' :
           callState === 'ringing' ? 'Ringing...' :
           callState === 'connecting' ? 'Connecting...' :
           callState === 'failed' ? 'Call failed' :
           'Voice Call'}
        </p>
      </div>

      {/* Controls */}
      <div className="px-6 py-8 pb-12">
        <div className="flex items-center justify-center gap-6">
          {/* Mute */}
          <button
            onClick={toggleAudio}
            disabled={callState !== 'connected'}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              isAudioEnabled
                ? 'bg-white/10 hover:bg-white/20'
                : 'bg-red-500 hover:bg-red-600'
            } disabled:opacity-50`}
          >
            {isAudioEnabled ? (
              <Mic className="w-7 h-7 text-white" />
            ) : (
              <MicOff className="w-7 h-7 text-white" />
            )}
          </button>

          {/* End Call */}
          <button
            onClick={handleEndCall}
            className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all"
          >
            <PhoneOff className="w-9 h-9 text-white" />
          </button>

          {/* Speaker */}
          <button
            onClick={toggleSpeaker}
            disabled={callState !== 'connected'}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              isSpeakerEnabled
                ? 'bg-white/10 hover:bg-white/20'
                : 'bg-yellow-500 hover:bg-yellow-600'
            } disabled:opacity-50`}
          >
            {isSpeakerEnabled ? (
              <Volume2 className="w-7 h-7 text-white" />
            ) : (
              <VolumeX className="w-7 h-7 text-white" />
            )}
          </button>
        </div>

        {/* Button labels */}
        <div className="flex items-center justify-center gap-6 mt-3">
          <span className="w-16 text-center text-white/50 text-xs">
            {isAudioEnabled ? 'Mute' : 'Unmute'}
          </span>
          <span className="w-20 text-center text-white/50 text-xs">End</span>
          <span className="w-16 text-center text-white/50 text-xs">Speaker</span>
        </div>
      </div>
    </div>
  );
};

export default VoiceCallInterface;
