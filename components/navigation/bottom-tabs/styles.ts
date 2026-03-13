import { Platform, StyleSheet } from 'react-native';
import { nextGenRadii } from '@/contexts/theme/nextGenTokens';
import { uiTokens } from '@/lib/ui/tokens';

export interface BottomTabBarStyleOptions {
  hasCenterTab: boolean;
  isCompact: boolean;
  navBottomPadding: number;
  navBackgroundColor: string;
  navBorderColor: string;
  navInactiveColor: string;
  navActiveColor: string;
  activeIndicatorColor: string;
  centerOrbBackground: string;
  isK12ParentNextGenNav: boolean;
}

export function createBottomTabBarStyles(options: BottomTabBarStyleOptions) {
  const containerPaddingTop = options.isK12ParentNextGenNav ? (options.isCompact ? 2 : 4) : (options.isCompact ? 6 : 8);
  const tabMinHeight = options.isK12ParentNextGenNav ? (options.isCompact ? 44 : 48) : (options.isCompact ? 48 : 54);
  const centerOrbMarginTop = options.isK12ParentNextGenNav ? (options.isCompact ? -3 : -5) : (options.isCompact ? -22 : -28);

  return StyleSheet.create({
    shell: {
      paddingHorizontal: 10,
      paddingTop: 4,
      paddingBottom: Platform.OS === 'web' ? 0 : 8,
      backgroundColor: 'transparent',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -10 },
      shadowOpacity: 0.18,
      shadowRadius: 24,
      elevation: 16,
    },
    dock: {
      overflow: options.hasCenterTab ? 'visible' : 'hidden',
      flexDirection: 'row',
      alignItems: 'stretch',
      minHeight: tabMinHeight + options.navBottomPadding + containerPaddingTop,
      paddingTop: containerPaddingTop,
      paddingBottom: Math.max(options.navBottomPadding, uiTokens.spacing.xs),
      paddingHorizontal: options.isCompact ? 4 : 6,
      borderRadius: nextGenRadii.xxl,
      borderWidth: 1,
      borderColor: options.navBorderColor,
      backgroundColor: options.navBackgroundColor,
    },
    blurBackground: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: nextGenRadii.xxl,
      overflow: 'hidden',
    },
    dockGlow: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: nextGenRadii.xxl,
      opacity: 0.9,
    },
    activeIndicator: {
      position: 'absolute',
      top: 6,
      width: 32,
      height: 3,
      borderRadius: 999,
      alignSelf: 'center',
      backgroundColor: options.activeIndicatorColor,
    },
    tab: {
      flex: 1,
      minHeight: tabMinHeight,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: options.isCompact ? 3 : 4,
    },
    iconContainer: {
      marginBottom: options.isCompact ? 2 : 3,
    },
    label: {
      marginTop: 1,
      fontSize: options.isCompact ? 9 : 10,
      fontWeight: '600',
      color: options.navInactiveColor,
    },
    labelActive: {
      color: options.navActiveColor,
    },
    centerTab: {
      flex: 1,
      minHeight: tabMinHeight,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 0,
    },
    centerOrbWrapper: {
      width: options.isCompact ? 52 : 58,
      height: options.isCompact ? 52 : 58,
      borderRadius: options.isCompact ? 26 : 29,
      marginTop: centerOrbMarginTop,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: options.centerOrbBackground,
      borderWidth: 2,
      borderColor: options.navBorderColor,
      shadowColor: '#050816',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.34,
      shadowRadius: 12,
      elevation: 10,
    },
    centerOrbWrapperActive: {
      borderColor: options.navActiveColor,
      shadowOpacity: 0.46,
    },
    centerLabel: {
      marginTop: options.isCompact ? 2 : 4,
      marginBottom: -10,
      fontSize: options.isCompact ? 9 : 10,
      fontWeight: '700',
      color: options.navInactiveColor,
    },
    centerLabelActive: {
      color: options.navActiveColor,
    },
    badgeWrapper: {
      position: 'relative',
    },
    badge: {
      position: 'absolute',
      top: -3,
      right: -5,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 3,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ef4444',
      borderWidth: 1.5,
      borderColor: options.navBackgroundColor,
    },
    badgeText: {
      fontSize: 9,
      lineHeight: 11,
      fontWeight: '700',
      color: '#fff',
    },
  });
}

export type BottomTabBarStyles = ReturnType<typeof createBottomTabBarStyles>;
