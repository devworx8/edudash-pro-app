/**
 * Youth Reports Screen
 * Analytics and reports for Youth President dashboard
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { DashboardWallpaperBackground } from '@/components/membership/dashboard';
import { useYouthReports, MONTHLY_DATA, formatCurrency, formatNumber } from '@/hooks/membership/useYouthReports';
import { styles } from '@/components/membership/styles/reports.styles';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { percentWidth } from '@/lib/progress/clampPercent';
type PeriodType = 'week' | 'month' | 'quarter' | 'year';
const PERIODS: { key: PeriodType; label: string }[] = [
  { key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }, { key: 'quarter', label: 'Quarter' }, { key: 'year', label: 'Year' },
];

export default function YouthReportsScreen() {
  const { theme } = useTheme();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('month');
  const { reportData, isLoading, isRefreshing, refetch } = useYouthReports(selectedPeriod);

  const maxMembers = Math.max(...MONTHLY_DATA.map(d => d.members));

  if (isLoading) {
    return <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}><View style={styles.loadingContainer}><EduDashSpinner size="large" color="#10B981" /><Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading reports...</Text></View></SafeAreaView>;
  }

  return (
    <DashboardWallpaperBackground>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={[styles.header, { backgroundColor: theme.card }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={24} color={theme.text} /></TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Reports & Analytics</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>Youth Wing Performance</Text>
          </View>
          <TouchableOpacity style={[styles.exportButton, { backgroundColor: '#10B981' + '20' }]}><Ionicons name="download-outline" size={24} color="#10B981" /></TouchableOpacity>
        </View>

        <View style={styles.periodSelector}>
          {PERIODS.map((p) => <TouchableOpacity key={p.key} style={[styles.periodOption, { backgroundColor: selectedPeriod === p.key ? '#10B981' : theme.card }]} onPress={() => setSelectedPeriod(p.key)}><Text style={[styles.periodText, { color: selectedPeriod === p.key ? '#fff' : theme.text }]}>{p.label}</Text></TouchableOpacity>)}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refetch} colors={['#10B981']} tintColor="#10B981" />}>
          {/* Membership Stats */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#10B981' + '20' }]}><Ionicons name="people" size={24} color="#10B981" /></View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Membership</Text>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: theme.text }]}>{formatNumber(reportData?.membershipStats.totalMembers || 0)}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total Members</Text></View>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: theme.text }]}>{formatNumber(reportData?.membershipStats.activeMembers || 0)}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Active</Text></View>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: '#10B981' }]}>+{reportData?.membershipStats.newThisMonth || 0}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>New This Month</Text></View>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: '#10B981' }]}>{reportData?.membershipStats.growth || 0}%</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Growth Rate</Text></View>
            </View>
          </View>

          {/* Chart */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
            <View style={styles.chartContainer}>
              <Text style={[styles.chartTitle, { color: theme.text }]}>Member Growth Trend</Text>
              <View style={styles.barChart}>
                {MONTHLY_DATA.map((item) => (
                  <View key={item.month} style={styles.barItem}>
                    <View style={styles.barWrapper}><View style={[styles.bar, { height: (item.members / maxMembers) * 120, backgroundColor: '#10B981' }]} /></View>
                    <Text style={[styles.barLabel, { color: theme.textSecondary }]}>{item.month}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Programs Stats */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#3B82F6' + '20' }]}><Ionicons name="folder" size={24} color="#3B82F6" /></View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Programs</Text>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: theme.text }]}>{reportData?.programStats.totalPrograms || 0}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total Programs</Text></View>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: '#10B981' }]}>{reportData?.programStats.activePrograms || 0}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Active</Text></View>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: '#3B82F6' }]}>{reportData?.programStats.completedPrograms || 0}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Completed</Text></View>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: theme.text }]}>{formatNumber(reportData?.programStats.totalParticipants || 0)}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Participants</Text></View>
            </View>
          </View>

          {/* Financial Stats */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#F59E0B' + '20' }]}><Ionicons name="wallet" size={24} color="#F59E0B" /></View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Financial</Text>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: theme.text }]}>{formatCurrency(reportData?.financialStats.budgetAllocated || 0).replace('ZAR', 'R')}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Allocated</Text></View>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: '#10B981' }]}>{formatCurrency(reportData?.financialStats.budgetSpent || 0).replace('ZAR', 'R')}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Spent</Text></View>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: '#F59E0B' }]}>{formatCurrency(reportData?.financialStats.pendingRequests || 0).replace('ZAR', 'R')}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Pending</Text></View>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: theme.text }]}>{reportData?.financialStats.utilizationRate || 0}%</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Utilization</Text></View>
            </View>
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { backgroundColor: theme.border }]}><View style={[styles.progressFill, { width: percentWidth(reportData?.financialStats.utilizationRate || 0), backgroundColor: '#10B981' }]} /></View>
              <Text style={[styles.progressText, { color: theme.textSecondary }]}>Budget Utilization</Text>
            </View>
          </View>

          {/* Engagement Stats */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#8B5CF6' + '20' }]}><Ionicons name="pulse" size={24} color="#8B5CF6" /></View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Engagement</Text>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: theme.text }]}>{reportData?.engagementStats.eventsHosted || 0}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Events Hosted</Text></View>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: theme.text }]}>{reportData?.engagementStats.averageAttendance || 0}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Avg Attendance</Text></View>
              <View style={styles.statItem}><View style={styles.ratingContainer}><Text style={[styles.statValue, { color: '#F59E0B' }]}>{reportData?.engagementStats.feedbackScore || 0}</Text><Ionicons name="star" size={18} color="#F59E0B" /></View><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Rating</Text></View>
              <View style={styles.statItem}><Text style={[styles.statValue, { color: theme.text }]}>{formatNumber(reportData?.engagementStats.socialReach || 0)}</Text><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Social Reach</Text></View>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.card }]}><Ionicons name="document-text" size={24} color="#10B981" /><Text style={[styles.actionText, { color: theme.text }]}>Generate Report</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.card }]}><Ionicons name="share-social" size={24} color="#3B82F6" /><Text style={[styles.actionText, { color: theme.text }]}>Share</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </DashboardWallpaperBackground>
  );
}
