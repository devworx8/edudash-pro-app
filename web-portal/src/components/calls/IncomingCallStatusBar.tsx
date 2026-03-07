'use client';

import { Phone, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface IncomingCallStatusBarProps {
  callerName?: string;
  appName?: string;
  onAnswer: () => void;
  onReject: () => void;
  isVisible: boolean;
}

/**
 * Status bar notification for incoming calls
 * Shows a compact banner at the top of the screen that can work even when app is backgrounded
 */
export function IncomingCallStatusBar({
  callerName = 'Unknown',
  appName = 'EduDash Pro',
  onAnswer,
  onReject,
  isVisible,
}: IncomingCallStatusBarProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isVisible) {
      // Trigger slide-in animation
      setTimeout(() => setIsAnimating(true), 10);
      
      // Request notification permission if not granted
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      
      // Show browser notification as fallback
      if ('Notification' in window && Notification.permission === 'granted') {
        const notificationOptions: NotificationOptions & { vibrate?: number[] } = {
          body: `${callerName} is calling...`,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'incoming-call',
          requireInteraction: true,
          vibrate: [500, 200, 500],
        };
        
        const notification = new Notification(`${appName} - Incoming Call`, notificationOptions);
        
        notification.onclick = () => {
          window.focus();
          onAnswer();
          notification.close();
        };
        
        // Auto-close notification when call is rejected
        return () => {
          notification.close();
        };
      }
    } else {
      setIsAnimating(false);
    }
  }, [isVisible, appName, callerName, onAnswer]);

  if (!isVisible) return null;

  return (
    <>
      {/* Overlay to prevent interaction with page */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
          backdropFilter: 'blur(4px)',
        }}
        onClick={onReject}
      />

      {/* Status bar notification */}
      <div
        style={{
          position: 'fixed',
          top: isAnimating ? 0 : -100,
          left: 0,
          right: 0,
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          padding: 'max(env(safe-area-inset-top), 12px) 16px 12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          transition: 'top 0.3s ease-out',
        }}
      >
        {/* Phone icon with pulse animation */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        >
          <Phone size={20} color="white" />
        </div>

        {/* Call info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(255, 255, 255, 0.9)',
              fontWeight: 500,
              marginBottom: 2,
            }}
          >
            {appName}
          </div>
          <div
            style={{
              fontSize: 14,
              color: 'white',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {callerName}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(255, 255, 255, 0.8)',
            }}
          >
            Incoming call...
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Reject button */}
          <button
            onClick={onReject}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.9)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <X size={24} color="white" />
          </button>

          {/* Answer button */}
          <button
            onClick={onAnswer}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'white',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              transition: 'transform 0.2s ease',
              animation: 'bounce 1s ease-in-out infinite',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <Phone size={24} color="#22c55e" />
          </button>
        </div>
      </div>

      {/* Animations */}
      <style jsx global>{`
        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.8;
          }
        }

        @keyframes bounce {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }
      `}</style>
    </>
  );
}
