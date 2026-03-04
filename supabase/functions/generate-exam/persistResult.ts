import { createClient } from 'npm:@supabase/supabase-js@2';
import { toUserFacingGenerationWarning } from './examUtils.ts';
import {
  persistUploadedStudyMaterials,
  type UploadedStudyMaterial,
} from './studyMaterialMemory.ts';
import { buildExamModelProfile, isHighEndStarterModel } from './modelProfile.ts';

type ScopeDiagnostics = {
  effectiveSchoolId: string | null;
  effectiveStudentId: string | null;
};

type PersistParams = {
  artifact: unknown;
  artifactType: string;
  contextSummary: { assignmentCount: number; lessonCount: number };
  devBypass: boolean;
  examBlueprintAudit: unknown;
  examType: string;
  forceFreemiumFallback: boolean;
  grade: string;
  hasStudyMaterialContext: boolean;
  initialIntegrityIssues: string[];
  isParentStarterTier: boolean;
  language: string;
  localFallbackReason: string | null;
  lookbackDays: number;
  modelUsed: string;
  normalizedExam: any;
  parentStarterPremiumUsed: number;
  parentStarterPremiumWindow: number;
  profileId: string;
  qualityRepaired: boolean;
  reusedStudyMaterialCount: number;
  scopeDiagnostics: ScopeDiagnostics;
  schoolId: string | null;
  studentId: string | null;
  studyCoachPack: unknown;
  subject: string;
  supabase: ReturnType<typeof createClient>;
  teacherAlignment: unknown;
  uploadedStudyMaterials: UploadedStudyMaterial[];
  useTeacherContext: boolean;
  userId: string;
};

type PersistResult = {
  examId: string;
  generationMode: 'ai' | 'outage_fallback';
  modelProfile: Record<string, unknown>;
  persistenceWarning?: string;
  qualityReport: {
    passed: boolean;
    issues: string[];
    repaired: boolean;
  };
};

export async function persistExamResult(params: PersistParams): Promise<PersistResult> {
  const generationSource = params.localFallbackReason
    ? 'local_fallback'
    : params.uploadedStudyMaterials.length > 0
    ? 'uploaded_study_material'
    : params.reusedStudyMaterialCount > 0
    ? 'stored_study_material_memory'
    : params.useTeacherContext
    ? 'teacher_artifact_context'
    : 'caps_baseline';

  const metadata = {
    source: generationSource,
    artifactType: params.artifactType,
    contextSummary: params.contextSummary,
    scopeDiagnostics: params.scopeDiagnostics,
    teacherAlignment: params.teacherAlignment,
    examBlueprintAudit: params.examBlueprintAudit,
    studyCoachPack: params.studyCoachPack,
    caps: {
      aligned: true,
      framework: 'CAPS/DBE',
      lookbackDays: params.lookbackDays,
      language: params.language,
    },
    studyMaterialContext: {
      hasStudyMaterialContext: params.hasStudyMaterialContext,
      uploadedCount: params.uploadedStudyMaterials.length,
      reusedCount: params.reusedStudyMaterialCount,
    },
    generationWarning: params.localFallbackReason
      ? toUserFacingGenerationWarning(params.localFallbackReason)
      : undefined,
  };

  let persistedExamId = `temp-${Date.now()}`;
  const warningParts: string[] = [];

  if (params.localFallbackReason) {
    warningParts.push(toUserFacingGenerationWarning(params.localFallbackReason));
  }
  if (params.useTeacherContext && !params.scopeDiagnostics.effectiveSchoolId) {
    warningParts.push('Teacher context ran without a resolved school scope. Results may be generic.');
  }
  if (params.useTeacherContext && params.contextSummary.assignmentCount + params.contextSummary.lessonCount === 0) {
    warningParts.push('No recent teacher artifacts were found. Generated content leans on CAPS baseline.');
  }
  if (params.uploadedStudyMaterials.length === 0 && params.reusedStudyMaterialCount > 0) {
    warningParts.push('No new upload was provided, so Dash used previously saved study material for this learner.');
  }

  const persistedGeneratedContent =
    params.artifactType === 'practice_test'
      ? params.normalizedExam
      : {
          artifactType: params.artifactType,
          artifact: params.artifact,
          exam: params.normalizedExam,
        };

  const { data: savedExam, error: saveError } = await params.supabase
    .from('exam_generations')
    .insert({
      user_id: params.profileId,
      grade: params.grade,
      subject: params.subject,
      exam_type: params.examType,
      display_title: params.normalizedExam.title,
      generated_content: JSON.stringify(persistedGeneratedContent),
      status: 'completed',
      model_used: params.modelUsed,
      metadata,
    })
    .select('id')
    .single();

  if (saveError) {
    console.warn('[generate-exam] Could not persist exam_generations row', saveError.message);
    warningParts.push('Exam generated, but cloud save failed. You can still continue with this attempt.');
  } else if (savedExam?.id) {
    persistedExamId = String(savedExam.id);
  }

  try {
    await persistUploadedStudyMaterials(params.supabase, {
      authUserId: params.userId,
      studentId: params.studentId,
      schoolId: params.schoolId,
      grade: params.grade,
      subject: params.subject,
      language: params.language,
      examId: persistedExamId,
      materials: params.uploadedStudyMaterials,
    });
  } catch (materialPersistError) {
    console.warn(
      '[generate-exam] study material persistence non-fatal error',
      materialPersistError instanceof Error ? materialPersistError.message : String(materialPersistError),
    );
  }

  if (!params.devBypass && !params.forceFreemiumFallback) {
    try {
      await params.supabase.rpc('increment_ai_usage', {
        p_user_id: params.userId,
        p_request_type: 'exam_generation',
        p_status: 'success',
        p_metadata: { scope: 'generate_exam', model_used: params.modelUsed, exam_id: persistedExamId },
      });
    } catch (usageErr) {
      console.warn('[generate-exam] increment_ai_usage failed (non-fatal):', usageErr);
    }
  }

  const generationMode = params.modelUsed.startsWith('fallback:') ? 'outage_fallback' : 'ai';
  const usedPremiumModelThisRun = params.isParentStarterTier && isHighEndStarterModel(params.modelUsed);
  const parentStarterPremiumUsedAfter =
    params.parentStarterPremiumUsed + (usedPremiumModelThisRun ? 1 : 0);
  const modelProfile = buildExamModelProfile({
    modelUsed: params.modelUsed,
    isParentStarterTier: params.isParentStarterTier,
    premiumUsed: parentStarterPremiumUsedAfter,
    premiumWindow: params.parentStarterPremiumWindow,
  });

  return {
    examId: persistedExamId,
    generationMode,
    modelProfile,
    persistenceWarning: warningParts.length > 0 ? warningParts.join(' ') : undefined,
    qualityReport: {
      passed:
        params.initialIntegrityIssues.length === 0 ||
        params.qualityRepaired ||
        params.modelUsed.startsWith('fallback:'),
      issues: params.initialIntegrityIssues,
      repaired: params.qualityRepaired,
    },
  };
}
