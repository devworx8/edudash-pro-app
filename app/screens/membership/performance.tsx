/**
 * Performance Screen
 * Organization-wide performance metrics and KPIs
 */
import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { DashboardWallpaperBackground } from '@/components/membership/dashboard';
import { percentWidth } from '@/lib/progress/clampPercent';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface KPI {
  id: string;
  name: string;
  value: number;
  target: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  change: number;
}

interface RegionalPerformance {
  region: string;
  code: string;
  score: number;
  members: number;
  growth: number;
  retention: number;
}

const KEY_PERFORMANCE_INDICATORS: KPI[] = [
  { id: '1', name: 'Member Satisfaction', value: 87, target: 90, unit: '%', trend: 'up', change: 3.2 },
  { id: '2', name: 'Membership Growth', value: 12.5, target: 15, unit: '%', trend: 'up', change: 2.1 },
  { id: '3', name: 'Revenue per Member', value: 895, target: 1000, unit: 'R', trend: 'up', change: 8.5 },
  { id: '4', name: 'Member Retention', value: 94.5, target: 95, unit: '%', trend: 'stable', change: 0.2 },
  { id: '5', name: 'Event Attendance', value: 72, target: 80, unit: '%', trend: 'down', change: -5.3 },
  { id: '6', name: 'Digital Engagement', value: 68, target: 75, unit: '%', trend: 'up', change: 12.1 },
];

const REGIONAL_PERFORMANCE: RegionalPerformance[] = [
  { region: 'Gauteng', code: 'GP', score: 92, members: 892, growth: 15.2, retention: 96 },
  { region: 'Western Cape', code: 'WC', score: 88, members: 567, growth: 12.1, retention: 94 },
  { region: 'KwaZulu-Natal', code: 'KZN', score: 85, members: 445, growth: 18.5, retention: 93 },
  { region: 'Eastern Cape', code: 'EC', score: 78, members: 312, growth: 8.3, retention: 91 },
  { region: 'Mpumalanga', code: 'MP', score: 82, members: 234, growth: 11.7, retention: 92 },
  { region: 'Limpopo', code: 'LP', score: 75, members: 198, growth: 6.5, retention: 89 },
  { region: 'Free State', code: 'FS', score: 71, members: 156, growth: 4.2, retention: 88 },
  { region: 'North West', code: 'NW', score: 68, members: 123, growth: 3.8, retention: 87 },
  { region: 'Northern Cape', code: 'NC', score: 65, members: 89, growth: 2.1, retention: 85 },
];

export default function PerformanceScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return '#10B981';
    if (score >= 70) return '#F59E0B';
    return '#EF4444';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return 'trending-up';
      case 'down': return 'trending-down';
      default: return 'remove';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return '#10B981';
      case 'down': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const overallScore = Math.round(
    KEY_PERFORMANCE_INDICATORS.reduce((sum, kpi) => sum + (kpi.value / kpi.target) * 100, 0) / 
    KEY_PERFORMANCE_INDICATORS.length
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Custom Header */}
      <View style={[styles.customHeader, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Performance</Text>
        </View>
        <TouchableOpacity style={styles.headerButton}>
          <Ionicons name="download-outline" size={24} color={theme.primary} />
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
        {/* Overall Score Card */}
        <LinearGradient
          colors={['#F59E0B', '#D97706']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.scoreCard}
        >
          <View style={styles.scoreHeader}>
            <View>
              <Text style={styles.scoreLabel}>Overall Performance</Text>
              <Text style={styles.scorePeriod}>December 2025</Text>
            </View>
            <TouchableOpacity style={styles.reportButton}>
              <Ionicons name="download-outline" size={20} color="#FFFFFF" />
              <Text style={styles.reportButtonText}>Report</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.scoreMain}>
            <Text style={styles.scoreValue}>{overallScore}</Text>
            <Text style={styles.scoreUnit}>/ 100</Text>
          </View>
          
          <View style={styles.scoreBar}>
            <View style={[styles.scoreBarFill, { width: percentWidth(overallScore) }]} />
          </View>
          
          <Text style={styles.scoreStatus}>
            {overallScore >= 85 ? 'Excellent' : overallScore >= 70 ? 'Good' : 'Needs Improvement'}
          </Text>
        </LinearGradient>

        {/* KPIs */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Key Performance Indicators</Text>
          <View style={styles.kpiGrid}>
            {KEY_PERFORMANCE_INDICATORS.map((kpi) => {
              const progress = Math.round((kpi.value / kpi.target) * 100);
              
              return (
                <View key={kpi.id} style={[styles.kpiCard, { backgroundColor: theme.card }]}>
                  <View style={styles.kpiHeader}>
                    <Text style={[styles.kpiName, { color: theme.textSecondary }]}>{kpi.name}</Text>
                    <View style={[styles.trendBadge, { backgroundColor: getTrendColor(kpi.trend) + '20' }]}>
                      <Ionicons name={getTrendIcon(kpi.trend)} size={12} color={getTrendColor(kpi.trend)} />
                      <Text style={[styles.trendText, { color: getTrendColor(kpi.trend) }]}>
                        {kpi.change > 0 ? '+' : ''}{kpi.change}%
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.kpiValue}>
                    <Text style={[styles.kpiValueText, { color: theme.text }]}>
                      {kpi.unit === 'R' ? `R${kpi.value}` : `${kpi.value}${kpi.unit}`}
                    </Text>
                    <Text style={[styles.kpiTarget, { color: theme.textSecondary }]}>
                      / {kpi.unit === 'R' ? `R${kpi.target}` : `${kpi.target}${kpi.unit}`}
                    </Text>
                  </View>
                  
                  <View style={[styles.kpiProgress, { backgroundColor: theme.border }]}>
                    <View 
                      style={[
                        styles.kpiProgressFill, 
                        { 
                          backgroundColor: progress >= 90 ? '#10B981' : progress >= 70 ? '#F59E0B' : '#EF4444',
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

        {/* Regional Performance */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Regional Performance</Text>
          {REGIONAL_PERFORMANCE.map((region, index) => (
            <TouchableOpacity key={region.code} style={[styles.regionCard, { backgroundColor: theme.card }]}>
              <View style={styles.regionRank}>
                <Text style={[styles.regionRankText, { color: index < 3 ? '#F59E0B' : theme.textSecondary }]}>
                  #{index + 1}
                </Text>
              </View>
              
              <View style={styles.regionInfo}>
                <Text style={[styles.regionName, { color: theme.text }]}>{region.region}</Text>
                <View style={styles.regionMeta}>
                  <Text style={[styles.regionMembers, { color: theme.textSecondary }]}>
                    {region.members} members
                  </Text>
                  <View style={styles.regionGrowth}>
                    <Ionicons name="trending-up" size={12} color="#10B981" />
                    <Text style={[styles.regionGrowthText, { color: '#10B981' }]}>
                      +{region.growth}%
                    </Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.regionScore}>
                <Text style={[styles.regionScoreValue, { color: getScoreColor(region.score) }]}>
                  {region.score}
                </Text>
                <View style={[styles.regionScoreBar, { backgroundColor: theme.border }]}>
                  <View 
                    style={[
                      styles.regionScoreFill, 
                      { backgroundColor: getScoreColor(region.score), width: percentWidth(region.score) }
                    ]} 
                  />
                </View>
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
  scoreCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  scoreLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  scorePeriod: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  reportButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  scoreMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scoreUnit: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.7)',
    marginLeft: 8,
  },
  scoreBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  scoreBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
  scoreStatus: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpiCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    borderRadius: 16,
    padding: 16,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  kpiName: {
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  trendText: {
    fontSize: 10,
    fontWeight: '600',
  },
  kpiValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  kpiValueText: {
    fontSize: 24,
    fontWeight: '700',
  },
  kpiTarget: {
    fontSize: 14,
    marginLeft: 4,
  },
  kpiProgress: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  kpiProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  regionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  regionRank: {
    width: 32,
    alignItems: 'center',
  },
  regionRankText: {
    fontSize: 14,
    fontWeight: '700',
  },
  regionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  regionName: {
    fontSize: 15,
    fontWeight: '600',
  },
  regionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  regionMembers: {
    fontSize: 12,
  },
  regionGrowth: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  regionGrowthText: {
    fontSize: 12,
    fontWeight: '600',
  },
  regionScore: {
    alignItems: 'flex-end',
    width: 60,
  },
  regionScoreValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  regionScoreBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  regionScoreFill: {
    height: '100%',
    borderRadius: 2,
  },
});
