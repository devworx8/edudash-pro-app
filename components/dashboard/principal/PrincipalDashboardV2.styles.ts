import { Platform, StyleSheet } from 'react-native';

/**
 * Main layout styles for PrincipalDashboardV2 (header, scroll, section blocks).
 */

const isDarkHex = (hex: string): boolean => {
  const match = String(hex || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return false;
  const value = match[1];
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.55;
};

export const createStyles = (theme: any, insetTop: number, insetBottom: number) => {
  const isDark = isDarkHex(theme?.background);
  const glassSurface = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.72)';
  const glassSurfaceStrong = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.82)';
  const glassBorder = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.88)';
  const bottomNavClearance = Platform.OS === 'web' ? 88 : 76;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      position: 'relative',
    },
    backgroundGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    backgroundOrbOne: {
      position: 'absolute',
      top: insetTop + 30,
      right: -40,
      width: 180,
      height: 180,
      borderRadius: 999,
      backgroundColor: theme.primary + '1c',
    },
    backgroundOrbTwo: {
      position: 'absolute',
      top: insetTop + 220,
      left: -70,
      width: 210,
      height: 210,
      borderRadius: 999,
      backgroundColor: theme.info + '16',
    },
    scrollContent: {
      paddingTop: insetTop + 12,
      // Keep enough trailing space so the last section can scroll above the fixed bottom nav.
      paddingBottom: Math.max(insetBottom + bottomNavClearance, bottomNavClearance),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 6,
    },
    headerLeft: { flex: 1 },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    greeting: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.text,
      textShadowColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.65)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    headerMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
    },
    schoolName: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.textSecondary,
    },
    manageButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: glassSurfaceStrong,
      borderWidth: 1,
      borderColor: glassBorder,
    },
    manageButtonText: {
      fontSize: 11,
      fontWeight: '800',
      color: theme.primary,
    },
    updatedAt: { fontSize: 11, color: theme.textTertiary, marginTop: 4 },
    layoutControlsWrap: {
      marginTop: 8,
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 12,
      borderRadius: 16,
      backgroundColor: glassSurface,
      borderWidth: 1,
      borderColor: glassBorder,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 4,
    },
    layoutControlsTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
      marginBottom: 8,
    },
    layoutControlsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    layoutControlButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.primary + '66',
      backgroundColor: theme.primary + '16',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    layoutControlButtonDisabled: {
      opacity: 0.5,
    },
    layoutControlButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.primary,
    },
    sectionBlock: {
      paddingHorizontal: 16,
      marginTop: 4,
    },
    sectionBody: {
      paddingTop: 12,
      gap: 12,
    },
    loadingText: { textAlign: 'center', color: theme.textSecondary, marginTop: 8 },
  });
};

/**
 * Shared styles used by section components (DailyOps, AdmissionsCashflow, LearnersSection).
 * Call once per render with the current theme.
 */
export const createSectionStyles = (theme: any) => {
  const isDark = isDarkHex(theme?.background);
  const cardGlass = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.72)';
  const cardGlassStrong = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.82)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.92)';

  return StyleSheet.create({
    sectionBody: {
      paddingTop: 12,
      gap: 12,
    },
    sectionDescriptor: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.textSecondary,
      paddingHorizontal: 2,
    },
    card: {
      padding: 14,
      borderRadius: 16,
      backgroundColor: cardGlass,
      borderWidth: 1,
      borderColor: cardBorder,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 4,
    },
    inlineSectionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.text,
      marginBottom: 10,
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    linkText: {
      color: theme.primary,
      fontWeight: '700',
      fontSize: 12,
    },
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    progressRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
      marginBottom: 4,
    },
    progressLabel: { fontSize: 12, color: theme.textSecondary },
    progressValue: { fontSize: 12, color: theme.textSecondary },
    uniformNote: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 10,
      lineHeight: 18,
    },
    uniformBreakdownRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    uniformStatusPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      backgroundColor: cardGlassStrong,
    },
    uniformPaidPill: {
      backgroundColor: theme.success + '1c',
      borderColor: theme.success + '44',
    },
    uniformPendingPill: {
      backgroundColor: theme.warning + '1c',
      borderColor: theme.warning + '44',
    },
    uniformUnpaidPill: {
      backgroundColor: theme.error + '1c',
      borderColor: theme.error + '44',
    },
    uniformStatusPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.text,
    },
    uniformActionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    uniformActionButton: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.primary + '55',
      backgroundColor: theme.primary + '12',
      opacity: 1,
    },
    uniformActionPrimary: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    uniformActionText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.primary,
    },
    uniformActionPrimaryText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#fff',
    },
    loadingText: { textAlign: 'center', color: theme.textSecondary, marginTop: 8 },
    emptyText: { textAlign: 'center', color: theme.textSecondary, marginVertical: 8 },
  });
};
