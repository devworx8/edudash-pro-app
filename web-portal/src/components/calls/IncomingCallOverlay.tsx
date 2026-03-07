'use client';

import { Phone, PhoneOff, Video, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';

// Fallback ringtone URL (simple web audio beep) if RingtoneService fails
const FALLBACK_RINGTONE = '/sounds/ringtone.mp3';

interface IncomingCallOverlayProps {
  callerName?: string;
  callType: 'voice' | 'video';
  onAnswer: () => void;
  onReject: () => void;
  isVisible: boolean;
  isConnecting?: boolean;
}

export function IncomingCallOverlay({
  callerName = 'Unknown',
  callType,
  onAnswer,
  onReject,
  isVisible,
  isConnecting = false,
}: IncomingCallOverlayProps) {
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [hasUserInteraction, setHasUserInteraction] = useState(false);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const hasUserInteractionRef = useRef(false);

  // Try to play ringtone - with fallback for errors
  const playRingtone = useCallback(async () => {
    try {
      // Dynamically import RingtoneService to avoid SSR issues
      const { default: RingtoneService } = await import('@/lib/services/ringtoneService');
      const audio = await RingtoneService.playRingtone('incoming', { loop: true });
      if (audio) {
        ringtoneRef.current = audio;
        setAudioInitialized(true);
        console.log('[IncomingCall] Custom ringtone playing');
      }
    } catch (err) {
      console.warn('[IncomingCall] RingtoneService failed, trying fallback:', err);
      // Fallback: Play simple audio file
      try {
        const audio = new Audio(FALLBACK_RINGTONE);
        audio.loop = true;
        await audio.play();
        ringtoneRef.current = audio;
        setAudioInitialized(true);
      } catch (fallbackErr) {
        console.warn('[IncomingCall] Fallback ringtone also failed:', fallbackErr);
      }
    }
  }, []);

  // Stop ringtone safely
  const stopRingtone = useCallback(() => {
    try {
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current.currentTime = 0;
        ringtoneRef.current = null;
      }
      // Stop any ongoing vibration - only if user has interacted
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator && hasUserInteractionRef.current) {
        navigator.vibrate(0);
      }
    } catch (err) {
      // Ignore all errors during cleanup
      console.warn('[IncomingCall] Error stopping ringtone:', err);
    }
  }, []);

  // Track first user interaction so we can safely trigger audio/vibration
  useEffect(() => {
    if (hasUserInteraction) return;

    const markInteraction = () => {
      setHasUserInteraction(true);
      hasUserInteractionRef.current = true;
    };

    window.addEventListener('pointerdown', markInteraction, { once: true });
    window.addEventListener('keydown', markInteraction, { once: true });

    return () => {
      window.removeEventListener('pointerdown', markInteraction);
      window.removeEventListener('keydown', markInteraction);
    };
  }, [hasUserInteraction]);

  // Play ringtone when visible - try immediately, fall back to waiting for interaction
  useEffect(() => {
    if (!isVisible) {
      stopRingtone();
      return;
    }

    // Try to play ringtone immediately - most browsers allow this if user has interacted with the page before
    console.log('[IncomingCall] Incoming call visible, attempting to start ringtone');
    playRingtone();

    // NOTE: navigator.vibrate() requires a user gesture (click/tap) to work in modern browsers.
    // Calling it automatically here causes "[Intervention] Blocked call to navigator.vibrate"
    // warnings in Chrome. Vibration is now triggered in handleAnswer/handleReject callbacks.
    // See: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate#security

    // Retry playing audio every 2 seconds if it failed initially (autoplay blocked)
    const retryInterval = setInterval(() => {
      if (ringtoneRef.current?.paused && isVisible) {
        console.log('[IncomingCall] Retrying ringtone playback...');
        playRingtone();
      }
    }, 2000);

    return () => {
      clearInterval(retryInterval);
      stopRingtone();
    };
  }, [isVisible, playRingtone, stopRingtone]);

  // Handle user interaction to enable audio
  const handleInteraction = useCallback(() => {
    if (!hasUserInteraction) {
      setHasUserInteraction(true);
      hasUserInteractionRef.current = true;
    }

    if (!audioInitialized && isVisible) {
      playRingtone();
    }
  }, [audioInitialized, hasUserInteraction, isVisible, playRingtone]);

  // Handle answer with haptic feedback
  const handleAnswer = useCallback(() => {
    try {
      // Provide haptic feedback on user gesture (this is allowed)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(100);
      }
    } catch (err) {
      // Ignore vibration errors
    }
    stopRingtone();
    onAnswer();
  }, [onAnswer, stopRingtone]);

  // Handle reject with haptic feedback
  const handleReject = useCallback(() => {
    try {
      // Provide haptic feedback on user gesture (this is allowed)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(50);
      }
    } catch (err) {
      // Ignore vibration errors
    }
    stopRingtone();
    onReject();
  }, [onReject, stopRingtone]);

  if (!isVisible) return null;

  return (
    <div
      onClick={handleInteraction}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)',
        backdropFilter: 'blur(20px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(16px, 4vw, 24px)',
        paddingTop: 'max(env(safe-area-inset-top), clamp(16px, 4vw, 24px))',
        paddingBottom: 'max(env(safe-area-inset-bottom), clamp(16px, 4vw, 24px))',
      }}
    >
      {/* Pulsing avatar - responsive size */}
      <div
        style={{
          position: 'relative',
          width: 'clamp(100px, 30vw, 140px)',
          height: 'clamp(100px, 30vw, 140px)',
          marginBottom: 'clamp(20px, 6vw, 32px)',
        }}
      >
        {/* Outer pulse rings */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: `calc(100% + ${i * 30}px)`,
              height: `calc(100% + ${i * 30}px)`,
              borderRadius: '50%',
              border: `2px solid ${callType === 'video' ? '#3b82f6' : '#22c55e'}`,
              opacity: 0.3 - i * 0.1,
              animation: `pulse-ring 1.5s ease-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
        
        {/* Avatar circle */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '85%',
            height: '85%',
            borderRadius: '50%',
            background: callType === 'video' 
              ? 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)'
              : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 40px ${callType === 'video' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(34, 197, 94, 0.5)'}`,
          }}
        >
          {callType === 'video' ? (
            <Video style={{ width: 'clamp(32px, 10vw, 48px)', height: 'clamp(32px, 10vw, 48px)' }} color="white" />
          ) : (
            <Phone style={{ width: 'clamp(32px, 10vw, 48px)', height: 'clamp(32px, 10vw, 48px)', animation: 'shake 0.5s ease-in-out infinite' }} color="white" />
          )}
        </div>
      </div>

      {/* Caller info */}
      <h2
        style={{
          fontSize: 'clamp(22px, 6vw, 28px)',
          fontWeight: 700,
          color: 'white',
          margin: 0,
          marginBottom: 8,
          textAlign: 'center',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {callerName}
      </h2>
      
      <p
        style={{
          fontSize: 'clamp(14px, 4vw, 16px)',
          color: 'rgba(255, 255, 255, 0.7)',
          margin: 0,
          marginBottom: 'clamp(40px, 12vw, 60px)',
          textAlign: 'center',
        }}
      >
        {isConnecting ? 'Connecting...' : `Incoming ${callType} call...`}
      </p>

      {/* Action buttons - mobile responsive gap */}
      <div
        style={{
          display: 'flex',
          gap: 'clamp(32px, 12vw, 48px)',
          alignItems: 'center',
        }}
      >
        {/* Reject button */}
        <button
          onClick={handleReject}
          disabled={isConnecting}
          style={{
            width: 'clamp(60px, 18vw, 72px)',
            height: 'clamp(60px, 18vw, 72px)',
            borderRadius: 36,
            background: isConnecting 
              ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
              : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isConnecting ? 'not-allowed' : 'pointer',
            boxShadow: isConnecting 
              ? '0 8px 24px rgba(107, 114, 128, 0.4)'
              : '0 8px 24px rgba(239, 68, 68, 0.4)',
            transition: 'transform 0.2s ease',
            opacity: isConnecting ? 0.6 : 1,
          }}
          onMouseEnter={(e) => !isConnecting && (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <PhoneOff style={{ width: 'clamp(24px, 8vw, 32px)', height: 'clamp(24px, 8vw, 32px)' }} color="white" />
        </button>

        {/* Accept button */}
        <button
          onClick={handleAnswer}
          disabled={isConnecting}
          style={{
            width: 'clamp(60px, 18vw, 72px)',
            height: 'clamp(60px, 18vw, 72px)',
            borderRadius: 36,
            background: isConnecting 
              ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
              : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isConnecting ? 'not-allowed' : 'pointer',
            boxShadow: isConnecting 
              ? '0 8px 24px rgba(59, 130, 246, 0.4)'
              : '0 8px 24px rgba(34, 197, 94, 0.4)',
            transition: 'transform 0.2s ease',
            animation: isConnecting ? 'none' : 'bounce-slight 1s ease-in-out infinite',
          }}
          onMouseEnter={(e) => !isConnecting && (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          {isConnecting ? (
            <Loader2 size={32} color="white" style={{ animation: 'spin 1s linear infinite' }} />
          ) : callType === 'video' ? (
            <Video size={32} color="white" />
          ) : (
            <Phone style={{ width: 'clamp(24px, 8vw, 32px)', height: 'clamp(24px, 8vw, 32px)' }} color="white" />
          )}
        </button>
      </div>

      {/* Labels */}
      <div
        style={{
          display: 'flex',
          gap: 'clamp(32px, 12vw, 48px)',
          marginTop: 'clamp(12px, 4vw, 16px)',
        }}
      >
        <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 'clamp(12px, 3.5vw, 14px)', width: 'clamp(60px, 18vw, 72px)', textAlign: 'center' }}>
          Decline
        </span>
        <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 14, width: 72, textAlign: 'center' }}>
          {isConnecting ? 'Connecting...' : 'Accept'}
        </span>
      </div>

      {/* Keyframes animation styles */}
      <style jsx global>{`
        @keyframes pulse-ring {
          0% {
            transform: translate(-50%, -50%) scale(0.9);
            opacity: 0.4;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.3);
            opacity: 0;
          }
        }
        
        @keyframes shake {
          0%, 100% { transform: rotate(-5deg); }
          50% { transform: rotate(5deg); }
        }
        
        @keyframes bounce-slight {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
