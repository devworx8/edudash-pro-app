/**
 * TeacherQuickNotes Component
 *
 * Displays quick notes/updates from teachers to parents about their child.
 * Shows daily highlights, concerns, achievements, or reminders.
 *
 * Features:
 * - Note types with visual indicators (highlight, concern, achievement, reminder)
 * - Real-time updates
 * - Expandable note details
 * - Reply/acknowledge functionality
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { assertSupabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { formatRelativeTime } from '@/lib/utils/dateUtils';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { type TeacherNote, createStyles } from './TeacherQuickNotes.styles';
export type { TeacherNote } from './TeacherQuickNotes.styles';

interface TeacherQuickNotesProps {
  studentId: string;
  maxItems?: number;
  showHeader?: boolean;
  onNotePress?: (note: TeacherNote) => void;
  onAcknowledge?: (noteId: string) => void;
}

export function TeacherQuickNotes({
  studentId,
  maxItems = 5,
  showHeader = true,
  onNotePress,
  onAcknowledge,
}: TeacherQuickNotesProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [notes, setNotes] = useState<TeacherNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const noteTypes = useMemo(() => ({
    highlight: { icon: 'sunny', color: '#F8CA59', label: t('dashboard.parent.teacher_notes.types.highlight', { defaultValue: 'Daily Highlight' }) },
    concern: { icon: 'alert-circle', color: '#F87171', label: t('dashboard.parent.teacher_notes.types.concern', { defaultValue: 'Please Note' }) },
    achievement: { icon: 'trophy', color: '#34D399', label: t('dashboard.parent.teacher_notes.types.achievement', { defaultValue: 'Achievement' }) },
    reminder: { icon: 'notifications', color: '#8B5CF6', label: t('dashboard.parent.teacher_notes.types.reminder', { defaultValue: 'Reminder' }) },
    general: { icon: 'chatbubble', color: '#38BDF8', label: t('dashboard.parent.teacher_notes.types.general', { defaultValue: 'Note' }) },
  }), [t]);

  const loadNotes = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    try {
      const supabase = assertSupabase();

      // Get recent teacher notes for this student
      const { data, error } = await supabase
        .from('teacher_student_notes')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(maxItems);

      if (error) {
        setNotes([]);
      } else {
        // Fetch teacher profiles separately if we have notes
        const teacherIds = [...new Set((data || []).map((n: any) => n.teacher_id).filter(Boolean))]
        let teacherProfiles: Record<string, { first_name?: string; last_name?: string; avatar_url?: string }> = {};

        if (teacherIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url')
            .in('id', teacherIds);

          if (profiles) {
            teacherProfiles = profiles.reduce((acc: Record<string, any>, p: any) => {
              acc[p.id] = p;
              return acc;
            }, {});
          }
        }

        const mapped = (data || []).map((n: any) => {
          const profile = teacherProfiles[n.teacher_id];
          return {
            ...n,
            teacher_name: profile
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || t('roles.teacher', { defaultValue: 'Teacher' })
              : t('roles.teacher', { defaultValue: 'Teacher' }),
            teacher_photo: profile?.avatar_url,
          };
        });
        setNotes(mapped);
      }
    } catch (err) {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [maxItems, studentId, t]);

  useEffect(() => {
    loadNotes();

    // Real-time subscription
    if (!studentId) return;

    const supabase = assertSupabase();
    const subscription = supabase
      .channel(`teacher_notes_${studentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teacher_student_notes',
          filter: `student_id=eq.${studentId}`,
        },
        () => {
          loadNotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [studentId, loadNotes]);

  const handleAcknowledge = async (noteId: string) => {
    try {
      const supabase = assertSupabase();
      await supabase
        .from('teacher_student_notes')
        .update({
          acknowledged_at: new Date().toISOString(),
          is_read: true,
        })
        .eq('id', noteId);

      loadNotes();
      onAcknowledge?.(noteId);
    } catch (err) {
      // silent
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const renderNote = ({ item }: { item: TeacherNote }) => {
    const noteConfig = noteTypes[item.note_type] || noteTypes.general;
    const isExpanded = expandedId === item.id;
    const isUnread = !item.is_read;

    return (
      <TouchableOpacity
        style={[
          styles.noteItem,
          { backgroundColor: isUnread ? `${noteConfig.color}12` : 'rgba(12, 20, 42, 0.72)' },
          { borderLeftColor: noteConfig.color },
        ]}
        onPress={() => {
          toggleExpand(item.id);
          onNotePress?.(item);
        }}
        activeOpacity={0.7}
      >
        {/* Note header */}
        <View style={styles.noteHeader}>
          <View style={[styles.noteTypeIcon, { backgroundColor: `${noteConfig.color}20` }]}>
            <Ionicons name={noteConfig.icon as any} size={16} color={noteConfig.color} />
          </View>
          <View style={styles.noteHeaderText}>
            <Text style={[styles.noteTypeLabel, { color: noteConfig.color }]}>
              {noteConfig.label}
            </Text>
            <Text style={[styles.noteTime, { color: theme.textTertiary }]}>
              {formatRelativeTime(item.created_at)}
            </Text>
          </View>
          {isUnread && (
            <View style={[styles.unreadDot, { backgroundColor: noteConfig.color }]} />
          )}
        </View>

        {/* Note content */}
        <Text style={[styles.noteTitle, { color: theme.text }]}>
          {item.title || t('dashboard.parent.teacher_notes.default_title', { defaultValue: 'Update' })}
        </Text>
        <Text
          style={[styles.noteContent, { color: theme.textSecondary }]}
          numberOfLines={isExpanded ? undefined : 2}
        >
          {item.content}
        </Text>

        {/* Expanded details */}
        {isExpanded && (
          <View style={styles.expandedSection}>
            {item.teacher_name && (
              <Text style={[styles.teacherInfo, { color: theme.textTertiary }]}>
                {t('dashboard.parent.teacher_notes.from_label', { defaultValue: 'From:' })} {item.teacher_name}
              </Text>
            )}

            {item.requires_acknowledgment && !item.acknowledged_at && (
              <TouchableOpacity
                style={[styles.acknowledgeButton, { backgroundColor: theme.primary }]}
                onPress={() => handleAcknowledge(item.id)}
              >
                <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                <Text style={styles.acknowledgeText}>
                  {t('dashboard.parent.teacher_notes.acknowledge', { defaultValue: 'Acknowledge' })}
                </Text>
              </TouchableOpacity>
            )}

            {item.acknowledged_at && (
              <View style={styles.acknowledgedBadge}>
                <Ionicons name="checkmark-done" size={14} color={theme.success} />
                <Text style={[styles.acknowledgedText, { color: theme.success }]}>
                  {t('dashboard.parent.teacher_notes.acknowledged', { defaultValue: 'Acknowledged' })}
                </Text>
              </View>
            )}
          </View>
        )}

        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.textSecondary}
          style={styles.expandIcon}
        />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <EduDashSpinner size="small" color={theme.primary} />
      </View>
    );
  }

  // Don't render anything if no notes (to keep dashboard clean)
  if (notes.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: 'rgba(8, 14, 31, 0.9)' }]}>
      {showHeader && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="chatbubbles" size={20} color="#38BDF8" />
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              {t('dashboard.parent.teacher_notes.title', { defaultValue: 'From Teacher' })}
            </Text>
          </View>
          {notes.filter(n => !n.is_read).length > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: '#6D4CF6' }]}
            >
              <Text style={styles.unreadCount}>
                {t('dashboard.parent.teacher_notes.new_count', {
                  defaultValue: '{{count}} new',
                  count: notes.filter(n => !n.is_read).length,
                })}
              </Text>
            </View>
          )}
        </View>
      )}

      <View>
        {notes.map((item, index) => (
          <React.Fragment key={item.id}>
            {renderNote({ item })}
            {index < notes.length - 1 && <View style={{ height: 10 }} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

export default TeacherQuickNotes;
