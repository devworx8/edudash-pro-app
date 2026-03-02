/**
 * Exam Generation Screen (React Native)
 *
 * Structured generation flow powered by the generate-exam edge function.
 * Handles loading, error+retry, then renders interactive exam view.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';
import { consumeExamGenerationDraft } from '@/lib/exam-prep/generationDraftStore';
import { parseExamMarkdown, type ParsedExam } from '@/lib/examParser';
import { ExamInteractiveView, type ExamResults } from '@/components/exam-prep/ExamInteractiveView';
import { ExamFlashcardsView } from '@/components/exam-prep/ExamFlashcardsView';
import { ExamRevisionNotesView } from '@/components/exam-prep/ExamRevisionNotesView';
import { ExamStudyGuideView } from '@/components/exam-prep/ExamStudyGuideView';
import { GenerationStatusChip } from '@/components/exam-prep/GenerationStatusChip';
import {
  coerceExamArtifactType,
  parseExamGenerationPayload,
} from '@/components/exam-prep/examArtifactHelpers';
import type {
  ExamArtifact,
  ExamArtifactType,
  ExamBlueprintAudit,
  ExamContextSummary,
  ExamGenerationResponse,
  ExamScopeDiagnostics,
  ExamStudyCoachPack,
  ExamTeacherAlignmentSummary,
} from '@/components/exam-prep/types';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { QuotaRingWithStatus } from '@/components/ui/CircularQuotaRing';
import { useAIUserLimits } from '@/hooks/useAI';
import { extractInvokeErrorDetails } from '@/components/exam-prep/generationErrorMapping';

type GenerationState = 'loading' | 'error' | 'ready';

function toSafeParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function toNumberMap(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  const map: Record<string, number> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    map[key] = Math.max(0, numeric);
  }
  return map;
}

function pickQuotaValue(map: Record<string, number>, keys: string[]): number {
  for (const key of keys) {
    const value = map[key];
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

export default function ExamGenerationScreen() {
  const { theme, isDark } = useTheme();
  const params = useLocalSearchParams<{
    grade?: string;
    subject?: string;
    examType?: string;
    type?: string;
    language?: string;
    studentId?: string;
    classId?: string;
    schoolId?: string;
    childName?: string;
    useTeacherContext?: string;
    fallbackPolicy?: string;
    qualityMode?: string;
    draftId?: string;
    examId?: string;
    loadSaved?: string;
    retake?: string;
  }>();

  const grade = toSafeParam(params.grade);
  const subject = toSafeParam(params.subject);
  const examType = toSafeParam(params.examType) || toSafeParam(params.type) || 'practice_test';
  const language = toSafeParam(params.language) || 'en-ZA';
  const studentId = toSafeParam(params.studentId);
  const classId = toSafeParam(params.classId);
  const schoolId = toSafeParam(params.schoolId);
  const childName = toSafeParam(params.childName);
  const useTeacherContext = toBool(toSafeParam(params.useTeacherContext), true);
  const fallbackPolicy = toSafeParam(params.fallbackPolicy) || 'provider_outage_only';
  const qualityMode = toSafeParam(params.qualityMode) || 'standard';
  const draftId = toSafeParam(params.draftId);
  const savedExamId = toSafeParam(params.examId);
  const loadSaved = toBool(toSafeParam(params.loadSaved), false);
  const retakeMode = toBool(toSafeParam(params.retake), false);
  const [generationDraft] = useState(() => consumeExamGenerationDraft(draftId));
  const customPrompt = generationDraft?.customPrompt?.trim() || '';
  const usesUploadedMaterial = useMemo(
    () =>
      Boolean(
        customPrompt &&
          (customPrompt.includes('Study material extracted') ||
            customPrompt.includes('uploaded images') ||
            customPrompt.includes('uploaded material') ||
            customPrompt.includes('Study Notes')),
      ),
    [customPrompt],
  );

  const { data: aiLimits } = useAIUserLimits();
  const quotaMap = useMemo(() => toNumberMap((aiLimits as any)?.quotas), [aiLimits]);
  const usedMap = useMemo(
    () => toNumberMap((aiLimits as any)?.used ?? (aiLimits as any)?.current_usage),
    [aiLimits],
  );
  const examQuotaKeys = useMemo(
    () => ['exam_generation', 'grading_assistance', 'lesson_generation'],
    [],
  );
  const examQuotaLimit = useMemo(
    () => pickQuotaValue(quotaMap, examQuotaKeys),
    [quotaMap, examQuotaKeys],
  );
  const examQuotaUsed = useMemo(
    () => pickQuotaValue(usedMap, examQuotaKeys),
    [usedMap, examQuotaKeys],
  );
  const examQuotaRemaining = Math.max(0, examQuotaLimit - examQuotaUsed);
  const examQuotaWarning = examQuotaLimit > 0 && examQuotaRemaining <= 0
    ? 'Monthly exam quota appears exhausted.'
    : examQuotaLimit > 0 && examQuotaRemaining <= 2
      ? `Low exam quota: ${examQuotaRemaining} left this month.`
      : null;
  const [state, setState] = useState<GenerationState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [exam, setExam] = useState<ParsedExam | null>(null);
  const [artifactType, setArtifactType] = useState<ExamArtifactType>('practice_test');
  const [artifact, setArtifact] = useState<ExamArtifact | null>(null);
  const [examId, setExamId] = useState<string>('');
  const [contextSummary, setContextSummary] = useState<ExamContextSummary | null>(null);
  const [scopeDiagnostics, setScopeDiagnostics] = useState<ExamScopeDiagnostics | null>(null);
  const [teacherAlignment, setTeacherAlignment] = useState<ExamTeacherAlignmentSummary | null>(null);
  const [blueprintAudit, setBlueprintAudit] = useState<ExamBlueprintAudit | null>(null);
  const [studyCoachPack, setStudyCoachPack] = useState<ExamStudyCoachPack | null>(null);
  const [generationMode, setGenerationMode] = useState<'ai' | 'outage_fallback'>('ai');
  const [qualityReport, setQualityReport] = useState<ExamGenerationResponse['qualityReport'] | null>(null);
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);
  const [showGenerationStatus, setShowGenerationStatus] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<string | null>(null);
  // Parents mainly care about the actual exam; keep the
  // audit + study coach collapsed by default on small screens.
  const [showAudit, setShowAudit] = useState(false);
  const hasGenerationWarning = useMemo(
    () =>
      Boolean(
        (persistenceWarning && persistenceWarning.trim().length > 0) ||
          generationMode === 'outage_fallback' ||
          qualityReport?.repaired,
      ),
    [persistenceWarning, generationMode, qualityReport],
  );
  const isPracticeArtifact = artifactType === 'practice_test';

  const generationLabel = useMemo(() => {
    if (!grade || !subject) return 'Preparing generation request...';
    return `Generating ${grade.replace('grade_', 'Grade ')} ${subject}`;
  }, [grade, subject]);

  const parseExamPayload = useCallback((payload: unknown): ParsedExam | null => {
    if (!payload) return null;

    if (typeof payload === 'string') {
      return parseExamMarkdown(payload);
    }

    try {
      const asString = JSON.stringify(payload);
      return parseExamMarkdown(asString);
    } catch (err) {
      return null;
    }
  }, []);

  const generateExam = useCallback(async () => {
    if (!grade || !subject || !examType) {
      setError('Missing required exam details. Please return to Exam Prep and try again.');
      setState('error');
      return;
    }

    setState('loading');
    setError(null);

    try {
      const supabase = assertSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const invokeOptions: {
        body: Record<string, unknown>;
        headers?: Record<string, string>;
      } = {
        body: {
          grade,
          subject,
          examType,
          language,
          allowFallback: fallbackPolicy !== 'never',
          fallbackPolicy,
          qualityMode,
          customPrompt: customPrompt || undefined,
          studentId,
          classId,
          schoolId,
          useTeacherContext,
          examIntentMode: useTeacherContext ? 'teacher_weighted' : 'caps_only',
          fullPaperMode: true,
          visualMode: 'hybrid',
          guidedMode: 'guided_first',
          lookbackDays: 45,
        },
      };

      if (token) {
        invokeOptions.headers = { Authorization: `Bearer ${token}` };
      }

      const { data, error } = await supabase.functions.invoke('generate-exam', invokeOptions);
      if (error) {
        const details = await extractInvokeErrorDetails(error, data);
        throw new Error(details.message || 'Failed to generate exam');
      }

      const response = data as ExamGenerationResponse;
      if (!response?.success) {
        throw new Error(response?.error || 'Generation failed. Please try again.');
      }

      const parsedPayload = parseExamGenerationPayload(
        {
          artifactType: response.artifactType,
          artifact: response.artifact,
          exam: response.exam,
        },
        parseExamPayload,
        coerceExamArtifactType(response.artifactType, coerceExamArtifactType(examType, 'practice_test')),
      );

      if (parsedPayload.artifactType === 'practice_test') {
        if (!parsedPayload.exam || !parsedPayload.exam.sections?.length) {
          throw new Error('Generated exam format was invalid. Please retry.');
        }
        setExam({
          ...parsedPayload.exam,
          grade: parsedPayload.exam.grade || grade,
          subject: parsedPayload.exam.subject || subject,
        });
        setArtifact(null);
      } else {
        if (!parsedPayload.artifact) {
          throw new Error('Generated study artifact format was invalid. Please retry.');
        }
        setExam(parsedPayload.exam);
        setArtifact(parsedPayload.artifact);
      }

      setArtifactType(parsedPayload.artifactType);
      setExamId(response.examId || `temp-${Date.now()}`);
      setContextSummary(response.contextSummary || null);
      setScopeDiagnostics(response.scopeDiagnostics || null);
      setTeacherAlignment(response.teacherAlignment || null);
      setBlueprintAudit(response.examBlueprintAudit || null);
      setStudyCoachPack(response.studyCoachPack || null);
      setGenerationMode(response.generationMode || 'ai');
      setQualityReport(response.qualityReport || null);
      setPersistenceWarning(response.persistenceWarning || null);
      setShowGenerationStatus(false);
      setState('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate exam';
      setError(message);
      setState('error');
    }
  }, [
    grade,
    subject,
    examType,
    language,
    customPrompt,
    studentId,
    classId,
    schoolId,
    useTeacherContext,
    fallbackPolicy,
    qualityMode,
    parseExamPayload,
  ]);

  const loadSavedExam = useCallback(async () => {
    if (!savedExamId) return;
    setState('loading');
    setError(null);
    try {
      const supabase = assertSupabase();
      const { data, error: fetchError } = await supabase
        .from('exam_generations')
        .select('id, generated_content, display_title, grade, subject, exam_type')
        .eq('id', savedExamId)
        .single();

      if (fetchError || !data) {
        setError('Could not load saved exam. It may have been deleted.');
        setState('error');
        return;
      }

      const parsedPayload = parseExamGenerationPayload(
        data.generated_content,
        parseExamPayload,
        coerceExamArtifactType(data.exam_type, 'practice_test'),
      );

      if (parsedPayload.artifactType === 'practice_test') {
        if (!parsedPayload.exam || parsedPayload.exam.sections.length === 0) {
          setError('Exam content could not be parsed.');
          setState('error');
          return;
        }
        setExam(parsedPayload.exam);
        setArtifact(null);
      } else {
        if (!parsedPayload.artifact) {
          setError('Study artifact content could not be parsed.');
          setState('error');
          return;
        }
        setExam(parsedPayload.exam);
        setArtifact(parsedPayload.artifact);
      }

      setArtifactType(parsedPayload.artifactType);
      setExamId(data.id);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exam');
      setState('error');
    }
  }, [savedExamId, parseExamPayload]);

  useEffect(() => {
    if (loadSaved && savedExamId) {
      loadSavedExam();
    } else {
      generateExam();
    }
  }, [loadSaved, savedExamId, loadSavedExam, generateExam]);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const handleComplete = useCallback(
    (results: ExamResults) => {
      setCompletionSummary(`Score: ${results.percentage}% (${results.earnedMarks}/${results.totalMarks})`);
    },
    []
  );

  const readyWithPayload =
    state === 'ready' &&
    ((isPracticeArtifact && !!exam) || (!isPracticeArtifact && !!artifact));

  if (readyWithPayload) {
    const canShowAuditToggle =
      Boolean(contextSummary || teacherAlignment || blueprintAudit || studyCoachPack) &&
      (isPracticeArtifact ? Boolean(completionSummary) : true);

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.readyContent}>
          {hasGenerationWarning || usesUploadedMaterial ? (
            <GenerationStatusChip
              theme={theme}
              hasGenerationWarning={hasGenerationWarning}
              showDetails={showGenerationStatus}
              onToggle={() => setShowGenerationStatus((prev) => !prev)}
              persistenceWarning={persistenceWarning}
              usesUploadedMaterial={usesUploadedMaterial}
              generationMode={generationMode}
              qualityRepaired={Boolean(qualityReport?.repaired)}
            />
          ) : null}
          {isPracticeArtifact && completionSummary ? (
            <View style={[styles.completionBanner, { borderColor: `${theme.success}55`, backgroundColor: `${theme.success}18` }]}>
              <View style={styles.completionBannerLeft}>
                <Ionicons name="checkmark-circle" size={18} color={theme.success} />
                <Text style={[styles.completionText, { color: theme.success }]}>Exam submitted. {completionSummary}</Text>
              </View>
              <TouchableOpacity style={[styles.doneButton, { borderColor: theme.success }]} onPress={() => router.back()}>
                <Text style={[styles.doneButtonText, { color: theme.success }]}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {/* Compact toggle — only shown after exam is completed so it doesn't distract during the test */}
          {canShowAuditToggle && (
            <View style={[styles.auditToggleRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <TouchableOpacity
                style={styles.auditToggleButton}
                onPress={() => setShowAudit(prev => !prev)}
                activeOpacity={0.85}
              >
                <View style={styles.auditToggleLeft}>
                  <Ionicons
                    name={showAudit ? 'chevron-down' : 'information-circle-outline'}
                    size={16}
                    color={theme.primary}
                  />
                  <Text style={[styles.auditToggleLabel, { color: theme.text }]}>
                    {showAudit ? 'Hide exam summary' : 'Show exam summary & study coach'}
                  </Text>
                </View>
                <Text style={[styles.auditToggleHint, { color: theme.muted }]}>
                  {grade && subject ? `${grade.replace('grade_', 'Grade ')} • ${subject}` : 'Generation details'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {showAudit && (contextSummary || teacherAlignment || blueprintAudit) ? (
            <View style={[styles.metaCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.metaTitle, { color: theme.text }]}>Exam generation audit</Text>
              {contextSummary ? (
                <Text style={[styles.metaLine, { color: theme.muted }]}>
                  Teacher context: {contextSummary.assignmentCount} assignments • {contextSummary.lessonCount} lessons
                </Text>
              ) : null}
              {teacherAlignment ? (
                <Text style={[styles.metaLine, { color: theme.muted }]}>
                  Alignment score: {teacherAlignment.coverageScore}% • intent-tagged artifacts: {teacherAlignment.intentTaggedCount}
                </Text>
              ) : null}
              {blueprintAudit ? (
                <Text style={[styles.metaLine, { color: theme.muted }]}>
                  Blueprint: {blueprintAudit.actualQuestions} questions ({blueprintAudit.minQuestions}-{blueprintAudit.maxQuestions}) • {blueprintAudit.totalMarks} marks
                </Text>
              ) : null}
              {scopeDiagnostics ? (
                <Text style={[styles.metaLine, { color: theme.muted }]}>
                  Scope: student {scopeDiagnostics.effectiveStudentId || 'none'} • class {scopeDiagnostics.effectiveClassId || 'none'} • school {scopeDiagnostics.effectiveSchoolId || 'none'}
                </Text>
              ) : null}
            </View>
          ) : null}
          {showAudit && studyCoachPack ? (
            <View style={[styles.studyCoachCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.metaTitle, { color: theme.text }]}>{studyCoachPack.planTitle || '4-day study coach + test day'}</Text>
              {studyCoachPack.days?.slice(0, 2).map((day) => (
                <View key={day.day} style={styles.studyCoachRow}>
                  <Text style={[styles.studyCoachDay, { color: theme.primary }]}>{day.day}</Text>
                  <View style={styles.studyCoachCopy}>
                    <Text style={[styles.studyCoachFocus, { color: theme.text }]}>{day.focus}</Text>
                    <Text style={[styles.studyCoachHint, { color: theme.muted }]} numberOfLines={2}>
                      Reading: {day.readingPiece}
                    </Text>
                    <Text style={[styles.studyCoachHint, { color: theme.muted }]} numberOfLines={2}>
                      Paper drill: {day.paperWritingDrill}
                    </Text>
                    <Text style={[styles.studyCoachHint, { color: theme.muted }]} numberOfLines={2}>
                      Memory: {day.memoryActivity}
                    </Text>
                  </View>
                </View>
              ))}
              {studyCoachPack.testDayChecklist?.length ? (
                <Text style={[styles.metaLine, { color: theme.muted }]}>
                  Test-day checklist: {studyCoachPack.testDayChecklist.slice(0, 3).join(' • ')}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.examViewWrap}>
            {isPracticeArtifact && exam ? (
              <ExamInteractiveView
                exam={exam}
                examId={examId}
                examLanguage={language}
                studentId={studentId}
                classId={classId}
                schoolId={schoolId}
                retakeMode={retakeMode}
                onComplete={handleComplete}
                onExit={handleBack}
              />
            ) : artifact?.type === 'flashcards' ? (
              <ExamFlashcardsView artifact={artifact.flashcards} theme={theme} />
            ) : artifact?.type === 'revision_notes' ? (
              <ExamRevisionNotesView artifact={artifact.revisionNotes} theme={theme} />
            ) : artifact?.type === 'study_guide' ? (
              <ExamStudyGuideView artifact={artifact.studyGuide} theme={theme} />
            ) : (
              <View style={styles.centerBlock}>
                <Text style={[styles.errorText, { color: theme.muted }]}>No study artifact to display.</Text>
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={isDark ? ['#0f172a', '#111827'] : ['#eff6ff', '#f8fafc']}
        style={[styles.header, { borderBottomColor: theme.border }]}
      >
        <TouchableOpacity style={[styles.backButton, { borderColor: theme.border }]} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Generating Exam</Text>
          <Text style={[styles.headerSubtitle, { color: theme.muted }]}>
            {childName ? `For ${childName}` : 'Structured CAPS exam pipeline'}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.contentWrap}>
        {state === 'loading' ? (
          <View style={styles.centerBlock}>
            <EduDashSpinner color={theme.primary} />
            <Text style={[styles.loadingTitle, { color: theme.text }]}>Please wait...</Text>
            <Text style={[styles.loadingText, { color: theme.muted }]}>{generationLabel}</Text>
            <Text style={[styles.loadingSubtext, { color: theme.muted }]}>Using {useTeacherContext ? 'teacher artifacts + CAPS' : 'CAPS baseline'} to build this paper.</Text>
            {examQuotaLimit > 0 ? (
              <View style={{ marginTop: 24 }}>
                <QuotaRingWithStatus
                  featureName="Exam prep"
                  used={examQuotaUsed}
                  limit={examQuotaLimit}
                  isGenerating
                  size={70}
                />
              </View>
            ) : null}
            {examQuotaWarning ? (
              <Text style={[styles.quotaWarningText, { color: theme.warning }]}>
                {examQuotaWarning}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.centerBlock}>
            <View style={[styles.errorIconWrap, { backgroundColor: `${theme.error}22` }]}>
              <Ionicons name="alert-circle" size={28} color={theme.error} />
            </View>
            <Text style={[styles.errorTitle, { color: theme.text }]}>Generation failed</Text>
            <Text style={[styles.errorText, { color: theme.muted }]}>{error || 'Please try again.'}</Text>
            {examQuotaWarning ? (
              <Text style={[styles.quotaWarningText, { color: theme.warning }]}>
                {examQuotaWarning}
              </Text>
            ) : null}

            {contextSummary ? (
              <Text style={[styles.contextNote, { color: theme.muted }]}>
                Context found: {contextSummary.assignmentCount} assignments • {contextSummary.lessonCount} lessons
              </Text>
            ) : null}

            <View style={styles.errorButtons}>
              <TouchableOpacity style={[styles.secondaryButton, { borderColor: theme.border }]} onPress={handleBack}>
                <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.primary }]} onPress={generateExam}>
                <Text style={styles.primaryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  readyContent: {
    flex: 1,
  },
  completionBanner: {
    marginHorizontal: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  completionBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  completionText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  doneButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  doneButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metaCard: {
    marginHorizontal: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  metaTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  metaLine: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  studyCoachCard: {
    marginHorizontal: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  studyCoachRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  studyCoachDay: {
    width: 54,
    fontSize: 12,
    fontWeight: '700',
  },
  studyCoachCopy: {
    flex: 1,
    gap: 2,
  },
  studyCoachFocus: {
    fontSize: 12,
    fontWeight: '600',
  },
  studyCoachHint: {
    fontSize: 11,
    lineHeight: 16,
  },
  auditToggleRow: {
    marginHorizontal: 14,
    marginBottom: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  auditToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  auditToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  auditToggleLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  auditToggleHint: {
    fontSize: 11,
    fontWeight: '500',
  },
  examViewWrap: {
    flex: 1,
  },
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '700',
  },
  loadingText: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
  },
  loadingSubtext: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
  },
  quotaWarningText: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '700',
  },
  errorText: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  contextNote: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 12,
  },
  errorButtons: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
