/**
 * Extended Navigator interface with Badge API and Wake Lock API support
 */

interface WakeLockSentinel extends EventTarget {
  /** Whether the wake lock has been released */
  readonly released: boolean;
  /** The type of wake lock */
  readonly type: 'screen';
  /** Release the wake lock */
  release: () => Promise<void>;
}

interface WakeLock {
  /** Request a wake lock of the specified type */
  request: (type: 'screen') => Promise<WakeLockSentinel>;
}

// Extend the global Navigator interface
declare global {
  interface Navigator {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
    wakeLock?: WakeLock;
  }
}

export type { WakeLockSentinel, WakeLock };
