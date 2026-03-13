/**
 * Strategy Screen
 * Strategic planning and initiatives for the organization
 */
import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { DashboardWallpaperBackground } from '@/components/membership/dashboard';
import { percentWidth } from '@/lib/progress/clampPercent';

interface StrategicInitiative {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'planning' | 'in-progress' | 'completed' | 'on-hold';
  progress: number;
  dueDate: string;
  owner: string;
}

const STRATEGIC_INITIATIVES: StrategicInitiative[] = [
  {
    id: '1',
    title: 'Regional Manager Recruitment Drive',
    description: 'Fill all 8 vacant regional manager positions across South Africa',
    priority: 'high',
    status: 'in-progress',
    progress: 25,
    dueDate: '2025-03-31',
    owner: 'HR Committee',
  },
  {
    id: '2',
    title: 'Membership Growth - Q1 2026',
    description: 'Achieve 5000 active members by end of Q1 2026',
    priority: 'high',
    status: 'planning',
    progress: 15,
    dueDate: '2026-03-31',
    owner: 'Growth Team',
  },
  {
    id: '3',
    title: 'Digital Platform Enhancement',
    description: 'Upgrade mobile app with new features for member engagement',
    priority: 'medium',
    status: 'in-progress',
    progress: 78,
    dueDate: '2025-02-28',
    owner: 'Tech Team',
  },
  {
    id: '4',
    title: 'Training Program Rollout',
    description: 'Launch comprehensive training program for all members',
    priority: 'medium',
    status: 'planning',
    progress: 35,
    dueDate: '2025-04-30',
    owner: 'Education Committee',
  },
  {
    id: '5',
    title: 'Financial Sustainability Initiative',
    description: 'Diversify revenue streams and reduce dependence on membership fees',
    priority: 'high',
    status: 'in-progress',
    progress: 45,
    dueDate: '2025-06-30',
    owner: 'Finance Committee',
  },
];

const STRATEGIC_GOALS = [
  { label: '5,000 Members', target: 5000, current: 2847, icon: 'people' },
  { label: '9 Active Regions', target: 9, current: 1, icon: 'map' },
  { label: 'R5M Revenue', target: 5000000, current: 2547800, icon: 'cash' },
  { label: '95% Retention', target: 95, current: 94.5, icon: 'heart' },
];

export default function StrategyScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#EF4444';
      case 'medium': return '#F59E0B';
      case 'low': return '#10B981';
      default: return '#6B7280';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10B981';
      case 'in-progress': return '#3B82F6';
      case 'planning': return '#8B5CF6';
      case 'on-hold': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'in-progress': return 'In Progress';
      case 'on-hold': return 'On Hold';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Custom Header */}
      <View style={[styles.customHeader, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Strategic Plan</Text>
        </View>
        <TouchableOpacity style={styles.headerButton}>
          <Ionicons name="add-circle-outline" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <DashboardWallpaperBackground>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Vision Card */}
        <LinearGradient
          colors={['#8B5CF6', '#6D28D9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.visionCard}
        >
          <View style={styles.visionIcon}>
            <Ionicons name="telescope" size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.visionTitle}>Vision 2026</Text>
          <Text style={styles.visionText}>
            To become the leading agricultural organization in South Africa, 
            empowering 10,000 members across all 9 provinces with sustainable farming practices.
          </Text>
        </LinearGradient>

        {/* Strategic Goals */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Strategic Goals</Text>
          <View style={styles.goalsGrid}>
            {STRATEGIC_GOALS.map((goal, index) => {
              const progress = goal.target > 100 
                ? Math.round((goal.current / goal.target) * 100)
                : goal.current;
              
              return (
                <View key={index} style={[styles.goalCard, { backgroundColor: theme.card }]}>
                  <View style={[styles.goalIcon, { backgroundColor: theme.primary + '20' }]}>
                    <Ionicons name={goal.icon as any} size={20} color={theme.primary} />
                  </View>
                  <Text style={[styles.goalLabel, { color: theme.textSecondary }]}>{goal.label}</Text>
                  <Text style={[styles.goalProgress, { color: theme.text }]}>
                    {typeof goal.current === 'number' && goal.target > 100
                      ? `${(goal.current / 1000000).toFixed(1)}M / ${(goal.target / 1000000).toFixed(0)}M`
                      : `${goal.current} / ${goal.target}`
                    }
                  </Text>
                  <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { 
                          backgroundColor: progress >= 80 ? '#10B981' : progress >= 50 ? '#F59E0B' : '#3B82F6',
                          width: percentWidth(Math.min(progress, 100)) 
                        }
                      ]} 
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Strategic Initiatives */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Strategic Initiatives</Text>
            <TouchableOpacity>
              <Ionicons name="add-circle" size={24} color={theme.primary} />
            </TouchableOpacity>
          </View>
          
          {STRATEGIC_INITIATIVES.map((initiative) => (
            <TouchableOpacity 
              key={initiative.id}
              style={[styles.initiativeCard, { backgroundColor: theme.card }]}
            >
              <View style={styles.initiativeHeader}>
                <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(initiative.priority) + '20' }]}>
                  <Text style={[styles.priorityText, { color: getPriorityColor(initiative.priority) }]}>
                    {initiative.priority.toUpperCase()}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(initiative.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(initiative.status) }]}>
                    {getStatusLabel(initiative.status)}
                  </Text>
                </View>
              </View>
              
              <Text style={[styles.initiativeTitle, { color: theme.text }]}>{initiative.title}</Text>
              <Text style={[styles.initiativeDesc, { color: theme.textSecondary }]}>
                {initiative.description}
              </Text>
              
              <View style={styles.initiativeFooter}>
                <View style={styles.initiativeMeta}>
                  <Ionicons name="person-outline" size={14} color={theme.textSecondary} />
                  <Text style={[styles.initiativeMetaText, { color: theme.textSecondary }]}>
                    {initiative.owner}
                  </Text>
                </View>
                <View style={styles.initiativeMeta}>
                  <Ionicons name="calendar-outline" size={14} color={theme.textSecondary} />
                  <Text style={[styles.initiativeMetaText, { color: theme.textSecondary }]}>
                    {new Date(initiative.dueDate).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              </View>
              
              <View style={styles.progressSection}>
                <View style={[styles.progressBarLarge, { backgroundColor: theme.border }]}>
                  <View 
                    style={[
                      styles.progressFillLarge, 
                      { 
                        backgroundColor: getStatusColor(initiative.status),
                        width: percentWidth(initiative.progress) 
                      }
                    ]} 
                  />
                </View>
                <Text style={[styles.progressPercent, { color: theme.textSecondary }]}>
                  {initiative.progress}%
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      </DashboardWallpaperBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Custom Header
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerButton: {
    padding: 4,
  },
  content: {
    padding: 16,
  },
  visionCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
  },
  visionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  visionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  visionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  goalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  goalCard: {
    width: '48%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  goalIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  goalLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  goalProgress: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  initiativeCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  initiativeHeader: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  initiativeTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  initiativeDesc: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  initiativeFooter: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  initiativeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  initiativeMetaText: {
    fontSize: 12,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBarLarge: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFillLarge: {
    height: '100%',
    borderRadius: 3,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '600',
    width: 36,
    textAlign: 'right',
  },
});
