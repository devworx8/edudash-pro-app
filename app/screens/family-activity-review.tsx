import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { SubPageHeader } from '@/components/SubPageHeader';
import { assertSupabase } from '@/lib/supabase';
import { getPOPFileUrl } from '@/lib/popUpload';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';

interface StudentSummary {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  class_id?: string | null;
}

interface ProgressUpload {
  id: string;
  student_id: string;
  title: string;
  description?: string | null;
  subject?: string | null;
  learning_area?: string | null;
  achievement_level?: string | null;
  status?: string | null;
  file_path: string;
  file_name?: string | null;
  created_at: string;
  student?: StudentSummary | StudentSummary[] | null;
}

interface TutorAttempt {
  id: string;
  student_id: string;
  score?: number | null;
  feedback?: string | null;
  topic?: string | null;
  subject?: string | null;
  metadata?: any;
  created_at: string;
}

type ReviewFilter = 'all' | 'needs_grading' | 'graded';

const STAFF_ROLES = ['teacher', 'principal', 'principal_admin', 'admin', 'super_admin', 'superadmin'];
const PRINCIPAL_ROLES = ['principal', 'principal_admin', 'admin', 'super_admin', 'superadmin'];

const formatDateTime = (value?: string | null): string => {
  if (!value) return 'Unknown time';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const pickStudent = (student?: StudentSummary | StudentSummary[] | null): StudentSummary | null => {
  if (!student) return null;
  if (Array.isArray(student)) return student[0] || null;
  return student;
};

const toName = (student?: StudentSummary | StudentSummary[] | null): string => {
  const target = pickStudent(student);
  if (!target) return 'Student';
  const full = `${target.first_name || ''} ${target.last_name || ''}`.trim();
  return full || 'Student';
};

const parseMetadata = (metadata: any): Record<string, any> => {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  if (typeof metadata === 'object') return metadata;
  return {};
};

export default function FamilyActivityReviewScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const role = String(profile?.role || '').toLowerCase();
  const isStaff = STAFF_ROLES.includes(role);
  const isPrincipalView = PRINCIPAL_ROLES.includes(role);
  const organizationId = (profile as any)?.organization_id || (profile as any)?.preschool_id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<ProgressUpload[]>([]);
  const [attempts, setAttempts] = useState<TutorAttempt[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>('all');

  const fetchScopedStudents = useCallback(async (): Promise<StudentSummary[]> => {
    if (!organizationId) return [];
    const supabase = assertSupabase();

    if (isPrincipalView) {
      const { data, error: studentsError } = await supabase
        .from('students')
        .select('id, first_name, last_name, class_id')
        .or(`preschool_id.eq.${organizationId},organization_id.eq.${organizationId}`)
        .order('first_name', { ascending: true });
      if (studentsError) throw studentsError;
      return (data || []) as StudentSummary[];
    }

    const teacherIds = [profile?.id, user?.id].filter(Boolean) as string[];
    if (teacherIds.length === 0) return [];

    const { data: classesData, error: classesError } = await supabase
      .from('classes')
      .select('id')
      .in('teacher_id', teacherIds)
      .or(`preschool_id.eq.${organizationId},organization_id.eq.${organizationId}`);
    if (classesError) throw classesError;

    const classIds = (classesData || []).map((cls: any) => cls.id).filter(Boolean) as string[];
    if (classIds.length === 0) return [];

    const { data: studentsData, error: studentsError } = await supabase
      .from('students')
      .select('id, first_name, last_name, class_id')
      .in('class_id', classIds);
    if (studentsError) throw studentsError;
    return (studentsData || []) as StudentSummary[];
  }, [isPrincipalView, organizationId, profile?.id, user?.id]);

  const fetchData = useCallback(async () => {
    if (!organizationId) {
      setError('Organization not found for this account.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!isStaff) {
      setError('This screen is only available to teachers and school admins.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      const supabase = assertSupabase();
      const scopedStudents = await fetchScopedStudents();
      const scopedStudentIds = scopedStudents.map((s) => s.id).filter(Boolean);

      if (!isPrincipalView && scopedStudentIds.length === 0) {
        setUploads([]);
        setAttempts([]);
        return;
      }

      let uploadQuery = supabase
        .from('pop_uploads')
        .select(`
          id,
          student_id,
          title,
          description,
          subject,
          learning_area,
          achievement_level,
          status,
          file_path,
          file_name,
          created_at,
          student:students (
            id,
            first_name,
            last_name,
            class_id
          )
        `)
        .eq('upload_type', 'picture_of_progress')
        .eq('preschool_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(250);

      if (scopedStudentIds.length > 0) {
        uploadQuery = uploadQuery.in('student_id', scopedStudentIds);
      }

      const { data: uploadData, error: uploadError } = await uploadQuery;
      if (uploadError) throw uploadError;

      const uploadsResult = (uploadData || []) as ProgressUpload[];
      const uploadIds = uploadsResult.map((item) => item.id);

      let attemptsResult: TutorAttempt[] = [];
      if (scopedStudentIds.length > 0) {
        const { data: attemptData, error: attemptError } = await supabase
          .from('dash_ai_tutor_attempts')
          .select('id, student_id, score, feedback, topic, subject, metadata, created_at')
          .in('student_id', scopedStudentIds)
          .order('created_at', { ascending: false })
          .limit(500);
        if (attemptError) throw attemptError;

        attemptsResult = ((attemptData || []) as TutorAttempt[]).filter((attempt) => {
          const metadata = parseMetadata(attempt.metadata);
          const contextTag = String(metadata.context_tag || '').toLowerCase();
          const source = String(metadata.source || '').toLowerCase();
          const progressUploadId = String(metadata.progress_upload_id || '');
          if (contextTag === 'family_activity') return true;
          if (source === 'dash_playground_activity') return true;
          if (progressUploadId && uploadIds.includes(progressUploadId)) return true;
          if (String(attempt.subject || '').toLowerCase() === 'family_activity') return true;
          return false;
        });
      }

      setUploads(uploadsResult);
      setAttempts(attemptsResult);
    } catch (fetchError: any) {
      console.error('[FamilyActivityReview] Failed to load data:', fetchError);
      setError(fetchError?.message || 'Failed to load family activity records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchScopedStudents, isPrincipalView, isStaff, organizationId]);

  useFocusEffect(
    useCallback(() => {
      void fetchData();
    }, [fetchData]),
  );

  const attemptsByUploadId = useMemo(() => {
    const mapping = new Map<string, TutorAttempt>();
    attempts.forEach((attempt) => {
      const metadata = parseMetadata(attempt.metadata);
      const uploadId = metadata.progress_upload_id;
      if (!uploadId || mapping.has(uploadId)) return;
      mapping.set(uploadId, attempt);
    });
    return mapping;
  }, [attempts]);

  const filteredUploads = useMemo(() => {
    return uploads.filter((upload) => {
      const hasGrade = attemptsByUploadId.has(upload.id);
      if (filter === 'needs_grading') return !hasGrade;
      if (filter === 'graded') return hasGrade;
      return true;
    });
  }, [attemptsByUploadId, filter, uploads]);

  const stats = useMemo(() => {
    const gradedCount = uploads.filter((upload) => attemptsByUploadId.has(upload.id)).length;
    const scores = attempts
      .map((attempt) => Number(attempt.score))
      .filter((score) => Number.isFinite(score));
    const averageScore = scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : null;
    return {
      totalUploads: uploads.length,
      gradedCount,
      needsGrading: Math.max(uploads.length - gradedCount, 0),
      averageScore,
    };
  }, [attempts, attemptsByUploadId, uploads]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchData();
  }, [fetchData]);

  const openEvidence = useCallback(async (upload: ProgressUpload) => {
    try {
      const signedUrl = await getPOPFileUrl('picture_of_progress', upload.file_path);
      if (!signedUrl) {
        showAlert({ title: 'Unable to open file', message: 'Could not create a secure link for this upload.', type: 'error' });
        return;
      }
      const canOpen = await Linking.canOpenURL(signedUrl);
      if (!canOpen) {
        showAlert({ title: 'Unable to open file', message: 'No app is available to open this file link.', type: 'error' });
        return;
      }
      await Linking.openURL(signedUrl);
    } catch (openError: any) {
      showAlert({ title: 'Unable to open file', message: openError?.message || 'Please try again.', type: 'error' });
    }
  }, []);

  const gradeUpload = useCallback((upload: ProgressUpload) => {
    const studentName = toName(upload.student);
    const submissionContent = `${studentName} completed ${upload.title}. ${upload.description || ''}`.trim();
    const studentAge = (upload as any).student?.date_of_birth
      ? `Age ${Math.max(3, Math.min(7, Math.floor((Date.now() - new Date((upload as any).student.date_of_birth).getTime()) / 31557600000)))}`
      : 'Age 3-6';
    router.push({
      pathname: '/screens/ai-homework-grader-live',
      params: {
        assignmentTitle: encodeURIComponent(`${upload.title} Review`),
        gradeLevel: encodeURIComponent(studentAge),
        submissionContent: encodeURIComponent(submissionContent),
        studentId: upload.student_id,
        progressUploadId: upload.id,
        contextTag: encodeURIComponent('family_activity'),
        sourceFlow: encodeURIComponent('family_activity_review'),
        activityTitle: encodeURIComponent(upload.title),
      },
    } as any);
  }, []);

  const recentAttempts = useMemo(() => attempts.slice(0, 8), [attempts]);

  return (
    <View style={styles.container}>
      <SubPageHeader
        title="Family Activity Review"
        subtitle={isPrincipalView ? 'School-wide uploads and grading' : 'Your class uploads and grading'}
      />

      {loading ? (
        <View style={styles.centered}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading family activity records...</Text>
        </View>
      ) : error ? (
        <ScrollView
          contentContainerStyle={styles.centered}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
        >
          <Ionicons name="alert-circle" size={28} color={theme.error} />
          <Text style={styles.errorText}>{error}</Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalUploads}</Text>
              <Text style={styles.statLabel}>Uploads</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.needsGrading}</Text>
              <Text style={styles.statLabel}>Needs Grading</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.averageScore ?? '--'}</Text>
              <Text style={styles.statLabel}>Avg Score</Text>
            </View>
          </View>

          <View style={styles.filterRow}>
            {[
              { id: 'all', label: 'All' },
              { id: 'needs_grading', label: 'Needs Grading' },
              { id: 'graded', label: 'Graded' },
            ].map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.filterChip, filter === item.id && styles.filterChipActive]}
                onPress={() => setFilter(item.id as ReviewFilter)}
              >
                <Text style={[styles.filterText, filter === item.id && styles.filterTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Recent Family Uploads</Text>
          {filteredUploads.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No uploads match this filter yet.</Text>
            </View>
          ) : (
            filteredUploads.map((upload) => {
              const linkedAttempt = attemptsByUploadId.get(upload.id);
              return (
                <View key={upload.id} style={styles.uploadCard}>
                  <View style={styles.uploadHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.uploadTitle}>{upload.title}</Text>
                      <Text style={styles.uploadMeta}>
                        {toName(upload.student)} • {formatDateTime(upload.created_at)}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, linkedAttempt ? styles.statusBadgeGood : styles.statusBadgeWarn]}>
                      <Text style={styles.statusText}>{linkedAttempt ? 'Graded' : 'Needs grading'}</Text>
                    </View>
                  </View>

                  {!!upload.description && (
                    <Text style={styles.descriptionText} numberOfLines={3}>
                      {upload.description}
                    </Text>
                  )}

                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openEvidence(upload)}>
                      <Ionicons name="image-outline" size={16} color={theme.primary} />
                      <Text style={styles.actionBtnText}>View Evidence</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => gradeUpload(upload)}>
                      <Ionicons name="sparkles-outline" size={16} color="#fff" />
                      <Text style={styles.primaryBtnText}>{linkedAttempt ? 'Regrade' : 'Grade with Dash'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}

          <Text style={styles.sectionTitle}>Recent Dash Grading</Text>
          {recentAttempts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No grading attempts recorded yet.</Text>
            </View>
          ) : (
            recentAttempts.map((attempt) => {
              const metadata = parseMetadata(attempt.metadata);
              const uploadId = metadata.progress_upload_id;
              const linkedUpload = uploads.find((upload) => upload.id === uploadId);
              return (
                <View key={attempt.id} style={styles.attemptCard}>
                  <View style={styles.attemptHeader}>
                    <Text style={styles.attemptTopic}>{attempt.topic || 'Family Activity Review'}</Text>
                    <Text style={styles.scoreText}>
                      {Number.isFinite(Number(attempt.score)) ? `${Math.round(Number(attempt.score))}%` : '--'}
                    </Text>
                  </View>
                  <Text style={styles.uploadMeta}>
                    {linkedUpload ? toName(linkedUpload.student) : 'Student'} • {formatDateTime(attempt.created_at)}
                  </Text>
                  {!!attempt.feedback && (
                    <Text style={styles.feedbackText} numberOfLines={2}>
                      {attempt.feedback}
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
      <AlertModal {...alertProps} />
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 10,
    },
    loadingText: {
      color: theme.textSecondary,
      fontSize: 14,
    },
    errorText: {
      color: theme.error,
      fontSize: 14,
      textAlign: 'center',
    },
    content: {
      padding: 16,
      paddingBottom: 36,
      gap: 14,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    statCard: {
      flex: 1,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      alignItems: 'center',
      gap: 4,
    },
    statValue: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '800',
    },
    statLabel: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
    },
    filterChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    filterText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
    },
    filterTextActive: {
      color: '#fff',
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '800',
      marginTop: 6,
    },
    emptyCard: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 16,
    },
    emptyText: {
      color: theme.textSecondary,
      fontSize: 14,
    },
    uploadCard: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 14,
      gap: 10,
    },
    uploadHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    uploadTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
    },
    uploadMeta: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    descriptionText: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 18,
    },
    statusBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statusBadgeGood: {
      backgroundColor: '#DCFCE7',
    },
    statusBadgeWarn: {
      backgroundColor: '#FDE68A',
    },
    statusText: {
      fontSize: 11,
      color: '#1F2937',
      fontWeight: '700',
    },
    cardActions: {
      flexDirection: 'row',
      gap: 8,
    },
    actionBtn: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.primary,
      paddingVertical: 10,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.primary + '12',
    },
    actionBtnText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    primaryBtn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.primary,
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    attemptCard: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 14,
      gap: 8,
    },
    attemptHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    attemptTopic: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
      flex: 1,
    },
    scoreText: {
      color: theme.primary,
      fontSize: 15,
      fontWeight: '800',
    },
    feedbackText: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 18,
    },
  });
