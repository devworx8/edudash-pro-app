import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { CosmicOrb } from '@/components/dash-orb/CosmicOrb';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import {
  resolveExplicitSchoolTypeFromProfile,
  resolveOrganizationId,
  resolveSchoolTypeFromProfile,
} from '@/lib/schoolTypeResolver';
import { getDashboardRouteForRole } from '@/lib/dashboard/routeMatrix';
import { uiTokens } from '@/lib/ui/tokens';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import {
  ROLES_WITH_CENTER_TAB,
  SCHOOL_ADMIN_DASH_TAB,
} from '@/lib/navigation/navManifest';
import { useFinancePrivacyMode } from '@/hooks/useFinancePrivacyMode';
import { useNotifications } from '@/hooks/useNotifications';

/** Animated tab icon with spring scale on press */
function AnimatedTabIcon({
  name,
  size,
  color,
  active,
}: {
  name: string;
  size: number;
  color: string;
  active: boolean;
}) {
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (active) {
      scale.value = withSpring(1.15, { damping: 10, stiffness: 200 });
    } else {
      scale.value = withSpring(1, { damping: 14, stiffness: 120 });
    }
  }, [active, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Ionicons name={name as any} size={size} color={color} />
    </Animated.View>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isSmallScreen = SCREEN_WIDTH < 360;
const isShortScreen = SCREEN_HEIGHT < 700;
const isCompact = isSmallScreen || isShortScreen;

interface TabItem {
  id: string;
  label: string;
  icon: string;
  activeIcon: string;
  route: string;
  roles?: string[];
  /** When true, renders as a raised center orb button instead of a standard tab */
  isCenterTab?: boolean;
}

/** Roles that have the Dash center tab in the bottom nav (FAB hidden for these) */
export { ROLES_WITH_CENTER_TAB };

const TAB_ITEMS: TabItem[] = [
  // Parent tabs
  { 
    id: 'parent-dashboard', 
    label: 'Dashboard', 
    icon: 'grid-outline', 
    activeIcon: 'grid', 
    route: '/screens/parent-dashboard', 
    roles: ['parent'] 
  },
  { 
    id: 'parent-children', 
    label: 'Messages', 
    icon: 'chatbubble-outline', 
    activeIcon: 'chatbubble', 
    route: '/screens/parent-messages', 
    roles: ['parent'] 
  },
  { 
    id: 'parent-dash', 
    label: 'Dash', 
    icon: 'sparkles-outline', 
    activeIcon: 'sparkles', 
    route: '/screens/dash-assistant', 
    roles: ['parent'],
    isCenterTab: true,
  },
  { 
    id: 'parent-messages', 
    label: 'Grades', 
    icon: 'stats-chart-outline', 
    activeIcon: 'stats-chart', 
    route: '/screens/parent-progress', 
    roles: ['parent'] 
  },
  { 
    id: 'parent-calendar', 
    label: 'Account', 
    icon: 'person-outline', 
    activeIcon: 'person', 
    route: '/screens/account', 
    roles: ['parent'] 
  },
  
  // Teacher tabs
  { 
    id: 'teacher-dashboard', 
    label: 'Home', 
    icon: 'home-outline', 
    activeIcon: 'home', 
    route: '/screens/teacher-dashboard', 
    roles: ['teacher'] 
  },
  { 
    id: 'students', 
    label: 'Students', 
    icon: 'people-outline', 
    activeIcon: 'people', 
    route: '/screens/student-management', 
    roles: ['teacher'] 
  },
  { 
    id: 'teacher-dash', 
    label: 'Dash', 
    icon: 'sparkles-outline', 
    activeIcon: 'sparkles', 
    route: '/screens/dash-assistant', 
    roles: ['teacher'],
    isCenterTab: true,
  },
  { 
    id: 'teacher-message-list', 
    label: 'Messages', 
    icon: 'chatbubble-outline', 
    activeIcon: 'chatbubble', 
    route: '/screens/teacher-message-list', 
    roles: ['teacher'] 
  },
  { 
    id: 'teacher-calendar', 
    label: 'Calendar', 
    icon: 'calendar-outline', 
    activeIcon: 'calendar', 
    route: '/screens/calendar', 
    roles: ['teacher'] 
  },
  
  // Principal tabs
  { 
    id: 'principal-dashboard', 
    label: 'Home',
    icon: 'home-outline', 
    activeIcon: 'home', 
    route: '/screens/principal-dashboard', 
    roles: ['principal', 'principal_admin'] 
  },
  {
    id: 'principal-dash',
    label: 'Dash',
    icon: 'sparkles-outline',
    activeIcon: 'sparkles',
    route: '/screens/dash-assistant',
    roles: ['principal', 'principal_admin'],
    isCenterTab: true,
  },
  
  // Org Admin tabs (Skills Development, Tertiary, etc.)
  { 
    id: 'org-admin-dashboard', 
    label: 'Home',
    icon: 'home-outline', 
    activeIcon: 'home', 
    route: '/screens/org-admin-dashboard', 
    roles: ['admin'] 
  },
  { 
    id: 'org-admin-programs', 
    label: 'Programs',
    icon: 'school-outline', 
    activeIcon: 'school', 
    route: '/screens/org-admin/programs', 
    roles: ['admin'] 
  },
  { 
    id: 'org-admin-enrollments', 
    label: 'Enroll',
    icon: 'person-add-outline', 
    activeIcon: 'person-add', 
    route: '/screens/org-admin/enrollments', 
    roles: ['admin'] 
  },
  { 
    id: 'org-admin-instructors', 
    label: 'Team',
    icon: 'people-outline', 
    activeIcon: 'people', 
    route: '/screens/org-admin/instructors', 
    roles: ['admin'] 
  },
  { 
    id: 'org-admin-settings', 
    label: 'Settings',
    icon: 'settings-outline', 
    activeIcon: 'settings', 
    route: '/screens/org-admin/settings', 
    roles: ['admin'] 
  },
  
  // Student/Learner tabs - Use learner-dashboard for both (students with org_id should use learner-dashboard)
  { 
    id: 'learner-dashboard', 
    label: 'Home',
    icon: 'home-outline', 
    activeIcon: 'home', 
    route: '/screens/learner-dashboard', 
    roles: ['student', 'learner'] 
  },
  { 
    id: 'student-programs', 
    label: 'Programs',
    icon: 'school-outline', 
    activeIcon: 'school', 
    route: '/screens/learner/programs', 
    roles: ['student', 'learner'] 
  },
  { 
    id: 'learner-dash', 
    label: 'Dash', 
    icon: 'sparkles-outline', 
    activeIcon: 'sparkles', 
    route: '/screens/dash-assistant', 
    roles: ['student', 'learner'],
    isCenterTab: true,
  },
  { 
    id: 'student-submissions', 
    label: 'Work',
    icon: 'document-text-outline', 
    activeIcon: 'document-text', 
    route: '/screens/learner/submissions', 
    roles: ['student', 'learner'] 
  },
  { 
    id: 'learner-messages', 
    label: 'Messages',
    icon: 'chatbubble-outline', 
    activeIcon: 'chatbubble', 
    route: '/screens/learner/messages', 
    roles: ['student', 'learner'] 
  },
  { 
    id: 'principal-students', 
    label: 'Students', 
    icon: 'people-outline', 
    activeIcon: 'people', 
    route: '/screens/student-management', 
    roles: ['principal', 'principal_admin'] 
  },
  { 
    id: 'principal-messages', 
    label: 'Messages', 
    icon: 'chatbubble-outline', 
    activeIcon: 'chatbubble', 
    route: '/screens/principal-messages', 
    roles: ['principal', 'principal_admin'] 
  },
  { 
    id: 'principal-reports', 
    label: 'Fees', 
    icon: 'cash-outline', 
    activeIcon: 'cash', 
    route: '/screens/finance-control-center', 
    roles: ['principal', 'principal_admin'] 
  },

  // CEO / National Admin tabs (EduPro)
  { 
    id: 'ceo-dashboard', 
    label: 'Home',
    icon: 'home-outline', 
    activeIcon: 'home', 
    route: '/screens/membership/ceo-dashboard', 
    roles: ['national_admin'] 
  },
  { 
    id: 'ceo-regions', 
    label: 'Regions',
    icon: 'map-outline', 
    activeIcon: 'map', 
    route: '/screens/membership/regional-managers', 
    roles: ['national_admin'] 
  },
  { 
    id: 'ceo-finance', 
    label: 'Finance',
    icon: 'wallet-outline', 
    activeIcon: 'wallet', 
    route: '/screens/membership/finance', 
    roles: ['national_admin'] 
  },
  { 
    id: 'ceo-members', 
    label: 'Members',
    icon: 'people-outline', 
    activeIcon: 'people', 
    route: '/screens/membership/members', 
    roles: ['national_admin'] 
  },
  { 
    id: 'ceo-settings', 
    label: 'Settings',
    icon: 'settings-outline', 
    activeIcon: 'settings', 
    route: '/screens/settings', 
    roles: ['national_admin'] 
  },

  // Youth President tabs (Youth Wing)
  { 
    id: 'youth-dashboard', 
    label: 'Home',
    icon: 'home-outline', 
    activeIcon: 'home', 
    route: '/screens/membership/youth-president-dashboard', 
    roles: ['youth_president'] 
  },
  { 
    id: 'youth-members', 
    label: 'Members',
    icon: 'people-outline', 
    activeIcon: 'people', 
    route: '/screens/membership/members-list', 
    roles: ['youth_president'] 
  },
  { 
    id: 'youth-events', 
    label: 'Events',
    icon: 'calendar-outline', 
    activeIcon: 'calendar', 
    route: '/screens/membership/events', 
    roles: ['youth_president'] 
  },
  { 
    id: 'youth-approvals', 
    label: 'Approvals',
    icon: 'checkmark-circle-outline', 
    activeIcon: 'checkmark-circle', 
    route: '/screens/membership/pending-approvals', 
    roles: ['youth_president'] 
  },
  { 
    id: 'youth-settings', 
    label: 'Settings',
    icon: 'settings-outline', 
    activeIcon: 'settings', 
    route: '/screens/membership/settings', 
    roles: ['youth_president'] 
  },

  // Regional Manager tabs
  { 
    id: 'regional-dashboard', 
    label: 'Home',
    icon: 'home-outline', 
    activeIcon: 'home', 
    route: '/screens/membership/dashboard', 
    roles: ['regional_manager'] 
  },
  { 
    id: 'regional-members', 
    label: 'Members',
    icon: 'people-outline', 
    activeIcon: 'people', 
    route: '/screens/membership/members-list', 
    roles: ['regional_manager'] 
  },
  { 
    id: 'regional-approvals', 
    label: 'Approvals',
    icon: 'checkmark-circle-outline', 
    activeIcon: 'checkmark-circle', 
    route: '/screens/membership/pending-approvals', 
    roles: ['regional_manager'] 
  },
  { 
    id: 'regional-events', 
    label: 'Events',
    icon: 'calendar-outline', 
    activeIcon: 'calendar', 
    route: '/screens/membership/events', 
    roles: ['regional_manager'] 
  },
  { 
    id: 'regional-settings', 
    label: 'Settings',
    icon: 'settings-outline', 
    activeIcon: 'settings', 
    route: '/screens/membership/settings', 
    roles: ['regional_manager'] 
  },

  // Women's League tabs
  { 
    id: 'women-dashboard', 
    label: 'Home',
    icon: 'home-outline', 
    activeIcon: 'home', 
    route: '/screens/membership/women-dashboard', 
    roles: ['women_league'] 
  },
  { 
    id: 'women-members', 
    label: 'Members',
    icon: 'people-outline', 
    activeIcon: 'people', 
    route: '/screens/membership/members-list', 
    roles: ['women_league'] 
  },
  { 
    id: 'women-events', 
    label: 'Events',
    icon: 'calendar-outline', 
    activeIcon: 'calendar', 
    route: '/screens/membership/events', 
    roles: ['women_league'] 
  },
  { 
    id: 'women-approvals', 
    label: 'Approvals',
    icon: 'checkmark-circle-outline', 
    activeIcon: 'checkmark-circle', 
    route: '/screens/membership/pending-approvals', 
    roles: ['women_league'] 
  },
  { 
    id: 'women-settings', 
    label: 'Settings',
    icon: 'settings-outline', 
    activeIcon: 'settings', 
    route: '/screens/membership/settings', 
    roles: ['women_league'] 
  },

  // Veterans League tabs
  { 
    id: 'veterans-dashboard', 
    label: 'Home',
    icon: 'home-outline', 
    activeIcon: 'home', 
    route: '/screens/membership/veterans-dashboard', 
    roles: ['veterans_league'] 
  },
  { 
    id: 'veterans-members', 
    label: 'Members',
    icon: 'people-outline', 
    activeIcon: 'people', 
    route: '/screens/membership/members-list', 
    roles: ['veterans_league'] 
  },
  { 
    id: 'veterans-events', 
    label: 'Events',
    icon: 'calendar-outline', 
    activeIcon: 'calendar', 
    route: '/screens/membership/events', 
    roles: ['veterans_league'] 
  },
  { 
    id: 'veterans-approvals', 
    label: 'Approvals',
    icon: 'checkmark-circle-outline', 
    activeIcon: 'checkmark-circle', 
    route: '/screens/membership/pending-approvals', 
    roles: ['veterans_league'] 
  },
  { 
    id: 'veterans-settings', 
    label: 'Settings',
    icon: 'settings-outline', 
    activeIcon: 'settings', 
    route: '/screens/membership/settings', 
    roles: ['veterans_league'] 
  },
];

const MESSAGE_TAB_IDS = new Set([
  'parent-children',
  'teacher-message-list',
  'principal-messages',
  'learner-messages',
]);

export function BottomTabBar() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { messages: unreadMessages } = useNotifications();
  const { hideFeesOnDashboards } = useFinancePrivacyMode();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const flags = getFeatureFlagsSync();

  // Hide navigation bar if user is not authenticated
  if (!user || !profile) {
    return null;
  }

  // Hide bottom nav on full-screen / immersive experiences (e.g. Dash AI assistant)
  if (
    typeof pathname === 'string' &&
    (pathname.includes('/screens/dash-assistant') ||
      pathname.includes('dash-assistant') ||
      pathname.includes('/screens/dash-voice') ||
      pathname.includes('dash-voice') ||
      pathname.includes('/screens/dash-orb') ||
      pathname.includes('dash-orb') ||
      pathname.startsWith('/screens/ai-') ||
      pathname.includes('/screens/worksheet-viewer') ||
      pathname.includes('/screens/lesson-viewer'))
  ) {
    return null;
  }

  // Determine user role - check for CEO/national_admin from organization membership
  const userRole = (profile?.role as string) || 'parent';
  const memberType = (profile as any)?.organization_membership?.member_type || (profile as any)?.member_type;
  const orgRole = (profile as any)?.organization_membership?.role;
  
  // Check if user is CEO (member_type === 'ceo' or role === 'national_admin')
  const isCEO = memberType === 'ceo' || memberType === 'president' || orgRole === 'national_admin';
  
  // Check if user is Youth President or Executive (all youth leadership roles)
  const isYouthLeader = memberType === 'youth_president' || 
                        memberType === 'youth_deputy' || 
                        memberType === 'youth_secretary' || 
                        memberType === 'youth_treasurer';
  
  // Check if user is Regional Manager
  const isRegionalManager = memberType === 'regional_manager' || 
                            memberType === 'provincial_manager' ||
                            orgRole === 'regional_admin';
  
  // Check if user is Women's League member
  const isWomensLeague = memberType?.startsWith('women_');
  
  // Check if user is Veterans League member
  const isVeteransLeague = memberType?.startsWith('veterans_');
  
  const resolvedSchoolType = resolveSchoolTypeFromProfile(profile);
  const explicitSchoolType = resolveExplicitSchoolTypeFromProfile(profile);
  const isSchoolAdmin = userRole === 'admin' && Boolean(explicitSchoolType);
  const homeDashboardRoute = getDashboardRouteForRole({
    role: userRole,
    resolvedSchoolType: userRole === 'admin' ? explicitSchoolType : resolvedSchoolType,
    hasOrganization: Boolean(resolveOrganizationId(profile)),
    traceContext: 'BottomTabBar.homeTab',
  });
  
  // Filter tabs by role - special member types get their dedicated tabs
  let visibleTabs = TAB_ITEMS.filter(item => {
    if (!item.roles) return false; // Require explicit role assignment
    
    // If user is CEO, ONLY show CEO tabs (national_admin role)
    if (isCEO) {
      return item.roles.includes('national_admin');
    }
    
    // If user is Youth Leader, ONLY show youth president tabs
    if (isYouthLeader) {
      return item.roles.includes('youth_president');
    }
    
    // If user is Regional Manager, ONLY show regional manager tabs
    if (isRegionalManager) {
      return item.roles.includes('regional_manager');
    }
    
    // If user is Women's League, ONLY show women's league tabs
    if (isWomensLeague) {
      return item.roles.includes('women_league');
    }
    
    // If user is Veterans League, ONLY show veterans league tabs
    if (isVeteransLeague) {
      return item.roles.includes('veterans_league');
    }
    
    // Otherwise, filter by profile role (exclude special membership tabs)
    return item.roles.includes(userRole) && 
           !item.roles.includes('national_admin') && 
           !item.roles.includes('youth_president') &&
           !item.roles.includes('regional_manager') &&
           !item.roles.includes('women_league') &&
           !item.roles.includes('veterans_league');
  }).map(item => {
    if (homeDashboardRoute && item.id === 'parent-dashboard' && userRole === 'parent') {
      return { ...item, route: homeDashboardRoute };
    }
    // K12 parent center Dash tab → Tutor Chat (locked decision)
    if (item.id === 'parent-dash' && userRole === 'parent' && resolvedSchoolType === 'k12_school') {
      return { ...item, route: '/screens/dash-assistant?mode=advisor&source=k12_parent_tab' };
    }
    if (homeDashboardRoute && item.id === 'learner-dashboard' && (userRole === 'student' || userRole === 'learner')) {
      return { ...item, route: homeDashboardRoute };
    }
    if (homeDashboardRoute && item.id === 'org-admin-dashboard' && userRole === 'admin') {
      return { ...item, route: homeDashboardRoute };
    }
    return item;
  });

  if (hideFeesOnDashboards) {
    visibleTabs = visibleTabs.filter((item) => item.id !== 'principal-reports');
  }

  if (isSchoolAdmin) {
    visibleTabs = visibleTabs.filter(item => item.id !== 'org-admin-settings');
    if (!visibleTabs.some(item => item.isCenterTab)) {
      visibleTabs = [...visibleTabs, SCHOOL_ADMIN_DASH_TAB];
    }
  }

  // Check if current route matches tab
  const isActive = (route: string, tabId?: string) => {
    if (!pathname) return false;
    const normalizedRoute = route.split('?')[0];

    if (tabId === 'parent-dashboard') {
      return (
        pathname === '/screens/parent-dashboard' ||
        pathname.startsWith('/screens/parent-dashboard') ||
        pathname === '/(k12)/parent/dashboard' ||
        pathname.startsWith('/(k12)/parent/dashboard')
      );
    }

    // K12 parent center Dash tab — highlight for any Dash-related screen
    if (tabId === 'parent-dash') {
      return (
        pathname.includes('/screens/dash-assistant') ||
        pathname.includes('/screens/dash-voice') ||
        pathname.includes('/screens/dash-tutor')
      );
    }

    return pathname === normalizedRoute || pathname.startsWith(normalizedRoute);
  };

  // Don't show on auth/onboarding/landing screens or message threads
  const shouldHide = 
    !pathname ||
    pathname === '/' ||
    pathname.includes('/(auth)') ||
    pathname.includes('/sign-in') ||
    pathname.includes('/register') ||
    pathname.includes('/landing') ||
    pathname.includes('/onboarding') ||
    pathname.includes('org-onboarding') ||
    pathname.includes('principal-onboarding') ||
    pathname.includes('school-registration') ||
    pathname.includes('parent-child-registration') ||
    pathname.includes('learner-registration') ||
    pathname.includes('parent-registration') ||
    pathname.includes('teacher-registration') ||
    pathname.includes('teacher-approval-pending') ||
    pathname.includes('/auth-callback') ||
    pathname.includes('/invite/') ||
    // Hide on any message thread view (parent/teacher/principal variants)
    pathname.includes('message-thread') ||
    // Hide during full-screen tutor mode
    pathname.includes('/screens/dash-tutor') ||
    // Hide during exam mode for a focused, full-screen experience
    pathname.includes('exam-generation');

  if (shouldHide) {
    return null;
  }

  // Safety check: if no tabs are visible, don't render
  if (visibleTabs.length === 0) {
    return null;
  }

  const isK12ParentRole = userRole === 'parent' && resolvedSchoolType === 'k12_school';
  const isK12ParentRoute =
    typeof pathname === 'string' &&
    (
      pathname.startsWith('/(k12)/parent/') ||
      pathname.startsWith('/screens/parent-') ||
      pathname === '/screens/homework' ||
      pathname === '/screens/exam-prep' ||
      pathname === '/screens/dash-assistant' ||
      pathname === '/screens/dash-voice'
    );
  const isK12ParentNextGenNav =
    flags.k12_parent_quickwins_v1 &&
    isK12ParentRole &&
    isK12ParentRoute;

  const isTeacherDashboardNav = userRole === 'teacher';
  const isNextGenNav = isTeacherDashboardNav || isK12ParentNextGenNav;
  const navActiveColor = isTeacherDashboardNav
    ? '#5A409D'
    : isK12ParentNextGenNav
      ? '#3C8E62'
      : theme.primary;
  const navBackgroundColor = isNextGenNav ? 'rgba(15,18,30,0.88)' : theme.surface;
  const navBorderColor = isNextGenNav ? 'rgba(255,255,255,0.08)' : theme.border;
  const navInactiveColor = isNextGenNav ? 'rgba(234,240,255,0.72)' : theme.textSecondary;
  const navBottomPadding = Platform.OS === 'web' ? 0 : Math.max(insets.bottom, uiTokens.spacing.xs);
  const containerPaddingTop = isK12ParentNextGenNav
    ? (isCompact ? 0 : 1)
    : (isCompact ? uiTokens.spacing.xs : 6);
  const tabMinHeight = isK12ParentNextGenNav
    ? (isCompact ? 40 : 44)
    : (isCompact ? 44 : 50);
  const centerOrbMarginTop = isK12ParentNextGenNav
    ? (isCompact ? -6 : -10)
    : (isCompact ? -20 : -24);
  const centerOrbBackground = isNextGenNav ? 'rgba(15,18,30,0.95)' : theme.surface;

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: Platform.OS === 'ios' ? 'transparent' : navBackgroundColor,
      borderTopWidth: Platform.OS === 'ios' ? 0 : 1,
      borderTopColor: navBorderColor,
      paddingBottom: navBottomPadding,
      paddingTop: containerPaddingTop,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.22,
      shadowRadius: 16,
      elevation: 12,
      overflow: 'hidden' as const,
    },
    blurBackground: {
      ...StyleSheet.absoluteFillObject,
    },
    activeIndicator: {
      position: 'absolute' as const,
      top: 2,
      width: 32,
      height: 3,
      borderRadius: 2,
      backgroundColor: navActiveColor,
      alignSelf: 'center' as const,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: isK12ParentNextGenNav ? (isCompact ? 1 : 2) : (isCompact ? 2 : uiTokens.spacing.xs),
      minHeight: tabMinHeight,
    },
    iconContainer: {
      marginBottom: isCompact ? 1 : 2,
    },
    label: {
      fontSize: isCompact ? 9 : 10,
      fontWeight: '600',
      color: navInactiveColor,
      marginTop: 1,
    },
    labelActive: {
      color: navActiveColor,
    },
    // --- Center Dash tab (raised orb) ---
    centerTab: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'flex-end' as const,
      paddingBottom: isK12ParentNextGenNav ? (isCompact ? 1 : 2) : (isCompact ? 2 : 4),
      minHeight: tabMinHeight,
    },
    centerOrbWrapper: {
      width: isCompact ? 48 : 54,
      height: isCompact ? 48 : 54,
      borderRadius: isCompact ? 24 : 27,
      marginTop: centerOrbMarginTop,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: centerOrbBackground,
      borderWidth: isK12ParentNextGenNav ? 2 : 3,
      borderColor: navBorderColor,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isNextGenNav ? 0.2 : 0.22,
      shadowRadius: 8,
      elevation: isNextGenNav ? 6 : 8,
    },
    centerOrbWrapperActive: {
      borderColor: navActiveColor,
      shadowOpacity: isNextGenNav ? 0.3 : 0.32,
    },
    centerLabel: {
      fontSize: isCompact ? 9 : 10,
      fontWeight: '700' as const,
      color: navInactiveColor,
      marginTop: isK12ParentNextGenNav ? 1 : 2,
    },
    centerLabelActive: {
      color: navActiveColor,
    },
    badgeWrapper: {
      position: 'relative' as const,
    },
    badge: {
      position: 'absolute' as const,
      top: -3,
      right: -5,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: '#EF4444',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 3,
      borderWidth: 1.5,
      borderColor: navBackgroundColor,
    },
    badgeText: {
      fontSize: 9,
      fontWeight: '700' as const,
      color: '#fff',
      lineHeight: 11,
    },
  });

  // Sort tabs so the center tab (if any) is in the middle position
  // NOTE: plain computation (not useMemo) because this runs after early returns
  const centerTab = visibleTabs.find(t => t.isCenterTab);
  const sortedTabs = (() => {
    if (!centerTab) return visibleTabs;
    const regularTabs = visibleTabs.filter(t => !t.isCenterTab);
    const mid = Math.floor(regularTabs.length / 2);
    const result = [...regularTabs];
    result.splice(mid, 0, centerTab);
    return result;
  })();

  return (
    <View
      style={[
        styles.container,
        visibleTabs.some(t => t.isCenterTab) && { overflow: 'visible' as const },
        Platform.OS === 'web' && {
          position: 'fixed' as any,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1200,
        },
      ]}
    >
      {/* Glass blur background (iOS) */}
      {Platform.OS === 'ios' && (
        <BlurView
          intensity={40}
          tint="dark"
          style={styles.blurBackground}
        />
      )}

      {sortedTabs.map((tab) => {
        const active = isActive(tab.route, tab.id);

        // Render raised center orb for Dash AI tab
        if (tab.isCenterTab) {
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.centerTab}
              onPress={() => router.push(tab.route as any)}
              onLongPress={() => router.push('/screens/app-search?scope=dash&q=dash' as any)}
              delayLongPress={260}
              activeOpacity={0.8}
            >
              <View style={[styles.centerOrbWrapper, active && styles.centerOrbWrapperActive]}>
                <CosmicOrb size={isCompact ? 36 : 40} isProcessing={false} isSpeaking={false} />
              </View>
              <Text style={[styles.centerLabel, active && styles.centerLabelActive]} numberOfLines={1}>
                {t('navigation.dash', { defaultValue: 'Dash' })}
              </Text>
            </TouchableOpacity>
          );
        }

        const isMessageTab = MESSAGE_TAB_IDS.has(tab.id);
        const badgeCount = isMessageTab ? unreadMessages : 0;

        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.tab}
            onPress={() => router.push(tab.route as any)}
            activeOpacity={0.7}
          >
            {/* Active tab pill indicator */}
            {active && <View style={styles.activeIndicator} />}
            <View style={[styles.iconContainer, styles.badgeWrapper]}>
              <AnimatedTabIcon
                name={active ? tab.activeIcon : tab.icon}
                size={isCompact ? 20 : 22}
                color={active ? navActiveColor : navInactiveColor}
                active={active}
              />
              {badgeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {badgeCount > 99 ? '99+' : String(badgeCount)}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {t(`navigation.${tab.label.toLowerCase()}`, { defaultValue: tab.label })}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
