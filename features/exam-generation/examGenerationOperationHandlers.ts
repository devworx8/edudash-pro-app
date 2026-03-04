import { assertSupabase } from '@/lib/supabase';
import { parseExamMarkdown, type ParsedExam } from '@/lib/examParser';
import {
  coerceExamArtifactType,
  parseExamGenerationPayload,
} from '@/components/exam-prep/examArtifactHelpers';
import type { ExamGenerationResponse } from '@/components/exam-prep/types';
import { extractInvokeErrorDetails } from '@/components/exam-prep/generationErrorMapping';
import type {
  ExamGenerationControllerSetters,
  UseExamGenerationControllerParams,
} from '@/features/exam-generation/controllerTypes';

type RunGenerateExamParams = {
  customPrompt: string;
  params: UseExamGenerationControllerParams;
  setters: ExamGenerationControllerSetters;
};

type RunLoadSavedExamParams = {
  savedExamId?: string;
  setters: ExamGenerationControllerSetters;
};

function parseExamPayload(payload: unknown): ParsedExam | null {
  if (!payload) return null;
  if (typeof payload === 'string') return parseExamMarkdown(payload);
  try {
    return parseExamMarkdown(JSON.stringify(payload));
  } catch {
    return null;
  }
}

export async function runGenerateExam({
  customPrompt,
  params,
  setters,
}: RunGenerateExamParams): Promise<void> {
  const {
    classId,
    examType,
    fallbackPolicy,
    grade,
    language,
    qualityMode,
    schoolId,
    studentId,
    subject,
    useTeacherContext,
  } = params;

  if (!grade || !subject || !examType) {
    setters.setError('Missing required exam details. Please return to Exam Prep and try again.');
    setters.setState('error');
    return;
  }

  setters.setState('loading');
  setters.setError(null);

  try {
    const supabase = assertSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const { data, error: invokeError } = await supabase.functions.invoke('generate-exam', {
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
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });

    if (invokeError) {
      const details = await extractInvokeErrorDetails(invokeError, data);
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
      setters.setExam({
        ...parsedPayload.exam,
        grade: parsedPayload.exam.grade || grade,
        subject: parsedPayload.exam.subject || subject,
      });
      setters.setArtifact(null);
    } else {
      if (!parsedPayload.artifact) {
        throw new Error('Generated study artifact format was invalid. Please retry.');
      }
      setters.setExam(parsedPayload.exam);
      setters.setArtifact(parsedPayload.artifact);
    }

    setters.setArtifactType(parsedPayload.artifactType);
    setters.setExamId(response.examId || `temp-${Date.now()}`);
    setters.setContextSummary(response.contextSummary || null);
    setters.setScopeDiagnostics(response.scopeDiagnostics || null);
    setters.setTeacherAlignment(response.teacherAlignment || null);
    setters.setBlueprintAudit(response.examBlueprintAudit || null);
    setters.setStudyCoachPack(response.studyCoachPack || null);
    setters.setGenerationMode(response.generationMode || 'ai');
    setters.setQualityReport(response.qualityReport || null);
    setters.setModelUsed(response.modelUsed || null);
    setters.setModelProfile(response.modelProfile || null);
    setters.setPersistenceWarning(response.persistenceWarning || null);
    setters.setShowGenerationStatus(false);
    setters.setState('ready');
  } catch (invokeError) {
    setters.setError(invokeError instanceof Error ? invokeError.message : 'Failed to generate exam');
    setters.setState('error');
  }
}

export async function runLoadSavedExam({
  savedExamId,
  setters,
}: RunLoadSavedExamParams): Promise<void> {
  if (!savedExamId) return;
  setters.setState('loading');
  setters.setError(null);

  try {
    const supabase = assertSupabase();
    const { data, error: fetchError } = await supabase
      .from('exam_generations')
      .select('id, generated_content, display_title, grade, subject, exam_type')
      .eq('id', savedExamId)
      .single();

    if (fetchError || !data) {
      setters.setError('Could not load saved exam. It may have been deleted.');
      setters.setState('error');
      return;
    }

    const parsedPayload = parseExamGenerationPayload(
      data.generated_content,
      parseExamPayload,
      coerceExamArtifactType(data.exam_type, 'practice_test'),
    );

    if (parsedPayload.artifactType === 'practice_test') {
      if (!parsedPayload.exam || parsedPayload.exam.sections.length === 0) {
        setters.setError('Exam content could not be parsed.');
        setters.setState('error');
        return;
      }
      setters.setExam(parsedPayload.exam);
      setters.setArtifact(null);
    } else {
      if (!parsedPayload.artifact) {
        setters.setError('Study artifact content could not be parsed.');
        setters.setState('error');
        return;
      }
      setters.setExam(parsedPayload.exam);
      setters.setArtifact(parsedPayload.artifact);
    }

    setters.setArtifactType(parsedPayload.artifactType);
    setters.setExamId(data.id);
    setters.setModelUsed(null);
    setters.setModelProfile(null);
    setters.setState('ready');
  } catch (fetchError) {
    setters.setError(fetchError instanceof Error ? fetchError.message : 'Failed to load exam');
    setters.setState('error');
  }
}
