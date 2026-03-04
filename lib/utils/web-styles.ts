/**
 * Web-Only Style Injection Utilities
 * 
 * Injects CSS to:
 * - Hide Expo development navigation headers on web
 * - Ensure full viewport height for React Native Web
 * - Dynamically hide white navigation headers that slip through
 * 
 * All DOM access is guarded for RNW compatibility without "dom" lib.
 */

import { Platform } from 'react-native';

/**
 * Injects web-specific styles and sets up dynamic element hiding
 * Returns cleanup function to remove styles and observers
 * 
 * Features:
 * - Hides Expo dev client navigation
 * - Ensures 100vh minimum height for all app containers
 * - Dynamically hides white headers with "screens" text
 * - Uses MutationObserver to catch dynamically rendered headers
 * 
 * @returns Cleanup function to remove injected styles and disconnect observers
 */
export const injectWebStyles = (): (() => void) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return () => {}; // No-op on non-web platforms
  }

  // Main style element for hiding Expo dev navigation
  const style = document.createElement('style');
  style.setAttribute('data-edudash-web-nav-hide', 'true');
  style.textContent = `
    /* Hide all Expo development navigation and headers */
    .__expo-nav,
    .expo-web-dev-navigation,
    .expo-dev-navigation,
    .expo-router-dev-navigation,
    [data-expo-web-navigation],
    .expo-web-navigation,
    .expo-dev-header,
    .expo-web-header,
    .expo-router-header,
    .expo-dev-nav,
    .expo-navigation-header {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      opacity: 0 !important;
    }
    
    /* Hide any white fixed headers */
    [style*="background-color: white"][style*="position: fixed"],
    [style*="background-color: rgb(255, 255, 255)"][style*="position: fixed"],
    [style*="background: white"][style*="position: fixed"],
    [style*="background: rgb(255, 255, 255)"][style*="position: fixed"] {
      display: none !important;
    }
    
    /* Hide development screens navigation */
    .expo-router-screens-nav,
    [data-expo-screens-nav],
    .screens-navigation,
    .dev-screens-header {
      display: none !important;
      visibility: hidden !important;
    }
    
    /* Hide specific white header elements */
    .css-view-g5y9jx.r-borderBottomWidth-qklmqi.r-flex-13awgt0.r-pointerEvents-105ug2t,
    [style*="background-color: rgb(255, 255, 255)"][style*="border-bottom-color: rgb(216, 216, 216)"],
    [class*="css-view"][class*="r-borderBottomWidth"][class*="r-flex"][style*="background-color: rgb(255, 255, 255)"],
    [class*="css-view"][style*="background-color: rgb(255, 255, 255); border-bottom-color: rgb(216, 216, 216)"] {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
      opacity: 0 !important;
    }
    
    /* Target React Native Web generated header classes */
    [class*="r-borderBottomWidth"][class*="r-flex"][style*="background-color: rgb(255, 255, 255)"],
    [class*="r-borderBottomWidth-qklmqi"][class*="r-flex-13awgt0"] {
      display: none !important;
    }
    
    /* Target the specific header with back button and "screens" text */
    [style*="background-color: rgb(255, 255, 255)"]:has([aria-label="Go back"]),
    [style*="background-color: white"]:has(button),
    div:has(> button[aria-label="Go back"]) {
      display: none !important;
      height: 0 !important;
    }
    
    /* Hide any element containing "screens" text in navigation context */
    *:has-text("screens"),
    [role="navigation"]:has-text("screens"),
    header:has-text("screens") {
      display: none !important;
    }
    
    /* More targeted Expo Router header hiding */
    .expo-router-header:not([data-settings-screen]),
    [data-expo-router-header]:not([data-settings-screen]) {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
    }
    
    /* Force full height for main content */
    #root,
    .expo-root,
    .expo-app-container {
      height: 100vh !important;
      min-height: 100vh !important;
    }
    
    /* Protect settings screen from being hidden */
    .settings-screen,
    [data-settings-screen="true"] {
      display: flex !important;
      visibility: visible !important;
      height: auto !important;
      opacity: 1 !important;
    }
    
    /* Allow natural display for settings content */
    .settings-screen *,
    [data-settings-screen="true"] * {
      visibility: visible !important;
      opacity: 1 !important;
    }
    
    /* Hide back/forward buttons in development */
    .expo-dev-buttons,
    .expo-router-buttons,
    [data-expo-dev-buttons] {
      display: none !important;
    }
  `;
  document.head.appendChild(style);

  // Global layout styles for full viewport height + hide scrollbars on web
  const globalStyle = document.createElement('style');
  globalStyle.setAttribute('data-edudash-web-layout', 'true');
  globalStyle.textContent = `
    /* Hide all scrollbars on web (keep scrolling behavior) */
    * {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    *::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
    
    /* Ensure all app containers have full viewport height on web */
    #root, .expo-root, .expo-app-container, [data-reactroot], body, html {
      min-height: 100vh !important;
      height: 100%;
      width: 100%;
    }
    
    /* Ensure all React Native View containers fill viewport */
    [data-focusable="true"], [role="main"], main {
      min-height: 100vh;
    }
    
    /* Force all top-level Views to fill height */
    #root > div, .expo-root > div, .expo-app-container > div {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    /* Ensure ScrollViews display content properly */
    [data-focusable="true"][style*="flex: 1"] {
      min-height: 100vh;
    }
    
    /* Mobile responsive styles - hide sidebar on small screens */
    @media (max-width: 767px) {
      /* Force single column layout on mobile */
      .desktop-sidebar,
      [data-desktop-sidebar="true"] {
        display: none !important;
        width: 0 !important;
      }
      
      /* Ensure main content fills width on mobile */
      .desktop-main-content,
      [data-desktop-main="true"] {
        width: 100% !important;
        flex: 1 !important;
      }
      
      /* Reset flex direction for mobile */
      .desktop-layout-container {
        flex-direction: column !important;
      }
    }
  `;
  document.head.appendChild(globalStyle);

  /**
   * Dynamically hides Expo dev navigation elements that slip through CSS
   * Targets selectors and specific patterns (white headers with "screens" text)
   */
  const hideElements = () => {
    if (typeof document === 'undefined') return;

    // Hide by selector
    const selectors = [
      '.__expo-nav',
      '.expo-web-dev-navigation',
      '.expo-dev-navigation',
      '.expo-router-dev-navigation',
      '[data-expo-web-navigation]',
      '.expo-web-navigation',
      '.expo-dev-header',
      '.expo-web-header',
      '.expo-router-header',
      '.expo-dev-nav',
      '.expo-navigation-header',
      '.expo-router-screens-nav',
      '[data-expo-screens-nav]',
      '.screens-navigation',
      '.dev-screens-header',
      '[data-expo-router-header]',
      '.react-navigation-header',
      '[data-react-navigation-header]',
    ];

    selectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        (el as HTMLElement).style.display = 'none';
        (el as HTMLElement).style.visibility = 'hidden';
        (el as HTMLElement).style.height = '0';
      });
    });

    // Hide white headers with "screens" text (dev navigation)
    const allDivs = document.querySelectorAll('div');
    allDivs.forEach((div) => {
      // Skip elements inside protected areas (settings screen)
      if (
        div.closest('[data-settings-screen]') ||
        div.closest('.settings-screen')
      ) {
        return;
      }

      if (typeof window === 'undefined') return;

      const style = window.getComputedStyle(div);
      const hasWhiteBackground =
        style.backgroundColor === 'rgb(255, 255, 255)' ||
        style.backgroundColor === 'white';
      const hasScreensText = div.textContent?.trim() === 'screens';

      // Only hide if it's clearly a navigation header (not app content)
      if (hasWhiteBackground && hasScreensText && div.children.length < 3) {
        (div as HTMLElement).style.display = 'none';
        (div as HTMLElement).style.visibility = 'hidden';
        (div as HTMLElement).style.height = '0';
      }
    });

    // Hide elements with "screens" text in navigation context
    const elementsWithScreensText = document.querySelectorAll('*');
    elementsWithScreensText.forEach((el) => {
      if (
        el.textContent?.trim() === 'screens' &&
        el.closest('header, nav, [role="navigation"]')
      ) {
        const parent = el.closest('div, header, nav') as HTMLElement;
        if (parent) {
          parent.style.display = 'none';
          parent.style.visibility = 'hidden';
          parent.style.height = '0';
        }
      }
    });
  };

  // Run immediately
  hideElements();

  // Observe DOM changes to catch dynamically rendered headers
  const observer = new MutationObserver(hideElements);
  observer.observe(document.body, { childList: true, subtree: true });

  // Additional aggressive hiding after a delay (for late-rendered elements)
  const delayedHideTimeout = setTimeout(() => {
    hideElements();

    // Try to find and remove the header with "screens" text by traversing up
    const headers = document.querySelectorAll('*');
    headers.forEach((el) => {
      if (
        el.textContent === 'screens' ||
        el.textContent?.trim() === 'screens'
      ) {
        let parent = el.parentElement;
        while (parent && typeof window !== 'undefined') {
          const style = window.getComputedStyle(parent);
          if (
            style.backgroundColor === 'rgb(255, 255, 255)' ||
            style.backgroundColor === 'white'
          ) {
            (parent as HTMLElement).style.display = 'none';
            break;
          }
          parent = parent.parentElement;
        }
      }
    });
  }, 100);

  // Continuous monitoring (aggressive approach for stubborn headers)
  const continuousHiding = setInterval(() => {
    hideElements();
  }, 500);

  if (__DEV__) {
    console.log('[WebStyles] Injected web-specific styles and element hiding');
  }

  // Cleanup function
  return () => {
    if (typeof document === 'undefined') return;

    if (document.head.contains(style)) {
      document.head.removeChild(style);
    }
    if (document.head.contains(globalStyle)) {
      document.head.removeChild(globalStyle);
    }
    observer.disconnect();
    clearTimeout(delayedHideTimeout);
    clearInterval(continuousHiding);

    if (__DEV__) {
      console.log('[WebStyles] Cleaned up web-specific styles and observers');
    }
  };
};
