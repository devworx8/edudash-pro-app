// Meeting Detail Screen - View full meeting agenda with notes

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share, Linking } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';
import * as Clipboard from 'expo-clipboard';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface AgendaItem {
  order?: number;
  title: string;
  duration_minutes?: number;
  presenter?: string;
  notes?: string;
}

interface Meeting {
  id: string;
  title: string;
  description?: string;
  meeting_type: string;
  meeting_date: string;
  start_time: string;
  end_time?: string;
  duration_minutes: number;
  location?: string;
  is_virtual: boolean;
  virtual_link?: string;
  invited_roles: string[];
  agenda_items: AgendaItem[];
  status: string;
  minutes?: string;
  action_items: { task: string; assignee_id?: string; due_date?: string; status?: string }[];
  created_at: string;
}

const MEETING_TYPE_INFO: Record<string, { label: string; icon: string; color: string }> = {
  staff: { label: 'Staff Meeting', icon: 'people', color: '#3b82f6' },
  parent: { label: 'Parent Meeting', icon: 'people-circle', color: '#10b981' },
  governing_body: { label: 'Governing Body', icon: 'business', color: '#6366f1' },
  pta: { label: 'PTA Meeting', icon: 'hand-left', color: '#f59e0b' },
  curriculum: { label: 'Curriculum Planning', icon: 'book', color: '#8b5cf6' },
  safety: { label: 'Safety Committee', icon: 'shield-checkmark', color: '#ef4444' },
  budget: { label: 'Budget Review', icon: 'cash', color: '#22c55e' },
  training: { label: 'Staff Training', icon: 'school', color: '#ec4899' },
  one_on_one: { label: 'One-on-One', icon: 'person', color: '#14b8a6' },
  other: { label: 'Other', icon: 'calendar', color: '#6b7280' },
};

const STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8',
  scheduled: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#10b981',
  cancelled: '#ef4444',
};

export default function MeetingDetailScreen() {
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const styles = createStyles(theme);
  const params = useLocalSearchParams<{ id: string }>();
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const fetchMeeting = useCallback(async () => {
    if (!meetingId) {
      setError('No meeting ID provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const supabase = assertSupabase();
      
      const { data, error: fetchError } = await supabase
        .from('school_meetings')
        .select('*')
        .eq('id', meetingId)
        .single();

      if (fetchError) throw fetchError;
      setMeeting(data);
    } catch (err) {
      console.error('Error fetching meeting:', err);
      setError(err instanceof Error ? err.message : 'Failed to load meeting');
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    fetchMeeting();
  }, [fetchMeeting]);

  const toggleItem = (index: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (meeting?.agenda_items) {
      setExpandedItems(new Set(meeting.agenda_items.map((_, i) => i)));
    }
  };

  const collapseAll = () => {
    setExpandedItems(new Set());
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-ZA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const generateWhatsAppMessage = () => {
    if (!meeting) return '';

    const typeInfo = MEETING_TYPE_INFO[meeting.meeting_type] || MEETING_TYPE_INFO.other;
    let message = `🦅 *${meeting.title}*\n\n`;
    message += `📅 Date: ${formatDate(meeting.meeting_date)}\n`;
    message += `🕙 Time: ${formatTime(meeting.start_time)}`;
    if (meeting.end_time) message += ` - ${formatTime(meeting.end_time)}`;
    message += '\n';
    
    if (meeting.location) {
      message += meeting.is_virtual 
        ? `💻 Virtual: ${meeting.location}\n`
        : `📍 Location: ${meeting.location}\n`;
    }

    message += '\n*AGENDA:*\n';
    meeting.agenda_items?.forEach((item, index) => {
      message += `${index + 1}. ${item.title}`;
      if (item.duration_minutes) message += ` (${item.duration_minutes} min)`;
      message += '\n';
    });

    if (meeting.description) {
      message += `\n_${meeting.description}_`;
    }

    return message;
  };

  const shareToWhatsApp = async () => {
    const message = generateWhatsAppMessage();
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        // Fallback to share sheet
        await Share.share({ message });
      }
    } catch (err) {
      console.error('Share error:', err);
      showAlert({ title: 'Error', message: 'Failed to share meeting', type: 'error' });
    }
  };

  const copyToClipboard = async () => {
    const message = generateWhatsAppMessage();
    await Clipboard.setStringAsync(message);
    showAlert({ title: 'Copied!', message: 'Meeting details copied to clipboard', type: 'success' });
  };

  const shareGeneral = async () => {
    const message = generateWhatsAppMessage();
    try {
      await Share.share({ message, title: meeting?.title });
    } catch (err) {
      console.error('Share error:', err);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading meeting...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !meeting) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={theme.error} />
          <Text style={styles.errorText}>{error || 'Meeting not found'}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const typeInfo = MEETING_TYPE_INFO[meeting.meeting_type] || MEETING_TYPE_INFO.other;
  const agendaItems = meeting.agenda_items || [];
  const sortedAgendaItems = [...agendaItems].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Meeting Details</Text>
        <TouchableOpacity onPress={shareGeneral} style={styles.headerShareButton}>
          <Ionicons name="share-outline" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Meeting Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <View style={[styles.typeIcon, { backgroundColor: typeInfo.color + '20' }]}>
              <Ionicons name={typeInfo.icon as any} size={28} color={typeInfo.color} />
            </View>
            <View style={styles.infoHeaderText}>
              <Text style={styles.meetingTitle}>{meeting.title}</Text>
              <Text style={styles.meetingType}>{typeInfo.label}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[meeting.status] }]}>
              <Text style={styles.statusText}>{meeting.status.replace('_', ' ')}</Text>
            </View>
          </View>

          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
              <Text style={styles.detailText}>{formatDate(meeting.meeting_date)}</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="time-outline" size={20} color={theme.textSecondary} />
              <Text style={styles.detailText}>
                {formatTime(meeting.start_time)}
                {meeting.end_time && ` - ${formatTime(meeting.end_time)}`}
              </Text>
            </View>
            {meeting.location && (
              <View style={styles.detailItem}>
                <Ionicons 
                  name={meeting.is_virtual ? 'videocam-outline' : 'location-outline'} 
                  size={20} 
                  color={theme.textSecondary} 
                />
                <Text style={styles.detailText}>{meeting.location}</Text>
              </View>
            )}
            {meeting.invited_roles?.length > 0 && (
              <View style={styles.detailItem}>
                <Ionicons name="people-outline" size={20} color={theme.textSecondary} />
                <Text style={styles.detailText}>
                  {meeting.invited_roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')}
                </Text>
              </View>
            )}
          </View>

          {meeting.description && (
            <Text style={styles.description}>{meeting.description}</Text>
          )}
        </View>

        {/* Share Actions */}
        <View style={styles.shareActions}>
          <TouchableOpacity style={styles.shareButton} onPress={shareToWhatsApp}>
            <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
            <Text style={styles.shareButtonText}>Share via WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareButton} onPress={copyToClipboard}>
            <Ionicons name="copy-outline" size={22} color={theme.primary} />
            <Text style={styles.shareButtonText}>Copy</Text>
          </TouchableOpacity>
        </View>

        {/* Agenda Section */}
        {sortedAgendaItems.length > 0 && (
          <View style={styles.agendaSection}>
            <View style={styles.agendaSectionHeader}>
              <Text style={styles.sectionTitle}>📋 Agenda ({sortedAgendaItems.length} items)</Text>
              <View style={styles.expandCollapseButtons}>
                <TouchableOpacity onPress={expandAll} style={styles.expandCollapseButton}>
                  <Text style={styles.expandCollapseText}>Expand All</Text>
                </TouchableOpacity>
                <Text style={styles.expandCollapseDivider}>|</Text>
                <TouchableOpacity onPress={collapseAll} style={styles.expandCollapseButton}>
                  <Text style={styles.expandCollapseText}>Collapse All</Text>
                </TouchableOpacity>
              </View>
            </View>

            {sortedAgendaItems.map((item, index) => {
              const isExpanded = expandedItems.has(index);
              const hasNotes = item.notes && item.notes.trim().length > 0;

              return (
                <TouchableOpacity
                  key={index}
                  style={styles.agendaItem}
                  onPress={() => hasNotes && toggleItem(index)}
                  activeOpacity={hasNotes ? 0.7 : 1}
                >
                  <View style={styles.agendaItemHeader}>
                    <View style={styles.agendaItemNumber}>
                      <Text style={styles.agendaItemNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.agendaItemContent}>
                      <Text style={styles.agendaItemTitle}>{item.title}</Text>
                      <View style={styles.agendaItemMeta}>
                        {item.duration_minutes && (
                          <View style={styles.metaTag}>
                            <Ionicons name="time-outline" size={12} color={theme.textSecondary} />
                            <Text style={styles.metaTagText}>{item.duration_minutes} min</Text>
                          </View>
                        )}
                        {item.presenter && (
                          <View style={styles.metaTag}>
                            <Ionicons name="person-outline" size={12} color={theme.textSecondary} />
                            <Text style={styles.metaTagText}>{item.presenter}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {hasNotes && (
                      <Ionicons 
                        name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                        size={20} 
                        color={theme.textSecondary} 
                      />
                    )}
                  </View>

                  {isExpanded && hasNotes && (
                    <View style={styles.agendaItemNotes}>
                      <View style={styles.notesHeader}>
                        <Ionicons name="document-text-outline" size={16} color={theme.primary} />
                        <Text style={styles.notesLabel}>Speaker Notes</Text>
                      </View>
                      <Text style={styles.notesText}>{item.notes}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Minutes Section */}
        {meeting.minutes && (
          <View style={styles.minutesSection}>
            <Text style={styles.sectionTitle}>📝 Meeting Minutes</Text>
            <View style={styles.minutesContent}>
              <Text style={styles.minutesText}>{meeting.minutes}</Text>
            </View>
          </View>
        )}

        {/* Action Items */}
        {meeting.action_items?.length > 0 && (
          <View style={styles.actionItemsSection}>
            <Text style={styles.sectionTitle}>✅ Action Items ({meeting.action_items.length})</Text>
            {meeting.action_items.map((item, index) => (
              <View key={index} style={styles.actionItem}>
                <Ionicons 
                  name={item.status === 'completed' ? 'checkbox' : 'square-outline'} 
                  size={20} 
                  color={item.status === 'completed' ? '#10b981' : theme.textSecondary} 
                />
                <View style={styles.actionItemContent}>
                  <Text style={[
                    styles.actionItemText,
                    item.status === 'completed' && styles.actionItemCompleted,
                  ]}>
                    {item.task}
                  </Text>
                  {item.due_date && (
                    <Text style={styles.actionItemDue}>
                      Due: {new Date(item.due_date).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: theme.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: theme.error,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.primary,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.card,
  },
  headerBackButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginLeft: 12,
  },
  headerShareButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  infoCard: {
    margin: 16,
    padding: 16,
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  typeIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  meetingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 4,
  },
  meetingType: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  detailsGrid: {
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailText: {
    fontSize: 15,
    color: theme.text,
    flex: 1,
  },
  description: {
    marginTop: 16,
    fontSize: 15,
    color: theme.textSecondary,
    lineHeight: 22,
  },
  shareActions: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: theme.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  agendaSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  agendaSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
  },
  expandCollapseButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandCollapseButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  expandCollapseText: {
    fontSize: 13,
    color: theme.primary,
    fontWeight: '500',
  },
  expandCollapseDivider: {
    color: theme.textSecondary,
    fontSize: 12,
  },
  agendaItem: {
    backgroundColor: theme.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  agendaItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  agendaItemNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  agendaItemNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.primary,
  },
  agendaItemContent: {
    flex: 1,
  },
  agendaItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 4,
  },
  agendaItemMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  metaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaTagText: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  agendaItemNotes: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    padding: 14,
    backgroundColor: theme.background,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  notesLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.primary,
  },
  notesText: {
    fontSize: 14,
    color: theme.text,
    lineHeight: 22,
  },
  minutesSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  minutesContent: {
    marginTop: 10,
    padding: 14,
    backgroundColor: theme.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  minutesText: {
    fontSize: 14,
    color: theme.text,
    lineHeight: 22,
  },
  actionItemsSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    backgroundColor: theme.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: 10,
    gap: 12,
  },
  actionItemContent: {
    flex: 1,
  },
  actionItemText: {
    fontSize: 14,
    color: theme.text,
    lineHeight: 20,
  },
  actionItemCompleted: {
    textDecorationLine: 'line-through',
    color: theme.textSecondary,
  },
  actionItemDue: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 4,
  },
});
