/**
 * Parent Grades Screen
 * 
 * Shows academic progress and grades for parent's children.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useParentDashboard } from '@/hooks/useDashboardData';
import { useParentGrades } from '@/hooks/useParentGrades';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { percentWidth } from '@/lib/progress/clampPercent';

const { width } = Dimensions.get('window');

// Custom Header Component
interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, subtitle, onBack, rightAction }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: theme.surface }]}>
      <TouchableOpacity 
        style={styles.headerBackButton} 
        onPress={onBack || (() => router.back())}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="arrow-back" size={24} color={theme.text} />
      </TouchableOpacity>
      
      <View style={styles.headerTitleContainer}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
        )}
      </View>
      
      {rightAction ? (
        <TouchableOpacity 
          style={styles.headerRightButton} 
          onPress={rightAction.onPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name={rightAction.icon} size={24} color={theme.text} />
        </TouchableOpacity>
      ) : (
        <View style={styles.headerRightButton} />
      )}
    </View>
  );
};

// Grade Card Component
interface GradeCardProps {
  subject: string;
  grade: number;
  trend?: 'up' | 'down' | 'stable';
  recentScore?: number;
  childName?: string;
}

const GradeCard: React.FC<GradeCardProps> = ({ subject, grade, trend, recentScore, childName }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  
  const getGradeColor = (g: number) => {
    if (g >= 80) return theme.success;
    if (g >= 60) return theme.info;
    if (g >= 40) return theme.warning;
    return theme.error;
  };
  
  const getGradeLabel = (g: number) => {
    if (g >= 80) return t('grades.excellent', { defaultValue: 'Excellent' });
    if (g >= 60) return t('grades.good', { defaultValue: 'Good' });
    if (g >= 40) return t('grades.needs_work', { defaultValue: 'Needs Work' });
    return t('grades.struggling', { defaultValue: 'Struggling' });
  };
  
  const trendIcon = trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'remove';
  const trendColor = trend === 'up' ? theme.success : trend === 'down' ? theme.error : theme.textSecondary;
  
  return (
    <View style={[gradeStyles.card, { backgroundColor: theme.surface }]}>
      <View style={gradeStyles.header}>
        <View style={[gradeStyles.iconContainer, { backgroundColor: getGradeColor(grade) + '20' }]}>
          <Ionicons name="school-outline" size={24} color={getGradeColor(grade)} />
        </View>
        <View style={gradeStyles.headerContent}>
          <Text style={[gradeStyles.subject, { color: theme.text }]}>{subject}</Text>
          {childName && (
            <Text style={[gradeStyles.childName, { color: theme.textSecondary }]}>{childName}</Text>
          )}
        </View>
        {trend && (
          <Ionicons name={trendIcon} size={20} color={trendColor} />
        )}
      </View>
      
      <View style={gradeStyles.gradeContainer}>
        <View style={gradeStyles.gradeCircle}>
          <Text style={[gradeStyles.gradeValue, { color: getGradeColor(grade) }]}>{grade}%</Text>
          <Text style={[gradeStyles.gradeLabel, { color: theme.textSecondary }]}>
            {getGradeLabel(grade)}
          </Text>
        </View>
        
        <View style={gradeStyles.progressContainer}>
          <View style={[gradeStyles.progressBar, { backgroundColor: theme.border }]}>
            <View 
              style={[
                gradeStyles.progressFill, 
                { backgroundColor: getGradeColor(grade), width: percentWidth(grade) }
              ]} 
            />
          </View>
          {recentScore !== undefined && (
            <Text style={[gradeStyles.recentScore, { color: theme.textSecondary }]}>
              {t('grades.recent_score', { defaultValue: 'Recent: {{score}}%', score: recentScore })}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

// Overall Progress Card
interface OverallProgressProps {
  average: number;
  totalSubjects: number;
  improvement: number;
}

const OverallProgress: React.FC<OverallProgressProps> = ({ average, totalSubjects, improvement }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  
  const getAverageColor = (avg: number) => {
    if (avg >= 80) return theme.success;
    if (avg >= 60) return theme.info;
    if (avg >= 40) return theme.warning;
    return theme.error;
  };
  
  return (
    <View style={[overallStyles.card, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '30' }]}>
      <View style={overallStyles.content}>
        <View style={overallStyles.averageContainer}>
          <Text style={[overallStyles.averageValue, { color: getAverageColor(average) }]}>
            {average}%
          </Text>
          <Text style={[overallStyles.averageLabel, { color: theme.textSecondary }]}>
            {t('grades.overall_average', { defaultValue: 'Overall Average' })}
          </Text>
        </View>
        
        <View style={overallStyles.statsContainer}>
          <View style={overallStyles.stat}>
            <Ionicons name="book-outline" size={20} color={theme.primary} />
            <Text style={[overallStyles.statValue, { color: theme.text }]}>{totalSubjects}</Text>
            <Text style={[overallStyles.statLabel, { color: theme.textSecondary }]}>
              {t('grades.subjects', { defaultValue: 'Subjects' })}
            </Text>
          </View>
          
          <View style={overallStyles.stat}>
            <Ionicons 
              name={improvement >= 0 ? 'trending-up' : 'trending-down'} 
              size={20} 
              color={improvement >= 0 ? theme.success : theme.error} 
            />
            <Text style={[overallStyles.statValue, { color: improvement >= 0 ? theme.success : theme.error }]}>
              {improvement >= 0 ? '+' : ''}{improvement}%
            </Text>
            <Text style={[overallStyles.statLabel, { color: theme.textSecondary }]}>
              {t('grades.this_month', { defaultValue: 'This Month' })}
            </Text>
          </View>
        </View>
      </View>
      
      <TouchableOpacity 
        style={[overallStyles.reportButton, { backgroundColor: theme.primary }]}
        onPress={() => router.push('/screens/ai-progress-analysis')}
      >
        <Ionicons name="sparkles" size={18} color={theme.onPrimary} />
        <Text style={[overallStyles.reportButtonText, { color: theme.onPrimary }]}>
          {t('grades.ai_analysis', { defaultValue: 'AI Progress Analysis' })}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default function GradesScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  
  const { data: dashboardData, loading: dashLoading, refresh } = useParentDashboard();
  const { data: gradesData, loading: gradesLoading, refresh: refreshGrades } = useParentGrades();
  const [refreshing, setRefreshing] = useState(false);
  const loading = dashLoading || gradesLoading;

  const overview = gradesData?.overview ?? { average: 0, totalSubjects: 0, improvement: 0 };
  const subjects = gradesData?.subjects ?? [];
  const isEmpty = gradesData?.isEmpty ?? true;
  
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshGrades()]);
    setRefreshing(false);
  };
  
  const handleAnalysis = () => {
    router.push('/screens/ai-progress-analysis');
  };
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScreenHeader 
        title={t('grades.title', { defaultValue: 'Grades & Progress' })}
        subtitle={profile?.preschool_name || ''}
        rightAction={{
          icon: 'analytics-outline',
          onPress: handleAnalysis,
        }}
      />
      
      <ScrollView 
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
        }
      >
        {loading ? (
          <>
            <SkeletonLoader width="100%" height={160} borderRadius={16} style={{ marginBottom: 16 }} />
            {[1, 2, 3].map((i) => (
              <SkeletonLoader key={i} width="100%" height={120} borderRadius={12} style={{ marginBottom: 12 }} />
            ))}
          </>
        ) : (
          <>
            {/* Overall Progress Card */}
            {!isEmpty && (
              <OverallProgress 
                average={overview.average}
                totalSubjects={overview.totalSubjects}
                improvement={overview.improvement}
              />
            )}
            
            {isEmpty ? (
              <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 }}>
                <Ionicons name="school-outline" size={56} color={theme.textSecondary} style={{ opacity: 0.4 }} />
                <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text, marginTop: 16 }}>
                  {t('grades.no_grades_yet', { defaultValue: 'No Grades Yet' })}
                </Text>
                <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
                  {t('grades.no_grades_desc', { defaultValue: 'Grades will appear here once homework has been submitted and graded by AI or a teacher.' })}
                </Text>
              </View>
            ) : (
              <>
                {/* Section Title */}
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    {t('grades.by_subject', { defaultValue: 'By Subject' })}
                  </Text>
                </View>
                
                {/* Grade Cards — real data */}
                {subjects.map((subject, index) => (
                  <GradeCard 
                    key={`${subject.childId}-${subject.subject}-${index}`}
                    subject={subject.subject}
                    grade={subject.grade}
                    trend={subject.trend}
                    recentScore={subject.recentScore}
                    childName={subject.childName}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  headerBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerRightButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
});

const gradeStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  subject: {
    fontSize: 16,
    fontWeight: '600',
  },
  childName: {
    fontSize: 12,
    marginTop: 2,
  },
  gradeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  gradeCircle: {
    alignItems: 'center',
  },
  gradeValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  gradeLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  progressContainer: {
    flex: 1,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  recentScore: {
    fontSize: 12,
    marginTop: 6,
  },
});

const overallStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  averageContainer: {
    alignItems: 'center',
    paddingRight: 20,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.1)',
  },
  averageValue: {
    fontSize: 42,
    fontWeight: '700',
  },
  averageLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  statsContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  reportButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
