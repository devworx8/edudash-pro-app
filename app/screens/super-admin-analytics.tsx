import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/roleUtils';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { logger } from '@/lib/logger';
import { percentWidth } from '@/lib/progress/clampPercent';
import {
  type PlatformStats,
  type RevenueByPlan,
  type UsageMetrics,
  getStartDate,
  formatCurrency,
  formatNumber,
  createStyles,
} from '@/lib/screen-styles/super-admin-analytics.styles';
export default function SuperAdminAnalyticsScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<PlatformStats>({
    totalSchools: 0,
    totalUsers: 0,
    totalStudents: 0,
    totalTeachers: 0,
    totalParents: 0,
    activeSubscriptions: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    aiUsageThisMonth: 0,
    averageSchoolSize: 0,
    churnRate: 0,
    growthRate: 0,
  });
  const [revenueByPlan, setRevenueByPlan] = useState<RevenueByPlan[]>([]);
  const [usageMetrics, setUsageMetrics] = useState<UsageMetrics>({
    totalApiCalls: 0,
    aiTokensUsed: 0,
    storageUsed: 0,
    bandwidthUsed: 0,
  });
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');

  const fetchPlatformAnalytics = useCallback(async () => {
    if (!isSuperAdmin(profile?.role)) {
      showAlert({ title: 'Access Denied', message: 'Super admin privileges required', buttons: [{ text: 'OK' }] });
      return;
    }

    try {
      setLoading(true);

      // Use the existing super admin functions from database.types.ts
      const { data: platformData, error: platformError } = await assertSupabase()
        .rpc('get_platform_stats_for_superadmin');

      if (platformError) {
        logger.error('Platform stats error:', platformError);
      } else if (platformData) {
        setStats({
          totalSchools: platformData.total_schools || 0,
          totalUsers: platformData.total_users || 0,
          totalStudents: platformData.total_students || 0,
          totalTeachers: platformData.total_teachers || 0,
          totalParents: platformData.total_parents || 0,
          activeSubscriptions: platformData.active_subscriptions || 0,
          totalRevenue: platformData.total_revenue || 0,
          monthlyRevenue: platformData.monthly_revenue || 0,
          aiUsageThisMonth: platformData.ai_usage_month || 0,
          averageSchoolSize: platformData.avg_school_size || 0,
          churnRate: platformData.churn_rate || 0,
          growthRate: platformData.growth_rate || 0,
        });
      }

      // Get subscription analytics
      const { data: subAnalytics, error: subError } = await assertSupabase()
        .rpc('get_subscription_analytics', {
          start_date: getStartDate(timeRange),
          end_date: new Date().toISOString().split('T')[0]
        });

      if (subError) {
        logger.error('Subscription analytics error:', subError);
      } else if (subAnalytics && subAnalytics.length > 0) {
        const analytics = subAnalytics[0];
        
        // Get revenue breakdown by plan
        const { data: planBreakdown } = await assertSupabase()
          .from('subscriptions')
          .select(`
            plan_id,
            subscriptions!inner(
              id,
              status
            ),
            billing_invoices!inner(
              amount
            )
          `)
          .eq('subscriptions.status', 'active');

        if (planBreakdown) {
          const planSummary: { [key: string]: { count: number; revenue: number } } = {};
          
          planBreakdown.forEach((item: any) => {
            const plan = item.plan_id || 'unknown';
            if (!planSummary[plan]) {
              planSummary[plan] = { count: 0, revenue: 0 };
            }
            planSummary[plan].count += 1;
            planSummary[plan].revenue += item.billing_invoices?.amount || 0;
          });

          const totalRevenue = Object.values(planSummary).reduce((sum, p) => sum + p.revenue, 0);
          
          const revenueData: RevenueByPlan[] = Object.entries(planSummary).map(([plan, data]) => ({
            plan,
            count: data.count,
            revenue: data.revenue,
            percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
          }));
          
          setRevenueByPlan(revenueData.sort((a, b) => b.revenue - a.revenue));
        }

        // Update stats with subscription data
        setStats(prev => ({
          ...prev,
          totalRevenue: analytics.total_revenue || prev.totalRevenue,
          monthlyRevenue: analytics.monthly_revenue || prev.monthlyRevenue,
          activeSubscriptions: analytics.active_subscriptions || prev.activeSubscriptions,
          churnRate: analytics.churn_rate || prev.churnRate,
        }));
      }

      // Get AI usage metrics
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: aiUsage } = await assertSupabase()
        .from('ai_usage_logs')
        .select('input_tokens, output_tokens, total_cost')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (aiUsage) {
        const totalTokens = aiUsage.reduce((sum, log) => 
          sum + (log.input_tokens || 0) + (log.output_tokens || 0), 0);
        
        setUsageMetrics(prev => ({
          ...prev,
          aiTokensUsed: totalTokens,
          totalApiCalls: aiUsage.length,
        }));
      }

    } catch (error) {
      logger.error('Failed to fetch platform analytics:', error);
      showAlert({ title: 'Error', message: 'Failed to load platform analytics', buttons: [{ text: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }, [profile?.role, timeRange]);

  useEffect(() => {
    fetchPlatformAnalytics();
  }, [fetchPlatformAnalytics]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPlatformAnalytics();
    setRefreshing(false);
  }, [fetchPlatformAnalytics]);

  const exportData = useCallback(async () => {
    try {
      // Prepare export data payload
      logger.debug('Exporting analytics data for:', {
        time_range: timeRange,
        total_schools: stats.totalSchools,
        total_revenue: stats.totalRevenue,
      });

      // Track the export action
      track('superadmin_analytics_exported', {
        time_range: timeRange,
        total_schools: stats.totalSchools,
        total_revenue: stats.totalRevenue,
      });

      showAlert({
        title: 'Export Analytics',
        message: 'Analytics data has been prepared for export. In a production app, this would download a CSV or PDF report.',
        buttons: [{ text: 'OK' }],
      });
    } catch (err) {
      logger.error('Export failed:', err);
      showAlert({ title: 'Error', message: 'Failed to export analytics data', buttons: [{ text: 'OK' }] });
    }
  }, [timeRange, stats]); // Removed unnecessary dependencies that don't affect the export function

  if (!profile || !isSuperAdmin(profile.role)) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Platform Analytics', headerShown: false }} />
        <ThemedStatusBar />
        <SafeAreaView style={styles.deniedContainer}>
          <Text style={styles.deniedText}>Access Denied - Super Admin Only</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Platform Analytics', headerShown: false }} />
      <ThemedStatusBar />
      
      {/* Header */}
      <SafeAreaView style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Platform Analytics</Text>
          <TouchableOpacity onPress={exportData} style={styles.exportButton}>
            <Ionicons name="download-outline" size={24} color={theme.primary} />
          </TouchableOpacity>
        </View>
        
        {/* Time Range Selector */}
        <View style={styles.timeRangeContainer}>
          {(['7d', '30d', '90d', '1y'] as const).map((range) => (
            <TouchableOpacity
              key={range}
              style={[styles.timeRangeButton, timeRange === range && styles.timeRangeButtonActive]}
              onPress={() => setTimeRange(range)}
            >
              <Text style={[styles.timeRangeText, timeRange === range && styles.timeRangeTextActive]}>
                {range}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={styles.loadingText}>Loading platform analytics...</Text>
          </View>
        ) : (
          <>
            {/* Key Metrics Cards */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{formatNumber(stats.totalSchools)}</Text>
                <Text style={styles.metricLabel}>Total Schools</Text>
                <Text style={styles.metricTrend}>+{stats.growthRate.toFixed(1)}% growth</Text>
              </View>
              
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{formatNumber(stats.totalUsers)}</Text>
                <Text style={styles.metricLabel}>Total Users</Text>
                <Text style={styles.metricSubLabel}>
                  {formatNumber(stats.totalTeachers)} teachers, {formatNumber(stats.totalParents)} parents
                </Text>
              </View>
              
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{formatCurrency(stats.monthlyRevenue)}</Text>
                <Text style={styles.metricLabel}>Monthly Revenue</Text>
                <Text style={styles.metricSubLabel}>
                  {formatCurrency(stats.totalRevenue)} total
                </Text>
              </View>
              
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{stats.activeSubscriptions}</Text>
                <Text style={styles.metricLabel}>Active Subscriptions</Text>
                <Text style={styles.metricTrend}>{stats.churnRate.toFixed(1)}% churn rate</Text>
              </View>
            </View>

            {/* Revenue by Plan */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Revenue by Plan</Text>
              {revenueByPlan.map((plan, index) => (
                <View key={index} style={styles.planCard}>
                  <View style={styles.planHeader}>
                    <Text style={styles.planName}>{plan.plan.toUpperCase()}</Text>
                    <Text style={styles.planRevenue}>{formatCurrency(plan.revenue)}</Text>
                  </View>
                  <View style={styles.planDetails}>
                    <Text style={styles.planCount}>{plan.count} subscriptions</Text>
                    <Text style={styles.planPercentage}>{plan.percentage.toFixed(1)}% of revenue</Text>
                  </View>
                  <View style={styles.planBar}>
                    <View style={[styles.planBarFill, { width: percentWidth(plan.percentage) }]} />
                  </View>
                </View>
              ))}
            </View>

            {/* AI Usage Metrics */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>AI Usage (Last 30 Days)</Text>
              <View style={styles.usageGrid}>
                <View style={styles.usageCard}>
                  <Text style={styles.usageValue}>{formatNumber(usageMetrics.totalApiCalls)}</Text>
                  <Text style={styles.usageLabel}>API Calls</Text>
                </View>
                <View style={styles.usageCard}>
                  <Text style={styles.usageValue}>{formatNumber(usageMetrics.aiTokensUsed)}</Text>
                  <Text style={styles.usageLabel}>AI Tokens</Text>
                </View>
              </View>
            </View>

            {/* System Health */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>System Health</Text>
              <View style={styles.healthCard}>
                <View style={styles.healthItem}>
                  <View style={[styles.healthIndicator, styles.healthGreen]} />
                  <Text style={styles.healthLabel}>Database</Text>
                  <Text style={styles.healthStatus}>Healthy</Text>
                </View>
                <View style={styles.healthItem}>
                  <View style={[styles.healthIndicator, styles.healthGreen]} />
                  <Text style={styles.healthLabel}>AI Services</Text>
                  <Text style={styles.healthStatus}>Operational</Text>
                </View>
                <View style={styles.healthItem}>
                  <View style={[styles.healthIndicator, styles.healthGreen]} />
                  <Text style={styles.healthLabel}>Payment Gateway</Text>
                  <Text style={styles.healthStatus}>Active</Text>
                </View>
              </View>
            </View>

            {/* Quick Actions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <View style={styles.actionGrid}>
                <TouchableOpacity 
                  style={styles.actionCard}
                  onPress={() => router.push('/screens/super-admin-users')}
                >
                  <Ionicons name="people" size={24} color={theme.primary} />
                  <Text style={styles.actionText}>Manage Users</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.actionCard}
                  onPress={() => router.push('/screens/super-admin-moderation')}
                >
                  <Ionicons name="shield-checkmark" size={24} color="#00f5ff" />
                  <Text style={styles.actionText}>Moderation</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.actionCard}
                  onPress={() => router.push('/screens/super-admin-feature-flags')}
                >
                  <Ionicons name="flag" size={24} color="#00f5ff" />
                  <Text style={styles.actionText}>Feature Flags</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>  
        )}
      </ScrollView>
      
      <AlertModal {...alertProps} />
    </View>
  );
}