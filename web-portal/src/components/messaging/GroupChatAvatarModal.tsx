'use client';

import { MessageCircle, Phone, Video, X } from 'lucide-react';

export interface GroupChatAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Display name of the user whose avatar was clicked */
  userName: string;
  /** User id for starting calls or finding DM thread */
  userId: string;
  onMessage: (userId: string, userName: string) => void;
  onVoiceCall: (userId: string, userName: string) => void;
  onVideoCall: (userId: string, userName: string) => void;
}

export function GroupChatAvatarModal({
  isOpen,
  onClose,
  userName,
  userId,
  onMessage,
  onVoiceCall,
  onVideoCall,
}: GroupChatAvatarModalProps) {
  if (!isOpen) return null;

  const handleMessage = () => {
    onMessage(userId, userName);
    onClose();
  };
  const handleVoice = () => {
    onVoiceCall(userId, userName);
    onClose();
  };
  const handleVideo = () => {
    onVideoCall(userId, userName);
    onClose();
  };

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 10000,
        }}
      />
      <div
        role="dialog"
        aria-label="Contact options"
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(320px, calc(100vw - 32px))',
          background: 'var(--surface-1)',
          borderRadius: 16,
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          zIndex: 10001,
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)' }}>
            {userName || 'Contact'}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 8 }}>
          <button
            type="button"
            onClick={handleMessage}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 12,
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 15,
              textAlign: 'left',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--surface-2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MessageCircle size={20} color="white" />
            </div>
            <span>Message</span>
          </button>
          <button
            type="button"
            onClick={handleVoice}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 12,
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 15,
              textAlign: 'left',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--surface-2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Phone size={20} color="white" />
            </div>
            <span>Voice call</span>
          </button>
          <button
            type="button"
            onClick={handleVideo}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 12,
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 15,
              textAlign: 'left',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--surface-2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Video size={20} color="white" />
            </div>
            <span>Video call</span>
          </button>
        </div>
      </div>
    </>
  );
}
