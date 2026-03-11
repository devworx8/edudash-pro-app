import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useLearnerEnrollments } from '@/hooks/useLearnerData';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { percentWidth } from '@/lib/progress/clampPercent';
export default function LearnerProgramsScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const { data: enrollments, isLoading, error } = useLearnerEnrollments();

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: t('learner.my_programs', { defaultValue: 'My Programs' }),
          headerBackTitle: t('common.back', { defaultValue: 'Back' }),
        }} 
      />
      <ScrollView contentContainerStyle={styles.content}>
        {isLoading && (
          <View style={styles.empty}>
            <EduDashSpinner size="large" color={theme.primary} />
          </View>
        )}

        {error && (
          <Card padding={20} margin={0}>
            <Text style={styles.errorText}>
              {t('common.error_loading', { defaultValue: 'Error loading programs' })}
            </Text>
          </Card>
        )}

        {!isLoading && (!enrollments || enrollments.length === 0) && (
          <EmptyState
            icon="school-outline"
            title={t('learner.no_programs', { defaultValue: 'No Programs Yet' })}
            description={t('learner.enroll_prompt', { defaultValue: 'Browse available programs and enroll to start learning' })}
            actionLabel={t('learner.browse_programs', { defaultValue: 'Browse Programs' })}
            onActionPress={() => router.push('/register')}
          />
        )}

        {enrollments && enrollments.map((enrollment) => (
          <Card key={enrollment.id} padding={16} margin={0} elevation="small" style={styles.programCard}>
            <TouchableOpacity
              onPress={() => router.push(`/screens/learner/program-detail?id=${enrollment.program_id}`)}
            >
              <View style={styles.programHeader}>
                <View style={styles.programInfo}>
                  <Text style={styles.programTitle}>{enrollment.program?.title || 'Program'}</Text>
                  <Text style={styles.programCode}>{enrollment.program?.code || ''}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(enrollment.is_active ? 'enrolled' : 'withdrawn', theme) }]}>
                  <Text style={styles.statusText}>{enrollment.is_active ? 'Enrolled' : 'Withdrawn'}</Text>
                </View>
              </View>
              <View style={styles.progressSection}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressBarFill, 
                      { width: percentWidth(0), backgroundColor: theme.primary } // TODO: Calculate progress from course modules
                    ]} 
                  />
                </View>
                <Text style={styles.progressText}>
                  0% {t('learner.complete', { defaultValue: 'complete' })}
                </Text>
              </View>
              <View style={styles.footer}>
                <Text style={styles.enrolledDate}>
                  {t('learner.enrolled_on', { defaultValue: 'Enrolled' })}: {new Date(enrollment.enrolled_at).toLocaleDateString()}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </View>
            </TouchableOpacity>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

function getStatusColor(status: string, theme: any): string {
  switch (status) {
    case 'completed':
      return theme.success || '#10B981';
    case 'enrolled':
      return theme.primary;
    case 'withdrawn':
      return theme.textSecondary;
    default:
      return theme.border;
  }
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme?.background || '#0b1220' },
  content: { padding: 16, paddingBottom: 32 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  programCard: { marginBottom: 12 },
  programHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  programInfo: { flex: 1 },
  programTitle: { color: theme?.text || '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  programCode: { color: theme?.textSecondary || '#9CA3AF', fontSize: 13 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  progressSection: { marginBottom: 12 },
  progressBar: { height: 8, backgroundColor: theme?.border || '#374151', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', borderRadius: 4 },
  progressText: { color: theme?.textSecondary || '#9CA3AF', fontSize: 12 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  enrolledDate: { color: theme?.textSecondary || '#9CA3AF', fontSize: 12 },
  errorText: { color: theme?.error || '#EF4444', textAlign: 'center' },
});

