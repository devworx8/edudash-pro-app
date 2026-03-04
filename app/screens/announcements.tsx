import React from 'react';
import { Redirect } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';

const PARENT_ROLES = new Set(['parent', 'guardian', 'sponsor']);

export default function LegacyAnnouncementsRoute() {
  const role = String(useAuth().profile?.role || '').toLowerCase().trim();

  if (PARENT_ROLES.has(role)) {
    return <Redirect href="/screens/parent-announcements" />;
  }

  return <Redirect href="/screens/principal-announcement" />;
}

