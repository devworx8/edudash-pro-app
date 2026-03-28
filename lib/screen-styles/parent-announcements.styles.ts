/**
 * Styles for Parent Announcements Screen
 * Extracted from parent-announcements.tsx for WARP compliance
 */

import { StyleSheet } from 'react-native';

export interface Announcement {
  id: string;
  preschool_id: string;
  title: string;
  content: string;
  author_id: string;
  target_audience: 'all' | 'teachers' | 'parents' | 'students';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  is_published: boolean;
  published_at: string;
  expires_at: string | null;
  created_at: string;
  preschool?: {
    name: string;
  };
}

export type PriorityFilter = 'all' | 'urgent' | 'high' | 'medium' | 'low';

export function getPriorityColor(priority: string, theme: any): string {
  switch (priority) {
    case 'urgent': return theme.error || '#EF4444';
    case 'high': return theme.warning || '#F59E0B';
    case 'medium': return theme.primary || '#3B82F6';
    case 'low': return theme.textSecondary || '#6B7280';
    default: return theme.textSecondary || '#6B7280';
  }
}

export function getPriorityLabel(priority: string): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function formatAnnouncementDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function createAnnouncementStyles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      flex: 1,
    },
    filtersContainer: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: theme.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    filtersScroll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingRight: 8,
    },
    filterButton: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 18,
      borderWidth: 1,
      minHeight: 34,
      minWidth: 72,
      alignItems: 'center',
      alignSelf: 'flex-start',
    },
    filterButtonActive: {
      borderWidth: 0,
    },
    filterButtonText: {
      fontSize: 13,
      fontWeight: '600',
    },
    listContent: {
      padding: 16,
      gap: 16,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
    emptyIcon: {
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: theme.textSecondary,
      textAlign: 'center',
    },
    announcementCard: {
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    announcementHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    headerLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    priorityBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
    },
    priorityBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    preschoolName: {
      fontSize: 13,
    },
    announcementTitle: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 8,
    },
    announcementContent: {
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 12,
    },
    announcementFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 12,
      borderTopWidth: 1,
      flexWrap: 'wrap',
      gap: 8,
    },
    footerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    footerText: {
      fontSize: 13,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: theme.textSecondary,
    },
    detailBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      justifyContent: 'flex-end',
    },
    detailSheet: {
      maxHeight: '82%',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      overflow: 'hidden',
    },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 18,
      borderBottomWidth: 1,
      gap: 12,
    },
    detailHeaderTextWrap: {
      flex: 1,
      gap: 4,
    },
    detailTitle: {
      fontSize: 20,
      fontWeight: '700',
      lineHeight: 28,
    },
    detailMeta: {
      fontSize: 13,
      lineHeight: 18,
    },
    detailContent: {
      paddingHorizontal: 20,
      paddingVertical: 18,
      gap: 14,
    },
    detailSchool: {
      fontSize: 14,
      fontWeight: '600',
    },
    detailPriorityBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      alignSelf: 'flex-start',
    },
    detailBody: {
      fontSize: 16,
      lineHeight: 24,
    },
  });
}
