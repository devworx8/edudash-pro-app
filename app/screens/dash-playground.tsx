/**
 * Dash Playground — Teacher-assigned activities for parent + child practice.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useParentDashboard } from '@/hooks/useDashboardData';
import { assertSupabase } from '@/lib/supabase';
import { ChildSwitcher } from '@/components/dashboard/parent';
import { ActivityPlayer } from '@/components/activities/ActivityPlayer';
import { ActivityComplete } from '@/components/activities/ActivityComplete';
import { useKidVoice } from '@/hooks/useKidVoice';
import { usePlaygroundAudio } from '@/hooks/usePlaygroundAudio';
import { track } from '@/lib/analytics';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { DOMAIN_LABELS } from '@/lib/activities/preschoolActivities.data';
import type { PreschoolActivity, ActivityResult } from '@/lib/activities/preschoolActivities.types';
import {
  completeAssignedPlaygroundActivity,
  getSnapshotFromInteractiveContent,
  type PlaygroundSnapshotContent,
} from '@/lib/services/playgroundAssignmentService';

interface AssignmentQueryRow {
  id: string;
  lesson_id: string | null;
  due_date: string | null;
  status: string;
  assigned_at: string | null;
  lesson: { id: string; title: string } | { id: string; title: string }[] | null;
  interactive_activity:
    | { id: string; title: string; description: string | null; content: unknown }
    | { id: string; title: string; description: string | null; content: unknown }[]
    | null;
}

interface AssignedPlaygroundActivity {
  assignmentId: string;
  lessonId: string | null;
  lessonTitle: string | null;
  dueDate: string | null;
  status: string;
  assignedAt: string | null;
  interactiveActivityId: string;
  interactiveTitle: string;
  interactiveDescription: string | null;
  content: PlaygroundSnapshotContent;
  activity: PreschoolActivity;
}

const mapDomainToSubject = (domain?: string): string => {
  switch ((domain || '').toLowerCase()) {
    case 'numeracy':
      return 'mathematics';
    case 'literacy':
      return 'reading';
    case 'science':
      return 'science';
    case 'gross_motor':
      return 'physical_education';
    case 'fine_motor':
    case 'social_emotional':
    case 'cognitive':
    case 'creative_arts':
    default:
      return 'life_skills';
  }
};

const getStatusLabel = (status: string): string => {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Assigned';
};

const toSingle = <T,>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
};

export default function DashPlaygroundScreen() {
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const insets = useSafeAreaInsets();
  const { tier } = useSubscription();
  const { data, loading } = useParentDashboard();
  const {
    speak,
    speakIntro,
    stop: stopSpeech,
    beginActivitySession,
  } = useKidVoice({ tier });

  const audio = usePlaygroundAudio();

  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<AssignedPlaygroundActivity | null>(null);
  const [activityResult, setActivityResult] = useState<ActivityResult | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [isSavingCompletion, setIsSavingCompletion] = useState(false);

  const children = useMemo(() => data?.children || [], [data?.children]);
  const activeChild = useMemo(
    () => children.find((c: any) => c.id === activeChildId) || children[0],
    [children, activeChildId],
  );

  /** Compute child's age in years for age-based filtering */
  const childAgeYears = useMemo(() => {
    if (!activeChild) return null;
    const dob = (activeChild as any).dateOfBirth || (activeChild as any).date_of_birth;
    if (dob) {
      const birthDate = new Date(dob);
      if (!isNaN(birthDate.getTime())) {
        const now = new Date();
        let age = now.getFullYear() - birthDate.getFullYear();
        const monthDiff = now.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
          age--;
        }
        return age;
      }
    }
    // Fallback: try to infer from grade
    const grade = (activeChild as any).grade || '';
    if (/grade\s*r|reception/i.test(grade)) return 5;
    if (/grade\s*rr|pre-grade|preschool|pre-school/i.test(grade)) return 4;
    if (/baby|toddler|playgroup/i.test(grade)) return 3;
    return null;
  }, [activeChild]);

  useEffect(() => {
    if (children.length > 0 && !activeChildId) {
      setActiveChildId(children[0].id);
    }
  }, [children, activeChildId]);

  const {
    data: assignedActivities = [],
    isLoading: assignedLoading,
    refetch: refetchAssignments,
  } = useQuery({
    queryKey: ['dash-playground-assignments', activeChild?.id],
    enabled: !!activeChild?.id,
    staleTime: 15000,
    queryFn: async (): Promise<AssignedPlaygroundActivity[]> => {
      const childId = activeChild?.id;
      if (!childId) return [];

      const supabase = assertSupabase();
      const { data: rows, error } = await supabase
        .from('lesson_assignments')
        .select(`
          id,
          lesson_id,
          due_date,
          status,
          assigned_at,
          lesson:lessons!lesson_assignments_lesson_id_fkey(id, title),
          interactive_activity:interactive_activities!lesson_assignments_interactive_activity_id_fkey(id, title, description, content)
        `)
        .eq('student_id', childId)
        .not('interactive_activity_id', 'is', null)
        .in('status', ['assigned', 'in_progress', 'completed'])
        .order('assigned_at', { ascending: false });

      if (error) {
        throw error;
      }

      const parsed = ((rows || []) as AssignmentQueryRow[])
        .map((row) => {
          const interactive = toSingle(row.interactive_activity);
          if (!interactive) return null;

          const content = getSnapshotFromInteractiveContent(interactive.content);
          if (!content) return null;
          if (content.source !== 'dash_playground' && content.source !== 'dash_temp_lesson') {
            return null;
          }
          if (content.source === 'dash_temp_lesson' && content.expires_at) {
            const expiresAt = Date.parse(content.expires_at);
            if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
              return null;
            }
          }

          const lesson = toSingle(row.lesson);
          return {
            assignmentId: row.id,
            lessonId: row.lesson_id,
            lessonTitle: lesson?.title || content.linked_lesson_title || interactive.title || null,
            dueDate: row.due_date,
            status: row.status,
            assignedAt: row.assigned_at,
            interactiveActivityId: interactive.id,
            interactiveTitle: interactive.title,
            interactiveDescription: interactive.description,
            content,
            activity: content.snapshot,
          } as AssignedPlaygroundActivity;
        })
        .filter((item): item is AssignedPlaygroundActivity => item !== null);

      return parsed;
    },
  });

  useEffect(() => {
    if (!activeAssignment) return;
    const exists = assignedActivities.some((item) => item.assignmentId === activeAssignment.assignmentId);
    if (!exists) {
      setActiveAssignment(null);
      setActivityResult(null);
    }
  }, [assignedActivities, activeAssignment]);

  const grouped = useMemo(() => {
    const map: Record<string, AssignedPlaygroundActivity[]> = {};
    assignedActivities.forEach((item) => {
      if (!map[item.activity.domain]) {
        map[item.activity.domain] = [];
      }
      map[item.activity.domain].push(item);
    });
    return map;
  }, [assignedActivities]);

  const availableDomains = useMemo(() => Object.keys(grouped), [grouped]);

  useEffect(() => {
    if (!filter) return;
    if (!availableDomains.includes(filter)) {
      setFilter(null);
    }
  }, [filter, availableDomains]);

  const displayDomains = useMemo(() => {
    if (filter && grouped[filter]) return [filter];
    return availableDomains;
  }, [filter, grouped, availableDomains]);

  const handleStartActivity = useCallback(async (item: AssignedPlaygroundActivity) => {
    const voiceSession = await beginActivitySession(item.assignmentId);

    if (voiceSession.didSwitchToDevice) {
      showAlert({
        title: 'Cloud Voice Preview Used',
        message: 'You have used 3 free high-quality Dash voice activities. Playground will now use device voice. Upgrade for premium natural voices.',
        type: 'info',
        buttons: [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/screens/subscription-setup') },
        ],
      });
    }

    track('playground.activity_started', {
      assignmentId: item.assignmentId,
      activityId: item.activity.id,
      domain: item.activity.domain,
      difficulty: item.content.difficulty,
      voiceMode: voiceSession.useCloudVoice ? 'cloud' : 'device',
    });
    setActiveAssignment(item);
    setActivityResult(null);
    if (item.activity.dashIntro) {
      speakIntro(item.activity.dashIntro);
    }
  }, [beginActivitySession, speakIntro]);

  const handleComplete = useCallback((result: ActivityResult) => {
    const assignment = activeAssignment;
    setActivityResult(result);

    if (!assignment) {
      return;
    }

    setIsSavingCompletion(true);
    void completeAssignedPlaygroundActivity({
      assignmentId: assignment.assignmentId,
      result,
      difficulty: assignment.content.difficulty,
      activityMeta: {
        activity_id: assignment.activity.id,
        interactive_activity_id: assignment.interactiveActivityId,
        lesson_id: assignment.lessonId,
        lesson_title: assignment.lessonTitle,
        domain: assignment.activity.domain,
      },
    })
      .then(() => refetchAssignments())
      .catch((error) => {
        console.warn('[DashPlayground] Failed to persist assignment completion:', error);
      })
      .finally(() => {
        setIsSavingCompletion(false);
      });

    track('playground.activity_completed', {
      assignmentId: assignment.assignmentId,
      activityId: result.activityId,
      stars: result.stars,
      correctAnswers: result.correctAnswers,
      timeSpent: result.timeSpentSeconds,
      difficulty: assignment.content.difficulty,
    });
  }, [activeAssignment, refetchAssignments]);

  const handleContinueWithDash = () => {
    if (!activeAssignment?.activity.dashFollowUp) return;
    const childName = activeChild?.firstName || 'my child';
    const prompt = `${activeAssignment.activity.dashFollowUp} Their name is ${childName}.`;
    stopSpeech();
    setActiveAssignment(null);
    setActivityResult(null);
    router.push({ pathname: '/screens/dash-assistant', params: { initialMessage: prompt } });
  };

  const handlePlayAgain = () => {
    setActivityResult(null);
  };

  const handleCloseActivity = () => {
    stopSpeech();
    setActiveAssignment(null);
    setActivityResult(null);
  };

  const handleUploadAndGrade = () => {
    if (!activeAssignment || !activeChild?.id) return;

    const activity = activeAssignment.activity;
    const childName = `${activeChild.firstName || ''} ${activeChild.lastName || ''}`.trim()
      || activeChild.firstName
      || 'Child';
    const gradeLevel = activeChild.grade || 'Age 5';
    const subject = mapDomainToSubject(activity.domain);

    stopSpeech();
    setActiveAssignment(null);
    setActivityResult(null);
    router.push({
      pathname: '/screens/parent-picture-of-progress',
      params: {
        studentId: String(activeChild.id),
        studentName: encodeURIComponent(childName),
        prefillTitle: encodeURIComponent(`${activity.title} - Assigned Playground Activity`),
        prefillDescription: encodeURIComponent(`We completed ${activity.title} together as a teacher-assigned activity.`),
        prefillSubject: encodeURIComponent(subject),
        prefillLearningArea: encodeURIComponent(activity.skills?.slice(0, 2).join(', ') || activity.domain),
        nextStep: 'grade',
        gradeLevel: encodeURIComponent(gradeLevel),
        assignmentTitle: encodeURIComponent(`${activity.title} Review`),
        submissionTemplate: encodeURIComponent(`${childName} completed ${activity.title}. Add what they did, where they found it easy or hard, and what they learned.`),
        contextTag: encodeURIComponent('assigned_playground_activity'),
        sourceFlow: encodeURIComponent('dash_playground_assigned'),
        activityId: encodeURIComponent(activity.id),
        activityTitle: encodeURIComponent(activity.title),
      },
    } as any);
  };

  const styles = useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centered}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading playground...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Dash Playground</Text>
            <Text style={styles.subtitle}>Teacher-assigned activities for {activeChild?.firstName || 'your child'}</Text>
          </View>
        </View>

        <ChildSwitcher
          children={children.map((c: any) => ({
            id: c.id,
            firstName: c.firstName || c.first_name,
            lastName: c.lastName || c.last_name,
            avatarUrl: c.avatarUrl,
          }))}
          activeChildId={activeChildId}
          onChildChange={setActiveChildId}
        />

        <LinearGradient colors={['#1D4ED8', '#0F766E']} style={styles.introCard}>
          <Text style={styles.introEmoji}>🧠</Text>
          <View style={styles.introContent}>
            <Text style={styles.introTitle}>Lesson-Aligned Playground</Text>
            <Text style={styles.introText}>
              Activities appear here only when a teacher assigns them. Complete them together and Dash records progress for the class lesson.
            </Text>
          </View>
        </LinearGradient>

        {!activeChild ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={28} color={theme.textSecondary} />
            <Text style={styles.emptyTitle}>No linked child found</Text>
            <Text style={styles.emptyText}>Link a child account first to access assigned playground activities.</Text>
          </View>
        ) : assignedLoading ? (
          <View style={styles.emptyState}>
            <EduDashSpinner size="small" color={theme.primary} />
            <Text style={styles.emptyText}>Loading assigned activities...</Text>
          </View>
        ) : assignedActivities.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="lock-closed-outline" size={28} color={theme.textSecondary} />
            <Text style={styles.emptyTitle}>No teacher-assigned activities yet</Text>
            <Text style={styles.emptyText}>Ask your teacher to assign a Dash Playground activity for this child.</Text>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterChip, !filter && styles.filterChipActive]}
                onPress={() => setFilter(null)}
              >
                <Text style={[styles.filterText, !filter && styles.filterTextActive]}>All</Text>
              </TouchableOpacity>
              {availableDomains.map((domain) => {
                const domainInfo = DOMAIN_LABELS[domain] || { label: domain, emoji: '🎯' };
                const isActive = filter === domain;
                return (
                  <TouchableOpacity
                    key={domain}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    onPress={() => setFilter(isActive ? null : domain)}
                  >
                    <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                      {domainInfo.emoji} {domainInfo.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {displayDomains.map((domain) => {
              const items = grouped[domain] || [];
              if (items.length === 0) return null;

              const domainInfo = DOMAIN_LABELS[domain] || { label: domain, emoji: '📋' };
              return (
                <View key={domain} style={styles.domainSection}>
                  <Text style={styles.domainTitle}>{domainInfo.emoji} {domainInfo.label}</Text>
                  {items.map((item) => {
                    const activity = item.activity;
                    return (
                      <TouchableOpacity
                        key={item.assignmentId}
                        activeOpacity={0.85}
                        onPress={() => handleStartActivity(item)}
                        style={styles.activityCard}
                      >
                        <LinearGradient colors={activity.gradient} style={styles.activityGradient}>
                          <View style={styles.activityTopRow}>
                            <View style={styles.activityHeaderLeft}>
                              <Text style={styles.activityEmoji}>{activity.emoji}</Text>
                              <View style={styles.activityInfo}>
                                <Text style={styles.activityTitle}>{activity.title}</Text>
                                <Text style={styles.activitySubtitle}>{item.lessonTitle || 'Lesson assignment'}</Text>
                              </View>
                            </View>
                            <View style={styles.statusBadge}>
                              <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
                            </View>
                          </View>

                          <View style={styles.activityMetaRow}>
                            <View style={styles.metaChip}>
                              <Ionicons name="layers-outline" size={12} color="#fff" />
                              <Text style={styles.metaChipText}>{item.content.difficulty}</Text>
                            </View>
                            <View style={styles.metaChip}>
                              <Ionicons name="time-outline" size={12} color="#fff" />
                              <Text style={styles.metaChipText}>{activity.durationMinutes}m</Text>
                            </View>
                            <View style={styles.metaChip}>
                              <Ionicons name="people-outline" size={12} color="#fff" />
                              <Text style={styles.metaChipText}>Age {activity.ageRange}</Text>
                            </View>
                            {childAgeYears !== null && (() => {
                              const [min, max] = activity.ageRange.split('-').map(Number);
                              const isMatch = childAgeYears >= min && childAgeYears <= max;
                              return isMatch ? (
                                <View style={[styles.metaChip, { backgroundColor: 'rgba(16,185,129,0.4)' }]}>
                                  <Ionicons name="checkmark-circle" size={12} color="#fff" />
                                  <Text style={styles.metaChipText}>Age match</Text>
                                </View>
                              ) : null;
                            })()}
                            {item.dueDate && (
                              <View style={styles.metaChip}>
                                <Ionicons name="calendar-outline" size={12} color="#fff" />
                                <Text style={styles.metaChipText}>{item.dueDate}</Text>
                              </View>
                            )}
                          </View>

                          <Text style={styles.objectiveText} numberOfLines={2}>
                            {activity.learningObjective}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal visible={!!activeAssignment && !activityResult} animationType="slide" presentationStyle="fullScreen">
        {activeAssignment && (
          <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
            <ActivityPlayer
              activity={activeAssignment.activity}
              childId={activeChildId || 'unknown'}
              onComplete={handleComplete}
              onClose={handleCloseActivity}
              onSpeak={speak}
              audio={audio}
            />
          </SafeAreaView>
        )}
      </Modal>

      <Modal visible={!!activityResult && !!activeAssignment} animationType="fade" presentationStyle="fullScreen">
        {activityResult && activeAssignment && (
          <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
            <ActivityComplete
              activity={activeAssignment.activity}
              result={activityResult}
              onPlayAgain={handlePlayAgain}
              onContinueWithDash={handleContinueWithDash}
              onUploadAndGrade={handleUploadAndGrade}
              onClose={handleCloseActivity}
            />
            {isSavingCompletion && (
              <View style={styles.savingBanner}>
                <EduDashSpinner size="small" color="#fff" />
                <Text style={styles.savingText}>Saving progress for teacher...</Text>
              </View>
            )}
          </SafeAreaView>
        )}
      </Modal>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any, bottomInset: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { color: theme.textSecondary, fontSize: 14 },
    modalSafe: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingHorizontal: 16, paddingBottom: bottomInset + 40, gap: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    headerCenter: { flex: 1 },
    title: { fontSize: 24, fontWeight: '800', color: theme.text },
    subtitle: { fontSize: 14, color: theme.textSecondary, fontWeight: '500' },
    introCard: {
      borderRadius: 20,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    introEmoji: { fontSize: 42 },
    introContent: { flex: 1, gap: 6 },
    introTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
    introText: { fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 19 },
    emptyState: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingVertical: 24,
      paddingHorizontal: 18,
      alignItems: 'center',
      gap: 8,
    },
    emptyTitle: { color: theme.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
    emptyText: { color: theme.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 },
    filterRow: { flexDirection: 'row', marginBottom: -8 },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      marginRight: 8,
    },
    filterChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    filterText: { fontSize: 13, fontWeight: '600', color: theme.text },
    filterTextActive: { color: '#fff' },
    domainSection: { gap: 10 },
    domainTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 4 },
    activityCard: { borderRadius: 18, overflow: 'hidden', elevation: 3 },
    activityGradient: { padding: 16, gap: 10 },
    activityTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    activityHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    activityEmoji: { fontSize: 34 },
    activityInfo: { flex: 1 },
    activityTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
    activitySubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
    statusBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: 'rgba(0,0,0,0.22)',
      alignSelf: 'flex-start',
    },
    statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    activityMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    metaChipText: { color: '#fff', fontSize: 11, fontWeight: '600' },
    objectiveText: { fontSize: 12, color: 'rgba(255,255,255,0.86)', lineHeight: 17 },
    savingBanner: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 16,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: 'rgba(17,24,39,0.88)',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    savingText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  });
