/**
 * Centralized auth redirect URLs for forgot-password and email-change flows.
 * Pure functions for testability; callers pass platform and optional web origin.
 */

import { buildEduDashWebUrl } from '@/lib/config/urls';

export type AuthRedirectPlatform = 'web' | 'ios' | 'android';

const NATIVE_RESET_REDIRECT = 'edudashpro://auth-callback?type=recovery';
const NATIVE_EMAIL_CHANGE_REDIRECT = buildEduDashWebUrl('/landing?flow=email-change');

/**
 * Redirect URL for Supabase resetPasswordForEmail (forgot-password flow).
 * Web: goes to auth-callback so we can extract tokens and open reset UI.
 * Native: custom scheme so the app opens directly; auth-callback handles recovery.
 */
export function getPasswordResetRedirectUrl(
  platform: AuthRedirectPlatform,
  webOrigin?: string
): string {
  if (platform === 'web' && webOrigin) {
    return `${webOrigin}/auth-callback?type=recovery`;
  }
  return NATIVE_RESET_REDIRECT;
}

/**
 * Redirect URL for Supabase updateUser({ email }, { emailRedirectTo }) (email-change flow).
 * Web: landing with flow=email-change on same origin.
 * Native: production landing URL so the confirmation link opens in browser, then user returns to app.
 */
export function getEmailChangeRedirectUrl(
  platform: AuthRedirectPlatform,
  webOrigin?: string
): string {
  if (platform === 'web' && webOrigin) {
    return `${webOrigin}/landing?flow=email-change`;
  }
  return NATIVE_EMAIL_CHANGE_REDIRECT;
}
