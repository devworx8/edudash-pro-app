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
    <View style={[styles.usageBanner, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        {safeLimit > 0 ? (
          <CircularQuotaRing
            used={safeUsed}
            limit={safeLimit}
            size={40}
            strokeWidth={4}
            showPercentage
            percentageMode="used"
          />
        ) : (
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.primary + '1f',
            }}
          >
            <Ionicons name="sparkles-outline" size={12} color={theme.primary} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.usageBannerText, { color: theme.text, flex: 0 }]}>
              {tierStatus.tierDisplayName}
            </Text>
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 2,
                backgroundColor: theme.surfaceVariant,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textSecondary }}>
                AI USAGE
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 1 }}>{resolvedUsageLabel}</Text>
        </View>
      </View>
      {safeLimit > 0 ? (
        <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textTertiary }}>
          {Math.round(safePercentUsed)}% used this month
        </Text>
      ) : null}
    </View>
  );
};
