import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, ProgressChart } from 'react-native-chart-kit';

interface ProgressDashboardProps {
  capsCoverage: CAPSCoverage[];
  weeklyProgress: WeeklyProgress[];
  lessonStats: LessonStats;
  homeworkStats: HomeworkStats;
}

interface CAPSCoverage {
  subject: string;
  target: number;
  achieved: number;
  color: string;
}

interface WeeklyProgress {
  week: string;
  lessonsPlanned: number;
  lessonsCompleted: number;
  homeworkAssigned: number;
  homeworkSubmitted: number;
}

interface LessonStats {
  total: number;
  completed: number;
  inProgress: number;
  upcoming: number;
}

interface HomeworkStats {
  assigned: number;
  submitted: number;
  graded: number;
  averageScore: number;
}

const screenWidth = Dimensions.get('window').width;

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  capsCoverage,
  weeklyProgress,
  lessonStats,
  homeworkStats,
}) => {
  const overallProgress = useMemo(() => {
    const totalTarget = capsCoverage.reduce((sum, c) => sum + c.target, 0);
    const totalAchieved = capsCoverage.reduce((sum, c) => sum + c.achieved, 0);
    return totalTarget > 0 ? totalAchieved / totalTarget : 0;
  }, [capsCoverage]);

  const chartData = useMemo(() => {
    return {
      labels: weeklyProgress.map(w => w.week),
      datasets: [
        {
          data: weeklyProgress.map(w => w.lessonsCompleted),
          color: () => '#4CAF50',
          strokeWidth: 2,
        },
        {
          data: weeklyProgress.map(w => w.homeworkSubmitted),
          color: () => '#2196F3',
          strokeWidth: 2,
        },
      ],
      legend: ['Lessons', 'Homework'],
    };
  }, [weeklyProgress]);

  const renderStatCard = (
    title: string,
    value: number | string,
    subtitle: string,
    icon: string,
    color: string
  ) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statHeader}>
        <Ionicons name={icon as any} size={20} color={color} />
        <Text style={styles.statTitle}>{title}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statSubtitle}>{subtitle}</Text>
    </View>
  );

  const renderCAPSProgress = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>CAPS Coverage</Text>
      <View style={styles.capsContainer}>
        {capsCoverage.map((caps, index) => (
          <View key={index} style={styles.capsItem}>
            <View style={styles.capsHeader}>
              <View style={[styles.capsDot, { backgroundColor: caps.color }]} />
              <Text style={styles.capsSubject}>{caps.subject}</Text>
              <Text style={styles.capsPercentage}>
                {Math.round((caps.achieved / caps.target) * 100)}%
              </Text>
            </View>
            <View style={styles.capsBar}>
              <View
                style={[
                  styles.capsBarFill,
                  {
                    width: `${(caps.achieved / caps.target) * 100}%`,
                    backgroundColor: caps.color,
                  },
                ]}
              />
            </View>
            <Text style={styles.capsDetail}>
              {caps.achieved} of {caps.target} objectives
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderQuickStats = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Quick Stats</Text>
      <View style={styles.statsGrid}>
        {renderStatCard(
          'Lessons',
          lessonStats.completed,
          `of ${lessonStats.total} completed`,
          'book',
          '#4CAF50'
        )}
        {renderStatCard(
          'Homework',
          homeworkStats.submitted,
          `of ${homeworkStats.assigned} submitted`,
          'document-text',
          '#2196F3'
        )}
        {renderStatCard(
          'Avg Score',
          `${homeworkStats.averageScore}%`,
          'homework average',
          'star',
          '#FF9800'
        )}
        {renderStatCard(
          'Progress',
          `${Math.round(overallProgress * 100)}%`,
          'overall completion',
          'trending-up',
          '#9C27B0'
        )}
      </View>
    </View>
  );

  const renderWeeklyChart = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Weekly Progress</Text>
      <View style={styles.chartContainer}>
        <LineChart
          data={chartData}
          width={screenWidth - 48}
          height={200}
          chartConfig={{
            backgroundColor: '#FFF',
            backgroundGradientFrom: '#FFF',
            backgroundGradientTo: '#FFF',
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            style: {
              borderRadius: 16,
            },
          }}
          bezier
          style={styles.chart}
        />
      </View>
    </View>
  );

  const renderLessonBreakdown = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Lesson Breakdown</Text>
      <View style={styles.breakdownContainer}>
        <View style={styles.breakdownItem}>
          <View style={[styles.breakdownDot, { backgroundColor: '#4CAF50' }]} />
          <Text style={styles.breakdownLabel}>Completed</Text>
          <Text style={styles.breakdownValue}>{lessonStats.completed}</Text>
        </View>
        <View style={styles.breakdownItem}>
          <View style={[styles.breakdownDot, { backgroundColor: '#FF9800' }]} />
          <Text style={styles.breakdownLabel}>In Progress</Text>
          <Text style={styles.breakdownValue}>{lessonStats.inProgress}</Text>
        </View>
        <View style={styles.breakdownItem}>
          <View style={[styles.breakdownDot, { backgroundColor: '#2196F3' }]} />
          <Text style={styles.breakdownLabel}>Upcoming</Text>
          <Text style={styles.breakdownValue}>{lessonStats.upcoming}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.overallProgress}>
        <View style={styles.progressCircle}>
          <ProgressChart
            data={{
              labels: ['Progress'],
              data: [overallProgress],
            }}
            width={100}
            height={100}
            strokeWidth={10}
            radius={40}
            chartConfig={{
              backgroundColor: '#FFF',
              backgroundGradientFrom: '#FFF',
              backgroundGradientTo: '#FFF',
              color: (opacity = 1) => `rgba(25, 118, 210, ${opacity})`,
            }}
          />
          <View style={styles.progressTextContainer}>
            <Text style={styles.progressValue}>{Math.round(overallProgress * 100)}%</Text>
            <Text style={styles.progressLabel}>Overall</Text>
          </View>
        </View>
        <View style={styles.progressInfo}>
          <Text style={styles.progressTitle}>Great Progress!</Text>
          <Text style={styles.progressDescription}>
            You're on track with your weekly program. Keep up the good work!
          </Text>
        </View>
      </View>

      {renderQuickStats()}
      {renderCAPSProgress()}
      {renderWeeklyChart()}
      {renderLessonBreakdown()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  overallProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    marginBottom: 8,
  },
  progressCircle: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressTextContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1976D2',
  },
  progressLabel: {
    fontSize: 10,
    color: '#666',
  },
  progressInfo: {
    flex: 1,
    marginLeft: 16,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  progressDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#FFF',
    padding: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    color: '#333',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  statCard: {
    width: '48%',
    marginHorizontal: '1%',
    marginBottom: 8,
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statTitle: {
    fontSize: 12,
    color: '#666',
    marginLeft: 6,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statSubtitle: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  capsContainer: {
    marginTop: 8,
  },
  capsItem: {
    marginBottom: 16,
  },
  capsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  capsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  capsSubject: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  capsPercentage: {
    fontSize: 14,
    fontWeight: '600',
  },
  capsBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  capsBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  capsDetail: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  chartContainer: {
    alignItems: 'center',
  },
  chart: {
    borderRadius: 16,
  },
  breakdownContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  breakdownItem: {
    alignItems: 'center',
  },
  breakdownDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#666',
  },
  breakdownValue: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 4,
  },
});

export default ProgressDashboard;