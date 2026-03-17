import { StyleSheet } from 'react-native';

export function createStyles(theme: any, screenWidth = 375) {
  const isTablet = screenWidth > 768;
  const isDesktop = screenWidth > 1100;
  const bg0 = theme?.background ?? '#0F121E';
  const glass = 'rgba(255,255,255,0.06)';
  const glassBorder = 'rgba(255,255,255,0.10)';
  const glassMed = 'rgba(255,255,255,0.08)';
  const hPad = isDesktop ? 28 : isTablet ? 20 : 16;

  return StyleSheet.create({
    /* ── Layout ── */
    container: { flex: 1, backgroundColor: bg0 },
    bgLayer: { ...StyleSheet.absoluteFillObject },
    bgBlobA: { position: 'absolute', top: -80, right: -100, width: 280, height: 280, borderRadius: 999, backgroundColor: '#14b8a622', transform: [{ rotate: '15deg' }] },
    bgBlobB: { position: 'absolute', bottom: -120, left: -120, width: 340, height: 340, borderRadius: 999, backgroundColor: '#3b82f614', transform: [{ rotate: '-8deg' }] },

    /* ── Header ── */
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: hPad, paddingVertical: 14, gap: 12, ...(isDesktop && { maxWidth: 1400, alignSelf: 'center' as const, width: '100%' as any }) },
    backButton: { padding: 6 },
    headerTitleWrap: { flex: 1, gap: 2 },
    headerTitle: { fontSize: isTablet ? 24 : 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 12, color: '#94a3b8', letterSpacing: 0.2 },
    refreshButton: { padding: 8, borderRadius: 20, backgroundColor: glassMed },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e', marginRight: 6 },

    /* ── Loading / Error / Denied ── */
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
    loadingText: { color: '#94a3b8', marginTop: 12, fontSize: 14 },
    deniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    deniedText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },

    /* ── Section scaffolding ── */
    scrollContent: { paddingBottom: 100, ...(isDesktop && { maxWidth: 1400, alignSelf: 'center' as const, width: '100%' as any }) },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: hPad, paddingTop: 20, paddingBottom: 8 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#e2e8f0', letterSpacing: 0.3 },
    sectionBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(139,92,246,0.18)' },
    sectionBadgeText: { fontSize: 11, fontWeight: '700', color: '#8b5cf6' },

    /* ── Stat Cards Row ── */
    statsRow: { flexDirection: 'row', paddingHorizontal: hPad, gap: isTablet ? 12 : 8, marginTop: 4 },
    statCard: { flex: 1, borderRadius: 16, padding: isTablet ? 16 : 14, backgroundColor: glass, borderWidth: 1, borderColor: glassBorder },
    statIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    statIconCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    statValue: { fontSize: isTablet ? 26 : 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
    statLabel: { fontSize: isTablet ? 12 : 11, color: '#94a3b8', marginTop: 2 },
    statTrend: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    statTrendText: { fontSize: 10, fontWeight: '700' },

    /* ── Activity Pulse (hourly mini-chart) ── */
    pulseRow: { paddingHorizontal: hPad, marginTop: 4 },
    pulseCard: { borderRadius: 16, padding: isTablet ? 18 : 14, backgroundColor: glass, borderWidth: 1, borderColor: glassBorder },
    pulseTitle: { fontSize: 13, fontWeight: '700', color: '#e2e8f0', marginBottom: 10 },
    pulseBarRow: { flexDirection: 'row', alignItems: 'flex-end', gap: isTablet ? 3 : 2, height: 36 },
    pulseBar: { flex: 1, borderRadius: 2, minHeight: 2 },
    pulseLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    pulseLabel: { fontSize: 9, color: '#64748b' },

    /* ── Top Actor / Category Breakdown ── */
    insightsRow: { flexDirection: isTablet ? 'row' : 'column', paddingHorizontal: hPad, gap: isTablet ? 12 : 8, marginTop: 4 } as any,
    insightCard: { flex: isTablet ? 1 : undefined, borderRadius: 14, padding: isTablet ? 18 : 14, backgroundColor: glass, borderWidth: 1, borderColor: glassBorder } as any,
    insightTitle: { fontSize: 13, fontWeight: '700', color: '#e2e8f0', marginBottom: 10 },
    topActorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    topActorAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    topActorName: { fontSize: 14, fontWeight: '700', color: '#fff' },
    topActorCount: { fontSize: 12, color: '#94a3b8' },
    categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    categoryDot: { width: 8, height: 8, borderRadius: 4 },
    categoryLabel: { fontSize: 12, color: '#cbd5e1', flex: 1 },
    categoryValue: { fontSize: 12, fontWeight: '700', color: '#fff' },
    categoryBarBg: { flex: 2, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)' },
    categoryBarFill: { height: 4, borderRadius: 2 },

    /* ── Filter Chips ── */
    filterScroll: { paddingHorizontal: hPad, paddingVertical: 8, gap: 8, flexDirection: 'row' },
    filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6, backgroundColor: glass, borderWidth: 1, borderColor: glassBorder },
    filterChipActive: { borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.15)' },
    filterIcon: {},
    filterText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
    filterTextActive: { color: '#c4b5fd' },
    filterBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)' },
    filterBadgeActive: { backgroundColor: 'rgba(139,92,246,0.3)' },
    filterBadgeText: { fontSize: 9, fontWeight: '700', color: '#94a3b8' },
    filterBadgeTextActive: { color: '#c4b5fd' },

    /* ── Timeline Date Header ── */
    dateHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: hPad, paddingTop: 16, paddingBottom: 6, gap: 8 },
    dateHeaderDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#8b5cf6', borderWidth: 2, borderColor: '#0F121E' },
    dateHeaderText: { fontSize: 13, fontWeight: '700', color: '#8b5cf6', letterSpacing: 0.3 },
    dateHeaderCount: { fontSize: 11, color: '#64748b' },
    dateHeaderLine: { flex: 1, height: 1, backgroundColor: 'rgba(139,92,246,0.2)' },

    /* ── Activity Item (timeline style) ── */
    activityRow: { flexDirection: 'row', paddingLeft: hPad, paddingRight: hPad, gap: 12, minHeight: 56 },
    timelineTrack: { width: 24, alignItems: 'center' },
    timelineLine: { flex: 1, width: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
    timelineNode: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
    activityCard: { flex: 1, borderRadius: 12, padding: isTablet ? 14 : 12, backgroundColor: glass, borderWidth: 1, borderColor: glassBorder, marginBottom: 6, gap: 4 },
    activityCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    activityIcon: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    activityLabel: { fontSize: 13, fontWeight: '700', color: '#fff', flex: 1 },
    activityTime: { fontSize: 10, color: '#64748b' },
    activityMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    activityActor: { fontSize: 11, color: '#94a3b8' },
    activityRoleBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' },
    activityRoleText: { fontSize: 9, fontWeight: '600', color: '#64748b', textTransform: 'capitalize' as const },
    activityDetail: { fontSize: 11, color: '#64748b', marginTop: 2 },

    /* ── Empty State ── */
    emptyContainer: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
    emptyIconWrap: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(139,92,246,0.1)', marginBottom: 16 },
    emptyText: { color: '#e2e8f0', fontSize: 18, fontWeight: '700', textAlign: 'center' },
    emptySubText: { color: '#64748b', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  });
}
