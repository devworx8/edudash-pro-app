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

  return (
    <View style={[styles.usageBanner, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        {tierStatus.quotaLimit > 0 ? (
          <CircularQuotaRing
            used={tierStatus.quotaUsed}
            limit={tierStatus.quotaLimit}
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
          <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 1 }}>{usageLabel}</Text>
        </View>
      </View>
      {tierStatus.quotaLimit > 0 ? (
        <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textTertiary }}>
          {Math.round(tierStatus.quotaPercentage)}% used this month
        </Text>
      ) : null}
    </View>
  );
};
