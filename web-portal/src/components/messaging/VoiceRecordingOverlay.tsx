'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Trash2, Send, ChevronUp, Lock } from 'lucide-react';

interface VoiceRecordingOverlayProps {
  isRecording: boolean;
  recordingDuration: number;
  onCancel: () => void;
  onSend: () => void;
  onLock: () => void;
  isLocked: boolean;
}

const formatDuration = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Waveform animation component
const RecordingWaveform = () => {
  const bars = 24;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
      height: '32px',
    }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          style={{
            width: '3px',
            borderRadius: '2px',
            background: 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)',
            animation: `waveform-bar 0.8s ease-in-out infinite`,
            animationDelay: `${i * 0.05}s`,
            height: '40%',
          }}
        />
      ))}
    </div>
  );
};

export const VoiceRecordingOverlay = ({
  isRecording,
  recordingDuration,
  onCancel,
  onSend,
  onLock,
  isLocked,
}: VoiceRecordingOverlayProps) => {
  const [slideOffset, setSlideOffset] = useState(0);
  const [slideUpOffset, setSlideUpOffset] = useState(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset offsets when not recording
  useEffect(() => {
    if (!isRecording) {
      setSlideOffset(0);
      setSlideUpOffset(0);
    }
  }, [isRecording]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isLocked) return;
    isDraggingRef.current = true;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
  }, [isLocked]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current || isLocked) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = startXRef.current - currentX;
    const diffY = startYRef.current - currentY;

    // Slide left to cancel
    if (diffX > 0) {
      setSlideOffset(Math.min(diffX, 150));
    }

    // Slide up to lock
    if (diffY > 0) {
      setSlideUpOffset(Math.min(diffY, 100));
    }
  }, [isLocked]);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    // Cancel if slid far enough
    if (slideOffset > 100) {
      onCancel();
    }
    // Lock if slid up far enough
    else if (slideUpOffset > 60) {
      onLock();
    }

    setSlideOffset(0);
    setSlideUpOffset(0);
  }, [slideOffset, slideUpOffset, onCancel, onLock]);

  if (!isRecording) return null;

  const cancelOpacity = Math.min(slideOffset / 100, 1);
  const lockOpacity = Math.min(slideUpOffset / 60, 1);

  return (
    <>
      {/* Inject keyframes animation */}
      <style>{`
        @keyframes waveform-bar {
          0%, 100% { height: 20%; }
          50% { height: ${Math.random() * 60 + 40}%; }
        }
        @keyframes pulse-recording {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        @keyframes slide-hint {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-8px); }
        }
      `}</style>
      
      {/* Main Recording Overlay */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
          backdropFilter: 'blur(20px)',
          padding: '16px',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          borderTop: '1px solid rgba(239, 68, 68, 0.3)',
          transform: `translateX(-${slideOffset}px) translateY(-${slideUpOffset}px)`,
          transition: isDraggingRef.current ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {/* Slide up to lock indicator */}
        {!isLocked && (
          <div style={{
            position: 'absolute',
            top: '-60px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            opacity: slideUpOffset > 0 ? lockOpacity : 0.5,
            transition: 'opacity 0.2s ease',
          }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: slideUpOffset > 60 
                ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' 
                : 'rgba(139, 92, 246, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid rgba(139, 92, 246, 0.5)',
              transition: 'background 0.2s ease',
            }}>
              <Lock size={20} color="#fff" />
            </div>
            <ChevronUp size={16} color="rgba(139, 92, 246, 0.8)" style={{ animation: 'slide-hint 1s ease-in-out infinite' }} />
          </div>
        )}

        {/* Slide to cancel indicator (left side) */}
        {!isLocked && (
          <div style={{
            position: 'absolute',
            left: '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: cancelOpacity > 0 ? 1 : 0.6,
            color: cancelOpacity > 0.8 ? '#ef4444' : 'rgba(239, 68, 68, 0.7)',
            transition: 'color 0.2s ease',
          }}>
            <Trash2 size={20} />
            <span style={{ 
              fontSize: '13px', 
              fontWeight: 500,
              animation: cancelOpacity === 0 ? 'slide-hint 1.5s ease-in-out infinite' : 'none',
            }}>
              {'< Slide to cancel'}
            </span>
          </div>
        )}

        {/* Recording controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isLocked ? 'space-between' : 'flex-end',
          gap: '16px',
        }}>
          {/* Cancel button (when locked) */}
          {isLocked && (
            <button
              onClick={onCancel}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Trash2 size={22} color="#ef4444" />
            </button>
          )}

          {/* Center section: Timer and waveform */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            flex: isLocked ? 1 : undefined,
          }}>
            {/* Recording indicator and timer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#ef4444',
                animation: 'pulse-recording 1s ease-in-out infinite',
                boxShadow: '0 0 12px rgba(239, 68, 68, 0.5)',
              }} />
              <span style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#fff',
                fontVariantNumeric: 'tabular-nums',
                minWidth: '48px',
              }}>
                {formatDuration(recordingDuration)}
              </span>
            </div>

            {/* Waveform */}
            <RecordingWaveform />
          </div>

          {/* Mic/Send button */}
          {isLocked ? (
            <button
              onClick={onSend}
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(59, 130, 246, 0.4)',
              }}
            >
              <Send size={24} color="#fff" />
            </button>
          ) : (
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)',
              animation: 'pulse-recording 1s ease-in-out infinite',
            }}>
              <Mic size={28} color="#fff" />
            </div>
          )}
        </div>

        {/* Instructions */}
        {!isLocked && (
          <p style={{
            textAlign: 'center',
            fontSize: '12px',
            color: 'rgba(148, 163, 184, 0.8)',
            marginTop: '12px',
          }}>
            Release to send • Slide up to lock • Slide left to cancel
          </p>
        )}
      </div>
    </>
  );
};
