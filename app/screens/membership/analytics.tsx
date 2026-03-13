/**
 * Analytics Screen
 * Data analytics and insights for the organization
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

interface InsightCard {
  id: string;
  title: string;
  value: string;
  change: number;
  icon: string;
  color: string;
}

interface TrendData {
  month: string;
  members: number;
  revenue: number;
}

const INSIGHT_CARDS: InsightCard[] = [
  { id: '1', title: 'Total Members', value: '2,847', change: 12.5, icon: 'people', color: '#3B82F6' },
  { id: '2', title: 'Monthly Revenue', value: 'R185K', change: 18.3, icon: 'cash', color: '#10B981' },
  { id: '3', title: 'Active Rate', value: '94.5%', change: 2.1, icon: 'pulse', color: '#8B5CF6' },
  { id: '4', title: 'Avg Engagement', value: '68%', change: -3.2, icon: 'analytics', color: '#F59E0B' },
];

const MONTHLY_TREND: TrendData[] = [
  { month: 'Jul', members: 2100, revenue: 142000 },
  { month: 'Aug', members: 2250, revenue: 155000 },
  { month: 'Sep', members: 2420, revenue: 162000 },
  { month: 'Oct', members: 2580, revenue: 171000 },
  { month: 'Nov', members: 2710, revenue: 178000 },
  { month: 'Dec', members: 2847, revenue: 185000 },
];

const TOP_INSIGHTS = [
  { id: '1', type: 'growth', title: 'KZN Leading Growth', description: 'KwaZulu-Natal region shows 18.5% growth, highest among all regions', icon: 'trending-up', color: '#10B981' },
  { id: '2', type: 'risk', title: 'Northern Cape Needs Attention', description: 'Retention rate dropped to 85%, consider engagement initiatives', icon: 'alert-circle', color: '#EF4444' },
  { id: '3', type: 'opportunity', title: 'Digital Engagement Rising', description: 'Mobile app usage increased 32% this month', icon: 'phone-portrait', color: '#3B82F6' },
  { id: '4', type: 'insight', title: 'Premium Tier Interest', description: '156 members inquired about premium membership upgrade', icon: 'star', color: '#F59E0B' },
];

const DEMOGRAPHIC_DATA = [
  { label: '18-25', percentage: 15, color: '#3B82F6' },
  { label: '26-35', percentage: 28, color: '#10B981' },
  { label: '36-45', percentage: 32, color: '#F59E0B' },
  { label: '46-55', percentage: 18, color: '#8B5CF6' },
  { label: '55+', percentage: 7, color: '#EC4899' },
];

export default function AnalyticsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month');

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const maxMembers = Math.max(...MONTHLY_TREND.map(d => d.members));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <DashboardWallpaperBackground>
        {/* Custom Header */}
        <View style={[styles.customHeader, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Analytics</Text>
        </View>
        <TouchableOpacity style={styles.headerButton}>
          <Ionicons name="download-outline" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Time Range Selector */}
        <View style={[styles.timeSelector, { backgroundColor: theme.card }]}>
          {(['week', 'month', 'year'] as const).map((range) => (
            <TouchableOpacity
              key={range}
              style={[styles.timeOption, timeRange === range && { backgroundColor: theme.primary }]}
              onPress={() => setTimeRange(range)}
            >
              <Text style={[styles.timeOptionText, { color: timeRange === range ? '#FFFFFF' : theme.textSecondary }]}>
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Insight Cards */}
        <View style={styles.insightGrid}>
          {INSIGHT_CARDS.map((card) => (
            <View key={card.id} style={[styles.insightCard, { backgroundColor: theme.card }]}>
              <View style={[styles.insightIcon, { backgroundColor: card.color + '20' }]}>
                <Ionicons name={card.icon as any} size={20} color={card.color} />
              </View>
              <Text style={[styles.insightValue, { color: theme.text }]}>{card.value}</Text>
              <Text style={[styles.insightTitle, { color: theme.textSecondary }]}>{card.title}</Text>
              <View style={[styles.changeBadge, { backgroundColor: card.change >= 0 ? '#10B98120' : '#EF444420' }]}>
                <Ionicons 
                  name={card.change >= 0 ? 'trending-up' : 'trending-down'} 
                  size={12} 
                  color={card.change >= 0 ? '#10B981' : '#EF4444'} 
                />
                <Text style={[styles.changeText, { color: card.change >= 0 ? '#10B981' : '#EF4444' }]}>
                  {card.change >= 0 ? '+' : ''}{card.change}%
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Growth Chart */}
        <View style={[styles.chartCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.chartTitle, { color: theme.text }]}>Membership Growth</Text>
          <View style={styles.chart}>
            {MONTHLY_TREND.map((data, index) => {
              const height = (data.members / maxMembers) * 120;
              return (
                <View key={data.month} style={styles.chartBar}>
                  <View style={styles.barContainer}>
                    <LinearGradient
                      colors={['#3B82F6', '#1D4ED8']}
                      style={[styles.bar, { height }]}
                    />
                  </View>
                  <Text style={[styles.barLabel, { color: theme.textSecondary }]}>{data.month}</Text>
                  <Text style={[styles.barValue, { color: theme.text }]}>{(data.members / 1000).toFixed(1)}K</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* AI Insights */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>AI Insights</Text>
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={14} color="#8B5CF6" />
              <Text style={styles.aiBadgeText}>Powered by AI</Text>
            </View>
          </View>
          
          {TOP_INSIGHTS.map((insight) => (
            <TouchableOpacity key={insight.id} style={[styles.insightItem, { backgroundColor: theme.card }]}>
              <View style={[styles.insightItemIcon, { backgroundColor: insight.color + '20' }]}>
                <Ionicons name={insight.icon as any} size={20} color={insight.color} />
              </View>
              <View style={styles.insightItemContent}>
                <Text style={[styles.insightItemTitle, { color: theme.text }]}>{insight.title}</Text>
                <Text style={[styles.insightItemDesc, { color: theme.textSecondary }]}>{insight.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Demographics */}
        <View style={[styles.demographicsCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.chartTitle, { color: theme.text }]}>Age Demographics</Text>
          <View style={styles.demographics}>
            {DEMOGRAPHIC_DATA.map((item) => (
              <View key={item.label} style={styles.demographicItem}>
                <View style={styles.demographicBar}>
                  <View 
                    style={[
                      styles.demographicFill, 
                      { backgroundColor: item.color, width: percentWidth(item.percentage) }
                    ]} 
                  />
                </View>
                <View style={styles.demographicInfo}>
                  <Text style={[styles.demographicLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                  <Text style={[styles.demographicValue, { color: theme.text }]}>{item.percentage}%</Text>
                </View>
              </View>
            ))}
          </View>
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
  timeSelector: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    marginBottom: 20,
  },
  timeOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  timeOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  insightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  insightCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  insightIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  insightValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  insightTitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chartCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 20,
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 160,
  },
  chartBar: {
    alignItems: 'center',
    flex: 1,
  },
  barContainer: {
    height: 120,
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  bar: {
    width: 28,
    borderRadius: 6,
    minHeight: 10,
  },
  barLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  barValue: {
    fontSize: 10,
    fontWeight: '600',
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
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#8B5CF620',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  aiBadgeText: {
    fontSize: 11,
    color: '#8B5CF6',
    fontWeight: '600',
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  insightItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  insightItemContent: {
    flex: 1,
  },
  insightItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  insightItemDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  demographicsCard: {
    borderRadius: 16,
    padding: 20,
  },
  demographics: {
    gap: 16,
  },
  demographicItem: {
    gap: 8,
  },
  demographicBar: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  demographicFill: {
    height: '100%',
    borderRadius: 4,
  },
  demographicInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  demographicLabel: {
    fontSize: 12,
  },
  demographicValue: {
    fontSize: 12,
    fontWeight: '600',
  },
});
