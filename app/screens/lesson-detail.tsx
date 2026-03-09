/**
 * Lesson Detail Screen
 * 
 * Displays detailed lesson content with interactive features,
 * progress tracking, and navigation capabilities.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { router, useLocalSearchParams } from 'expo-router';
import { Lesson, LessonProgress } from '@/types/lessons';
import LessonsService from '@/services/LessonsService';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Conditional import for markdown rendering
const isWeb = Platform.OS === 'web';
let Markdown: React.ComponentType<any> | null = null;
if (!isWeb) {
  try {
    Markdown = require('react-native-markdown-display').default;
  } catch (e) {
    console.warn('[LessonDetail] Markdown not available:', e);
  }
}

// Default theme fallback to prevent crashes if ThemeContext fails
const DEFAULT_THEME = {
  text: '#1a1a2e',
  textSecondary: '#6b7280',
  background: '#ffffff',
  cardBackground: '#f3f4f6',
  surface: '#f3f4f6',
  primary: '#6366F1',
  onPrimary: '#ffffff',
  border: '#e5e7eb',
  success: '#10b981',
};

export default function LessonDetailScreen() {
  // Use theme with fallback
  const themeContext = useTheme();
  const theme = themeContext?.theme || DEFAULT_THEME;
  const insets = useSafeAreaInsets();
  
  const params = useLocalSearchParams();
  const lessonId = typeof params?.lessonId === 'string' ? params.lessonId : Array.isArray(params?.lessonId) ? params.lessonId[0] : null;
  const { showAlert, alertProps } = useAlertModal();
  
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const lessonsService = LessonsService;

  // Markdown styles for AI-generated content - with null safety
  const markdownStyles = useMemo(() => ({
    body: {
      color: theme?.text || '#1a1a2e',
      fontSize: 15,
      lineHeight: 24,
    },
    heading1: {
      color: '#FF6B6B',
      fontSize: 22,
      fontWeight: '700' as const,
      marginTop: 20,
      marginBottom: 10,
    },
    heading2: {
      color: theme?.primary || '#6366F1',
      fontSize: 18,
      fontWeight: '600' as const,
      marginTop: 16,
      marginBottom: 8,
    },
    heading3: {
      color: theme?.text || '#1a1a2e',
      fontSize: 16,
      fontWeight: '600' as const,
      marginTop: 12,
      marginBottom: 6,
    },
    paragraph: {
      marginBottom: 10,
      color: theme?.text || '#1a1a2e',
    },
    strong: {
      fontWeight: '700' as const,
      color: theme?.text || '#1a1a2e',
    },
    em: {
      fontStyle: 'italic' as const,
    },
    bullet_list: {
      marginLeft: 8,
      marginBottom: 8,
    },
    ordered_list: {
      marginLeft: 8,
      marginBottom: 8,
    },
    list_item: {
      marginBottom: 6,
      color: theme?.text || '#1a1a2e',
    },
    code_inline: {
      backgroundColor: theme?.surface || theme?.cardBackground || '#f3f4f6',
      padding: 3,
      borderRadius: 4,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 13,
      color: theme?.primary || '#6366F1',
    },
    fence: {
      backgroundColor: theme?.surface || theme?.cardBackground || '#f3f4f6',
      padding: 12,
      borderRadius: 8,
      marginVertical: 10,
    },
    blockquote: {
      backgroundColor: theme?.surface || theme?.cardBackground || '#f3f4f6',
      borderLeftColor: '#FF6B6B',
      borderLeftWidth: 4,
      paddingLeft: 12,
      paddingVertical: 8,
      marginLeft: 0,
      marginVertical: 10,
    },
    hr: {
      backgroundColor: theme?.border || '#e5e7eb',
      height: 1,
      marginVertical: 16,
    },
  }), [theme?.text, theme?.primary, theme?.surface, theme?.cardBackground, theme?.border]);

  useEffect(() => {
    loadLessonData();
  }, [lessonId]);

  const loadLessonData = async () => {
    if (!lessonId) {
      setLoading(false);
      setError('No lesson ID provided');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Load lesson data
      const lessonData = await lessonsService.getLessonById(lessonId);
      if (lessonData) {
        setLesson(lessonData);
        
        // Load progress data (may fail gracefully if table doesn't exist)
        try {
          const progressData = await lessonsService.getUserLessonProgress(lessonId);
          if (progressData) {
            setProgress(progressData);
            setIsBookmarked(!!progressData.bookmarked_at);
          }
        } catch (progressError) {
          console.warn('[LessonDetail] Could not load progress:', progressError);
          // Progress is optional - don't fail the whole screen
        }
      } else {
        setError('Lesson not found');
      }
    } catch (err) {
      console.error('[LessonDetail] Error loading lesson data:', err);
      setError('Failed to load lesson details');
    } finally {
      setLoading(false);
    }
  };

  const handleStartLesson = async () => {
    if (!lesson) return;

    try {
      await lessonsService.updateLessonProgress(lesson.id, {
        status: 'in_progress',
        progress_percentage: progress?.progress_percentage || 0,
        started_at: new Date().toISOString(),
      });
      
      showAlert({ title: 'Lesson Started', message: 'You have started this lesson! Progress will be tracked.', type: 'success' });
      loadLessonData(); // Refresh progress
    } catch (error) {
      console.error('Error starting lesson:', error);
      showAlert({ title: 'Error', message: 'Failed to start lesson. Please try again.', type: 'error' });
    }
  };

  const handleCompleteLesson = async () => {
    if (!lesson) return;

    try {
      await lessonsService.updateLessonProgress(lesson.id, {
        status: 'completed',
        progress_percentage: 100,
        completed_at: new Date().toISOString(),
      });
      
      showAlert({ title: 'Congratulations!', message: 'You have completed this lesson!', type: 'success' });
      loadLessonData(); // Refresh progress
    } catch (error) {
      console.error('Error completing lesson:', error);
      showAlert({ title: 'Error', message: 'Failed to complete lesson. Please try again.', type: 'error' });
    }
  };

  const handleBookmarkToggle = async () => {
    if (!lesson) return;

    try {
      const newBookmarkStatus = await lessonsService.toggleLessonBookmark(lesson.id);
      setIsBookmarked(newBookmarkStatus);
      
      showAlert({
        title: newBookmarkStatus ? 'Bookmarked' : 'Bookmark Removed', 
        message: newBookmarkStatus ? 'Lesson added to your bookmarks' : 'Lesson removed from your bookmarks',
        type: 'success',
      });
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      showAlert({ title: 'Error', message: 'Failed to update bookmark. Please try again.', type: 'error' });
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>Loading lesson...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>Oops!</Text>
          <Text style={[styles.errorDescription, { color: theme.textSecondary }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[styles.backToHubButton, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
          >
            <Ionicons name="library-outline" size={20} color={theme.onPrimary} />
            <Text style={[styles.backToHubText, { color: theme.onPrimary }]}>
              Back to Lessons Hub
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!lesson) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>Lesson Not Found</Text>
          <Text style={[styles.errorDescription, { color: theme.textSecondary }]}>
            The lesson you're looking for could not be found. It may have been removed or the link may be incorrect.
          </Text>
          <TouchableOpacity
            style={[styles.backToHubButton, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
          >
            <Ionicons name="library-outline" size={20} color={theme.onPrimary} />
            <Text style={[styles.backToHubText, { color: theme.onPrimary }]}>
              Back to Lessons Hub
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {lesson.title}
        </Text>
        <TouchableOpacity 
          onPress={handleBookmarkToggle}
          style={styles.bookmarkButton}
        >
          <Ionicons 
            name={isBookmarked ? "bookmark" : "bookmark-outline"} 
            size={24} 
            color={isBookmarked ? theme.primary : theme.text} 
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Lesson Header */}
        <View style={styles.lessonHeader}>
          <Text style={[styles.lessonTitle, { color: theme.text }]}>
            {lesson.title}
          </Text>
          <Text style={[styles.lessonDescription, { color: theme.textSecondary }]}>
            {lesson.description}
          </Text>
        </View>

        {/* Lesson Meta Info */}
        <View style={[styles.metaContainer, { backgroundColor: theme.cardBackground }]}>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={20} color={theme.primary} />
              <Text style={[styles.metaText, { color: theme.text }]}>
                {lesson.estimated_duration || 30} min
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="school-outline" size={20} color={theme.primary} />
              <Text style={[styles.metaText, { color: theme.text }]}>
                {lesson.skill_level?.name || 'Beginner'}
              </Text>
            </View>
          </View>
          
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={20} color={theme.primary} />
              <Text style={[styles.metaText, { color: theme.text }]}>
                Ages {lesson.age_range?.min_age || 3}-{lesson.age_range?.max_age || 6}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="star" size={20} color={"#FFD700"} />
              <Text style={[styles.metaText, { color: theme.text }]}>
                {(lesson.rating || 4.5).toFixed(1)} ({lesson.review_count || 0})
              </Text>
            </View>
          </View>
        </View>

        {/* Progress Bar */}
        {progress && (
          <View style={[styles.progressContainer, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.progressTitle, { color: theme.text }]}>Your Progress</Text>
            <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
              <View 
                style={[
                  styles.progressFill, 
                  { backgroundColor: theme.primary, width: `${progress.progress_percentage || 0}%` }
                ]} 
              />
            </View>
            <Text style={[styles.progressText, { color: theme.textSecondary }]}>
              {progress.progress_percentage || 0}% complete • Status: {(progress.status || 'not_started').replace('_', ' ')}
            </Text>
          </View>
        )}

        {/* AI-Generated Lesson Content */}
        {lesson.is_ai_generated && lesson.content && (
          <View style={[styles.section, { backgroundColor: theme.cardBackground }]}>
            <View style={styles.aiLabelContainer}>
              <Ionicons name="sparkles" size={18} color="#FF6B6B" />
              <Text style={[styles.sectionTitle, { color: theme.text, marginLeft: 8 }]}>
                AI-Generated Lesson Plan
              </Text>
            </View>
            <View style={styles.contentContainer}>
              {(() => {
                // Safe content rendering - ensure content is a string
                const contentString = typeof lesson.content === 'string' 
                  ? lesson.content 
                  : (typeof lesson.content === 'object' ? JSON.stringify(lesson.content, null, 2) : String(lesson.content || ''));
                
                if (!contentString || !contentString.trim()) {
                  return (
                    <Text style={[styles.contentText, { color: theme.textSecondary }]}>
                      No content available
                    </Text>
                  );
                }
                
                if (Markdown) {
                  try {
                    return (
                      <Markdown style={markdownStyles}>
                        {contentString}
                      </Markdown>
                    );
                  } catch (markdownError) {
                    console.warn('[LessonDetail] Markdown render error:', markdownError);
                    return (
                      <Text style={[styles.contentText, { color: theme.text }]}>
                        {contentString}
                      </Text>
                    );
                  }
                }
                
                return (
                  <Text style={[styles.contentText, { color: theme.text }]}>
                    {contentString}
                  </Text>
                );
              })()}
            </View>
          </View>
        )}

        {/* Regular Lesson Content (non-AI) */}
        {!lesson.is_ai_generated && lesson.content && (
          <View style={[styles.section, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Lesson Content
            </Text>
            <View style={styles.contentContainer}>
              {(() => {
                // Safe content rendering - ensure content is a string
                const contentString = typeof lesson.content === 'string' 
                  ? lesson.content 
                  : (typeof lesson.content === 'object' ? JSON.stringify(lesson.content, null, 2) : String(lesson.content || ''));
                
                if (!contentString || !contentString.trim()) {
                  return (
                    <Text style={[styles.contentText, { color: theme.textSecondary }]}>
                      No content available
                    </Text>
                  );
                }
                
                if (Markdown) {
                  try {
                    return (
                      <Markdown style={markdownStyles}>
                        {contentString}
                      </Markdown>
                    );
                  } catch (markdownError) {
                    console.warn('[LessonDetail] Markdown render error:', markdownError);
                    return (
                      <Text style={[styles.contentText, { color: theme.text }]}>
                        {contentString}
                      </Text>
                    );
                  }
                }
                
                return (
                  <Text style={[styles.contentText, { color: theme.text }]}>
                    {contentString}
                  </Text>
                );
              })()}
            </View>
          </View>
        )}

        {/* Learning Objectives */}
        {lesson.learning_objectives && lesson.learning_objectives.length > 0 && (
          <View style={[styles.section, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Learning Objectives</Text>
            {lesson.learning_objectives.map((objective, index) => {
              // Handle both string and object formats (database may store as array of strings)
              const objectiveText = typeof objective === 'string' 
                ? objective 
                : (objective?.description || (objective as any)?.text || String(objective));
              return (
                <View key={index} style={styles.objectiveItem}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={theme.primary} />
                  <Text style={[styles.objectiveText, { color: theme.textSecondary }]}>
                    {objectiveText}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Prerequisites */}
        {lesson.prerequisites && lesson.prerequisites.length > 0 && (
          <View style={[styles.section, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Prerequisites</Text>
            {lesson.prerequisites.map((prereq, index) => (
              <View key={index} style={styles.prereqItem}>
                <Ionicons name="information-circle-outline" size={20} color={theme.textSecondary} />
                <Text style={[styles.prereqText, { color: theme.textSecondary }]}>
                  {prereq}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          {!progress || progress.status === 'not_started' ? (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={handleStartLesson}
            >
              <Ionicons name="play-circle" size={24} color={theme.onPrimary} />
              <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
                Start Lesson
              </Text>
            </TouchableOpacity>
          ) : progress.status === 'in_progress' ? (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, { backgroundColor: theme.cardBackground, borderColor: theme.primary }]}
                onPress={handleStartLesson}
              >
                <Ionicons name="refresh" size={20} color={theme.primary} />
                <Text style={[styles.secondaryButtonText, { color: theme.primary }]}>
                  Continue
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: theme.primary, flex: 1 }]}
                onPress={handleCompleteLesson}
              >
                <Ionicons name="checkmark-circle" size={20} color={theme.onPrimary} />
                <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
                  Mark Complete
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.completedContainer, { backgroundColor: theme.success + '20', borderColor: theme.success }]}>
              <Ionicons name="checkmark-circle" size={24} color={theme.success} />
              <Text style={[styles.completedText, { color: theme.success }]}>
                Lesson Completed!
              </Text>
            </View>
          )}
        </View>
        
        {/* Bottom Safe Area Spacing */}
        <View style={{ height: Math.max(32, insets.bottom + 16) }} />
      </ScrollView>
      <AlertModal {...alertProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  bookmarkButton: {
    padding: 8,
    marginLeft: 12,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  lessonHeader: {
    marginBottom: 20,
  },
  lessonTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    lineHeight: 34,
  },
  lessonDescription: {
    fontSize: 16,
    lineHeight: 24,
  },
  metaContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  metaText: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
  },
  section: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  aiLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  contentContainer: {
    paddingTop: 8,
  },
  contentText: {
    fontSize: 15,
    lineHeight: 24,
  },
  objectiveItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  objectiveText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  prereqItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  prereqText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  actionContainer: {
    marginBottom: 32,
    marginTop: 8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  completedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    gap: 12,
  },
  completedText: {
    fontSize: 16,
    fontWeight: '600',
  },
  backToHubButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  backToHubText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
