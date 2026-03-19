/**
 * MobileNavDrawer - Slide-out navigation drawer for web mobile
 * Shows navigation items when hamburger menu is pressed on mobile web
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Platform,
  ScrollView,
  Pressable,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOutAndRedirect } from '@/lib/authActions';
import { getRoleDisplayName } from '@/lib/roleUtils';
import { getNavDrawerStyles, DRAWER_WIDTH } from './MobileNavDrawer.styles';
import Constants from 'expo-constants';
import {
  resolveExplicitSchoolTypeFromProfile,
  resolveOrganizationId,
} from '@/lib/schoolTypeResolver';
import { getDashboardRouteForRole } from '@/lib/dashboard/routeMatrix';
import { useFinancePrivacyMode } from '@/hooks/useFinancePrivacyMode';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  badge?: number;
}

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  navItems?: NavItem[];
}

const GLOBAL_FUNCTION_SEARCH_ITEM: NavItem = {
  id: 'find-feature',
  label: 'Find Feature',
  icon: 'search',
  route: '/screens/app-search',
};

function ensureGlobalSearchItem(items: NavItem[]): NavItem[] {
  if (items.some((item) => item.id === GLOBAL_FUNCTION_SEARCH_ITEM.id || item.route.startsWith('/screens/app-search'))) {
    return items;
  }
  const homeIndex = items.findIndex((item) => item.id === 'home');
  if (homeIndex >= 0) {
    return [
      ...items.slice(0, homeIndex + 1),
      GLOBAL_FUNCTION_SEARCH_ITEM,
      ...items.slice(homeIndex + 1),
    ];
  }
  return [GLOBAL_FUNCTION_SEARCH_ITEM, ...items];
}

// Default nav items by role
const getDefaultNavItems = (
  role: string,
  options?: { adminHomeRoute?: string }
): NavItem[] => {
  switch (role) {
    case 'teacher':
      return [
        { id: 'home', label: 'Dashboard', icon: 'home', route: '/screens/teacher-dashboard' },
        { id: 'daily-routine', label: 'Daily Routine', icon: 'today', route: '/screens/teacher-daily-program-planner' },
        { id: 'students', label: 'Students', icon: 'people', route: '/screens/student-management' },
        { id: 'classes', label: 'Classes', icon: 'school', route: '/screens/class-teacher-management' },
        { id: 'routine-requests', label: 'Routine Requests', icon: 'clipboard', route: '/screens/teacher-routine-requests' },
        { id: 'lessons', label: 'Browse Lessons', icon: 'book', route: '/screens/teacher-lessons' },
        { id: 'assign', label: 'Assign Lessons', icon: 'paper-plane', route: '/screens/assign-lesson' },
        { id: 'activities', label: 'Activities', icon: 'game-controller', route: '/screens/aftercare-activities' },
        { id: 'messages', label: 'Messages', icon: 'chatbubble', route: '/screens/teacher-message-list' },
        { id: 'calendar', label: 'Calendar', icon: 'calendar', route: '/screens/calendar' },
        { id: 'menu', label: 'Weekly Menu', icon: 'restaurant-outline', route: '/screens/parent-menu' },
        { id: 'reports', label: 'Reports', icon: 'document-text', route: '/screens/teacher-reports' },
        { id: 'settings', label: 'Settings', icon: 'settings', route: '/screens/settings' },
      ];
    case 'parent':
      return [
        { id: 'home', label: 'Dashboard', icon: 'home', route: '/screens/parent-dashboard' },
        { id: 'children', label: 'Children', icon: 'heart', route: '/screens/parent-children' },
        { id: 'progress', label: 'Learning Progress', icon: 'trending-up', route: '/screens/parent-progress' },
        { id: 'homework_history', label: 'Homework History', icon: 'time', route: '/screens/parent-homework-history' },
        { id: 'announcements', label: 'Announcements', icon: 'megaphone', route: '/screens/parent-announcements' },
        { id: 'menu', label: 'Weekly Menu', icon: 'restaurant-outline', route: '/screens/parent-menu' },
        { id: 'messages', label: 'Messages', icon: 'chatbubble', route: '/screens/parent-messages' },
        { id: 'ai_help', label: 'AI Help Hub', icon: 'sparkles', route: '/screens/parent-ai-help' },
        { id: 'my_exams', label: 'My Exams', icon: 'school', route: '/screens/parent-my-exams' },
        { id: 'aftercare', label: 'Register Aftercare', icon: 'school', route: '/screens/parent-aftercare-registration' },
        { id: 'upgrade', label: 'Upgrade Plan', icon: 'arrow-up-circle', route: '/screens/parent-upgrade' },
        { id: 'documents', label: 'Documents', icon: 'document-attach', route: '/screens/parent-document-upload' },
        { id: 'calendar', label: 'Calendar', icon: 'calendar', route: '/screens/calendar' },
        { id: 'settings', label: 'Settings', icon: 'settings', route: '/screens/settings' },
      ];
    case 'principal':
    case 'principal_admin':
      return [
        { id: 'home', label: 'Dashboard', icon: 'home', route: '/screens/principal-dashboard' },
        { id: 'daily-planner', label: 'AI Daily Planner', icon: 'sparkles', route: '/screens/principal-daily-program-planner' },
        { id: 'year-planner-ai', label: 'AI Year Planner', icon: 'calendar-clear', route: '/screens/principal-ai-year-planner' },
        { id: 'routine-requests', label: 'Routine Requests', icon: 'clipboard', route: '/screens/principal-routine-requests' },
        { id: 'students', label: 'Students', icon: 'people', route: '/screens/student-management' },
        { id: 'teachers', label: 'Teachers', icon: 'briefcase', route: '/screens/teacher-management' },
        { id: 'teacher-approval', label: 'Approve Teachers', icon: 'checkmark-done', route: '/screens/teacher-approval' },
        { id: 'registrations', label: 'Registrations', icon: 'person-add', route: '/screens/principal-registrations' },
        { id: 'aftercare', label: 'Aftercare', icon: 'school', route: '/screens/aftercare-admin' },
        { id: 'lessons', label: 'Assign Lessons', icon: 'book', route: '/screens/assign-lesson' },
        { id: 'activities', label: 'Activities', icon: 'game-controller', route: '/screens/aftercare-activities' },
        { id: 'classes', label: 'Classes', icon: 'library', route: '/screens/class-teacher-management' },
        { id: 'attendance', label: 'Attendance', icon: 'checkbox', route: '/screens/attendance' },
        { id: 'messages', label: 'Messages', icon: 'chatbubble', route: '/screens/teacher-message-list' },
        { id: 'financials', label: 'Financials', icon: 'cash', route: '/screens/finance-control-center?tab=overview' },
        { id: 'campaigns', label: 'Campaigns', icon: 'megaphone', route: '/screens/campaigns' },
        { id: 'timetable', label: 'Timetable', icon: 'time', route: '/screens/timetable-management' },
        { id: 'staff-leave', label: 'Staff Leave', icon: 'calendar', route: '/screens/staff-leave' },
        { id: 'waitlist', label: 'Waitlist', icon: 'list', route: '/screens/waitlist-management' },
        { id: 'compliance', label: 'Compliance', icon: 'shield-checkmark', route: '/screens/compliance-dashboard' },
        { id: 'budget', label: 'Budget', icon: 'wallet', route: '/screens/budget-management' },
        { id: 'reports', label: 'Reports', icon: 'analytics', route: '/screens/teacher-reports' },
        { id: 'calendar', label: 'Calendar', icon: 'calendar', route: '/screens/calendar-management' },
        { id: 'settings', label: 'Settings', icon: 'settings', route: '/screens/settings' },
      ];
    case 'admin':
      return [
        { id: 'home', label: 'Dashboard', icon: 'home', route: options?.adminHomeRoute || '/screens/org-admin-dashboard' },
        { id: 'programs', label: 'Programs', icon: 'school', route: '/screens/org-admin/programs' },
        { id: 'cohorts', label: 'Cohorts', icon: 'people', route: '/screens/org-admin/cohorts' },
        { id: 'instructors', label: 'Team', icon: 'briefcase', route: '/screens/org-admin/instructors' },
        { id: 'enrollments', label: 'Enrollments', icon: 'list', route: '/screens/org-admin/enrollments' },
        { id: 'certifications', label: 'Certifications', icon: 'ribbon', route: '/screens/org-admin/certifications' },
        { id: 'placements', label: 'Placements', icon: 'business', route: '/screens/org-admin/placements' },
        { id: 'invoices', label: 'Invoices', icon: 'document-text', route: '/screens/org-admin/invoices' },
        { id: 'data-import', label: 'Data Import', icon: 'cloud-upload', route: '/screens/org-admin/data-import' },
        { id: 'settings', label: 'Settings', icon: 'settings', route: '/screens/org-admin/settings' },
      ];
    case 'student':
    case 'learner':
      return [
        { id: 'home', label: 'Dashboard', icon: 'home', route: '/screens/learner-dashboard' },
        { id: 'programs', label: 'My Programs', icon: 'school', route: '/screens/learner/programs' },
        { id: 'assignments', label: 'Assignments', icon: 'document-text', route: '/screens/learner/submissions' },
        { id: 'ai-help', label: 'Assignment Help', icon: 'help-circle', route: '/screens/ai-homework-helper' },
        { id: 'portfolio', label: 'Portfolio', icon: 'folder', route: '/screens/learner/portfolio' },
        { id: 'account', label: 'Account', icon: 'person-circle', route: '/screens/account' },
        { id: 'settings', label: 'Settings', icon: 'settings', route: '/screens/settings' },
      ];
    case 'super_admin':
    case 'superadmin':
      return [
        { id: 'home', label: 'Dashboard', icon: 'shield-checkmark', route: '/screens/super-admin-dashboard' },
        { id: 'ai-command', label: 'AI Command Center', icon: 'flash', route: '/screens/super-admin-ai-command-center' },
        { id: 'users', label: 'User Management', icon: 'people', route: '/screens/super-admin-users' },
        { id: 'admin-mgmt', label: 'Admin Management', icon: 'people-circle', route: '/screens/super-admin-admin-management' },
        { id: 'onboarding', label: 'School Onboarding', icon: 'school', route: '/screens/super-admin/school-onboarding-wizard' },
        { id: 'ai-quotas', label: 'AI Quotas', icon: 'hardware-chip', route: '/screens/super-admin-ai-quotas' },
        { id: 'moderation', label: 'Content Moderation', icon: 'shield', route: '/screens/super-admin-moderation' },
        { id: 'announcements', label: 'Announcements', icon: 'megaphone', route: '/screens/super-admin-announcements' },
        { id: 'monitoring', label: 'System Monitoring', icon: 'analytics', route: '/screens/super-admin-system-monitoring' },
        { id: 'whatsapp', label: 'WhatsApp Hub', icon: 'logo-whatsapp', route: '/screens/super-admin-whatsapp' },
        { id: 'system-test', label: 'System Tests', icon: 'checkmark-circle', route: '/screens/super-admin-system-test' },
        { id: 'settings', label: 'Settings', icon: 'settings', route: '/screens/settings' },
      ];
    default:
      return [
        { id: 'home', label: 'Home', icon: 'home', route: '/' },
        { id: 'settings', label: 'Settings', icon: 'settings', route: '/screens/settings' },
      ];
  }
};

export function MobileNavDrawer({ isOpen, onClose, navItems }: MobileNavDrawerProps) {
  const { theme, isDark } = useTheme();
  const { profile, signOut } = useAuth();
  const { hideFeesOnDashboards } = useFinancePrivacyMode();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const drawerWidth = Math.min(DRAWER_WIDTH, Math.max(240, viewportWidth - 24));
  
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const closeGuardEnabledRef = useRef(false);
  const closeGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overlayInteractive, setOverlayInteractive] = useState(false);
  
  const userRole = (profile?.role as string) || 'parent';
  const explicitSchoolType = resolveExplicitSchoolTypeFromProfile(profile);
  const adminHomeRoute = userRole === 'admin'
    ? (
      getDashboardRouteForRole({
        role: userRole,
        resolvedSchoolType: explicitSchoolType,
        hasOrganization: Boolean(resolveOrganizationId(profile)),
        traceContext: 'MobileNavDrawer.homeItem',
      }) || '/screens/org-admin-dashboard'
    )
    : undefined;
  const items = ensureGlobalSearchItem(navItems || getDefaultNavItems(userRole, { adminHomeRoute }))
    .filter((item) => (hideFeesOnDashboards ? item.id !== 'financials' : true));
  
  const displayRole = getRoleDisplayName(userRole);
  
  // Get display name with fallback chain: full_name -> first_name + last_name -> email -> 'Guest'
  const displayName = profile?.full_name 
    || (profile?.first_name && profile?.last_name 
        ? `${profile.first_name} ${profile.last_name}` 
        : profile?.first_name || profile?.email?.split('@')[0] || 'Guest');
  
  // Get avatar URL for profile picture
  const avatarUrl = profile?.avatar_url;

  useEffect(() => {
    if (closeGuardTimerRef.current) {
      clearTimeout(closeGuardTimerRef.current);
      closeGuardTimerRef.current = null;
    }

    if (isOpen) {
      closeGuardEnabledRef.current = false;
      setOverlayInteractive(false);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
      closeGuardTimerRef.current = setTimeout(() => {
        closeGuardEnabledRef.current = true;
        setOverlayInteractive(true);
      }, 300);
    } else {
      closeGuardEnabledRef.current = false;
      setOverlayInteractive(false);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -drawerWidth,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: Platform.OS !== 'web',
        }),
      // stopTogether: false ensures fadeAnim completes even if slideAnim is
      // cancelled by the drawerWidth-reset effect running concurrently.
      ], { stopTogether: false }).start(() => {
        fadeAnim.setValue(0);
      });
    }

    return () => {
      if (closeGuardTimerRef.current) {
        clearTimeout(closeGuardTimerRef.current);
        closeGuardTimerRef.current = null;
      }
    };
  }, [isOpen, slideAnim, fadeAnim, drawerWidth]);

  useEffect(() => {
    if (!isOpen) {
      slideAnim.setValue(-drawerWidth);
    }
  }, [drawerWidth, isOpen, slideAnim]);

  const handleNavPress = (route: string) => {
    onClose();
    // Small delay to allow drawer animation to start
    setTimeout(() => {
      router.push(route as any);
    }, 100);
  };

  const handleSignOut = async () => {
    onClose();
    // Use centralized sign out for proper session cleanup
    await signOutAndRedirect({ redirectTo: '/(auth)/sign-in' });
  };

  const isActive = (route: string) => {
    return pathname === route || pathname?.startsWith(route);
  };

  if (!isOpen && Platform.OS === 'web') {
    // On web, don't render when closed to avoid z-index issues
    return null;
  }

  const styles = getNavDrawerStyles(theme, isDark, insets, drawerWidth);

  return (
    <View style={styles.container} pointerEvents={isOpen ? 'auto' : 'none'}>
      {/* Overlay */}
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Pressable
          style={styles.overlayPressable}
          pointerEvents={overlayInteractive ? 'auto' : 'none'}
          onPress={() => {
            if (!closeGuardEnabledRef.current || !overlayInteractive) return;
            onClose();
          }}
        />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        {/* Header */}
        <View style={styles.drawerHeader}>
          <View style={styles.headerContent}>
            <View style={styles.userInfo}>
              <View style={styles.avatar}>
                {avatarUrl ? (
                  <Image 
                    source={{ uri: avatarUrl }} 
                    style={{ width: 40, height: 40, borderRadius: 20 }} 
                  />
                ) : (
                  <Ionicons name="person" size={20} color={theme.primary} />
                )}
              </View>
              <View style={styles.userText}>
                <Text style={styles.userName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.userRole}>{displayRole}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Navigation Items */}
        <ScrollView style={styles.navList} showsVerticalScrollIndicator={false}>
          {items.map((item) => {
            const active = isActive(item.route);
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.navItem, active && styles.navItemActive]}
                onPress={() => handleNavPress(item.route)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={(
                    active ||
                    item.icon.startsWith('logo-') ||
                    item.icon.endsWith('-outline')
                      ? item.icon
                      : `${item.icon}-outline`
                  ) as any}
                  size={20}
                  color={active ? theme.primary : theme.textSecondary}
                />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                  {item.label}
                </Text>
                {item.badge && item.badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Sign Out Button - Above divider */}
        <View style={styles.signOutSection}>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color={theme.error} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
        
        {/* Footer - Below divider with branding */}
        <View style={styles.footer}>
          <Text style={styles.brandText}>Powered by EduDash Pro</Text>
          <Text style={styles.versionText}>v{Constants.expoConfig?.version || '1.0.0'}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

export default MobileNavDrawer;
