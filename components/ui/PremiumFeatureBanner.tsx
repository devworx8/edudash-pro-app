import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAds } from '@/contexts/AdsContext';
import { track } from '@/lib/analytics';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface PremiumFeatureBannerProps {
  /**
   * Title of the feature that requires premium
   */
  featureName: string;
  
  /**
   * Description of what the user gets with premium
   */
  description: string;
  
  /**
   * Screen identifier for analytics
   */
  screen: string;
  
  /**
   * Custom icon to display
   */
  icon?: keyof typeof Ionicons.glyphMap;
  
  /**
   * Whether to show as a full-screen blocking banner or inline banner
   */
  variant?: 'fullscreen' | 'inline';
  
  /**
   * Custom style for the container
   */
  containerStyle?: any;

  /**
   * Callback when back/close is pressed (for fullscreen variant)
   */
  onClose?: () => void;

  /**
   * Callback when user earns a free trial via rewarded ad
   * If provided, enables the "Watch Ad for Free Trial" button
   */
  onRewardedUnlock?: () => void;
}

/**
 * PremiumFeatureBanner - Shows upgrade prompt for premium-only features
 * 
 * This component handles:
 * - Premium feature blocking UI
 * - Analytics tracking for upgrade clicks
 * - Consistent styling across the app
 * - Fullscreen or inline display variants
 * 
 * Usage:
 * ```tsx
 * // Fullscreen blocking banner
 * <PremiumFeatureBanner 
 *   featureName="AI Lesson Generator" 
 *   description="Generate personalized lessons with AI assistance"
 *   screen="ai-lesson-generator"
 *   variant="fullscreen"
 *   onClose={() => router.back()}
 * />
 * 
 * // Inline banner
 * <PremiumFeatureBanner 
 *   featureName="Advanced Analytics" 
 *   description="Get detailed insights into student performance"
 *   screen="analytics"
 *   variant="inline"
 * />
 * ```
 */
export default function PremiumFeatureBanner({
  featureName,
  description,
  screen,
  icon = 'star',
  variant = 'fullscreen',
  containerStyle,
  onClose,
  onRewardedUnlock,
}: PremiumFeatureBannerProps) {
  const { theme, isDark } = useTheme();
  const { tier } = useSubscription();
  const { profile } = useAuth();
  const { offerRewarded, canShowBanner } = useAds();
  const [isLoadingAd, setIsLoadingAd] = useState(false);
  
  // Role-aware tier naming
  const isParent = profile?.role === 'parent';
  const tierName = isParent ? 'Plus' : 'Premium';

  // Check if rewarded ads are available (Android only, free tier)
  const canShowRewardedAd = canShowBanner && Platform.OS === 'android' && onRewardedUnlock;

  const handleUpgradePress = () => {
    track('premium.upgrade_clicked', {
      screen,
      feature: featureName,
      current_tier: tier,
      source: 'feature_banner',
      variant,
    });

    navigateToUpgrade({
      source: 'premium_banner',
      reason: 'feature_needed',
    });
  };

  const handleWatchAdPress = async () => {
    if (!onRewardedUnlock) return;
    
    setIsLoadingAd(true);
    track('premium.rewarded_ad_attempt', {
      screen,
      feature: featureName,
      current_tier: tier,
    });

    try {
      const result = await offerRewarded(`premium_preview_${screen}`);
      
      if (result.rewarded) {
        track('premium.rewarded_ad_completed', {
          screen,
          feature: featureName,
          current_tier: tier,
        });
        onRewardedUnlock();
      } else if (result.shown) {
        track('premium.rewarded_ad_skipped', {
          screen,
          feature: featureName,
        });
      } else {
        track('premium.rewarded_ad_unavailable', {
          screen,
          feature: featureName,
        });
      }
    } catch (error) {
      console.error('[PremiumFeatureBanner] Rewarded ad error:', error);
      track('premium.rewarded_ad_error', {
        screen,
        feature: featureName,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    } finally {
      setIsLoadingAd(false);
    }
  };

  const handleBackPress = () => {
    track('premium.banner_closed', {
      screen,
      feature: featureName,
      variant,
    });

    if (onClose) {
      onClose();
    } else {
      router.back();
    }
  };

  if (variant === 'fullscreen') {
    return (
      <View style={[styles.fullscreenContainer, { backgroundColor: theme.background }, containerStyle]}>
        {/* Back/Close Button */}
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: theme.surface }]}
          onPress={handleBackPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>

        {/* Content */}
        <View style={styles.contentContainer}>
          <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
            <Ionicons name={icon} size={48} color={theme.primary} />
          </View>
          
          <Text style={[styles.featureTitle, { color: theme.text }]}>
            {featureName}
          </Text>
          
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {description}
          </Text>
          
          <View style={[styles.premiumBadge, { backgroundColor: theme.primary + '15', borderColor: theme.primary }]}>
            <Ionicons name="diamond" size={16} color={theme.primary} />
            <Text style={[styles.premiumText, { color: theme.primary }]}>
              {tierName} Feature
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.upgradeButton, { backgroundColor: theme.primary }]}
            onPress={handleUpgradePress}
            accessibilityRole="button"
            accessibilityLabel={`Upgrade to access ${featureName}`}
          >
            <Ionicons name="rocket" size={20} color="white" />
            <Text style={styles.upgradeButtonText}>
              Upgrade to {tierName}
            </Text>
          </TouchableOpacity>

          {/* Watch Ad for Free Trial - Android only */}
          {canShowRewardedAd && (
            <TouchableOpacity
              style={[styles.watchAdButton, { borderColor: theme.border }]}
              onPress={handleWatchAdPress}
              disabled={isLoadingAd}
              accessibilityRole="button"
              accessibilityLabel="Watch an ad to try this feature for free"
            >
              {isLoadingAd ? (
                <EduDashSpinner size="small" color={theme.primary} />
              ) : (
                <>
                  <Ionicons name="play-circle" size={20} color={theme.primary} />
                  <Text style={[styles.watchAdButtonText, { color: theme.primary }]}>
                    Watch Ad for Free Trial
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
          
          <Text style={[styles.benefitsText, { color: theme.textSecondary }]}>
            Unlock this feature and many more with a {tierName} subscription
          </Text>
        </View>
      </View>
    );
  }

  // Inline variant
  return (
    <View style={[styles.inlineContainer, { backgroundColor: theme.surface, borderColor: theme.border }, containerStyle]}>
      <View style={styles.inlineContent}>
        <View style={[styles.inlineIconContainer, { backgroundColor: theme.primary + '20' }]}>
          <Ionicons name={icon} size={24} color={theme.primary} />
        </View>
        
        <View style={styles.inlineTextContainer}>
          <Text style={[styles.inlineTitle, { color: theme.text }]}>
            {featureName}
          </Text>
          <Text style={[styles.inlineDescription, { color: theme.textSecondary }]} numberOfLines={2}>
            {description}
          </Text>
        </View>
        
        <TouchableOpacity
          style={[styles.inlineUpgradeButton, { backgroundColor: theme.primary }]}
          onPress={handleUpgradePress}
          accessibilityRole="button"
          accessibilityLabel={`Upgrade to access ${featureName}`}
        >
          <Text style={styles.inlineUpgradeText}>
            Upgrade
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fullscreen variant styles
  fullscreenContainer: {
    flex: 1,
    paddingTop: 50, // Account for status bar
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  featureTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 300,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 32,
  },
  premiumText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  upgradeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  watchAdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    minWidth: 200,
    minHeight: 44,
  },
  watchAdButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  benefitsText: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
  },

  // Inline variant styles
  inlineContainer: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  inlineContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  inlineIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  inlineTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  inlineTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  inlineDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  inlineUpgradeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  inlineUpgradeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
