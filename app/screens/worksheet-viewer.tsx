/**
 * Worksheet Viewer Screen
 * 
 * Displays AI-generated worksheets from Dash AI Assistant
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Share, Dimensions } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { EducationalPDFService } from '@/lib/services/EducationalPDFService';
import * as Sharing from 'expo-sharing';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
const { width } = Dimensions.get('window');

interface WorksheetData {
  id?: string;
  type: 'math' | 'reading' | 'activity';
  title: string;
  ageGroup: string;
  difficulty: string;
  problems?: Array<{
    question: string;
    answer: number | string;
    operation?: string;
    difficulty?: string;
  }>;
  activities?: Array<{
    title: string;
    description: string;
    type: string;
    instructions: string;
  }>;
  includeHints?: boolean;
  includeImages?: boolean;
  topic?: string;
  activityType?: string;
  metadata?: {
    generatedBy: string;
    generatedAt: string;
    estimatedTime: string;
    skills?: string[];
  };
}

export default function WorksheetViewer() {
  const { theme, isDark } = useTheme();
  const params = useLocalSearchParams();
  const { showAlert, alertProps } = useAlertModal();
  const [worksheet, setWorksheet] = useState<WorksheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadWorksheetData();
  }, [params.worksheetId]);

  const loadWorksheetData = async () => {
    try {
      if (!params.worksheetId) {
        showAlert({ title: 'Error', message: 'No worksheet ID provided', type: 'error' });
        router.back();
        return;
      }

      let dash: any;
      try {
        const { getAssistant } = await import('@/services/core/getAssistant');
        dash = await getAssistant();
        await dash.initialize?.();
      } catch (error) {
        console.error('[WorksheetViewer] Failed to get DashAI instance:', error);
        // Continue with fallback worksheet data
        dash = null;
      }
      
      // Try to get worksheet from Dash memory
      if (dash) {
        try {
          const memoryItems = (dash as any)?.getMemoryItems ? (dash as any).getMemoryItems() : [];
          const worksheetMemory = (memoryItems || []).find((item: any) => 
            item.key === `generated_worksheet_${params.worksheetId}`
          );

          if (worksheetMemory && worksheetMemory.value) {
            setWorksheet(worksheetMemory.value as WorksheetData);
            setLoading(false);
            return;
          }
        } catch (error) {
          console.error('[WorksheetViewer] Failed to load from memory:', error);
        }
      }
      
      // Create a demo worksheet based on parameters
      const worksheetType = (params.type as string) || 'math';
      const ageGroup = (params.ageGroup as string) || '5-6 years';
      const difficulty = (params.difficulty as string) || 'Medium';
      
      if (worksheetType === 'math') {
        setWorksheet(createDemoMathWorksheet(ageGroup, difficulty));
      } else if (worksheetType === 'reading') {
        setWorksheet(createDemoReadingWorksheet(ageGroup, difficulty));
      } else {
        setWorksheet(createDemoActivityWorksheet(ageGroup, difficulty));
      }
    } catch (error) {
      console.error('Failed to load worksheet:', error);
      showAlert({ title: 'Error', message: 'Failed to load worksheet', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const createDemoMathWorksheet = (ageGroup: string, difficulty: string): WorksheetData => {
    const problems = [];
    const count = difficulty === 'Easy' ? 10 : difficulty === 'Hard' ? 20 : 15;
    
    for (let i = 0; i < count; i++) {
      const num1 = Math.floor(Math.random() * (difficulty === 'Easy' ? 10 : difficulty === 'Hard' ? 50 : 25)) + 1;
      const num2 = Math.floor(Math.random() * (difficulty === 'Easy' ? 10 : difficulty === 'Hard' ? 50 : 25)) + 1;
      const operations = ['addition', 'subtraction'];
      const operation = operations[Math.floor(Math.random() * operations.length)];
      
      if (operation === 'addition') {
        problems.push({
          question: `${num1} + ${num2} = ___`,
          answer: num1 + num2,
          operation: 'addition'
        });
      } else {
        const larger = Math.max(num1, num2);
        const smaller = Math.min(num1, num2);
        problems.push({
          question: `${larger} - ${smaller} = ___`,
          answer: larger - smaller,
          operation: 'subtraction'
        });
      }
    }

    return {
      id: params.worksheetId as string,
      type: 'math',
      title: `Math Practice Worksheet - ${difficulty}`,
      ageGroup,
      difficulty,
      problems,
      includeHints: true,
      metadata: {
        generatedBy: 'DashAI',
        generatedAt: new Date().toISOString(),
        estimatedTime: `${Math.ceil(count / 3)} minutes`,
        skills: ['Addition', 'Subtraction', 'Number Recognition']
      }
    };
  };

  const createDemoReadingWorksheet = (ageGroup: string, difficulty: string): WorksheetData => {
    const activities = [
      {
        title: 'Letter Recognition',
        description: 'Circle all the letters that match',
        type: 'recognition',
        instructions: 'Look at each letter carefully and circle the ones that match the example.'
      },
      {
        title: 'Word Building',
        description: 'Use the letters to build simple words',
        type: 'construction',
        instructions: 'Put the letters in order to make the word shown in the picture.'
      },
      {
        title: 'Reading Comprehension',
        description: 'Read the short story and answer questions',
        type: 'comprehension',
        instructions: 'Read carefully and choose the best answer for each question.'
      }
    ];

    return {
      id: params.worksheetId as string,
      type: 'reading',
      title: `Reading Activities - ${difficulty}`,
      ageGroup,
      difficulty,
      activities,
      includeImages: true,
      topic: 'General Reading',
      metadata: {
        generatedBy: 'DashAI',
        generatedAt: new Date().toISOString(),
        estimatedTime: '20-25 minutes',
        skills: ['Reading Comprehension', 'Vocabulary', 'Phonics']
      }
    };
  };

  const createDemoActivityWorksheet = (ageGroup: string, difficulty: string): WorksheetData => {
    const activities = [
      {
        title: 'Creative Drawing',
        description: 'Draw your favorite animal and color it',
        type: 'creative',
        instructions: 'Use your imagination to draw and color your favorite animal.'
      },
      {
        title: 'Pattern Recognition',
        description: 'Complete the pattern by adding the missing shapes',
        type: 'cognitive',
        instructions: 'Look at the pattern and draw what comes next.'
      },
      {
        title: 'Sorting Activity',
        description: 'Sort the items into the correct groups',
        type: 'cognitive',
        instructions: 'Put each item in the group where it belongs.'
      }
    ];

    return {
      id: params.worksheetId as string,
      type: 'activity',
      title: `Learning Activities - ${difficulty}`,
      ageGroup,
      difficulty,
      activities,
      activityType: 'creative',
      topic: 'General Learning',
      metadata: {
        generatedBy: 'DashAI',
        generatedAt: new Date().toISOString(),
        estimatedTime: '25-30 minutes',
        skills: ['Creativity', 'Problem Solving', 'Fine Motor Skills']
      }
    };
  };

  const generatePDF = async () => {
    if (!worksheet) return;

    try {
      setGenerating(true);
      const pdfService = EducationalPDFService;
      
      let pdfResult;
      
      if (worksheet.type === 'math') {
        pdfResult = await pdfService.generateMathWorksheetPDF({
          title: worksheet.title,
          ageGroup: worksheet.ageGroup,
          difficulty: worksheet.difficulty,
          problems: worksheet.problems?.map(p => ({
            question: p.question,
            answer: p.answer as number,
            operation: p.operation || 'addition'
          })) || [],
          includeAnswerKey: true
        });
      } else {
        // For reading and activity worksheets, use a general worksheet PDF generator
        pdfResult = await pdfService.generateWorksheetPDF({
          title: worksheet.title,
          type: worksheet.type,
          ageGroup: worksheet.ageGroup,
          // activities: worksheet.activities || [], // TODO: Add activities support to PDF service
          contentSections: worksheet.activities?.map(a => ({
            title: a.title,
            content: a.description || a.instructions
          })) || [],
        });
      }

      if (pdfResult.success && pdfResult.filePath) {
        showAlert({
          title: 'PDF Generated!',
          message: 'Your worksheet PDF is ready to download.',
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

  const shareWorksheet = async () => {
    if (!worksheet) return;

    try {
      const problemCount = worksheet.problems?.length || worksheet.activities?.length || 0;
      const shareContent = `${worksheet.title}\n\nAge Group: ${worksheet.ageGroup}\nDifficulty: ${worksheet.difficulty}\n${worksheet.type === 'math' ? 'Problems' : 'Activities'}: ${problemCount}\n\nGenerated by EduDash Pro AI Assistant`;
      
      await Share.share({
        message: shareContent,
        title: worksheet.title
      });
    } catch (error) {
      console.error('Failed to share worksheet:', error);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            Loading worksheet...
          </Text>
        </View>
      </View>
    );
  }

  if (!worksheet) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="document-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.errorText, { color: theme.text }]}>
            Worksheet not found
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
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
            Worksheet
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            {worksheet.type.charAt(0).toUpperCase() + worksheet.type.slice(1)} • {worksheet.ageGroup}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={shareWorksheet}
          >
            <Ionicons name="share-outline" size={20} color={theme.text} />
          </TouchableOpacity>
          
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
          <Text style={[styles.worksheetTitle, { color: theme.text }]}>
            {worksheet.title}
          </Text>
          <View style={styles.metadataRow}>
            <View style={styles.metadataItem}>
              <Ionicons name="time-outline" size={16} color={theme.accent} />
              <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
                {worksheet.metadata?.estimatedTime || '15-20 minutes'}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Ionicons name="layers-outline" size={16} color={theme.accent} />
              <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
                {worksheet.difficulty}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Ionicons name="people-outline" size={16} color={theme.accent} />
              <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
                {worksheet.ageGroup}
              </Text>
            </View>
          </View>
        </View>

        {/* Skills Section */}
        {worksheet.metadata?.skills && (
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              <Ionicons name="star-outline" size={18} color={theme.primary} /> Skills Practiced
            </Text>
            <View style={styles.skillsContainer}>
              {worksheet.metadata.skills.map((skill, index) => (
                <View key={index} style={[styles.skillTag, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
                  <Text style={[styles.skillTagText, { color: theme.primary }]}>
                    {skill}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Math Problems */}
        {worksheet.type === 'math' && worksheet.problems && (
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              <Ionicons name="calculator-outline" size={18} color={theme.primary} /> Math Problems ({worksheet.problems.length})
            </Text>
            <View style={styles.problemsGrid}>
              {worksheet.problems.map((problem, index) => (
                <View key={index} style={[styles.problemCard, { borderColor: theme.border }]}>
                  <Text style={[styles.problemNumber, { color: theme.textSecondary }]}>
                    {index + 1}.
                  </Text>
                  <Text style={[styles.problemText, { color: theme.text }]}>
                    {problem.question}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Reading/Activity Activities */}
        {(worksheet.type === 'reading' || worksheet.type === 'activity') && worksheet.activities && (
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              <Ionicons name="book-outline" size={18} color={theme.primary} /> Activities ({worksheet.activities.length})
            </Text>
            {worksheet.activities.map((activity, index) => (
              <View key={index} style={[styles.activityCard, { borderLeftColor: theme.accent }]}>
                <Text style={[styles.activityTitle, { color: theme.text }]}>
                  {index + 1}. {activity.title}
                </Text>
                <Text style={[styles.activityDescription, { color: theme.textSecondary }]}>
                  {activity.description}
                </Text>
                <Text style={[styles.activityInstructions, { color: theme.text }]}>
                  Instructions: {activity.instructions}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Quick Actions */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            <Ionicons name="flash-outline" size={18} color={theme.primary} /> Quick Actions
          </Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
              onPress={generatePDF}
              disabled={generating}
            >
              <Ionicons name="download-outline" size={24} color={theme.primary} />
              <Text style={[styles.actionButtonText, { color: theme.primary }]}>
                {generating ? 'Generating...' : 'Download PDF'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.successLight, borderColor: theme.success }]}
              onPress={shareWorksheet}
            >
              <Ionicons name="share-outline" size={24} color={theme.success} />
              <Text style={[styles.actionButtonText, { color: theme.success }]}>
                Share
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
              onPress={() => router.push('/screens/worksheet-demo')}
            >
              <Ionicons name="add-outline" size={24} color={theme.accent} />
              <Text style={[styles.actionButtonText, { color: theme.accent }]}>
                Create More
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomSpacing} />
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
    paddingTop: 48,
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
  worksheetTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    lineHeight: 32,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  skillTagText: {
    fontSize: 14,
    fontWeight: '500',
  },
  problemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  problemCard: {
    width: (width - 64) / 2 - 6,
    padding: 16,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  problemNumber: {
    fontSize: 14,
    marginRight: 8,
    minWidth: 20,
  },
  problemText: {
    fontSize: 16,
    flex: 1,
    fontFamily: 'monospace',
  },
  activityCard: {
    padding: 16,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  activityDescription: {
    fontSize: 15,
    marginBottom: 8,
    lineHeight: 20,
  },
  activityInstructions: {
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    minWidth: 100,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  bottomSpacing: {
    height: 32,
  },
});