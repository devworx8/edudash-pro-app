'use client';

import { useEffect, useState, useCallback } from 'react';

type OrientationType = 'portrait' | 'portrait-primary' | 'portrait-secondary' | 
                       'landscape' | 'landscape-primary' | 'landscape-secondary' |
                       'natural' | 'any';

interface UseOrientationLockOptions {
  /** Default orientation to lock to */
  defaultOrientation?: OrientationType;
  /** Whether to allow manual override */
  allowUserOverride?: boolean;
}

interface OrientationLockState {
  /** Current orientation */
  orientation: OrientationType | null;
  /** Whether orientation is currently locked */
  isLocked: boolean;
  /** Whether orientation lock is supported */
  isSupported: boolean;
  /** Whether lock is from user preference */
  isUserPreference: boolean;
  /** Lock to a specific orientation */
  lock: (orientation: OrientationType) => Promise<boolean>;
  /** Unlock orientation (allow auto-rotate) */
  unlock: () => Promise<boolean>;
  /** Toggle between locked and unlocked */
  toggle: () => Promise<boolean>;
  /** Get current device orientation */
  getCurrentOrientation: () => OrientationType | null;
}

/**
 * Hook for managing screen orientation lock
 * Provides native app-like orientation control
 */
export function useOrientationLock(
  options: UseOrientationLockOptions = {}
): OrientationLockState {
  const { defaultOrientation = 'portrait', allowUserOverride = true } = options;

  const [isLocked, setIsLocked] = useState(false);
  const [currentOrientation, setCurrentOrientation] = useState<OrientationType | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isUserPreference, setIsUserPreference] = useState(false);

  // Check support and initialize
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if screen orientation API is supported
    const supported = 'screen' in window && 
      'orientation' in window.screen && 
      typeof (window.screen.orientation as any)?.lock === 'function';

    setIsSupported(supported);

    // Get current orientation
    const updateOrientation = () => {
      if (window.screen.orientation) {
        const type = window.screen.orientation.type;
        setCurrentOrientation(type as OrientationType);
      } else if (window.orientation !== undefined) {
        // Fallback for older browsers
        const angle = window.orientation;
        if (angle === 0 || angle === 180) {
          setCurrentOrientation('portrait');
        } else {
          setCurrentOrientation('landscape');
        }
      }
    };

    updateOrientation();

    // Listen for orientation changes
    if (window.screen.orientation) {
      window.screen.orientation.addEventListener('change', updateOrientation);
    } else {
      window.addEventListener('orientationchange', updateOrientation);
    }

    // Check for user preference in storage
    // NOTE: Orientation lock only works in fullscreen mode on most browsers
    // So we don't auto-lock - we just track the state for when fullscreen is entered
    try {
      const userPref = localStorage.getItem('orientation-lock-preference');
      if (userPref) {
        setIsUserPreference(true);
        const { locked } = JSON.parse(userPref);
        // Just track the preference state, don't try to lock
        // Locking will fail unless in fullscreen mode
        setIsLocked(locked);
      }
    } catch {
      // localStorage access failed (private mode, etc.), continue without preferences
    }

    return () => {
      if (window.screen.orientation) {
        window.screen.orientation.removeEventListener('change', updateOrientation);
      } else {
        window.removeEventListener('orientationchange', updateOrientation);
      }
    };
  }, [defaultOrientation]);

  /**
   * Lock screen to specific orientation
   */
  const lock = useCallback(async (orientation: OrientationType): Promise<boolean> => {
    if (typeof window === 'undefined' || !isSupported) {
      return false;
    }

    try {
      await (window.screen.orientation as any).lock(orientation);
      setIsLocked(true);
      
      if (allowUserOverride) {
        try {
          localStorage.setItem('orientation-lock-preference', JSON.stringify({
            locked: true,
            orientation,
          }));
          setIsUserPreference(true);
        } catch {
          // Storage access failed, continue without saving preference
        }
      }
      
      return true;
    } catch (e) {
      console.warn('[OrientationLock] Lock failed:', e);
      return false;
    }
  }, [isSupported, allowUserOverride]);

  /**
   * Unlock orientation (allow auto-rotate)
   */
  const unlock = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !isSupported) {
      return false;
    }

    try {
      window.screen.orientation.unlock();
      setIsLocked(false);
      
      if (allowUserOverride) {
        try {
          localStorage.setItem('orientation-lock-preference', JSON.stringify({
            locked: false,
            orientation: null,
          }));
          setIsUserPreference(true);
        } catch {
          // Storage access failed, continue without saving preference
        }
      }
      
      return true;
    } catch (e) {
      console.warn('[OrientationLock] Unlock failed:', e);
      return false;
    }
  }, [isSupported, allowUserOverride]);

  /**
   * Toggle between locked and unlocked
   */
  const toggle = useCallback(async (): Promise<boolean> => {
    if (isLocked) {
      return unlock();
    } else {
      return lock(defaultOrientation);
    }
  }, [isLocked, lock, unlock, defaultOrientation]);

  /**
   * Get current device orientation
   */
  const getCurrentOrientation = useCallback((): OrientationType | null => {
    if (typeof window === 'undefined') return null;
    
    if (window.screen.orientation) {
      return window.screen.orientation.type as OrientationType;
    } else if (window.orientation !== undefined) {
      const angle = window.orientation;
      return (angle === 0 || angle === 180) ? 'portrait' : 'landscape';
    }
    
    return null;
  }, []);

  return {
    orientation: currentOrientation,
    isLocked,
    isSupported,
    isUserPreference,
    lock,
    unlock,
    toggle,
    getCurrentOrientation,
  };
}

/**
 * Imperative functions for orientation control (non-hook usage)
 */

export async function lockOrientation(orientation: OrientationType = 'portrait'): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  if (!('screen' in window) || 
      !('orientation' in window.screen) || 
      typeof (window.screen.orientation as any)?.lock !== 'function') {
    return false;
  }

  try {
    await (window.screen.orientation as any).lock(orientation);
    return true;
  } catch (e) {
    console.warn('[OrientationLock] Lock failed:', e);
    return false;
  }
}

export function unlockOrientation(): boolean {
  if (typeof window === 'undefined') return false;
  
  if (!('screen' in window) || 
      !('orientation' in window.screen) || 
      typeof window.screen.orientation?.unlock !== 'function') {
    return false;
  }

  try {
    window.screen.orientation.unlock();
    return true;
  } catch (e) {
    console.warn('[OrientationLock] Unlock failed:', e);
    return false;
  }
}
