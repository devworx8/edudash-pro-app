/**
 * Exam Prep Wizard (React Native)
 *
 * Feature component kept outside route file so screens remain thin per WARP.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, Text, View } from 'react-native';
import {
  GRADES,
  SUBJECTS_BY_PHASE,
  getPhaseFromGrade,
  type ExamContextSummary,
  type SouthAfricanLanguage,
} from '@/components/exam-prep/types';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { hasCapability, getRequiredTier, type Tier } from '@/lib/ai/capabilities';
import { getCapabilityTier, normalizeTierName } from '@/lib/tiers';
import { stashExamGenerationDraft } from '@/lib/exam-prep/generationDraftStore';
import {
  getSubjectCategory,
  toSafeParam,
  type SubjectCategory,
  type WizardStep,
} from '@/components/exam-prep/examPrepWizard.helpers';
import { examPrepWizardStyles as styles } from '@/components/exam-prep/examPrepWizard.styles';
import { useAIUserLimits } from '@/hooks/useAI';
import { useStudyMaterialPipeline } from '@/hooks/exam-prep/useStudyMaterialPipeline';
import { ExamPrepWizardHeader } from '@/components/exam-prep/ExamPrepWizardHeader';
import { ExamPrepQuickLaunchCard } from '@/components/exam-prep/ExamPrepQuickLaunchCard';
import { ExamPrepWizardStepContent } from '@/components/exam-prep/ExamPrepWizardStepContent';
import { ExamPrepLockedView } from '@/components/exam-prep/ExamPrepLockedView';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';
import {
  buildCustomPrompt as buildCustomPromptBlock,
  buildGenerationHref,
  buildQuickLaunchHref,
  fetchContextPreview as fetchContextPreviewFromApi,
  getFirstQuotaValue,
  toQuotaMap,
} from '@/components/exam-prep/examPrepWizard.logic';

export function ExamPrepWizard(): React.ReactElement {
  const { theme, isDark } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const { tier } = useSubscription();
  const params = useLocalSearchParams<{
    grade?: string;
    childName?: string;
    studentId?: string;
    classId?: string;
    schoolId?: string;
  }>();
  const gradeParam = toSafeParam(params.grade);
  const childName = toSafeParam(params.childName);
  const studentId = toSafeParam(params.studentId);
  const classId = toSafeParam(params.classId);
  const schoolId = toSafeParam(params.schoolId);
  const hasPrefilledGrade = !!(gradeParam && GRADES.some((grade) => grade.value === gradeParam));
  const [selectedGrade, setSelectedGrade] = useState<string>(hasPrefilledGrade ? gradeParam! : 'grade_4');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedExamType, setSelectedExamType] = useState<string>('practice_test');
  const [selectedLanguage, setSelectedLanguage] = useState<SouthAfricanLanguage>('en-ZA');
  const [step, setStep] = useState<WizardStep>(hasPrefilledGrade ? 'subject' : 'grade');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectCategory, setSubjectCategory] = useState<SubjectCategory>('all');
  const [useTeacherContext, setUseTeacherContext] = useState(true);
  const [contextPreview, setContextPreview] = useState<ExamContextSummary | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [customPromptText, setCustomPromptText] = useState('');
  const contextRequestSeqRef = useRef(0);
  const {
    studyMaterials,
    pdfSplitProgress,
    isMaterialPipelineBusy,
    hasBlockingMaterialErrors,
    failedMaterialCount,
    pausedMaterialCount,
    materialPipelineLabel,
    splitProgressPercent,
    readyMaterialSummaries,
    handlePickMaterialImage,
    handlePickMaterialPdf,
    handleRemoveMaterial,
    handleRetryMaterial,
    handleRetryFailedMaterials,
    handleResumeQueue,
    handleCancelQueue,
  } = useStudyMaterialPipeline(selectedLanguage);

  const phase = getPhaseFromGrade(selectedGrade);
  const subjects = SUBJECTS_BY_PHASE[phase] || [];
  const gradeInfo = GRADES.find((grade) => grade.value === selectedGrade);
  const tierForCaps: Tier = getCapabilityTier(normalizeTierName(tier || 'free'));
  const canUseExamPrep = hasCapability(tierForCaps, 'exam.practice');
  const requiredExamTier = getRequiredTier('exam.practice');
  const { data: aiLimits } = useAIUserLimits();
  const quotaMap = useMemo(() => toQuotaMap((aiLimits as any)?.quotas), [aiLimits]);
  const usedMap = useMemo(
    () => toQuotaMap((aiLimits as any)?.used ?? (aiLimits as any)?.current_usage),
    [aiLimits],
  );
  const examQuotaKeys = useMemo(
    () => ['exam_generation', 'grading_assistance', 'lesson_generation'],
    [],
  );
  const examQuotaLimit = useMemo(
    () => getFirstQuotaValue(quotaMap, examQuotaKeys),
    [quotaMap, examQuotaKeys],
  );
  const examQuotaUsed = useMemo(
    () => getFirstQuotaValue(usedMap, examQuotaKeys),
    [usedMap, examQuotaKeys],
  );
  const examQuotaRemaining = Math.max(0, examQuotaLimit - examQuotaUsed);
  const examQuotaPercent = examQuotaLimit > 0 ? (examQuotaUsed / examQuotaLimit) * 100 : 0;
  const examQuotaWarning = examQuotaLimit > 0 && examQuotaRemaining <= 0
    ? 'Monthly exam quota appears exhausted. Generation may fail until reset or upgrade.'
    : examQuotaLimit > 0 && examQuotaPercent >= 85
      ? `Exam quota is low: ${examQuotaRemaining} left this month.`
      : null;

  const selectedExamTypeLabel = useMemo(() => {
    const examType = selectedExamType === 'practice_test'
      ? 'Practice Test'
      : selectedExamType === 'revision_notes'
        ? 'Revision Notes'
        : selectedExamType === 'study_guide'
          ? 'Study Guide'
          : selectedExamType === 'flashcards'
            ? 'Flashcards'
            : selectedExamType;
    return examType;
  }, [selectedExamType]);
  const quickLaunchLabel = `${gradeInfo?.label || 'Selected Grade'} • ${selectedSubject || 'Afrikaans First Additional Language'}`;

  const filteredSubjects = useMemo(() => {
    const search = subjectSearch.trim().toLowerCase();
    return subjects.filter((subject) => {
      const category = getSubjectCategory(subject);
      const categoryMatches = subjectCategory === 'all' || category === subjectCategory;
      const searchMatches = !search || subject.toLowerCase().includes(search);
      return categoryMatches && searchMatches;
    });
  }, [subjects, subjectSearch, subjectCategory]);

  const loadContextPreview = useCallback(async () => {
    if (!selectedGrade || !selectedSubject || !selectedExamType || !useTeacherContext) {
      setContextPreview(null);
      setContextError(null);
      return;
    }

    const requestSeq = ++contextRequestSeqRef.current;
    setContextLoading(true);
    setContextError(null);

    try {
      if (requestSeq !== contextRequestSeqRef.current) return;
      const contextSummary = await fetchContextPreviewFromApi({
        grade: selectedGrade,
        subject: selectedSubject,
        examType: selectedExamType,
        language: selectedLanguage,
        studentId,
        classId,
        schoolId,
      });
      setContextPreview(contextSummary);
    } catch (error) {
      if (requestSeq !== contextRequestSeqRef.current) return;
      const message = error instanceof Error ? error.message : 'Could not load teacher context';
      setContextError(message);
      setContextPreview(null);
    } finally {
      if (requestSeq !== contextRequestSeqRef.current) return;
      setContextLoading(false);
    }
  }, [
    selectedGrade,
    selectedSubject,
    selectedExamType,
    selectedLanguage,
    studentId,
    classId,
    schoolId,
    useTeacherContext,
  ]);

  useEffect(() => {
    if (step !== 'review') return;
    if (!useTeacherContext) {
      setContextPreview(null);
      setContextError(null);
      setContextLoading(false);
      return;
    }
    loadContextPreview();
  }, [step, useTeacherContext, loadContextPreview]);

  const moveToStep = useCallback((nextStep: WizardStep) => {
    setStep(nextStep);
  }, []);

  const handleSelectGrade = useCallback((grade: string) => {
    setSelectedGrade(grade);
    setSelectedSubject('');
    setSubjectSearch('');
    setSubjectCategory('all');
  }, []);

  const proceedToGeneration = useCallback((withTeacherContext: boolean, allowOverQuota = false) => {
    const customPrompt = buildCustomPromptBlock({
      customPromptText,
      readyMaterialSummaries,
      selectedLanguage,
    });
    const draftId = customPrompt ? stashExamGenerationDraft({ customPrompt }) : undefined;
    const href = buildGenerationHref({
      grade: selectedGrade,
      subject: selectedSubject,
      examType: selectedExamType,
      language: selectedLanguage,
      useTeacherContext: withTeacherContext,
      allowOverQuota,
      draftId,
      childName,
      studentId,
      classId,
      schoolId,
      readyMaterialCount: readyMaterialSummaries.length,
    });
    router.push(href);
  }, [
    selectedGrade,
    selectedSubject,
    selectedExamType,
    selectedLanguage,
    readyMaterialSummaries,
    customPromptText,
    childName,
    studentId,
    classId,
    schoolId,
  ]);

  const handleStartGeneration = useCallback((withTeacherContext: boolean) => {
    if (!selectedGrade || !selectedSubject || !selectedExamType) return;
    if (isMaterialPipelineBusy) {
      showAlert({
        title: 'Please wait',
        message: 'We are still extracting content from your uploaded study material.',
        type: 'info',
      });
      return;
    }
    if (hasBlockingMaterialErrors) {
      showAlert({
        title: 'Study material not ready',
        message: 'One or more uploaded files failed analysis. Retry failed files or remove them before generating.',
        type: 'warning',
      });
      return;
    }
    if (examQuotaLimit > 0 && examQuotaRemaining <= 0) {
      showAlert({
        title: 'Monthly exam quota reached',
        message: 'You have used your monthly exam quota. Upgrade now, or continue anyway (generation may fail).',
        type: 'warning',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => navigateToUpgrade({ source: 'exam_prep', reason: 'limit_reached' }) },
          { text: 'Continue', onPress: () => proceedToGeneration(withTeacherContext, true) },
        ],
      });
      return;
    }
    proceedToGeneration(withTeacherContext, false);
  }, [
    selectedGrade,
    selectedSubject,
    selectedExamType,
    isMaterialPipelineBusy,
    hasBlockingMaterialErrors,
    examQuotaLimit,
    examQuotaRemaining,
    proceedToGeneration,
    showAlert,
  ]);

  const handleQuickStartAfrikaansLive = useCallback(() => {
    const quickGrade = selectedGrade || gradeParam || 'grade_6';
    const href = buildQuickLaunchHref({
      grade: quickGrade,
      subject: selectedSubject || 'Afrikaans First Additional Language',
      language: selectedLanguage || 'af-ZA',
      childName,
      studentId,
      classId,
      schoolId,
    });
    router.push(href);
  }, [selectedGrade, gradeParam, selectedSubject, selectedLanguage, childName, studentId, classId, schoolId]);

  if (!canUseExamPrep) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <Stack.Screen options={{ title: 'Exam Prep' }} />
        <ExamPrepLockedView requiredExamTier={requiredExamTier} theme={theme} />
      </SafeAreaView>
    );
  }

  const currentStep = step === 'grade' ? 1 : step === 'subject' ? 2 : step === 'type' ? 3 : 4;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Exam Prep',
          headerRight: () => (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>CAPS</Text>
            </View>
          ),
        }}
      />
      <ExamPrepWizardHeader currentStep={currentStep} isDark={isDark} theme={theme} />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        <ExamPrepQuickLaunchCard
          quickLaunchLabel={quickLaunchLabel}
          theme={theme}
          onPress={handleQuickStartAfrikaansLive}
        />
        <ExamPrepWizardStepContent
          childName={childName}
          contextError={contextError}
          contextLoading={contextLoading}
          contextPreview={contextPreview}
          customPromptText={customPromptText}
          examQuotaLimit={examQuotaLimit}
          examQuotaUsed={examQuotaUsed}
          examQuotaWarning={examQuotaWarning}
          failedMaterialCount={failedMaterialCount}
          filteredSubjects={filteredSubjects}
          gradeLabel={gradeInfo?.label || selectedGrade}
          handleSelectGrade={handleSelectGrade}
          handleStartGeneration={handleStartGeneration}
          hasBlockingMaterialErrors={hasBlockingMaterialErrors}
          isDark={isDark}
          isMaterialPipelineBusy={isMaterialPipelineBusy}
          materialPipelineLabel={materialPipelineLabel}
          pausedMaterialCount={pausedMaterialCount}
          pdfSplitProgress={pdfSplitProgress}
          readyMaterialSummaries={readyMaterialSummaries}
          selectedExamType={selectedExamType}
          selectedExamTypeLabel={selectedExamTypeLabel}
          selectedGrade={selectedGrade}
          selectedLanguage={selectedLanguage}
          selectedSubject={selectedSubject}
          splitProgressPercent={splitProgressPercent}
          step={step}
          studyMaterials={studyMaterials}
          subjectCategory={subjectCategory}
          subjectSearch={subjectSearch}
          theme={theme}
          useTeacherContext={useTeacherContext}
          onMoveToStep={moveToStep}
          onPickMaterialImage={handlePickMaterialImage}
          onPickMaterialPdf={handlePickMaterialPdf}
          onRemoveMaterial={handleRemoveMaterial}
          onResumeQueue={handleResumeQueue}
          onRetryFailedMaterials={handleRetryFailedMaterials}
          onRetryMaterial={handleRetryMaterial}
          onCancelQueue={handleCancelQueue}
          onSetCustomPromptText={setCustomPromptText}
          onSetSelectedExamType={setSelectedExamType}
          onSetSelectedLanguage={setSelectedLanguage}
          onSetSelectedSubject={setSelectedSubject}
          onSetSubjectCategory={setSubjectCategory}
          onSetSubjectSearch={setSubjectSearch}
          onSetUseTeacherContext={setUseTeacherContext}
        />
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
