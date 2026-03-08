import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { track } from '@/lib/analytics';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';
import AdBanner from './AdBanner';
import SubscriptionAdGate from './SubscriptionAdGate';

interface AdBannerWithUpgradeProps {
  /**
   * Screen identifier for analytics tracking
   */
  screen: string;
  /**
   * Whether to show the upgrade CTA below the banner
   */
  showUpgradeCTA?: boolean;
  /**
   * Custom style for the container
   */
  containerStyle?: any;
  /**
   * Custom margin/padding
   */
  margin?: number;
}

/**
 * AdBannerWithUpgrade - Combines AdBanner with optional upgrade CTA
 * 
 * This component handles:
 * - Banner ad display (gated by subscription tier)
 * - Optional "Remove ads — Upgrade" CTA
 * - Analytics tracking for upgrade clicks
 * - Consistent styling across the app
 * 
 * Usage:
 * ```tsx
 * <AdBannerWithUpgrade 
 *   screen="teacher_dashboard" 
 *   showUpgradeCTA={true}
 *   margin={8}
 * />
 * ```
 */
export default function AdBannerWithUpgrade({
  screen,
  showUpgradeCTA = true,
  containerStyle,
  margin = 8,
}: AdBannerWithUpgradeProps) {
  const { tier } = useSubscription();
  const { theme, isDark } = useTheme();

  const handleUpgradePress = () => {
    track('ads.upgrade_cta_clicked', {
      screen,
      tier,
      from: 'banner_upgrade_cta',
    });

    navigateToUpgrade({
      source: 'ad_banner_upgrade',
      reason: 'feature_needed',
    });
  };

  return (
    <SubscriptionAdGate>
      <View style={[styles.container, { marginVertical: margin }, containerStyle]}>
        {/* Banner Ad */}
        <AdBanner />

        {/* Upgrade CTA */}
        {showUpgradeCTA && (
          <TouchableOpacity
            style={styles.upgradeCTA}
            onPress={handleUpgradePress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Remove ads by upgrading to a paid plan"
          >
            <Text style={[styles.upgradeText, { color: isDark ? '#00f5ff' : theme.primary }]}>
              Remove ads — Upgrade
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SubscriptionAdGate>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginHorizontal: 16,
  },
  upgradeCTA: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  upgradeText: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.8,
  },
});
