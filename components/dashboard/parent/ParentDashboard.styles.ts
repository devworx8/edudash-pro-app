/**
 * ParentDashboard Styles — Extracted per WARP.md standards
 * 
 * Dynamic StyleSheet factory for the parent dashboard.
 * Accepts theme, insets, and layout metrics for responsive design.
 */

import { StyleSheet } from 'react-native';

export type LayoutMetrics = {
  isTablet: boolean;
  isSmallScreen: boolean;
  cardPadding: number;
  cardGap: number;
};

export const getLayoutMetrics = (width: number): LayoutMetrics => {
  const isTablet = width > 768;
  const isSmallScreen = width < 380;
  const cardPadding = isTablet ? 20 : isSmallScreen ? 10 : 14;
  const cardGap = isTablet ? 12 : isSmallScreen ? 6 : 8;
  return { isTablet, isSmallScreen, cardPadding, cardGap };
};

export const createParentDashboardStyles = (
  theme: any,
  topInset: number,
  bottomInset: number,
  layout: LayoutMetrics,
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: layout.isSmallScreen ? 8 : 12,
      paddingHorizontal: layout.cardPadding,
      // The bottom dock already consumes the safe-area inset internally.
      // Keep only a small content buffer so cards don't float above the nav.
      paddingBottom: Math.max(bottomInset, 8) + 6,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.background,
    },
    loadingText: {
      fontSize: 16,
      color: theme.textSecondary,
      marginTop: 16,
    },
    // ─── Header ──────────────────────────────────────────
    compactHeader: {
      marginBottom: 12,
    },
    greetingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 8,
    },
    greeting: {
      fontSize: layout.isTablet ? 24 : layout.isSmallScreen ? 18 : 20,
      fontWeight: '600',
      color: theme.text,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    roleBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    roleBadgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    tierBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    tierBadgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    searchSection: {
      marginBottom: 16,
    },
    // ─── Metrics & Actions ───────────────────────────────
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: 0,
      alignItems: 'flex-start',
      gap: layout.cardGap,
    },
    actionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -layout.cardGap / 2,
      alignItems: 'flex-start',
    },
    // ─── Upgrade Banner ──────────────────────────────────
    upgradeBanner: {
      backgroundColor: theme.cardBackground,
      borderRadius: layout.isSmallScreen ? 10 : 12,
      paddingVertical: layout.isSmallScreen ? 10 : 12,
      paddingHorizontal: layout.isSmallScreen ? 12 : 14,
      marginBottom: layout.cardGap,
      borderWidth: 1,
      borderColor: theme.primary + '20',
    },
    upgradeBannerContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    upgradeBannerIconContainer: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    upgradeBannerText: {
      flex: 1,
    },
    upgradeBannerTitle: {
      fontSize: layout.isSmallScreen ? 13 : 14,
      fontWeight: '600',
      color: theme.text,
    },
    upgradeBannerSubtitle: {
      fontSize: layout.isSmallScreen ? 11 : 12,
      color: theme.textSecondary,
      lineHeight: 16,
    },
    upgradeBannerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
      paddingVertical: layout.isSmallScreen ? 6 : 8,
      paddingHorizontal: layout.isSmallScreen ? 12 : 14,
      borderRadius: layout.isSmallScreen ? 6 : 8,
    },
    upgradeBannerButtonText: {
      fontSize: layout.isSmallScreen ? 12 : 13,
      fontWeight: '600',
      color: theme.onPrimary,
    },
    // ─── Today Highlights ────────────────────────────────
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionHeaderTitle: {
      fontSize: layout.isTablet ? 18 : 16,
      fontWeight: '700',
      color: theme.text,
    },
    sectionHeaderHint: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    todayHighlightsSection: {
      marginBottom: 20,
    },
    todayHighlightsRow: {
      paddingHorizontal: 2,
    },
    todayHighlightCard: {
      minWidth: layout.isSmallScreen ? 150 : 180,
      backgroundColor: theme.surface,
      borderRadius: 14,
      padding: 12,
      marginRight: 12,
      borderWidth: 1,
      borderColor: theme.borderLight,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 2,
    },
    todayHighlightIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    todayHighlightLabel: {
      fontSize: 10,
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    todayHighlightValue: {
      fontSize: layout.isTablet ? 18 : 16,
      fontWeight: '700',
      color: theme.text,
      marginTop: 4,
    },
    todayHighlightSub: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
    },
    // ─── Child Focus Card ────────────────────────────────
    childFocusCard: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.borderLight,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    childFocusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    childAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    childAvatarText: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.primary,
    },
    childInfo: {
      flex: 1,
    },
    childName: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 2,
    },
    childMeta: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 4,
    },
    childTeacher: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    childFocusActions: {
      flexDirection: 'row',
      gap: 10,
    },
    childActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    childActionPrimary: {
      backgroundColor: theme.primary,
    },
    childActionSecondary: {
      backgroundColor: theme.primary + '15',
      borderWidth: 1,
      borderColor: theme.primary + '30',
    },
    childActionTextPrimary: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    childActionTextSecondary: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    // ─── Mission Control (Action Sections) ───────────────
    actionSection: {
      marginBottom: 16,
    },
    actionSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    actionSectionIcon: {
      width: 22,
      height: 22,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceVariant,
      borderWidth: 1,
      borderColor: theme.borderLight,
    },
    actionSectionTitle: {
      fontSize: 12,
      color: theme.textSecondary,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
  });
