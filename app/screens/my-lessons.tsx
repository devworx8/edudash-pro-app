/**
 * My Lessons Screen
 * 
 * Displays AI-generated lessons saved by the teacher.
 * Allows viewing, editing, and managing saved lessons.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl, Platform } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { format, formatDistanceToNow } from 'date-fns';

import { assertSupabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

const TAG = 'MyLessons';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import LessonsService from '@/services/LessonsService';
import { Lesson } from '@/types/lessons';
import { getTeacherRoute } from '@/lib/constants/teacherRoutes';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Conditional import for markdown rendering
const isWeb = Platform.OS === 'web';
let Markdown: React.ComponentType<any> | null = null;
if (!isWeb) {
  try {
    Markdown = require('react-native-markdown-display').default;
  } catch (e) {
    console.warn('[MyLessons] Markdown not available:', e);
  }
}

export default function MyLessonsScreen() {
  const { theme, isDark } = useTheme();
  const { profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

  const palette = useMemo(() => ({
    bg: theme.background,
    text: theme.text,
    textSec: theme.textSecondary,
    outline: theme.border,
    surface: theme.surface,
    primary: theme.primary,
    accent: theme.accent,
  }), [theme]);

  // Markdown styles
  const markdownStyles = useMemo(() => ({
    body: {
      color: theme.text,
      fontSize: 14,
      lineHeight: 20,
    },
    heading1: {
      color: '#FF6B6B',
      fontSize: 18,
      fontWeight: '700' as const,
      marginTop: 12,
      marginBottom: 6,
    },
    heading2: {
      color: theme.primary,
      fontSize: 16,
      fontWeight: '600' as const,
      marginTop: 10,
      marginBottom: 4,
    },
    heading3: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600' as const,
      marginTop: 8,
      marginBottom: 4,
    },
    paragraph: {
      marginBottom: 6,
    },
    strong: {
      fontWeight: '700' as const,
    },
    bullet_list: {
      marginLeft: 8,
    },
    list_item: {
      marginBottom: 2,
    },
  }), [theme]);

  // Fetch lessons
  const { data: lessons = [], isLoading, error, refetch } = useQuery({
    queryKey: ['my-lessons', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      
      const teacherId = profile.id;
      const preschoolId = profile.preschool_id || profile.organization_id;
      
      logger.debug(TAG, 'Fetching lessons for teacher:', teacherId, 'preschool:', preschoolId);
      
      // Build the query - handle case where preschoolId might be null
      let query = assertSupabase()
        .from('lessons')
        .select('*');
      
      // If we have preschoolId, fetch lessons for teacher OR the preschool
      // If no preschoolId, only fetch lessons by this teacher
      if (preschoolId) {
        query = query.or(`teacher_id.eq.${teacherId},preschool_id.eq.${preschoolId}`);
      } else {
        query = query.eq('teacher_id', teacherId);
      }
      
      // Filter for AI-generated lessons and order by newest
      const { data, error } = await query
        .eq('is_ai_generated', true)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        console.error('[MyLessons] Error fetching lessons:', error);
        throw error;
      }
      
      logger.debug(TAG, 'Found', data?.length || 0, 'lessons');
      return data || [];
    },
    enabled: !!profile?.id,
    staleTime: 30_000,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleLessonPress = useCallback((lesson: any) => {
    setExpandedLessonId(prev => prev === lesson.id ? null : lesson.id);
  }, []);

  const handleViewLesson = useCallback((lesson: any) => {
    // Check if this is an AI-generated lesson with content that should use the lesson viewer
    if (lesson.is_ai_generated && lesson.content) {
      router.push({
        pathname: '/screens/lesson-viewer',
        params: { 
          lessonId: lesson.id,
          subject: lesson.subject || 'General',
          grade: lesson.age_group || 'Preschool'
        },
      });
    } else {
      router.push({
        pathname: '/screens/lesson-detail',
        params: { lessonId: lesson.id },
      });
    }
  }, []);

  const handleDeleteLesson = useCallback(async (lessonId: string) => {
    showAlert({
      title: 'Delete Lesson',
      message: 'Are you sure you want to delete this lesson? This action cannot be undone.',
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await assertSupabase()
                .from('lessons')
                .delete()
                .eq('id', lessonId);
              
              if (error) throw error;
              
              queryClient.invalidateQueries({ queryKey: ['my-lessons'] });
              showAlert({ title: 'Success', message: 'Lesson deleted successfully', type: 'success' });
            } catch (e) {
              console.error('[MyLessons] Delete error:', e);
              showAlert({ title: 'Error', message: 'Failed to delete lesson', type: 'error' });
            }
          },
        },
      ],
    });
  }, [queryClient, showAlert]);

  const getSubjectIcon = (subject: string) => {
    const subjectLower = subject?.toLowerCase() || '';
    if (subjectLower.includes('color') || subjectLower.includes('art')) return 'color-palette';
    if (subjectLower.includes('shape') || subjectLower.includes('pattern')) return 'shapes';
    if (subjectLower.includes('number') || subjectLower.includes('math')) return 'calculator';
    if (subjectLower.includes('letter') || subjectLower.includes('sound')) return 'text';
    if (subjectLower.includes('nature') || subjectLower.includes('science')) return 'leaf';
    if (subjectLower.includes('social')) return 'people';
    if (subjectLower.includes('motor') || subjectLower.includes('movement')) return 'body';
    if (subjectLower.includes('music')) return 'musical-notes';
    if (subjectLower.includes('story') || subjectLower.includes('language')) return 'book';
    if (subjectLower.includes('sensory')) return 'hand-left';
    if (subjectLower.includes('ai') || subjectLower.includes('robot')) return 'hardware-chip';
    if (subjectLower.includes('computer')) return 'laptop';
    return 'document-text';
  };

  const renderLesson = useCallback(({ item }: { item: any }) => {
    const isExpanded = expandedLessonId === item.id;
    const subjectIcon = getSubjectIcon(item.subject);
    const createdDate = item.created_at ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true }) : 'Unknown';
    
    return (
      <View style={[styles.lessonCard, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
        {/* Header */}
        <TouchableOpacity 
          style={styles.lessonHeader}
          onPress={() => handleLessonPress(item)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
            <Ionicons name={subjectIcon as any} size={24} color={theme.primary} />
          </View>
          
          <View style={styles.lessonInfo}>
            <Text style={[styles.lessonTitle, { color: palette.text }]} numberOfLines={2}>
              {item.title || 'Untitled Lesson'}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={12} color={palette.textSec} />
                <Text style={[styles.metaText, { color: palette.textSec }]}>
                  {item.duration_minutes || 30} min
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={12} color={palette.textSec} />
                <Text style={[styles.metaText, { color: palette.textSec }]}>
                  {createdDate}
                </Text>
              </View>
            </View>
            {item.age_group && (
              <View style={[styles.ageTag, { backgroundColor: '#FF6B6B20' }]}>
                <Text style={[styles.ageTagText, { color: '#FF6B6B' }]}>
                  {item.age_group}
                </Text>
              </View>
            )}
          </View>
          
          <Ionicons 
            name={isExpanded ? 'chevron-up' : 'chevron-down'} 
            size={20} 
            color={palette.textSec} 
          />
        </TouchableOpacity>

        {/* Expanded Content */}
        {isExpanded && (
          <View style={[styles.expandedContent, { borderTopColor: palette.outline }]}>
            {/* Description/Content Preview */}
            {(item.description || item.content) && (
              <View style={styles.contentPreview}>
                {Markdown ? (
                  <Markdown style={markdownStyles}>
                    {(item.description || item.content || '').substring(0, 500)}
                    {(item.description || item.content || '').length > 500 ? '...' : ''}
                  </Markdown>
                ) : (
                  <Text style={[styles.descriptionText, { color: palette.text }]} numberOfLines={8}>
                    {item.description || item.content || 'No description available'}
                  </Text>
                )}
              </View>
            )}
            
            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.primary }]}
                onPress={() => handleViewLesson(item)}
              >
                <Ionicons name="eye-outline" size={16} color="#FFF" />
                <Text style={styles.actionButtonText}>View</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#F59E0B' }]}
                onPress={() => router.push({
                  pathname: '/screens/lesson-edit',
                  params: { lessonId: item.id },
                })}
              >
                <Ionicons name="create-outline" size={16} color="#FFF" />
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#EF4444' }]}
                onPress={() => handleDeleteLesson(item.id)}
              >
                <Ionicons name="trash-outline" size={16} color="#FFF" />
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }, [expandedLessonId, palette, theme, markdownStyles, handleLessonPress, handleViewLesson, handleDeleteLesson]);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="document-text-outline" size={64} color={palette.textSec} />
      <Text style={[styles.emptyTitle, { color: palette.text }]}>No Saved Lessons</Text>
      <Text style={[styles.emptyText, { color: palette.textSec }]}>
        Generate your first AI lesson and save it to see it here.
      </Text>
      <TouchableOpacity
        style={[styles.createButton, { backgroundColor: '#FF6B6B' }]}
        onPress={() => router.push(getTeacherRoute('create_lesson'))}
      >
        <Ionicons name="sparkles" size={20} color="#FFF" />
        <Text style={styles.createButtonText}>Create Lesson</Text>
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
        <ScreenHeader title="My Lessons" showBackButton />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: palette.textSec }]}>Loading your lessons...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <ScreenHeader 
        title="My Lessons" 
        subtitle={`${lessons.length} saved lesson${lessons.length !== 1 ? 's' : ''}`}
        showBackButton 
      />

      {/* Quick Stats */}
      <View style={[styles.statsBar, { backgroundColor: palette.surface, borderBottomColor: palette.outline }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: theme.primary }]}>{lessons.length}</Text>
          <Text style={[styles.statLabel, { color: palette.textSec }]}>Total</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#10B981' }]}>
            {lessons.filter(l => l.is_ai_generated).length}
          </Text>
          <Text style={[styles.statLabel, { color: palette.textSec }]}>AI Generated</Text>
        </View>
      </View>

      {/* Lessons List */}
      <FlatList
        data={lessons}
        keyExtractor={(item) => item.id}
        renderItem={renderLesson}
        contentContainerStyle={[
          styles.listContent,
          lessons.length === 0 && styles.emptyListContent,
        ]}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#FF6B6B"
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Action Button */}
      {lessons.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: '#FF6B6B' }]}
          onPress={() => router.push(getTeacherRoute('create_lesson'))}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
      )}
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  statsBar: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  lessonCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  lessonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lessonInfo: {
    flex: 1,
  },
  lessonTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  ageTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ageTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  expandedContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    paddingTop: 12,
  },
  contentPreview: {
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  actionButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  createButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});
