/**
 * QuotaUsageAnalytics Component
 * 
 * Displays detailed quota usage analytics with charts and trends.
 * Used in settings/account screens.
 * 
 * Complies with WARP.md:
 * - Component ≤400 lines (excluding StyleSheet)
 * - Mobile-first design
 * - Analytics tracking
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getMondayBasedDayIndex, getWeekLabels } from '@/lib/utils/dateUtils';
import { useAIUserLimits, useAIRecentUsage } from '@/hooks/useAI';
import { track } from '@/lib/analytics';
import type { AIQuotaFeature } from '@/lib/ai/limits';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { percentWidth } from '@/lib/progress/clampPercent';
const { width: screenWidth } = Dimensions.get('window');

export interface QuotaUsageAnalyticsProps {
  /** Show detailed breakdown */
  showBreakdown?: boolean;
  /** Show usage trend */
  showTrend?: boolean;
  /** Custom container style */
  containerStyle?: object;
}

/**
 * Format quota feature name for display
 */
function formatFeatureName(feature: AIQuotaFeature): string {
  const names: Record<AIQuotaFeature, string> = {
    lesson_generation: 'Lessons',
    grading_assistance: 'Grading',
    homework_help: 'Assignment Help',
    transcription: 'Voice',
  };
  return names[feature] || feature;
}

/**
 * Get feature icon
 */
function getFeatureIcon(feature: AIQuotaFeature): string {
  const icons: Record<AIQuotaFeature, string> = {
    lesson_generation: 'book',
    grading_assistance: 'checkmark-done',
    homework_help: 'help-buoy',
    transcription: 'mic',
  };
  return icons[feature] || 'analytics';
}

/**
 * Get feature color
 */
function getFeatureColor(feature: AIQuotaFeature): string {
  const colors: Record<AIQuotaFeature, string> = {
    lesson_generation: '#3B82F6',
    grading_assistance: '#10B981',
    homework_help: '#F59E0B',
    transcription: '#8B5CF6',
  };
  return colors[feature] || '#6B7280';
}

/**
 * Simple progress bar component
 */
const ProgressBar: React.FC<{
  percentage: number;
  color: string;
  height?: number;
}> = ({ percentage, color, height = 8 }) => (
  <View style={[styles.progressBarContainer, { height }]}>
    <LinearGradient
      colors={[color, color + '80']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.progressBarFill, { width: percentWidth(Math.min(percentage, 100)) }]}
    />
  </View>
);

/**
 * Usage trend mini-chart (simplified bar chart)
 */
const UsageTrendChart: React.FC<{
  data: number[];
  labels: string[];
  color: string;
  theme: any;
}> = ({ data, labels, color, theme }) => {
  const maxValue = Math.max(...data, 1);
  
  return (
    <View style={styles.trendChart}>
      <View style={styles.trendBars}>
        {data.map((value, index) => (
          <View key={index} style={styles.trendBarWrapper}>
            <View style={styles.trendBarBackground}>
              <View
                style={[
                  styles.trendBar,
                  {
                    height: `${(value / maxValue) * 100}%`,
                    backgroundColor: color,
                  },
                ]}
              />
            </View>
            <Text style={[styles.trendLabel, { color: theme.textSecondary }]}>
              {labels[index]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export const QuotaUsageAnalytics: React.FC<QuotaUsageAnalyticsProps> = ({
  showBreakdown = true,
  showTrend = true,
  containerStyle,
}) => {
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  
  // Fetch usage data
  const { data: limitsData, isLoading, isError, refetch } = useAIUserLimits(user?.id);
  const { data: recentUsage } = useAIRecentUsage({
    scope: 'user',
    user_id: user?.id,
    limit: 30,
  });
  
  // Calculate usage statistics
  const usageStats = useMemo(() => {
    if (!limitsData) {
      return {
        totalUsed: 0,
        totalQuota: 0,
        overallPercentage: 0,
        byFeature: {} as Record<AIQuotaFeature, { used: number; limit: number; percentage: number }>,
      };
    }
    
    const features: AIQuotaFeature[] = ['homework_help', 'lesson_generation', 'grading_assistance', 'transcription'];
    const byFeature: Record<string, { used: number; limit: number; percentage: number }> = {};
    
    let totalUsed = 0;
    let totalQuota = 0;
    
    for (const feature of features) {
      const used = limitsData.used?.[feature] || 0;
      const limit = limitsData.quotas?.[feature] || 0;
      const percentage = limit > 0 ? (used / limit) * 100 : 0;
      
      byFeature[feature] = { used, limit, percentage };
      totalUsed += used;
      totalQuota += limit;
    }
    
    return {
      totalUsed,
      totalQuota,
      overallPercentage: totalQuota > 0 ? (totalUsed / totalQuota) * 100 : 0,
      byFeature: byFeature as Record<AIQuotaFeature, { used: number; limit: number; percentage: number }>,
    };
  }, [limitsData]);
  
  // Generate trend data from recent usage
  const trendData = useMemo(() => {
    if (!recentUsage?.usage_logs) {
      return { data: [0, 0, 0, 0, 0, 0, 0], labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] };
    }
    
    const weekLabels = getWeekLabels('short');
    const weekData = [0, 0, 0, 0, 0, 0, 0];
    
    recentUsage.usage_logs.forEach((log: any) => {
      const date = new Date(log.created_at);
      const dayIndex = getMondayBasedDayIndex(date);
      weekData[dayIndex]++;
    });
    
    return { data: weekData, labels: weekLabels };
  }, [recentUsage]);
  
  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, containerStyle, { backgroundColor: theme.surface }]}>
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading usage data...
          </Text>
        </View>
      </View>
    );
  }
  
  // Error state
  if (isError) {
    return (
      <View style={[styles.container, containerStyle, { backgroundColor: theme.surface }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.error} />
          <Text style={[styles.errorText, { color: theme.text }]}>
            Unable to load usage data
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            onPress={() => refetch()}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  
  return (
    <View style={[styles.container, containerStyle, { backgroundColor: theme.surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="analytics" size={22} color={theme.primary} />
          <Text style={[styles.title, { color: theme.text }]}>AI Usage</Text>
        </View>
        <Text style={[styles.tierLabel, { color: theme.textSecondary }]}>
          {limitsData?.tier || 'Free'} Plan
        </Text>
      </View>
      
      {/* Overall Usage */}
      <View style={styles.overallSection}>
        <View style={styles.overallHeader}>
          <Text style={[styles.overallLabel, { color: theme.textSecondary }]}>
            Total Usage This Month
          </Text>
          <Text style={[styles.overallValue, { color: theme.text }]}>
            {usageStats.totalUsed} / {usageStats.totalQuota}
          </Text>
        </View>
        <ProgressBar
          percentage={usageStats.overallPercentage}
          color={
            usageStats.overallPercentage >= 90 ? theme.error :
            usageStats.overallPercentage >= 75 ? theme.warning :
            theme.primary
          }
          height={12}
        />
        <Text style={[styles.percentageLabel, { 
          color: usageStats.overallPercentage >= 90 ? theme.error : theme.textSecondary 
        }]}>
          {Math.round(usageStats.overallPercentage)}% used
        </Text>
      </View>
      
      {/* Feature Breakdown */}
      {showBreakdown && (
        <View style={styles.breakdownSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            By Feature
          </Text>
          <View style={styles.featureList}>
            {(['homework_help', 'lesson_generation', 'grading_assistance', 'transcription'] as AIQuotaFeature[]).map((feature) => {
              const stats = usageStats.byFeature[feature];
              if (!stats || stats.limit === 0) return null;
              
              const color = getFeatureColor(feature);
              
              return (
                <View key={feature} style={styles.featureItem}>
                  <View style={styles.featureHeader}>
                    <View style={[styles.featureIconContainer, { backgroundColor: color + '20' }]}>
                      <Ionicons 
                        name={getFeatureIcon(feature) as any} 
                        size={16} 
                        color={color} 
                      />
                    </View>
                    <Text style={[styles.featureName, { color: theme.text }]}>
                      {formatFeatureName(feature)}
                    </Text>
                    <Text style={[styles.featureStats, { color: theme.textSecondary }]}>
                      {stats.used}/{stats.limit}
                    </Text>
                  </View>
                  <ProgressBar percentage={stats.percentage} color={color} />
                </View>
              );
            })}
          </View>
        </View>
      )}
      
      {/* Usage Trend */}
      {showTrend && (
        <View style={styles.trendSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            This Week's Activity
          </Text>
          <UsageTrendChart
            data={trendData.data}
            labels={trendData.labels}
            color={theme.primary}
            theme={theme}
          />
        </View>
      )}
      
      {/* Reset Info */}
      {limitsData?.reset_at && (
        <View style={[styles.resetInfo, { borderTopColor: theme.border }]}>
          <Ionicons name="refresh" size={14} color={theme.textSecondary} />
          <Text style={[styles.resetText, { color: theme.textSecondary }]}>
            Quota resets on {new Date(limitsData.reset_at).toLocaleDateString('en-ZA', {
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 20,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
    marginBottom: 16,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  tierLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  overallSection: {
    marginBottom: 24,
  },
  overallHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  overallLabel: {
    fontSize: 13,
  },
  overallValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  percentageLabel: {
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },
  progressBarContainer: {
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  breakdownSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
  },
  featureList: {
    gap: 16,
  },
  featureItem: {
    gap: 8,
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureName: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  featureStats: {
    fontSize: 13,
  },
  trendSection: {
    marginBottom: 16,
  },
  trendChart: {
    height: 80,
  },
  trendBars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 60,
    paddingHorizontal: 8,
  },
  trendBarWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  trendBarBackground: {
    width: 20,
    height: 50,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  trendBar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  trendLabel: {
    fontSize: 10,
    marginTop: 4,
  },
  resetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  resetText: {
    fontSize: 12,
  },
});

export default QuotaUsageAnalytics;
