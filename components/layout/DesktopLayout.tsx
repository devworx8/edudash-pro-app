import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth, usePermissions } from '@/contexts/AuthContext';
import { useOrganizationBranding } from '@/contexts/OrganizationBrandingContext';
import { Avatar } from '@/components/ui/Avatar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MobileNavDrawer } from '@/components/navigation/MobileNavDrawer';
import { useNotificationBadgeCount } from '@/hooks/useNotificationCount';
import { useFinancePrivacyMode } from '@/hooks/useFinancePrivacyMode';
import { signOutAndRedirect } from '@/lib/authActions';
import { WEB_SIDEBAR_BREAKPOINT } from '@/lib/navigation/webLayout';
import { isPlatformStaff } from '@/lib/roleUtils';

interface DesktopLayoutProps {
  children: React.ReactNode;
  role?: 'principal' | 'teacher' | 'parent' | 'super_admin' | 'system_admin' | 'content_moderator' | 'support_admin' | 'billing_admin' | 'student';
  title?: string; // Custom title for mobile header (overrides tenant slug)
  showBackButton?: boolean; // Show back button instead of hamburger menu
  mobileHeaderTopInsetOffset?: number; // Extra top spacing after safe-area inset on mobile header
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  roles?: string[];
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  // Dashboard items
  { id: 'dashboard', label: 'Dashboard', icon: 'grid-outline', route: '/screens/principal-dashboard', roles: ['principal', 'principal_admin'] },
  { id: 'teacher-dash', label: 'Dashboard', icon: 'grid-outline', route: '/screens/teacher-dashboard', roles: ['teacher'] },
  { id: 'parent-dash', label: 'Dashboard', icon: 'grid-outline', route: '/screens/parent-dashboard', roles: ['parent'] },
  { id: 'parent-progress', label: 'Learning Progress', icon: 'trending-up-outline', route: '/screens/parent-progress', roles: ['parent'] },
  { id: 'parent-homework-history', label: 'Homework History', icon: 'time-outline', route: '/screens/parent-homework-history', roles: ['parent'] },
  { id: 'parent-announcements', label: 'Announcements', icon: 'megaphone-outline', route: '/screens/parent-announcements', roles: ['parent'] },
  { id: 'parent-menu', label: 'Weekly Menu', icon: 'restaurant-outline', route: '/screens/parent-menu', roles: ['parent'] },
  { id: 'parent-documents', label: 'Documents', icon: 'document-text-outline', route: '/screens/parent-document-upload', roles: ['parent'] },
  { id: 'parent-ai-help', label: 'AI Help Hub', icon: 'sparkles-outline', route: '/screens/parent-ai-help', roles: ['parent'] },
  { id: 'parent-my-exams', label: 'My Exams', icon: 'school-outline', route: '/screens/parent-my-exams', roles: ['parent'] },
  { id: 'parent-aftercare', label: 'Register Aftercare', icon: 'business-outline', route: '/screens/parent-aftercare-registration', roles: ['parent'] },
  { id: 'parent-upgrade', label: 'Upgrade Plan', icon: 'arrow-up-circle-outline', route: '/screens/parent-upgrade', roles: ['parent'] },
  { id: 'parent-calendar', label: 'Calendar', icon: 'calendar-outline', route: '/screens/calendar', roles: ['parent'] },
  
  // Principal/Teacher items
  { id: 'students', label: 'Students', icon: 'people-outline', route: '/screens/student-management', roles: ['principal', 'principal_admin', 'teacher'] },
  { id: 'teachers', label: 'Teachers', icon: 'school-outline', route: '/screens/teacher-management', roles: ['principal', 'principal_admin'] },
  { id: 'teacher-daily-routine', label: 'Daily Routine', icon: 'today-outline', route: '/screens/teacher-daily-program-planner', roles: ['teacher'] },
  { id: 'registrations', label: 'Registrations', icon: 'person-add-outline', route: '/screens/principal-registrations', roles: ['principal', 'principal_admin'] },
  { id: 'classes', label: 'Classes', icon: 'book-outline', route: '/screens/class-teacher-management', roles: ['principal', 'principal_admin', 'teacher'] },
  { id: 'teacher-routine-requests', label: 'Routine Requests', icon: 'clipboard-outline', route: '/screens/teacher-routine-requests', roles: ['teacher'] },
  { id: 'attendance', label: 'Attendance', icon: 'checkmark-circle-outline', route: '/screens/attendance', roles: ['principal', 'principal_admin', 'teacher'] },
  { id: 'messages', label: 'Messages', icon: 'mail-outline', route: '/screens/teacher-message-list', roles: ['principal', 'principal_admin', 'teacher'] },
  { id: 'principal-daily-planner', label: 'AI Daily Planner', icon: 'sparkles-outline', route: '/screens/principal-daily-program-planner', roles: ['principal', 'principal_admin'] },
  { id: 'principal-ai-year-planner', label: 'AI Year Planner', icon: 'calendar-clear-outline', route: '/screens/principal-ai-year-planner', roles: ['principal', 'principal_admin'] },
  { id: 'principal-routine-requests', label: 'Routine Requests', icon: 'clipboard-outline', route: '/screens/principal-routine-requests', roles: ['principal', 'principal_admin'] },
  { id: 'financials', label: 'Financials', icon: 'cash-outline', route: '/screens/finance-control-center?tab=overview', roles: ['principal', 'principal_admin'] },
  { id: 'campaigns', label: 'Campaigns', icon: 'megaphone-outline', route: '/screens/campaigns', roles: ['principal', 'principal_admin'] },
  { id: 'timetable', label: 'Timetable', icon: 'time-outline', route: '/screens/timetable-management', roles: ['principal', 'principal_admin'] },
  { id: 'staff-leave', label: 'Staff Leave', icon: 'calendar-outline', route: '/screens/staff-leave', roles: ['principal', 'principal_admin'] },
  { id: 'waitlist', label: 'Waitlist', icon: 'list-outline', route: '/screens/waitlist-management', roles: ['principal', 'principal_admin'] },
  { id: 'compliance', label: 'Compliance', icon: 'shield-outline', route: '/screens/compliance-dashboard', roles: ['principal', 'principal_admin'] },
  { id: 'budget', label: 'Budget', icon: 'wallet-outline', route: '/screens/budget-management', roles: ['principal', 'principal_admin'] },
  { id: 'reports', label: 'Reports', icon: 'document-text-outline', route: '/screens/teacher-reports', roles: ['principal', 'principal_admin', 'teacher'] },
  
  // Parent items
  { id: 'parent-messages', label: 'Messages', icon: 'mail-outline', route: '/screens/parent-messages', roles: ['parent'] },
  { id: 'children', label: 'My Children', icon: 'heart-outline', route: '/screens/parent-children', roles: ['parent'] },
  
  // Super Admin items
  { id: 'super-admin-dash', label: 'Dashboard', icon: 'shield-checkmark-outline', route: '/screens/super-admin-dashboard', roles: ['super_admin'] },
  { id: 'users', label: 'Users', icon: 'people-circle-outline', route: '/screens/super-admin-users', roles: ['super_admin', 'content_moderator', 'support_admin'] },
  { id: 'organizations', label: 'Organizations', icon: 'business-outline', route: '/screens/super-admin-organizations', roles: ['super_admin', 'content_moderator', 'support_admin', 'billing_admin'] },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'card-outline', route: '/screens/super-admin-subscriptions', roles: ['super_admin'] },
  { id: 'analytics', label: 'Analytics', icon: 'analytics-outline', route: '/screens/super-admin-analytics', roles: ['super_admin'] },
  { id: 'monitoring', label: 'Monitoring', icon: 'pulse-outline', route: '/screens/super-admin-system-monitoring', roles: ['super_admin', 'system_admin'] },
  { id: 'ai-quotas', label: 'AI Quotas', icon: 'flash-outline', route: '/screens/super-admin-ai-quotas', roles: ['super_admin', 'billing_admin'] },
  { id: 'team-chat', label: 'Team Chat', icon: 'chatbubbles-outline', route: '/screens/super-admin-team-chat', roles: ['super_admin', 'system_admin', 'content_moderator', 'support_admin', 'billing_admin'] },
  { id: 'announcements', label: 'Announcements', icon: 'megaphone-outline', route: '/screens/super-admin-announcements', roles: ['super_admin', 'system_admin', 'content_moderator', 'support_admin', 'billing_admin'] },
  
  // Platform sub-admin dashboard items
  { id: 'platform-admin-dash', label: 'Dashboard', icon: 'shield-outline', route: '/screens/platform-admin-dashboard', roles: ['system_admin', 'content_moderator', 'support_admin', 'billing_admin'] },
  { id: 'command-center', label: 'Command Center', icon: 'terminal-outline', route: '/screens/super-admin-platform-command-center', roles: ['system_admin'] },
  { id: 'content-studio', label: 'Content Studio', icon: 'create-outline', route: '/screens/super-admin-content-studio', roles: ['content_moderator'] },
  { id: 'moderation', label: 'Moderation', icon: 'flag-outline', route: '/screens/super-admin-moderation', roles: ['content_moderator'] },
  
  // Common items
  { id: 'settings', label: 'Settings', icon: 'settings-outline', route: '/screens/settings', roles: ['principal', 'principal_admin', 'teacher', 'parent', 'super_admin', 'system_admin', 'content_moderator', 'support_admin', 'billing_admin'] },
];

/**
 * DesktopLayout - PWA-optimized layout with side navigation
 * 
 * Features:
 * - Collapsible side navigation (240px expanded, 64px collapsed)
 * - Role-based navigation items
 * - Active route highlighting
 * - Keyboard shortcuts (Cmd/Ctrl + K for search)
 * - Responsive breakpoints (hides on mobile < 768px)
 * - Theme-aware styling
 * 
 * Usage:
 * <DesktopLayout role="principal">
 *   <YourScreenContent />
 * </DesktopLayout>
 */
export function DesktopLayout({
  children,
  role,
  title,
  showBackButton,
  mobileHeaderTopInsetOffset = 12,
}: DesktopLayoutProps) {
  const { theme } = useTheme();
  const { user, profile, profileLoading } = useAuth();
  const permissions = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const notificationCount = useNotificationBadgeCount();
  const { hideFeesOnDashboards } = useFinancePrivacyMode();
  const { organizationName: brandingOrgName, isLoading: brandingLoading } = useOrganizationBranding();
  
  // Use window dimensions for responsive behavior on web
  const { width: windowWidth } = useWindowDimensions();
  const isMobileWidth = windowWidth < WEB_SIDEBAR_BREAKPOINT;

  // Determine user role from profile if not provided
  const userRole = role || (profile?.role as string) || 'parent';
  // Keep the header avatar consistent across dashboards.
  const headerAvatarSize = 44;
  
  // Filter nav items by role
  const filteredNavItems = NAV_ITEMS.filter(item =>
    !item.roles || item.roles.includes(userRole)
  ).filter((item) => {
    if (!hideFeesOnDashboards) return true;
    return item.id !== 'financials';
  });

  // Dash ORB route — super_admin gets the full Ops chat, everyone else gets voice orb
  const dashRoute = userRole === 'super_admin'
    ? '/screens/dash-ai-chat'
    : '/screens/dash-voice?mode=orb';
  const isDashActive = !!(pathname?.includes('dash-voice') || pathname?.includes('dash-ai-chat'));

  // Check if current route matches nav item
  const isActive = (route: string) => {
    return pathname === route || pathname?.startsWith(route);
  };

  const styles = React.useMemo(() => createStyles(theme, sidebarCollapsed, insets), [theme, sidebarCollapsed, insets]);

  // Resolve tenant slug from enhanced profile (organization membership)
  const org: any = (permissions as any)?.enhancedProfile?.organization_membership || {};
  const fallbackOrgName =
    profile?.organization_name ||
    (profile as any)?.preschool_name ||
    (profile as any)?.school_name ||
    '';
  const rawTenantName =
    brandingOrgName ||
    org?.organization_name ||
    fallbackOrgName ||
    org?.organization_slug ||
    org?.tenant_slug ||
    org?.slug;
  const normalizedTenantName = typeof rawTenantName === 'string' ? rawTenantName : '';
  const hasTenantName =
    normalizedTenantName &&
    normalizedTenantName.trim().length > 0 &&
    normalizedTenantName.trim().toLowerCase() !== 'unknown';
  const isOrgNameLoading = !hasTenantName && (brandingLoading || profileLoading);
  const tenantSlug: string = hasTenantName
    ? normalizedTenantName
    : isOrgNameLoading
      ? 'Loading...'
      : isPlatformStaff(userRole)
        ? 'EduDash Pro'
        : 'My School';

  // Mobile layout styles (computed here for mobile header)
  const mobileStyles = React.useMemo(() => ({
    mobileHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: 16,
      paddingTop: insets.top + mobileHeaderTopInsetOffset,
      paddingBottom: 12,
      backgroundColor: theme.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      ...(Platform.OS === 'web'
        ? {
            position: 'sticky' as any,
            top: 0,
            zIndex: 40,
          }
        : {
            position: 'relative' as const,
            zIndex: 30,
            ...(Platform.OS === 'android' ? { elevation: 6 } : null),
          }),
    },
    headerLeft: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      flex: 1,
      minWidth: 0,
      gap: 12,
    },
    hamburgerButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: theme.surfaceVariant,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700' as const,
      color: theme.text,
      flexShrink: 1,
    },
    headerRight: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
    },
    iconButton: {
      padding: 8,
      borderRadius: 8,
    },
  }), [theme, insets, mobileHeaderTopInsetOffset]);

  // On native platforms OR mobile-width web, render mobile layout with header
  // This ensures Chrome DevTools mobile view shows mobile layout
  if (Platform.OS !== 'web' || isMobileWidth) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.background,
          position: 'relative' as any,
          ...(Platform.OS === 'web' ? { height: '100vh' as any, overflow: 'hidden' as any } : null),
        }}
      >
        {/* Mobile Header with Hamburger or Back Button */}
        <View style={mobileStyles.mobileHeader}>
          <View style={mobileStyles.headerLeft}>
            {showBackButton ? (
              <TouchableOpacity
                style={mobileStyles.hamburgerButton}
                onPress={() => {
                  router.back();
                }}
              >
                <Ionicons name="arrow-back" size={24} color={theme.text} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  mobileStyles.hamburgerButton,
                  Platform.OS === 'web' && { cursor: 'pointer' },
                ]}
                onPress={() => {
                  setMobileDrawerOpen(true);
                }}
                accessibilityLabel="Open menu"
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <Ionicons name="menu" size={24} color={theme.text} />
              </TouchableOpacity>
            )}
            <Text style={mobileStyles.headerTitle} numberOfLines={1}>{title || tenantSlug}</Text>
          </View>
          <View style={mobileStyles.headerRight}>
            {/* Dash ORB — always accessible from the header on mobile/tablet */}
            <TouchableOpacity
              style={[
                mobileStyles.iconButton,
                {
                  backgroundColor: isDashActive ? theme.primary + '33' : theme.primary + '18',
                  borderRadius: 20,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                },
              ]}
              onPress={() => router.push(dashRoute as any)}
              accessibilityLabel="Open Dash AI"
              accessibilityRole="button"
            >
              <Ionicons name="sparkles" size={18} color={theme.primary} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.primary }}>Dash</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={mobileStyles.iconButton}
              onPress={() => router.push('/screens/notifications' as any)}
            >
              <View>
                <Ionicons name="notifications-outline" size={22} color={theme.textSecondary} />
                {notificationCount > 0 && (
                  <View style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    backgroundColor: theme.error,
                    borderRadius: 10,
                    minWidth: 18,
                    height: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                    borderWidth: 2,
                    borderColor: theme.surface,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={mobileStyles.iconButton}
              onPress={() => router.push('/screens/account' as any)}
            >
              <Avatar
                name={`${user?.user_metadata?.first_name || ''} ${user?.user_metadata?.last_name || ''}`.trim() || user?.email || 'User'}
                imageUri={(profile as any)?.avatar_url || null}
                size={headerAvatarSize}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Content */}
        <View style={{ flex: 1, minHeight: 0, ...(Platform.OS === 'web' ? { overflow: 'hidden' as any } : null) }}>
          {children}
        </View>

        {/* Mobile Navigation Drawer */}
        <MobileNavDrawer
          isOpen={mobileDrawerOpen}
          onClose={() => {
            setMobileDrawerOpen(false);
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Side Navigation - Hidden on mobile via CSS */}
      <View style={styles.sidebar}>
        {/* Logo & Toggle */}
        <View style={styles.sidebarHeader}>
          {!sidebarCollapsed && (
            <View style={styles.logoContainer}>
              <Ionicons name="school" size={28} color={theme.primary} />
              <Text style={styles.logoText} numberOfLines={1}>{tenantSlug}</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.collapseButton}
            onPress={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <Ionicons
              name={sidebarCollapsed ? 'chevron-forward' : 'chevron-back'}
              size={20}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Navigation Items */}
        <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 12 }}>
          <View style={styles.navItems}>
            {filteredNavItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.navItem,
                  isActive(item.route) && styles.navItemActive,
                ]}
                onPress={() => router.push(item.route as any)}
              >
                <Ionicons
                  name={item.icon as any}
                  size={22}
                  color={isActive(item.route) ? theme.primary : theme.textSecondary}
                />
                {!sidebarCollapsed && (
                  <>
                    <Text
                      style={[
                        styles.navItemText,
                        isActive(item.route) && styles.navItemTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.badge && item.badge > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.badge}</Text>
                      </View>
                    )}
                  </>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Dash ORB — pinned above footer, always discoverable */}
        <View style={styles.dashButtonContainer}>
          <TouchableOpacity
            style={[styles.dashButton, isDashActive && styles.dashButtonActive]}
            onPress={() => router.push(dashRoute as any)}
            accessibilityLabel="Open Dash AI"
            accessibilityRole="button"
          >
            <Ionicons name="sparkles" size={20} color="#fff" />
            {!sidebarCollapsed && (
              <Text style={styles.dashButtonText}>Ask Dash</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Powered by (above separator line) */}
        {!sidebarCollapsed && (
          <View style={styles.poweredByBar}>
            <Text style={styles.poweredBy} numberOfLines={1}>Powered by EduDash Pro</Text>
          </View>
        )}

        {/* User Profile Footer */}
        <View style={styles.sidebarFooter}>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => router.push('/screens/account')}
          >
            <Avatar
              name={`${user?.user_metadata?.first_name || ''} ${user?.user_metadata?.last_name || ''}`.trim() || user?.email || 'User'}
              imageUri={(profile as any)?.avatar_url || null}
              size={sidebarCollapsed ? 36 : 40}
            />
            {!sidebarCollapsed && (
              <View style={styles.profileInfo}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {user?.user_metadata?.first_name || 'User'}
                </Text>
                <Text style={styles.profileRole} numberOfLines={1}>
                  {userRole}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          {!sidebarCollapsed && (
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={() => signOutAndRedirect({ redirectTo: '/(auth)/sign-in' })}
            >
              <Ionicons name="log-out-outline" size={18} color={theme.error} />
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Content Area */}
      <View style={styles.mainContent}>
        <View style={styles.desktopHeader}>
          <Text style={styles.desktopHeaderTitle} numberOfLines={1}>
            {title || tenantSlug}
          </Text>
          {/* Dash pill — quick access from any screen on desktop */}
          <TouchableOpacity
            style={[styles.desktopDashPill, isDashActive && styles.desktopDashPillActive]}
            onPress={() => router.push(dashRoute as any)}
            accessibilityLabel="Open Dash AI"
            accessibilityRole="button"
          >
            <Ionicons name="sparkles" size={16} color="#fff" />
            <Text style={styles.desktopDashPillText}>Ask Dash</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.desktopHeaderAccountButton}
            onPress={() => router.push('/screens/account' as any)}
          >
            <Avatar
              name={`${user?.user_metadata?.first_name || ''} ${user?.user_metadata?.last_name || ''}`.trim() || user?.email || 'User'}
              imageUri={(profile as any)?.avatar_url || null}
              size={34}
            />
          </TouchableOpacity>
        </View>
        {children}
      </View>
    </View>
  );
}

const createStyles = (theme: any, collapsed: boolean, insets: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: theme.background,
      minHeight: '100dvh' as any,
    },
    sidebar: {
      width: collapsed ? 64 : 240,
      backgroundColor: theme.surface,
      borderRightWidth: 1,
      borderRightColor: theme.border,
      flexDirection: 'column',
      minHeight: 0,
      // Hide on mobile screens
      ['@media (max-width: 767px)' as any]: {
        display: 'none' as any,
      },
    },
    sidebarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      paddingTop: insets.top + 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    logoContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    logoText: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
    },
    collapseButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: theme.surfaceVariant,
    },
    navScroll: {
      flex: 1,
      minHeight: 0,
    },
    navItems: {
      padding: 12,
      gap: 4,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 10,
      gap: 12,
      cursor: 'pointer' as any,
    },
    navItemActive: {
      backgroundColor: theme.primaryLight + '20',
    },
    navItemText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '500',
      color: theme.textSecondary,
    },
    navItemTextActive: {
      color: theme.primary,
      fontWeight: '600',
    },
    badge: {
      backgroundColor: theme.error,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 2,
      minWidth: 20,
      alignItems: 'center',
    },
    badgeText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '600',
    },
    sidebarFooter: {
      borderTopWidth: 1,
      borderTopColor: theme.border,
      padding: 12,
      gap: 8,
    },
    poweredByBar: {
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    poweredBy: {
      fontSize: 11,
      color: theme.textSecondary,
      textAlign: 'center' as any,
    },
    profileButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 8,
      borderRadius: 10,
      gap: 12,
      cursor: 'pointer' as any,
    },
    signOutButton: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.error + '55',
      backgroundColor: theme.error + '14',
      gap: 8,
      cursor: 'pointer' as any,
    },
    signOutButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.error,
    },
    profileInfo: {
      flex: 1,
    },
    profileName: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 2,
    },
    profileRole: {
      fontSize: 12,
      color: theme.textSecondary,
      textTransform: 'capitalize' as any,
    },
    mainContent: {
      flex: 1,
      minWidth: 0,
      overflow: 'hidden' as any,
      // Full width on mobile
      ['@media (max-width: 767px)' as any]: {
        width: '100%' as any,
      },
    },
    desktopHeader: {
      height: 60,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      ...(Platform.OS === 'web'
        ? {
            position: 'sticky' as any,
            top: 0,
            zIndex: 20,
          }
        : null),
    },
    desktopHeaderTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: theme.text,
      marginRight: 12,
    },
    desktopHeaderAccountButton: {
      borderRadius: 999,
      cursor: 'pointer' as any,
    },
    // ── Dash ORB access ──────────────────────────────────────────────────────
    dashButtonContainer: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 4,
    },
    dashButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: collapsed ? 'center' : 'flex-start',
      paddingVertical: 11,
      paddingHorizontal: collapsed ? 0 : 14,
      borderRadius: 12,
      gap: 10,
      backgroundColor: theme.primary,
      cursor: 'pointer' as any,
    },
    dashButtonActive: {
      opacity: 0.85,
    },
    dashButtonText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: '#fff',
    },
    desktopDashPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.primary,
      marginRight: 12,
      cursor: 'pointer' as any,
    },
    desktopDashPillActive: {
      opacity: 0.85,
    },
    desktopDashPillText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#fff',
    },
  });
