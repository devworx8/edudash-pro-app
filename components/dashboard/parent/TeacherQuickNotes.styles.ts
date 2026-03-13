/**
 * TeacherQuickNotes styles and types
 */

import { StyleSheet } from 'react-native';

// --- Types ---

export interface TeacherNote {
  id: string;
  student_id: string;
  teacher_id: string;
  note_type: 'highlight' | 'concern' | 'achievement' | 'reminder' | 'general';
  title: string;
  content: string;
  is_read: boolean;
  requires_acknowledgment: boolean;
  acknowledged_at?: string;
  created_at: string;
  teacher_name?: string;
  teacher_photo?: string;
}

// --- Styles ---

export const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      borderRadius: 20,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.16)',
      shadowColor: '#040a1a',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.24,
      shadowRadius: 18,
      elevation: 8,
    },
    loadingContainer: {
      padding: 40,
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
    },
    unreadBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    unreadCount: {
      color: '#FFF',
      fontSize: 12,
      fontWeight: '600',
    },
    noteItem: {
      padding: 14,
      borderRadius: 16,
      borderLeftWidth: 4,
      position: 'relative',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
    },
    noteHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    noteTypeIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      justifyContent: 'center',
      alignItems: 'center',
    },
    noteHeaderText: {
      marginLeft: 10,
      flex: 1,
    },
    noteTypeLabel: {
      fontSize: 12,
      fontWeight: '600',
    },
    noteTime: {
      fontSize: 11,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    noteTitle: {
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    noteContent: {
      fontSize: 14,
      lineHeight: 20,
    },
    expandedSection: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: 'rgba(125, 211, 252, 0.12)',
    },
    teacherInfo: {
      fontSize: 12,
      marginBottom: 10,
    },
    acknowledgeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
      gap: 6,
    },
    acknowledgeText: {
      color: '#FFF',
      fontSize: 14,
      fontWeight: '600',
    },
    acknowledgedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    acknowledgedText: {
      fontSize: 12,
      fontWeight: '500',
    },
    expandIcon: {
      position: 'absolute',
      right: 14,
      top: 14,
    },
  });
