import { StyleSheet } from 'react-native';

export const missionControlStyles = StyleSheet.create({
  headerCard: {
    marginBottom: 12,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 22,
  },
  headerHint: {
    marginTop: 8,
  },
  headerCountPill: {
    minWidth: 44,
    height: 28,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  headerCountText: {
    fontSize: 12,
    fontWeight: '800',
  },
  featuredRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  featuredRowStacked: {
    flexDirection: 'column',
  },
  featuredItem: {
    marginBottom: 2,
  },
  groupCard: {
    marginBottom: 12,
  },
  groupCardWide: {
    height: '100%',
  },
  groupSections: {
    width: '100%',
  },
  groupSectionsWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  groupSectionShell: {
    width: '100%',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  groupTitleBlock: {
    flex: 1,
  },
  groupEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  groupDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  groupCountPill: {
    minWidth: 32,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  groupCountText: {
    fontSize: 11,
    fontWeight: '800',
  },
  groupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  groupItem: {
    marginBottom: 2,
  },
  featuredCard: {
    minHeight: 138,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  secondaryCard: {
    minHeight: 118,
  },
  compactCard: {
    minHeight: 112,
  },
  featuredIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    marginBottom: 12,
  },
  secondaryIcon: {
    marginBottom: 10,
  },
  featuredLabel: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'left',
    marginBottom: 6,
  },
  secondaryLabel: {
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
});

export const attentionBadgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
});
