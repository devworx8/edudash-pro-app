'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface UseBackButtonOptions {
  /** Custom handler for back button. Return true to prevent default navigation */
  onBack?: () => boolean | void;
  /** Fallback route if at root of navigation stack */
  fallbackRoute?: string;
  /** List of routes that should not trigger logout on back */
  protectedRoutes?: string[];
}

/**
 * Hook to handle Android hardware back button and browser back navigation.
 * Prevents logout when user is on dashboard and presses back.
 */
export function useBackButton(options: UseBackButtonOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  
  const {
    onBack,
    fallbackRoute,
    protectedRoutes = ['/dashboard/parent', '/dashboard/teacher', '/dashboard/principal'],
  } = options;

  const handleBackButton = useCallback((event: PopStateEvent) => {
    // Check if custom handler wants to override
    if (onBack) {
      const shouldPrevent = onBack();
      if (shouldPrevent) {
        // Push current state back to prevent navigation
        window.history.pushState(null, '', window.location.href);
        return;
      }
    }

    // Check if we're on a dashboard root and should prevent going back to login
    const isOnDashboardRoot = protectedRoutes.some(route => pathname === route);
    
    if (isOnDashboardRoot) {
      console.log('[BackButton] On dashboard root, preventing back navigation');
      // Prevent going back by pushing the current state again
      window.history.pushState(null, '', window.location.href);
      
      // If fallback route provided, navigate there instead
      if (fallbackRoute) {
        router.push(fallbackRoute);
      }
      return;
    }

    // Check if we're on a child route and should go to parent dashboard
    const dashboardMatch = pathname?.match(/^(\/dashboard\/\w+)/);
    if (dashboardMatch) {
      const dashboardRoot = dashboardMatch[1];
      const isChildRoute = pathname !== dashboardRoot;
      
      if (isChildRoute) {
        // Navigate to dashboard root instead of random back navigation
        event.preventDefault();
        router.push(dashboardRoot);
        return;
      }
    }
  }, [pathname, onBack, fallbackRoute, protectedRoutes, router]);

  useEffect(() => {
    // Push initial state to enable popstate detection
    window.history.pushState(null, '', window.location.href);

    // Listen for back button
    window.addEventListener('popstate', handleBackButton);

    return () => {
      window.removeEventListener('popstate', handleBackButton);
    };
  }, [handleBackButton]);

  // Return function to programmatically go back
  const goBack = useCallback(() => {
    const dashboardMatch = pathname?.match(/^(\/dashboard\/\w+)/);
    if (dashboardMatch) {
      const dashboardRoot = dashboardMatch[1];
      if (pathname !== dashboardRoot) {
        router.push(dashboardRoot);
      }
    } else {
      router.back();
    }
  }, [pathname, router]);

  return { goBack };
}
