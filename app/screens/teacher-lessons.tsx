/**
 * Teacher Lessons Browser Screen
 * 
 * A simple, reliable screen for teachers to browse and select lessons.
 * Can navigate to lesson assignment or lesson viewing.
 * 
 * @module app/screens/teacher-lessons
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, RefreshControl, Modal, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format } from 'date-fns';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useTeacherLessons, TeacherLesson } from '@/hooks/useTeacherLessons';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
type FilterStatus = 'all' | 'active' | 'draft' | 'mine';

export default function TeacherLessonsScreen() {
  const { theme, isDark } = useTheme();
  const { profile, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<TeacherLesson | null>(null);
  const { showAlert, AlertModalComponent } = useAlertModal();

  const {
    lessons,
    isLoading,
    error,
    isEmpty,
    refetch,
    myLessons,
    activeLessons,
    stats,
  } = useTeacherLessons({
    includeOrganization: true,
    limit: 100,
  });

  const styles = useMemo(() => createStyles(theme), [theme]);
  const teacherId = user?.id || profile?.id;

  // Filter lessons based on search and status
  const filteredLessons = useMemo(() => {
    let result = lessons;

    // Apply status filter
    switch (filterStatus) {
      case 'active':
        result = result.filter(l => l.status === 'active' || l.status === 'published');
        break;
      case 'draft':
        result = result.filter(l => l.status === 'draft');
        break;
      case 'mine':
        result = result.filter(l => l.teacher_id === teacherId);
        break;
      default:
        break;
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.title.toLowerCase().includes(query) ||
        l.subject?.toLowerCase()?.includes(query) ||
        l.description?.toLowerCase()?.includes(query)
      );
    }

    return result;
  }, [lessons, filterStatus, searchQuery, teacherId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDeleteLesson = useCallback(async (lesson: TeacherLesson) => {
    const isOwner = lesson.teacher_id === teacherId;
    const isPrincipal = profile?.role === 'principal' || profile?.role === 'principal_admin';
    
    if (!isOwner && !isPrincipal) {
      showAlert({ title: 'Permission Denied', message: 'You can only delete lessons you created.', type: 'error' });
      return;
    }

    showAlert({
      title: 'Delete Lesson',
      message: `Are you sure you want to delete "${lesson.title}"? This action cannot be undone.`,
      type: 'warning',
      buttons: [
        { text: 'Cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              const supabase = (await import('@/lib/supabase')).assertSupabase();
              await supabase.from('lesson_activities').delete().eq('lesson_id', lesson.id);
              const { error } = await supabase.from('lessons').delete().eq('id', lesson.id);
              if (error) throw error;
              showAlert({ title: 'Deleted', message: 'Lesson deleted successfully.', type: 'success' });
              refetch();
            } catch (err) {
              console.error('[TeacherLessons] Delete error:', err);
              showAlert({ title: 'Error', message: 'Failed to delete lesson.', type: 'error' });
            }
          },
        },
      ],
    });
  }, [teacherId, profile, refetch, showAlert]);

  // Opens the branded lesson action sheet for a given lesson
  const handleLessonPress = useCallback((lesson: TeacherLesson) => {
    setSelectedLesson(lesson);
  }, []);

  const handleCloseLessonModal = useCallback(() => setSelectedLesson(null), []);

  const handleAssignLesson = useCallback((lesson: TeacherLesson) => {
    setSelectedLesson(null);
    router.push({
      pathname: '/screens/assign-lesson',
      params: { lessonId: lesson.id, deliveryMode: 'class_activity' },
    });
  }, []);

  const handleCreateLesson = useCallback(() => {
    router.push('/screens/ai-lesson-generator');
  }, []);

  const renderFilterTabs = () => (
    <View style={styles.filterContainer}>
      {[
        { key: 'all', label: `All (${stats.total})` },
        { key: 'active', label: `Active (${stats.active})` },
        { key: 'draft', label: `Drafts (${stats.draft})` },
        { key: 'mine', label: `My Lessons (${myLessons.length})` },
      ].map(({ key, label }) => (
        <TouchableOpacity
          key={key}
          style={[
            styles.filterTab,
            filterStatus === key && styles.filterTabActive,
          ]}
          onPress={() => setFilterStatus(key as FilterStatus)}
        >
          <Text
            style={[
              styles.filterTabText,
              filterStatus === key && styles.filterTabTextActive,
            ]}
          >
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'published':
        return '#10B981';
      case 'draft':
        return '#F59E0B';
      case 'archived':
        return '#6B7280';
      default:
        return theme.textSecondary;
    }
  };

  const renderLessonItem = ({ item }: { item: TeacherLesson }) => {
    const isOwner = item.teacher_id === teacherId;

    return (
      <TouchableOpacity
        style={styles.lessonCard}
        onPress={() => handleLessonPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.lessonHeader}>
          <View style={styles.lessonTitleRow}>
            <Text style={styles.lessonTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {item.is_ai_generated && (
              <View style={styles.aiBadge}>
                <Ionicons name="sparkles" size={12} color="#00f5ff" />
              </View>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status}
            </Text>
          </View>
        </View>

        <View style={styles.lessonMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="book-outline" size={14} color={theme.textSecondary} />
            <Text style={styles.metaText}>{item.subject || 'General'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color={theme.textSecondary} />
            <Text style={styles.metaText}>{item.duration_minutes || 30} min</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="people-outline" size={14} color={theme.textSecondary} />
            <Text style={styles.metaText}>{item.age_group || '3-6 yrs'}</Text>
          </View>
        </View>

        {item.description && (
          <Text style={styles.lessonDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.lessonFooter}>
          <View style={styles.ownerInfo}>
            <Ionicons 
              name={isOwner ? 'person' : 'school-outline'} 
              size={12} 
              color={theme.textSecondary} 
            />
            <Text style={styles.ownerText}>
              {isOwner ? 'Created by you' : 'Organization lesson'}
            </Text>
          </View>
          <Text style={styles.dateText}>
            {format(new Date(item.created_at), 'MMM d, yyyy')}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.assignButton}
          onPress={() => handleLessonPress(item)}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color="#fff" />
          <Text style={styles.assignButtonText}>Deliver</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="book-outline" size={64} color={theme.textSecondary} />
      <Text style={styles.emptyTitle}>
        {error ? 'Error Loading Lessons' : 'No Lessons Found'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {error 
          ? error 
          : searchQuery 
            ? 'Try adjusting your search' 
            : 'Create your first lesson with AI'
        }
      </Text>
      {!error && (
        <TouchableOpacity style={styles.createButton} onPress={handleCreateLesson}>
          <Ionicons name="sparkles" size={20} color="#fff" />
          <Text style={styles.createButtonText}>Generate with AI</Text>
        </TouchableOpacity>
      )}
      {error && (
        <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
          <Ionicons name="refresh" size={20} color={theme.primary} />
          <Text style={[styles.createButtonText, { color: theme.primary }]}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader 
        title="Lessons"
        showBackButton
        rightAction={
          <TouchableOpacity onPress={handleCreateLesson} style={{ padding: 8 }}>
            <Ionicons name="add" size={24} color={theme.text} />
          </TouchableOpacity>
        }
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={20} color={theme.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search lessons..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      {renderFilterTabs()}

      {/* Lessons List */}
      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading lessons...</Text>
        </View>
      ) : (
        <FlashList
          data={filteredLessons}
          renderItem={renderLessonItem}
          keyExtractor={(item) => item.id}
          estimatedItemSize={120}
          contentContainerStyle={[
            styles.listContent,
            filteredLessons.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Lesson delivery action sheet */}
      <LessonActionModal
        lesson={selectedLesson}
        theme={theme}
        teacherId={teacherId}
        profile={profile}
        onClose={handleCloseLessonModal}
        onDelete={handleDeleteLesson}
        showAlert={showAlert}
      />
      <AlertModalComponent />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lesson delivery action modal — replaces native Alert.alert action sheet
// ─────────────────────────────────────────────────────────────────────────────
interface LessonActionModalProps {
  lesson: TeacherLesson | null;
  theme: any;
  teacherId: string | undefined;
  profile: any;
  onClose: () => void;
  onDelete: (lesson: TeacherLesson) => void;
  showAlert: (config: any) => void;
}

function LessonActionModal({
  lesson,
  theme,
  teacherId,
  profile,
  onClose,
  onDelete,
  showAlert: _showAlert,
}: LessonActionModalProps) {
  if (!lesson) return null;

  const isOwner = lesson.teacher_id === teacherId;
  const isPrincipal = profile?.role === 'principal' || profile?.role === 'principal_admin';
  const canEditDelete = isOwner || isPrincipal;

  const ACTION_ROWS: Array<{
    icon: string;
    color: string;
    label: string;
    sublabel: string;
    onPress: () => void;
    destructive?: boolean;
  }> = [
    {
      icon: 'calendar',
      color: '#5A409D',
      label: 'Add to Today\'s Class',
      sublabel: 'Schedule for your class — parents are notified',
      onPress: () => {
        onClose();
        router.push({
          pathname: '/screens/assign-lesson',
          params: { lessonId: lesson.id, deliveryMode: 'class_activity' },
        });
      },
    },
    {
      icon: 'game-controller',
      color: '#10B981',
      label: 'Assign Playground Activity',
      sublabel: 'Assign a digital activity students do on Dash',
      onPress: () => {
        onClose();
        router.push({
          pathname: '/screens/assign-lesson',
          params: { lessonId: lesson.id, deliveryMode: 'playground', mode: 'activity-only' },
        });
      },
    },
    {
      icon: 'home',
      color: '#F59E0B',
      label: 'Send Take-Home Activity',
      sublabel: 'Parent-guided reinforcement at home',
      onPress: () => {
        onClose();
        router.push({
          pathname: '/screens/assign-lesson',
          params: { lessonId: lesson.id, deliveryMode: 'take_home' },
        });
      },
    },
    {
      icon: 'analytics',
      color: '#3B82F6',
      label: 'View Class Insights',
      sublabel: 'Track scores, stars, and completion time',
      onPress: () => {
        onClose();
        router.push('/screens/teacher-class-insights');
      },
    },
    {
      icon: 'eye',
      color: theme.primary,
      label: 'View Lesson Plan',
      sublabel: 'Open the full lesson plan',
      onPress: () => {
        onClose();
        router.push({
          pathname: '/screens/lesson-viewer',
          params: { lessonId: lesson.id },
        });
      },
    },
  ];

  if (canEditDelete) {
    ACTION_ROWS.push({
      icon: 'pencil',
      color: theme.textSecondary,
      label: 'Edit Lesson',
      sublabel: 'Update lesson content',
      onPress: () => {
        onClose();
        router.push({
          pathname: '/screens/lesson-edit',
          params: { lessonId: lesson.id },
        });
      },
    });
    ACTION_ROWS.push({
      icon: 'trash',
      color: '#EF4444',
      label: 'Delete Lesson',
      sublabel: 'Permanently remove this lesson',
      destructive: true,
      onPress: () => {
        onClose();
        onDelete(lesson);
      },
    });
  }

  const s = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: 32,
      overflow: 'hidden',
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 8,
    },
    titleBlock: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
      marginBottom: 8,
    },
    sheetTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
    },
    sheetSubtitle: {
      fontSize: 13,
      color: theme.textSecondary,
      marginTop: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 14,
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabel: {
      fontSize: 15,
      fontWeight: '600',
    },
    rowSublabel: {
      fontSize: 12,
      marginTop: 1,
    },
    cancelRow: {
      marginTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      paddingTop: 8,
    },
  });

  return (
    <Modal
      visible={!!lesson}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={s.titleBlock}>
              <Text style={s.sheetTitle} numberOfLines={1}>{lesson.title}</Text>
              <Text style={s.sheetSubtitle}>
                {lesson.subject} · {lesson.duration_minutes || 30} min · {lesson.age_group || '3-6 yrs'}
              </Text>
            </View>

            {ACTION_ROWS.map((row) => (
              <TouchableOpacity
                key={row.label}
                style={s.row}
                onPress={row.onPress}
                activeOpacity={0.7}
              >
                <View style={[s.iconCircle, { backgroundColor: row.color + '20' }]}>
                  <Ionicons name={row.icon as any} size={20} color={row.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowLabel, { color: row.destructive ? '#EF4444' : theme.text }]}>
                    {row.label}
                  </Text>
                  <Text style={[s.rowSublabel, { color: theme.textSecondary }]}>
                    {row.sublabel}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={[s.row, s.cancelRow]} onPress={onClose} activeOpacity={0.7}>
              <Text style={[s.rowLabel, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.text,
    paddingVertical: 0,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.surface,
  },
  filterTabActive: {
    backgroundColor: theme.primary,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.textSecondary,
  },
  filterTabTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: theme.textSecondary,
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
  },
  listContentEmpty: {
    flex: 1,
  },
  separator: {
    height: 12,
  },
  lessonCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  lessonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  lessonTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  lessonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    flex: 1,
  },
  aiBadge: {
    backgroundColor: 'rgba(0, 245, 255, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  lessonMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  lessonDescription: {
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  lessonFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ownerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ownerText: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  dateText: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.primary,
    paddingVertical: 10,
    borderRadius: 10,
  },
  assignButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
});
