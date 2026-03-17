import { Stack, usePathname, router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { ThemeOverrideProvider, useTheme } from '../../contexts/ThemeContext';
import { nextGenK12Parent } from '../../contexts/theme/nextGenK12Parent';
import { resolveSchoolTypeFromProfile } from '../../lib/schoolTypeResolver';
import { resolveDashboard } from '../../hooks/auth/dashboardResolution';
import { normalizeRole } from '../../lib/roleUtils';
import ThemedStatusBar from '../../components/ui/ThemedStatusBar';

const NEXT_GEN_PARENT_SHARED_ROUTES = new Set([
  '/screens/homework',
  '/screens/homework-detail',
  '/screens/exam-prep',
  '/screens/exam-generation',
  '/screens/dash-assistant',
]);

// Role-prefix → allowed roles. Screens without a role prefix are accessible to all.
// Per-screen overrides checked BEFORE the prefix map.
// Use this for screens whose name starts with a role prefix but needs a different audience.
const PLATFORM_STAFF = ['system_admin', 'content_moderator', 'support_admin', 'billing_admin', 'super_admin'];

const SCREEN_ROLE_OVERRIDES: Record<string, Set<string>> = {
  'student-management': new Set(['principal', 'principal_admin', 'teacher', 'super_admin']),
  'student-detail': new Set(['principal', 'principal_admin', 'teacher', 'parent', 'super_admin']),
  'student-enrollment': new Set(['principal', 'principal_admin', 'super_admin']),
  // Platform admin sub-roles → per-screen access to shared super-admin screens
  'super-admin-platform-command-center': new Set(['system_admin', 'super_admin']),
  'super-admin-system-monitoring': new Set(['system_admin', 'super_admin']),
  'super-admin-devops': new Set(['system_admin', 'super_admin']),
  'super-admin-system-test': new Set(['system_admin', 'super_admin']),
  'super-admin-ai-command-center': new Set(['system_admin', 'super_admin']),
  'super-admin-moderation': new Set(['content_moderator', 'super_admin']),
  'super-admin-content-studio': new Set(['content_moderator', 'super_admin']),
  'super-admin-announcements': new Set(PLATFORM_STAFF),
  'super-admin-users': new Set(['content_moderator', 'support_admin', 'super_admin']),
  'super-admin-organizations': new Set(['content_moderator', 'support_admin', 'billing_admin', 'super_admin']),
  'super-admin-whatsapp': new Set(['content_moderator', 'support_admin', 'super_admin']),
  'super-admin-team-chat': new Set(PLATFORM_STAFF),
  'super-admin-team-activity': new Set(PLATFORM_STAFF),
  'super-admin-ai-quotas': new Set(['billing_admin', 'super_admin']),
  'super-admin-ai-usage': new Set(['billing_admin', 'super_admin']),
  'super-admin-admin-management': new Set(['support_admin', 'billing_admin', 'super_admin']),
};

const ROLE_PREFIX_MAP: Record<string, Set<string>> = {
  'parent-': new Set(['parent', 'super_admin']),
  'teacher-': new Set(['teacher', 'principal', 'principal_admin', 'super_admin']),
  'principal-': new Set(['principal', 'principal_admin', 'super_admin']),
  'student-': new Set(['student', 'learner', 'parent', 'super_admin']),
  'super-admin-': new Set(['super_admin']),
  'platform-admin-': new Set(PLATFORM_STAFF),
  'admin-': new Set(['principal', 'principal_admin', 'super_admin']),
  'org-admin': new Set(['principal', 'principal_admin', 'super_admin']),
};

/** Returns true if `role` is allowed to access `screenName`. */
function isRoleAllowedForScreen(screenName: string, role: string | null): boolean {
  if (!role) return false;
  const normalizedRole = normalizeRole(role) ?? role.toLowerCase();

  // Check exact screen overrides first
  const override = SCREEN_ROLE_OVERRIDES[screenName];
  if (override) return override.has(normalizedRole);

  for (const [prefix, allowedRoles] of Object.entries(ROLE_PREFIX_MAP)) {
    if (screenName.startsWith(prefix)) {
      return allowedRoles.has(normalizedRole);
    }
  }
  // No role-prefix → shared screen, any authenticated role OK
  return true;
}

function ScreensStack() {
  const { theme } = useTheme();

  return (
    <>
      <ThemedStatusBar />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          presentation: 'card',
          animationTypeForReplace: 'push',
          headerTitle: '',
          // Workaround: Android New Architecture + react-native-screens ScreenStack
          // can crash with IndexOutOfBoundsException during animated transitions.
          // Use simple fade to avoid the drawing-order race condition.
          ...(Platform.OS === 'android' ? { animation: 'fade', animationDuration: 200 } : {}),
        }}
      >
        {/* Let expo-router auto-register child routes; each screen renders its own RoleBasedHeader */}
      </Stack>
    </>
  );
}

export default function ScreensLayout() {
  const { user, profile, profileLoading } = useAuth();
  const pathname = usePathname();
  const guardRedirectedRef = useRef<string | null>(null);

  // ── Role guard: enforce screen-level access ────────────────────────
  useEffect(() => {
    if (!user || profileLoading || !profile || typeof pathname !== 'string') return;
    // Extract screen name from "/screens/teacher-dashboard" → "teacher-dashboard"
    const screenName = pathname.startsWith('/screens/')
      ? pathname.slice('/screens/'.length).split('?')[0]
      : '';
    if (!screenName) return;

    const userRole = String((profile as any)?.role || '').toLowerCase();
    if (isRoleAllowedForScreen(screenName, userRole)) {
      guardRedirectedRef.current = null;
      return;
    }
    // Prevent redirect loops — don't re-redirect for the same path
    if (guardRedirectedRef.current === pathname) return;
    guardRedirectedRef.current = pathname;

    const { targetDashboard } = resolveDashboard(user, profile);
    if (targetDashboard && targetDashboard !== pathname) {
      router.replace(targetDashboard as any);
    }
  }, [pathname, user, profile, profileLoading]);

  // ── Theme override for K-12 parent flows ───────────────────────────
  const isParentRole = String((profile as any)?.role || '').toLowerCase() === 'parent';
  const isK12Parent = isParentRole && resolveSchoolTypeFromProfile(profile) === 'k12_school';
  const isParentFlowRoute =
    typeof pathname === 'string' &&
    (pathname.startsWith('/screens/parent-') || NEXT_GEN_PARENT_SHARED_ROUTES.has(pathname));

  if (isK12Parent && isParentFlowRoute) {
    return (
      <ThemeOverrideProvider override={nextGenK12Parent}>
        <ScreensStack />
      </ThemeOverrideProvider>
    );
  }

  return <ScreensStack />;
}
