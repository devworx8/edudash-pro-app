import { StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const isTablet = SCREEN_W > 768;

export function createStyles(theme: any) {
  const bg0 = theme?.background ?? '#0F121E';
  const glass = 'rgba(255,255,255,0.06)';
  const glassBorder = 'rgba(255,255,255,0.10)';
  const glassMed = 'rgba(255,255,255,0.08)';

  return StyleSheet.create({
    /* ── Layout ─────────────────────────── */
    container: { flex: 1, backgroundColor: bg0 },
    bgLayer: { ...StyleSheet.absoluteFillObject },
    bgBlobA: { position: 'absolute', top: -100, right: -120, width: 320, height: 320, borderRadius: 999, backgroundColor: '#8b5cf622', transform: [{ rotate: '18deg' }] },
    bgBlobB: { position: 'absolute', bottom: -140, left: -140, width: 360, height: 360, borderRadius: 999, backgroundColor: '#22c55e14', transform: [{ rotate: '-10deg' }] },

    /* ── Header ─────────────────────────── */
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
    backButton: { padding: 6 },
    headerTitleWrap: { flex: 1, gap: 2 },
    headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 12, color: '#94a3b8', letterSpacing: 0.2 },
    refreshButton: { padding: 8, borderRadius: 20, backgroundColor: glassMed },

    /* ── Loading / Error / Denied ────────── */
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
    loadingText: { color: '#94a3b8', marginTop: 12, fontSize: 14 },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    errorText: { color: '#ef4444', fontSize: 16, fontWeight: '600', marginTop: 12 },
    errorSubText: { color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 6 },
    retryButton: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, backgroundColor: '#3b82f6' },
    retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    deniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    deniedText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },

    /* ── Section scaffolding ────────────── */
    scrollContent: { paddingBottom: 100 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#e2e8f0', letterSpacing: 0.3 },
    sectionBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.18)' },
    sectionBadgeText: { fontSize: 11, fontWeight: '700', color: '#ef4444' },

    /* ── KPI Row ────────────────────────── */
    kpiScroll: { paddingHorizontal: 12, paddingVertical: 4 },
    kpiCard: { width: isTablet ? 170 : 140, marginHorizontal: 4, borderRadius: 16, padding: 14, backgroundColor: glass, borderWidth: 1, borderColor: glassBorder, overflow: 'hidden' },
    kpiIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    kpiIconCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    kpiChange: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    kpiChangeText: { fontSize: 10, fontWeight: '700' },
    kpiValue: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
    kpiLabel: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
    kpiSparkline: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: 8, height: 20 },
    kpiSparkBar: { width: 4, borderRadius: 2, minHeight: 2 },

    /* ── Error Heatmap ──────────────────── */
    heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
    heatmapCell: { width: isTablet ? '31%' : '47%' as any, borderRadius: 12, padding: 12, backgroundColor: glass, borderWidth: 1, borderColor: glassBorder, flexDirection: 'row', alignItems: 'center', gap: 10 },
    heatmapIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    heatmapInfo: { flex: 1 },
    heatmapCategory: { fontSize: 12, fontWeight: '600', color: '#e2e8f0' },
    heatmapCount: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 2 },
    heatmapTrend: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
    heatmapTrendText: { fontSize: 10, fontWeight: '600' },

    /* ── Incidents ──────────────────────── */
    incidentCard: { marginHorizontal: 16, marginTop: 6, borderRadius: 12, backgroundColor: glass, borderWidth: 1, borderColor: glassBorder, padding: 14, gap: 6 },
    incidentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    incidentTitle: { fontSize: 14, fontWeight: '700', color: '#fff', flex: 1 },
    incidentSeverity: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    incidentSeverityText: { fontSize: 10, fontWeight: '700', color: '#fff', textTransform: 'uppercase' },
    incidentMeta: { flexDirection: 'row', gap: 14 },
    incidentMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    incidentMetaText: { fontSize: 11, color: '#94a3b8' },
    incidentStatus: { fontSize: 11, fontWeight: '600', color: '#f59e0b', textTransform: 'capitalize' },
    noIncidents: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
    noIncidentsText: { fontSize: 14, color: '#22c55e', fontWeight: '600' },

    /* ── Health grid ────────────────────── */
    healthGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
    healthCard: { width: isTablet ? '31%' : '30%' as any, borderRadius: 12, padding: 12, backgroundColor: glass, borderWidth: 1, borderColor: glassBorder, alignItems: 'center', gap: 6 },
    healthDot: { width: 8, height: 8, borderRadius: 4 },
    healthName: { fontSize: 11, fontWeight: '600', color: '#e2e8f0', textAlign: 'center' },
    healthStatus: { fontSize: 10, color: '#94a3b8', textTransform: 'capitalize' },

    /* ── Distribution pills ─────────────── */
    distRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10 },
    distCard: { flex: 1, borderRadius: 14, padding: 14, backgroundColor: glass, borderWidth: 1, borderColor: glassBorder },
    distTitle: { fontSize: 13, fontWeight: '700', color: '#e2e8f0', marginBottom: 10 },
    distItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
    distDot: { width: 10, height: 10, borderRadius: 5 },
    distLabel: { fontSize: 12, color: '#cbd5e1', flex: 1, textTransform: 'capitalize' },
    distValue: { fontSize: 12, fontWeight: '700', color: '#fff' },
    distBar: { height: 4, borderRadius: 2, marginTop: 2 },

    /* ── AI Usage ───────────────────────── */
    aiUsageRow: { paddingHorizontal: 16, gap: 8 },
    aiUsageCard: { borderRadius: 12, padding: 14, backgroundColor: glass, borderWidth: 1, borderColor: glassBorder, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    aiUsageLabel: { fontSize: 12, color: '#94a3b8', flex: 1 },
    aiUsageValue: { fontSize: 16, fontWeight: '800', color: '#fff' },
    aiProgressBar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', flex: 2 },
    aiProgressFill: { height: 4, borderRadius: 2 },

    /* ── Activity feed ──────────────────── */
    activityItem: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: glassBorder },
    activityIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    activityContent: { flex: 1, gap: 2 },
    activityAction: { fontSize: 13, fontWeight: '600', color: '#fff' },
    activityActor: { fontSize: 11, color: '#94a3b8' },
    activityDetail: { fontSize: 11, color: '#64748b' },
    activityTime: { fontSize: 10, color: '#64748b', alignSelf: 'flex-start', marginTop: 2 },

    /* ── Empty ──────────────────────────── */
    emptyContainer: { alignItems: 'center', paddingVertical: 40 },
    emptyText: { color: '#64748b', fontSize: 14, marginTop: 8 },
  });
}
