/**
 * New Enhanced Teacher Dashboard - Modern UI/UX Implementation
 *
 * Features:
 * - Clean grid-based layout with improved visual hierarchy
 * - Mobile-first responsive design with <2s load time
 * - Modern card design with subtle shadows and rounded corners
 * - Streamlined quick actions with contextual grouping
 * - Better information architecture with progressive disclosure
 * - Enhanced loading states and error handling
 * - Optimized for touch interfaces and accessibility
 */

import React, { useMemo, useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  useWindowDimensions,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTeacherDashboard } from '@/hooks/useDashboardData';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { track } from '@/lib/analytics';
import { getTierColor, getTierLabel } from '@/lib/utils/tierUtils';
import {
  createTeacherDashboardStyles,
  getLayoutMetrics,
} from '@/components/dashboard/teacher/teacherDashboard.styles';
import { PendingParentLinkRequests } from '@/components/dashboard/PendingParentLinkRequests';
import { TeacherMetricsCard } from '@/components/dashboard/teacher/TeacherMetricsCard';
import { TeacherQuickActionCard } from '@/components/dashboard/teacher/TeacherQuickActionCard';
import { BirthdayDonationRegister } from '@/components/dashboard/teacher/BirthdayDonationRegister';
import {
  useNewEnhancedTeacherState,
  type TeacherQuickAction,
} from '@/hooks/useNewEnhancedTeacherState';
import { useUnreadMessages } from '@/contexts/NotificationContext';
import { useQuery } from '@tanstack/react-query';
import { ParentJoinService } from '@/lib/services/parentJoinService';
import { useTeacherStudents } from '@/hooks/useTeacherStudents';
import { CollapsibleSection, StudentSummaryCard } from '@/components/dashboard/shared';
import { TeachTodaySuggestionOptimized as TeachTodaySuggestion } from '@/components/dashboard/teacher/TeachTodaySuggestionOptimized';
import { scheduleTeacherRoutineReminders } from '@/lib/dashboard/teacherRoutineReminders';
import { router } from 'expo-router';

interface NewEnhancedTeacherDashboardProps {
  refreshTrigger?: number;
}

export const NewEnhancedTeacherDashboard: React.FC<NewEnhancedTeacherDashboardProps> = () => {
  const { user, profile } = useAuth();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getLayoutMetrics(width), [width]);
  const [routineReminderStatus, setRoutineReminderStatus] = useState<string | null>(null);

  const styles = useMemo(
    () => createTeacherDashboardStyles(theme, insets.top, insets.bottom, layout),
    [theme, insets.top, insets.bottom, layout],
  );

  // Clear any stuck dashboardSwitching flag on mount to prevent loading issues after hot reload
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).dashboardSwitching) {
      if (__DEV__) console.log('[TeacherDashboard] Clearing stuck dashboardSwitching flag');
      delete (window as any).dashboardSwitching;
    }
  }, []);

  // State management hook
  const state = useNewEnhancedTeacherState();

  const {
    data: dashboardData,
    loading,
    error,
    refresh,
    isLoadingFromCache,
  } = useTeacherDashboard();

  const organizationId = profile?.organization_id || (profile as any)?.preschool_id || null;
  const isStandaloneTeacher = !organizationId;
  const { students: allTeacherStudents, loading: teacherStudentsLoading } = useTeacherStudents({
    teacherId: user?.id || null,
    organizationId,
    limit: 0,
  });
  const teacherStudents = allTeacherStudents.slice(0, 4);

  const unreadMessageCount = useUnreadMessages();

  const { data: pendingLinkRequests } = useQuery({
    queryKey: ['pending-parent-link-requests', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      return await ParentJoinService.listPendingForSchoolWithDetails(organizationId);
    },
    enabled: !!organizationId,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
  const pendingLinkRequestCount = pendingLinkRequests?.length ?? 0;

  const _hasBirthdaysThisMonth = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    return allTeacherStudents.some((s) => {
      if (!s.dateOfBirth) return false;
      const dob = new Date(s.dateOfBirth);
      return dob.getMonth() === currentMonth;
    });
  }, [allTeacherStudents]);

  // Build metrics and actions from state
  const metrics = state.buildMetrics(dashboardData);
  const quickActions = state.buildQuickActions();

  const classSummary = useMemo(() => {
    const classes = dashboardData?.myClasses || [];
    const totalStudents =
      dashboardData?.totalStudents ||
      classes.reduce(
        (sum: number, cls: { studentCount?: number }) => sum + (cls.studentCount || 0),
        0,
      );
    const presentToday = classes.reduce(
      (sum: number, cls: { presentToday?: number }) => sum + (cls.presentToday || 0),
      0,
    );
    const attendanceRate = totalStudents > 0 ? Math.round((presentToday / totalStudents) * 100) : 0;
    const classCount = classes.length;

    return {
      totalStudents,
      presentToday,
      attendanceRate,
      classCount,
      nextClass: classes[0] || null,
    };
  }, [dashboardData]);

  const openTutorMode = useCallback(() => {
    track('teacher.dashboard.tutor_mode_open', {
      user_id: user?.id,
      source: 'teacher_dashboard',
    });
    router.push({
      pathname: '/screens/dash-assistant',
      params: {
        source: 'teacher_dashboard',
        mode: 'tutor',
        tutorMode: 'diagnostic',
      },
    } as any);
  }, [user?.id]);

  const openTeacherInviteAccept = useCallback(() => {
    track('teacher.dashboard.join_school_invite_open', {
      user_id: user?.id,
      source: 'teacher_dashboard_standalone',
    });
    router.push('/screens/teacher-invite-accept' as any);
  }, [user?.id]);

  const openJoinByCode = useCallback(() => {
    track('teacher.dashboard.join_school_code_open', {
      user_id: user?.id,
      source: 'teacher_dashboard_standalone',
    });
    router.push('/screens/student-join-by-code' as any);
  }, [user?.id]);

  const openDailyProgramPlanner = useCallback(() => {
    track('teacher.dashboard.daily_program_open', {
      user_id: user?.id,
      source: 'teacher_dashboard',
      has_today_routine: !!dashboardData?.todayRoutine,
    });

    const routine = dashboardData?.todayRoutine;
    router.push({
      pathname: '/screens/teacher-daily-program-planner',
      params: routine
        ? {
            weekStartDate: routine.weekStartDate,
            termId: routine.termId || undefined,
            themeId: routine.themeId || undefined,
          }
        : undefined,
    } as any);
  }, [dashboardData?.todayRoutine, user?.id]);

  const handleScheduleRoutineReminders = useCallback(async () => {
    const routine = dashboardData?.todayRoutine;
    if (!routine) {
      setRoutineReminderStatus(
        t('teacher.routine_reminders_no_program', {
          defaultValue: 'No daily routine found for today.',
        }),
      );
      return;
    }

    setRoutineReminderStatus(
      t('teacher.routine_reminders_scheduling', { defaultValue: 'Scheduling reminders...' }),
    );
    try {
      const result = await scheduleTeacherRoutineReminders(routine);
      setRoutineReminderStatus(
        t('teacher.routine_reminders_done', {
          defaultValue: '{{count}} reminders scheduled',
          count: result.scheduled,
        }),
      );
      track('teacher.dashboard.daily_program_reminders_scheduled', {
        user_id: user?.id,
        source: 'teacher_dashboard',
        weekly_program_id: routine.weeklyProgramId,
        scheduled: result.scheduled,
        skipped: result.skipped,
      });
    } catch (error) {
      console.warn('[TeacherDashboard] Failed to schedule routine reminders:', error);
      setRoutineReminderStatus(
        t('teacher.routine_reminders_failed', {
          defaultValue: 'Could not schedule reminders right now.',
        }),
      );
    }
  }, [dashboardData?.todayRoutine, t, user?.id]);

  const assignmentRows = dashboardData?.recentAssignments || [];

  const recentActivityRows = useMemo(() => {
    const assignments = (dashboardData?.recentAssignments || []).map((assignment) => ({
      id: `assignment-${assignment.id}`,
      title: assignment.title,
      subtitle:
        assignment.status === 'graded'
          ? t('teacher.assignment_graded', { defaultValue: 'Assignment graded' })
          : assignment.status === 'overdue'
            ? t('teacher.assignment_overdue', { defaultValue: 'Assignment overdue' })
            : t('teacher.assignment_review', { defaultValue: 'Review in progress' }),
      timestamp: assignment.dueDate,
      icon: 'document-text-outline' as const,
      color:
        assignment.status === 'graded'
          ? theme.success
          : assignment.status === 'overdue'
            ? theme.warning
            : theme.primary,
    }));

    const events = (dashboardData?.upcomingEvents || []).map((event) => ({
      id: `event-${event.id}`,
      title: event.title,
      subtitle: t('teacher.school_event', { defaultValue: 'School event' }),
      timestamp: event.time,
      icon: 'calendar-outline' as const,
      color: theme.secondary,
    }));

    return [...assignments, ...events].slice(0, 5);
  }, [dashboardData, t, theme.primary, theme.secondary, theme.success, theme.warning]);

  const highlightItems = useMemo(() => {
    return [
      {
        id: 'next_lesson',
        label: t('teacher.next_lesson', { defaultValue: 'Next Lesson' }),
        value:
          classSummary.nextClass?.name || t('teacher.no_class', { defaultValue: 'No class yet' }),
        sub:
          classSummary.nextClass?.nextLesson ||
          t('teacher.no_upcoming_lessons', { defaultValue: 'No upcoming lesson' }),
        icon: 'time-outline' as const,
        color: theme.primary,
      },
      {
        id: 'attendance',
        label: t('teacher.attendance_today', { defaultValue: 'Attendance' }),
        value: `${classSummary.attendanceRate}%`,
        sub:
          classSummary.totalStudents > 0
            ? `${classSummary.presentToday}/${classSummary.totalStudents} ${t('teacher.present', { defaultValue: 'present' })}`
            : t('teacher.no_students', { defaultValue: 'No students yet' }),
        icon: 'checkmark-circle-outline' as const,
        color: theme.success,
      },
      {
        id: 'pending_grading',
        label: t('teacher.pending_grading', { defaultValue: 'Pending Grading' }),
        value: String(dashboardData?.pendingGrading ?? 0),
        sub: t('teacher.needs_review', { defaultValue: 'Needs review' }),
        icon: 'document-text-outline' as const,
        color: theme.warning,
      },
    ];
  }, [dashboardData, t, theme, classSummary]);

  const groupedActions = useMemo(() => {
    const groups: Record<string, TeacherQuickAction[]> = {};
    quickActions.forEach((action) => {
      if (!action) return;
      const category = action.category || 'other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(action);
    });
    return groups;
  }, [quickActions]);

  const actionSections = useMemo(
    () => [
      {
        id: 'lessons',
        title: t('teacher.actions_lessons', { defaultValue: 'Lessons & Activities' }),
        icon: 'book-outline',
      },
      {
        id: 'classroom',
        title: t('teacher.actions_classroom', { defaultValue: 'Classroom' }),
        icon: 'school-outline',
      },
      {
        id: 'communication',
        title: t('teacher.actions_communication', { defaultValue: 'Communication' }),
        icon: 'chatbubbles-outline',
      },
      {
        id: 'reports',
        title: t('teacher.student_insights', { defaultValue: 'Student Insights' }),
        icon: 'bar-chart-outline',
      },
      {
        id: 'ai',
        title: t('teacher.advanced_tools', { defaultValue: 'Advanced Tools' }),
        icon: 'sparkles-outline',
      },
    ],
    [t],
  );

  if (loading && !dashboardData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loadingText}>
          {t('common.loading', { defaultValue: 'Loading dashboard...' })}
        </Text>
        {isLoadingFromCache && (
          <Text style={[styles.loadingText, { fontSize: 12, marginTop: 4 }]}>
            {t('common.loading_cached', { defaultValue: 'Loading cached data...' })}
          </Text>
        )}
      </View>
    );
  }

  if (error && !dashboardData) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.error || '#DC2626'} />
        <Text
          style={[
            styles.loadingText,
            { color: theme.error || '#DC2626', fontWeight: '600', marginTop: 12 },
          ]}
        >
          {t('common.error_title', { defaultValue: 'Something went wrong' })}
        </Text>
        <Text style={[styles.loadingText, { fontSize: 13, marginTop: 4 }]}>{error}</Text>
        <TouchableOpacity
          onPress={refresh}
          style={[styles.retryButton, { backgroundColor: theme.primary }]}
        >
          <Text style={styles.retryButtonText}>
            {t('common.retry', { defaultValue: 'Try Again' })}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={() =>
              state.handleRefresh(async () => {
                await Promise.resolve(refresh());
              })
            }
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Enhanced Header Card */}
        <View style={styles.headerCard}>
          <LinearGradient
            colors={['#23214D', '#5A409D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.greetingTextContainer}>
                <Text style={styles.greeting}>{state.getGreeting()}</Text>
                <Text style={styles.subtitle}>{state.getContextualSubtitle(dashboardData)}</Text>
              </View>

              <View style={styles.heroSummaryRow}>
                <View style={styles.heroMetricPrimary}>
                  <Text style={styles.heroMetricPrimaryValue}>{classSummary.totalStudents}</Text>
                  <Text style={styles.heroMetricPrimaryLabel}>
                    {t('teacher.total_students', { defaultValue: 'Total students' })}
                  </Text>
                </View>
                <View style={styles.heroMetricDivider} />
                <View style={styles.heroMetricStack}>
                  <Text style={styles.heroGrowthText}>
                    {classSummary.classCount} {t('teacher.classes', { defaultValue: 'Classes' })}
                  </Text>
                  <Text style={styles.heroAttendanceText}>
                    {t('teacher.attendance_today', { defaultValue: 'Attendance' })}:{' '}
                    {classSummary.attendanceRate}%
                  </Text>
                </View>
              </View>

              {/* School info with tier badge */}
              {dashboardData?.schoolName && (
                <View style={styles.schoolCard}>
                  <View style={styles.schoolIconContainer}>
                    <Text style={styles.schoolIcon}>🏫</Text>
                  </View>
                  <View style={styles.schoolTextContainer}>
                    <Text style={styles.schoolLabel}>
                      {t('teacher.your_school', { defaultValue: 'Your School' })}
                    </Text>
                    <Text style={styles.schoolName}>{dashboardData.schoolName}</Text>
                  </View>
                  {dashboardData?.schoolTier && (
                    <View
                      style={[
                        styles.tierBadge,
                        { backgroundColor: getTierColor(dashboardData.schoolTier, theme) },
                      ]}
                    >
                      <Text style={styles.tierBadgeText}>
                        {getTierLabel(dashboardData.schoolTier)}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </LinearGradient>
        </View>

        {isStandaloneTeacher && (
          <View style={styles.standaloneCard}>
            <View style={styles.standaloneHeaderRow}>
              <View style={styles.standaloneIconWrap}>
                <Ionicons name="school-outline" size={18} color={theme.primary} />
              </View>
              <Text style={styles.standaloneTitle}>
                {t('teacher.standalone_workspace_active', {
                  defaultValue: 'Standalone Workspace Active',
                })}
              </Text>
            </View>
            <Text style={styles.standaloneDescription}>
              {t('teacher.standalone_workspace_hint', {
                defaultValue:
                  'You can keep teaching independently. Join a school anytime using a principal invite token or school code.',
              })}
            </Text>
            <View style={styles.standaloneActionsRow}>
              <TouchableOpacity
                style={styles.standalonePrimaryButton}
                onPress={openTeacherInviteAccept}
                activeOpacity={0.85}
              >
                <Ionicons name="mail-open-outline" size={16} color="#EAF0FF" />
                <Text style={styles.standalonePrimaryButtonText}>
                  {t('teacher.accept_invite_token', { defaultValue: 'Accept Invite Token' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.standaloneSecondaryButton}
                onPress={openJoinByCode}
                activeOpacity={0.85}
              >
                <Ionicons name="key-outline" size={16} color={theme.primary} />
                <Text style={styles.standaloneSecondaryButtonText}>
                  {t('teacher.join_by_code', { defaultValue: 'Join by Code' })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Today Highlights */}
        <View style={styles.highlightsSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>
              {t('teacher.today_overview', { defaultValue: 'Today' })}
            </Text>
            <Text style={styles.sectionHeaderHint}>
              {t('teacher.today_overview_hint', { defaultValue: 'Quick status at a glance' })}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.highlightsRow}
          >
            {highlightItems.map((item) => (
              <View key={item.id} style={styles.highlightCard}>
                <View style={[styles.highlightIcon, { backgroundColor: item.color + '1A' }]}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
                <Text style={styles.highlightLabel}>{item.label}</Text>
                <Text style={styles.highlightValue}>{item.value}</Text>
                <Text style={styles.highlightSub}>{item.sub}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Interactive Tutor Mode */}
        <TouchableOpacity
          style={styles.tutorModeCard}
          onPress={openTutorMode}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={t('teacher.interactive_tutor_mode', {
            defaultValue: 'Interactive Tutor Mode',
          })}
        >
          <LinearGradient
            colors={['#23214D', '#5A409D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tutorModeGradient}
          >
            <View style={styles.tutorModeTopRow}>
              <Text style={styles.tutorModeBadge}>
                {t('teacher.interactive_tutor_mode', { defaultValue: 'Interactive Tutor Mode' })}
              </Text>
              <Ionicons name="sparkles" size={18} color="#EAF0FF" />
            </View>
            <Text style={styles.tutorModeTitle}>
              {t('teacher.tutor_mode_title', {
                defaultValue: 'CAPS-aligned tutor sessions for your class',
              })}
            </Text>
            <Text style={styles.tutorModeDescription}>
              {t('teacher.tutor_mode_description', {
                defaultValue: 'Launch guided learning instantly with Diagnose → Teach → Practice.',
              })}
            </Text>
            <View style={styles.tutorModeButton}>
              <Text style={styles.tutorModeButtonText}>
                {t('teacher.start_tutor_session', { defaultValue: 'Start Tutor Session' })}
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.routineCard}>
          <View style={styles.routineTopRow}>
            <Text style={styles.routineBadge}>
              {t('teacher.daily_program', { defaultValue: 'Daily Program' })}
            </Text>
            <Ionicons name="time-outline" size={18} color="#EAF0FF" />
          </View>
          <Text style={styles.routineTitle}>
            {dashboardData?.todayRoutine?.title ||
              t('teacher.routine_title_default', { defaultValue: "Today's Routine" })}
          </Text>
          <Text style={styles.routineDescription}>
            {dashboardData?.todayRoutine
              ? dashboardData.todayRoutine.nextBlockTitle
                ? t('teacher.routine_next_block', {
                    defaultValue: 'Next block: {{title}} at {{time}}',
                    title: dashboardData.todayRoutine.nextBlockTitle,
                    time: dashboardData.todayRoutine.nextBlockStart || '--:--',
                  })
                : t('teacher.routine_blocks_count', {
                    defaultValue: '{{count}} blocks planned today',
                    count: dashboardData.todayRoutine.blockCount,
                  })
              : t('teacher.routine_no_program', {
                  defaultValue: 'No routine published for today. Open planner to create one.',
                })}
          </Text>
          <View style={styles.routineActionsRow}>
            <TouchableOpacity
              style={styles.routinePrimaryButton}
              onPress={openDailyProgramPlanner}
              activeOpacity={0.9}
            >
              <Text style={styles.routinePrimaryButtonText}>
                {t('teacher.open_planner', { defaultValue: 'Open Planner' })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.routineSecondaryButton}
              onPress={() => router.push('/screens/room-display-connect' as any)}
              activeOpacity={0.9}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="tv-outline" size={14} color={theme.primary} />
                <Text style={styles.routineSecondaryButtonText}>
                  {t('teacher.show_on_tv', { defaultValue: 'Show on TV' })}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.routineSecondaryButton,
                !dashboardData?.todayRoutine && styles.routineSecondaryButtonDisabled,
              ]}
              onPress={handleScheduleRoutineReminders}
              activeOpacity={0.9}
              disabled={!dashboardData?.todayRoutine}
            >
              <Text style={styles.routineSecondaryButtonText}>
                {t('teacher.set_reminders', { defaultValue: 'Set Reminders' })}
              </Text>
            </TouchableOpacity>
          </View>
          {dashboardData?.todayRoutine?.termId || dashboardData?.todayRoutine?.themeId ? (
            <Text style={styles.routineMeta}>
              {t('teacher.routine_linked_context', {
                defaultValue: 'Linked to year plan context (term/theme).',
              })}
            </Text>
          ) : null}
          {routineReminderStatus ? (
            <Text style={styles.routineStatusText}>{routineReminderStatus}</Text>
          ) : null}
        </View>

        {/* What to Teach Today — AI suggestion card */}
        <TeachTodaySuggestion
          todayRoutine={
            dashboardData?.todayRoutine
              ? {
                  title: dashboardData.todayRoutine.title ?? undefined,
                  nextBlockTitle: dashboardData.todayRoutine.nextBlockTitle ?? undefined,
                  weekStartDate: dashboardData.todayRoutine.weekStartDate,
                  termId: dashboardData.todayRoutine.termId ?? undefined,
                  themeId: dashboardData.todayRoutine.themeId ?? undefined,
                  themeName: dashboardData.todayRoutine.title ?? undefined,
                }
              : null
          }
          classNames={(dashboardData?.myClasses || []).map((c: { name: string }) => c.name)}
          onOpenTutor={openTutorMode}
          onOpenPlanner={openDailyProgramPlanner}
        />

        {/* Metrics Grid */}
        <CollapsibleSection
          title={t('dashboard.overview')}
          sectionId="teacher-overview"
          icon="stats-chart"
          hint={t('dashboard.hints.teacher_overview', {
            defaultValue: 'Class metrics, alerts, and quick status checks.',
          })}
        >
          <View style={styles.metricsGrid}>
            {metrics
              .reduce<(typeof metrics)[]>((rows, metric, i) => {
                if (i % 2 === 0) rows.push(metrics.slice(i, i + 2));
                return rows;
              }, [])
              .map((row, rowIndex, allRows) => (
                <View
                  key={rowIndex}
                  style={[
                    styles.metricRow,
                    rowIndex === allRows.length - 1 && styles.metricRowLast,
                  ]}
                >
                  {row.map((metric, index) => (
                    <TeacherMetricsCard
                      key={`${rowIndex}-${index}`}
                      title={metric.title}
                      value={metric.value}
                      icon={metric.icon}
                      color={metric.color}
                      trend={metric.trend}
                      fillContainer
                      onPress={() => {
                        track('teacher.dashboard.metric_clicked', { metric: metric.title });
                      }}
                    />
                  ))}
                  {row.length === 1 && <View style={{ flex: 1 }} />}
                </View>
              ))}
          </View>
        </CollapsibleSection>

        {/* Current Class Overview */}
        <CollapsibleSection
          title={t('teacher.current_class_overview', { defaultValue: 'Current Class Overview' })}
          sectionId="teacher-current-class"
          icon="school-outline"
          hint={t('teacher.current_class_overview_hint', {
            defaultValue: 'Attendance and readiness across your active classes.',
          })}
        >
          {(dashboardData?.myClasses || []).map((classroom, index, arr) => (
            <View
              key={classroom.id}
              style={[
                styles.classOverviewRow,
                index === arr.length - 1 && styles.classOverviewRowLast,
              ]}
            >
              <View style={styles.classOverviewIconWrap}>
                <Ionicons name="school-outline" size={16} color={theme.primary} />
              </View>
              <View style={styles.classOverviewContent}>
                <Text style={styles.classOverviewTitle}>{classroom.name}</Text>
                <Text style={styles.classOverviewSubtitle}>
                  {classroom.studentCount} {t('teacher.students', { defaultValue: 'students' })} •{' '}
                  {classroom.room || t('teacher.room_tbd', { defaultValue: 'Room TBD' })}
                </Text>
              </View>
              <View style={styles.classOverviewMetrics}>
                <Text style={styles.classOverviewAttendance}>{classroom.attendanceRate ?? 0}%</Text>
                <Text style={styles.classOverviewAttendanceLabel}>
                  {t('teacher.attendance_today', { defaultValue: 'Attendance' })}
                </Text>
              </View>
            </View>
          ))}
          {(dashboardData?.myClasses || []).length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}>
              <Ionicons name="school-outline" size={36} color="rgba(234,240,255,0.4)" />
              <Text style={[styles.emptyText, { textAlign: 'center', lineHeight: 18 }]}>
                {t('teacher.no_class_detail', {
                  defaultValue:
                    'Your classes will appear here once the principal assigns you. Contact your school admin.',
                })}
              </Text>
              {isStandaloneTeacher && (
                <TouchableOpacity
                  style={{
                    backgroundColor: '#5A409D',
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    marginTop: 4,
                  }}
                  onPress={openTeacherInviteAccept}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: '#EAF0FF', fontSize: 13, fontWeight: '700' }}>
                    {t('teacher.accept_invite_token', { defaultValue: 'Accept Invite' })}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </CollapsibleSection>

        {/* Quick Actions */}
        <CollapsibleSection
          title={t('dashboard.quick_actions')}
          sectionId="teacher-quick-actions"
          icon="flash"
          hint={t('dashboard.hints.teacher_quick_actions', {
            defaultValue: 'Create lessons, homework, messages, and tasks fast.',
          })}
        >
          {actionSections.map((section) => {
            const actions = groupedActions[section.id] || [];
            if (actions.length === 0) return null;
            return (
              <View key={section.id} style={styles.actionSection}>
                <View style={styles.actionSectionHeader}>
                  <View style={styles.actionSectionIcon}>
                    <Ionicons name={section.icon as any} size={14} color={theme.textSecondary} />
                  </View>
                  <Text style={styles.actionSectionTitle}>{section.title}</Text>
                  {section.id === 'communication' && unreadMessageCount > 0 && (
                    <View
                      style={{
                        backgroundColor: '#DC2626',
                        borderRadius: 10,
                        minWidth: 20,
                        height: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 6,
                        marginLeft: 6,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                        {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.actionsGrid}>
                  {actions
                    .reduce<TeacherQuickAction[][]>((rows, _action, i) => {
                      if (i % 2 === 0) rows.push(actions.slice(i, i + 2));
                      return rows;
                    }, [])
                    .map((row, rowIndex, allRows) => (
                      <View
                        key={rowIndex}
                        style={[
                          styles.actionRow,
                          rowIndex === allRows.length - 1 && styles.actionRowLast,
                        ]}
                      >
                        {row.map((action) => (
                          <TeacherQuickActionCard
                            key={action.id || action.title}
                            title={action.title}
                            icon={action.icon}
                            color={action.color}
                            onPress={action.onPress}
                            disabled={action.disabled}
                            fillContainer
                            subtitle={action.disabled ? t('dashboard.upgrade_required') : undefined}
                          />
                        ))}
                        {row.length === 1 && <View style={{ flex: 1 }} />}
                      </View>
                    ))}
                </View>
              </View>
            );
          })}
        </CollapsibleSection>

        {/* Upcoming Assignments */}
        <CollapsibleSection
          title={t('teacher.upcoming_assignments', { defaultValue: 'Upcoming Assignments' })}
          sectionId="teacher-upcoming-assignments"
          icon="document-text-outline"
          hint={t('teacher.upcoming_assignments_hint', {
            defaultValue: 'Review due work and keep submissions on track.',
          })}
        >
          {assignmentRows.map((assignment, index) => (
            <View
              key={assignment.id}
              style={[
                styles.assignmentRow,
                index === assignmentRows.length - 1 && styles.assignmentRowLast,
              ]}
            >
              <View
                style={[
                  styles.assignmentIconContainer,
                  {
                    backgroundColor:
                      assignment.status === 'overdue'
                        ? 'rgba(245, 158, 11, 0.16)'
                        : assignment.status === 'graded'
                          ? 'rgba(60, 142, 98, 0.18)'
                          : 'rgba(90, 64, 157, 0.2)',
                  },
                ]}
              >
                <Ionicons
                  name={
                    assignment.status === 'overdue'
                      ? 'alert-circle-outline'
                      : 'document-text-outline'
                  }
                  size={18}
                  color={assignment.status === 'overdue' ? theme.warning : theme.primary}
                />
              </View>
              <View style={styles.assignmentInfo}>
                <Text style={styles.assignmentTitle}>{assignment.title}</Text>
                <Text style={styles.assignmentSubTitle}>
                  {t('teacher.due', { defaultValue: 'Due' })} {assignment.dueDate} •{' '}
                  {assignment.submitted}/{assignment.total}{' '}
                  {t('teacher.submitted', { defaultValue: 'submitted' })}
                </Text>
                {assignment.total > 0 && (
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      marginTop: 6,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        height: '100%',
                        borderRadius: 2,
                        width: `${Math.min(100, Math.round((assignment.submitted / assignment.total) * 100))}%`,
                        backgroundColor:
                          assignment.submitted / assignment.total > 0.75
                            ? '#3C8E62'
                            : assignment.submitted / assignment.total > 0.5
                              ? '#F59E0B'
                              : '#DC2626',
                      }}
                    />
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.assignmentStatus,
                  assignment.status === 'graded' && styles.assignmentStatusSuccess,
                  assignment.status === 'overdue' && styles.assignmentStatusWarning,
                ]}
              >
                {assignment.status === 'graded'
                  ? t('teacher.graded', { defaultValue: 'Graded' })
                  : assignment.status === 'overdue'
                    ? t('teacher.overdue', { defaultValue: 'Overdue' })
                    : t('teacher.pending', { defaultValue: 'Pending' })}
              </Text>
            </View>
          ))}
          {assignmentRows.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}>
              <Ionicons name="document-text-outline" size={36} color="rgba(234,240,255,0.4)" />
              <Text style={[styles.emptyText, { textAlign: 'center', lineHeight: 18 }]}>
                {t('teacher.no_assignments_detail', {
                  defaultValue: 'Create your first assignment to track student progress.',
                })}
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: '#5A409D',
                  borderRadius: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  marginTop: 4,
                }}
                onPress={() => router.push('/screens/create-assignment' as any)}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#EAF0FF', fontSize: 13, fontWeight: '700' }}>
                  {t('teacher.create_assignment', { defaultValue: 'Create Assignment' })}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </CollapsibleSection>

        {/* Recent Activity */}
        <CollapsibleSection
          title={t('dashboard.recent_activity', { defaultValue: 'Recent Activity' })}
          sectionId="teacher-recent-activity"
          icon="pulse-outline"
          hint={t('teacher.recent_activity_hint', {
            defaultValue: 'Latest assignment and event timeline.',
          })}
        >
          <View style={styles.recentActivityPanel}>
            {recentActivityRows.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.recentActivityRow,
                  index === recentActivityRows.length - 1 && styles.recentActivityRowLast,
                ]}
              >
                <View style={[styles.recentActivityIcon, { backgroundColor: item.color + '1A' }]}>
                  <Ionicons name={item.icon} size={16} color={item.color} />
                </View>
                <View style={styles.recentActivityContent}>
                  <Text style={styles.recentActivityTitle}>{item.title}</Text>
                  <Text style={styles.recentActivitySubtitle}>{item.subtitle}</Text>
                </View>
                <Text style={styles.recentActivityTimestamp}>{item.timestamp}</Text>
              </View>
            ))}
            {recentActivityRows.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}>
                <Ionicons name="pulse-outline" size={36} color="rgba(234,240,255,0.4)" />
                <Text style={[styles.emptyText, { textAlign: 'center', lineHeight: 18 }]}>
                  {t('dashboard.no_activity_detail', {
                    defaultValue: 'Activity will appear as students submit work and attend class.',
                  })}
                </Text>
              </View>
            )}
          </View>
        </CollapsibleSection>

        {/* Birthday Donations — always visible */}
        <CollapsibleSection
          title={t('dashboard.birthday_donations.title', { defaultValue: 'Birthday Donations' })}
          sectionId="teacher-birthday-donations"
          icon="gift"
          hint={t('dashboard.hints.teacher_birthdays', {
            defaultValue: 'Track donations and class birthday contributions.',
          })}
        >
          <BirthdayDonationRegister organizationId={organizationId} />
        </CollapsibleSection>

        {/* My Students */}
        <CollapsibleSection
          title={t('dashboard.my_students', { defaultValue: 'My Students' })}
          sectionId="teacher-students"
          icon="people"
          hint={t('dashboard.hints.teacher_students', {
            defaultValue: 'Quick access to student profiles and notes.',
          })}
        >
          {teacherStudentsLoading ? (
            <Text style={styles.loadingText}>
              {t('common.loading', { defaultValue: 'Loading...' })}
            </Text>
          ) : (
            teacherStudents.map((student) => (
              <StudentSummaryCard
                key={student.id}
                student={student}
                onPress={() => router.push(`/screens/student-detail?id=${student.id}` as any)}
                subtitle={
                  student.className || t('common.noClass', { defaultValue: 'No class assigned' })
                }
              />
            ))
          )}
          {!teacherStudentsLoading && teacherStudents.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}>
              <Ionicons name="people-outline" size={36} color="rgba(234,240,255,0.4)" />
              <Text style={[styles.emptyText, { textAlign: 'center', lineHeight: 18 }]}>
                {t('dashboard.no_students_detail', {
                  defaultValue: 'Students will appear once enrolled in your class.',
                })}
              </Text>
              <TouchableOpacity
                style={{
                  borderRadius: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  marginTop: 4,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.16)',
                }}
                onPress={() => router.push('/screens/teacher-dashboard?section=enrollment' as any)}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#EAF0FF', fontSize: 13, fontWeight: '700' }}>
                  {t('teacher.view_enrollment', { defaultValue: 'View Enrollment' })}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </CollapsibleSection>

        {/* Parent Link Requests Widget */}
        <CollapsibleSection
          title={t('dashboard.parent_link_requests', { defaultValue: 'Parent Link Requests' })}
          sectionId="teacher-parent-links"
          icon="link"
          hint={t('dashboard.hints.teacher_parent_links', {
            defaultValue: 'Approve or review new parent-child links.',
          })}
          defaultCollapsed={pendingLinkRequestCount === 0}
        >
          <PendingParentLinkRequests />
        </CollapsibleSection>
      </ScrollView>
    </View>
  );
};
