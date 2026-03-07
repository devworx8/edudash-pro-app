'use client';

import { useState, useEffect } from 'react';
import { Bell, X, BellRing, Settings, AlertTriangle } from 'lucide-react';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';

interface PushNotificationPromptProps {
  onDismiss?: () => void;
}

/**
 * A floating prompt to enable push notifications
 * Shows only when:
 * - Push is supported
 * - Permission hasn't been denied
 * - User hasn't subscribed yet
 * - User hasn't dismissed the prompt recently
 * 
 * Enhanced UX features:
 * - Explains why notifications are useful
 * - Handles "denied" state with browser settings instructions
 * - Better visual feedback during subscription
 */
export function PushNotificationPrompt({ onDismiss }: PushNotificationPromptProps) {
  const { supported, permission, subscribed, subscribe, loading } = usePushNotifications({ autoSubscribe: false });
  const [visible, setVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [showDeniedHelp, setShowDeniedHelp] = useState(false);

  useEffect(() => {
    // Check if we should show the prompt
    if (!supported || subscribed || loading) {
      setVisible(false);
      return;
    }

    // Show denied help if permission was denied
    if (permission === 'denied') {
      // Check if user hasn't dismissed the denied help recently
      const deniedHelpDismissed = localStorage.getItem('push-denied-help-dismissed');
      if (deniedHelpDismissed) {
        const dismissedAt = new Date(deniedHelpDismissed);
        const daysSince = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 30) {
          setVisible(false);
          return;
        }
      }
      setShowDeniedHelp(true);
      setVisible(true);
      return;
    }

    // Check if user has already enabled notifications (permission granted)
    if (permission === 'granted') {
      setVisible(false);
      return;
    }

    // Check if user has dismissed recently (within 7 days)
    const dismissed = localStorage.getItem('push-prompt-dismissed');
    if (dismissed) {
      const dismissedAt = new Date(dismissed);
      const daysSince = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        setVisible(false);
        return;
      }
    }
    
    // Check if user clicked "enable" before (even if subscription failed)
    const enableClicked = localStorage.getItem('push-enable-clicked');
    if (enableClicked) {
      setVisible(false);
      return;
    }

    // Show prompt after a delay
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [supported, permission, subscribed, loading]);

  const handleEnable = async () => {
    setSubscribing(true);
    
    // Mark that user clicked enable (so we don't show again even if subscription fails)
    localStorage.setItem('push-enable-clicked', new Date().toISOString());
    
    const success = await subscribe();
    setSubscribing(false);
    
    if (success) {
      setVisible(false);
    } else {
      // Even if subscription failed, hide the prompt since user attempted
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    if (showDeniedHelp) {
      localStorage.setItem('push-denied-help-dismissed', new Date().toISOString());
    } else {
      localStorage.setItem('push-prompt-dismissed', new Date().toISOString());
    }
    setVisible(false);
    onDismiss?.();
  };

  const handleOpenSettings = () => {
    // Show instructions based on browser
    const userAgent = navigator.userAgent.toLowerCase();
    let instructions = '';
    
    if (userAgent.includes('chrome')) {
      instructions = 'Click the lock icon in the address bar → Site settings → Notifications → Allow';
    } else if (userAgent.includes('firefox')) {
      instructions = 'Click the shield icon in the address bar → Clear permission for Notifications → Refresh the page';
    } else if (userAgent.includes('safari')) {
      instructions = 'Safari → Preferences → Websites → Notifications → Allow for this website';
    } else if (userAgent.includes('edge')) {
      instructions = 'Click the lock icon in the address bar → Permissions → Notifications → Allow';
    } else {
      instructions = 'Check your browser settings to enable notifications for this website';
    }
    
    alert(instructions);
  };

  if (!visible) return null;

  // Denied permission help state
  if (showDeniedHelp) {
    return (
      <div
        className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-300"
        role="alert"
      >
        <div className="bg-gradient-to-br from-amber-900 to-orange-900 border border-amber-700 rounded-2xl p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-800/50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white text-sm mb-1">
                Notifications Blocked
              </h3>
              <p className="text-amber-200/80 text-xs leading-relaxed mb-3">
                You previously blocked notifications. To enable them, update your browser settings.
              </p>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenSettings}
                  className="flex-1 py-2 px-4 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  How to Enable
                </button>
                <button
                  onClick={handleDismiss}
                  className="py-2 px-3 text-amber-300 hover:text-white hover:bg-amber-800/50 text-sm rounded-lg transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="text-amber-500 hover:text-amber-300 transition-colors -mt-1 -mr-1"
              aria-label="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-300"
      role="alert"
    >
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <BellRing className="w-6 h-6 text-white" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm mb-1">
              Stay Connected
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed mb-3">
              Get instant alerts for messages, video calls, homework updates, and important announcements from teachers.
            </p>
            
            <div className="flex items-center gap-2">
              <button
                onClick={handleEnable}
                disabled={subscribing}
                className="flex-1 py-2 px-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {subscribing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enabling...
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4" />
                    Enable Notifications
                  </>
                )}
              </button>
              <button
                onClick={handleDismiss}
                className="py-2 px-3 text-slate-400 hover:text-white hover:bg-slate-700/50 text-sm rounded-lg transition-colors"
              >
                Later
              </button>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="text-slate-500 hover:text-slate-300 transition-colors -mt-1 -mr-1"
            aria-label="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
