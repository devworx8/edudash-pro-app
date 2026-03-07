'use client';

import { useDeploymentNotifications } from '@/hooks/useDeploymentNotifications';

/**
 * Provider component that subscribes users to deployment notifications
 * This enables push notifications when new versions are deployed
 */
export function DeploymentNotificationProvider() {
  useDeploymentNotifications();
  return null; // This is a logic-only component
}
