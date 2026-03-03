import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTeacherDashboard } from '@/hooks/useDashboardData';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { buildReminderEventsFromBlocks, useNextActivityReminder } from '@/hooks/useNextActivityReminder';
import { resolveSchoolTypeFromProfile } from '@/lib/schoolTypeResolver';
import { assertSupabase } from '@/lib/supabase';
import { toast } from '@/components/ui/ToastProvider';
import { canUseFeature, getQuotaStatus } from '@/lib/ai/limits';
import { invokeAIGatewayWithRetry, formatAIGatewayErrorMessage } from '@/lib/ai-gateway/invokeWithRetry';
import { LessonGeneratorService } from '@/lib/ai/lessonGenerator';
import { incrementUsage, logUsageEvent } from '@/lib/ai/usage';

const WEEKDAYS_MONDAY_TO_FRIDAY = [1, 2, 3, 4, 5] as const;

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

const LESSON_OUTPUT_CONTRACT = [
  'Return ONLY valid JSON. Do not return markdown, prose, or code fences.',
  'Schema:',
  '{',
  '  "lessonPlan": {',
  '    "title": "string",',
  '    "summary": "string",',
  '    "objectives": ["string"],',
  '    "materials": ["string"],',
  '    "steps": [',
  '      {',
  '        "title": "string",',
  '        "minutes": 10,',
  '        "objective": "string",',
  '        "instructions": ["string"],',
  '        "teacherPrompt": "string",',
  '        "example": "string"',
  '      }',
  '    ],',
  '    "assessment": ["string"],',
  '    "differentiation": { "support": "string", "extension": "string" },',
  '    "closure": "string",',
  '    "durationMinutes": 45',
  '  }',
  '}',
].join('\n');

function toWeekdayMondayFirst(value: Date): number {
  return value.getDay() === 0 ? 7 : value.getDay();
}

const formatRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return 'Time not set';
  if (start && end) return `${start} - ${end}`;
  return start || end || 'Time not set';
};

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const buildRoutineContext = (routine: {
  title?: string | null;
  blocks: Array<{ title: string; blockType: string; startTime?: string | null; endTime?: string | null }>;
}) => {
  const topBlocks = (routine.blocks || []).slice(0, 8);
  const lines = topBlocks.map((block) => {
    const timeLabel = block.startTime && block.endTime
      ? `${block.startTime}-${block.endTime}`
      : block.startTime || 'TBD';
    return `${timeLabel} [${block.blockType}] ${block.title}`;
  });
  return [
    `Weekly routine context: ${String(routine.title || 'Published routine')}`,
    ...lines,
  ].join('\n');
};

type WeekBlockRow = {
  title: string | null;
  block_type: string | null;
  start_time: string | null;
  end_time: string | null;
  day_of_week: number | null;
};

function inferSubjectFromContext(value: string): string {
  const source = value.toLowerCase();
  if (/(afrikaans|afrikaans huistaal|eerste addisionele taal)/.test(source)) return 'Afrikaans';
  if (/(english|language arts|grammar|reading|writing|comprehension)/.test(source)) return 'English';
  if (/(math|mathematics|numeracy|algebra|fractions|geometry|division|multiplication)/.test(source)) return 'Mathematics';
  if (/(science|natural science|life science|physics|chemistry)/.test(source)) return 'Natural Sciences';
  if (/(social science|history|geography|ems|economics)/.test(source)) return 'Social Sciences';
  if (/(technology|robotics|coding|computer|ict|digital)/.test(source)) return 'Technology';
  if (/(life orientation|wellness|health|sport)/.test(source)) return 'Life Orientation';
  return 'General Studies';
}

function normalizeGradeLevelNumber(rawValue: string): number {
  const match = String(rawValue || '').match(/(\d{1,2})/);
  if (!match) return 3;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(parsed, 12));
}

export default function TeacherDailyProgramPlannerScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const { data, loading, refresh } = useTeacherDashboard();
  const classLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cls of data?.myClasses || []) {
      const classId = String(cls.id || '').trim();
      if (!classId) continue;
      const grade = String(cls.grade || '').trim();
      const className = String(cls.name || '').trim();
      const label = grade && className ? `${grade} · ${className}` : grade || className || 'Class';
      map.set(classId, label);
    }
    return map;
  }, [data?.myClasses]);
  const routineOptions = useMemo(() => {
    const options: Array<{
      key: string;
      label: string;
      routine: NonNullable<typeof data>['todayRoutine'];
    }> = [];
    const seenKeys = new Set<string>();

    for (const routine of data?.classRoutines || []) {
      if (!routine?.weeklyProgramId) continue;
      const classLabel = routine.classId
        ? classLabelById.get(routine.classId) || 'Class routine'
        : 'Class routine';
      const key = `class:${routine.weeklyProgramId}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      options.push({
        key,
        label: classLabel,
        routine,
      });
    }

    if (data?.schoolWideRoutine?.weeklyProgramId) {
      const key = `school:${data.schoolWideRoutine.weeklyProgramId}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        options.push({
          key,
          label: 'School-wide',
          routine: data.schoolWideRoutine,
        });
      }
    }

    if (options.length === 0 && data?.todayRoutine?.weeklyProgramId) {
      options.push({
        key: `default:${data.todayRoutine.weeklyProgramId}`,
        label: data.todayRoutine.classId
          ? classLabelById.get(data.todayRoutine.classId) || 'Class routine'
          : 'School-wide',
        routine: data.todayRoutine,
      });
    }

    return options;
  }, [classLabelById, data?.classRoutines, data?.schoolWideRoutine, data?.todayRoutine]);
  const [selectedRoutineKey, setSelectedRoutineKey] = useState<string | null>(null);
  useEffect(() => {
    if (routineOptions.length === 0) {
      setSelectedRoutineKey(null);
      return;
    }
    setSelectedRoutineKey((prev) => {
      if (prev && routineOptions.some((option) => option.key === prev)) {
        return prev;
      }
      return routineOptions[0].key;
    });
  }, [routineOptions]);
  const routine = useMemo(() => {
    if (!selectedRoutineKey) return data?.todayRoutine || null;
    return routineOptions.find((option) => option.key === selectedRoutineKey)?.routine || data?.todayRoutine || null;
  }, [data?.todayRoutine, routineOptions, selectedRoutineKey]);
  const routineScopeLabel = useMemo(() => {
    if (!routine) return '';
    if (!routine.classId) return 'School-wide routine';
    return classLabelById.get(routine.classId) || 'Class routine';
  }, [classLabelById, routine]);
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const isCompact = width < 760;
  const [reminderSoundEnabled, setReminderSoundEnabled] = useState(true);
  const [weeklyGenerationPending, setWeeklyGenerationPending] = useState(false);
  const resolvedSchoolType = useMemo(() => resolveSchoolTypeFromProfile(profile), [profile]);
  const alignedLessonRoute = resolvedSchoolType === 'k12_school'
    ? '/screens/ai-lesson-generator'
    : '/screens/preschool-lesson-generator';

  const alignedLessonParams = useMemo(() => {
    const routineTopic = routine?.nextBlockTitle || routine?.title || 'Today routine focus';
    const objectiveSeed = (routine?.blocks || [])
      .slice(0, 4)
      .map((block) => block.title)
      .filter(Boolean)
      .join('; ');
    return {
      mode: 'quick',
      pipeline: resolvedSchoolType === 'k12_school' ? 'k12_exam_prep' : 'preschool_activity_pack',
      topic: routineTopic,
      objectives: objectiveSeed,
      weeklyProgramId: routine?.weeklyProgramId || '',
      weekStartDate: routine?.weekStartDate || '',
      classId: routine?.classId || '',
      termId: routine?.termId || '',
      themeId: routine?.themeId || '',
      routineContext: routine ? buildRoutineContext(routine) : '',
    };
  }, [resolvedSchoolType, routine]);

  const reminderBlocksByDay = useMemo(() => {
    if (!routine?.blocks?.length) return {};
    const todayDay = toWeekdayMondayFirst(new Date());
    const blocks = routine.blocks.map((b) => ({
      id: b.id,
      title: b.title,
      start_time: b.startTime ?? null,
    }));
    return { [todayDay]: blocks };
  }, [routine?.blocks]);

  const reminderEvents = useMemo(
    () => buildReminderEventsFromBlocks(reminderBlocksByDay),
    [reminderBlocksByDay],
  );

  const { overlay, notice, dismissOverlay } = useNextActivityReminder({
    events: reminderEvents,
    soundEnabled: reminderSoundEnabled,
    enabled: !!routine && reminderEvents.length > 0,
  });

  const handleGenerateWeekLessons = useCallback(async () => {
    if (!routine?.weeklyProgramId) {
      toast.warn('No published weekly program found for this routine.');
      return;
    }

    if (weeklyGenerationPending) return;

    setWeeklyGenerationPending(true);
    const supabase = assertSupabase();

    try {
      const { data: authData } = await supabase.auth.getUser();
      const authUserId = String(authData?.user?.id || '');
      if (!authUserId) {
        toast.error('You are not signed in. Please sign in and try again.');
        return;
      }

      const { data: teacherProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id,preschool_id,organization_id')
        .or(`auth_user_id.eq.${authUserId},id.eq.${authUserId}`)
        .maybeSingle();

      if (profileError) {
        throw new Error(`Profile lookup failed: ${profileError.message}`);
      }
      if (!teacherProfile) {
        toast.error('Could not find your teacher profile.');
        return;
      }

      const schoolId = teacherProfile.preschool_id || teacherProfile.organization_id;
      if (!schoolId) {
        toast.error('Missing school context. Please contact support.');
        return;
      }

      const { data: weekBlocks, error: weekBlocksError } = await supabase
        .from('daily_program_blocks')
        .select('title,block_type,start_time,end_time,day_of_week,block_order')
        .eq('weekly_program_id', routine.weeklyProgramId)
        .in('day_of_week', [...WEEKDAYS_MONDAY_TO_FRIDAY])
        .order('day_of_week', { ascending: true })
        .order('block_order', { ascending: true });

      if (weekBlocksError) {
        throw new Error(`Weekly block fetch failed: ${weekBlocksError.message}`);
      }

      const normalizedBlocks = (weekBlocks || []) as WeekBlockRow[];
      const activeWeekdays = WEEKDAYS_MONDAY_TO_FRIDAY.filter((day) =>
        normalizedBlocks.some((block) => Number(block.day_of_week || 0) === day),
      );

      if (activeWeekdays.length === 0) {
        toast.warn('No Monday-Friday blocks found in this weekly program.');
        return;
      }

      const gate = await canUseFeature('lesson_generation', activeWeekdays.length);
      if (!gate.allowed) {
        const status = gate.status || await getQuotaStatus('lesson_generation');
        Alert.alert(
          'Monthly limit reached',
          `You need ${activeWeekdays.length} generations, but only ${status.remaining} are available.`,
          [{ text: 'OK', style: 'default' }],
        );
        return;
      }

      let categoryId: string | null = null;
      const { data: categoryRows } = await supabase
        .from('lesson_categories')
        .select('id')
        .limit(1);
      if (categoryRows?.[0]?.id) {
        categoryId = categoryRows[0].id;
      } else {
        const { data: createdCategory, error: categoryError } = await supabase
          .from('lesson_categories')
          .insert({
            name: 'General',
            description: 'Auto-generated from weekly routine',
          })
          .select('id')
          .single();
        if (categoryError) {
          throw new Error(`Category setup failed: ${categoryError.message}`);
        }
        categoryId = createdCategory?.id || null;
      }

      if (!categoryId) {
        throw new Error('No lesson category available for saving lessons.');
      }

      let classDescriptor = 'Current class';
      let gradeLevel = 3;
      if (routine.classId) {
        const { data: classRow } = await supabase
          .from('classes')
          .select('name,grade,grade_level')
          .eq('id', routine.classId)
          .maybeSingle();
        if (classRow?.name) classDescriptor = classRow.name;
        const gradeHint = String(classRow?.grade || classRow?.grade_level || '');
        if (gradeHint) gradeLevel = normalizeGradeLevelNumber(gradeHint);
      }

      let created = 0;
      let failed = 0;
      let skipped = 0;
      const warnings: string[] = [];

      for (const dayOfWeek of WEEKDAYS_MONDAY_TO_FRIDAY) {
        const dayBlocks = normalizedBlocks.filter((block) => Number(block.day_of_week || 0) === dayOfWeek);
        if (dayBlocks.length === 0) {
          skipped += 1;
          continue;
        }

        const weekdayLabel = WEEKDAY_LABELS[dayOfWeek] || `Day ${dayOfWeek}`;
        const objectiveList = dayBlocks
          .map((block) => String(block.title || '').trim())
          .filter(Boolean)
          .slice(0, 5);
        const objectiveSeed = objectiveList.join('; ');
        const firstBlockTitle = objectiveList[0] || `${routine.title || 'Weekly routine'} focus`;
        const subjectContextSource = [
          routine.title || '',
          routine.summary || '',
          ...objectiveList,
        ].join(' ');
        const subject = inferSubjectFromContext(subjectContextSource);
        const routineContext = dayBlocks
          .map((block) => {
            const start = String(block.start_time || '').trim();
            const end = String(block.end_time || '').trim();
            const timeLabel = start && end ? `${start}-${end}` : start || 'TBD';
            return `${timeLabel} [${String(block.block_type || 'learning')}] ${String(block.title || 'Routine block')}`;
          })
          .join('\n');

        const prompt = [
          `Generate a CAPS-aligned lesson plan for ${weekdayLabel}.`,
          `Class: ${classDescriptor}.`,
          `Grade: ${gradeLevel}.`,
          `Subject: ${subject}.`,
          `Topic: ${firstBlockTitle}.`,
          `Learning objectives: ${objectiveSeed || 'Use the routine blocks to derive objectives.'}.`,
          'Include warm-up, guided activity, independent work, assessment, differentiation, and closure.',
          `Routine context for ${weekdayLabel}:\n${routineContext}`,
          LESSON_OUTPUT_CONTRACT,
        ].join('\n');

        const payload = {
          action: 'lesson_generation',
          prompt,
          topic: `${firstBlockTitle} (${weekdayLabel})`,
          subject,
          gradeLevel,
          duration: 45,
          objectives: objectiveList,
          language: 'en',
          model: process.env.EXPO_PUBLIC_ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
          context: `Weekly program ${routine.weeklyProgramId} • ${weekdayLabel}\n${routineContext}`,
        };

        const { data, error } = await invokeAIGatewayWithRetry(payload, {
          retries: 1,
          retryDelayMs: 1200,
        });

        if (error) {
          failed += 1;
          warnings.push(`${weekdayLabel}: ${formatAIGatewayErrorMessage(error, 'Generation failed')}`);
          continue;
        }

        const lessonContent = String(data?.content || '').trim();
        if (!lessonContent) {
          failed += 1;
          warnings.push(`${weekdayLabel}: AI returned empty lesson content.`);
          continue;
        }

        const saved = await LessonGeneratorService.saveGeneratedLesson({
          lesson: {
            title: `${weekdayLabel}: ${firstBlockTitle}`,
            description: `Auto-generated from weekly routine (${weekdayLabel}).`,
            content: lessonContent,
          },
          teacherId: teacherProfile.id,
          preschoolId: String(schoolId),
          ageGroupId: resolvedSchoolType === 'k12_school' ? 'n/a' : 'preschool',
          categoryId,
          template: { duration: 45, complexity: 'moderate' },
          isPublished: true,
          subject,
        });

        if (!saved.success) {
          failed += 1;
          warnings.push(`${weekdayLabel}: ${saved.error || 'Could not save generated lesson.'}`);
          continue;
        }

        created += 1;
        try {
          await incrementUsage('lesson_generation', 1);
          await logUsageEvent({
            feature: 'lesson_generation',
            model: String(payload.model),
            tokensIn: Number(data?.usage?.input_tokens || 0),
            tokensOut: Number(data?.usage?.output_tokens || 0),
            estCostCents: Number(data?.cost || 0),
            timestamp: new Date().toISOString(),
          });
        } catch {
          // Usage logging failures are non-fatal for batch lesson generation.
        }
      }

      const summary = `Created ${created} lesson(s), skipped ${skipped}, failed ${failed}.`;
      if (created > 0) {
        toast.success(`Weekly generation complete. ${summary}`);
        Alert.alert('Week lessons generated', summary, [
          { text: 'Stay here', style: 'cancel' },
          { text: 'Open lesson plans', onPress: () => router.push('/screens/teacher-lessons') },
        ]);
      } else {
        toast.error(`No lessons were created. ${summary}`);
      }

      if (warnings.length > 0) {
        const firstWarning = warnings[0];
        const remaining = warnings.length - 1;
        toast.warn(
          remaining > 0
            ? `${firstWarning} (+${remaining} more warning${remaining > 1 ? 's' : ''})`
            : firstWarning,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate week lessons';
      toast.error(message);
    } finally {
      setWeeklyGenerationPending(false);
    }
  }, [routine, weeklyGenerationPending, resolvedSchoolType]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      {overlay ? (
        <Modal visible={true} transparent animationType="fade" onRequestClose={dismissOverlay}>
          <TouchableOpacity style={styles.reminderOverlayBackdrop} activeOpacity={1} onPress={dismissOverlay}>
            <View style={[styles.reminderOverlayContent, isCompact && styles.reminderOverlayContentCompact, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
              <Text style={[styles.reminderOverlayLabel, { color: theme.textSecondary }]}>Reminder</Text>
              <Text style={[styles.reminderOverlayMinutes, { color: theme.text }]}>{overlay.threshold} min</Text>
              <Text style={[styles.reminderOverlayTitle, { color: theme.text }]}>{overlay.title}</Text>
              <Text style={[styles.reminderOverlayHint, { color: theme.textSecondary }]}>Prepare transition now.</Text>
              <TouchableOpacity
                style={[styles.reminderOverlayButton, { borderColor: theme.primary, backgroundColor: `${theme.primary}22` }]}
                onPress={dismissOverlay}
              >
                <Text style={[styles.reminderOverlayButtonText, { color: theme.primary }]}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      ) : null}

      <View style={styles.header}>
        <View style={styles.headerShell}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Daily Routine</Text>
            <Text style={styles.headerSubtitle}>Teacher view only: routine is managed by principal/admin.</Text>
          </View>
        </View>
      </View>

      {loading && !routine ? (
        <View style={styles.loadingWrap}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading today's routine...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.pageShell}>
          {routine ? (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{routine.title || 'Published school routine'}</Text>
                <Text style={styles.cardMeta}>
                  {formatDate(routine.weekStartDate)} - {formatDate(routine.weekEndDate)} • {routineScopeLabel} • {routine.blockCount} blocks
                </Text>
                {routineOptions.length > 1 ? (
                  <View style={styles.routineSwitchRow}>
                    {routineOptions.map((option) => {
                      const isActive = option.key === selectedRoutineKey;
                      return (
                        <TouchableOpacity
                          key={option.key}
                          style={[
                            styles.routineSwitchChip,
                            { borderColor: isActive ? theme.primary : theme.border, backgroundColor: isActive ? `${theme.primary}1c` : theme.background },
                          ]}
                          onPress={() => setSelectedRoutineKey(option.key)}
                        >
                          <Text style={[styles.routineSwitchChipText, { color: isActive ? theme.primary : theme.textSecondary }]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
                {routine.nextBlockTitle ? (
                  <>
                    <View style={styles.nextBlockRow}>
                      <View style={styles.nextBlockPill}>
                        <Ionicons name="time-outline" size={14} color="#fff" />
                        <Text style={styles.nextBlockText}>
                          Next: {routine.nextBlockTitle}
                          {routine.nextBlockStart ? ` at ${routine.nextBlockStart}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.reminderSoundToggle, { borderColor: reminderSoundEnabled ? theme.primary : theme.border }]}
                        onPress={() => setReminderSoundEnabled((prev) => !prev)}
                      >
                        <Ionicons
                          name={reminderSoundEnabled ? 'volume-high-outline' : 'volume-mute-outline'}
                          size={14}
                          color={reminderSoundEnabled ? theme.primary : theme.textSecondary}
                        />
                        <Text style={[styles.reminderSoundToggleText, { color: reminderSoundEnabled ? theme.primary : theme.textSecondary }]}>
                          {reminderSoundEnabled ? 'Sound on' : 'Sound off'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {notice ? (
                      <View style={[styles.reminderNotice, { backgroundColor: `${theme.primary}18`, borderColor: theme.primary }]}>
                        <Ionicons name="notifications-outline" size={12} color={theme.primary} />
                        <Text style={[styles.reminderNoticeText, { color: theme.text }]}>{notice}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>

              <View style={styles.blockListCard}>
                <Text style={styles.sectionTitle}>Today's blocks</Text>
                {routine.blocks.map((block, index) => (
                  <View key={block.id} style={styles.blockRow}>
                    <View style={styles.blockIndex}>
                      <Text style={styles.blockIndexText}>{index + 1}</Text>
                    </View>
                    <View style={styles.blockBody}>
                      <Text style={styles.blockTitle}>{block.title}</Text>
                      <Text style={styles.blockMeta}>
                        {formatRange(block.startTime, block.endTime)} • {block.blockType}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>No published routine yet</Text>
              <Text style={styles.cardMeta}>
                Ask your principal/admin to publish a school-wide or class routine. It will appear here automatically.
              </Text>
            </View>
          )}

          <View style={styles.actionsCard}>
            <Text style={styles.sectionTitle}>Lesson tools</Text>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push({ pathname: alignedLessonRoute as any, params: alignedLessonParams } as any)}
            >
              <Ionicons name="sparkles-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>Generate lesson from routine</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, weeklyGenerationPending && styles.actionButtonDisabled]}
              onPress={handleGenerateWeekLessons}
              disabled={weeklyGenerationPending || !routine}
            >
              {weeklyGenerationPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="calendar-outline" size={18} color="#fff" />
              )}
              <Text style={styles.actionText}>
                {weeklyGenerationPending ? 'Generating Mon-Fri lessons...' : 'Generate week lessons (Mon-Fri)'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/screens/teacher-lessons')}>
              <Ionicons name="book-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>Open lesson plans</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/screens/assign-lesson')}>
              <Ionicons name="link-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>Assign lessons to today's blocks</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/screens/room-display-connect')}>
              <Ionicons name="tv-outline" size={18} color={theme.text} />
              <Text style={styles.secondaryText}>Open Room Display link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() =>
                router.push({
                  pathname: '/screens/teacher-routine-requests',
                  params: {
                    requestType: 'daily_routine',
                    weekStartDate: routine?.weekStartDate || '',
                    classId: routine?.classId || '',
                    themeTitle: routine?.title || '',
                  },
                })
              }
            >
              <Ionicons name="clipboard-outline" size={18} color={theme.text} />
              <Text style={styles.secondaryText}>Request new routine/program</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
              <Ionicons name="refresh-outline" size={16} color={theme.primary} />
              <Text style={styles.refreshText}>Refresh routine</Text>
            </TouchableOpacity>
          </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerShell: {
      width: '100%',
      maxWidth: 980,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTextWrap: {
      flex: 1,
    },
    headerTitle: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '800',
    },
    headerSubtitle: {
      color: theme.textSecondary,
      fontSize: 13,
      marginTop: 3,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    loadingText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '500',
    },
    scrollContent: {
      padding: 16,
      gap: 14,
      paddingBottom: 20,
    },
    pageShell: {
      width: '100%',
      maxWidth: 980,
      alignSelf: 'center',
      gap: 14,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 8,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '700',
    },
    cardMeta: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    routineSwitchRow: {
      marginTop: 4,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    routineSwitchChip: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    routineSwitchChipText: {
      fontSize: 11,
      fontWeight: '700',
    },
    nextBlockRow: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    nextBlockPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.primary,
      borderRadius: 999,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    nextBlockText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    reminderSoundToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    reminderSoundToggleText: {
      fontSize: 11,
      fontWeight: '600',
    },
    reminderNotice: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    reminderNoticeText: {
      flex: 1,
      fontSize: 11,
      fontWeight: '600',
    },
    reminderOverlayBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    reminderOverlayContent: {
      borderWidth: 1,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      minWidth: 260,
      width: '100%',
      maxWidth: 380,
    },
    reminderOverlayContentCompact: {
      minWidth: 0,
      paddingHorizontal: 18,
      paddingVertical: 20,
    },
    reminderOverlayLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    reminderOverlayMinutes: {
      fontSize: 40,
      fontWeight: '900',
      marginTop: 8,
    },
    reminderOverlayTitle: {
      fontSize: 17,
      fontWeight: '700',
      marginTop: 12,
      textAlign: 'center',
    },
    reminderOverlayHint: {
      fontSize: 12,
      marginTop: 4,
    },
    reminderOverlayButton: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 10,
      marginTop: 16,
    },
    reminderOverlayButtonText: {
      fontSize: 14,
      fontWeight: '700',
    },
    blockListCard: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 10,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
    },
    blockRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 10,
      backgroundColor: theme.background,
    },
    blockIndex: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
    },
    blockIndexText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '800',
    },
    blockBody: {
      flex: 1,
      gap: 2,
    },
    blockTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
    },
    blockMeta: {
      color: theme.textSecondary,
      fontSize: 12,
      textTransform: 'capitalize',
    },
    actionsCard: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 10,
    },
    actionButton: {
      minHeight: 46,
      borderRadius: 12,
      backgroundColor: theme.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    actionText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
    },
    actionButtonDisabled: {
      opacity: 0.8,
    },
    secondaryButton: {
      minHeight: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    secondaryText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
    },
    refreshButton: {
      marginTop: 4,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    refreshText: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '700',
    },
  });
