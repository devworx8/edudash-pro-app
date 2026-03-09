import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, StatusBar } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { useTeacherStudents } from '@/hooks/useTeacherStudents';
import { useOrganizationTerminology } from '@/lib/hooks/useOrganizationTerminology';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface ParentProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface ThreadParticipant {
  user_id: string;
  role: string;
}

interface ThreadRow {
  id: string;
  message_participants?: ThreadParticipant[] | null;
}

export default function TeacherNewMessageScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { terminology } = useOrganizationTerminology();
  const { showAlert, alertProps } = useAlertModal();

  const organizationId =
    (profile as any)?.organization_membership?.organization_id ||
    profile?.organization_id ||
    profile?.preschool_id ||
    null;
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [parentMap, setParentMap] = useState<Record<string, ParentProfile>>({});
  const [loadingParents, setLoadingParents] = useState(false);

  const { students, loading, error, refresh } = useTeacherStudents({
    teacherId: user?.id || null,
    organizationId,
    limit: 0,
  });

  const loadParents = useCallback(async () => {
    if (!students.length) return;
    const parentIds = Array.from(new Set(
      students.map((student) => student.parentId || student.guardianId).filter(Boolean) as string[]
    ));
    if (parentIds.length === 0) return;

    setLoadingParents(true);
    try {
      const { data } = await assertSupabase()
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', parentIds);

      const nextMap: Record<string, ParentProfile> = {};
      (data || []).forEach((parent) => {
        nextMap[parent.id] = parent as ParentProfile;
      });
      setParentMap(nextMap);
    } catch {
      // ignore
    } finally {
      setLoadingParents(false);
    }
  }, [students]);

  React.useEffect(() => {
    void loadParents();
  }, [loadParents]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const createThreadWithParent = useCallback(async () => {
    if (!user?.id || !organizationId) return null;
    if (!selectedStudent) return null;

    const parentId = selectedStudent.parentId || selectedStudent.guardianId;
    if (!parentId) {
      showAlert({
        title: t('teacher.noParentTitle', { defaultValue: 'Parent not linked' }),
        message: t('teacher.noParentMessage', { defaultValue: 'This child does not have a linked parent yet.' }),
        type: 'warning',
      });
      return null;
    }

    const supabase = assertSupabase();
    const { data: threadRows } = await supabase
      .from('message_threads')
      .select('id, message_participants(user_id, role)')
      .eq('preschool_id', organizationId)
      .eq('student_id', selectedStudent.id)
      .eq('type', 'parent-teacher');

    const existing = (threadRows as ThreadRow[] | null || []).find((thread) => {
      const participants = thread.message_participants || [];
      const hasParent = participants.some((participant) => participant.user_id === parentId && participant.role === 'parent');
      const hasTeacher = participants.some((participant) => participant.user_id === user.id && participant.role === 'teacher');
      return hasParent && hasTeacher;
    });

    if (existing?.id) return existing.id as string;

    const subject = `${selectedStudent.firstName} ${selectedStudent.lastName}`.trim();
    const { data: thread, error: threadError } = await supabase
      .from('message_threads')
      .insert({
        preschool_id: organizationId,
        created_by: user.id,
        subject: subject || t('teacher.messageSubject', { defaultValue: 'Parent Message' }),
        type: 'parent-teacher',
        student_id: selectedStudent.id,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (threadError) {
      throw threadError;
    }

    const threadId = thread?.id as string;
    await supabase.from('message_participants').insert([
      { thread_id: threadId, user_id: user.id, role: 'teacher' },
      { thread_id: threadId, user_id: parentId, role: 'parent' },
    ]);

    return threadId;
  }, [organizationId, selectedStudent, t, user?.id]);

  const handleStartMessage = useCallback(async () => {
    if (!selectedStudentId) {
      showAlert({
        title: t('teacher.selectChildTitle', { defaultValue: 'Select a child' }),
        message: t('teacher.selectChildMessage', { defaultValue: 'Choose a child to message their parent.' }),
        type: 'info',
      });
      return;
    }

    try {
      const threadId = await createThreadWithParent();
      if (!threadId) return;
      const parentId = selectedStudent?.parentId || selectedStudent?.guardianId || '';
      const parent = parentId ? parentMap[parentId] : null;
      const parentName = parent ? `${parent.first_name || ''} ${parent.last_name || ''}`.trim() : t('teacher.parentLabel', { defaultValue: 'Parent' });

      router.replace({
        pathname: '/screens/teacher-message-thread',
        params: {
          threadId,
          title: parentName,
          parentId,
          parentName,
        },
      });
    } catch (err) {
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: err instanceof Error ? err.message : t('teacher.threadCreateError', { defaultValue: 'Unable to start a message.' }),
        type: 'error',
      });
    }
  }, [createThreadWithParent, parentMap, selectedStudent, selectedStudentId, t]);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      paddingTop: Platform.OS === 'ios' ? insets.top : StatusBar.currentHeight || 0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    headerTitle: {
      flex: 1,
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
      marginLeft: 12,
    },
    content: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 12,
    },
    cardSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '12',
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.primary + '22',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    name: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
    },
    meta: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 4,
    },
    parentMeta: {
      fontSize: 12,
      color: theme.primary,
      marginTop: 4,
    },
    cta: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 12,
    },
    ctaText: {
      color: theme.onPrimary,
      fontWeight: '600',
      fontSize: 15,
    },
    empty: {
      alignItems: 'center',
      padding: 24,
    },
    emptyText: {
      marginTop: 12,
      color: theme.textSecondary,
      textAlign: 'center',
    },
  }), [insets.top, t, theme]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t('teacher.newMessageTitle', { defaultValue: `Message a ${terminology.guardian}` })}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading || loadingParents ? (
          <View style={styles.empty}>
            <EduDashSpinner color={theme.primary} />
            <Text style={styles.emptyText}>{t('common.loading', { defaultValue: 'Loading...' })}</Text>
          </View>
        ) : null}

        {!!error && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        )}

        {!loading && students.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
            <Text style={styles.emptyText}>
              {t('teacher.noStudentsMessage', { defaultValue: 'No learners found for your classes yet.' })}
            </Text>
            <TouchableOpacity style={[styles.cta, { marginTop: 16 }]} onPress={refresh}>
              <Text style={styles.ctaText}>{t('common.retry', { defaultValue: 'Retry' })}</Text>
            </TouchableOpacity>
          </View>
        )}

        {students.map((student) => {
          const isSelected = student.id === selectedStudentId;
          const parentId = student.parentId || student.guardianId || null;
          const parent = parentId ? parentMap[parentId] : null;
          const parentName = parent
            ? `${parent.first_name || ''} ${parent.last_name || ''}`.trim()
            : t('teacher.parentLabel', { defaultValue: 'Parent' });
          return (
            <TouchableOpacity
              key={student.id}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => setSelectedStudentId(student.id)}
            >
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={{ color: theme.primary, fontWeight: '700' }}>
                    {student.firstName.charAt(0)}{student.lastName.charAt(0)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{student.firstName} {student.lastName}</Text>
                  {student.className && (
                    <Text style={styles.meta}>{student.className}</Text>
                  )}
                  <Text style={styles.parentMeta}>{parentName}</Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {students.length > 0 && (
          <TouchableOpacity
            style={styles.cta}
            onPress={handleStartMessage}
          >
            <Text style={styles.ctaText}>
              {t('teacher.startMessage', { defaultValue: 'Start message' })}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <AlertModal {...alertProps} />
    </View>
  );
}
