'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

interface OfflineIndicatorProps {
  /** Custom message to display when offline */
  message?: string;
  /** Whether to show the indicator at the top or bottom */
  position?: 'top' | 'bottom';
  /** Duration in ms to show "back online" message before hiding */
  onlineMessageDuration?: number;
}

/**
 * Component that shows an indicator when the user is offline.
 * Automatically detects online/offline status using navigator.onLine and events.
 */
export function OfflineIndicator({
  message = "You're offline. Some features may be unavailable.",
  position = 'top',
  onlineMessageDuration = 3000,
}: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [showOnlineMessage, setShowOnlineMessage] = useState(false);
  const [hasBeenOffline, setHasBeenOffline] = useState(false);

  useEffect(() => {
    // Check initial status
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
    }

    const handleOnline = () => {
      setIsOnline(true);
      if (hasBeenOffline) {
        setShowOnlineMessage(true);
        // Hide the "back online" message after a delay
        setTimeout(() => {
          setShowOnlineMessage(false);
        }, onlineMessageDuration);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setHasBeenOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [hasBeenOffline, onlineMessageDuration]);

  // Don't render anything if online and no message to show
  if (isOnline && !showOnlineMessage) {
    return null;
  }

  const positionStyles = position === 'top' 
    ? { top: 0, paddingTop: 'max(env(safe-area-inset-top), 8px)' }
    : { bottom: 0, paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        fixed left-0 right-0 z-50 px-4 py-2
        transition-all duration-300 ease-in-out
        animate-in slide-in-from-top-2
      `}
      style={positionStyles}
    >
      <div
        className={`
          max-w-md mx-auto rounded-lg px-4 py-3 flex items-center gap-3
          shadow-lg backdrop-blur-sm
          ${isOnline 
            ? 'bg-green-900/90 border border-green-700/50 text-green-100' 
            : 'bg-amber-900/90 border border-amber-700/50 text-amber-100'
          }
        `}
      >
        {isOnline ? (
          <>
            <Wifi className="w-5 h-5 flex-shrink-0 text-green-400" />
            <span className="text-sm font-medium">Back online!</span>
          </>
        ) : (
          <>
            <WifiOff className="w-5 h-5 flex-shrink-0 text-amber-400" />
            <span className="text-sm font-medium">{message}</span>
          </>
        )}
      </div>
    </div>
  );
}

export default OfflineIndicator;
