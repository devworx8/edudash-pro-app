/**
 * Canonical upgrade destinations for the app.
 * Use these so all "upgrade" / "quota exhausted" CTAs go to the same place.
 *
 * Post–Play Store: primary CTA = subscription-setup (in-app upgrade flow).
 * Use /pricing only when we want "compare plans" (e.g. marketing).
 */

import { router } from 'expo-router';

/** In-app subscription/checkout flow (PayFast, plan selection). */
export const ROUTE_SUBSCRIPTION_SETUP = '/screens/subscription-setup';

/** Public pricing page (compare plans, no auth required). */
export const ROUTE_PRICING = '/pricing';

/** Post-upgrade / thank-you screen. */
export const ROUTE_SUBSCRIPTION_UPGRADE_POST = '/screens/subscription-upgrade-post';

/**
 * Navigate to the primary upgrade flow (subscription setup).
 * Use for: quota exhausted, "Upgrade" buttons, tier-gated feature prompts.
 */
export function navigateToUpgrade(options?: {
  planId?: string;
  source?: string;
  reason?: string;
  billing?: 'monthly' | 'annual';
}): void {
  const params: Record<string, string> = {};
  if (options?.planId) params.planId = options.planId;
  if (options?.source) params.source = options.source;
  if (options?.reason) params.reason = options.reason;
  if (options?.billing) params.billing = options.billing;
  if (Object.keys(params).length > 0) {
    router.push({ pathname: ROUTE_SUBSCRIPTION_SETUP, params } as never);
  } else {
    router.push(ROUTE_SUBSCRIPTION_SETUP as never);
  }
}

/**
 * Navigate to the public pricing page (e.g. "View plans" for unauthenticated or compare).
 */
export function navigateToPricing(): void {
  router.push(ROUTE_PRICING as never);
}
