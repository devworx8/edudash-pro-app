'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Users,
  Circle,
  PhoneOff,
  Mic,
  Video,
} from 'lucide-react';

// EduDash Pro Theme Colors for Daily Prebuilt
const EDUDASH_THEME = {
  colors: {
    accent: '#7c3aed',
    accentText: '#FFFFFF',
    background: '#1a1a2e',
    backgroundAccent: '#27272a',
    baseText: '#fafafa',
    border: '#3f3f46',
    mainAreaBg: '#111827',
    mainAreaBgAccent: '#1f2937',
    mainAreaText: '#f9fafb',
    supportiveText: '#a1a1aa',
  },
};

interface DailyPrebuiltCallProps {
  roomUrl: string;
  callType: 'video' | 'voice';
  title: string;
  className?: string;
  teacherName?: string;
  isTeacher?: boolean;
  onLeave?: () => void;
  userName?: string;
}

export function DailyPrebuiltCall({
  roomUrl,
  callType,
  title,
  className,
  teacherName,
  isTeacher = false,
  onLeave,
  userName,
}: DailyPrebuiltCallProps) {
  const supabase = createClient();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isJoining, setIsJoining] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [iframeSrcSet, setIframeSrcSet] = useState(false);

  // Get meeting token
  const getMeetingToken = useCallback(async (roomName: string): Promise<string | null> => {
    try {
      console.log('[DailyPrebuiltCall] Fetching token for room:', roomName);
      const response = await fetch('/api/daily/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomName, userName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[DailyPrebuiltCall] Token fetch failed:', response.status, errorData);
        if (errorData.code === 'DAILY_API_KEY_MISSING' || response.status === 503) {
          setLocalError('Video calls are not available. Please contact your administrator.');
        } else if (response.status === 401) {
          setLocalError('Please sign in to join calls.');
        } else {
          setLocalError(errorData.message || errorData.error || 'Failed to join call. Please try again.');
        }
        return null;
      }

      const data = await response.json();
      console.log('[DailyPrebuiltCall] Token received successfully');
      return data.token;
    } catch (err) {
      console.error('[DailyPrebuiltCall] Error getting token:', err);
      setLocalError('Network error. Please check your connection.');
      return null;
    }
  }, [userName]);

  // Build Daily Prebuilt iframe URL with configuration
  const buildPrebuiltUrl = useCallback(async () => {
    const roomName = roomUrl.split('/').pop() || '';
    const token = await getMeetingToken(roomName);

    if (!token) {
      return null;
    }

    // Base URL for Daily Prebuilt
    const baseUrl = roomUrl;

    // Build URL parameters for Daily Prebuilt customization
    const params = new URLSearchParams();
    params.set('t', token);

    // Apply EduDash Pro theme colors
    params.set('color', EDUDASH_THEME.colors.accent.replace('#', ''));

    // Enable audio enhancements (noise cancellation, echo cancellation, auto-gain)
    params.set('dailyConfig', JSON.stringify({
      enableNoiseReduction: true,
      enableEchoCancellation: true,
      enableAutogainControl: true,
      enableTypingSuppression: true,
    }));

    // Configure based on call type
    if (callType === 'voice') {
      // Voice call configuration (industry standard for audio-only calls)
      // videoSource=false disables the camera completely for voice-only mode
      // UI elements related to video are hidden for cleaner audio-only experience
      params.set('showLeaveButton', 'true');
      params.set('showFullscreenButton', 'false');
      params.set('showLocalVideo', 'false');
      params.set('showParticipantsBar', 'true');
      params.set('showChat', 'true');
      params.set('showScreenShare', 'false');
      params.set('videoSource', 'false');
    } else {
      // Video call configuration with full video capabilities
      params.set('showLeaveButton', 'true');
      params.set('showFullscreenButton', 'true');
      params.set('showLocalVideo', 'true');
      params.set('showParticipantsBar', 'true');
      params.set('showChat', 'true');
      params.set('showScreenShare', 'true');
    }

    // Enable raise hand and reactions for interactive lessons
    params.set('showRaiseHandButton', 'true');
    params.set('showReactions', 'true');
    params.set('showPeopleUI', 'true'); // Shows participant list with raised hands

    // Layout configuration (Zoom/Teams style)
    // Active speaker mode: highlights active speaker while keeping all videos visible
    params.set('layout', 'default'); // 'default' = grid view, 'single-participant' = spotlight
    params.set('activeSpeakerMode', 'true'); // Highlight active speaker with border
    params.set('showActiveSpeakerUI', 'true'); // Visual indicator for active speaker
    
    // Video tile sizing
    params.set('videoFit', 'cover'); // 'cover' fills tiles, 'contain' shows full video with letterboxing
    params.set('maxCamStreams', '25'); // Support up to 25 participants in gallery view

    // Teacher-only features
    if (isTeacher) {
      params.set('showRecording', 'true');
    }

    return `${baseUrl}?${params.toString()}`;
  }, [roomUrl, callType, isTeacher, getMeetingToken]);

  // Initialize Daily Prebuilt
  useEffect(() => {
    let isMounted = true;
    const timeoutId: { current: NodeJS.Timeout | null } = { current: null };

    const initializePrebuilt = async () => {
      setIsJoining(true);
      setLocalError(null);
      setIframeSrcSet(false);

      console.log('[DailyPrebuiltCall] Initializing with roomUrl:', roomUrl);
      const prebuiltUrl = await buildPrebuiltUrl();

      if (!isMounted) return;

      if (!prebuiltUrl) {
        console.error('[DailyPrebuiltCall] Failed to build prebuilt URL');
        setIsJoining(false);
        return;
      }

      console.log('[DailyPrebuiltCall] Setting iframe src');
      // Set the iframe src
      if (iframeRef.current) {
        iframeRef.current.src = prebuiltUrl;
        setIframeSrcSet(true);
        
        // Set a timeout in case the iframe never loads
        timeoutId.current = setTimeout(() => {
          if (isMounted && !frameLoaded) {
            console.error('[DailyPrebuiltCall] Iframe load timeout - iframe may be blocked or URL invalid');
            setLocalError('Video call failed to load. Please check your connection and try again.');
            setIsJoining(false);
          }
        }, 30000); // 30 second timeout
      } else {
        console.error('[DailyPrebuiltCall] iframe ref is null');
        setLocalError('Failed to initialize video call. Please refresh and try again.');
        setIsJoining(false);
      }
    };

    initializePrebuilt();

    return () => {
      isMounted = false;
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, [buildPrebuiltUrl, frameLoaded, roomUrl]);

  // Handle iframe load
  const handleIframeLoad = useCallback(() => {
    console.log('[DailyPrebuiltCall] Iframe loaded successfully');
    setFrameLoaded(true);
    setIsJoining(false);
  }, []);

  // Handle iframe error
  const handleIframeError = useCallback(() => {
    console.error('[DailyPrebuiltCall] Iframe failed to load');
    setLocalError('Video call failed to load. Please try again.');
    setIsJoining(false);
  }, []);

  // Handle leave
  const handleLeave = useCallback(async () => {
    // If teacher is leaving, mark the video call as ended
    if (isTeacher && roomUrl) {
      try {
        const meetingId = roomUrl.split('/').pop();
        if (meetingId) {
          await supabase
            .from('video_calls')
            .update({
              status: 'ended',
              actual_end: new Date().toISOString(),
            })
            .eq('meeting_id', meetingId);
        }
      } catch (err) {
        console.error('[DailyPrebuiltCall] Error updating video call status:', err);
      }
    }

    onLeave?.();
  }, [isTeacher, roomUrl, supabase, onLeave]);

  // Listen for Daily Prebuilt events via postMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin is from Daily.co using proper URL parsing
      // Daily.co uses subdomains, so we check if the hostname ends with .daily.co
      try {
        const url = new URL(event.origin);
        const isDailyOrigin = url.hostname === 'daily.co' || url.hostname.endsWith('.daily.co');
        if (!isDailyOrigin) return;
      } catch {
        // Invalid URL origin, ignore
        return;
      }

      const { action, ...data } = event.data || {};

      switch (action) {
        case 'participant-joined':
          setParticipantCount((prev) => prev + 1);
          break;
        case 'participant-left':
          setParticipantCount((prev) => Math.max(1, prev - 1));
          break;
        case 'recording-started':
          setIsRecording(true);
          break;
        case 'recording-stopped':
          setIsRecording(false);
          break;
        case 'left-meeting':
          handleLeave();
          break;
        case 'error':
          setLocalError(data.errorMsg || 'Call error occurred');
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleLeave]);

  // Render error state
  if (localError) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center z-50">
        <div className="text-red-500 text-6xl mb-4">⚠️</div>
        <p className="text-white text-lg mb-2">Unable to join call</p>
        <p className="text-gray-400 mb-6">{localError}</p>
        <div className="flex gap-4">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={handleLeave}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-gray-900 flex flex-col z-50"
      style={{
        background: EDUDASH_THEME.colors.background,
        paddingTop: 'max(env(safe-area-inset-top), 80px)', // Add space for mobile app header
      }}
    >
      {/* EduDash Pro Branded Header */}
      <header
        className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4"
        style={{
          background: EDUDASH_THEME.colors.backgroundAccent,
          borderBottom: `1px solid ${EDUDASH_THEME.colors.border}`,
          position: 'fixed',
          top: 'max(env(safe-area-inset-top), 0)',
          left: 0,
          right: 0,
          zIndex: 10,
        }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Logo placeholder */}
          <div
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${EDUDASH_THEME.colors.accent} 0%, #db2777 100%)`,
            }}
          >
            {callType === 'voice' ? (
              <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            ) : (
              <Video className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Recording indicator */}
              {isRecording && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-red-600 rounded text-white text-xs font-medium flex-shrink-0">
                  <Circle className="w-2 h-2 fill-current animate-pulse" />
                  <span className="hidden sm:inline">Recording</span>
                  <span className="sm:hidden">REC</span>
                </span>
              )}
              <h1
                className="font-semibold text-sm sm:text-base truncate"
                style={{ color: EDUDASH_THEME.colors.baseText }}
              >
                {title}
              </h1>
            </div>
            {(className || teacherName) && (
              <p
                className="text-xs sm:text-sm truncate"
                style={{ color: EDUDASH_THEME.colors.supportiveText }}
              >
                {className && <span>{className}</span>}
                {className && teacherName && <span> • </span>}
                {teacherName && <span>Led by {teacherName}</span>}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Participant count */}
          <span
            className="flex items-center gap-1 text-xs sm:text-sm"
            style={{ color: EDUDASH_THEME.colors.supportiveText }}
          >
            <Users className="w-4 h-4" />
            {participantCount}
          </span>

          {/* Call type badge */}
          <span
            className="px-2 py-1 rounded text-xs font-medium"
            style={{
              background:
                callType === 'voice'
                  ? 'rgba(59, 130, 246, 0.2)'
                  : 'rgba(124, 58, 237, 0.2)',
              color:
                callType === 'voice'
                  ? '#60a5fa'
                  : EDUDASH_THEME.colors.accent,
            }}
          >
            {callType === 'voice' ? 'Voice' : 'Video'}
          </span>

          {/* Leave button */}
          <button
            onClick={handleLeave}
            className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            title="Leave call"
          >
            <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </header>

      {/* Daily Prebuilt iframe */}
      <div 
        className="flex-1 relative" 
        style={{ 
          background: EDUDASH_THEME.colors.mainAreaBg,
          marginTop: 80, // Space for fixed header
        }}
      >
        <iframe
          ref={iframeRef}
          title={`${callType === 'voice' ? 'Voice Call' : 'Video Lesson'}: ${title}`}
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: frameLoaded ? 'block' : 'none',
          }}
        />

        {/* Loading overlay while iframe loads */}
        {!frameLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: EDUDASH_THEME.colors.mainAreaBg }}>
            <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-white text-lg">
              Joining {callType === 'voice' ? 'voice call' : 'video lesson'}...
            </p>
            {title && <p className="text-gray-400 mt-2">{title}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
