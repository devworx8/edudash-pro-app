/**
 * AIQuotaDisplay Component
 * 
 * Shows visual representation of AI quota usage for parents.
 * Displays remaining quota, usage percentage, and upgrade prompts when quota is low/exceeded.
 * 
 * Complies with WARP.md:
 * - Component ≤400 lines (excluding StyleSheet)
 * - Mobile-first design
 * - Analytics tracking for user interactions
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAIQuota, useAIUserLimits } from '@/hooks/useAI';
import { track } from '@/lib/analytics';
import type { AIQuotaFeature } from '@/lib/ai/limits';
import { clampPercent, percentWidth } from '@/lib/progress/clampPercent';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export interface AIQuotaDisplayProps {
  /** Which quota feature to display */
  serviceType?: AIQuotaFeature;
  /** Show compact version (single line) */
  compact?: boolean;
  /** Show upgrade CTA when quota is low */
  showUpgradePrompt?: boolean;
  /** Custom container style */
  containerStyle?: object;
  /** Callback when quota is exceeded */
  onQuotaExceeded?: () => void;
}

interface QuotaBarProps {
  used: number;
  limit: number;
  color: string;
  showLabel?: boolean;
}

/**
 * Visual progress bar for quota usage
 */
const QuotaBar: React.FC<QuotaBarProps> = ({ used, limit, color, showLabel = true }) => {
  const percentage = limit > 0
    ? clampPercent((used / limit) * 100, { source: 'components/ui/AIQuotaDisplay.QuotaBar' })
    : 0;
  
  return (
    <View style={styles.quotaBarContainer}>
      <View
        style={styles.quotaBarBackground}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(percentage) }}
      >
        <LinearGradient
          colors={[color, color + '80']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.quotaBarFill, { width: percentWidth(percentage) }]}
        />
      </View>
      {showLabel && (
        <Text style={[styles.quotaBarLabel, { color }]}>
          {used}/{limit}
        </Text>
      )}
    </View>
  );
};

/**
 * Get color based on usage percentage
 */
function getUsageColor(percentage: number, theme: any): string {
  if (percentage >= 100) return theme.error || '#DC2626';
  if (percentage >= 90) return theme.warning || '#F59E0B';
  if (percentage >= 75) return theme.warning || '#F59E0B';
  return theme.success || '#10B981';
}

/**
 * Get status text based on usage percentage
 */
function getStatusText(percentage: number, remaining: number): string {
  if (percentage >= 100) return 'Quota Exceeded';
  if (percentage >= 90) return `Only ${remaining} left!`;
  if (percentage >= 75) return `${remaining} remaining`;
  return `${remaining} available`;
}

/**
 * Format service type for display
 */
function formatServiceType(serviceType: AIQuotaFeature): string {
  const names: Record<AIQuotaFeature, string> = {
    lesson_generation: 'Lessons',
    grading_assistance: 'Grading',
    homework_help: 'Assignment Help',
    transcription: 'Voice',
  };
  return names[serviceType] || serviceType;
}

/**
 * Get icon for service type
 */
function getServiceIcon(serviceType: AIQuotaFeature): string {
  const icons: Record<AIQuotaFeature, string> = {
    lesson_generation: 'book',
    grading_assistance: 'checkmark-circle',
    homework_help: 'help-circle',
    transcription: 'mic',
  };
  return icons[serviceType] || 'analytics';
}

export const AIQuotaDisplay: React.FC<AIQuotaDisplayProps> = ({
  serviceType = 'homework_help',
  compact = false,
  showUpgradePrompt = true,
  containerStyle,
  onQuotaExceeded,
}) => {
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const { tier: currentTier } = useSubscription();
  
  // Fetch quota data using React Query hook
  const { 
    data: quotaData, 
    isLoading, 
    isError, 
    error,
    canUse,
    getReason 
  } = useAIQuota(serviceType, user?.id);
  
  // Calculate usage stats
  const usageStats = useMemo(() => {
    if (!quotaData) {
      return { used: 0, limit: 0, remaining: 0, percentage: 0, color: theme.success };
    }
    
    const { used, limit, remaining } = quotaData;
    const percentage = limit > 0 ? (used / limit) * 100 : 0;
    const color = getUsageColor(percentage, theme);
    
    return { used, limit, remaining, percentage, color };
  }, [quotaData, theme]);
  
  // Handle upgrade button press
  const handleUpgradePress = useCallback(() => {
    // Determine target tier based on current tier
    const targetTier = currentTier === 'free' ? 'parent_starter' : 'parent_plus';
    
    track('edudash.ai.upsell.shown', {
      trigger: 'quota_display_upgrade_button',
      current_tier: currentTier || 'free',
      target_tier: targetTier,
      quota_percentage: usageStats.percentage,
      service_type: serviceType,
    });
    
    navigateToUpgrade({ source: 'quota_display' });
  }, [usageStats.percentage, serviceType, currentTier]);
  
  // Notify parent when quota is exceeded
  React.useEffect(() => {
    if (usageStats.percentage >= 100 && onQuotaExceeded) {
      onQuotaExceeded();
    }
  }, [usageStats.percentage, onQuotaExceeded]);
  
  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, containerStyle, { backgroundColor: theme.surface }]}>
        <EduDashSpinner size="small" color={theme.primary} />
      </View>
    );
  }
  
  // Error state
  if (isError) {
    return (
      <View style={[styles.container, containerStyle, { backgroundColor: theme.surface }]}>
        <Ionicons name="alert-circle" size={20} color={theme.error} />
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>
          Unable to load quota
        </Text>
      </View>
    );
  }
  
  // Compact view
  if (compact) {
    // Show fallback if quota data is not available
    if (!quotaData && !isLoading && !isError) {
      return (
        <View style={[styles.compactContainer, containerStyle, { backgroundColor: theme.surface }]}>
          <View style={styles.compactHeader}>
            <Ionicons 
              name={getServiceIcon(serviceType) as any} 
              size={16} 
              color={theme.textSecondary} 
            />
            <Text style={[styles.compactLabel, { color: theme.text }]}>
              {formatServiceType(serviceType)}
            </Text>
          </View>
          <QuotaBar 
            used={0} 
            limit={0} 
            color={theme.textSecondary}
            showLabel={false}
          />
          <Text style={[styles.compactSubtext, { color: theme.textSecondary }]}>
            Loading quota...
          </Text>
        </View>
      );
    }
    
    return (
      <View style={[styles.compactContainer, containerStyle, { backgroundColor: theme.surface }]}>
        <View style={styles.compactHeader}>
          <Ionicons 
            name={getServiceIcon(serviceType) as any} 
            size={16} 
            color={usageStats.color} 
          />
          <Text style={[styles.compactLabel, { color: theme.text }]}>
            {formatServiceType(serviceType)}
          </Text>
          {usageStats.limit > 0 && (
            <Text style={[styles.compactNumbers, { color: theme.textSecondary }]}>
              {usageStats.used}/{usageStats.limit}
            </Text>
          )}
        </View>
        <QuotaBar 
          used={usageStats.used} 
          limit={usageStats.limit} 
          color={usageStats.color}
          showLabel={usageStats.limit > 0}
        />
      </View>
    );
  }
  
  // Full view
  return (
    <View style={[styles.container, containerStyle, { backgroundColor: theme.surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: usageStats.color + '20' }]}>
          <Ionicons 
            name={getServiceIcon(serviceType) as any} 
            size={20} 
            color={usageStats.color} 
          />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.text }]}>
            {formatServiceType(serviceType)}
          </Text>
          <Text style={[styles.statusText, { color: usageStats.color }]}>
            {getStatusText(usageStats.percentage, usageStats.remaining)}
          </Text>
        </View>
      </View>
      
      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <QuotaBar 
          used={usageStats.used} 
          limit={usageStats.limit} 
          color={usageStats.color}
        />
        <View style={styles.statsRow}>
          <Text style={[styles.statsText, { color: theme.textSecondary }]}>
            Used: {usageStats.used}
          </Text>
          <Text style={[styles.statsText, { color: theme.textSecondary }]}>
            Limit: {usageStats.limit}/month
          </Text>
        </View>
      </View>
      
      {/* Upgrade CTA when quota is low or exceeded */}
      {showUpgradePrompt && usageStats.percentage >= 75 && (
        <TouchableOpacity
          style={[
            styles.upgradeButton,
            { 
              backgroundColor: usageStats.percentage >= 100 
                ? theme.error 
                : theme.primary 
            }
          ]}
          onPress={handleUpgradePress}
          accessibilityRole="button"
          accessibilityLabel="Upgrade to get more AI quota"
        >
          <Ionicons name="sparkles" size={16} color="#fff" />
          <Text style={styles.upgradeButtonText}>
            {usageStats.percentage >= 100 ? 'Upgrade Now' : 'Get More'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/**
 * Multi-quota display showing all service types
 */
export const AIQuotaOverview: React.FC<{
  containerStyle?: object;
  showUpgradePrompt?: boolean;
}> = ({ containerStyle, showUpgradePrompt = true }) => {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  
  // Use the full user limits hook for overview
  const { data: limitsData, isLoading, isError } = useAIUserLimits(user?.id);
  
  // Determine which quotas to show based on role
  const roleName = (profile as any)?.role;
  const isParent = roleName === 'parent';
  const visibleServices: AIQuotaFeature[] = isParent 
    ? ['homework_help', 'transcription']
    : ['lesson_generation', 'grading_assistance', 'homework_help', 'transcription'];
  
  if (isLoading) {
    return (
      <View style={[styles.overviewContainer, containerStyle, { backgroundColor: theme.surface }]}>
        <EduDashSpinner size="small" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading AI quota...
        </Text>
      </View>
    );
  }
  
  if (isError || !limitsData) {
    return (
      <View style={[styles.overviewContainer, containerStyle, { backgroundColor: theme.surface }]}>
        <Ionicons name="alert-circle-outline" size={24} color={theme.error} />
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>
          Unable to load quota information
        </Text>
      </View>
    );
  }
  
  // Calculate overall usage
  const totalUsed = Object.values(limitsData.used || {}).reduce((sum, val) => sum + (val || 0), 0);
  const totalQuota = Object.values(limitsData.quotas || {}).reduce((sum, val) => sum + (val || 0), 0);
  const overallPercentage = totalQuota > 0 ? (totalUsed / totalQuota) * 100 : 0;
  
  return (
    <View style={[styles.overviewContainer, containerStyle, { backgroundColor: theme.surface }]}>
      {/* Header */}
      <View style={styles.overviewHeader}>
        <View style={styles.overviewTitleRow}>
          <Ionicons name="sparkles" size={20} color={theme.primary} />
          <Text style={[styles.overviewTitle, { color: theme.text }]}>
            AI Usage
          </Text>
        </View>
        <Text style={[styles.overviewTier, { color: theme.textSecondary }]}>
          {limitsData.tier ? `${limitsData.tier.charAt(0).toUpperCase()}${limitsData.tier.slice(1)} Plan` : 'Free Plan'}
        </Text>
      </View>
      
      {/* Individual quotas */}
      <View style={styles.quotaGrid}>
        {visibleServices.map((service) => (
          <AIQuotaDisplay
            key={service}
            serviceType={service}
            compact={true}
            showUpgradePrompt={false}
            containerStyle={styles.quotaGridItem}
          />
        ))}
      </View>
      
      {/* Overall status and upgrade CTA */}
      {showUpgradePrompt && overallPercentage >= 75 && (
        <TouchableOpacity
          style={[styles.overviewUpgradeButton, { backgroundColor: theme.primary }]}
          onPress={() => {
            track('edudash.ai.upsell.shown', {
              trigger: 'quota_overview_upgrade',
              current_tier: limitsData.tier || 'free',
              target_tier: 'pro',
              quota_percentage: overallPercentage,
            });
            navigateToUpgrade({ source: 'quota_overview' });
          }}
        >
          <Text style={styles.overviewUpgradeText}>
            Upgrade for More AI Features
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  compactContainer: {
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  compactLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  compactNumbers: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  compactSubtext: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  progressSection: {
    marginBottom: 12,
  },
  quotaBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quotaBarBackground: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  quotaBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  quotaBarLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 50,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  statsText: {
    fontSize: 12,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  upgradeButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  errorText: {
    fontSize: 14,
    marginLeft: 8,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },
  // Overview styles
  overviewContainer: {
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  overviewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overviewTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  overviewTier: {
    fontSize: 13,
    fontWeight: '500',
  },
  quotaGrid: {
    gap: 8,
  },
  quotaGridItem: {
    marginVertical: 2,
  },
  overviewUpgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 16,
    gap: 6,
  },
  overviewUpgradeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});

export default AIQuotaDisplay;
