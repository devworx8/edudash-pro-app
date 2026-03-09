import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AssignmentsCard } from '@/components/dashboard/cards/AssignmentsCard';
import { GradesCard } from '@/components/dashboard/cards/GradesCard';
import { ScheduleCard } from '@/components/dashboard/cards/ScheduleCard';
import { AnnouncementsCard } from '@/components/dashboard/cards/AnnouncementsCard';
import InlineUpgradeBanner from '@/components/ui/InlineUpgradeBanner';
import { AIQuotaDisplay } from '@/components/ui/AIQuotaDisplay';
import { useLearnerEnrollments } from '@/hooks/useLearnerData';
import { MobileNavDrawer } from '@/components/navigation/MobileNavDrawer';
import { QuickActions } from '@/components/learner/QuickActions';
import type { LearnerQuickAction } from '@/components/learner/QuickActions';
import { StreakBadge } from '@/components/dashboard/cards/StreakBadge';
import { XPProgressBar } from '@/components/dashboard/cards/XPProgressBar';
import { logger } from '@/lib/logger';

const TAG = 'StudentDashboard';
import { track } from '@/lib/analytics';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function StudentDashboard() {
  const { user, profile, profileLoading, loading } = useAuth();
  const { theme, isDark } = useTheme();
  const { tier } = useSubscription();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  
  // State for mobile nav drawer
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  
  // Guard against React StrictMode double-invoke in development
  const navigationAttempted = useRef(false);

  // Fetch enrollments to check if user has enrolled in programs
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useLearnerEnrollments();

  // Handle both organization_id (new RBAC) and preschool_id (legacy) fields
  const orgId = profile?.organization_id || (profile as any)?.preschool_id;
  
  // Wait for auth and profile to finish loading before making routing decisions
  const isStillLoading = loading || profileLoading;

  const dashTools = React.useMemo<LearnerQuickAction[]>(() => ([
    {
      icon: 'sparkles' as LearnerQuickAction['icon'],
      title: t('dash_ai.ask', { defaultValue: 'Ask Dash AI' }),
      subtitle: t('dash_ai.ask_subtitle', { defaultValue: 'Chat with your AI study buddy' }),
      onPress: () => router.push('/screens/dash-assistant'),
    },
    {
      icon: 'bulb-outline' as LearnerQuickAction['icon'],
      title: t('dash_ai.explain', { defaultValue: 'Explain a Concept' }),
      subtitle: t('dash_ai.explain_subtitle', { defaultValue: 'Get a simple explanation' }),
      onPress: () => router.push({ pathname: '/screens/dash-assistant', params: { initialMessage: 'Explain a concept to me in simple terms.' } }),
    },
    {
      icon: 'help-circle-outline' as LearnerQuickAction['icon'],
      title: t('dash_ai.quiz', { defaultValue: 'Practice Quiz' }),
      subtitle: t('dash_ai.quiz_subtitle', { defaultValue: 'Quick questions to test you' }),
      onPress: () => router.push({ pathname: '/screens/dash-assistant', params: { initialMessage: 'Create a short practice quiz for me.' } }),
    },
    {
      icon: 'map-outline' as LearnerQuickAction['icon'],
      title: t('dash_ai.study_plan', { defaultValue: 'Study Plan' }),
      subtitle: t('dash_ai.study_plan_subtitle', { defaultValue: 'Plan your week of study' }),
      onPress: () => router.push({ pathname: '/screens/dash-assistant', params: { initialMessage: 'Create a simple study plan for this week.' } }),
    },
  ]), [t, router]);

  // CONSOLIDATED NAVIGATION EFFECT: Single source of truth for all routing decisions
  useEffect(() => {
    // Skip if still loading data
    if (isStillLoading) return;
    
    // Guard against double navigation (React StrictMode in dev)
    if (navigationAttempted.current) return;
    
    // Decision 1: No user -> sign in
    if (!user) {
      navigationAttempted.current = true;
      try { 
        router.replace('/(auth)/sign-in'); 
      } catch (e) {
        try { router.replace('/sign-in'); } catch { /* Intentional: non-fatal */ }
      }
      return;
    }
    
    // Decision 2: User has organization_id -> redirect to learner-dashboard
    // Students who registered with program codes should have organization_id
    // and should use the learner-dashboard, not the standalone student-dashboard
    if (orgId) {
      navigationAttempted.current = true;
      logger.info(TAG, 'User has organization_id, redirecting to learner-dashboard');
      try {
        router.replace('/screens/learner-dashboard');
      } catch (e) {
        console.warn('[StudentDashboard] Redirect failed:', e);
      }
      return;
    }
    
    // Decision 3: User exists but no organization -> allow standalone access
    // Standalone learners can use the dashboard without an organization and join later
    // No redirect needed - dashboard will show join prompt
    
    // Decision 4: All good, stay on dashboard (no navigation needed)
  }, [isStillLoading, user, orgId, profile]);

  // Show loading state while auth/profile is loading
  if (isStillLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: t('student.dashboard_title', { defaultValue: 'Student Dashboard' }) }} />
        <View style={styles.empty}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>{t('dashboard.loading_profile', { defaultValue: 'Loading your profile...' })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show join prompt if no organization AND no enrollments
  // If user has enrollments, they don't need to join an organization
  const showJoinPrompt = !orgId && enrollments.length === 0 && !enrollmentsLoading;
  
  // Get student name (handle both first_name and full name)
  const studentName = profile?.first_name || profile?.full_name?.split(' ')[0] || 'Student';
  const shouldShowUpgrade = tier === 'free' || !tier;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen 
        options={{ 
          headerShown: false, // Use custom header instead
        }} 
      />
      {/* Custom Header with Hamburger Menu */}
      <View style={[styles.customHeader, { 
        backgroundColor: theme.background,
        paddingTop: Math.max(insets.top, 8),
        borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
        borderBottomWidth: isDark ? 2 : 1.5,
      }]}>
        <TouchableOpacity
          onPress={() => setIsDrawerOpen(true)}
          style={[styles.headerButton, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="menu" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {t('student.dashboard_title', { defaultValue: 'Student Dashboard' })}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => router.push('/screens/settings')}
            style={[styles.headerButton, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={24} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/screens/account')}
            style={[styles.headerButton, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="person-circle-outline" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.greeting}>
            {t('student.welcome_back', { 
              defaultValue: 'Welcome back, {{name}}',
              name: studentName
            })}
          </Text>
          <Text style={styles.subheading}>
            {t('student.continue_learning', { defaultValue: 'Continue your learning journey' })}
          </Text>
        </View>

        {/* Streak & XP Progress */}
        <StreakBadge />
        <XPProgressBar />

        {/* AI Quota Display */}
        <AIQuotaDisplay 
          serviceType="homework_help"
          compact={true}
          showUpgradePrompt={true}
          containerStyle={styles.quotaDisplay}
        />

        {/* Dash AI Tools */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('dash_ai.tools', { defaultValue: 'Dash AI Tools' })}
          </Text>
          <QuickActions actions={dashTools} />
        </View>

        {/* Upgrade Banner */}
        {shouldShowUpgrade && (
          <InlineUpgradeBanner
            title={t('student.upgrade_title', { defaultValue: 'Unlock Premium Features' })}
            description={t('student.upgrade_description', { defaultValue: 'Get unlimited AI homework help, advanced analytics, and more' })}
            screen="student_dashboard"
            feature="premium_student_features"
            icon="diamond-outline"
            variant="compact"
          />
        )}

        {/* Join Organization Prompt */}
        {showJoinPrompt && (
          <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="school-outline" size={24} color={theme.primary} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoTitle, { color: theme.text }]}>
                {t('student.join_organization', { defaultValue: 'Join an Organization' })}
              </Text>
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                {t('student.join_prompt', { defaultValue: 'Join your school or organization to access assignments, grades, and more.' })}
              </Text>
              <TouchableOpacity 
                style={[styles.joinButton, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/screens/learner/enroll-by-program-code')}
              >
                <Text style={styles.joinButtonText}>
                  {t('student.join_now', { defaultValue: 'Join Now' })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Dashboard Cards */}
        <View style={styles.cardsContainer}>
          <AnnouncementsCard />
          <ScheduleCard />
          <AssignmentsCard />
          <GradesCard />
        </View>
          </ScrollView>
      
      {/* Mobile Navigation Drawer */}
      <MobileNavDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        navItems={[
          { id: 'home', label: t('student.dashboard_title', { defaultValue: 'Dashboard' }), icon: 'home', route: '/screens/student-dashboard' },
          { id: 'programs', label: t('learner.my_programs', { defaultValue: 'My Programs' }), icon: 'school', route: '/screens/learner/programs' },
          { id: 'assignments', label: t('learner.submissions', { defaultValue: 'Assignments' }), icon: 'document-text', route: '/screens/learner/submissions' },
          { id: 'ai-help', label: t('learner.assignment_help', { defaultValue: 'Assignment Help' }), icon: 'help-circle', route: '/screens/ai-homework-helper' },
          { id: 'portfolio', label: t('learner.portfolio', { defaultValue: 'Portfolio' }), icon: 'folder', route: '/screens/learner/portfolio' },
          { id: 'account', label: t('common.account', { defaultValue: 'Account' }), icon: 'person-circle', route: '/screens/account' },
          { id: 'settings', label: t('common.settings', { defaultValue: 'Settings' }), icon: 'settings', route: '/screens/settings' },
        ]}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: any, isDark: boolean) => StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: theme?.background || '#0b1220' 
  },
  content: { 
    padding: 16,
    paddingBottom: 32,
  },
  welcomeSection: {
    marginBottom: 24,
  },
  greeting: { 
    color: theme?.text || '#fff', 
    fontSize: 28, 
    fontWeight: '800', 
    marginBottom: 8 
  },
  subheading: { 
    color: theme?.textSecondary || '#9CA3AF',
    fontSize: 16,
    lineHeight: 22,
  },
  empty: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  loadingText: { 
    color: theme?.text || '#E5E7EB', 
    fontSize: 16,
    marginTop: 12,
  },
  infoCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    gap: 16,
  },
  infoContent: {
    flex: 1,
    gap: 8,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  joinButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cardsContainer: {
    gap: 16,
  },
  quotaDisplay: {
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: theme?.text || '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    minHeight: 56,
    zIndex: 1000,
    elevation: 4, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerButton: {
    padding: 10,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
});
