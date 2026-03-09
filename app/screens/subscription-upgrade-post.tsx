import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ROUTE_SUBSCRIPTION_SETUP } from '@/lib/upgrade/upgradeRoutes';

const normalizeReason = (reason?: string): string | undefined => {
  if (!reason) return undefined;
  if (reason === 'analytics' || reason === 'premium_feature') return 'feature_needed';
  if (reason === 'ai_progress' || reason.includes('limit') || reason.includes('quota')) return 'limit_reached';
  return reason;
};

const takeFirst = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
  if (value == null) return undefined;
  const text = String(value);
  return text.length > 0 ? text : undefined;
};

export default function SubscriptionUpgradePostRedirect() {
  const params = useLocalSearchParams();

  useEffect(() => {
    const normalizedParams: Record<string, string> = {};
    const reason = normalizeReason(takeFirst(params.reason));
    const source = takeFirst(params.source) || 'legacy_upgrade_post';

    for (const [key, value] of Object.entries(params)) {
      const text = takeFirst(value);
      if (text) normalizedParams[key] = text;
    }

    normalizedParams.source = source;
    if (reason) normalizedParams.reason = reason;

    router.replace({
      pathname: ROUTE_SUBSCRIPTION_SETUP as any,
      params: normalizedParams,
    });
  }, [params]);

  return null;
}
