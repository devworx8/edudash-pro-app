/**
 * PWA Utilities for Mobile Web Gating
 * 
 * Provides device detection, route classification, and PWA meta tag injection
 * for mobile-web gating strategy. All DOM access is guarded for React Native Web
 * compatibility without "dom" lib in tsconfig.
 */

import { Platform } from 'react-native';

/**
 * Detects if the current device is a mobile phone (excludes tablets)
 * Uses both user agent and viewport width for detection
 * 
 * @returns true if mobile phone, false otherwise
 */
export const isMobilePhone = (): boolean => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  const ua = (window.navigator?.userAgent || '').toLowerCase();

  // Tablet detection (UA keywords + width threshold)
  const isTabletUA = /ipad|tablet|playbook/.test(ua);
  const isWide = (window.innerWidth || 0) >= 768;
  const isTablet = isTabletUA || isWide;

  // Phone detection
  const isMobileUA = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/.test(ua);

  return isMobileUA && !isTablet;
};

/**
 * Detects if the current device is a tablet
 * Uses both user agent keywords and viewport width (≥768px)
 * 
 * @returns true if tablet, false otherwise
 */
export const isTablet = (): boolean => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  const ua = (window.navigator?.userAgent || '').toLowerCase();
  const isTabletUA = /ipad|tablet|playbook/.test(ua);
  const isWide = (window.innerWidth || 0) >= 768;

  return isTabletUA || isWide;
};

/**
 * Detects if the app is running in standalone PWA mode
 * Works for both Android (display-mode: standalone) and iOS (navigator.standalone)
 * 
 * @returns true if running as installed PWA, false otherwise
 */
export const isStandalonePWA = (): boolean => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  // Android/Chrome PWA detection via matchMedia
  const mm = (window as any).matchMedia?.('(display-mode: standalone)');
  const isStandaloneMM = !!mm?.matches;

  // iOS PWA detection via navigator.standalone
  const isIOSStandalone = (window.navigator as any)?.standalone === true;

  return isStandaloneMM || isIOSStandalone;
};

/**
 * Checks if a given pathname is a public route that doesn't require PWA installation
 * 
 * Public routes include:
 * - Landing pages (/, /landing)
 * - Authentication routes (sign-in, sign-up, auth-callback)
 * - Legal pages (privacy-policy, terms-of-service)
 * - Marketing pages (pricing, sales)
 * - Invite flows
 * - PWA install page itself
 * 
 * @param pathname - Current route pathname
 * @returns true if public route, false if protected
 */
export const isPublicRoute = (pathname: string | null): boolean => {
  if (!pathname) return true;

  // Allow static assets and API resources (PWA, icons, locales, service worker)
  const staticAssetPatterns = [
    '/manifest.json',
    '/sw.js',
    '/icons/',
    '/locales/',
    '/assets/',
    '/_expo/',
    '/fonts/',
    '/images/',
    '.json',  // Allow any JSON file (locale files, etc.)
    '.png',
    '.jpg',
    '.svg',
    '.woff',
    '.woff2',
    '.ttf',
  ];

  // Check if pathname is a static asset
  const isStaticAsset = staticAssetPatterns.some((pattern) =>
    pathname.includes(pattern)
  );

  if (isStaticAsset) return true;

  // Public route prefixes allowed on mobile web without PWA
  const publicPrefixes = [
    '/',
    '/landing',
    '/pwa-install',
    '/sign-in',
    '/sign-up',
    '/auth-callback',
    '/verify-your-email',
    '/privacy-policy',
    '/terms-of-service',
    '/pricing',
    '/sales',
    '/marketing',
    '/invite',
  ];

  // Check for exact match or prefix match (e.g., /pricing/details)
  const pathMatches = publicPrefixes.some((prefix) =>
    pathname === prefix || pathname.startsWith(prefix + '/')
  );

  // Check for Expo Router route groups
  const startsWithAuthGroup = pathname.startsWith('/(auth)');
  const startsWithPublicGroup = pathname.startsWith('/(public)');

  return pathMatches || startsWithAuthGroup || startsWithPublicGroup;
};

/**
 * Checks if mobile web guard is enabled via feature flag
 * Default: enabled (can be disabled via EXPO_PUBLIC_MOBILE_WEB_GUARD=0)
 * 
 * @returns true if guard is enabled, false otherwise
 */
export const isMobileWebGuardEnabled = (): boolean => {
  const flag = (process.env.EXPO_PUBLIC_MOBILE_WEB_GUARD || '1').trim();
  return flag !== '0' && flag.toLowerCase() !== 'false';
};

/**
 * Injects PWA meta tags into document head (web only)
 * Idempotent - safe to call multiple times
 * 
 * Adds:
 * - manifest.json link
 * - theme-color meta
 * - Apple PWA support tags (apple-mobile-web-app-capable, etc.)
 * - Apple touch icon
 */
export const setupPWAMetaTags = (): void => {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const ensureTag = (selector: string, create: () => HTMLElement): HTMLElement => {
    let el = document.querySelector(selector) as HTMLElement | null;
    if (!el) {
      el = create();
      document.head.appendChild(el);
    }
    return el;
  };

  // Manifest link
  ensureTag('link[rel="manifest"]', () => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'manifest');
    link.setAttribute('href', '/manifest.json');
    return link;
  });

  // Theme color (app background)
  ensureTag('meta[name="theme-color"]', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#0a0a0f');
    return meta;
  });

  // iOS PWA: Enable full-screen mode
  ensureTag('meta[name="apple-mobile-web-app-capable"]', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'apple-mobile-web-app-capable');
    meta.setAttribute('content', 'yes');
    return meta;
  });

  // iOS PWA: Status bar style
  ensureTag('meta[name="apple-mobile-web-app-status-bar-style"]', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
    meta.setAttribute('content', 'black-translucent');
    return meta;
  });

  // iOS PWA: App title
  ensureTag('meta[name="apple-mobile-web-app-title"]', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'apple-mobile-web-app-title');
    meta.setAttribute('content', 'EduDash Pro');
    return meta;
  });

  // Apple touch icon
  ensureTag('link[rel="apple-touch-icon"]', () => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'apple-touch-icon');
    link.setAttribute('href', '/icons/icon-192.png');
    return link;
  });

  if (__DEV__) {
    console.log('[PWA] Meta tags configured successfully');
  }
};
