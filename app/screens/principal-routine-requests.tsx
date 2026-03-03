import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { extractOrganizationId } from '@/lib/tenant/compat';
import {
  listRoutineRequests,
  updateRoutineRequestStatus,
  type RoutineGenerationRequest,
  type RoutineRequestStatus,
} from '@/lib/services/routineRequestService';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useAlertModal } from '@/components/ui/AlertModal';
import { parseThemeFromMessage } from '@/lib/messaging/parseThemeFromMessage';

function parseObjectives(value?: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // fall through
  }
  return value
    .split(/[\n,;|]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getStatusColor(status: RoutineRequestStatus): string {
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

type StatusFilter = RoutineRequestStatus | 'all';

const STATUS_FILTERS: StatusFilter[] = [
  'new',
  'in_review',
  'approved',
  'rejected',
  'completed',
  'all',
];

export default function PrincipalRoutineRequestsScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    message?: string;
    title?: string;
    objectives?: string;
    teacherId?: string;
  }>();
  const { showAlert, AlertModalComponent } = useAlertModal();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isCompact = width < 780;

  const organizationId = extractOrganizationId(profile);
  const principalId = user?.id || profile?.id || '';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('new');
  const [requests, setRequests] = useState<RoutineGenerationRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RoutineGenerationRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const parsedMessagePrefill = useMemo(() => {
    const rawMessage = typeof params.message === 'string' ? params.message : '';
    const parsed = rawMessage ? parseThemeFromMessage(rawMessage) : { title: null, objectives: [] as string[] };
    const objectivesFromParam = parseObjectives(typeof params.objectives === 'string' ? params.objectives : '');
    return {
      hasPrefill: Boolean(rawMessage || params.title || objectivesFromParam.length > 0),
      title: (typeof params.title === 'string' && params.title.trim()) || parsed.title || '',
      objectives: objectivesFromParam.length > 0 ? objectivesFromParam : parsed.objectives,
    };
  }, [params.message, params.objectives, params.title]);

  const refreshRequests = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const data = await listRoutineRequests({
        preschoolId: organizationId,
        status: statusFilter,
        teacherId: typeof params.teacherId === 'string' && params.teacherId ? params.teacherId : undefined,
        limit: 200,
      });
      setRequests(data);
    } catch (error) {
      showAlert({
        title: 'Could not load routine requests',
        message: error instanceof Error ? error.message : 'Please try again shortly.',
        type: 'warning',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, params.teacherId, showAlert, statusFilter]);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  const openPlannerWithPrefill = useCallback((request: RoutineGenerationRequest) => {
    const objectivesParam = JSON.stringify(request.objectives || []);
    router.push({
      pathname: '/screens/principal-daily-program-planner',
      params: {
        requestId: request.id,
        requestType: request.request_type,
        weekStartDate: request.week_start_date,
        classId: request.class_id || '',
        ageGroup: request.age_group || '',
        themeTitle: request.theme_title || '',
        objectives: objectivesParam,
        fromRoutineRequest: '1',
      },
    });
  }, []);

  const handleStatusUpdate = useCallback(
    async (
      request: RoutineGenerationRequest,
      status: RoutineRequestStatus,
      extra?: { principalNotes?: string | null; resolutionReason?: string | null; linkedWeeklyProgramId?: string | null },
    ) => {
      if (!organizationId) return;
      setUpdatingId(request.id);
      try {
        const updated = await updateRoutineRequestStatus({
          requestId: request.id,
          preschoolId: organizationId,
          status,
          principalNotes: extra?.principalNotes ?? request.principal_notes ?? null,
          resolutionReason: extra?.resolutionReason ?? request.resolution_reason ?? null,
          linkedWeeklyProgramId: extra?.linkedWeeklyProgramId ?? request.linked_weekly_program_id ?? null,
          resolvedBy: principalId || null,
        });

        setRequests((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
        if (statusFilter !== 'all' && updated.status !== statusFilter) {
          setRequests((prev) => prev.filter((item) => item.id !== updated.id));
        }
        return updated;
      } catch (error) {
        showAlert({
          title: 'Update failed',
          message: error instanceof Error ? error.message : 'Could not update request.',
          type: 'error',
        });
        return null;
      } finally {
        setUpdatingId(null);
      }
    },
    [organizationId, principalId, showAlert, statusFilter],
  );

  const handleApprove = useCallback(async (request: RoutineGenerationRequest) => {
    const updated = await handleStatusUpdate(request, 'approved', {
      principalNotes: request.principal_notes || 'Approved and opened in planner for finalization.',
    });
    if (updated) {
      openPlannerWithPrefill(updated);
    }
  }, [handleStatusUpdate, openPlannerWithPrefill]);

  const handleReject = useCallback(() => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      showAlert({
        title: 'Reason required',
        message: 'Please capture a reason before rejecting this request.',
        type: 'warning',
      });
      return;
    }

    void handleStatusUpdate(rejectTarget, 'rejected', {
      resolutionReason: reason,
      principalNotes: rejectTarget.principal_notes || null,
    }).then(() => {
      setRejectTarget(null);
      setRejectReason('');
    });
  }, [handleStatusUpdate, rejectReason, rejectTarget, showAlert]);

  return (
    <DesktopLayout role="principal" title="Routine Requests" showBackButton>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshRequests} />}
      >
        <View style={styles.pageShell}>
        {parsedMessagePrefill.hasPrefill && (
          <View style={styles.prefillCard}>
            <View style={styles.prefillHeader}>
              <Ionicons name="chatbubbles-outline" size={16} color={theme.primary} />
              <Text style={styles.prefillTitle}>Captured from message</Text>
            </View>
            <Text style={styles.prefillText}>
              Theme: {parsedMessagePrefill.title || 'Not specified'}
            </Text>
            {parsedMessagePrefill.objectives.length > 0 ? (
              <Text style={styles.prefillText}>
                Objectives: {parsedMessagePrefill.objectives.slice(0, 3).join(', ')}
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.inlineBtn}
              onPress={() => {
                router.push({
                  pathname: '/screens/principal-daily-program-planner',
                  params: {
                    themeTitle: parsedMessagePrefill.title || '',
                    objectives: JSON.stringify(parsedMessagePrefill.objectives || []),
                    fromRoutineRequest: '1',
                  },
                });
              }}
            >
              <Ionicons name="open-outline" size={14} color={theme.primary} />
              <Text style={styles.inlineBtnText}>Open planner with this draft</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Principal inbox</Text>
          <Text style={styles.sectionHint}>
            Review teacher routine/program requests, triage status, and open approved items in planner.
          </Text>
          <View style={styles.filterRow}>
            {STATUS_FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[styles.filterChip, statusFilter === filter && styles.filterChipActive]}
                onPress={() => setStatusFilter(filter)}
              >
                <Text style={[styles.filterChipText, statusFilter === filter && styles.filterChipTextActive]}>
                  {filter === 'all' ? 'All' : filter.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          {loading && requests.length === 0 ? (
            <View style={styles.loaderWrap}>
              <EduDashSpinner size="small" color={theme.primary} />
            </View>
          ) : requests.length === 0 ? (
            <Text style={styles.sectionHint}>No requests for this filter yet.</Text>
          ) : (
            requests.map((request) => {
              const busy = updatingId === request.id;
              return (
                <View key={request.id} style={styles.requestCard}>
                  <View style={[styles.requestHeader, isCompact && styles.requestHeaderStack]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.requestTitle}>{request.theme_title || 'Routine request'}</Text>
                      <Text style={styles.requestMeta}>
                        {request.request_type === 'daily_routine' ? 'Daily routine' : 'Weekly program'} • Week {request.week_start_date}
                      </Text>
                      <Text style={styles.requestMeta}>Teacher: {request.teacher_id}</Text>
                    </View>
                    <View style={[styles.statusPill, { borderColor: getStatusColor(request.status) }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(request.status) }]}>{request.status}</Text>
                    </View>
                  </View>

                  {request.objectives?.length ? (
                    <Text style={styles.requestBody}>
                      Objectives: {request.objectives.slice(0, 4).join(', ')}
                    </Text>
                  ) : null}

                  {request.principal_notes ? (
                    <Text style={styles.requestBody}>Notes: {request.principal_notes}</Text>
                  ) : null}
                  {request.resolution_reason ? (
                    <Text style={styles.requestBody}>Reason: {request.resolution_reason}</Text>
                  ) : null}

                  <View style={styles.actionRow}>
                    {request.status === 'new' && (
                      <TouchableOpacity
                        style={styles.inlineBtn}
                        disabled={busy}
                        onPress={() => void handleStatusUpdate(request, 'in_review', {
                          principalNotes: request.principal_notes || 'Under principal review.',
                        })}
                      >
                        <Ionicons name="eye-outline" size={14} color={theme.primary} />
                        <Text style={styles.inlineBtnText}>In review</Text>
                      </TouchableOpacity>
                    )}

                    {(request.status === 'new' || request.status === 'in_review' || request.status === 'approved') && (
                      <TouchableOpacity
                        style={styles.inlineBtn}
                        disabled={busy}
                        onPress={() => void handleApprove(request)}
                      >
                        <Ionicons name="checkmark-circle-outline" size={14} color={theme.primary} />
                        <Text style={styles.inlineBtnText}>Approve + Open</Text>
                      </TouchableOpacity>
                    )}

                    {(request.status === 'new' || request.status === 'in_review' || request.status === 'approved') && (
                      <TouchableOpacity
                        style={[styles.inlineBtn, styles.inlineBtnDanger]}
                        disabled={busy}
                        onPress={() => {
                          setRejectTarget(request);
                          setRejectReason('');
                        }}
                      >
                        <Ionicons name="close-circle-outline" size={14} color={theme.error} />
                        <Text style={styles.inlineBtnDangerText}>Reject</Text>
                      </TouchableOpacity>
                    )}

                    {(request.status === 'approved' || request.status === 'in_review') && (
                      <TouchableOpacity
                        style={styles.inlineBtn}
                        disabled={busy}
                        onPress={() => void handleStatusUpdate(request, 'completed', {
                          principalNotes: request.principal_notes || 'Completed and published.',
                        })}
                      >
                        <Ionicons name="checkmark-done-outline" size={14} color={theme.primary} />
                        <Text style={styles.inlineBtnText}>Mark completed</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
        </View>
      </ScrollView>

      <Modal visible={Boolean(rejectTarget)} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
            <Text style={styles.modalTitle}>Reject request</Text>
            <Text style={styles.modalHint}>A reason is required and will be visible to the teacher.</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Reason for rejection"
              placeholderTextColor={theme.textSecondary}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.inlineBtn} onPress={() => setRejectTarget(null)}>
                <Text style={styles.inlineBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.inlineBtn, styles.inlineBtnDanger]} onPress={handleReject}>
                <Text style={styles.inlineBtnDangerText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
      maxWidth: 1160,
      alignSelf: 'center',
      gap: 12,
    },
    card: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 14,
      gap: 10,
    },
    prefillCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.primary + '55',
      backgroundColor: theme.primary + '14',
      padding: 12,
      gap: 6,
    },
    prefillHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    prefillTitle: {
      color: theme.primary,
      fontWeight: '800',
      fontSize: 13,
    },
    prefillText: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 16,
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
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    filterChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    filterChipActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '16',
    },
    filterChipText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    filterChipTextActive: {
      color: theme.primary,
    },
    loaderWrap: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    requestCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      padding: 10,
      gap: 8,
    },
    requestHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    requestHeaderStack: {
      flexWrap: 'wrap',
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
    requestBody: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 16,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
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
    inlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: theme.primary + '55',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: theme.primary + '12',
    },
    inlineBtnText: {
      color: theme.primary,
      fontWeight: '700',
      fontSize: 12,
    },
    inlineBtnDanger: {
      borderColor: theme.error + '55',
      backgroundColor: theme.error + '12',
    },
    inlineBtnDangerText: {
      color: theme.error,
      fontWeight: '700',
      fontSize: 12,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 14,
      gap: 10,
    },
    modalCardCompact: {
      maxWidth: 520,
    },
    modalTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
    },
    modalHint: {
      color: theme.textSecondary,
      fontSize: 12,
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
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 4,
    },
  });
