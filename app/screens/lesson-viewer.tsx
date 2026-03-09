/**
 * Lesson Viewer Screen
 * 
 * Displays AI-generated lesson plans from Dash AI Assistant
 * Supports preview, PDF export, and assignment for teachers and principals
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { EducationalPDFService } from '@/lib/services/EducationalPDFService';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const TAG = 'LessonViewer';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Helper to parse content - handles both JSON objects and markdown text
interface LessonContent {
  overview?: string;
  lesson_flow?: Array<{
    phase: string;
    duration: string;
    title: string;
    instructions?: string;
    teacher_script?: string;
    activities?: any[];
    [key: string]: any;
  }>;
  interactive_activities?: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  differentiation?: {
    support?: string;
    extension?: string;
  } | string;
  songs?: Array<{ title: string; lyrics: string }>;
  [key: string]: any;
}

const parseContent = (content: any): LessonContent | null => {
  if (!content) return null;
  
  // If it's already an object, return it
  if (typeof content === 'object' && content !== null) {
    return content as LessonContent;
  }
  
  // If it's a string, try to parse as JSON
  if (typeof content === 'string') {
    try {
      return JSON.parse(content) as LessonContent;
    } catch {
      // Not JSON, return null (markdown handling would go here)
      return null;
    }
  }
  
  return null;
};

// Extract activities from JSON content
const extractActivitiesFromContent = (content: LessonContent | null): Array<{
  name: string;
  duration: string;
  description: string;
  materials?: string[];
}> => {
  if (!content) return [];
  
  const activities: Array<{ name: string; duration: string; description: string; materials?: string[] }> = [];
  
  // Extract from lesson_flow
  if (content.lesson_flow && Array.isArray(content.lesson_flow)) {
    content.lesson_flow.forEach((phase) => {
      // Main phase as activity
      const description = phase.instructions || phase.teacher_script || '';
      if (phase.title && description) {
        activities.push({
          name: phase.title,
          duration: phase.duration || '10 minutes',
          description: description,
        });
      }
      
      // Nested activities within a phase
      if (phase.activities && Array.isArray(phase.activities)) {
        phase.activities.forEach((subActivity: any, idx: number) => {
          const subDesc = typeof subActivity === 'string' 
            ? subActivity 
            : subActivity.action || subActivity.description || subActivity.instructions || JSON.stringify(subActivity);
          activities.push({
            name: subActivity.name || subActivity.vowel || subActivity.color || `Activity ${idx + 1}`,
            duration: subActivity.duration || '5 minutes',
            description: subDesc,
          });
        });
      }
    });
  }
  
  // Also include interactive_activities
  if (content.interactive_activities && Array.isArray(content.interactive_activities)) {
    content.interactive_activities.forEach((ia) => {
      activities.push({
        name: `🎮 ${ia.name}`,
        duration: '5 minutes',
        description: `[${ia.type}] ${ia.description}`,
      });
    });
  }
  
  return activities.length > 0 ? activities : [{
    name: 'Learning Activity',
    duration: '15 minutes',
    description: content.overview || 'Engaging educational activity',
  }];
};

// Extract differentiation from JSON content
const extractDifferentiationFromContent = (content: LessonContent | null): string => {
  if (!content) return 'Provide support and extensions as needed for individual learners.';
  
  if (content.differentiation) {
    if (typeof content.differentiation === 'string') {
      return content.differentiation;
    }
    const diff = content.differentiation;
    const parts: string[] = [];
    if (diff.support) parts.push(`Support: ${diff.support}`);
    if (diff.extension) parts.push(`Extension: ${diff.extension}`);
    return parts.join('\n') || 'Provide support and extensions as needed for individual learners.';
  }
  
  return 'Provide support and extensions as needed for individual learners.';
};

// Extract resources from content or materials_needed
const extractResourcesFromContent = (content: LessonContent | null, materialsNeeded?: string[]): string[] => {
  if (materialsNeeded && Array.isArray(materialsNeeded) && materialsNeeded.length > 0) {
    return materialsNeeded;
  }
  
  if (content?.materials || content?.resources) {
    const items = content.materials || content.resources;
    if (Array.isArray(items)) return items;
  }
  
  return ['Basic classroom materials'];
};

// Legacy markdown extraction for older content
const extractSection = (content: string, sectionTitle: string): string[] => {
  if (typeof content !== 'string') return [];
  
  const regex = new RegExp(`### ${sectionTitle}[\\s\\S]*?(?=###|$)`, 'i');
  const match = content.match(regex);
  if (!match) return [];
  
  const section = match[0];
  const lines = section.split('\n')
    .slice(1)
    .filter(line => line.trim())
    .map(line => line.replace(/^[-•*]\s*/, '').trim())
    .filter(line => line.length > 0);
  
  return lines;
};

interface LessonPlan {
  id: string;
  title: string;
  subject: string;
  grade: string;
  duration: string;
  objectives: string[];
  activities: Array<{
    name: string;
    duration: string;
    description: string;
    materials?: string[];
  }>;
  resources: string[];
  assessments: string[];
  differentiation: string;
  extensions?: string[];
  createdBy: string;
  createdAt: string;
}

export default function LessonViewer() {
  const { theme, isDark } = useTheme();
  const { profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  
  // Check if user is principal or teacher (can assign lessons)
  const isPrincipal = profile?.role === 'principal' || profile?.role === 'principal_admin';
  const isTeacher = profile?.role === 'teacher';
  const canAssign = isPrincipal || isTeacher;

  useEffect(() => {
    loadLessonData();
  }, [params.lessonId]);

  const loadLessonData = async () => {
    try {
      if (!params.lessonId) {
        showAlert({ title: 'Error', message: 'No lesson ID provided', type: 'error' });
        router.back();
        return;
      }

      // First try to load lesson from database
      try {
        const { data: lessonData, error } = await assertSupabase()
          .from('lessons')
          .select('*')
          .eq('id', params.lessonId)
          .single();

        if (error) {
          console.warn('[LessonViewer] Database query error:', error);
          throw error;
        }

        if (lessonData) {
          // Parse the JSON content
          const parsedContent = parseContent(lessonData.content);
          
          // Get objectives - prefer top-level array, fallback to content
          let objectives: string[] = [];
          if (lessonData.objectives && Array.isArray(lessonData.objectives) && lessonData.objectives.length > 0) {
            objectives = lessonData.objectives;
          } else if (parsedContent) {
            objectives = ['Engage in learning activities', 'Develop key skills'];
          } else {
            objectives = ['Explore and learn through play'];
          }
          
          // Get activities from parsed content
          const activities = extractActivitiesFromContent(parsedContent);
          
          // Get resources - prefer materials_needed column
          const resources = extractResourcesFromContent(parsedContent, lessonData.materials_needed);
          
          // Get differentiation
          const differentiation = extractDifferentiationFromContent(parsedContent);
          
          // Convert database lesson to LessonPlan format
          const lessonPlan: LessonPlan = {
            id: lessonData.id,
            title: lessonData.title || 'Untitled Lesson',
            subject: params.subject as string || lessonData.subject || 'General Education',
            grade: params.grade as string || lessonData.age_group || 'Preschool', 
            duration: `${lessonData.duration_minutes || 30} minutes`,
            objectives: objectives,
            activities: activities.length > 0 ? activities : [{
              name: 'Learning Activity',
              duration: '15 minutes',
              description: lessonData.description || 'Engaging educational activity',
            }],
            resources: resources,
            assessments: ['Observation during activities', 'Informal assessment through participation', 'Portfolio collection of student work'],
            differentiation: differentiation,
            extensions: [],
            createdBy: 'DashAI',
            createdAt: lessonData.created_at
          };
          
          logger.debug(TAG, 'Loaded lesson:', lessonPlan.title, 'with', lessonPlan.activities.length, 'activities');
          
          setLesson(lessonPlan);
          setLoading(false);
          return;
        } else {
          console.warn('[LessonViewer] No lesson data found in database');
        }
      } catch (error) {
        console.error('[LessonViewer] Failed to load from database:', error);
        // Fall through to other methods
      }

      // Try to get lesson from Dash memory as fallback
      let dash;
      try {
        const module = await import('@/services/dash-ai/DashAICompat');
        const DashClass = (module as any).DashAIAssistant || (module as any).default;
        if (DashClass && DashClass.getInstance) {
          dash = DashClass.getInstance();
          await dash.initialize();
          
          const memoryItems = await dash.getAllMemoryItems();
          const lessonMemory = memoryItems.find(item => 
            item.key === `generated_lesson_${params.lessonId}`
          );

          if (lessonMemory && lessonMemory.value) {
            setLesson(lessonMemory.value as LessonPlan);
            setLoading(false);
            return;
          }
        }
      } catch (error) {
        console.error('[LessonViewer] Failed to get DashAI instance:', error);
      }
      
      {
        // Fallback: create a demo lesson
        setLesson({
          id: params.lessonId as string,
          title: 'Learning Adventure: Colors and Shapes',
          subject: params.subject as string || 'General Education',
          grade: params.grade as string || 'Preschool',
          duration: '45 minutes',
          objectives: [
            'Identify basic colors and shapes in the environment',
            'Develop fine motor skills through hands-on activities',
            'Practice vocabulary related to colors and shapes',
            'Work collaboratively in small groups'
          ],
          activities: [
            {
              name: 'Shape Hunt',
              duration: '15 minutes',
              description: 'Students search the classroom for different shapes and sort them by type',
              materials: ['Shape cards', 'Collection baskets', 'Sorting mats']
            },
            {
              name: 'Color Mixing Magic',
              duration: '20 minutes', 
              description: 'Hands-on exploration of primary and secondary colors using safe paints',
              materials: ['Washable paints', 'Paper plates', 'Brushes', 'Paper towels']
            },
            {
              name: 'Shape Story Time',
              duration: '10 minutes',
              description: 'Interactive story featuring shape characters and their adventures'
            }
          ],
          resources: [
            'Shape and color picture books',
            'Digital shape games on tablet',
            'Art supplies for creative expression',
            'Background music for activities'
          ],
          assessments: [
            'Observation checklist for shape identification',
            'Portfolio collection of student artwork',
            'Informal questioning during activities',
            'Peer interaction assessment'
          ],
          differentiation: 'Provide visual supports for visual learners, kinesthetic activities for active learners, and verbal descriptions for auditory learners',
          extensions: [
            'Create a shapes book to take home',
            'Design patterns using shapes and colors',
            'Explore shapes in nature during outdoor time'
          ],
          createdBy: 'DashAI',
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to load lesson:', error);
      showAlert({ title: 'Error', message: 'Failed to load lesson plan', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!lesson) return;

    try {
      setGenerating(true);
      const pdfService = EducationalPDFService;
      
      const pdfResult = await pdfService.generateLessonPlanPDF({
        title: lesson.title,
        subject: lesson.subject,
        grade: lesson.grade,
        duration: lesson.duration,
        objectives: lesson.objectives,
        activities: lesson.activities.map(activity => ({
          name: activity.name,
          duration: activity.duration,
          description: activity.description,
          materials: activity.materials || []
        })),
        resources: lesson.resources,
        assessments: lesson.assessments,
        differentiation: lesson.differentiation,
        extensions: lesson.extensions || []
      });

      if (pdfResult.success && pdfResult.filePath) {
        showAlert({
          title: 'PDF Generated!',
          message: 'Your lesson plan PDF is ready to download.',
          type: 'success',
          buttons: [
            { text: 'View', onPress: () => sharePDF(pdfResult.filePath!) },
            { text: 'OK' },
          ],
        });
      } else {
        showAlert({ title: 'Error', message: pdfResult.error || 'Failed to generate PDF', type: 'error' });
      }
    } catch (error) {
      console.error('PDF generation failed:', error);
      showAlert({ title: 'Error', message: 'Failed to generate PDF', type: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const sharePDF = async (filePath: string) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(filePath);
      } else {
        showAlert({ title: 'Share Not Available', message: 'Sharing is not available on this device', type: 'warning' });
      }
    } catch (error) {
      console.error('Failed to share PDF:', error);
      showAlert({ title: 'Error', message: 'Failed to share PDF', type: 'error' });
    }
  };

  const shareLesson = async () => {
    if (!lesson) return;

    try {
      const shareContent = `${lesson.title}\n\nSubject: ${lesson.subject}\nGrade: ${lesson.grade}\nDuration: ${lesson.duration}\n\nObjectives:\n${lesson.objectives.map(obj => `• ${obj}`).join('\n')}\n\nGenerated by EduDash Pro AI Assistant`;
      
      await Share.share({
        message: shareContent,
        title: lesson.title
      });
    } catch (error) {
      console.error('Failed to share lesson:', error);
    }
  };

  const handleAssignLesson = () => {
    if (!lesson || !params.lessonId) return;
    router.push({
      pathname: '/screens/assign-lesson',
      params: { lessonId: params.lessonId as string },
    });
  };

  const handleEditLesson = () => {
    if (!lesson || !params.lessonId) return;
    router.push({
      pathname: '/screens/lesson-edit',
      params: { lessonId: params.lessonId as string },
    });
  };

  const handleShowActions = () => {
    if (!lesson) return;

    const actions: any[] = [
      {
        text: '📤 Assign to Students',
        onPress: handleAssignLesson,
      },
    ];

    if (canAssign) {
      actions.push({
        text: '✏️ Edit Lesson',
        onPress: handleEditLesson,
      });
    }

    actions.push(
      {
        text: '📄 Generate PDF',
        onPress: generatePDF,
      },
      {
        text: '📱 Share',
        onPress: shareLesson,
      },
      { text: 'Cancel', style: 'cancel' }
    );

    showAlert({
      title: 'Lesson Actions',
      message: `${lesson.title}`,
      type: 'info',
      buttons: actions,
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            Loading lesson plan...
          </Text>
        </View>
      </View>
    );
  }

  if (!lesson) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="document-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.errorText, { color: theme.text }]}>
            Lesson plan not found
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.backButtonText, { color: theme.onPrimary }]}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={styles.backIconButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        
        <View style={styles.headerTitle}>
          <Text style={[styles.headerTitleText, { color: theme.text }]} numberOfLines={1}>
            Lesson Plan
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            {lesson.subject} • {lesson.grade}
          </Text>
        </View>

        <View style={styles.headerActions}>
          {/* Actions menu button */}
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={handleShowActions}
          >
            <Ionicons name="ellipsis-vertical" size={20} color={theme.text} />
          </TouchableOpacity>
          
          {/* Share button */}
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={shareLesson}
          >
            <Ionicons name="share-outline" size={20} color={theme.text} />
          </TouchableOpacity>
          
          {/* Assign button - visible for teachers/principals */}
          {canAssign && (
            <TouchableOpacity
              style={[styles.assignActionButton, { backgroundColor: '#10B981' }]}
              onPress={handleAssignLesson}
            >
              <Ionicons name="paper-plane" size={16} color="#fff" />
              <Text style={styles.assignActionButtonText}>Assign</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={[styles.pdfButton, { backgroundColor: theme.primary }]}
            onPress={generatePDF}
            disabled={generating}
          >
            {generating ? (
              <EduDashSpinner size="small" color={theme.onPrimary} />
            ) : (
              <>
                <Ionicons name="document-text" size={16} color={theme.onPrimary} />
                <Text style={[styles.pdfButtonText, { color: theme.onPrimary }]}>PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title Section */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.lessonTitle, { color: theme.text }]}>
            {lesson.title}
          </Text>
          <View style={styles.metadataRow}>
            <View style={styles.metadataItem}>
              <Ionicons name="time-outline" size={16} color={theme.accent} />
              <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
                {lesson.duration}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Ionicons name="person-outline" size={16} color={theme.accent} />
              <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
                {lesson.createdBy}
              </Text>
            </View>
          </View>
        </View>

        {/* Learning Objectives */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            <Ionicons name="flag-outline" size={18} color={theme.primary} /> Learning Objectives
          </Text>
          {lesson.objectives.map((objective, index) => (
            <View key={index} style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.accent }]}>•</Text>
              <Text style={[styles.listItemText, { color: theme.text }]}>
                {objective}
              </Text>
            </View>
          ))}
        </View>

        {/* Activities */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            <Ionicons name="play-outline" size={18} color={theme.primary} /> Activities
          </Text>
          {lesson.activities.map((activity, index) => (
            <View key={index} style={[styles.activityCard, { borderLeftColor: theme.accent }]}>
              <View style={styles.activityHeader}>
                <Text style={[styles.activityName, { color: theme.text }]}>
                  {activity.name}
                </Text>
                <Text style={[styles.activityDuration, { color: theme.textSecondary }]}>
                  {activity.duration}
                </Text>
              </View>
              <Text style={[styles.activityDescription, { color: theme.textSecondary }]}>
                {activity.description}
              </Text>
              {activity.materials && activity.materials.length > 0 && (
                <View style={styles.materialsContainer}>
                  <Text style={[styles.materialsTitle, { color: theme.accent }]}>Materials:</Text>
                  <Text style={[styles.materialsText, { color: theme.textSecondary }]}>
                    {activity.materials.join(', ')}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Resources */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            <Ionicons name="library-outline" size={18} color={theme.primary} /> Resources
          </Text>
          {lesson.resources.map((resource, index) => (
            <View key={index} style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.accent }]}>•</Text>
              <Text style={[styles.listItemText, { color: theme.text }]}>
                {resource}
              </Text>
            </View>
          ))}
        </View>

        {/* Assessment */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={theme.primary} /> Assessment
          </Text>
          {lesson.assessments.map((assessment, index) => (
            <View key={index} style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.accent }]}>•</Text>
              <Text style={[styles.listItemText, { color: theme.text }]}>
                {assessment}
              </Text>
            </View>
          ))}
        </View>

        {/* Differentiation */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            <Ionicons name="people-outline" size={18} color={theme.primary} /> Differentiation
          </Text>
          <Text style={[styles.differentiationText, { color: theme.text }]}>
            {lesson.differentiation}
          </Text>
        </View>

        {/* Extensions */}
        {lesson.extensions && lesson.extensions.length > 0 && (
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              <Ionicons name="trending-up-outline" size={18} color={theme.primary} /> Extensions
            </Text>
            {lesson.extensions.map((extension, index) => (
              <View key={index} style={styles.listItem}>
                <Text style={[styles.bullet, { color: theme.accent }]}>•</Text>
                <Text style={[styles.listItemText, { color: theme.text }]}>
                  {extension}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.bottomSpacing, { height: Math.max(32, insets.bottom + 16) }]} />
      </ScrollView>

      <AlertModal {...alertProps} />
    </View>
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
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backIconButton: {
    padding: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    padding: 8,
    borderRadius: 8,
  },
  assignActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  assignActionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  pdfButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
  },
  lessonTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    lineHeight: 32,
  },
  metadataRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metadataText: {
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 16,
    marginRight: 8,
    marginTop: 2,
  },
  listItemText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
  },
  activityCard: {
    padding: 12,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activityName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  activityDuration: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  activityDescription: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 8,
  },
  materialsContainer: {
    marginTop: 4,
  },
  materialsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  materialsText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  differentiationText: {
    fontSize: 16,
    lineHeight: 22,
  },
  bottomSpacing: {
    height: 32,
  },
});