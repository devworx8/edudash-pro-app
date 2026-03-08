import { Stack, usePathname } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { ThemeOverrideProvider, useTheme } from '../../contexts/ThemeContext';
import { nextGenK12Parent } from '../../contexts/theme/nextGenK12Parent';
import { resolveSchoolTypeFromProfile } from '../../lib/schoolTypeResolver';
import ThemedStatusBar from '../../components/ui/ThemedStatusBar';

const NEXT_GEN_PARENT_SHARED_ROUTES = new Set([
  '/screens/homework',
  '/screens/homework-detail',
  '/screens/exam-prep',
  '/screens/exam-generation',
  '/screens/dash-assistant',
]);

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
  const { profile } = useAuth();
  const pathname = usePathname();

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
