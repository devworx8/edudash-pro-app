'use client';

import { useEffect, useState } from 'react';

/**
 * Detects if the app is running as an installed PWA
 * Returns true if running in standalone mode (installed)
 */
export function useIsPWA() {
  const [isPWA, setIsPWA] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsLoading(false);
      return;
    }

    // Check multiple indicators for PWA/installed state
    const isStandalone = 
      // Standard PWA display mode
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari standalone mode
      (window.navigator as any).standalone === true ||
      // Check if opened from home screen (Android/Chrome)
      document.referrer.includes('android-app://');

    setIsPWA(isStandalone);
    setIsLoading(false);

    // Listen for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsPWA(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return { isPWA, isLoading };
}
