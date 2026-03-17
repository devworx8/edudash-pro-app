import React from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useFinancePrivacyMode } from '@/hooks/useFinancePrivacyMode';
import { useNotifications } from '@/hooks/useNotifications';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { uiTokens } from '@/lib/ui/tokens';
import { BottomTabButton } from './bottom-tabs/BottomTabButton';
import { CenterTabButton } from './bottom-tabs/CenterTabButton';
import { buildVisibleTabs, getBottomTabVariant, isBottomTabActive, shouldHideBottomTabBar, sortBottomTabs } from './bottom-tabs/helpers';
import { createBottomTabBarStyles } from './bottom-tabs/styles';
import { DASH_SEARCH_ROUTE, MESSAGE_TAB_IDS, ROLES_WITH_CENTER_TAB } from './bottom-tabs/tabs';

const WEB_DESKTOP_BREAKPOINT = 1024;

export { ROLES_WITH_CENTER_TAB };

export function BottomTabBar() {
  const { profile, user } = useAuth();
  const { messages: unreadMessages } = useNotifications();
  const { hideFeesOnDashboards } = useFinancePrivacyMode();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const flags = getFeatureFlagsSync();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isSmallScreen = screenWidth < 360;
  const isShortScreen = screenHeight < 700;
  const isCompact = isSmallScreen || isShortScreen;
  const isWeb = Platform.OS === 'web';
  const isCoarsePointer =
    isWeb && typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches;
  const hasTouchPoints =
    isWeb && typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
  const isTouchDevice = isCoarsePointer || hasTouchPoints;
  const isWebDesktop = isWeb && screenWidth >= WEB_DESKTOP_BREAKPOINT && !isTouchDevice;

  if (!user || !profile || shouldHideBottomTabBar(pathname) || isWebDesktop) {
    return null;
  }

  const { tabs: visibleTabs, roleState } = buildVisibleTabs(profile, hideFeesOnDashboards);
  if (visibleTabs.length === 0) {
    return null;
  }

  const sortedTabs = sortBottomTabs(visibleTabs);
  const variant = getBottomTabVariant(pathname, roleState, flags);
  const navBottomPadding = Math.max(insets.bottom, uiTokens.spacing.xs);
  const styles = createBottomTabBarStyles({
    hasCenterTab: visibleTabs.some((tab) => tab.isCenterTab),
    isCompact,
    navBottomPadding,
    navBackgroundColor: variant.navBackgroundColor,
    navBorderColor: variant.navBorderColor,
    navInactiveColor: variant.navInactiveColor,
    navActiveColor: variant.navActiveColor,
    activeIndicatorColor: variant.activeIndicatorColor,
    centerOrbBackground: variant.centerOrbBackground,
    isK12ParentNextGenNav: variant.isK12ParentNextGenNav,
  });

  return (
    <View
      style={[
        styles.shell,
        Platform.OS === 'web' && {
          position: 'fixed' as any,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1200,
        },
      ]}
    >
      <View style={styles.dock}>
        {variant.showBackgroundOverlay && Platform.OS === 'ios' ? <BlurView intensity={32} tint="dark" style={styles.blurBackground} /> : null}
        {variant.showBackgroundOverlay ? <LinearGradient colors={variant.dockGlowColors} style={styles.dockGlow} /> : null}
        {sortedTabs.map((tab) => {
          const active = isBottomTabActive(pathname, tab.route, tab.id);
          const label = t(`navigation.${tab.label.toLowerCase()}`, { defaultValue: tab.label });

          if (tab.isCenterTab) {
            return (
              <CenterTabButton
                key={tab.id}
                label={label}
                route={tab.route}
                active={active}
                orbSize={isCompact ? 38 : 42}
                styles={styles}
                onPress={(route) => router.push(route as any)}
                onLongPress={() => router.push(DASH_SEARCH_ROUTE as any)}
              />
            );
          }

          const badgeCount = MESSAGE_TAB_IDS.has(tab.id) ? unreadMessages : 0;

          return (
            <BottomTabButton
              key={tab.id}
              label={label}
              icon={tab.icon}
              activeIcon={tab.activeIcon}
              route={tab.route}
              active={active}
              badgeCount={badgeCount}
              iconSize={isCompact ? 20 : 22}
              navActiveColor={variant.navActiveColor}
              navInactiveColor={variant.navInactiveColor}
              styles={styles}
              onPress={(route) => router.push(route as any)}
            />
          );
        })}
      </View>
    </View>
  );
}
