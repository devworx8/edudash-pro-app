import type {
  ExamContextSummary,
  ExamGenerationResponse,
  SouthAfricanLanguage,
} from '@/components/exam-prep/types';
import { LANGUAGE_OPTIONS } from '@/components/exam-prep/types';
import { assertSupabase } from '@/lib/supabase';
import { extractInvokeErrorDetails } from '@/components/exam-prep/generationErrorMapping';
import { buildExamGenerationHref, buildExamRouteParams, getSubjectCategory } from '@/components/exam-prep/examPrepWizard.helpers';

export function toQuotaMap(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  const map: Record<string, number> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    map[key] = Math.max(0, numeric);
  }
  return map;
}

export function getFirstQuotaValue(map: Record<string, number>, keys: string[]): number {
  for (const key of keys) {
    const value = map[key];
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

export function buildCustomPrompt(params: {
  customPromptText: string;
  readyMaterialSummaries: string[];
  selectedLanguage: SouthAfricanLanguage;
}): string | undefined {
  const blocks: string[] = [];
  const trimmedPrompt = params.customPromptText.trim();
  const selectedLanguageName = LANGUAGE_OPTIONS[params.selectedLanguage] || params.selectedLanguage;

  if (trimmedPrompt) {
    blocks.push(`Additional learner requirements:\n${trimmedPrompt}`);
  }
  if (params.readyMaterialSummaries.length > 0) {
    blocks.push(
      `Study material extracted from uploaded images/PDFs:\n${params.readyMaterialSummaries.join('\n\n---\n\n')}`,
    );
    if (params.selectedLanguage === 'en-ZA') {
      blocks.push(
        'When generated content includes non-English terminology, include plain English support cues for the learner.',
      );
    } else {
      blocks.push(
        `Keep ALL learner-facing content strictly in ${selectedLanguageName}. Do not include English translations in question text, options, instructions, or memorandum content.`,
      );
    }
  }

  if (blocks.length === 0) return undefined;
  return blocks.join('\n\n');
}

export async function fetchContextPreview(params: {
  classId?: string;
  examType: string;
  grade: string;
  language: SouthAfricanLanguage;
  schoolId?: string;
  studentId?: string;
  subject: string;
}): Promise<ExamContextSummary> {
  const supabase = assertSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const invokeOptions: {
    body: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {
    body: {
      grade: params.grade,
      subject: params.subject,
      examType: params.examType,
      language: params.language,
      allowFallback: false,
      studentId: params.studentId,
      classId: params.classId,
      schoolId: params.schoolId,
      useTeacherContext: true,
      previewContext: true,
    },
  };

  if (token) {
    invokeOptions.headers = { Authorization: `Bearer ${token}` };
  }

  const { data, error } = await supabase.functions.invoke('generate-exam', invokeOptions);
  if (error) {
    const info = await extractInvokeErrorDetails(error, data);
    throw new Error(info.message || 'Could not load teacher context');
  }

  const response = data as ExamGenerationResponse;
  if (!response?.success) {
    throw new Error(response?.error || 'Could not load teacher context');
  }

  return (
    response.contextSummary || {
      assignmentCount: 0,
      lessonCount: 0,
      focusTopics: [],
      weakTopics: [],
    }
  );
}

type BuildGenerationHrefParams = {
  childName?: string;
  classId?: string;
  customPrompt?: string;
  draftId?: string;
  examType: string;
  grade: string;
  language: SouthAfricanLanguage;
  readyMaterialCount: number;
  schoolId?: string;
  studentId?: string;
  subject: string;
  useTeacherContext: boolean;
};

export function buildGenerationHref(params: BuildGenerationHrefParams): string {
  const generationParams = buildExamRouteParams({
    grade: params.grade,
    subject: params.subject,
    examType: params.examType,
    language: params.language,
    fallbackPolicy: 'provider_outage_only',
    qualityMode:
      getSubjectCategory(params.subject) === 'languages' && params.readyMaterialCount === 0
        ? 'strict'
        : 'standard',
    useTeacherContext: params.useTeacherContext,
    draftId: params.draftId,
    contextIds: {
      childName: params.childName,
      studentId: params.studentId,
      classId: params.classId,
      schoolId: params.schoolId,
    },
  });

  return buildExamGenerationHref(generationParams);
}

export function buildQuickLaunchHref(params: {
  childName?: string;
  classId?: string;
  grade: string;
  language: SouthAfricanLanguage;
  schoolId?: string;
  studentId?: string;
  subject: string;
}): string {
  const quickParams = buildExamRouteParams({
    grade: params.grade,
    subject: params.subject,
    examType: 'practice_test',
    language: params.language,
    fallbackPolicy: 'provider_outage_only',
    qualityMode: 'standard',
    useTeacherContext: true,
    contextIds: {
      childName: params.childName,
      studentId: params.studentId,
      classId: params.classId,
      schoolId: params.schoolId,
    },
  });

  return buildExamGenerationHref(quickParams);
}
