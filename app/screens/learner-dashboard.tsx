import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { ActivityFeed } from '@/components/learner/ActivityFeed';
import { AssignmentWidget } from '@/components/learner/AssignmentWidget';
import { ProgramProgressCard } from '@/components/learner/ProgramProgressCard';
import { QuickActions } from '@/components/learner/QuickActions';
import { TierBadge } from '@/components/ui/TierBadge';
import { SubscriptionStatusCard } from '@/components/ui/SubscriptionStatusCard';
import { AIQuotaDisplay } from '@/components/ui/AIQuotaDisplay';
import { useLearnerDashboard } from '@/hooks/useLearnerDashboard';
import { MobileNavDrawer } from '@/components/navigation/MobileNavDrawer';
import { useOrganization } from '@/hooks/useOrganization';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { useOrganizationBranding } from '@/contexts/OrganizationBrandingContext';
import type { ThemeColors } from '@/contexts/ThemeContext';
// Ads
import { useAds } from '@/contexts/AdsContext';
import SubscriptionAdGate from '@/components/ui/SubscriptionAdGate';
import AdBannerWithUpgrade from '@/components/ui/AdBannerWithUpgrade';
import { PLACEMENT_KEYS } from '@/lib/ads/placements';
import EduDashSpinner from '@/components/ui/EduDashSpinner';

export default function LearnerDashboard() {
  const { user, profile, profileLoading, loading } = useAuth();
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const { tier, ready: subscriptionReady, tierSource } = useSubscription();
  const { maybeShowInterstitial } = useAds();
  const styles = React.useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  // State for mobile nav drawer
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  // Guard against React StrictMode double-invoke in development
  const navigationAttempted = useRef(false);
  // Fetch learner dashboard data (aggregated)
  const learnerDashboard = useLearnerDashboard();
  const enrollments = learnerDashboard.data?.enrollments ?? [];
  const progress = learnerDashboard.data?.progress ?? null;
  const submissions = learnerDashboard.data?.submissions ?? [];
  // Handle both organization_id (new RBAC) and preschool_id (legacy) fields
  const orgId = extractOrganizationId(profile);
  // Get organization from branding context (fetched from organization_members table)
  const { organizationId: memberOrgId } = useOrganizationBranding();
  // Use memberOrgId (from organization_members) or orgId (from profile) for organization checks
  const effectiveOrgId = memberOrgId || orgId;
  // Fetch organization details
  const { data: organization, isLoading: orgLoading } = useOrganization();
  const orgName = organization?.name || null;
  const orgSlug = organization?.slug || null;
  // Wait for auth and profile to finish loading before making routing decisions
  const isStillLoading = loading || profileLoading;
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
        try {
          router.replace('/sign-in');
        } catch {
          /* Intentional: non-fatal */
        }
      }
      return;
    }
    // Decision 2: User exists but no organization -> allow access with join prompt
    // Learners can access dashboard without organization and join via program codes
    // No redirect needed - dashboard will show join prompt
    // Decision 3: All good, stay on dashboard (no navigation needed)
  }, [isStillLoading, user, orgId, profile]);
  const handleRefresh = () => {
    learnerDashboard.refetchAll();
  };
  // Show interstitial ad after dashboard loads (with delay to not disrupt UX)
  useEffect(() => {
    if (isStillLoading || !user) return;
    // Delay interstitial by 3 seconds after dashboard loads
    const timer = setTimeout(async () => {
      try {
        await maybeShowInterstitial(PLACEMENT_KEYS.INTERSTITIAL_LEARNER_DASHBOARD_ENTER);
      } catch (error) {
        console.debug('[LearnerDashboard] Failed to show interstitial ad:', error);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [isStillLoading, user, maybeShowInterstitial]);
  // Show loading state while auth/profile is loading
  if (isStillLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{ title: t('learner.dashboard_title', { defaultValue: 'Learner Dashboard' }) }}
        />
        <View style={styles.empty}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>
            {t('dashboard.loading_profile', { defaultValue: 'Loading your profile...' })}
          </Text>
        </View>
      </View>
    );
  }
  // If auth/profile finished but user is missing, show a minimal fallback while navigation runs.
  if (!user) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{ title: t('learner.dashboard_title', { defaultValue: 'Learner Dashboard' }) }}
        />
        <View style={styles.empty}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>
            {t('dashboard.loading_profile', { defaultValue: 'Loading your profile...' })}
          </Text>
        </View>
      </View>
    );
  }
  const isLoading = learnerDashboard.isLoading;
  const draftCount = learnerDashboard.data?.draftCount ?? 0;
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: false, // Use custom header instead
        }}
      />
      {/* Custom Header with Hamburger Menu - ALWAYS VISIBLE */}
      <View
        style={[
          styles.customHeader,
          {
            backgroundColor: theme.background,
            paddingTop: 4,
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
            borderBottomWidth: isDark ? 2 : 1.5,
          },
        ]}
      >
        <View style={styles.headerLeftSection}>
          <TouchableOpacity
            onPress={() => setIsDrawerOpen(true)}
            style={[
              styles.headerButton,
              { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="menu" size={26} color={theme.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {t('learner.dashboard_title', { defaultValue: 'My Learning' })}
          </Text>
          {orgName && (
            <Text style={[styles.orgName, { color: theme.textSecondary }]} numberOfLines={1}>
              {orgName}
              {orgSlug && ` • @${orgSlug}`}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => router.push('/screens/account')}
          style={[
            styles.headerButton,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
          ]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="person-circle-outline" size={26} color={theme.text} />
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <View style={styles.welcomeHeader}>
            <View style={styles.welcomeTextContainer}>
              <Text style={styles.greeting}>
                {t('learner.welcome_back', {
                  defaultValue: 'Welcome back',
                  name: profile?.first_name || 'Learner',
                })}
              </Text>
              <Text style={styles.subheading}>
                {t('learner.continue_learning', {
                  defaultValue: 'Continue your skills development journey',
                })}
              </Text>
            </View>
            {tier ? (
              <TierBadge tier={tier} size="sm" />
            ) : subscriptionReady ? (
              <View
                style={[
                  styles.tierPlaceholder,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.tierPlaceholderText, { color: theme.textSecondary }]}>
                  Free
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {/* 
          NOTE: Subscription upgrade flow is currently disabled for learners.
          The PayFast subscription flow is designed for schools/principals, not individual learners.
          TODO: Implement proper learner subscription flow via RevenueCat or organization-based plans.
          When ready, re-enable the SubscriptionStatusCard here.
        */}
        {/* AI Quota Display - Assignment Help */}
        {user && (
          <View style={{ marginBottom: 16 }}>
            <AIQuotaDisplay serviceType="homework_help" compact={true} showUpgradePrompt={true} />
          </View>
        )}
        {/* Progress Overview */}
        {progress && (
          <Card padding={20} margin={0} elevation="medium" style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>
                {t('learner.progress_overview', { defaultValue: 'Progress Overview' })}
              </Text>
              <Ionicons name="trending-up-outline" size={24} color={theme.primary} />
            </View>
            <View style={styles.progressGrid}>
              <View style={styles.progressItem}>
                <Text style={styles.progressValue}>{progress.totalPrograms}</Text>
                <Text style={styles.progressLabel}>
                  {t('learner.programs', { defaultValue: 'Programs' })}
                </Text>
              </View>
              <View style={styles.progressItem}>
                <Text style={styles.progressValue}>{progress.completedPrograms}</Text>
                <Text style={styles.progressLabel}>
                  {t('learner.completed', { defaultValue: 'Completed' })}
                </Text>
              </View>
              <View style={styles.progressItem}>
                <Text style={styles.progressValue}>{progress.inProgressPrograms}</Text>
                <Text style={styles.progressLabel}>
                  {t('learner.in_progress', { defaultValue: 'In Progress' })}
                </Text>
              </View>
              <View style={styles.progressItem}>
                <Text style={styles.progressValue}>{progress.avgProgress}%</Text>
                <Text style={styles.progressLabel}>
                  {t('learner.avg_progress', { defaultValue: 'Avg Progress' })}
                </Text>
              </View>
            </View>
          </Card>
        )}
        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('learner.quick_actions', { defaultValue: 'Quick Actions' })}
          </Text>
          <QuickActions
            actions={[
              {
                icon: 'sparkles',
                title: t('dash_ai.ask', { defaultValue: 'Ask Dash AI' }),
                subtitle: t('dash_ai.ask_subtitle', {
                  defaultValue: 'Chat with your AI assistant',
                }),
                onPress: () => router.push('/screens/dash-assistant'),
              },
              {
                icon: 'bulb-outline',
                title: t('dash_ai.explain', { defaultValue: 'Explain a Concept' }),
                subtitle: t('dash_ai.explain_subtitle', {
                  defaultValue: 'Get a simple explanation',
                }),
                onPress: () =>
                  router.push({
                    pathname: '/screens/dash-assistant',
                    params: { initialMessage: 'Explain a concept to me in simple terms.' },
                  }),
              },
              {
                icon: 'help-circle-outline',
                title: t('learner.assignment_help', { defaultValue: 'Assignment Help' }),
                subtitle: t('learner.get_ai_help', { defaultValue: 'Get AI-powered help' }),
                onPress: () => router.push('/screens/ai-homework-helper'),
              },
              {
                icon: 'calculator-outline',
                title: t('learner.calculator', { defaultValue: 'Calculator' }),
                subtitle: t('learner.calculator_subtitle', {
                  defaultValue: 'Scientific calculator for maths',
                }),
                onPress: () => router.push('/(k12)/student/calculator'),
              },
              {
                icon: 'school-outline',
                title: t('learner.my_programs', { defaultValue: 'My Programs' }),
                subtitle: t('learner.view_enrollments', { defaultValue: 'View enrollments' }),
                onPress: () => router.push('/screens/learner/programs'),
              },
              {
                icon: 'search-outline',
                title: t('learner.browse_programs', { defaultValue: 'Browse Programs' }),
                subtitle: t('learner.find_enroll', { defaultValue: 'Find & enroll in courses' }),
                onPress: () => router.push('/screens/learner/browse-programs'),
              },
              {
                icon: 'document-text-outline',
                title: t('learner.submissions', { defaultValue: 'Submissions' }),
                subtitle: t('learner.view_assignments', { defaultValue: 'View assignments' }),
                onPress: () => router.push('/screens/learner/submissions'),
                badge: draftCount || undefined,
              },
              {
                icon: 'people-outline',
                title: t('learner.connections', { defaultValue: 'Connections' }),
                subtitle: t('learner.network_peers', { defaultValue: 'Network with peers' }),
                onPress: () => router.push('/screens/learner/connections'),
              },
              {
                icon: 'book-outline',
                title: t('learner.courses', { defaultValue: 'Online Courses' }),
                subtitle: t('learner.browse_courses', { defaultValue: 'Browse courses' }),
                onPress: () => router.push('/screens/learner/courses'),
              },
              {
                icon: 'documents-outline',
                title: t('learner.documents', { defaultValue: 'Documents' }),
                subtitle: t('learner.documents_description', {
                  defaultValue: 'CV, Certificates, Tax No. etc',
                }),
                onPress: () => router.push('/screens/learner/documents'),
              },
              {
                icon: 'folder-outline',
                title: t('learner.portfolio', { defaultValue: 'Portfolio' }),
                subtitle: t('learner.showcase_work', { defaultValue: 'Showcase your work' }),
                onPress: () => router.push('/screens/learner/portfolio'),
              },
            ]}
          />
        </View>
        {/* Upcoming assignments (derived from submissions until full assignments feed is implemented) */}
        <View style={styles.section}>
          <AssignmentWidget
            submissions={submissions}
            onPressSeeAll={() => router.push('/screens/learner/assignments')}
          />
        </View>
        {/* Recent activity */}
        <View style={styles.section}>
          <ActivityFeed submissions={submissions} />
        </View>
        {/* Recent Enrollments */}
        {enrollments.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {t('learner.recent_programs', { defaultValue: 'Recent Programs' })}
              </Text>
              <TouchableOpacity onPress={() => router.push('/screens/learner/programs')}>
                <Text style={styles.seeAll}>
                  {t('common.see_all', { defaultValue: 'See All' })}
                </Text>
              </TouchableOpacity>
            </View>
            {enrollments.slice(0, 3).map((enrollment) => (
              <ProgramProgressCard
                key={enrollment.id}
                enrollment={enrollment}
                onPress={() =>
                  router.push(`/screens/learner/program-detail?id=${enrollment.program_id}`)
                }
              />
            ))}
          </View>
        )}
        {/* Loading State */}
        {isLoading && enrollments.length === 0 && (
          <View style={styles.empty}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={styles.loadingText}>
              {t('dashboard.loading', { defaultValue: 'Loading...' })}
            </Text>
          </View>
        )}
        {/* No Enrollments - Prompt to enroll (only show if user has no enrollments) */}
        {!orgId && enrollments.length === 0 && !isLoading && (
          <Card padding={32} margin={0} elevation="small" style={{ marginBottom: 24 }}>
            <View style={styles.empty}>
              <Ionicons name="school-outline" size={64} color={theme.primary} />
              <Text style={styles.emptyTitle}>
                {t('learner.get_started', { defaultValue: 'Get Started' })}
              </Text>
              <Text style={styles.emptyDescription}>
                {t('learner.enroll_prompt', {
                  defaultValue: 'Browse available programs and start your learning journey',
                })}
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/screens/learner/browse-programs')}
              >
                <Text style={styles.primaryButtonText}>
                  {t('learner.browse_programs', { defaultValue: 'Browse Programs' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: theme.border }]}
                onPress={() => router.push('/screens/learner/enroll-by-program-code')}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                  {t('learner.enroll_program', { defaultValue: 'Enroll in Program' })}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
        {/* Empty State - Has Org but No Enrollments */}
        {!isLoading && orgId && enrollments.length === 0 && (
          <Card padding={32} margin={0} elevation="small">
            <View style={styles.empty}>
              <Ionicons name="school-outline" size={64} color={theme.textSecondary} />
              <Text style={styles.emptyTitle}>
                {t('learner.no_enrollments', { defaultValue: 'No Enrollments Yet' })}
              </Text>
              <Text style={styles.emptyDescription}>
                {t('learner.enroll_prompt', {
                  defaultValue: 'Browse available programs and start your learning journey',
                })}
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/screens/learner/browse-programs')}
              >
                <Text style={styles.primaryButtonText}>
                  {t('learner.browse_programs', { defaultValue: 'Browse Programs' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: theme.border }]}
                onPress={() => router.push('/screens/learner/enroll-by-program-code')}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                  {t('learner.have_code', { defaultValue: 'Have a program code?' })}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
        {/* Banner Ad - Free tier users only */}
        <SubscriptionAdGate>
          <AdBannerWithUpgrade screen="learner_dashboard" showUpgradeCTA={true} margin={16} />
        </SubscriptionAdGate>
      </ScrollView>

      {/* Mobile Navigation Drawer */}
      <MobileNavDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        navItems={[
          {
            id: 'home',
            label: t('learner.dashboard_title', { defaultValue: 'Dashboard' }),
            icon: 'home',
            route: '/screens/learner-dashboard',
          },
          {
            id: 'programs',
            label: t('learner.my_programs', { defaultValue: 'My Programs' }),
            icon: 'school',
            route: '/screens/learner/programs',
          },
          {
            id: 'browse',
            label: t('learner.browse_programs', { defaultValue: 'Browse Programs' }),
            icon: 'search',
            route: '/screens/learner/browse-programs',
          },
          {
            id: 'assignments',
            label: t('learner.submissions', { defaultValue: 'Assignments' }),
            icon: 'document-text',
            route: '/screens/learner/submissions',
          },
          {
            id: 'ai-help',
            label: t('learner.assignment_help', { defaultValue: 'Assignment Help' }),
            icon: 'help-circle',
            route: '/screens/ai-homework-helper',
          },
          {
            id: 'calculator',
            label: t('learner.calculator', { defaultValue: 'Calculator' }),
            icon: 'calculator',
            route: '/(k12)/student/calculator',
          },
          {
            id: 'portfolio',
            label: t('learner.portfolio', { defaultValue: 'Portfolio' }),
            icon: 'folder',
            route: '/screens/learner/portfolio',
          },
          {
            id: 'account',
            label: t('common.account', { defaultValue: 'Account' }),
            icon: 'person-circle',
            route: '/screens/account',
          },
          {
            id: 'settings',
            label: t('common.settings', { defaultValue: 'Settings' }),
            icon: 'settings',
            route: '/screens/settings',
          },
        ]}
      />
    </SafeAreaView>
  );
}
const createStyles = (theme: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme?.background || '#0b1220',
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
    },
    loadingText: {
      color: theme?.textSecondary || '#9CA3AF',
      fontSize: 16,
      marginTop: 12,
    },
    customHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
      minHeight: 60,
      zIndex: 1000,
      elevation: 6, // Android shadow
      shadowColor: '#000', // iOS shadow
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
    },
    headerButton: {
      padding: 10,
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    headerLeftSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    orgLogoContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    orgLogo: {
      width: 42,
      height: 42,
      borderRadius: 21,
    },
    headerTitleContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 16,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      textAlign: 'center',
    },
    orgName: {
      fontSize: 11,
      fontWeight: '500',
      textAlign: 'center',
      marginTop: 2,
    },
    tierPlaceholder: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
    },
    tierPlaceholderText: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    welcomeSection: {
      marginBottom: 20,
      paddingTop: 8,
    },
    welcomeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 4,
    },
    welcomeTextContainer: {
      flex: 1,
      marginRight: 16,
    },
    greeting: {
      color: theme?.text || '#fff',
      fontSize: 32,
      fontWeight: '800',
      marginBottom: 8,
      letterSpacing: -0.5,
    },
    subheading: {
      color: theme?.textSecondary || '#9CA3AF',
      fontSize: 15,
      lineHeight: 22,
      marginTop: 4,
    },
    progressCard: {
      marginBottom: 20,
      borderRadius: 16,
      overflow: 'hidden',
    },
    progressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    progressTitle: {
      color: theme?.text || '#fff',
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    progressGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
    },
    progressItem: {
      flex: 1,
      minWidth: '45%',
      alignItems: 'center',
      padding: 20,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    },
    progressValue: {
      color: theme?.text || '#fff',
      fontSize: 32,
      fontWeight: '800',
      marginBottom: 6,
      letterSpacing: -0.5,
    },
    progressLabel: {
      color: theme?.textSecondary || '#9CA3AF',
      fontSize: 13,
      fontWeight: '500',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    section: {
      marginBottom: 28,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sectionTitle: {
      color: theme?.text || '#fff',
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.3,
      marginBottom: 4,
    },
    seeAll: {
      color: theme?.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    quickActionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    quickActionCard: {
      width: '47%',
      alignItems: 'center',
      minHeight: 120,
    },
    quickActionIcon: {
      marginBottom: 12,
      position: 'relative',
    },
    badge: {
      position: 'absolute',
      top: -8,
      right: -8,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    quickActionTitle: {
      color: theme?.text || '#fff',
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 4,
      textAlign: 'center',
    },
    quickActionSubtitle: {
      color: theme?.textSecondary || '#9CA3AF',
      fontSize: 12,
      textAlign: 'center',
    },
    enrollmentCard: {
      marginBottom: 12,
    },
    enrollmentHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    enrollmentInfo: {
      flex: 1,
    },
    enrollmentTitle: {
      color: theme?.text || '#fff',
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 4,
    },
    enrollmentCode: {
      color: theme?.textSecondary || '#9CA3AF',
      fontSize: 13,
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    progressBar: {
      height: 8,
      backgroundColor: theme?.border || '#374151',
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 8,
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    progressText: {
      color: theme?.textSecondary || '#9CA3AF',
      fontSize: 12,
    },
    emptyTitle: {
      color: theme?.text || '#fff',
      fontSize: 20,
      fontWeight: '700',
      marginTop: 16,
      marginBottom: 8,
    },
    emptyDescription: {
      color: theme?.textSecondary || '#9CA3AF',
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 24,
      paddingHorizontal: 16,
    },
    primaryButton: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      marginTop: 12,
    },
    secondaryButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
  });
