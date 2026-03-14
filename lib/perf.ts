/**
 * Lightweight performance measurement utilities
 * 
 * Used to track app startup, navigation, and other critical performance metrics
 * without adding significant overhead to the runtime bundle.
 */

import React from 'react';

const marks = new Map<string, number>();

/**
 * Mark a performance timestamp
 */
export function mark(name: string): void {
  try {
    const timestamp = (global.performance && global.performance.now) 
      ? global.performance.now() 
      : Date.now();
    marks.set(name, timestamp);
  } catch {
    // Silently fail if performance API is unavailable
  }
}

/**
 * Measure duration between marks or from a specific mark to now
 */
export function measure(name: string, startMark?: string): { name: string; duration: number } {
  try {
    const now = (global.performance && global.performance.now) 
      ? global.performance.now() 
      : Date.now();
    const start = marks.get(startMark || name) || now;
    const duration = now - start;
    return { name, duration };
  } catch {
    return { name, duration: 0 };
  }
}

/**
 * Time an async operation. If sentryOp is provided, wraps in a Sentry span.
 */
export async function timeAsync<T>(
  name: string, 
  fn: () => Promise<T>,
  sentryOp?: string,
): Promise<{ result: T; duration: number }> {
  if (sentryOp) {
    try {
      const { traceOperation } = await import('@/lib/monitoring');
      const start = (global.performance?.now) ? global.performance.now() : Date.now();
      const result = await traceOperation(sentryOp, name, fn);
      const duration = ((global.performance?.now) ? global.performance.now() : Date.now()) - start;
      return { result, duration };
    } catch {
      // Fall through to untraced version
    }
  }
  mark(name);
  const result = await fn();
  const { duration } = measure(name);
  return { result, duration };
}

/**
 * Development-only performance timing with console output
 */
export const devTimer = {
  start: (label: string): (() => void) | undefined => {
    if (!__DEV__) return undefined;
    
    const startTime = performance.now();
    console.time(label);
    
    return () => {
      const endTime = performance.now();
      console.timeEnd(label);
      console.log(`⚡ Performance: ${label} took ${(endTime - startTime).toFixed(2)}ms`);
    };
  }
};

/**
 * Measure React component render time
 */
export function measureRender<T extends Record<string, any>>(
  Component: React.ComponentType<T>, 
  displayName?: string
) {
  if (!__DEV__) return Component;

  const MeasuredComponent = (props: T) => {
    const componentName = displayName || Component.displayName || Component.name || 'Component';
    const endTimer = devTimer.start(`Render: ${componentName}`);
    
    React.useLayoutEffect(() => {
      endTimer?.();
    });

    return React.createElement(Component, props);
  };

  MeasuredComponent.displayName = `Measured(${displayName || Component.displayName || Component.name})`;
  return MeasuredComponent;
}

/**
 * Track navigation performance
 */
export function trackNavigation(screenName: string, startTime: number) {
  try {
    const duration = Date.now() - startTime;
    
    if (__DEV__) {
      console.log(`🧭 Navigation to ${screenName}: ${duration}ms`);
    }
    
    // Import analytics lazily to avoid circular dependencies
    import('@/lib/analytics').then(({ track }) => {
      track('edudash.nav.transition', {
        screen: screenName,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      });
    }).catch(() => {
      // Analytics not available, ignore
    });
  } catch {
    // Silently fail
  }
}

/**
 * Initialize performance monitoring
 */
export function initPerformanceMonitoring() {
  mark('app_start');
  
  // Track when the app becomes interactive
  if (typeof global !== 'undefined') {
    const checkInteractive = () => {
      const { duration } = measure('app_ready', 'app_start');
      
      if (__DEV__) {
        console.log(`🚀 App ready in ${duration.toFixed(2)}ms`);
      }
      
      // Report cold start to Sentry as a span
      import('@/lib/monitoring').then(({ trackPerformance }) => {
        trackPerformance('app.cold_start', duration, {
          platform: require('react-native').Platform.OS,
        });
      }).catch(() => {});

      // Track cold start performance
      import('@/lib/analytics').then(({ track }) => {
        track('edudash.app.cold_start', {
          duration_ms: duration,
          platform: require('react-native').Platform.OS,
          version: require('expo-constants').default?.expoConfig?.version || 'unknown',
          timestamp: new Date().toISOString(),
        });
      }).catch(() => {
        // Analytics not available, ignore
      });
    };

    // Use different timing strategies based on platform
    if (require('react-native').InteractionManager) {
      require('react-native').InteractionManager.runAfterInteractions(checkInteractive);
    } else {
      setTimeout(checkInteractive, 100);
    }
  }
}