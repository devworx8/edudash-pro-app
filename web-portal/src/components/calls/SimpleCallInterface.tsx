'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import RingtoneService from '@/lib/services/ringtoneService';
import {
  Phone,
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
} from 'lucide-react';

type CallState = 'idle' | 'connecting' | 'connected' | 'ended' | 'failed';

interface SimpleCallInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  roomName?: string;
  userName?: string;
  isOwner?: boolean;
  calleeId?: string; // User ID of person being called
  callType?: 'voice' | 'video'; // Type of call
}

export const SimpleCallInterface = ({
  isOpen,
  onClose,
  roomName,
  userName,
  isOwner = false,
  calleeId,
  callType = 'voice',
}: SimpleCallInterfaceProps) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [callDuration, setCallDuration] = useState(0);
  const [isWaitingForOther, setIsWaitingForOther] = useState(false);

  const callFrameRef = useRef<HTMLDivElement>(null);
  const dailyCallRef = useRef<DailyCall | null>(null);
  const ringbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = createClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get current user ID IMMEDIATELY on mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        console.log('[SimpleCall] Got current user ID:', user.id);
      }
    };
    getUser();
  }, [supabase]);

  // Call timer - counts up when connected
  useEffect(() => {
    if (callState === 'connected' && participantCount > 1) {
      // Start timer when actually connected with someone
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      // Clear timer
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

  // Format duration as mm:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Play ringback tone when connecting (for callers)
  useEffect(() => {
    const playRingback = async () => {
      if (callState === 'connecting' && isOwner) {
        console.log('[SimpleCall] 🔊 Attempting to play ringback tone...');
        
        try {
          // Try RingtoneService first (uses user preferences)
          const audio = await RingtoneService.playRingtone('outgoing', { loop: true });
          if (audio) {
            ringbackAudioRef.current = audio;
            console.log('[SimpleCall] ✅ Ringback playing via RingtoneService');
            return;
          }
        } catch (err) {
          console.warn('[SimpleCall] RingtoneService failed:', err);
        }
        
        // Fallback: Direct audio element
        console.log('[SimpleCall] 🔄 Trying fallback ringback audio...');
        try {
          const fallbackAudio = new Audio('/sounds/ringback.mp3');
          fallbackAudio.loop = true;
          fallbackAudio.volume = 0.8;
          await fallbackAudio.play();
          ringbackAudioRef.current = fallbackAudio;
          console.log('[SimpleCall] ✅ Ringback playing via fallback');
        } catch (fallbackErr) {
          console.error('[SimpleCall] ❌ All ringback attempts failed:', fallbackErr);
        }
      }
    };
    
    if (callState === 'connecting' && isOwner) {
      playRingback();
    } else if (callState !== 'connecting' && ringbackAudioRef.current) {
      // Stop ringback when connected or failed
      console.log('[SimpleCall] 🔇 Stopping ringback tone');
      RingtoneService.stopRingtone(ringbackAudioRef.current);
      ringbackAudioRef.current = null;
    }

    return () => {
      // Cleanup ringback on unmount
      if (ringbackAudioRef.current) {
        RingtoneService.stopRingtone(ringbackAudioRef.current);
        ringbackAudioRef.current = null;
      }
    };
  }, [callState, isOwner]);

  // Initialize call when opened
  useEffect(() => {
    if (!isOpen || !roomName) return;

    // Prevent duplicate instances in React StrictMode
    let isCleanedUp = false;

    const initializeCall = async () => {
      try {
        setCallState('connecting');
        setError(null);
        setCallDuration(0);
        setIsWaitingForOther(true);

        // Get user ID directly (don't rely on state which may not be ready)
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Not authenticated. Please sign in.');
        }
        const userId = user.id;
        console.log('[SimpleCall] Authenticated user:', userId);

        if (isCleanedUp) {
          console.log('[SimpleCall] Component unmounted during initialization, aborting');
          return;
        }

        // The ref div is always rendered now (just hidden with CSS)
        // Give a small delay for React to paint the DOM
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!callFrameRef.current) {
          console.error('[SimpleCall] Call frame ref not available');
          throw new Error('Call interface failed to initialize. Please try again.');
        }

        // Destroy any existing Daily instance first (prevent duplicates)
        if (dailyCallRef.current) {
          console.log('[SimpleCall] Destroying existing Daily instance');
          dailyCallRef.current.destroy();
          dailyCallRef.current = null;
        }

        console.log('[SimpleCall] Starting call initialization...', { roomName, userName, isOwner });

        // For owners (callers), create the room first via Daily.co API
        // For non-owners (recipients), just get a token for existing room
        let roomUrl: string;
        
        if (isOwner) {
          // Create a P2P room via Daily API (no database record needed)
          console.log('[SimpleCall] Owner creating new P2P room...');
          const roomResponse = await fetch('/api/daily/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `P2P Call - ${userName}`,
              isPrivate: true,
              expiryMinutes: 60,
              maxParticipants: 2,
              isP2P: true, // Flag to skip video_calls table insertion
            }),
          });

          if (!roomResponse.ok) {
            const errorData = await roomResponse.json();
            console.error('[SimpleCall] Room creation failed:', errorData);
            throw new Error(errorData.error || 'Failed to create call room');
          }

          const { room } = await roomResponse.json();
          roomUrl = room.url;
          console.log('[SimpleCall] P2P room created:', roomUrl);

          // Create call record in database for signaling
          if (calleeId && !callIdRef.current) {
            const callId = crypto.randomUUID();
            callIdRef.current = callId;

            // Get caller's name
            const { data: callerProfile } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', userId)
              .maybeSingle();
            
            const callerName = callerProfile 
              ? `${callerProfile.first_name || ''} ${callerProfile.last_name || ''}`.trim() || 'Someone'
              : 'Someone';

            // Create call record
            console.log('[SimpleCall] Creating call record:', { callId, calleeId, callType, userId });
            const { error: insertError } = await supabase.from('active_calls').insert({
              call_id: callId,
              caller_id: userId,
              callee_id: calleeId,
              call_type: callType,
              status: 'ringing',
              caller_name: callerName,
              meeting_url: roomUrl,
            });

            if (insertError) {
              console.error('[SimpleCall] Failed to create call record:', insertError);
            } else {
              console.log('[SimpleCall] Call record created successfully');
            }

            // Send offer signal
            await supabase.from('call_signals').insert({
              call_id: callId,
              from_user_id: userId,
              to_user_id: calleeId,
              signal_type: 'offer',
              payload: {
                meeting_url: roomUrl,
                call_type: callType,
                caller_name: callerName,
              },
            });

            // Send push notification
            try {
              await fetch('/api/notifications/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: calleeId,
                  title: `Incoming ${callType} call`,
                  body: `${callerName} is calling...`,
                  tag: `call-${callId}`,
                  type: 'call',
                  requireInteraction: true,
                  data: {
                    url: '/dashboard',
                    callId,
                    callType,
                    callerId: userId,
                    callerName,
                    roomUrl,
                  },
                }),
              });
              console.log('[SimpleCall] Push notification sent');
            } catch (notifErr) {
              console.warn('[SimpleCall] Failed to send push notification:', notifErr);
            }
          }
        } else {
          // Just build the URL for existing room
          roomUrl = `https://edudashpro.daily.co/${roomName}`;
          console.log('[SimpleCall] Joining existing room:', roomUrl);
        }

        // Extract room name from URL for token request
        const actualRoomName = roomUrl.split('/').pop() || roomName;

        // Get meeting token from API
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
          console.error('[SimpleCall] Token fetch failed:', errorData);
          throw new Error(errorData.error || 'Failed to get meeting token');
        }

        const { token } = await response.json();
        console.log('[SimpleCall] Got meeting token, creating Daily frame...');

        if (isCleanedUp) {
          console.log('[SimpleCall] Component unmounted before frame creation, aborting');
          return;
        }

        // Create Daily call object
        const daily = DailyIframe.createFrame(callFrameRef.current, {
          showLeaveButton: false,
          showFullscreenButton: true,
          iframeStyle: {
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: '12px',
          },
        });

        dailyCallRef.current = daily;
        console.log('[SimpleCall] Daily frame created successfully');

        // Set up event listeners
        daily
          .on('joined-meeting', () => {
            console.log('[SimpleCall] Joined meeting');
            setCallState('connected');
          })
          .on('left-meeting', () => {
            console.log('[SimpleCall] Left meeting');
            handleEndCall();
          })
          .on('participant-joined', () => {
            const participants = daily.participants();
            setParticipantCount(Object.keys(participants).length);
          })
          .on('participant-left', () => {
            const participants = daily.participants();
            setParticipantCount(Object.keys(participants).length);
          })
          .on('error', (error) => {
            console.error('[SimpleCall] Daily error:', error);
            setError(error?.errorMsg || 'Call error occurred');
            setCallState('failed');
          });

        // Join the meeting using the room URL
        console.log('[SimpleCall] Joining meeting...', roomUrl);
        await daily.join({
          url: roomUrl,
          token,
        });

      } catch (err) {
        console.error('[SimpleCall] Initialization error:', err);
        setError(err instanceof Error ? err.message : 'Failed to start call');
        setCallState('failed');
      }
    };

    initializeCall();

    // Cleanup on unmount
    return () => {
      isCleanedUp = true;
      if (dailyCallRef.current) {
        console.log('[SimpleCall] Cleaning up Daily instance');
        dailyCallRef.current.destroy();
        dailyCallRef.current = null;
      }
    };
  }, [isOpen, roomName, userName, isOwner]);

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (!dailyCallRef.current) return;
    
    try {
      await dailyCallRef.current.setLocalVideo(!isVideoEnabled);
      setIsVideoEnabled(!isVideoEnabled);
    } catch (err) {
      console.error('[SimpleCall] Toggle video error:', err);
    }
  }, [isVideoEnabled]);

  // Toggle audio
  const toggleAudio = useCallback(async () => {
    if (!dailyCallRef.current) return;
    
    try {
      await dailyCallRef.current.setLocalAudio(!isAudioEnabled);
      setIsAudioEnabled(!isAudioEnabled);
    } catch (err) {
      console.error('[SimpleCall] Toggle audio error:', err);
    }
  }, [isAudioEnabled]);

  // Toggle screen sharing
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
      console.error('[SimpleCall] Toggle screen share error:', err);
    }
  }, [isScreenSharing]);

  // Toggle speaker (limited browser support)
  const toggleSpeaker = useCallback(async () => {
    if (!dailyCallRef.current) return;
    try {
      const newSpeakerState = !isSpeakerEnabled;
      setIsSpeakerEnabled(newSpeakerState);
      
      // Note: This has limited browser support
      // On mobile browsers, speakerphone toggle may not work
      console.log(`[SimpleCall] Speaker ${newSpeakerState ? 'enabled' : 'disabled'}`);
    } catch (err) {
      console.error('[SimpleCall] Toggle speaker error:', err);
    }
  }, [isSpeakerEnabled]);

  // End call
  const handleEndCall = useCallback(() => {
    if (dailyCallRef.current) {
      dailyCallRef.current.leave();
      dailyCallRef.current.destroy();
      dailyCallRef.current = null;
    }
    setCallState('ended');
    onClose();
  }, [onClose]);

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
          isMinimized ? 'w-80 h-64' : 'w-full h-full max-w-7xl max-h-[90vh]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                callState === 'connected' && participantCount > 1 ? 'bg-green-500 animate-pulse' : 
                callState === 'connected' && participantCount <= 1 ? 'bg-blue-500 animate-pulse' :
                callState === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
                'bg-red-500'
              }`} />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {callState === 'connected' && participantCount > 1 ? `Connected • ${formatDuration(callDuration)}` :
                 callState === 'connected' && participantCount <= 1 ? 'Waiting for other person...' :
                 callState === 'connecting' ? 'Connecting...' :
                 callState === 'failed' ? 'Call Failed' :
                 'Call Ended'}
              </span>
            </div>
            {participantCount > 1 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {participantCount} participant{participantCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={isMinimized ? 'Maximize' : 'Minimize'}
            >
              {isMinimized ? (
                <Maximize2 className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              ) : (
                <Minimize2 className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              )}
            </button>
            <button
              onClick={handleEndCall}
              className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5 text-red-600 dark:text-red-400" />
            </button>
          </div>
        </div>

        {/* Call Frame or Error */}
        <div className="relative w-full h-[calc(100%-140px)] bg-gray-900">
          {/* Always render the ref div - hide with CSS when not needed */}
          <div 
            ref={callFrameRef} 
            className={`w-full h-full ${error || callState === 'connecting' ? 'hidden' : ''}`} 
          />
          
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-4 p-6 max-w-md">
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
                <h3 className="text-xl font-semibold text-white">Call Failed</h3>
                <p className="text-gray-300">{error}</p>
                <button
                  onClick={handleEndCall}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
          
          {callState === 'connecting' && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-4">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
                <p className="text-white text-lg">
                  {isOwner ? 'Calling...' : 'Connecting to call...'}
                </p>
                {isOwner && userName && (
                  <p className="text-gray-400 text-sm">Calling {userName}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-center gap-3">
            {/* Microphone */}
            <button
              onClick={toggleAudio}
              disabled={callState !== 'connected'}
              className={`p-4 rounded-full transition-all ${
                isAudioEnabled
                  ? 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                  : 'bg-red-500 hover:bg-red-600'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isAudioEnabled ? 'Mute' : 'Unmute'}
            >
              {isAudioEnabled ? (
                <Mic className="w-6 h-6 text-gray-700 dark:text-gray-200" />
              ) : (
                <MicOff className="w-6 h-6 text-white" />
              )}
            </button>

            {/* Video */}
            <button
              onClick={toggleVideo}
              disabled={callState !== 'connected'}
              className={`p-4 rounded-full transition-all ${
                isVideoEnabled
                  ? 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                  : 'bg-red-500 hover:bg-red-600'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isVideoEnabled ? 'Stop Video' : 'Start Video'}
            >
              {isVideoEnabled ? (
                <Video className="w-6 h-6 text-gray-700 dark:text-gray-200" />
              ) : (
                <VideoOff className="w-6 h-6 text-white" />
              )}
            </button>

            {/* Screen Share (Owner only) */}
            {isOwner && (
              <button
                onClick={toggleScreenShare}
                disabled={callState !== 'connected'}
                className={`p-4 rounded-full transition-all ${
                  isScreenSharing
                    ? 'bg-blue-500 hover:bg-blue-600'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
              >
                {isScreenSharing ? (
                  <MonitorOff className="w-6 h-6 text-white" />
                ) : (
                  <Monitor className="w-6 h-6 text-gray-700 dark:text-gray-200" />
                )}
              </button>
            )}

            {/* Speaker Toggle */}
            <button
              onClick={toggleSpeaker}
              disabled={callState !== 'connected'}
              className={`p-4 rounded-full transition-all ${
                isSpeakerEnabled
                  ? 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                  : 'bg-yellow-500 hover:bg-yellow-600'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isSpeakerEnabled ? 'Disable Speaker' : 'Enable Speaker'}
            >
              {isSpeakerEnabled ? (
                <Volume2 className="w-6 h-6 text-gray-700 dark:text-gray-200" />
              ) : (
                <VolumeX className="w-6 h-6 text-white" />
              )}
            </button>

            {/* End Call */}
            <button
              onClick={handleEndCall}
              className="p-4 rounded-full bg-red-500 hover:bg-red-600 transition-all"
              title="End Call"
            >
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Hook for using the call interface
export const useSimpleCallInterface = () => {
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [callConfig, setCallConfig] = useState<{
    roomName?: string;
    userName?: string;
    isOwner?: boolean;
  }>({});

  const startCall = useCallback((config: {
    roomName: string;
    userName?: string;
    isOwner?: boolean;
  }) => {
    setCallConfig(config);
    setIsCallOpen(true);
  }, []);

  const endCall = useCallback(() => {
    setIsCallOpen(false);
    setCallConfig({});
  }, []);

  return {
    isCallOpen,
    callConfig,
    startCall,
    endCall,
  };
};
