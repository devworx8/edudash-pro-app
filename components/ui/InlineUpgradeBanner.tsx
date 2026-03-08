import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { track } from '@/lib/analytics';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';

interface InlineUpgradeBannerProps {
  /**
   * Title for the upgrade prompt
   */
  title?: string;
  
  /**
   * Description of what premium unlocks
   */
  description?: string;
  
  /**
   * Screen identifier for analytics
   */
  screen: string;
  
  /**
   * Feature identifier for analytics
   */
  feature: string;
  
  /**
   * Custom icon to display
   */
  icon?: keyof typeof Ionicons.glyphMap;
  
  /**
   * Custom style for the container
   */
  containerStyle?: any;

  /**
   * Variant of the banner
   */
  variant?: 'default' | 'compact' | 'minimal';

  /**
   * Whether to show the banner (useful for conditional rendering)
   */
  visible?: boolean;
}

/**
 * InlineUpgradeBanner - Shows inline upgrade prompts for features with premium tiers
 * 
 * This component handles:
 * - Inline upgrade prompts that don't block the entire screen
 * - Analytics tracking for upgrade clicks
 * - Consistent styling across the app
 * - Different variants for different contexts
 * 
 * Usage:
 * ```tsx
 * <InlineUpgradeBanner 
 *   title="Unlock Premium Analytics" 
 *   description="Get detailed insights and advanced reporting features"
 *   screen="analytics"
 *   feature="advanced_analytics"
 *   variant="default"
 * />
 * 
 * // Compact version for limited space
 * <InlineUpgradeBanner 
 *   screen="quick-actions"
 *   feature="whatsapp_connect"
 *   variant="compact"
 * />
 * ```
 */
export default function InlineUpgradeBanner({
  title = 'Upgrade to Premium',
  description = 'Unlock all features and remove limits with a Premium subscription',
  screen,
  feature,
  icon = 'diamond',
  containerStyle,
  variant = 'default',
  visible = true,
}: InlineUpgradeBannerProps) {
  const { theme } = useTheme();
  const { tier } = useSubscription();
  const { profile } = useAuth();
  const { t } = useTranslation();

  const role = String(profile?.role || '').toLowerCase();
  const isParentLike = role === 'parent' || role === 'student' || role === 'learner';

  // Don't show if user already has an appropriate paid tier for their category
  // - Parent-like: any non-free tier (e.g. parent_starter/parent_plus) means they've upgraded
  // - School-like: hide only for higher tiers (premium/enterprise) to still allow upsell from starter → premium
  const hasUpgraded = isParentLike ? tier !== 'free' : tier === 'premium' || tier === 'enterprise';

  if (!visible || hasUpgraded) {
    return null;
  }

  const handleUpgradePress = () => {
    track('premium.upgrade_clicked', {
      screen,
      feature,
      current_tier: tier,
      source: 'inline_banner',
      variant,
    });

    navigateToUpgrade({
      source: 'inline_upgrade_banner',
      reason: 'feature_needed',
    });
  };

  if (variant === 'minimal') {
    return (
      <TouchableOpacity
        style={[styles.minimalContainer, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '40' }, containerStyle]}
        onPress={handleUpgradePress}
        activeOpacity={0.8}
        accessibilityRole="button"
accessibilityLabel={`${t('quick_actions.upgrade_to_unlock', { defaultValue: 'Upgrade to unlock' })} ${feature}`}
      >
        <View style={styles.minimalContent}>
          <Ionicons name={icon} size={16} color={theme.primary} />
          <Text style={[styles.minimalText, { color: theme.primary }]}> 
            {t('subscription.upgrade', { defaultValue: 'Upgrade Plan' })}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={theme.primary} />
        </View>
      </TouchableOpacity>
    );
  }

  if (variant === 'compact') {
    return (
      <View style={[styles.compactContainer, { backgroundColor: theme.surface, borderColor: theme.border }, containerStyle]}>
        <View style={styles.compactContent}>
          <View style={[styles.compactIcon, { backgroundColor: theme.primary + '20' }]}>
            <Ionicons name={icon} size={20} color={theme.primary} />
          </View>
          <View style={styles.compactTextContainer}>
            <Text style={[styles.compactTitle, { color: theme.text }]}>
              {title}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.compactButton, { backgroundColor: theme.primary }]}
            onPress={handleUpgradePress}
            accessibilityRole="button"
            accessibilityLabel={`Upgrade to unlock ${feature}`}
          >
            <Text style={styles.compactButtonText}>{t('common.upgrade', { defaultValue: 'Upgrade' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Default variant
  return (
    <View style={[styles.defaultContainer, { backgroundColor: theme.surface, borderColor: theme.border }, containerStyle]}>
      <View style={styles.defaultContent}>
        <View style={[styles.defaultIconContainer, { backgroundColor: theme.primary + '20' }]}>
          <Ionicons name={icon} size={24} color={theme.primary} />
        </View>
        
        <View style={styles.defaultTextContainer}>
          <Text style={[styles.defaultTitle, { color: theme.text }]}>
            {title}
          </Text>
          <Text style={[styles.defaultDescription, { color: theme.textSecondary }]} numberOfLines={2}>
            {description}
          </Text>
        </View>
        
        <TouchableOpacity
          style={[styles.defaultButton, { backgroundColor: theme.primary }]}
          onPress={handleUpgradePress}
          accessibilityRole="button"
          accessibilityLabel={`Upgrade to unlock ${feature}`}
        >
          <Ionicons name="rocket" size={16} color="white" style={{ marginRight: 6 }} />
          <Text style={styles.defaultButtonText}>{t('common.upgrade', { defaultValue: 'Upgrade' })}</Text>
        </TouchableOpacity>
      </View>
      
      {/* Optional gradient overlay for premium feel */}
      <View style={[styles.gradientOverlay, { backgroundColor: `${theme.primary}05` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Default variant styles
  defaultContainer: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  defaultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    zIndex: 1,
  },
  defaultIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  defaultTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  defaultTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  defaultDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  defaultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  defaultButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
  },

  // Compact variant styles
  compactContainer: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  compactIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  compactTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  compactTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  compactButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  compactButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },

  // Minimal variant styles
  minimalContainer: {
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  minimalContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  minimalText: {
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: 8,
  },
});
