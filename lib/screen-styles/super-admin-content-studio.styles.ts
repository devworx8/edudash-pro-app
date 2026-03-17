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
    // Tabs
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border || '#1e293b',
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      gap: 6,
      backgroundColor: 'transparent',
    },
    tabActive: {
      backgroundColor: '#3b82f620',
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#64748b',
    },
    tabTextActive: {
      color: '#3b82f6',
    },
    // Stats bar
    statsBar: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
    },
    statCard: {
      flex: 1,
      borderRadius: 12,
      padding: 12,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 20,
      fontWeight: '700',
      color: '#ffffff',
    },
    statLabel: {
      fontSize: 10,
      color: '#94a3b8',
      marginTop: 2,
      textAlign: 'center',
    },
    // Section
    section: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#ffffff',
      marginBottom: 12,
    },
    // Announcement card
    announcementCard: {
      backgroundColor: theme.card || '#1e293b',
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    announcementHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    announcementTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: '#ffffff',
      flex: 1,
    },
    announcementType: {
      fontSize: 11,
      fontWeight: '600',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      overflow: 'hidden',
    },
    announcementContent: {
      fontSize: 13,
      color: '#94a3b8',
      marginTop: 6,
      lineHeight: 18,
    },
    announcementMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
    },
    announcementMetaText: {
      fontSize: 11,
      color: '#64748b',
    },
    // Social post card
    socialCard: {
      backgroundColor: theme.card || '#1e293b',
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    socialHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    socialPlatform: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    socialPlatformText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#ffffff',
    },
    socialStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    socialStatusText: {
      fontSize: 11,
      fontWeight: '600',
    },
    socialContent: {
      fontSize: 14,
      color: '#e2e8f0',
      lineHeight: 20,
    },
    socialActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    socialAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    socialActionText: {
      fontSize: 12,
      fontWeight: '600',
    },
    // Templates placeholder
    templateCard: {
      backgroundColor: theme.card || '#1e293b',
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    templateName: {
      fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
    },
    templateDesc: {
      fontSize: 12,
      color: '#94a3b8',
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
      paddingVertical: 40,
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
    // Generate button
    generateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#6366f120',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
    },
    generateText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#6366f1',
    },
    // Create button
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#3b82f6',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      alignSelf: 'center',
      marginTop: 16,
    },
    createButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
    },
  });
}
