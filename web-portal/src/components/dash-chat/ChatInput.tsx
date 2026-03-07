/**
 * Chat Input Component
 * WARP.md compliant: ≤200 lines
 * 
 * Handles text input, camera, voice recording, and send actions
 */

'use client';

import { useRef, useEffect, useState } from 'react';
import { Send, Camera, Mic, Square, Loader2 } from 'lucide-react';
import {
  useVoiceRecording,
  formatDuration,
  blobToBase64,
  type VoiceDictationProbe,
} from '@/hooks/useVoiceRecording';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  onSend: (text?: string, voiceData?: { blob: Blob; base64: string; probe?: VoiceDictationProbe }) => Promise<void>;
  onCameraClick: () => void;
  selectedImagesCount: number;
}

export function ChatInput({
  input,
  setInput,
  isLoading,
  onSend,
  onCameraClick,
  selectedImagesCount,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { state: voiceState, startRecording, stopRecording, isSupported } = useVoiceRecording();
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [showPermissionError, setShowPermissionError] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      const newHeight = Math.min(inputRef.current.scrollHeight, 150);
      inputRef.current.style.height = newHeight + 'px';
    }
  }, [input]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (input.trim() || selectedImagesCount > 0) {
      // Clear input immediately for better UX
      const textToSend = input;
      setInput('');
      await onSend(textToSend);
    }
  };

  const handleVoiceToggle = async () => {
    if (voiceState.isRecording) {
      // Stop recording and send
      setIsSendingVoice(true);
      const probeBase: VoiceDictationProbe = {
        ...(voiceState.probe || { platform: 'web', source: 'dash_chat_web' }),
        platform: 'web',
        source: 'dash_chat_web',
      };
      const blob = await stopRecording();
      if (blob) {
        try {
          const base64 = await blobToBase64(blob);
          await onSend(undefined, {
            blob,
            base64,
            probe: {
              ...probeBase,
              final_transcript_at: new Date().toISOString(),
            },
          });
        } catch (error) {
          console.error('Error sending voice:', error);
        }
      }
      setIsSendingVoice(false);
    } else {
      // Start recording
      setShowPermissionError(false);
      const success = await startRecording();
      if (!success && voiceState.error) {
        setShowPermissionError(true);
        setTimeout(() => setShowPermissionError(false), 5000);
      }
    }
  };

  const isDisabled = isLoading || isSendingVoice;
  const hasContent = (input.trim().length > 0) || selectedImagesCount > 0;
  const showMicButton = !hasContent && !voiceState.isRecording;
  const showSendButton = hasContent && !voiceState.isRecording;
  const showStopButton = voiceState.isRecording;

  return (
    <div className="flex-shrink-0 border-t border-gray-800 bg-gray-950 z-20" style={{
      paddingTop: '12px',
      paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
      paddingLeft: 'max(1rem, env(safe-area-inset-left))',
      paddingRight: 'max(1rem, env(safe-area-inset-right))',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)'
    }}>
      <div className="w-full max-w-4xl mx-auto flex gap-2 items-end">
        {/* Text Input Container */}
        <div style={{ 
          flex: 1,
          position: 'relative',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: '24px',
          display: 'flex',
          alignItems: 'flex-end',
          minHeight: 44,
          transition: 'all 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          paddingLeft: hasContent || voiceState.isRecording ? '14px' : '8px',
          paddingRight: '8px',
          paddingTop: '8px',
          paddingBottom: '8px',
          gap: '8px'
        }}
        onFocusCapture={(e) => {
          e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.15)';
        }}
        onBlurCapture={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        }}
        >
          {/* Camera Button - Hidden when typing or recording */}
          {!hasContent && !voiceState.isRecording && (
            <button
              onClick={onCameraClick}
              disabled={isDisabled}
              style={{
                width: 28,
                height: 28,
                padding: 0,
                borderRadius: '50%',
                background: 'transparent',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: isDisabled ? 0.5 : 0.7
              }}
              onMouseEnter={(e) => !isDisabled && (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => !isDisabled && (e.currentTarget.style.opacity = '0.7')}
              title="Attach image"
              aria-label="Attach image"
            >
              <Camera size={20} color="var(--muted)" />
            </button>
          )}

          {/* Recording indicator or text input */}
          {voiceState.isRecording ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--text)',
              fontSize: '14px'
            }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#ef4444',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
              <span style={{ fontWeight: 500 }}>
                Recording... {formatDuration(voiceState.duration)}
              </span>
            </div>
          ) : (
            <textarea
              ref={inputRef}
              data-chat-input="true"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Message Dash (include grade & subject if you can)..."
              disabled={isDisabled}
              style={{ 
                flex: 1,
                height: 'auto',
                minHeight: '28px',
                maxHeight: '150px',
                padding: 0,
                fontSize: '16px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text)',
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: '1.4',
                outline: 'none',
                overflowY: 'auto',
                fontWeight: 400,
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(124, 58, 237, 0.3) transparent'
              }}
              rows={1}
            />
          )}
        </div>

        {/* Dynamic Voice/Send Button - Single button that switches */}
        <button
          onClick={showSendButton ? handleSend : handleVoiceToggle}
          disabled={isDisabled || (showMicButton && !isSupported)}
          style={{ 
            width: 44,
            height: 44,
            padding: 0,
            border: 'none',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            cursor: (isDisabled || (showMicButton && !isSupported)) ? 'not-allowed' : 'pointer',
            opacity: (isDisabled || (showMicButton && !isSupported)) ? 0.4 : 1,
            background: showStopButton
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : showMicButton && !isSupported
              ? 'var(--muted)'
              : 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
            transition: 'all 0.3s ease',
            boxShadow: showStopButton 
              ? '0 0 20px rgba(239, 68, 68, 0.5), 0 0 40px rgba(239, 68, 68, 0.3)'
              : '0 0 20px rgba(124, 58, 237, 0.4), 0 0 40px rgba(236, 72, 153, 0.2)',
            animation: (isDisabled || (showMicButton && !isSupported)) ? 'none' : 'glow-pulse 2s ease-in-out infinite'
          }}
          onMouseEnter={(e) => {
            if (!isDisabled && (showSendButton || showStopButton || (showMicButton && isSupported))) {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.4)';
              if (showSendButton) {
                e.currentTarget.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #f472b6 100%)';
              }
            }
          }}
          onMouseLeave={(e) => {
            if (!isDisabled && (showSendButton || showStopButton || (showMicButton && isSupported))) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(124, 58, 237, 0.3)';
              if (showSendButton || showMicButton) {
                e.currentTarget.style.background = 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)';
              }
            }
          }}
          onMouseDown={(e) => {
            if (!isDisabled && (showSendButton || showStopButton || (showMicButton && isSupported))) {
              e.currentTarget.style.transform = 'scale(0.95)';
            }
          }}
          onMouseUp={(e) => {
            if (!isDisabled && (showSendButton || showStopButton || (showMicButton && isSupported))) {
              e.currentTarget.style.transform = 'scale(1.05)';
            }
          }}
          title={showStopButton ? 'Stop recording' : showSendButton ? 'Send message' : 'Record voice message'}
          aria-label={showStopButton ? 'Stop recording' : showSendButton ? 'Send message' : 'Record voice message'}
        >
          {isLoading || isSendingVoice ? (
            <Loader2 size={18} className="spin" color="white" />
          ) : showStopButton ? (
            <Square size={18} color="white" fill="white" />
          ) : showSendButton ? (
            <Send size={18} color="white" />
          ) : (
            <Mic size={18} color="white" />
          )}
        </button>
      </div>

      {/* Permission Error Notification */}
      {showPermissionError && voiceState.error && (
        <div style={{
          position: 'fixed',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '90%',
          width: '400px',
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          fontSize: '14px',
          fontWeight: 500,
          textAlign: 'center',
          animation: 'slideDown 0.3s ease-out'
        }}>
          {voiceState.error.includes('Permission denied') || voiceState.error.includes('NotAllowedError')
            ? '🎤 Microphone access denied. Please allow microphone permission in your browser settings.'
            : voiceState.error.includes('NotFoundError')
            ? '🎤 No microphone found. Please connect a microphone and try again.'
            : `🎤 ${voiceState.error}`
          }
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        @keyframes glow-pulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(124, 58, 237, 0.4), 0 0 40px rgba(236, 72, 153, 0.2);
          }
          50% {
            box-shadow: 0 0 25px rgba(124, 58, 237, 0.6), 0 0 50px rgba(236, 72, 153, 0.35);
          }
        }
      `}</style>
    </div>
  );
}
