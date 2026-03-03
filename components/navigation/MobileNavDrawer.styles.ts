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
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.88)' : 'rgba(0, 0, 0, 0.7)',
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
      backgroundColor: theme.surface,
      opacity: 1,
      paddingTop: insets.top,
      shadowColor: '#000',
      shadowOffset: { width: 2, height: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 20,
    },
    drawerHeader: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
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
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
    },
    userText: {
      marginLeft: 12,
      flex: 1,
    },
    userName: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
    },
    userRole: {
      fontSize: 12,
      color: theme.textSecondary,
      textTransform: 'capitalize',
      marginTop: 2,
    },
    closeButton: {
      padding: 4,
    },
    navList: {
      flex: 1,
      paddingTop: 8,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginHorizontal: 8,
      borderRadius: 8,
    },
    navItemActive: {
      backgroundColor: theme.primary + '12',
    },
    navLabel: {
      marginLeft: 12,
      fontSize: 14,
      fontWeight: '500',
      color: theme.textSecondary,
      flex: 1,
    },
    navLabelActive: {
      color: theme.primary,
      fontWeight: '600',
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
      paddingVertical: 12,
    },
    footer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingBottom: Math.max(insets.bottom, 16),
      alignItems: 'center',
    },
    signOutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: theme.error + '15',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.error + '30',
      width: '100%',
    },
    signOutText: {
      marginLeft: 10,
      fontSize: 15,
      fontWeight: '600',
      color: theme.error,
    },
    brandText: {
      fontSize: 12,
      color: theme.textSecondary,
      textAlign: 'center',
      opacity: 0.8,
    },
    versionText: {
      fontSize: 10,
      color: theme.textSecondary,
      textAlign: 'center',
      marginTop: 4,
      opacity: 0.6,
    },
  });
