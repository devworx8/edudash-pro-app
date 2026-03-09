/**
 * MobileNavDrawer Styles
 * Extracted for WARP.md compliance
 */
import { Platform, StyleSheet } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';

export const DRAWER_WIDTH = 280;

export const getNavDrawerStyles = (theme: any, isDark: boolean, insets: EdgeInsets, drawerWidth: number = DRAWER_WIDTH) =>
  StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      ...(Platform.OS === 'web'
        ? {
            position: 'fixed' as any,
          }
        : null),
      zIndex: 9999,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(2, 6, 23, 0.74)',
    },
    overlayPressable: {
      flex: 1,
    },
    drawer: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      width: drawerWidth,
      backgroundColor: '#081027',
      opacity: 1,
      paddingTop: insets.top,
      borderRightWidth: 1,
      borderRightColor: 'rgba(125, 211, 252, 0.14)',
      shadowColor: '#020617',
      shadowOffset: { width: 2, height: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 18,
      elevation: 20,
    },
    drawerHeader: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(125, 211, 252, 0.12)',
      backgroundColor: 'rgba(255,255,255,0.03)',
    },
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    userInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(92, 124, 255, 0.15)',
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.16)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    userText: {
      marginLeft: 12,
      flex: 1,
    },
    userName: {
      fontSize: 15,
      fontWeight: '700',
      color: '#f4f7ff',
    },
    userRole: {
      fontSize: 12,
      color: '#b5c5ee',
      textTransform: 'capitalize',
      marginTop: 2,
    },
    closeButton: {
      padding: 4,
    },
    navList: {
      flex: 1,
      paddingTop: 10,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginHorizontal: 10,
      marginBottom: 4,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    navItemActive: {
      backgroundColor: 'rgba(92, 124, 255, 0.18)',
      borderColor: 'rgba(125, 211, 252, 0.16)',
    },
    navLabel: {
      marginLeft: 12,
      fontSize: 14,
      fontWeight: '500',
      color: '#c1cef2',
      flex: 1,
    },
    navLabelActive: {
      color: '#f4f7ff',
      fontWeight: '700',
    },
    badge: {
      backgroundColor: theme.error,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
    },
    signOutSection: {
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    footer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: 'rgba(125, 211, 252, 0.12)',
      paddingBottom: Math.max(insets.bottom, 16),
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.03)',
    },
    signOutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: 'rgba(239, 68, 68, 0.08)',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(248, 113, 113, 0.24)',
      width: '100%',
    },
    signOutText: {
      marginLeft: 10,
      fontSize: 15,
      fontWeight: '700',
      color: '#ff8a8a',
    },
    brandText: {
      fontSize: 12,
      color: '#a3b5df',
      textAlign: 'center',
      opacity: 0.8,
    },
    versionText: {
      fontSize: 10,
      color: '#7f90b8',
      textAlign: 'center',
      marginTop: 4,
      opacity: 0.6,
    },
  });
