import { StyleSheet } from 'react-native';

// --- Types ---
export interface Integration {
  id: string;
  name: string;
  type: 'github' | 'eas' | 'vercel' | 'claude' | 'supabase' | 'posthog' | 'mcp';
  icon: string;
  color: string;
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: string;
  url?: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  branch: string;
}

export interface EASBuild {
  id: string;
  platform: 'android' | 'ios';
  status: 'success' | 'failed' | 'in-progress' | 'queued';
  version: string;
  createdAt: string;
}

// --- Styles ---
export function createStyles(_theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#0b1220',
    },
    header: {
      backgroundColor: '#111827',
      borderBottomWidth: 1,
      borderBottomColor: '#1f2937',
    },
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backButton: {
      padding: 4,
    },
    refreshButton: {
      padding: 4,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: '#ffffff',
    },
    tabsContainer: {
      flexDirection: 'row',
      backgroundColor: '#111827',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 8,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: '#1f2937',
      alignItems: 'center',
    },
    tabActive: {
      backgroundColor: '#00f5ff20',
      borderWidth: 1,
      borderColor: '#00f5ff',
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#9ca3af',
    },
    tabTextActive: {
      color: '#00f5ff',
    },
    content: {
      flex: 1,
      padding: 16,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    loadingText: {
      color: '#9ca3af',
      marginTop: 12,
      fontSize: 14,
    },
    deniedContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#0b1220',
    },
    deniedText: {
      color: '#ef4444',
      fontSize: 16,
      fontWeight: '600',
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#ffffff',
      marginBottom: 12,
    },
    integrationsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    integrationCard: {
      width: '47%',
      backgroundColor: '#1f2937',
      borderRadius: 12,
      padding: 16,
      borderLeftWidth: 3,
    },
    integrationIcon: {
      width: 44,
      height: 44,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    integrationName: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 8,
    },
    integrationStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusText: {
      color: '#9ca3af',
      fontSize: 12,
    },
    actionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    actionCard: {
      width: '47%',
      backgroundColor: '#1f2937',
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      gap: 8,
    },
    actionTitle: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '600',
    },
    actionSubtitle: {
      color: '#6b7280',
      fontSize: 12,
    },
    linksList: {
      gap: 8,
    },
    linkItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#1f2937',
      borderRadius: 10,
      padding: 14,
      gap: 12,
    },
    linkText: {
      flex: 1,
      color: '#ffffff',
      fontSize: 14,
    },
    bottomPadding: {
      height: 100,
    },
  });
}
