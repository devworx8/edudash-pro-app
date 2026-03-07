/**
 * Performance Optimization Utilities
 * Provides lazy loading, code splitting, and caching helpers
 */

import { lazy, ComponentType } from 'react';

/**
 * Lazy load a component with better error handling and loading state
 */
export function lazyLoad<T extends ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>,
  fallback?: React.ReactNode
) {
  const LazyComponent = lazy(importFunc);
  
  return {
    Component: LazyComponent,
    fallback: fallback || null,
  };
}

/**
 * Preload a lazy-loaded component
 * Useful for components you know will be needed soon
 */
export function preloadComponent<T>(
  importFunc: () => Promise<{ default: ComponentType<T> }>
) {
  // Trigger the import but don't wait for it
  importFunc().catch((error) => {
    console.warn('Failed to preload component:', error);
  });
}

/**
 * Cache API responses in session storage
 */
export class ResponseCache {
  private static prefix = 'edudash_cache_';
  
  static set(key: string, data: any, ttlMs: number = 5 * 60 * 1000) {
    try {
      const item = {
        data,
        expiry: Date.now() + ttlMs,
      };
      sessionStorage.setItem(this.prefix + key, JSON.stringify(item));
    } catch (error) {
      console.warn('Failed to cache response:', error);
    }
  }
  
  static get<T>(key: string): T | null {
    try {
      const cached = sessionStorage.getItem(this.prefix + key);
      if (!cached) return null;
      
      const item = JSON.parse(cached);
      if (Date.now() > item.expiry) {
        sessionStorage.removeItem(this.prefix + key);
        return null;
      }
      
      return item.data as T;
    } catch (error) {
      console.warn('Failed to retrieve cached response:', error);
      return null;
    }
  }
  
  static clear(key?: string) {
    if (key) {
      sessionStorage.removeItem(this.prefix + key);
    } else {
      // Clear all EduDash caches
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith(this.prefix)) {
          sessionStorage.removeItem(k);
        }
      });
    }
  }
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return function executedFunction(...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), waitMs);
  };
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limitMs);
    }
  };
}

/**
 * Lazy load images with Intersection Observer
 */
export function lazyLoadImage(img: HTMLImageElement) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const target = entry.target as HTMLImageElement;
        const src = target.dataset.src;
        if (src) {
          target.src = src;
          target.removeAttribute('data-src');
        }
        observer.unobserve(target);
      }
    });
  });
  
  observer.observe(img);
  return () => observer.unobserve(img);
}

/**
 * Prefetch data for a route
 */
export async function prefetchRoute(route: string) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = route;
      document.head.appendChild(link);
    });
  }
}

/**
 * Service Worker registration for PWA
 */
export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    
    console.log('Service Worker registered successfully');
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

/**
 * Check if content should be cached based on size
 */
export function shouldCache(data: any): boolean {
  try {
    const size = new Blob([JSON.stringify(data)]).size;
    // Don't cache items larger than 100KB
    return size < 100 * 1024;
  } catch {
    return false;
  }
}
