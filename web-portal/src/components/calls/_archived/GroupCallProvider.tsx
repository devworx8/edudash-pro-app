'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import DailyIframe, { DailyCall, DailyParticipant, DailyEventObjectParticipant } from '@daily-co/daily-js';
import { createClient } from '@/lib/supabase/client';

interface GroupCallContextType {
  // State
  callObject: DailyCall | null;
  isInCall: boolean;
  isJoining: boolean;
  participants: Map<string, DailyParticipant>;
  localParticipant: DailyParticipant | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isRecording: boolean;
  error: string | null;
  
  // Actions
  createRoom: (options: CreateRoomOptions) => Promise<RoomInfo | null>;
  joinRoom: (roomUrl: string, userName?: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  muteParticipant: (participantId: string) => void;
  removeParticipant: (participantId: string) => void;
  muteAll: () => void;
}

interface CreateRoomOptions {
  name: string;
  classId?: string;
  preschoolId: string;
  maxParticipants?: number;
  enableRecording?: boolean;
  expiryMinutes?: number;
}

interface RoomInfo {
  id: string;
  name: string;
  url: string;
  expiresAt: string;
}

const GroupCallContext = createContext<GroupCallContextType | null>(null);

export function useGroupCall() {
  const context = useContext(GroupCallContext);
  if (!context) {
    throw new Error('useGroupCall must be used within a GroupCallProvider');
  }
  return context;
}

interface GroupCallProviderProps {
  children: ReactNode;
}

export function GroupCallProvider({ children }: GroupCallProviderProps) {
  const [callObject, setCallObject] = useState<DailyCall | null>(null);
  const [isInCall, setIsInCall] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [participants, setParticipants] = useState<Map<string, DailyParticipant>>(new Map());
  const [localParticipant, setLocalParticipant] = useState<DailyParticipant | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle participant updates
  const handleParticipantJoined = useCallback((event: DailyEventObjectParticipant | undefined) => {
    if (!event?.participant) return;
    setParticipants(prev => {
      const updated = new Map(prev);
      updated.set(event.participant.session_id, event.participant);
      return updated;
    });
  }, []);

  const handleParticipantUpdated = useCallback((event: DailyEventObjectParticipant | undefined) => {
    if (!event?.participant) return;
    setParticipants(prev => {
      const updated = new Map(prev);
      updated.set(event.participant.session_id, event.participant);
      return updated;
    });
    
    // Update local participant state if it's us
    if (event.participant.local) {
      setLocalParticipant(event.participant);
      setIsMuted(!event.participant.audio);
      setIsVideoOff(!event.participant.video);
      setIsScreenSharing(event.participant.screen || false);
    }
  }, []);

  const handleParticipantLeft = useCallback((event: { participant: DailyParticipant } | undefined) => {
    if (!event?.participant) return;
    setParticipants(prev => {
      const updated = new Map(prev);
      updated.delete(event.participant.session_id);
      return updated;
    });
  }, []);

  // Create a room via our API
  const createRoom = useCallback(async (options: CreateRoomOptions): Promise<RoomInfo | null> => {
    try {
      setError(null);
      const response = await fetch('/api/daily/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies for auth
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[GroupCall] Room creation failed:', response.status, errorData);
        
        // Provide user-friendly error messages
        if (errorData.code === 'DAILY_API_KEY_MISSING' || response.status === 503) {
          setError('Video calls are not available. Please contact your administrator to configure the video service.');
        } else if (response.status === 401) {
          setError('Please sign in to create a call room.');
        } else if (response.status === 403) {
          setError('You do not have permission to create call rooms.');
        } else if (errorData.error?.includes('API key')) {
          setError('Video service configuration error. Please contact your administrator.');
        } else {
          setError(errorData.message || errorData.error || 'Failed to create room. Please try again.');
        }
        throw new Error(errorData.error || 'Failed to create room');
      }

      const data = await response.json();
      return data.room;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create room';
      console.error('Error creating room:', err);
      // Don't override the user-friendly error message if one was already set
      if (!error) {
        setError(message);
      }
      return null;
    }
  }, [error]);

  // Join a room
  const joinRoom = useCallback(async (roomUrl: string, userName?: string): Promise<boolean> => {
    try {
      setError(null);
      setIsJoining(true);

      // Check for WebRTC support first
      if (typeof window !== 'undefined' && !navigator.mediaDevices) {
        setError('Your browser does not support video calls. Please use a modern browser like Chrome, Firefox, Safari, or Edge.');
        setIsJoining(false);
        return false;
      }

      // Check if WebRTC is available (might be blocked by browser settings or extensions)
      try {
        const testConnection = new RTCPeerConnection();
        testConnection.close();
        console.log('[GroupCall] WebRTC check passed');
      } catch (rtcError) {
        console.error('[GroupCall] WebRTC not available:', rtcError);
        setError('Video calls are blocked in your browser. Please disable any VPN, ad blockers, or privacy extensions that may block WebRTC.');
        setIsJoining(false);
        return false;
      }

      // Clean up any existing call object first to prevent duplicate instances
      if (callObject) {
        try {
          console.log('[GroupCall] Cleaning up existing call object');
          await callObject.leave();
          await callObject.destroy();
        } catch (e) {
          console.warn('[GroupCall] Error cleaning up previous call object:', e);
        }
        setCallObject(null);
        // Small delay to ensure cleanup is complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // IMPORTANT: Refresh the session before making API calls
      // This ensures the auth cookies are fresh for remote users
      const supabase = createClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('[GroupCall] No active session:', sessionError);
        setError('Please sign in to join the call. Your session may have expired.');
        setIsJoining(false);
        return false;
      }

      // Refresh session if needed to ensure cookies are valid
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('[GroupCall] Session refresh warning:', refreshError.message);
        // Continue anyway - the session might still be valid
      }

      console.log('[GroupCall] Session verified for user:', session.user.email);

      // Get room name from URL
      const roomName = roomUrl.split('/').pop() || '';

      // Get meeting token from our API
      console.log('[GroupCall] Fetching meeting token for room:', roomName);
      const tokenResponse = await fetch('/api/daily/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies for auth
        body: JSON.stringify({ roomName, userName }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error('[GroupCall] Token request failed:', tokenResponse.status, errorData);
        
        if (tokenResponse.status === 401) {
          setError('Authentication failed. Please sign out and sign back in.');
        } else {
          setError(errorData.error || errorData.details || 'Failed to get meeting token');
        }
        setIsJoining(false);
        return false;
      }

      const { token, userName: displayName } = await tokenResponse.json();
      console.log('[GroupCall] Token received, joining as:', displayName);

      // Create Daily call object with improved video quality settings
      const newCallObject = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: true,
        allowMultipleCallInstances: true, // Allow as fallback for edge cases
        // Request higher quality video
        dailyConfig: {
          // Request HD video when bandwidth allows
          camSimulcastEncodings: [
            { maxBitrate: 600000, maxFramerate: 30, scaleResolutionDownBy: 1 }, // High quality
            { maxBitrate: 200000, maxFramerate: 20, scaleResolutionDownBy: 2 }, // Medium quality
            { maxBitrate: 80000, maxFramerate: 10, scaleResolutionDownBy: 4 },  // Low quality fallback
          ],
        },
      });

      // Set up event listeners
      newCallObject
        .on('joined-meeting', () => {
          console.log('[GroupCall] Successfully joined meeting');
          setIsInCall(true);
          setIsJoining(false);
          // Get initial participants
          const allParticipants = newCallObject.participants();
          const participantsMap = new Map<string, DailyParticipant>();
          Object.values(allParticipants).forEach((p: DailyParticipant) => {
            participantsMap.set(p.session_id, p);
            if (p.local) {
              setLocalParticipant(p);
              setIsMuted(!p.audio);
              setIsVideoOff(!p.video);
            }
          });
          setParticipants(participantsMap);
        })
        .on('left-meeting', () => {
          console.log('[GroupCall] Left meeting');
          setIsInCall(false);
          setParticipants(new Map());
          setLocalParticipant(null);
        })
        .on('participant-joined', handleParticipantJoined)
        .on('participant-updated', handleParticipantUpdated)
        .on('participant-left', handleParticipantLeft)
        .on('recording-started', () => setIsRecording(true))
        .on('recording-stopped', () => setIsRecording(false))
        .on('error', (e) => {
          console.error('[GroupCall] Daily error:', e);
          setError(e?.errorMsg || 'Call error occurred');
          setIsJoining(false);
        })
        .on('camera-error', (e) => {
          console.warn('[GroupCall] Camera error:', e);
          // Don't block join for camera errors - user can still participate with audio
        })
        .on('load-attempt-failed', (e) => {
          console.error('[GroupCall] Load attempt failed:', e);
          setError('Failed to connect to video service. Please check your internet connection.');
          setIsJoining(false);
        })
        .on('network-connection', (event) => {
          // Handle network connection status changes for automatic reconnection
          if (event?.event === 'interrupted') {
            console.log('[GroupCall] Network interrupted, Daily.co will attempt auto-reconnection...');
            setError('Connection interrupted. Reconnecting...');
          } else if (event?.event === 'connected') {
            console.log('[GroupCall] Network reconnected successfully');
            setError(null);
          }
        })
        .on('network-quality-change', (event) => {
          // Log network quality changes for debugging
          if (event?.threshold) {
            console.log('[GroupCall] Network quality:', event.threshold);
          }
        });

      setCallObject(newCallObject);

      // Join the room
      console.log('[GroupCall] Joining room URL:', roomUrl);
      await newCallObject.join({
        url: roomUrl,
        token,
      });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join room';
      console.error('[GroupCall] Error joining room:', err);
      setError(message);
      setIsJoining(false);
      return false;
    }
  }, [callObject, handleParticipantJoined, handleParticipantUpdated, handleParticipantLeft]);

  // Leave the room
  const leaveRoom = useCallback(async () => {
    if (callObject) {
      await callObject.leave();
      await callObject.destroy();
      setCallObject(null);
      setIsInCall(false);
      setParticipants(new Map());
      setLocalParticipant(null);
      setIsMuted(false);
      setIsVideoOff(false);
      setIsScreenSharing(false);
      setIsRecording(false);
    }
  }, [callObject]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (callObject) {
      const newMutedState = !isMuted;
      callObject.setLocalAudio(!newMutedState);
      setIsMuted(newMutedState);
    }
  }, [callObject, isMuted]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (callObject) {
      const newVideoOffState = !isVideoOff;
      callObject.setLocalVideo(!newVideoOffState);
      setIsVideoOff(newVideoOffState);
    }
  }, [callObject, isVideoOff]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (!callObject) return;
    
    try {
      if (isScreenSharing) {
        await callObject.stopScreenShare();
      } else {
        await callObject.startScreenShare();
      }
      setIsScreenSharing(!isScreenSharing);
    } catch (err) {
      console.error('Error toggling screen share:', err);
    }
  }, [callObject, isScreenSharing]);

  // Start recording (owner only)
  const startRecording = useCallback(async () => {
    if (callObject) {
      try {
        await callObject.startRecording();
      } catch (err) {
        console.error('Error starting recording:', err);
        setError('Failed to start recording');
      }
    }
  }, [callObject]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    if (callObject) {
      try {
        await callObject.stopRecording();
      } catch (err) {
        console.error('Error stopping recording:', err);
      }
    }
  }, [callObject]);

  // Mute a specific participant (owner only)
  const muteParticipant = useCallback((participantId: string) => {
    if (callObject) {
      callObject.updateParticipant(participantId, { setAudio: false });
    }
  }, [callObject]);

  // Remove a participant (owner only)
  const removeParticipant = useCallback((participantId: string) => {
    if (callObject) {
      callObject.updateParticipant(participantId, { eject: true });
    }
  }, [callObject]);

  // Mute all participants except local
  const muteAll = useCallback(() => {
    if (callObject) {
      participants.forEach((participant) => {
        if (!participant.local) {
          callObject.updateParticipant(participant.session_id, { setAudio: false });
        }
      });
    }
  }, [callObject, participants]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callObject) {
        callObject.leave();
        callObject.destroy();
      }
    };
  }, [callObject]);

  const value: GroupCallContextType = {
    callObject,
    isInCall,
    isJoining,
    participants,
    localParticipant,
    isMuted,
    isVideoOff,
    isScreenSharing,
    isRecording,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    startRecording,
    stopRecording,
    muteParticipant,
    removeParticipant,
    muteAll,
  };

  return (
    <GroupCallContext.Provider value={value}>
      {children}
    </GroupCallContext.Provider>
  );
}
