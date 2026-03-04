/**
 * K-12 School Admin Dashboard
 * 
 * Dashboard for K-12 schools (Grade R to Grade 12) like EduDash Pro Community School.
 * Focused on:
 * - Aftercare program management
 * - Grade-based student organization (R-12)
 * - Attendance tracking
 * - Payment management
 * - Birthday tracking
 * 
 * Different from preschool dashboard which focuses on early childhood education.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { assertSupabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { useFinancePrivacyMode } from '@/hooks/useFinancePrivacyMode';

// Extracted components
import {
  K12StatsOverview,
  K12GradeBreakdown,
  K12QuickActions,
  K12RecentRegistrations,
  type AftercareStat,
  type GradeCount,
  type Registration,
  type QuickAction,
} from './k12';

// Birthday widget
import { UpcomingBirthdaysCard } from './UpcomingBirthdaysCard';
import { useBirthdayPlanner } from '@/hooks/useBirthdayPlanner';
import { BirthdayDonationSummaryCard } from './principal/BirthdayDonationSummaryCard';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export function K12AdminDashboard() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<AftercareStat>({ total: 0, pendingPayment: 0, paid: 0, enrolled: 0 });
  const [gradeBreakdown, setGradeBreakdown] = useState<GradeCount[]>([]);
  const [recentRegistrations, setRecentRegistrations] = useState<Registration[]>([]);
  const [schoolName, setSchoolName] = useState<string>('Loading...');
  const { hideFeesOnDashboards } = useFinancePrivacyMode();
  
  const styles = useMemo(() => createStyles(theme, insets.top), [theme, insets.top]);
  
  const organizationId = profile?.organization_id || profile?.preschool_id;
  const userName = profile?.first_name || user?.user_metadata?.first_name || 'Admin';
  
  // Birthday planner hook
  const { birthdays, loading: birthdaysLoading, refresh: refreshBirthdays } = useBirthdayPlanner({
    preschoolId: organizationId,
    daysAhead: 30,
  });
  
  // Get greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const loadDashboardData = useCallback(async () => {
    if (!organizationId) return;
    
    try {
      const supabase = assertSupabase();
      
      // Fetch school name
      const { data: schoolData, error: schoolError } = await supabase
        .from('preschools')
        .select('name, school_type')
        .eq('id', organizationId)
        .single();
      
      if (!schoolError && schoolData) {
        setSchoolName(schoolData.name);
      } else {
        setSchoolName('EduDash Pro School');
        console.warn('[K12Dashboard] Could not fetch school name:', schoolError);
      }
      
      // Fetch aftercare registrations stats
      const { data: registrations, error } = await supabase
        .from('aftercare_registrations')
        .select('id, status, child_grade, child_first_name, child_last_name, created_at')
        .eq('preschool_id', organizationId)
        .order('created_at', { ascending: false });
      
      if (error && error.code !== '42P01') {
        console.error('[K12Dashboard] Error fetching registrations:', error);
      }
      
      const data = registrations || [];
      
      // Calculate stats
      setStats({
        total: data.length,
        pendingPayment: data.filter(r => r.status === 'pending_payment').length,
        paid: data.filter(r => r.status === 'paid').length,
        enrolled: data.filter(r => r.status === 'enrolled').length,
      });
      
      // Grade breakdown
      const grades: Record<string, number> = {};
      data.forEach(r => {
        const grade = r.child_grade || 'Unknown';
        grades[grade] = (grades[grade] || 0) + 1;
      });
      
      // Sort grades properly (R, 1, 2, ... 12)
      const gradeOrder = ['R', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
      const sortedGrades = Object.entries(grades)
        .map(([grade, count]) => ({ grade, count }))
        .sort((a, b) => {
          const aIdx = gradeOrder.indexOf(a.grade);
          const bIdx = gradeOrder.indexOf(b.grade);
          if (aIdx === -1 && bIdx === -1) return 0;
          if (aIdx === -1) return 1;
          if (bIdx === -1) return -1;
          return aIdx - bIdx;
        });
      
      setGradeBreakdown(sortedGrades);
      
      // Recent registrations (last 5)
      setRecentRegistrations(data.slice(0, 5));
      
    } catch (err) {
      console.error('[K12Dashboard] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboardData();
    refreshBirthdays();
  }, [loadDashboardData, refreshBirthdays]);

  // Quick actions for K-12 admin
  const quickActions: QuickAction[] = useMemo(() => {
    const flags = getFeatureFlagsSync();
    const canLiveLessons = flags.live_lessons_enabled || flags.group_calls_enabled;

    const paymentCount = hideFeesOnDashboards ? 0 : stats.pendingPayment;
    return [
      {
        id: 'aftercare',
        title: 'Aftercare Registrations',
        icon: 'time-outline',
        color: '#8B5CF6',
        badge: paymentCount > 0 ? paymentCount : undefined,
        onPress: () => router.push('/screens/aftercare-admin'),
      },
      {
        id: 'students',
        title: 'Students',
        icon: 'people-outline',
        color: '#3B82F6',
        badge: stats.enrolled,
        onPress: () => router.push('/screens/student-management'),
      },
      {
        id: 'attendance',
        title: 'Attendance',
        icon: 'checkbox-outline',
        color: '#10B981',
        onPress: () => router.push('/screens/attendance'),
      },
      ...(!hideFeesOnDashboards ? [{
        id: 'payments',
        title: 'Payments',
        icon: 'card-outline',
        color: '#F59E0B',
        badge: stats.pendingPayment > 0 ? stats.pendingPayment : undefined,
        onPress: () => router.push('/screens/financial-transactions'),
      }] : []),
      {
        id: 'uniform-orders',
        title: 'Uniform Orders',
        icon: 'shirt-outline',
        color: '#0EA5E9',
        onPress: () => router.push('/screens/principal-uniforms'),
      },
      {
        id: 'announcements',
        title: 'Announcements',
        icon: 'megaphone-outline',
        color: '#EC4899',
        onPress: () => router.push('/screens/principal-announcement'),
      },
      {
        id: 'dash-advisor',
        title: 'Dash AI Advisor',
        icon: 'sparkles-outline',
        color: '#7C3AED',
        onPress: () => router.push('/screens/dash-voice?mode=advisor'),
      },
      {
        id: 'social-agent',
        title: 'Social Agent',
        icon: 'logo-facebook',
        color: '#1877F2',
        onPress: () => router.push('/screens/principal-social-agent'),
      },
      {
        id: 'calendar',
        title: 'Calendar',
        icon: 'calendar-outline',
        color: '#06B6D4',
        onPress: () => router.push('/screens/calendar'),
      },
      ...(canLiveLessons ? [{
        id: 'live-lessons',
        title: 'Live Lessons',
        icon: 'videocam-outline',
        color: '#F97316',
        onPress: () => router.push('/screens/start-live-lesson'),
      }] : []),
      {
        id: 'groups',
        title: 'Groups',
        icon: 'people-circle-outline',
        color: '#14B8A6',
        onPress: () => router.push('/screens/group-management'),
      },
      {
        id: 'messages',
        title: 'Messages',
        icon: 'chatbubbles-outline',
        color: '#6366F1',
        onPress: () => router.push('/screens/principal-messages'),
      },
      {
        id: 'settings',
        title: 'Settings',
        icon: 'settings-outline',
        color: '#64748B',
        onPress: () => router.push('/screens/school-settings'),
      },
    ];
  }, [hideFeesOnDashboards, stats.pendingPayment, stats.enrolled]);

  const visibleStats = useMemo(
    () => ({
      ...stats,
      pendingPayment: hideFeesOnDashboards ? 0 : stats.pendingPayment,
    }),
    [hideFeesOnDashboards, stats]
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <EduDashSpinner size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* 1. Header - Welcome section always first */}
      <LinearGradient
        colors={['#1E3A5F', '#0F172A']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Text style={styles.greeting}>{greeting},</Text>
          <Text style={styles.userName}>{userName} 👋</Text>
          <Text style={styles.schoolName}>{schoolName}</Text>
          <View style={styles.schoolTypeBadge}>
            <Text style={styles.schoolTypeText}>K-12 School • Grade R to Grade 12</Text>
          </View>
        </View>
      </LinearGradient>

      {/* 2. Quick Actions - Urgent tasks requiring attention (badges show pending items) */}
      <K12QuickActions actions={quickActions} theme={theme} />

      {/* 3. Recent Registrations - What needs review now */}
      <K12RecentRegistrations registrations={recentRegistrations} theme={theme} />

      {/* 4. Upcoming Birthdays - Time-sensitive celebrations */}
      <View style={styles.section}>
        <UpcomingBirthdaysCard
          birthdays={birthdays}
          loading={birthdaysLoading}
          maxItems={5}
          onViewAll={() => router.push('/screens/birthday-chart')}
        />
      </View>

      {/* 4b. Birthday Donations Summary */}
      <View style={styles.section}>
        <BirthdayDonationSummaryCard organizationId={organizationId} />
      </View>

      {/* 5. Stats Overview - Summary metrics */}
      <K12StatsOverview stats={visibleStats} theme={theme} />

      {/* 6. Grade Breakdown - Reference data */}
      <K12GradeBreakdown gradeBreakdown={gradeBreakdown} theme={theme} />

      {/* Bottom padding */}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const createStyles = (theme: any, topInset: number) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.background,
    gap: 16,
  },
  loadingText: {
    color: theme.textSecondary,
    fontSize: 16,
  },
  header: {
    paddingTop: topInset + 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    gap: 4,
  },
  greeting: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  schoolName: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 8,
  },
  schoolTypeBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  schoolTypeText: {
    color: '#C4B5FD',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
});

export default K12AdminDashboard;
