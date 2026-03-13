/**
 * Principal Reports Screen
 *
 * Central hub for principals to access all report types with live
 * summary metrics pulled from the principal hub data.
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { usePrincipalHub } from '@/hooks/usePrincipalHub';
import { formatCurrencyCompact } from '@/lib/utils/payment-utils';

const { width } = Dimensions.get('window');
const isTablet = width > 768;

interface ReportCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  route: string;
  stat?: string;
}

export default function PrincipalReportsScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { data } = usePrincipalHub();

  const stats = data.stats;
  const totalStudents = stats?.students?.total ?? 0;
  const totalTeachers = stats?.staff?.total ?? 0;
  const attendanceRate = stats?.attendanceRate?.percentage ?? 0;
  const monthlyRevenue = stats?.monthlyRevenue?.total ?? 0;
  const pendingRegistrations = stats?.pendingRegistrations?.total ?? 0;
  const pendingPayments = stats?.pendingPayments?.total ?? 0;

  const reportCategories: ReportCategory[] = [
    {
      id: 'financial',
      title: 'Financial Reports',
      description: 'Revenue, payments, fees collected, and financial trends',
      icon: 'cash',
      color: '#10B981',
      route: '/screens/financial-reports',
      stat: monthlyRevenue > 0 ? formatCurrencyCompact(monthlyRevenue) : undefined,
    },
    {
      id: 'registrations',
      title: 'Registration Reports',
      description: 'Enrollment trends, pending registrations, and approval rates',
      icon: 'person-add',
      color: '#6366F1',
      route: '/screens/principal-registrations',
      stat: pendingRegistrations > 0 ? `${pendingRegistrations} pending` : undefined,
    },
    {
      id: 'students',
      title: 'Student Reports',
      description: 'Student performance, attendance, and progress tracking',
      icon: 'people',
      color: '#8B5CF6',
      route: '/screens/student-management',
      stat: totalStudents > 0 ? `${totalStudents} enrolled` : undefined,
    },
    {
      id: 'teachers',
      title: 'Teacher Reports',
      description: 'Classroom analytics and teacher performance',
      icon: 'school',
      color: '#F59E0B',
      route: '/screens/teacher-reports',
      stat: totalTeachers > 0 ? `${totalTeachers} active` : undefined,
    },
    {
      id: 'attendance',
      title: 'Attendance Reports',
      description: 'Daily attendance records and trends',
      icon: 'calendar-outline',
      color: '#EC4899',
      route: '/screens/attendance-history',
      stat: attendanceRate > 0 ? `${Math.round(attendanceRate)}% today` : undefined,
    },
    {
      id: 'payments',
      title: 'Payment Reports',
      description: 'POP uploads, verification status, and payment history',
      icon: 'receipt',
      color: '#06B6D4',
      route: '/screens/pop-review',
      stat: pendingPayments > 0 ? `${pendingPayments} pending` : undefined,
    },
  ];

  const handleExportSummary = useCallback(async () => {
    const schoolName = profile?.organization_name || 'School';
    const date = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
    const lines = [
      `${schoolName} — Report Summary`,
      `Generated: ${date}`,
      '',
      `Students: ${totalStudents}`,
      `Teachers: ${totalTeachers}`,
      `Attendance rate: ${Math.round(attendanceRate)}%`,
      `Monthly revenue: ${monthlyRevenue > 0 ? formatCurrencyCompact(monthlyRevenue) : 'N/A'}`,
      `Pending registrations: ${pendingRegistrations}`,
      `Pending payments: ${pendingPayments}`,
    ];
    await Share.share({
      message: lines.join('\n'),
      title: `${schoolName} Report Summary`,
    });
  }, [totalStudents, totalTeachers, attendanceRate, monthlyRevenue, pendingRegistrations, pendingPayments, profile?.organization_name]);

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title="Reports"
        subtitle={`${profile?.organization_name || 'School'} Analytics`}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Live summary strip */}
        <View style={styles.summaryStrip}>
          <SummaryPill icon="people" value={String(totalStudents)} label="Students" color="#8B5CF6" theme={theme} />
          <SummaryPill icon="school" value={String(totalTeachers)} label="Teachers" color="#F59E0B" theme={theme} />
          <SummaryPill icon="checkmark-circle" value={`${Math.round(attendanceRate)}%`} label="Attendance" color="#10B981" theme={theme} />
          {monthlyRevenue > 0 && (
            <SummaryPill icon="cash" value={formatCurrencyCompact(monthlyRevenue)} label="Revenue" color="#06B6D4" theme={theme} />
          )}
        </View>

        <Text style={styles.sectionTitle}>Report Categories</Text>

        <View style={styles.grid}>
          {reportCategories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={styles.card}
              onPress={() => router.push(category.route as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${category.color}15` }]}>
                <Ionicons name={category.icon as any} size={26} color={category.color} />
              </View>
              <Text style={styles.cardTitle}>{category.title}</Text>
              <Text style={styles.cardDescription} numberOfLines={2}>{category.description}</Text>
              {category.stat ? (
                <View style={[styles.statBadge, { backgroundColor: `${category.color}12` }]}>
                  <Text style={[styles.statText, { color: category.color }]}>{category.stat}</Text>
                </View>
              ) : null}
              <View style={styles.cardFooter}>
                <Text style={[styles.viewLink, { color: category.color }]}>View</Text>
                <Ionicons name="chevron-forward" size={14} color={category.color} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Export action */}
        <TouchableOpacity style={[styles.exportCard, { borderColor: theme.border }]} onPress={handleExportSummary} activeOpacity={0.85}>
          <View style={[styles.exportIcon, { backgroundColor: '#6366F115' }]}>
            <Ionicons name="share-outline" size={22} color="#6366F1" />
          </View>
          <View style={styles.exportText}>
            <Text style={[styles.exportTitle, { color: theme.text }]}>Export Summary</Text>
            <Text style={[styles.exportSub, { color: theme.textSecondary }]}>
              Share a text snapshot of key school metrics via WhatsApp, email, or any app
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </TouchableOpacity>

        {/* Analytics link */}
        <TouchableOpacity
          style={[styles.exportCard, { borderColor: theme.border, marginTop: 10 }]}
          onPress={() => router.push('/screens/principal-analytics' as any)}
          activeOpacity={0.85}
        >
          <View style={[styles.exportIcon, { backgroundColor: '#EC489915' }]}>
            <Ionicons name="analytics" size={22} color="#EC4899" />
          </View>
          <View style={styles.exportText}>
            <Text style={[styles.exportTitle, { color: theme.text }]}>Detailed Analytics</Text>
            <Text style={[styles.exportSub, { color: theme.textSecondary }]}>
              Trends, graphs, and downloadable PDF reports
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryPill({ icon, value, label, color, theme }: { icon: any; value: string; label: string; color: string; theme: any }) {
  return (
    <View style={[summaryStyles.pill, { backgroundColor: `${color}0C`, borderColor: `${color}20` }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[summaryStyles.value, { color: theme.text }]}>{value}</Text>
      <Text style={[summaryStyles.label, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  pill: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, minWidth: 76 },
  value: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  label: { fontSize: 10, fontWeight: '600', marginTop: 2 },
});

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { flex: 1 },
    contentContainer: { padding: 16, paddingBottom: 40 },
    summaryStrip: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 14 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
    card: {
      width: isTablet ? '31%' : '46%',
      backgroundColor: theme.cardBackground || theme.surface,
      borderRadius: 18,
      padding: 16,
      margin: 6,
      borderWidth: 1,
      borderColor: theme.border,
    },
    iconContainer: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 4 },
    cardDescription: { fontSize: 11, color: theme.textSecondary, lineHeight: 16, marginBottom: 8 },
    statBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 8 },
    statText: { fontSize: 11, fontWeight: '700' },
    cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 'auto', gap: 4 },
    viewLink: { fontSize: 12, fontWeight: '700' },
    exportCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      backgroundColor: theme.cardBackground || theme.surface,
      marginTop: 20,
      gap: 12,
    },
    exportIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    exportText: { flex: 1 },
    exportTitle: { fontSize: 14, fontWeight: '700' },
    exportSub: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  });
