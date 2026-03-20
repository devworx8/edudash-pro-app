import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function SignUpAlias() {
  const params = useLocalSearchParams<{
    planTier?: string;
    billing?: 'monthly' | 'annual';
    inviteCode?: string;
  }>();

  useEffect(() => {
    // Forward plan context to role-selection for choosing registration type
    const nextParams: any = {};
    if (params?.planTier) nextParams.planTier = String(params.planTier);
    if (params?.billing) nextParams.billing = params.billing === 'annual' ? 'annual' : 'monthly';
    if (params?.inviteCode) nextParams.inviteCode = params.inviteCode;

    // Route to role selection for new users
    router.replace({ pathname: '/(auth)/role-selection' as any, params: nextParams } as any);
  }, [params?.planTier, params?.billing, params?.inviteCode]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0a0a0f',
      }}
    >
      <EduDashSpinner color="#00f5ff" />
    </View>
  );
}
