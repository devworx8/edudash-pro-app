// Route file to handle edudashpro://subscription-upgrade deep link
// This redirects to the actual subscription upgrade screen

import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ROUTE_SUBSCRIPTION_SETUP } from '@/lib/upgrade/upgradeRoutes';

export default function SubscriptionUpgradeRedirect() {
  const params = useLocalSearchParams();

  useEffect(() => {
    // Redirect to the canonical subscription setup screen with all params preserved
    router.replace({
      pathname: ROUTE_SUBSCRIPTION_SETUP as any,
      params: params as Record<string, string>
    });
  }, [params]);

  // Return null since this is just a redirect
  return null;
}
