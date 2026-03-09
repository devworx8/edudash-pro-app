/**
 * Worksheet Demo Screen
 * 
 * A demo screen to test and showcase the worksheet generation functionality.
 * This can be used for testing during development.
 * 
 * Access this screen at: http://localhost:8084/screens/worksheet-demo
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import WorksheetQuickAction, { AssignmentWorksheetButton, WorksheetQuickWidget } from '@/components/worksheets/WorksheetQuickAction';
import { EducationalPDFService, type WorksheetOptions, type MathWorksheetData, type ReadingWorksheetData, type ActivitySheetData } from '@/lib/services/EducationalPDFService';
import type { Assignment } from '@/lib/models/Assignment';

export default function WorksheetDemoScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  // Sample assignment data for testing
  const sampleAssignment: Assignment = {
    id: 'demo-assignment-1',
    title: 'Math Practice: Addition and Subtraction',
    description: 'Practice basic addition and subtraction problems',
    instructions: 'Complete all problems. Show your work for each calculation.',
    course_id: 'demo-course-1',
    assignment_type: 'homework',
    max_points: 100,
    assigned_at: new Date().toISOString(),
    due_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    available_from: new Date().toISOString(),
    available_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    allow_late_submissions: true,
    late_penalty_percent: 10,
    max_attempts: 2,
    attachments: [],
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sampleAssignments = [sampleAssignment];

  const testDirectGeneration = async () => {
    showAlert({
      title: 'Test Direct Generation',
      message: 'Which type of worksheet would you like to test?',
      type: 'info',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Math Worksheet', onPress: testMathWorksheet },
        { text: 'Reading Worksheet', onPress: testReadingWorksheet },
        { text: 'Activity Sheet', onPress: testActivitySheet },
      ],
    });
  };

  const testMathWorksheet = async () => {
    try {
      const mathData: MathWorksheetData = {
        type: 'addition',
        problemCount: 10,
        numberRange: { min: 1, max: 20 },
        showHints: true,
        includeImages: false,
      };

      const options: WorksheetOptions = {
        title: 'Addition Practice Worksheet',
        studentName: 'Demo Student',
        difficulty: 'easy',
        ageGroup: '5-6',
        colorMode: 'color',
        paperSize: 'A4',
        orientation: 'portrait',
        includeAnswerKey: true,
      };

      await EducationalPDFService.generateMathWorksheet(mathData, options);
    } catch (error) {
      console.error('Math worksheet test failed:', error);
    }
  };

  const testReadingWorksheet = async () => {
    try {
      const readingData: ReadingWorksheetData = {
        type: 'comprehension',
        content: 'The little cat sat on the mat. It was a sunny day and the cat was very happy. The cat played with a ball of yarn and took a long nap in the warm sunshine.',
        questions: [
          {
            question: 'Where did the cat sit?',
            type: 'short-answer',
            correctAnswer: 'On the mat'
          },
          {
            question: 'What kind of day was it?',
            type: 'multiple-choice',
            options: ['Rainy', 'Sunny', 'Cloudy', 'Snowy'],
            correctAnswer: 'Sunny'
          },
          {
            question: 'The cat was happy.',
            type: 'true-false',
            correctAnswer: 'True'
          }
        ]
      };

      const options: WorksheetOptions = {
        title: 'Reading Comprehension: The Little Cat',
        studentName: 'Demo Student',
        difficulty: 'easy',
        ageGroup: '4-5',
        colorMode: 'color',
        paperSize: 'A4',
        orientation: 'portrait',
        includeAnswerKey: true,
      };

      await EducationalPDFService.generateReadingWorksheet(readingData, options);
    } catch (error) {
      console.error('Reading worksheet test failed:', error);
    }
  };

  const testActivitySheet = async () => {
    try {
      const activityData: ActivitySheetData = {
        type: 'coloring',
        theme: 'Farm Animals',
        instructions: 'Color the farm animals using your favorite colors. Try to stay inside the lines!',
        materials: ['Crayons or colored pencils', 'Eraser (optional)']
      };

      const options: WorksheetOptions = {
        title: 'Farm Animals Coloring Activity',
        studentName: 'Demo Student',
        difficulty: 'easy',
        ageGroup: '3-4',
        colorMode: 'color',
        paperSize: 'A4',
        orientation: 'portrait',
        includeAnswerKey: false,
      };

      await EducationalPDFService.generateActivitySheet(activityData, options);
    } catch (error) {
      console.error('Activity sheet test failed:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📝 Worksheet Demo</Text>
        <Text style={styles.headerSubtitle}>Test educational PDF generation</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* User Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current User</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>Role: {profile?.role || 'Unknown'}</Text>
            <Text style={styles.infoText}>Name: {profile?.first_name} {profile?.last_name}</Text>
            <Text style={styles.infoText}>Can Generate: {['teacher', 'principal', 'principal_admin', 'parent'].includes(profile?.role || '') ? 'Yes ✅' : 'No ❌'}</Text>
          </View>
        </View>

        {/* Component Tests */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Component Tests</Text>
          
          {/* Quick Action Buttons */}
          <View style={styles.testCard}>
            <Text style={styles.testTitle}>1. Quick Action Buttons</Text>
            <Text style={styles.testDescription}>Test different quick action button styles</Text>
            
            <View style={styles.buttonRow}>
              <WorksheetQuickAction 
                style="inline" 
                size="small" 
                showLabel={true}
              />
              <View style={{ width: 16 }} />
              <WorksheetQuickAction 
                style="inline" 
                size="medium" 
                showLabel={true}
              />
            </View>

            <View style={styles.buttonRow}>
              <AssignmentWorksheetButton 
                assignment={sampleAssignment} 
                variant="primary"
              />
            </View>

            <View style={styles.buttonRow}>
              <AssignmentWorksheetButton 
                assignment={sampleAssignment} 
                variant="outline"
              />
            </View>
          </View>

          {/* Widget Test */}
          <View style={styles.testCard}>
            <Text style={styles.testTitle}>2. Teacher Dashboard Widget</Text>
            <Text style={styles.testDescription}>Test the quick worksheet widget</Text>
            
            <WorksheetQuickWidget 
              recentAssignments={sampleAssignments}
              onCreateWorksheet={(assignment) => {
                showAlert({
                  title: 'Widget Test',
                  message: assignment 
                    ? `Creating worksheet from: ${assignment.title}`
                    : 'Creating new worksheet',
                  type: 'info',
                });
              }}
            />
          </View>
        </View>

        {/* Direct API Tests */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Direct API Tests</Text>
          <Text style={styles.sectionDescription}>
            Test worksheet generation directly without UI components
          </Text>

          <TouchableOpacity 
            style={styles.apiTestButton}
            onPress={testDirectGeneration}
          >
            <Ionicons name="flask" size={20} color="white" />
            <Text style={styles.apiTestButtonText}>
              Test Direct Generation
            </Text>
          </TouchableOpacity>

          <View style={styles.testGrid}>
            <TouchableOpacity 
              style={[styles.testGridItem, { backgroundColor: theme.primary + '15' }]}
              onPress={testMathWorksheet}
            >
              <Text style={styles.testGridIcon}>🔢</Text>
              <Text style={[styles.testGridText, { color: theme.primary }]}>
                Math Worksheet
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.testGridItem, { backgroundColor: theme.success + '15' }]}
              onPress={testReadingWorksheet}
            >
              <Text style={styles.testGridIcon}>📖</Text>
              <Text style={[styles.testGridText, { color: theme.success }]}>
                Reading Sheet
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.testGridItem, { backgroundColor: theme.accent + '15' }]}
              onPress={testActivitySheet}
            >
              <Text style={styles.testGridIcon}>🎨</Text>
              <Text style={[styles.testGridText, { color: theme.accent }]}>
                Activity Sheet
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Feature Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Feature Status</Text>
          
          <View style={styles.statusCard}>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusText}>PDF Service Integration</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusText}>Math Worksheets</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusText}>Reading Comprehension</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusText}>Activity Sheets</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusText}>Answer Keys</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusText}>Customization Options</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusText}>Assignment Integration</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Action Button */}
      <WorksheetQuickAction 
        position="bottom-right" 
        size="large" 
        showLabel={true}
      />
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    padding: 20,
    backgroundColor: theme.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  infoCard: {
    backgroundColor: theme.cardBackground,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  infoText: {
    fontSize: 16,
    color: theme.text,
    marginBottom: 8,
  },
  testCard: {
    backgroundColor: theme.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  testTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 4,
  },
  testDescription: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },
  apiTestButton: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  apiTestButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  testGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  testGridItem: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  testGridIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  testGridText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: theme.cardBackground,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 24,
  },
  statusText: {
    fontSize: 16,
    color: theme.text,
  },
});