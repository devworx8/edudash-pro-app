import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { extractOrganizationId } from '@/lib/tenant/compat';
import {
  createRoutineRequest,
  listRoutineRequests,
  type RoutineGenerationRequest,
  type RoutineRequestType,
  type RoutineRequestUrgency,
} from '@/lib/services/routineRequestService';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useAlertModal } from '@/components/ui/AlertModal';
import { parseThemeFromMessage } from '@/lib/messaging/parseThemeFromMessage';

function startOfWeekMonday(value: Date | string): string {
  const date = typeof value === 'string'
    ? new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`)
    : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const day = safeDate.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  safeDate.setUTCDate(safeDate.getUTCDate() + offset);
  return safeDate.toISOString().slice(0, 10);
}

function parseObjectives(value?: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Fall through to split text.
  }
  return value
    .split(/[\n,;|]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getStatusColor(status: RoutineGenerationRequest['status']) {
  switch (status) {
    case 'approved':
      return '#10b981';
    case 'rejected':
      return '#ef4444';
    case 'completed':
      return '#06b6d4';
    case 'in_review':
      return '#f59e0b';
    default:
      return '#64748b';
  }
}

export default function TeacherRoutineRequestsScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { width } = useWindowDimensions();
  const { showAlert, AlertModalComponent } = useAlertModal();
  const params = useLocalSearchParams<{
    requestType?: string;
    weekStartDate?: string;
    classId?: string;
    ageGroup?: string;
    themeTitle?: string;
    objectives?: string;
    message?: string;
  }>();

  const styles = useMemo(() => createStyles(theme), [theme]);
  const isCompact = width < 780;
  const organizationId = extractOrganizationId(profile);
  const teacherId = user?.id || profile?.id || '';
  const isTeacherRole = profile?.role === 'teacher';

  const parsedFromMessage = useMemo(() => {
    const content = typeof params.message === 'string' ? params.message : '';
    if (!content) return { title: null, objectives: [] as string[] };
    const parsed = parseThemeFromMessage(content);
    return {
      title: parsed.title,
      objectives: parsed.objectives,
    };
  }, [params.message]);

  const [requestType, setRequestType] = useState<RoutineRequestType>(
    params.requestType === 'weekly_program' ? 'weekly_program' : 'daily_routine',
  );
  const [weekStartDate, setWeekStartDate] = useState(
    params.weekStartDate ? startOfWeekMonday(params.weekStartDate) : startOfWeekMonday(new Date()),
  );
  const [classId, setClassId] = useState(typeof params.classId === 'string' ? params.classId : '');
  const [ageGroup, setAgeGroup] = useState(typeof params.ageGroup === 'string' ? params.ageGroup : '');
  const [themeTitle, setThemeTitle] = useState(
    (typeof params.themeTitle === 'string' && params.themeTitle.trim()) || parsedFromMessage.title || '',
  );
  const [objectivesText, setObjectivesText] = useState(() => {
    const paramObjectives = parseObjectives(typeof params.objectives === 'string' ? params.objectives : '');
    if (paramObjectives.length > 0) return paramObjectives.join('\n');
    if (parsedFromMessage.objectives.length > 0) return parsedFromMessage.objectives.join('\n');
    return '';
  });
  const [constraintsText, setConstraintsText] = useState('');
  const [urgency, setUrgency] = useState<RoutineRequestUrgency>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<RoutineGenerationRequest[]>([]);

  const refreshRequests = useCallback(async () => {
    if (!organizationId || !teacherId) return;
    setLoading(true);
    try {
      const data = await listRoutineRequests({
        preschoolId: organizationId,
        teacherId,
        status: 'all',
        limit: 80,
      });
      setRequests(data);
    } catch (error) {
      showAlert({
        title: 'Could not load requests',
        message: error instanceof Error ? error.message : 'Try again in a few moments.',
        type: 'warning',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, teacherId, showAlert]);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  const handleCreate = useCallback(async () => {
    if (!isTeacherRole) {
      showAlert({
        title: 'Teacher access only',
        message: 'Only teachers can create routine/program requests.',
        type: 'warning',
      });
      return;
    }
    if (!organizationId || !teacherId) {
      showAlert({
        title: 'Missing profile',
        message: 'Please sign in again and retry.',
        type: 'warning',
      });
      return;
    }

    const trimmedTheme = themeTitle.trim();
    const objectives = objectivesText
      .split(/[\n,;|]/g)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!trimmedTheme && objectives.length === 0) {
      showAlert({
        title: 'Request details required',
        message: 'Add a theme title or at least one objective.',
        type: 'warning',
      });
      return;
    }

    setSubmitting(true);
    try {
      const constraints = constraintsText.trim()
        ? { notes: constraintsText.trim() }
        : {};

      await createRoutineRequest({
        preschoolId: organizationId,
        teacherId,
        requestType,
        weekStartDate: startOfWeekMonday(weekStartDate),
        classId: classId.trim() || null,
        ageGroup: ageGroup.trim() || null,
        themeTitle: trimmedTheme || null,
        objectives,
        constraints,
        urgency,
      });

      setConstraintsText('');
      showAlert({
        title: 'Request sent',
        message: 'Your principal inbox now has this routine/program request.',
        type: 'success',
      });
      await refreshRequests();
    } catch (error) {
      showAlert({
        title: 'Request failed',
        message: error instanceof Error ? error.message : 'Could not submit request.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    ageGroup,
    classId,
    constraintsText,
    isTeacherRole,
    objectivesText,
    organizationId,
    refreshRequests,
    requestType,
    showAlert,
    teacherId,
    themeTitle,
    urgency,
    weekStartDate,
  ]);

  return (
    <DesktopLayout role="teacher" title="Routine Requests" showBackButton>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshRequests} />}
      >
        <View style={styles.pageShell}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Request new routine/program</Text>
          <Text style={styles.sectionHint}>
            Send a structured request to your principal for a daily routine or weekly program update.
          </Text>

          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggle, requestType === 'daily_routine' && styles.toggleActive]}
              onPress={() => setRequestType('daily_routine')}
            >
              <Text style={[styles.toggleText, requestType === 'daily_routine' && styles.toggleTextActive]}>
                Daily routine
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggle, requestType === 'weekly_program' && styles.toggleActive]}
              onPress={() => setRequestType('weekly_program')}
            >
              <Text style={[styles.toggleText, requestType === 'weekly_program' && styles.toggleTextActive]}>
                Weekly program
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Week start (Monday)</Text>
          <TextInput
            style={styles.input}
            value={weekStartDate}
            onChangeText={setWeekStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
          />

          <View style={[styles.row, isCompact && styles.rowStack]}>
            <View style={styles.half}>
              <Text style={styles.label}>Class ID (optional)</Text>
              <TextInput
                style={styles.input}
                value={classId}
                onChangeText={setClassId}
                placeholder="Class ID"
                placeholderTextColor={theme.textSecondary}
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Age group</Text>
              <TextInput
                style={styles.input}
                value={ageGroup}
                onChangeText={setAgeGroup}
                placeholder="e.g. 4-5"
                placeholderTextColor={theme.textSecondary}
              />
            </View>
          </View>

          <Text style={styles.label}>Theme title</Text>
          <TextInput
            style={styles.input}
            value={themeTitle}
            onChangeText={setThemeTitle}
            placeholder="Theme title"
            placeholderTextColor={theme.textSecondary}
          />

          <Text style={styles.label}>Objectives (one per line)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={objectivesText}
            onChangeText={setObjectivesText}
            placeholder="Learning objectives"
            placeholderTextColor={theme.textSecondary}
            multiline
          />

          <Text style={styles.label}>Constraints / Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={constraintsText}
            onChangeText={setConstraintsText}
            placeholder="Classroom constraints, timing, staffing, etc."
            placeholderTextColor={theme.textSecondary}
            multiline
          />

          <Text style={styles.label}>Urgency</Text>
          <View style={styles.toggleRow}>
            {(['low', 'normal', 'high', 'critical'] as const).map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.toggle, urgency === item && styles.toggleActive]}
                onPress={() => setUrgency(item)}
              >
                <Text style={[styles.toggleText, urgency === item && styles.toggleTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.disabledBtn]}
            disabled={submitting}
            onPress={() => void handleCreate()}
          >
            {submitting ? (
              <EduDashSpinner size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="send-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Submit request</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your request history</Text>
          {loading && requests.length === 0 ? (
            <View style={styles.loaderWrap}>
              <EduDashSpinner size="small" color={theme.primary} />
            </View>
          ) : requests.length === 0 ? (
            <Text style={styles.sectionHint}>No routine requests yet.</Text>
          ) : (
            requests.map((request) => (
              <View key={request.id} style={styles.requestCard}>
                <View style={[styles.requestHeader, isCompact && styles.requestHeaderStack]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.requestTitle}>
                      {request.theme_title || 'Routine request'}
                    </Text>
                    <Text style={styles.requestMeta}>
                      {request.request_type === 'daily_routine' ? 'Daily routine' : 'Weekly program'} • Week {request.week_start_date}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { borderColor: getStatusColor(request.status) }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(request.status) }]}>{request.status}</Text>
                  </View>
                </View>
                {request.resolution_reason ? (
                  <Text style={styles.requestReason}>Reason: {request.resolution_reason}</Text>
                ) : null}
                {request.principal_notes ? (
                  <Text style={styles.requestReason}>Principal notes: {request.principal_notes}</Text>
                ) : null}
              </View>
            ))
          )}
        </View>
        </View>
      </ScrollView>
      <AlertModalComponent />
    </DesktopLayout>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      padding: 16,
      gap: 12,
      paddingBottom: 36,
    },
    pageShell: {
      width: '100%',
      maxWidth: 1120,
      alignSelf: 'center',
      gap: 12,
    },
    card: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 14,
      gap: 8,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
    },
    sectionHint: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    label: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 4,
    },
    input: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      color: theme.text,
      paddingHorizontal: 10,
      paddingVertical: 9,
      fontSize: 14,
    },
    textArea: {
      minHeight: 86,
      textAlignVertical: 'top',
    },
    row: {
      flexDirection: 'row',
      gap: 8,
    },
    rowStack: {
      flexDirection: 'column',
    },
    half: {
      flex: 1,
      minWidth: 0,
    },
    toggleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    toggle: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    toggleActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '18',
    },
    toggleText: {
      color: theme.textSecondary,
      fontWeight: '700',
      fontSize: 12,
      textTransform: 'capitalize',
    },
    toggleTextActive: {
      color: theme.primary,
    },
    primaryBtn: {
      marginTop: 8,
      borderRadius: 12,
      backgroundColor: theme.primary,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '800',
    },
    disabledBtn: {
      opacity: 0.6,
    },
    loaderWrap: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    requestCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      padding: 10,
      gap: 6,
    },
    requestHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    requestHeaderStack: {
      flexWrap: 'wrap',
      alignItems: 'flex-start',
    },
    requestTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
    },
    requestMeta: {
      color: theme.textSecondary,
      fontSize: 11,
      marginTop: 2,
    },
    requestReason: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 16,
    },
    statusPill: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: theme.card,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
  });
