'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

type CallState = 'idle' | 'connecting' | 'ringing' | 'incoming' | 'connected' | 'ended' | 'failed' | 'rejected';

interface CallSignal {
  id: string;
  call_id: string;
  from_user_id: string;
  to_user_id: string;
  signal_type: 'offer' | 'answer' | 'ice-candidate' | 'call-ended' | 'call-rejected' | 'call-busy';
  payload: any;
  created_at: string;
}

interface ActiveCall {
  id: string;
  call_id: string;
  caller_id: string;
  callee_id: string;
  call_type: 'voice' | 'video';
  status: 'ringing' | 'connected' | 'ended' | 'rejected' | 'missed' | 'busy';
  caller_name?: string;
  started_at: string;
}

interface UseWebRTCSignalingOptions {
  onIncomingCall?: (call: ActiveCall) => void;
  onCallEnded?: (reason: string) => void;
  onRemoteStream?: (stream: MediaStream) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export function useWebRTCSignaling(options: UseWebRTCSignalingOptions = {}) {
  const supabase = createClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<ActiveCall | null>(null);
  const [error, setError] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalChannelRef = useRef<RealtimeChannel | null>(null);
  const callChannelRef = useRef<RealtimeChannel | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const isInitiatorRef = useRef<boolean>(false);

  // Get current user ID
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getUser();
  }, [supabase]);

  // Subscribe to incoming calls
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`calls-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'active_calls',
          filter: `callee_id=eq.${currentUserId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const call = payload.new as unknown as ActiveCall;
          if (call.status === 'ringing') {
            setIncomingCall(call);
            setCallState('incoming');
            options.onIncomingCall?.(call);
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
        (payload: { new: Record<string, unknown> }) => {
          const call = payload.new as unknown as ActiveCall;
          if (call.status === 'ended' || call.status === 'rejected' || call.status === 'missed') {
            setIncomingCall(null);
            if (callState === 'incoming') {
              setCallState('idle');
            }
          }
        }
      )
      .subscribe();

    callChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, supabase, callState, options]);

  // Subscribe to signaling messages
  useEffect(() => {
    if (!currentUserId || !currentCallId) return;

    const channel = supabase
      .channel(`signals-${currentCallId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `to_user_id=eq.${currentUserId}`,
        },
        async (payload: { new: Record<string, unknown> }) => {
          const signal = payload.new as unknown as CallSignal;
          if (signal.call_id !== currentCallId) return;

          await handleSignal(signal);
        }
      )
      .subscribe();

    signalChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, currentCallId, supabase]);

  // Handle incoming signal
  const handleSignal = useCallback(async (signal: CallSignal) => {
    const pc = peerConnectionRef.current;

    switch (signal.signal_type) {
      case 'offer':
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          // Send answer back
          await sendSignal(signal.from_user_id, 'answer', answer);
          
          // Process any pending ICE candidates
          for (const candidate of pendingIceCandidatesRef.current) {
            await pc.addIceCandidate(candidate);
          }
          pendingIceCandidatesRef.current = [];
        } catch (err) {
          console.error('Error handling offer:', err);
          setError('Failed to process call offer');
        }
        break;

      case 'answer':
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
          setCallState('connected');
        } catch (err) {
          console.error('Error handling answer:', err);
        }
        break;

      case 'ice-candidate':
        if (!pc) {
          pendingIceCandidatesRef.current.push(new RTCIceCandidate(signal.payload));
        } else if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
          } catch (err) {
            console.error('Error adding ICE candidate:', err);
          }
        } else {
          pendingIceCandidatesRef.current.push(new RTCIceCandidate(signal.payload));
        }
        break;

      case 'call-ended':
      case 'call-rejected':
        cleanup();
        setCallState(signal.signal_type === 'call-rejected' ? 'rejected' : 'ended');
        options.onCallEnded?.(signal.signal_type);
        break;
    }
  }, [options]);

  // Send signaling message
  const sendSignal = useCallback(async (
    toUserId: string,
    signalType: CallSignal['signal_type'],
    payload: any
  ) => {
    if (!currentUserId || !currentCallId) return;

    await supabase.from('call_signals').insert({
      call_id: currentCallId,
      from_user_id: currentUserId,
      to_user_id: toUserId,
      signal_type: signalType,
      payload,
    });
  }, [currentUserId, currentCallId, supabase]);

  // Create peer connection
  const createPeerConnection = useCallback((isVideo: boolean) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate && remoteUserId) {
        sendSignal(remoteUserId, 'ice-candidate', event.candidate.toJSON());
      }
    };

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        options.onRemoteStream?.(event.streams[0]);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected') {
        setCallState('connected');
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        setCallState('failed');
        setError('Connection lost');
        cleanup();
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [remoteUserId, sendSignal, options]);

  // Initialize local media
  const initializeMedia = useCallback(async (isVideo: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        } : false,
      });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error('Error accessing media:', err);
      setError('Unable to access camera/microphone. Please check permissions.');
      throw err;
    }
  }, []);

  // Start outgoing call
  const startCall = useCallback(async (
    targetUserId: string,
    callType: 'voice' | 'video',
    callerName?: string
  ) => {
    if (!currentUserId) {
      setError('User not authenticated');
      return false;
    }

    try {
      setCallState('connecting');
      setError(null);
      isInitiatorRef.current = true;
      
      const callId = crypto.randomUUID();
      setCurrentCallId(callId);
      setRemoteUserId(targetUserId);

      // Create active call record
      const { error: callError } = await supabase.from('active_calls').insert({
        call_id: callId,
        caller_id: currentUserId,
        callee_id: targetUserId,
        call_type: callType,
        status: 'ringing',
        caller_name: callerName,
      });

      if (callError) {
        console.error('Error creating call:', callError);
        setError('Failed to initiate call');
        setCallState('failed');
        return false;
      }

      // Initialize media and peer connection
      const stream = await initializeMedia(callType === 'video');
      const pc = createPeerConnection(callType === 'video');

      // Add tracks to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(targetUserId, 'offer', offer);

      setCallState('ringing');
      return true;
    } catch (err) {
      console.error('Error starting call:', err);
      setCallState('failed');
      return false;
    }
  }, [currentUserId, supabase, initializeMedia, createPeerConnection, sendSignal]);

  // Answer incoming call
  const answerCall = useCallback(async () => {
    if (!incomingCall || !currentUserId) return false;

    try {
      setCallState('connecting');
      isInitiatorRef.current = false;
      setCurrentCallId(incomingCall.call_id);
      setRemoteUserId(incomingCall.caller_id);

      // Update call status
      await supabase
        .from('active_calls')
        .update({ status: 'connected', answered_at: new Date().toISOString() })
        .eq('call_id', incomingCall.call_id);

      // Initialize media and peer connection
      const stream = await initializeMedia(incomingCall.call_type === 'video');
      const pc = createPeerConnection(incomingCall.call_type === 'video');

      // Add tracks to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      setIncomingCall(null);
      return true;
    } catch (err) {
      console.error('Error answering call:', err);
      setCallState('failed');
      return false;
    }
  }, [incomingCall, currentUserId, supabase, initializeMedia, createPeerConnection]);

  // Reject incoming call
  const rejectCall = useCallback(async () => {
    if (!incomingCall) return;

    await supabase
      .from('active_calls')
      .update({ status: 'rejected', ended_at: new Date().toISOString() })
      .eq('call_id', incomingCall.call_id);

    await sendSignal(incomingCall.caller_id, 'call-rejected', { reason: 'rejected' });

    setIncomingCall(null);
    setCallState('idle');
  }, [incomingCall, supabase, sendSignal]);

  // End call
  const endCall = useCallback(async () => {
    if (currentCallId && remoteUserId) {
      await sendSignal(remoteUserId, 'call-ended', { reason: 'ended' });
      
      await supabase
        .from('active_calls')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('call_id', currentCallId);
    }

    cleanup();
    setCallState('ended');
    options.onCallEnded?.('ended');
  }, [currentCallId, remoteUserId, supabase, sendSignal, options]);

  // Cleanup resources
  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    pendingIceCandidatesRef.current = [];
    setCurrentCallId(null);
    setRemoteUserId(null);
    setIncomingCall(null);
  }, []);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return audioTrack.enabled;
      }
    }
    return false;
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return videoTrack.enabled;
      }
    }
    return false;
  }, []);

  // Get local stream
  const getLocalStream = useCallback(() => localStreamRef.current, []);

  return {
    callState,
    currentCallId,
    incomingCall,
    error,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleAudio,
    toggleVideo,
    getLocalStream,
  };
}
