/**
 * Org Admin Program Detail Screen
 * 
 * Shows program details and allows management by executives/admins
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { ProgramCodeShareModal } from '@/components/org-admin/ProgramCodeShareModal';
import { EnrollmentInviteModal } from '@/components/org-admin/EnrollmentInviteModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface ProgramDetail {
  id: string;
  title: string;
  description: string | null;
  course_code: string | null;
  is_active: boolean;
  max_students: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  organization_id: string;
  instructor_id: string | null;
  instructor?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

interface Enrollment {
  id: string;
  student_id: string;
  enrolled_at: string;
  is_active: boolean;
  student?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();

  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);

  // Fetch program details
  const { data: program, isLoading, error, refetch } = useQuery({
    queryKey: ['program-detail', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await assertSupabase()
        .from('courses')
        .select(`
          *,
          instructor:profiles!courses_instructor_id_fkey(
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as ProgramDetail;
    },
    enabled: !!id,
  });

  // Fetch enrollments
  const { data: enrollments, isLoading: loadingEnrollments } = useQuery({
    queryKey: ['program-enrollments', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await assertSupabase()
        .from('enrollments')
        .select(`
          id,
          student_id,
          enrolled_at,
          is_active,
          student:profiles!enrollments_student_id_fkey(
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('course_id', id)
        .order('enrolled_at', { ascending: false });

      if (error) throw error;
      
      // Transform the data to flatten the student array from Supabase join
      const transformed = (data || []).map((enrollment: any) => ({
        ...enrollment,
        student: Array.isArray(enrollment.student) 
          ? enrollment.student[0] 
          : enrollment.student,
      }));
      
      return transformed as Enrollment[];
    },
    enabled: !!id,
  });

  // Generate course code mutation
  const generateCodeMutation = useMutation({
    mutationFn: async () => {
      if (!id || !program) throw new Error('Program not found');
      
      // Generate a unique code
      const prefix = 'PRG';
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      const newCode = `${prefix}-${timestamp.slice(-4)}${random}`;

      const { error } = await assertSupabase()
        .from('courses')
        .update({ course_code: newCode })
        .eq('id', id);

      if (error) throw error;
      return newCode;
    },
    onSuccess: (newCode) => {
      queryClient.invalidateQueries({ queryKey: ['program-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['org-programs'] });
      showAlert({ title: 'Success', message: `Program code generated: ${newCode}`, type: 'success' });
    },
    onError: (error: any) => {
      showAlert({ title: 'Error', message: error.message || 'Failed to generate code', type: 'error' });
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async () => {
      if (!id || !program) throw new Error('Program not found');
      
      const { error } = await assertSupabase()
        .from('courses')
        .update({ is_active: !program.is_active })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['org-programs'] });
      showAlert({ title: 'Success', message: `Program ${program?.is_active ? 'deactivated' : 'activated'}`, type: 'success' });
    },
    onError: (error: any) => {
      showAlert({ title: 'Error', message: error.message || 'Failed to update program', type: 'error' });
    },
  });

  const activeEnrollments = enrollments?.filter(e => e.is_active) || [];
  const inactiveEnrollments = enrollments?.filter(e => !e.is_active) || [];

  const handleEdit = () => {
    router.push(`/screens/org-admin/edit-program?id=${id}` as any);
  };

  const handleGenerateCode = () => {
    showAlert({
      title: 'Generate Program Code',
      message: 'This will create a unique code that learners can use to enroll. Continue?',
      type: 'info',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate', onPress: () => generateCodeMutation.mutate() },
      ]
    });
  };

  const handleToggleActive = () => {
    showAlert({
      title: program?.is_active ? 'Deactivate Program' : 'Activate Program',
      message: program?.is_active 
        ? 'This will hide the program from learners. Existing enrollments will not be affected.'
        : 'This will make the program visible to learners again.',
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => toggleActiveMutation.mutate() },
      ]
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Program Details' }} />
        <View style={styles.centered}>
          <EduDashSpinner size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !program) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Program Details' }} />
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.error} />
          <Text style={styles.errorText}>Program not found</Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: program.title,
          headerStyle: { backgroundColor: theme.background },
          headerTitleStyle: { color: theme.text },
          headerTintColor: theme.primary,
          headerRight: () => (
            <TouchableOpacity onPress={handleEdit} style={{ marginRight: 8 }}>
              <Ionicons name="create-outline" size={24} color={theme.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={theme.primary} />
        }
      >
        {/* Program Info Card */}
        <Card padding={16} margin={0} style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{program.title}</Text>
            <View style={[
              styles.statusBadge,
              { backgroundColor: program.is_active ? (theme.success || '#10B981') + '20' : theme.error + '20' }
            ]}>
              <Text style={[
                styles.statusText,
                { color: program.is_active ? (theme.success || '#10B981') : theme.error }
              ]}>
                {program.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          {/* Course Code */}
          <View style={styles.codeSection}>
            <Text style={styles.label}>Program Code</Text>
            {program.course_code ? (
              <View style={styles.codeRow}>
                <Text style={[styles.codeValue, { color: theme.primary }]}>
                  {program.course_code}
                </Text>
                <TouchableOpacity
                  style={[styles.smallButton, { backgroundColor: theme.primary + '20' }]}
                  onPress={() => setShareModalVisible(true)}
                >
                  <Ionicons name="share-outline" size={16} color={theme.primary} />
                  <Text style={[styles.smallButtonText, { color: theme.primary }]}>Share</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.noCodeSection}>
                <Text style={[styles.noCodeText, { color: theme.warning || '#F59E0B' }]}>
                  No code assigned
                </Text>
                <TouchableOpacity
                  style={[styles.generateButton, { backgroundColor: theme.primary }]}
                  onPress={handleGenerateCode}
                  disabled={generateCodeMutation.isPending}
                >
                  {generateCodeMutation.isPending ? (
                    <EduDashSpinner size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="key-outline" size={16} color="#fff" />
                      <Text style={styles.generateButtonText}>Generate Code</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {program.description && (
            <>
              <Text style={styles.label}>Description</Text>
              <Text style={styles.description}>{program.description}</Text>
            </>
          )}

          {/* Meta info */}
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={18} color={theme.textSecondary} />
              <Text style={styles.metaLabel}>Instructor</Text>
              <Text style={styles.metaValue}>
                {program.instructor
                  ? `${program.instructor.first_name || ''} ${program.instructor.last_name || ''}`.trim()
                  : 'Not assigned'}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={18} color={theme.textSecondary} />
              <Text style={styles.metaLabel}>Capacity</Text>
              <Text style={styles.metaValue}>
                {program.max_students ? `${activeEnrollments.length}/${program.max_students}` : 'Unlimited'}
              </Text>
            </View>
            {program.start_date && (
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={18} color={theme.textSecondary} />
                <Text style={styles.metaLabel}>Start Date</Text>
                <Text style={styles.metaValue}>
                  {new Date(program.start_date).toLocaleDateString()}
                </Text>
              </View>
            )}
            {program.end_date && (
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={18} color={theme.textSecondary} />
                <Text style={styles.metaLabel}>End Date</Text>
                <Text style={styles.metaValue}>
                  {new Date(program.end_date).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>
        </Card>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.primary }]}
            onPress={() => setInviteModalVisible(true)}
          >
            <Ionicons name="mail-outline" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Invite Learners</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}
            onPress={handleToggleActive}
          >
            <Ionicons 
              name={program.is_active ? 'pause-outline' : 'play-outline'} 
              size={20} 
              color={theme.text} 
            />
            <Text style={[styles.actionButtonText, { color: theme.text }]}>
              {program.is_active ? 'Deactivate' : 'Activate'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Enrollments Section */}
        <Card padding={16} margin={0} style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Enrollments ({activeEnrollments.length})</Text>
            <TouchableOpacity
              style={[styles.smallButton, { backgroundColor: theme.primary }]}
              onPress={() => router.push(`/screens/org-admin/manual-enrollment?programId=${id}` as any)}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={[styles.smallButtonText, { color: '#fff' }]}>Add</Text>
            </TouchableOpacity>
          </View>

          {loadingEnrollments ? (
            <EduDashSpinner size="small" color={theme.primary} />
          ) : activeEnrollments.length === 0 ? (
            <View style={styles.emptyEnrollments}>
              <Ionicons name="people-outline" size={40} color={theme.textSecondary} />
              <Text style={styles.emptyText}>No learners enrolled yet</Text>
              <Text style={styles.emptySubtext}>
                Share the program code or send invites to get learners enrolled
              </Text>
            </View>
          ) : (
            <View style={styles.enrollmentList}>
              {activeEnrollments.slice(0, 5).map((enrollment) => (
                <View key={enrollment.id} style={styles.enrollmentItem}>
                  <View style={styles.enrollmentInfo}>
                    <Text style={styles.enrollmentName}>
                      {enrollment.student
                        ? `${enrollment.student.first_name || ''} ${enrollment.student.last_name || ''}`.trim() || 'Unknown'
                        : 'Unknown'}
                    </Text>
                    <Text style={styles.enrollmentEmail}>
                      {enrollment.student?.email || 'No email'}
                    </Text>
                  </View>
                  <Text style={styles.enrollmentDate}>
                    {new Date(enrollment.enrolled_at).toLocaleDateString()}
                  </Text>
                </View>
              ))}
              {activeEnrollments.length > 5 && (
                <TouchableOpacity
                  style={styles.viewAllButton}
                  onPress={() => router.push(`/screens/org-admin/enrollments?programId=${id}` as any)}
                >
                  <Text style={[styles.viewAllText, { color: theme.primary }]}>
                    View all {activeEnrollments.length} enrollments
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.primary} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </Card>
      </ScrollView>

      {/* Modals */}
      {program.course_code && (
        <ProgramCodeShareModal
          visible={shareModalVisible}
          onClose={() => setShareModalVisible(false)}
          theme={theme}
          program={{
            id: program.id,
            title: program.title,
            course_code: program.course_code,
          }}
        />
      )}

      <EnrollmentInviteModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        theme={theme}
        programId={program.id}
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
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  card: {
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  codeSection: {
    backgroundColor: theme.background,
    padding: 12,
    borderRadius: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  codeValue: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  noCodeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  noCodeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  smallButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  metaItem: {
    minWidth: '45%',
    gap: 2,
  },
  metaLabel: {
    fontSize: 11,
    color: theme.textSecondary,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
  },
  emptyEnrollments: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  emptySubtext: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  enrollmentList: {
    gap: 8,
    marginTop: 8,
  },
  enrollmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  enrollmentInfo: {
    flex: 1,
    gap: 2,
  },
  enrollmentName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  enrollmentEmail: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  enrollmentDate: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 12,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: theme.text,
    marginBottom: 16,
  },
});
