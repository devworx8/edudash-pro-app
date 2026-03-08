/**
 * Membership Module - Main Navigation Hub
 * Entry point for EduPro membership system
 */
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Dimensions,
  Image,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { assertSupabase } from '@/lib/supabase';
import { DashboardWallpaperBackground } from '@/components/membership/dashboard';
import { logger } from '@/lib/logger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Navigation items
const MAIN_MODULES: Array<{
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
  gradient: [string, string];
}> = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Overview & analytics',
    icon: 'grid-outline',
    route: '/screens/membership/dashboard',
    color: '#3B82F6',
    gradient: ['#3B82F6', '#2563EB'],
  },
  {
    id: 'members',
    title: 'Members',
    description: 'Manage membership',
    icon: 'people-outline',
    route: '/screens/membership/members',
    color: '#10B981',
    gradient: ['#10B981', '#059669'],
  },
  {
    id: 'id-card',
    title: 'My ID Card',
    description: 'View & share card',
    icon: 'card-outline',
    route: '/screens/membership/id-card',
    color: '#8B5CF6',
    gradient: ['#8B5CF6', '#7C3AED'],
  },
  {
    id: 'resources',
    title: 'Resources',
    description: 'Documents & materials',
    icon: 'folder-outline',
    route: '/screens/membership/resources',
    color: '#F59E0B',
    gradient: ['#F59E0B', '#D97706'],
  },
  {
    id: 'finance',
    title: 'Finance',
    description: 'Payments & invoices',
    icon: 'wallet-outline',
    route: '/screens/membership/finance',
    color: '#EF4444',
    gradient: ['#EF4444', '#DC2626'],
  },
  {
    id: 'events',
    title: 'Events',
    description: 'Calendar & meetings',
    icon: 'calendar-outline',
    route: '/screens/membership/events',
    color: '#06B6D4',
    gradient: ['#06B6D4', '#0891B2'],
  },
];

const QUICK_STATS = [
  { label: 'Total Members', value: '2,847', trend: '+12%', trendUp: true },
  { label: 'Active Rate', value: '78.5%', trend: '+3.2%', trendUp: true },
  { label: 'This Month', value: 'R185K', trend: '-5%', trendUp: false },
];

export default function MembershipIndexScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [dashboardRoute, setDashboardRoute] = useState('/screens/membership/dashboard');

  useEffect(() => {
    checkUserRoleForDashboard();
  }, []);

  const checkUserRoleForDashboard = async () => {
    try {
      const supabase = assertSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: member } = await supabase
        .from('organization_members')
        .select('role, member_type')
        .eq('user_id', user.id)
        .single();

      if (member && (member.role === 'national_admin' || member.member_type === 'ceo')) {
        setDashboardRoute('/screens/membership/ceo-dashboard');
      }
    } catch (error) {
      logger.error('Error checking user role:', error);
    }
  };

  const handleDashboardPress = () => {
    router.push(dashboardRoute as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'EduPro',
          headerRight: () => (
            <View style={styles.headerButtons}>
              <TouchableOpacity style={styles.headerButton}>
                <Ionicons name="notifications-outline" size={24} color={theme.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerButton}>
                <Ionicons name="settings-outline" size={24} color={theme.primary} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <DashboardWallpaperBackground>
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Banner */}
        <LinearGradient
          colors={['#166534', '#15803D', '#22C55E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBanner}
        >
          <View style={styles.heroOverlay}>
            <View style={styles.heroContent}>
              <View style={styles.heroLogo}>
                <Ionicons name="leaf" size={32} color="#fff" />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>EduPro</Text>
                <Text style={styles.heroSubtitle}>Membership Portal</Text>
              </View>
            </View>
            
            {/* Decorative Elements */}
            <View style={[styles.heroCircle, styles.heroCircle1]} />
            <View style={[styles.heroCircle, styles.heroCircle2]} />
            <View style={[styles.heroCircle, styles.heroCircle3]} />
          </View>
        </LinearGradient>

        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          {QUICK_STATS.map((stat, index) => (
            <View key={index} style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{stat.label}</Text>
              <View style={styles.statTrend}>
                <Ionicons 
                  name={stat.trendUp ? 'trending-up' : 'trending-down'} 
                  size={14} 
                  color={stat.trendUp ? '#10B981' : '#EF4444'} 
                />
                <Text style={[styles.statTrendText, { color: stat.trendUp ? '#10B981' : '#EF4444' }]}>
                  {stat.trend}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Main Navigation Grid */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Navigation</Text>
          <View style={styles.moduleGrid}>
            {MAIN_MODULES.map((module) => (
              <TouchableOpacity
                key={module.id}
                style={styles.moduleCard}
                onPress={() => {
                  if (module.id === 'dashboard') {
                    handleDashboardPress();
                  } else {
                    router.push(module.route as any);
                  }
                }}
              >
                <LinearGradient
                  colors={module.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.moduleGradient}
                >
                  <View style={styles.moduleIcon}>
                    <Ionicons name={module.icon} size={28} color="#fff" />
                  </View>
                  <Text style={styles.moduleTitle}>{module.title}</Text>
                  <Text style={styles.moduleDesc}>{module.description}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent Activity Preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Activity</Text>
            <TouchableOpacity>
              <Text style={[styles.seeAll, { color: theme.primary }]}>See all</Text>
            </TouchableOpacity>
          </View>
          
          <View style={[styles.activityCard, { backgroundColor: theme.card }]}>
            <View style={[styles.activityIcon, { backgroundColor: '#10B98120' }]}>
              <Ionicons name="person-add-outline" size={18} color="#10B981" />
            </View>
            <View style={styles.activityInfo}>
              <Text style={[styles.activityText, { color: theme.text }]}>
                <Text style={styles.activityBold}>3 new members</Text> registered today
              </Text>
              <Text style={[styles.activityTime, { color: theme.textSecondary }]}>2 hours ago</Text>
            </View>
          </View>
          
          <View style={[styles.activityCard, { backgroundColor: theme.card }]}>
            <View style={[styles.activityIcon, { backgroundColor: '#3B82F620' }]}>
              <Ionicons name="cash-outline" size={18} color="#3B82F6" />
            </View>
            <View style={styles.activityInfo}>
              <Text style={[styles.activityText, { color: theme.text }]}>
                <Text style={styles.activityBold}>R12,500</Text> collected in payments
              </Text>
              <Text style={[styles.activityTime, { color: theme.textSecondary }]}>5 hours ago</Text>
            </View>
          </View>
          
          <View style={[styles.activityCard, { backgroundColor: theme.card }]}>
            <View style={[styles.activityIcon, { backgroundColor: '#F59E0B20' }]}>
              <Ionicons name="calendar-outline" size={18} color="#F59E0B" />
            </View>
            <View style={styles.activityInfo}>
              <Text style={[styles.activityText, { color: theme.text }]}>
                <Text style={styles.activityBold}>Workshop</Text> scheduled for Jan 8
              </Text>
              <Text style={[styles.activityTime, { color: theme.textSecondary }]}>Yesterday</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity style={[styles.quickAction, { backgroundColor: theme.card }]}>
              <Ionicons name="person-add" size={22} color={theme.primary} />
              <Text style={[styles.quickActionText, { color: theme.text }]}>Add Member</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.quickAction, { backgroundColor: theme.card }]}>
              <Ionicons name="receipt" size={22} color={theme.primary} />
              <Text style={[styles.quickActionText, { color: theme.text }]}>New Invoice</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.quickAction, { backgroundColor: theme.card }]}>
              <Ionicons name="cloud-upload" size={22} color={theme.primary} />
              <Text style={[styles.quickActionText, { color: theme.text }]}>Upload</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.quickAction, { backgroundColor: theme.card }]}>
              <Ionicons name="megaphone" size={22} color={theme.primary} />
              <Text style={[styles.quickActionText, { color: theme.text }]}>Announce</Text>
            </TouchableOpacity>
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
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
    marginRight: 16,
  },
  headerButton: {},
  content: {
    flex: 1,
  },
  
  // Hero
  heroBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  heroOverlay: {
    padding: 24,
    position: 'relative',
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    zIndex: 1,
  },
  heroLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {},
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  heroCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroCircle1: {
    width: 120,
    height: 120,
    top: -30,
    right: -30,
  },
  heroCircle2: {
    width: 80,
    height: 80,
    bottom: -20,
    right: 60,
  },
  heroCircle3: {
    width: 40,
    height: 40,
    top: 10,
    right: 100,
  },
  
  // Stats
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  statTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6,
  },
  statTrendText: {
    fontSize: 11,
    fontWeight: '600',
  },
  
  // Section
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Module Grid
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  moduleCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    borderRadius: 16,
    overflow: 'hidden',
  },
  moduleGradient: {
    padding: 18,
    minHeight: 130,
    justifyContent: 'flex-end',
  },
  moduleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  moduleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  moduleDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  
  // Activity
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityInfo: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
  },
  activityBold: {
    fontWeight: '600',
  },
  activityTime: {
    fontSize: 11,
    marginTop: 2,
  },
  
  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    gap: 8,
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
