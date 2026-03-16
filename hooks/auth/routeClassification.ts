/**
 * Route Classification Helpers
 *
 * Pure functions for classifying route types used by useRouteGuard.
 * Extracted to keep the hook under the 200-line WARP limit.
 */

import { resolveIsRecoveryFlow } from '@/lib/auth/recoveryFlow';
import { isPasswordRecoveryInProgress } from '@/lib/sessionManager';

/**
 * Auth route patterns — pages that unauthenticated users should see.
 * Using `startsWith('/(auth)')` covers the entire auth group reliably.
 */
const AUTH_ROUTE_EXACT = new Set(['/', '/landing']);

const AUTH_ROUTE_SEGMENTS = [
  '/(auth)',
  'sign-in',
  'sign-up',
  'signup',
  '/register',
  'forgot-password',
  'reset-password',
  'auth-callback',
  '/verify',
] as const;

export function isAuthRoute(pathname: string | undefined): boolean {
  if (typeof pathname !== 'string') return false;
  if (AUTH_ROUTE_EXACT.has(pathname)) return true;
  return AUTH_ROUTE_SEGMENTS.some((seg) =>
    seg.startsWith('/') ? pathname.startsWith(seg) : pathname.includes(seg)
  );
}

export function isAuthCallbackRoute(pathname: string | undefined): boolean {
  return typeof pathname === 'string' && pathname.includes('auth-callback');
}

export function isProfilesGateRoute(pathname: string | undefined): boolean {
  return typeof pathname === 'string' && pathname.includes('profiles-gate');
}

export function isOnboardingRoute(pathname: string | undefined): boolean {
  return (
    typeof pathname === 'string' &&
    (pathname === '/onboarding' || pathname.startsWith('/onboarding/'))
  );
}

export function isOrgAdminFamilyRoute(pathname: string | undefined): boolean {
  return (
    typeof pathname === 'string' &&
    (pathname === '/screens/org-admin-dashboard' ||
      pathname.startsWith('/screens/org-admin/') ||
      pathname.startsWith('/screens/admin-tertiary'))
  );
}

export interface SearchParams {
  type?: string | string[];
  flow?: string | string[];
  addAccount?: string | string[];
  switch?: string | string[];
  fresh?: string | string[];
  [key: string]: string | string[] | undefined;
}

/** Normalise a search param that may be an array. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Returns true when account-switch intent is explicit in query params. */
export function isAccountSwitchIntent(params: SearchParams): boolean {
  return (
    firstParam(params.addAccount) === '1' ||
    firstParam(params.switch) === '1'
  );
}

/** Returns true when the current flow is a password-recovery flow. */
export function checkRecoveryFlow(params: SearchParams): boolean {
  return resolveIsRecoveryFlow({
    type: firstParam(params.type),
    flow: firstParam(params.flow),
    hasRecoveryFlag: isPasswordRecoveryInProgress(),
  });
}
