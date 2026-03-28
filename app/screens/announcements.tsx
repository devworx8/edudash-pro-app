import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';

const PARENT_ROLES = new Set(['parent', 'guardian', 'sponsor']);

export default function LegacyAnnouncementsRoute() {
  const { profile, profileLoading, loading } = useAuth();

  // Wait for profile to load before deciding which screen to show
  if (loading || profileLoading || !profile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const role = String(profile?.role || '').toLowerCase().trim();

  if (PARENT_ROLES.has(role)) {
    return <Redirect href="/screens/parent-announcements" />;
  }

  return <Redirect href="/screens/principal-announcement" />;
}

