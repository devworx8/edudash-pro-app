/**
 * Principal Analytics Screen - Refactored
 * 
 * Modular implementation following WARP.md standards (<500 lines).
 * Uses extracted hook for data fetching.
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { 
  usePrincipalAnalytics, 
  formatCurrency, 
  getStatusColor,
  type AnalyticsData 
} from '@/hooks/usePrincipalAnalytics';
import { exportAnalyticsPdf } from '@/lib/services/analytics/exportAnalyticsPdf';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { getAgeGroupColor } from '@/hooks/student-management/studentHelpers';
import { clampPercent } from '@/lib/progress/clampPercent';
// Period options for analytics
const PERIODS = ['week', 'month', 'quarter', 'year'] as const;

export default function PrincipalAnalyticsScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { tier } = useSubscription();
  const insets = useSafeAreaInsets();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('month');
  
  const { analytics, loading, refreshing, error, refresh } = usePrincipalAnalytics();
  const { showAlert, alertProps } = useAlertModal();
  
  // Check premium access
  const isPremiumOrHigher = ['premium', 'school_premium', 'pro', 'school_pro', 'enterprise', 'school_enterprise'].includes(String(tier || ''));

  const styles = createStyles(theme, insets);

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </View>
    );
  }

  if (error || !analytics) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Ionicons name="analytics-outline" size={64} color={theme.textSecondary} />
          <Text style={styles.errorText}>{error || 'No analytics data available'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refresh}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>School Analytics</Text>
        <TouchableOpacity onPress={() => {
          if (!analytics) { showAlert({ title: 'Export', message: 'No data to export yet.' }); return; }
          const name = (profile as any)?.school_name || (profile as any)?.preschool_name || 'School';
          exportAnalyticsPdf(analytics, name).catch(() => showAlert({ title: 'Error', message: 'Failed to export PDF.' }));
        }}>
          <Ionicons name="download-outline" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Period Selection */}
      <View style={styles.periodContainer}>
        {PERIODS.map((period) => (
          <TouchableOpacity
            key={period}
            style={[styles.periodButton, selectedPeriod === period && styles.periodButtonActive]}
            onPress={() => setSelectedPeriod(period)}
          >
            <Text style={[styles.periodText, selectedPeriod === period && styles.periodTextActive]}>
              {period.charAt(0).toUpperCase() + period.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Upgrade Banner */}
        {!isPremiumOrHigher && <UpgradeBanner theme={theme} />}

        {/* Key Metrics */}
        <KeyMetricsSection analytics={analytics} theme={theme} />

        {/* Enrollment Analytics */}
        <EnrollmentSection analytics={analytics} theme={theme} />

        {/* Financial Performance */}
        <FinancialSection analytics={analytics} theme={theme} />

        {/* Academic Insights */}
        <AcademicSection theme={theme} showAlert={showAlert} />

        {/* Recommended Actions */}
        <ActionsSection analytics={analytics} theme={theme} />

        {/* Bottom padding */}
        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
      <AlertModal {...alertProps} />
    </View>
  );
}

// Sub-components
const UpgradeBanner: React.FC<{ theme: any }> = ({ theme }) => (
  <View style={[styles_static.banner, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}>
    <Text style={[styles_static.bannerText, { color: theme.primary }]}>
      Unlock AI Insights & advanced analytics on the Premium plan
    </Text>
    <TouchableOpacity 
      style={[styles_static.bannerButton, { backgroundColor: theme.primary }]}
      onPress={() => navigateToUpgrade({ source: 'principal_analytics', reason: 'feature_needed' })}
    >
      <Text style={styles_static.bannerButtonText}>Upgrade</Text>
    </TouchableOpacity>
  </View>
);

const KeyMetricsSection: React.FC<{ analytics: AnalyticsData; theme: any }> = ({ analytics, theme }) => (
  <View style={[styles_static.section, { backgroundColor: theme.surface }]}>
    <Text style={[styles_static.sectionTitle, { color: theme.text }]}>Key Performance Indicators</Text>
    <View style={styles_static.metricsGrid}>
      <MetricCard
        value={analytics.enrollment.totalStudents.toString()}
        label="Total Students"
        change={`+${analytics.enrollment.newEnrollments} this month`}
        changeColor={analytics.enrollment.newEnrollments > 0 ? '#10B981' : '#EF4444'}
        theme={theme}
      />
      <MetricCard
        value={`${analytics.attendance.averageAttendance.toFixed(1)}%`}
        label="Avg Attendance"
        change={analytics.attendance.averageAttendance >= 90 ? '↗ Excellent' : analytics.attendance.averageAttendance >= 80 ? '→ Good' : '↘ Needs Attention'}
        changeColor={getStatusColor(analytics.attendance.averageAttendance, 85, 95)}
        theme={theme}
      />
      <MetricCard
        value={formatCurrency(analytics.finance.monthlyRevenue)}
        label="Monthly Revenue"
        change={`${analytics.finance.paymentRate.toFixed(0)}% payment rate`}
        changeColor="#10B981"
        theme={theme}
      />
      <MetricCard
        value={`${analytics.staff.studentTeacherRatio.toFixed(1)}:1`}
        label="Student:Teacher"
        change={analytics.staff.studentTeacherRatio <= 15 ? '✓ Optimal' : '⚠ Review needed'}
        changeColor={getStatusColor(20 - analytics.staff.studentTeacherRatio, 5, 10)}
        theme={theme}
      />
    </View>
  </View>
);

const MetricCard: React.FC<{ value: string; label: string; change: string; changeColor: string; theme: any }> = ({
  value, label, change, changeColor, theme
}) => (
  <View style={[styles_static.metricCard, { backgroundColor: theme.background }]}>
    <Text style={[styles_static.metricValue, { color: theme.text }]}>{value}</Text>
    <Text style={[styles_static.metricLabel, { color: theme.textSecondary }]}>{label}</Text>
    <Text style={[styles_static.metricChange, { color: changeColor }]}>{change}</Text>
  </View>
);

const EnrollmentSection: React.FC<{ analytics: AnalyticsData; theme: any }> = ({ analytics, theme }) => {
  const activeTotal = analytics.enrollment.ageGroupDistribution.reduce((s, g) => s + g.count, 0) || 1;
  return (
    <View style={[styles_static.section, { backgroundColor: theme.surface }]}>
      <Text style={[styles_static.sectionTitle, { color: theme.text }]}>Enrollment Analytics</Text>
      <View style={styles_static.analyticsGrid}>
        <AnalyticsCard value={`${analytics.enrollment.retentionRate.toFixed(1)}%`} label="Retention Rate" theme={theme} />
        <AnalyticsCard value={analytics.enrollment.newEnrollments.toString()} label="New Enrollments" theme={theme} />
        <AnalyticsCard value={analytics.enrollment.withdrawals.toString()} label="Withdrawals" theme={theme} />
      </View>

      <Text style={[styles_static.subsectionTitle, { color: theme.text }]}>Age Group Distribution</Text>
      {analytics.enrollment.ageGroupDistribution.length === 0 ? (
        <Text style={[styles_static.analyticsLabel, { color: theme.textSecondary, marginTop: 8 }]}>
          No age group data available. Configure age groups in Settings.
        </Text>
	      ) : (
	        analytics.enrollment.ageGroupDistribution.map((group, index) => {
	          const color = getAgeGroupColor(group.ageGroup, 'preschool');
	          const pct = Math.round((group.count / activeTotal) * 100);
          const pctWidth = clampPercent(pct, { source: 'principal-analytics.age-group-distribution' });
	          return (
	            <View key={index} style={[styles_static.distributionRow, { marginBottom: 10 }]}>
	              <View style={[styles_static.ageGroupDot, { backgroundColor: color }]} />
	              <Text style={[styles_static.distributionLabel, { color: theme.text, flex: 1 }]}>{group.ageGroup}</Text>
	              <View style={[styles_static.distributionBar, { backgroundColor: theme.border, flex: 2 }]}>
	                <View style={[styles_static.distributionFill, { width: `${pctWidth}%`, backgroundColor: color }]} />
	              </View>
              <Text style={[styles_static.distributionValue, { color: theme.text, minWidth: 36, textAlign: 'right' }]}>
                {group.count} <Text style={{ color: theme.textSecondary, fontSize: 11 }}>({pct}%)</Text>
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
};

const AnalyticsCard: React.FC<{ value: string; label: string; theme: any; color?: string }> = ({
  value, label, theme, color
}) => (
  <View style={[styles_static.analyticsCard, { backgroundColor: theme.background }]}>
    <Text style={[styles_static.analyticsValue, { color: color || theme.text }]}>{value}</Text>
    <Text style={[styles_static.analyticsLabel, { color: theme.textSecondary }]}>{label}</Text>
  </View>
);

const FinancialSection: React.FC<{ analytics: AnalyticsData; theme: any }> = ({ analytics, theme }) => (
  <View style={[styles_static.section, { backgroundColor: theme.surface }]}>
    <Text style={[styles_static.sectionTitle, { color: theme.text }]}>Financial Performance</Text>
    <View style={styles_static.analyticsGrid}>
      <AnalyticsCard value={formatCurrency(analytics.finance.monthlyRevenue)} label="Revenue" theme={theme} color="#10B981" />
      <AnalyticsCard value={formatCurrency(analytics.finance.outstandingFees)} label="Outstanding" theme={theme} color="#EF4444" />
      <AnalyticsCard value={`${analytics.finance.paymentRate.toFixed(1)}%`} label="Payment Rate" theme={theme} />
    </View>
  </View>
);

const AcademicSection: React.FC<{ theme: any; showAlert: (cfg: { title: string; message: string }) => void }> = ({ theme, showAlert }) => {
  const handleContactSupport = () => {
    const message = encodeURIComponent('Hi, I need help setting up academic insights and assessment tracking for my school.');
    const waUrl = `whatsapp://send?phone=27674770975&text=${message}`;
    const webUrl = `https://wa.me/27674770975?text=${message}`;
    
    Linking.canOpenURL('whatsapp://send').then(supported => {
      Linking.openURL(supported ? waUrl : webUrl);
    }).catch(() => {
      showAlert({ title: 'Error', message: 'Unable to open WhatsApp. Please contact support@edudashpro.com' });
    });
  };

  return (
    <View style={[styles_static.section, { backgroundColor: theme.surface }]}>
      <Text style={[styles_static.sectionTitle, { color: theme.text }]}>Academic Insights</Text>
      <View style={[styles_static.insightCard, { backgroundColor: theme.background, borderLeftColor: theme.primary }]}>
        <Text style={[styles_static.insightTitle, { color: theme.text }]}>Assessment Data Coming Soon</Text>
        <Text style={[styles_static.insightText, { color: theme.textSecondary }]}>• Academic assessments and progress tracking are being set up</Text>
        <Text style={[styles_static.insightText, { color: theme.textSecondary }]}>• Parent engagement metrics will be available once configured</Text>
        <TouchableOpacity style={[styles_static.insightButton, { backgroundColor: theme.primary }]} onPress={handleContactSupport}>
          <Text style={styles_static.insightButtonText}>Contact Support</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const ActionsSection: React.FC<{ analytics: AnalyticsData; theme: any }> = ({ analytics, theme }) => (
  <View style={[styles_static.section, { backgroundColor: theme.surface }]}>
    <Text style={[styles_static.sectionTitle, { color: theme.text }]}>Recommended Actions</Text>
    <View style={styles_static.actionsList}>
      {analytics.attendance.lowAttendanceAlerts > 0 && (
        <ActionItem icon="warning" color="#F59E0B" text={`${analytics.attendance.lowAttendanceAlerts} students have low attendance - consider parent meetings`} theme={theme} />
      )}
      {analytics.finance.paymentRate < 90 && (
        <ActionItem icon="card" color="#EF4444" text="Payment rate below 90% - send payment reminders" theme={theme} />
      )}
      {analytics.staff.studentTeacherRatio > 20 && (
        <ActionItem icon="people" color="#7C3AED" text="Consider hiring additional teachers to improve ratios" theme={theme} />
      )}
      {analytics.attendance.lowAttendanceAlerts === 0 && analytics.finance.paymentRate >= 90 && analytics.staff.studentTeacherRatio <= 20 && (
        <ActionItem icon="checkmark-circle" color="#10B981" text="All metrics are healthy! Keep up the great work." theme={theme} />
      )}
    </View>
  </View>
);

const ActionItem: React.FC<{ icon: string; color: string; text: string; theme: any }> = ({ icon, color, text, theme }) => (
  <View style={styles_static.actionItem}>
    <Ionicons name={icon as any} size={20} color={color} />
    <Text style={[styles_static.actionText, { color: theme.text }]}>{text}</Text>
  </View>
);

// Dynamic styles (theme-dependent)
const createStyles = (theme: any, insets: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16, color: theme.textSecondary, marginTop: 12 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 16, color: theme.textSecondary, marginTop: 12, textAlign: 'center' },
  retryButton: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: theme.primary, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, paddingTop: insets.top + 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: theme.text },
  periodContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, gap: 8 },
  periodButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border },
  periodButtonActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  periodText: { fontSize: 14, color: theme.textSecondary, fontWeight: '500' },
  periodTextActive: { color: '#fff' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
});

// Static styles (non-theme-dependent)
const styles_static = StyleSheet.create({
  banner: { margin: 16, padding: 12, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerText: { fontWeight: '600', flex: 1, marginRight: 12 },
  bannerButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  bannerButtonText: { color: '#fff', fontWeight: '700' },
  section: { margin: 16, marginTop: 0, borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  subsectionTitle: { fontSize: 16, fontWeight: '500', marginTop: 16, marginBottom: 12 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  metricCard: { width: '48%', padding: 16, borderRadius: 8, marginBottom: 12 },
  metricValue: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  metricLabel: { fontSize: 12, marginBottom: 4 },
  metricChange: { fontSize: 10, fontWeight: '500' },
  analyticsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  analyticsCard: { flex: 1, padding: 12, borderRadius: 8, marginHorizontal: 4, alignItems: 'center' },
  analyticsValue: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  analyticsLabel: { fontSize: 11, textAlign: 'center' },
  distributionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  distributionLabel: { width: 80, fontSize: 12 },
  distributionBar: { flex: 1, height: 8, borderRadius: 4, marginHorizontal: 8 },
  distributionFill: { height: '100%', borderRadius: 4 },
  distributionValue: { width: 30, fontSize: 12, textAlign: 'right' },
  ageGroupDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  insightCard: { padding: 16, borderRadius: 8, borderLeftWidth: 4 },
  insightTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  insightText: { fontSize: 14, marginBottom: 6, lineHeight: 20 },
  insightButton: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignSelf: 'flex-start' },
  insightButtonText: { color: '#fff', fontWeight: '600' },
  actionsList: { gap: 12 },
  actionItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  actionText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
