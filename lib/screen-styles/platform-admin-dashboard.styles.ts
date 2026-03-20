import { StyleSheet } from 'react-native';

export function createStyles(theme: any, screenWidth = 375) {
  const isTablet = screenWidth > 768;
  const isDesktop = screenWidth > 1100;
  const glass = 'rgba(255,255,255,0.06)';
  const glassBorder = 'rgba(255,255,255,0.10)';
  const hPad = isDesktop ? 28 : isTablet ? 20 : 16;

  return StyleSheet.create({
    /* ── Layout ─────────────────────────── */
    container: { flex: 1, backgroundColor: theme?.background ?? '#0F121E' },
    bgLayer: { ...StyleSheet.absoluteFillObject },
    bgBlobA: { position: 'absolute', top: -100, right: -120, width: 320, height: 320, borderRadius: 999, transform: [{ rotate: '18deg' }] },
    bgBlobB: { position: 'absolute', bottom: -140, left: -140, width: 360, height: 360, borderRadius: 999, transform: [{ rotate: '-10deg' }] },

    /* ── Loading / Denied ───────────────── */
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { color: '#94a3b8', marginTop: 12, fontSize: 14 },
    loadingSection: { paddingVertical: 60, alignItems: 'center' },
    deniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
    deniedTitle: { color: '#ef4444', fontSize: 18, fontWeight: '700', marginTop: 12 },
    deniedSubtext: { color: '#94a3b8', fontSize: 14 },
    deniedRole: { color: '#64748b', fontSize: 12, marginTop: 4 },
    backButton: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, backgroundColor: '#3b82f6' },
    backButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    /* ── Header ─────────────────────────── */
    headerSafe: { zIndex: 10 },
    header: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: hPad, paddingVertical: 12, gap: 10,
      ...(isDesktop && { maxWidth: 1400, alignSelf: 'center' as const, width: '100%' as any }),
    },
    headerBack: { padding: 6 },
    roleBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
    },
    roleBadgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
    headerInfo: { flex: 1, gap: 1 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
    headerSubtitle: { fontSize: 11, color: '#94a3b8' },
    onlineDot: { width: 8, height: 8, borderRadius: 4 },
    signOutBtn: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: 'rgba(239,68,68,0.12)',
      cursor: 'pointer' as any,
    },

    /* ── Scroll ─────────────────────────── */
    scroll: { flex: 1 },
    scrollContent: {
      paddingBottom: 100,
      ...(isDesktop && { maxWidth: 1400, alignSelf: 'center' as const, width: '100%' as any }),
    },

    /* ── Section Header ─────────────────── */
    sectionHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: hPad, paddingTop: 20, paddingBottom: 10,
    },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#e2e8f0', letterSpacing: 0.3 },
    sectionCount: {
      fontSize: 12, fontWeight: '600', color: '#64748b',
      backgroundColor: glass, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
    },

    /* ── Stats Grid ─────────────────────── */
    statsGrid: {
      flexDirection: 'row', flexWrap: 'wrap',
      paddingHorizontal: hPad - 4, gap: isTablet ? 10 : 8,
    },
    statCard: {
      width: isDesktop
        ? Math.floor((Math.min(screenWidth, 1400) - hPad * 2 - 30) / 4)
        : isTablet
          ? Math.floor((screenWidth - hPad * 2 - 24) / 4)
          : Math.floor((screenWidth - hPad * 2 - 8) / 2),
      borderRadius: 16, padding: isTablet ? 16 : 14,
      backgroundColor: glass, borderWidth: 1, borderColor: glassBorder,
    },
    statIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    statIconCircle: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    statChange: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    statChangeText: { fontSize: 10, fontWeight: '700' },
    statValue: { fontSize: isTablet ? 24 : 20, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
    statLabel: { fontSize: 11, color: '#94a3b8', marginTop: 2 },

    /* ── Actions Grid ───────────────────── */
    actionsGrid: {
      flexDirection: 'row', flexWrap: 'wrap',
      paddingHorizontal: hPad - 4, gap: isTablet ? 10 : 8,
    },
    actionCard: {
      width: isDesktop
        ? Math.floor((Math.min(screenWidth, 1400) - hPad * 2 - 20) / 3)
        : isTablet
          ? Math.floor((screenWidth - hPad * 2 - 12) / 2)
          : screenWidth - hPad * 2,
      borderRadius: 14, padding: isTablet ? 16 : 14,
      backgroundColor: glass, borderWidth: 1, borderColor: glassBorder,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    actionContent: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    actionIconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    actionText: { flex: 1 },
    actionTitle: { fontSize: 14, fontWeight: '700', color: '#e2e8f0' },
    actionDesc: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
    actionBadge: { minWidth: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
    actionBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

    /* ── Activity List ──────────────────── */
    activityList: { paddingHorizontal: hPad, gap: 0 },
    activityRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: glassBorder,
    },
    activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8b5cf6' },
    activityInfo: { flex: 1 },
    activityAction: { fontSize: 13, fontWeight: '600', color: '#e2e8f0', textTransform: 'capitalize' },
    activityMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  });
}
