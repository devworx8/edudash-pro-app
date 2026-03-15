export interface BottomTabItem {
  id: string;
  label: string;
  icon: string;
  activeIcon: string;
  route: string;
  roles?: string[];
  isCenterTab?: boolean;
}

export interface BottomTabRoleState {
  userRole: string;
  resolvedSchoolType: string | null;
}

export interface BottomTabVariantState {
  isTeacherDashboardNav: boolean;
  isK12ParentNextGenNav: boolean;
  isNextGenNav: boolean;
  navActiveColor: string;
  activeIndicatorColor: string;
  navBackgroundColor: string;
  navBorderColor: string;
  navInactiveColor: string;
  centerOrbBackground: string;
  dockGlowColors: [string, string, string];
  showBackgroundOverlay: boolean;
}
