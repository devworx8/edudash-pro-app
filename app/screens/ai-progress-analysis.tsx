import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { canUseFeature, getQuotaStatus } from '@/lib/ai/limits';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { logger } from '@/lib/logger';
import { EducationalPDFService } from '@/lib/services/EducationalPDFService'
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';

const TAG = 'AIProgressAnalysis';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface StudentProgress {
  id: string;
name: string;
  recentGrades: number[];
  averageGrade: number;
  improvement: number;
  subjects: { [key: string]: number };
  lastAssignment: string;
}

interface ClassAnalytics {
  classId: string;
  className: string;
  totalStudents: number;
  averagePerformance: number;
  improvingStudents: number;
  strugglingStudents: number;
  recentTrends: string[];
}

export default function AIProgressAnalysisScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { tier } = useSubscription();
  const { showAlert, alertProps } = useAlertModal();
  const hasPremiumOrHigher = ['premium','pro','enterprise'].includes(String(tier || ''));
  const [loading, setLoading] = useState(true);
  const [analysisData, setAnalysisData] = useState<{
    studentProgress: StudentProgress[];
    classAnalytics: ClassAnalytics[];
    insights: string[];
  } | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  const flags = getFeatureFlagsSync();
  const AI_ENABLED = (process.env.EXPO_PUBLIC_AI_ENABLED === 'true') || (process.env.EXPO_PUBLIC_ENABLE_AI_FEATURES === 'true');
  const aiAnalysisEnabled = AI_ENABLED && flags.ai_progress_analysis !== false;

  const fetchProgressData = useCallback(async () => {
    try {
      setLoading(true);

      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // Check quota before proceeding (use grading assistance quota as proxy)
      const gate = await canUseFeature('grading_assistance', 1);
      if (!gate.allowed) {
        const status = await getQuotaStatus('grading_assistance');
        showAlert({
          title: 'Monthly limit reached',
          message: `You have used ${status.used} of ${status.limit} progress analyses this month.`,
          type: 'warning',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'See plans', onPress: () => navigateToUpgrade({ source: 'ai_progress_quota', reason: 'limit_reached' }) },
          ],
        });
        return;
      }

      // First try to determine what data structure we have
      logger.debug(TAG, 'Checking available data for teacher:', user.id);
      logger.debug(TAG, 'User object:', user);
      
      // Try to get classes first (simpler approach)
      const { data: classes, error: classesError } = await assertSupabase()
        .from('classes')
        .select(`*`)
        .eq('teacher_id', user.id)
        .eq('active', true);
        
      if (classesError) {
        console.error('Error fetching classes:', classesError);
        throw new Error(`Failed to fetch classes: ${classesError.message}`);
      }

      if (!classes || classes.length === 0) {
        setAnalysisData({
          studentProgress: [],
          classAnalytics: [],
          insights: ['No classes found. Create some classes and assignments to see progress analysis.']
        });
        return;
      }
      
      logger.debug(TAG, 'Found classes:', classes.length, classes);
      
      // For now, let's create some mock data to test the UI
      // Since we need actual data to see how the current system works
      setAnalysisData({
        studentProgress: [
          {
            id: '1',
            name: 'Sample Student',
            recentGrades: [85, 90, 78, 92, 88],
            averageGrade: 86.6,
            improvement: 3.5,
            subjects: { 'Mathematics': 90, 'Reading': 83 },
            lastAssignment: 'Math Worksheet 5'
          }
        ],
        classAnalytics: classes.map(cls => ({
          classId: cls.id,
          className: cls.name,
          totalStudents: 12, // Mock data
          averagePerformance: 85.4,
          improvingStudents: 8,
          strugglingStudents: 2,
          recentTrends: [
            'Class average: 85.4%',
            '8 students improving',
            '2 students need support'
          ]
        })),
        insights: [
          `Found ${classes.length} classes in your account`,
          'AI Progress Analysis is available but needs real student data',
          'Add assignments and student submissions to see detailed analytics'
        ]
      });
      
      return; // Return early with mock data for now

    } catch (error) {
      console.error('Failed to fetch progress data:', error);
      showAlert({ title: 'Error', message: 'Failed to load progress analysis. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (aiAnalysisEnabled && hasPremiumOrHigher) {
      fetchProgressData();
    }
  }, [aiAnalysisEnabled, hasPremiumOrHigher, fetchProgressData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProgressData();
  };

  const onExportPDF = async () => {
    try {
      const title = 'AI Progress Analysis'
      const insightsText = (analysisData?.insights || []).map(i => `• ${i}`).join('\n')
      const classesText = (analysisData?.classAnalytics || []).map(c => `${c.className}: avg ${c.averagePerformance}%`).join('\n')
      const body = [insightsText, classesText].filter(Boolean).join('\n\n') || 'No analysis available.'
      await EducationalPDFService.generateTextPDF(title, body)
      showAlert({ title: 'Export PDF', message: 'PDF generated successfully', type: 'success' })
    } catch {
      showAlert({ title: 'Export PDF', message: 'Failed to generate PDF', type: 'error' })
    }
  }

  // Create theme-aware styles
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollView: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: theme.textSecondary,
    },
    disabledContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    disabledTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.text,
      marginTop: 16,
      marginBottom: 8,
    },
    disabledText: {
      fontSize: 16,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
    },
    section: {
      padding: 16,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 16,
    },
    insightCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.cardBackground,
      padding: 16,
      borderRadius: 12,
      marginBottom: 8,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    insightText: {
      flex: 1,
      marginLeft: 12,
      fontSize: 14,
      color: theme.text,
      lineHeight: 20,
    },
    classCard: {
      backgroundColor: theme.cardBackground,
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    selectedClassCard: {
      borderColor: theme.primary,
    },
    className: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 4,
    },
    classStats: {
      fontSize: 14,
      color: theme.textSecondary,
      marginBottom: 12,
    },
    trendsContainer: {
      flexDirection: 'row',
      gap: 16,
    },
    trendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    trendText: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    studentCard: {
      backgroundColor: theme.cardBackground,
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    studentHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    studentName: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    improvementBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 4,
    },
    improvementText: {
      fontSize: 12,
      fontWeight: '600',
      color: 'white',
    },
    averageGrade: {
      fontSize: 14,
      color: theme.text,
      marginBottom: 4,
    },
    lastAssignment: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 8,
    },
    subjectsContainer: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    subjectPill: {
      backgroundColor: theme.primary + '20',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    subjectText: {
      fontSize: 10,
      fontWeight: '600',
      color: theme.primary,
    },
    emptyText: {
      textAlign: 'center',
      color: theme.textSecondary,
      fontStyle: 'italic',
      padding: 32,
    },
  }), [theme]);

  const renderStudentCard = (student: StudentProgress) => (
    <View key={student.id} style={styles.studentCard}>
      <View style={styles.studentHeader}>
        <Text style={styles.studentName}>{student.name}</Text>
        <View style={[
          styles.improvementBadge,
          { backgroundColor: student.improvement > 0 ? '#10B981' : student.improvement < -5 ? '#EF4444' : '#6B7280' }
        ]}>
          <Ionicons 
            name={student.improvement > 0 ? 'trending-up' : student.improvement < -5 ? 'trending-down' : 'remove'} 
            size={12} 
            color="white" 
          />
          <Text style={styles.improvementText}>
            {student.improvement > 0 ? '+' : ''}{student.improvement.toFixed(1)}%
          </Text>
        </View>
      </View>
      
      <Text style={styles.averageGrade}>Average: {student.averageGrade.toFixed(1)}%</Text>
      <Text style={styles.lastAssignment}>Last: {student.lastAssignment}</Text>
      
      {Object.keys(student.subjects).length > 0 && (
        <View style={styles.subjectsContainer}>
          {Object.entries(student.subjects).slice(0, 3).map(([subject, grade]) => (
            <View key={subject} style={styles.subjectPill}>
              <Text style={styles.subjectText}>{subject}: {grade.toFixed(0)}%</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderClassCard = (classData: ClassAnalytics) => (
    <TouchableOpacity 
      key={classData.classId} 
      style={[styles.classCard, selectedClass === classData.classId && styles.selectedClassCard]}
      onPress={() => setSelectedClass(selectedClass === classData.classId ? null : classData.classId)}
    >
      <Text style={styles.className}>{classData.className}</Text>
      <Text style={styles.classStats}>
        {classData.totalStudents} students • {classData.averagePerformance.toFixed(1)}% avg
      </Text>
      
      <View style={styles.trendsContainer}>
        <View style={styles.trendItem}>
          <Ionicons name="trending-up" size={16} color="#10B981" />
          <Text style={styles.trendText}>{classData.improvingStudents} improving</Text>
        </View>
        <View style={styles.trendItem}>
          <Ionicons name="help-circle" size={16} color="#F59E0B" />
          <Text style={styles.trendText}>{classData.strugglingStudents} need support</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="AI Progress Analysis" subtitle="AI-powered student insights" />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Analyzing student progress...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!aiAnalysisEnabled || !hasPremiumOrHigher) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="AI Progress Analysis" subtitle="AI-powered student insights" />
        <View style={styles.disabledContainer}>
          <Ionicons name="analytics-outline" size={64} color={theme.textSecondary} />
          <Text style={styles.disabledTitle}>Premium Feature</Text>
          <Text style={styles.disabledText}>
            Progress Analysis is available on Premium and higher plans.
          </Text>
          <TouchableOpacity
            style={{ marginTop: 12, backgroundColor: '#7C3AED', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}
            onPress={() => navigateToUpgrade({ source: 'ai_progress_analysis', reason: 'feature_needed' })}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Upgrade</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="AI Progress Analysis" subtitle="AI-powered student insights" />
      
      <View style={{ padding: 12, flexDirection: 'row', justifyContent: 'flex-end' }}>
        <TouchableOpacity onPress={onExportPDF} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border }}>
          <Ionicons name="document-outline" size={16} color={theme.text} />
          <Text style={{ marginLeft: 6, color: theme.text }}>Export PDF</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {/* Insights Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Insights</Text>
          {analysisData?.insights.map((insight, index) => (
            <View key={index} style={styles.insightCard}>
              <Ionicons name="bulb-outline" size={20} color={theme.primary} />
              <Text style={styles.insightText}>{insight}</Text>
            </View>
          ))}
        </View>

        {/* Class Analytics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Class Overview</Text>
          {analysisData?.classAnalytics.length === 0 ? (
            <Text style={styles.emptyText}>No class data available</Text>
          ) : (
            analysisData?.classAnalytics.map(renderClassCard)
          )}
        </View>

        {/* Student Progress */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Student Progress</Text>
          {analysisData?.studentProgress.length === 0 ? (
            <Text style={styles.emptyText}>No student progress data available</Text>
          ) : (
            analysisData?.studentProgress
              .filter(() => !selectedClass || 
                analysisData.classAnalytics.find(c => c.classId === selectedClass))
              .slice(0, 10) // Show top 10 students
              .map(renderStudentCard)
          )}
        </View>
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
