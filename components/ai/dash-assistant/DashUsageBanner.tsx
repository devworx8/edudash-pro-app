/**
 * DashUsageBanner Component
 * 
 * Usage quota banner with progress bar for Dash AI Assistant.
 * Extracted from DashAssistant for WARP.md compliance.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { CircularQuotaRing } from '@/components/ui/CircularQuotaRing';

type Theme = ReturnType<typeof useTheme>['theme'];

interface TierStatus {
  quotaLimit: number;
  quotaUsed: number;
  quotaPercentage: number;
  tierDisplayName: string;
}

interface DashUsageBannerProps {
  tierStatus: TierStatus | null;
  usageLabel: string;
  styles: any;
  theme: Theme;
}

export const DashUsageBanner: React.FC<DashUsageBannerProps> = ({
  tierStatus,
  usageLabel,
  styles,
  theme,
}) => {
  if (!tierStatus) return null;
  const safeLimit = Number.isFinite(tierStatus.quotaLimit) ? Math.max(0, tierStatus.quotaLimit) : 0;
  const safeUsed = Number.isFinite(tierStatus.quotaUsed) ? Math.max(0, tierStatus.quotaUsed) : 0;
  const safePercentUsed = safeLimit > 0
    ? Math.min(100, Math.max(0, (safeUsed / safeLimit) * 100))
    : 0;
  const resolvedUsageLabel = safeLimit > 0
    ? `${safeUsed}/${safeLimit} used this month`
    : usageLabel;

  return (
    <View style={[styles.usageBanner, { borderColor: theme.border, backgroundColor: theme.surface, flexDirection: 'row', alignItems: 'center' }]}>
      {safeLimit > 0 ? (
        <CircularQuotaRing
          used={safeUsed}
          limit={safeLimit}
          size={28}
          strokeWidth={3}
          showPercentage={false}
          percentageMode="used"
        />
      ) : (
        <Ionicons name="sparkles-outline" size={12} color={theme.primary} />
      )}
      <Text style={[styles.usageBannerText, { color: theme.text, marginLeft: 6 }]} numberOfLines={1}>
        {tierStatus.tierDisplayName}
      </Text>
      <Text style={{ fontSize: 11, color: theme.textSecondary }} numberOfLines={1}>
        {resolvedUsageLabel}
      </Text>
    </View>
  );
};
