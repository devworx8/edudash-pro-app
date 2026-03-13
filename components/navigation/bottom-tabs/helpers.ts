import { nextGenPalette } from '@/contexts/theme/nextGenTokens';
import { getDashboardRouteForRole } from '@/lib/dashboard/routeMatrix';
import { resolveExplicitSchoolTypeFromProfile, resolveOrganizationId, resolveSchoolTypeFromProfile, type ResolvedSchoolType } from '@/lib/schoolTypeResolver';
import type { BottomTabItem, BottomTabRoleState, BottomTabVariantState } from './types';
import { isHiddenBottomNavPath, SCHOOL_ADMIN_DASH_TAB, TAB_ITEMS } from './tabs';

function isMembershipOnlyTab(roles: string[]): boolean {
  return roles.includes('national_admin') ||
    roles.includes('youth_president') ||
    roles.includes('regional_manager') ||
    roles.includes('women_league') ||
    roles.includes('veterans_league');
}

function resolveMembershipFlags(profile: any) {
  const memberType = profile?.organization_membership?.member_type || profile?.member_type || null;
  const orgRole = profile?.organization_membership?.role || null;

  return {
    isCEO: memberType === 'ceo' || memberType === 'president' || orgRole === 'national_admin',
    isYouthLeader: ['youth_president', 'youth_deputy', 'youth_secretary', 'youth_treasurer'].includes(String(memberType || '')),
    isRegionalManager: ['regional_manager', 'provincial_manager'].includes(String(memberType || '')) || orgRole === 'regional_admin',
    isWomensLeague: String(memberType || '').startsWith('women_'),
    isVeteransLeague: String(memberType || '').startsWith('veterans_'),
  };
}

function filterTabsByRole(profile: any, userRole: string): BottomTabItem[] {
  const membershipFlags = resolveMembershipFlags(profile);

  return TAB_ITEMS.filter((item) => {
    if (!item.roles) return false;

    if (membershipFlags.isCEO) return item.roles.includes('national_admin');
    if (membershipFlags.isYouthLeader) return item.roles.includes('youth_president');
    if (membershipFlags.isRegionalManager) return item.roles.includes('regional_manager');
    if (membershipFlags.isWomensLeague) return item.roles.includes('women_league');
    if (membershipFlags.isVeteransLeague) return item.roles.includes('veterans_league');

    return item.roles.includes(userRole) && !isMembershipOnlyTab(item.roles);
  });
}

function applyRouteOverrides(
  tabs: BottomTabItem[],
  userRole: string,
  resolvedSchoolType: ResolvedSchoolType | null,
  explicitSchoolType: ResolvedSchoolType | null,
  profile: any,
): BottomTabItem[] {
  const homeDashboardRoute = getDashboardRouteForRole({
    role: userRole,
    resolvedSchoolType: userRole === 'admin' ? explicitSchoolType : resolvedSchoolType,
    hasOrganization: Boolean(resolveOrganizationId(profile)),
    traceContext: 'BottomTabBar.homeTab',
  });

  return tabs.map((item) => {
    if (homeDashboardRoute && item.id === 'parent-dashboard' && userRole === 'parent') {
      return { ...item, route: homeDashboardRoute };
    }

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
}

export function buildVisibleTabs(profile: any, hideFeesOnDashboards: boolean): { tabs: BottomTabItem[]; roleState: BottomTabRoleState } {
  const userRole = String(profile?.role || 'parent');
  const resolvedSchoolType = resolveSchoolTypeFromProfile(profile);
  const explicitSchoolType = resolveExplicitSchoolTypeFromProfile(profile);
  const isSchoolAdmin = userRole === 'admin' && Boolean(explicitSchoolType);

  let tabs = filterTabsByRole(profile, userRole);
  tabs = applyRouteOverrides(tabs, userRole, resolvedSchoolType, explicitSchoolType, profile);

  if (hideFeesOnDashboards) {
    tabs = tabs.filter((item) => item.id !== 'principal-reports');
  }

  if (isSchoolAdmin) {
    tabs = tabs.filter((item) => item.id !== 'org-admin-settings');
    if (!tabs.some((item) => item.isCenterTab)) {
      tabs = [...tabs, SCHOOL_ADMIN_DASH_TAB as BottomTabItem];
    }
  }

  return {
    tabs,
    roleState: {
      userRole,
      resolvedSchoolType,
    },
  };
}

export function isBottomTabActive(pathname: string | null | undefined, route: string, tabId?: string): boolean {
  if (!pathname) return false;
  const normalizedRoute = route.split('?')[0];

  if (tabId === 'parent-dashboard') {
    return pathname === '/screens/parent-dashboard' ||
      pathname.startsWith('/screens/parent-dashboard') ||
      pathname === '/(k12)/parent/dashboard' ||
      pathname.startsWith('/(k12)/parent/dashboard');
  }

  if (tabId === 'parent-dash') {
    return pathname.includes('/screens/dash-assistant') ||
      pathname.includes('/screens/dash-voice') ||
      pathname.includes('/screens/dash-tutor');
  }

  return pathname === normalizedRoute || pathname.startsWith(normalizedRoute);
}

export function shouldHideBottomTabBar(pathname: string | null | undefined): boolean {
  return isHiddenBottomNavPath(pathname);
}

export function sortBottomTabs(tabs: BottomTabItem[]): BottomTabItem[] {
  const centerTab = tabs.find((tab) => tab.isCenterTab);
  if (!centerTab) return tabs;

  const regularTabs = tabs.filter((tab) => !tab.isCenterTab);
  const middleIndex = Math.floor(regularTabs.length / 2);
  const sortedTabs = [...regularTabs];
  sortedTabs.splice(middleIndex, 0, centerTab);
  return sortedTabs;
}

export function getBottomTabVariant(
  pathname: string | null | undefined,
  roleState: BottomTabRoleState,
  flags: { k12_parent_quickwins_v1?: boolean } | null | undefined,
): BottomTabVariantState {
  const isK12ParentRole = roleState.userRole === 'parent' && roleState.resolvedSchoolType === 'k12_school';
  const isK12ParentRoute = typeof pathname === 'string' && (
    pathname.startsWith('/(k12)/parent/') ||
    pathname.startsWith('/screens/parent-') ||
    pathname === '/screens/homework' ||
    pathname === '/screens/exam-prep' ||
    pathname === '/screens/dash-assistant' ||
    pathname === '/screens/dash-voice'
  );

  const isTeacherDashboardNav = roleState.userRole === 'teacher';
  const isK12ParentNextGenNav = Boolean(flags?.k12_parent_quickwins_v1) && isK12ParentRole && isK12ParentRoute;
  const isNextGenNav = isTeacherDashboardNav || isK12ParentNextGenNav;

  return {
    isTeacherDashboardNav,
    isK12ParentNextGenNav,
    isNextGenNav,
    navActiveColor: nextGenPalette.cyan3,
    activeIndicatorColor: nextGenPalette.gold2,
    navBackgroundColor: isNextGenNav ? 'rgba(7, 11, 22, 0.92)' : 'rgba(10, 14, 28, 0.94)',
    navBorderColor: 'rgba(118, 90, 247, 0.20)',
    navInactiveColor: isNextGenNav ? 'rgba(231, 238, 255, 0.74)' : 'rgba(214, 223, 255, 0.68)',
    centerOrbBackground: 'rgba(9, 12, 26, 0.98)',
    dockGlowColors: ['rgba(24, 212, 255, 0.18)', 'rgba(139, 92, 246, 0.14)', 'rgba(252, 211, 77, 0.08)'],
  };
}
