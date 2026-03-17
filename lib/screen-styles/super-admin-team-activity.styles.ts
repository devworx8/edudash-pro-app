import { StyleSheet } from 'react-native';

export function createStyles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background || '#0f172a',
    },
    header: {
      backgroundColor: theme.headerBackground || '#1e293b',
      paddingBottom: 12,
    },
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 12,
    },
    backButton: { padding: 8 },
    headerTitleContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: '#ffffff',
    },
    content: { flex: 1 },
    // Stats
    statsBar: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 10,
    },
    statCard: {
      flex: 1,
      borderRadius: 12,
      padding: 12,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 22,
      fontWeight: '700',
      color: '#ffffff',
    },
    statLabel: {
      fontSize: 10,
      color: '#94a3b8',
      marginTop: 2,
      textAlign: 'center',
    },
    // Filter bar
    filterBar: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border || '#1e293b',
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      gap: 4,
    },
    filterChipActive: {
      backgroundColor: '#3b82f620',
    },
    filterText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#64748b',
    },
    filterTextActive: {
      color: '#3b82f6',
    },
    // Activity item
    activityItem: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border || '#1e293b',
    },
    activityIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    activityContent: {
      flex: 1,
    },
    activityAction: {
      fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
    },
    activityActor: {
      fontSize: 12,
      color: '#94a3b8',
      marginTop: 2,
    },
    activityDetail: {
      fontSize: 12,
      color: '#64748b',
      marginTop: 2,
    },
    activityTime: {
      fontSize: 11,
      color: '#64748b',
      alignSelf: 'flex-start',
      marginTop: 2,
    },
    // Loading / empty
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 80,
    },
    loadingText: {
      color: '#94a3b8',
      marginTop: 12,
      fontSize: 14,
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyText: {
      color: '#94a3b8',
      fontSize: 16,
      fontWeight: '600',
      marginTop: 16,
    },
    emptySubText: {
      color: '#64748b',
      fontSize: 14,
      textAlign: 'center',
      marginTop: 8,
      paddingHorizontal: 32,
    },
    deniedContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    deniedText: {
      color: '#ef4444',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
