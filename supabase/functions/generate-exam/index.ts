/**
 * Generate Exam Edge Function (Exam Prep V2)
 *
 * - Structured exam generation via Anthropic
 * - Optional teacher-artifact context resolution (homework + lessons)
 * - Access checks by role scope (parent/student/staff)
 * - Canonical persistence to exam_generations
 */
import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import {
  isLanguageSubject,
  normalizeLanguageLocale,
  resolveArtifactType,
} from './examUtils.ts';
import { buildUserPrompt } from './promptBuilder.ts';
import { resolveTeacherContext } from './teacherContext.ts';
import {
  canFallbackForReason,
  mapUnhandledError,
  normalizeFallbackPolicy,
  normalizeQualityMode,
  toBooleanFlag,
} from './fallbackPolicy.ts';
import {
  buildModelFallbackChain,
  getDefaultModelForTier,
  isFreemiumTier,
  isParentStarterTierForExam,
  normalizeAnthropicModel,
  normalizeTierForExamRole,
  DEFAULT_ANTHROPIC_EXAM_MODEL,
  STARTER_HAIKU_MODEL,
} from './modelPolicy.ts';
import { resolveAuthorizedScope } from './scopeResolver.ts';
import {
  formatStudyMaterialPromptBlock,
  loadStoredStudyMaterials,
  parseUploadedStudyMaterials,
} from './studyMaterialMemory.ts';
import { EXAM_SYSTEM_PROMPT } from './examPrompts.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY =
  Deno.env.get('OPENAI_API_KEY') ||
  Deno.env.get('SERVER_OPENAI_API_KEY') ||
  Deno.env.get('OPENAI_API_KEY_2') ||
  '';
const OPENAI_EXAM_MODEL = Deno.env.get('OPENAI_EXAM_MODEL') || 'gpt-4o-mini';
const EXAM_PRIMARY_MODEL = normalizeAnthropicModel(
  Deno.env.get('ANTHROPIC_EXAM_MODEL') ||
    Deno.env.get('EXPO_PUBLIC_ANTHROPIC_MODEL') ||
    DEFAULT_ANTHROPIC_EXAM_MODEL,
);
const ANTHROPIC_EXAM_MODEL_FALLBACKS = String(Deno.env.get('ANTHROPIC_EXAM_MODEL_FALLBACKS') || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const FREEMIUM_PREMIUM_EXAM_LIMIT = 5;
const PARENT_STARTER_PREMIUM_WINDOW = 5;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

type JsonRecord = Record<string, unknown>;

type ScopeDiagnostics = {
  requestedStudentId: string | null;
  requestedClassId: string | null;
  requestedSchoolId: string | null;
  effectiveStudentId: string | null;
  effectiveClassId: string | null;
  effectiveSchoolId: string | null;
  useTeacherContext: boolean;
};

function jsonResponse(body: JsonRecord, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: 'Invalid session' }, 401, corsHeaders);
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch (parseErr) {
      console.error('[generate-exam] Request body parse error:', parseErr);
      return jsonResponse(
        { error: 'Invalid request body', message: parseErr instanceof Error ? parseErr.message : 'Expected JSON' },
        400,
        corsHeaders,
      );
    }
    const grade = String(body?.grade || '').trim();
    const subject = String(body?.subject || '').trim();
    const examType = String(body?.examType || 'practice_test').trim();
    const requestCustomPrompt = body?.customPrompt ? String(body.customPrompt) : undefined;
    const rawModelOverride = body?.model ? String(body.model).trim() : undefined;
    const modelOverride = rawModelOverride ? normalizeAnthropicModel(rawModelOverride) : undefined;
    const language = normalizeLanguageLocale(body?.language ? String(body.language) : 'en-ZA');
    const studentId = body?.studentId ? String(body.studentId).trim() : undefined;
    const classId = body?.classId ? String(body.classId).trim() : undefined;
    const schoolId = body?.schoolId ? String(body.schoolId).trim() : undefined;
    const useTeacherContext = body?.useTeacherContext !== false;
    const previewContext = body?.previewContext === true;
    const lookbackDays = Number.isFinite(Number(body?.lookbackDays))
      ? Math.max(7, Math.min(180, Number(body.lookbackDays)))
      : 45;
    const examIntentMode =
      body?.examIntentMode === 'caps_only' ? 'caps_only' : 'teacher_weighted';
    const fullPaperMode = body?.fullPaperMode !== false;
    const visualMode = body?.visualMode === 'hybrid' ? 'hybrid' : 'off';
    const guidedMode = body?.guidedMode === 'memo_first' ? 'memo_first' : 'guided_first';
    const requestedAllowFallback = toBooleanFlag(body?.allowFallback, true);
    const fallbackPolicy = normalizeFallbackPolicy(body?.fallbackPolicy);
    const qualityMode = normalizeQualityMode(body?.qualityMode);
    const allowFallback = fallbackPolicy === 'never' ? false : requestedAllowFallback;

    if (rawModelOverride && modelOverride && rawModelOverride !== modelOverride) {
      console.warn('[generate-exam] remapped deprecated model override', {
        from: rawModelOverride,
        to: modelOverride,
      });
    }

    if (!grade || !subject) {
      return jsonResponse({ error: 'Missing required fields: grade, subject' }, 400, corsHeaders);
    }

    const scope = await resolveAuthorizedScope(supabase, user.id, {
      studentId,
      classId,
      schoolId,
      useTeacherContext,
    });

    const scopeDiagnostics: ScopeDiagnostics = {
      requestedStudentId: studentId || null,
      requestedClassId: classId || null,
      requestedSchoolId: schoolId || null,
      effectiveStudentId: scope.effectiveStudentId || null,
      effectiveClassId: scope.effectiveClassId || null,
      effectiveSchoolId: scope.effectiveSchoolId || null,
      useTeacherContext,
    };

    const contextSummary = await resolveTeacherContext(supabase, scope, {
      subject,
      useTeacherContext,
      lookbackDays,
      examIntentMode,
    });

    if (previewContext) {
      return jsonResponse(
        {
          success: true,
          examId: 'preview-only',
          artifactType: resolveArtifactType(examType),
          contextSummary,
          scopeDiagnostics,
        },
        200,
        corsHeaders,
      );
    }

    const uploadedStudyMaterials = parseUploadedStudyMaterials(requestCustomPrompt);
    const storedStudyMaterials = uploadedStudyMaterials.length > 0
      ? []
      : await loadStoredStudyMaterials(supabase, {
          authUserId: user.id,
          studentScope: scope.effectiveStudentId || '',
          subject,
          grade,
        });
    const storedMaterialPrompt = formatStudyMaterialPromptBlock(storedStudyMaterials);
    const customPrompt = [String(requestCustomPrompt || '').trim(), String(storedMaterialPrompt || '').trim()]
      .filter((value) => value.length > 0)
      .join('\n\n') || undefined;
    const hasStudyMaterialContext = uploadedStudyMaterials.length > 0 || storedStudyMaterials.length > 0;
    const effectiveQualityMode =
      qualityMode === 'strict' && isLanguageSubject(subject) && hasStudyMaterialContext
        ? 'standard'
        : qualityMode;

    const { data: tierData } = await supabase.rpc('get_user_subscription_tier', {
      user_id: scope.profile.id,
    });

    const effectiveTierForRole = normalizeTierForExamRole(
      scope.role,
      scope.profile.subscription_tier,
      typeof tierData === 'string' ? tierData : null,
    );
    const isFreemium = isFreemiumTier(effectiveTierForRole);
    const isParentStarterTier = isParentStarterTierForExam(scope.role, effectiveTierForRole);
    let parentStarterPremiumUsed = 0;
    let parentStarterModelPhase: 'premium' | 'standard' | null = null;

    // Quota check — prevent unbounded exam generation
    const environment = Deno.env.get('ENVIRONMENT') || 'production';
    const devBypass = Deno.env.get('AI_QUOTA_BYPASS') === 'true' &&
                      (environment === 'development' || environment === 'local');
    let forceFreemiumFallback = false;
    let freemiumPremiumExamCount = 0;

    if (!devBypass && isParentStarterTier) {
      const premiumCountRes = await supabase
        .from('exam_generations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', scope.profile.id)
        .eq('status', 'completed')
        .not('model_used', 'like', 'fallback:%')
        .not('model_used', 'ilike', '%haiku%');

      if (premiumCountRes.error) {
        console.warn('[generate-exam] parent_starter premium-count check failed', premiumCountRes.error.message);
      } else {
        parentStarterPremiumUsed = Number(premiumCountRes.count || 0);
      }

      parentStarterModelPhase =
        parentStarterPremiumUsed < PARENT_STARTER_PREMIUM_WINDOW ? 'premium' : 'standard';
    }

    if (isFreemium && !isParentStarterTier) {
      const premiumCountRes = await supabase
        .from('exam_generations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', scope.profile.id)
        .eq('status', 'completed')
        .not('model_used', 'like', 'fallback:%');

      if (premiumCountRes.error) {
        console.warn('[generate-exam] freemium premium-count check failed', premiumCountRes.error.message);
      } else {
        freemiumPremiumExamCount = Number(premiumCountRes.count || 0);
        if (freemiumPremiumExamCount >= FREEMIUM_PREMIUM_EXAM_LIMIT) {
          forceFreemiumFallback = true;
        }
      }
    }

    if (!devBypass && !forceFreemiumFallback) {
      const quota = await supabase.rpc('check_ai_usage_limit', {
        p_user_id: user.id,
        p_request_type: 'exam_generation',
      });

      if (quota.error) {
        console.error('[generate-exam] check_ai_usage_limit failed:', quota.error);
        return jsonResponse(
          {
            error: 'quota_check_failed',
            message: 'Unable to verify AI usage quota. Please try again in a few minutes.',
          },
          503,
          corsHeaders,
        );
      }

      const quotaData = quota.data as Record<string, unknown> | null;
      if (quotaData && typeof quotaData.allowed === 'boolean' && !quotaData.allowed) {
        if (isFreemium && !isParentStarterTier) {
          forceFreemiumFallback = true;
        } else {
          return jsonResponse(
            {
              error: 'quota_exceeded',
              message: "You've reached your AI usage limit for this period. Upgrade for more.",
              details: quotaData,
            },
            429,
            corsHeaders,
          );
        }
      }
    }

    const tierDefaultModel = isParentStarterTier
      ? parentStarterModelPhase === 'premium'
        ? DEFAULT_ANTHROPIC_EXAM_MODEL
        : STARTER_HAIKU_MODEL
      : getDefaultModelForTier(effectiveTierForRole);
    const preferredModel = normalizeAnthropicModel(modelOverride || tierDefaultModel || EXAM_PRIMARY_MODEL);
    const modelCandidates = isParentStarterTier && parentStarterModelPhase === 'standard'
      ? [...new Set([
          normalizeAnthropicModel(preferredModel),
          STARTER_HAIKU_MODEL,
          'claude-3-haiku-20240307',
        ])]
      : buildModelFallbackChain(preferredModel, ANTHROPIC_EXAM_MODEL_FALLBACKS);
    const userPrompt = buildUserPrompt({
      grade,
      subject,
      examType,
      language,
      customPrompt,
      contextSummary,
      useTeacherContext,
      fullPaperMode,
      guidedMode,
    });

    console.log('[generate-exam] generating', {
      grade,
      subject,
      examType,
      userId: user.id,
      profileId: scope.profile.id,
      preferredModel,
      useTeacherContext,
      effectiveTierForRole,
      isParentStarterTier,
      parentStarterModelPhase,
      parentStarterPremiumUsed,
      forceFreemiumFallback,
      freemiumPremiumExamCount,
      examIntentMode,
      fullPaperMode,
      visualMode,
      guidedMode,
      allowFallback,
      requestedAllowFallback,
      fallbackPolicy,
      qualityMode,
      effectiveQualityMode,
      assignmentCount: contextSummary.assignmentCount,
      lessonCount: contextSummary.lessonCount,
    });

    const generationResult = await runGenerationEngine({
      allowFallback,
      anthropicApiKey: ANTHROPIC_API_KEY,
      customPrompt,
      contextSummary,
      effectiveQualityMode,
      examSystemPrompt: EXAM_SYSTEM_PROMPT,
      examPrimaryModel: EXAM_PRIMARY_MODEL,
      examType,
      fallbackPolicy,
      forceFreemiumFallback,
      freemiumPremiumExamCount,
      freemiumPremiumExamLimit: FREEMIUM_PREMIUM_EXAM_LIMIT,
      fullPaperMode,
      grade,
      language,
      modelCandidates,
      openAiApiKey: OPENAI_API_KEY,
      openAiExamModel: OPENAI_EXAM_MODEL,
      preferredModel,
      subject,
      userPrompt,
      visualMode,
    });

    if (!generationResult.ok) {
      return jsonResponse(generationResult.body, generationResult.status, corsHeaders);
    }

    const {
      artifact,
      artifactType,
      examBlueprintAudit,
      initialIntegrityIssues,
      localFallbackReason,
      modelUsed,
      normalizedExam,
      qualityRepaired,
      studyCoachPack,
      teacherAlignment,
    } = generationResult;

    const persisted = await persistExamResult({
      artifact,
      artifactType,
      contextSummary,
      devBypass,
      examBlueprintAudit,
      examType,
      forceFreemiumFallback,
      grade,
      hasStudyMaterialContext,
      initialIntegrityIssues,
      isParentStarterTier,
      language,
      localFallbackReason,
      lookbackDays,
      modelUsed,
      normalizedExam,
      parentStarterPremiumUsed,
      parentStarterPremiumWindow: PARENT_STARTER_PREMIUM_WINDOW,
      profileId: scope.profile.id,
      qualityRepaired,
      reusedStudyMaterialCount: storedStudyMaterials.length,
      scopeDiagnostics: {
        effectiveSchoolId: scopeDiagnostics.effectiveSchoolId,
        effectiveStudentId: scopeDiagnostics.effectiveStudentId,
      },
      schoolId: scope.effectiveSchoolId || null,
      studentId: scope.effectiveStudentId || null,
      studyCoachPack,
      subject,
      supabase,
      teacherAlignment,
      uploadedStudyMaterials,
      useTeacherContext,
      userId: user.id,
    });

    return jsonResponse(
      {
        success: true,
        exam: artifactType === 'practice_test' ? normalizedExam : undefined,
        artifactType,
        artifact,
        modelUsed: generationResult.modelUsed,
        modelProfile: persisted.modelProfile,
        generationMode: persisted.generationMode,
        qualityReport: persisted.qualityReport,
        retryable: false,
        examId: persisted.examId,
        scopeDiagnostics,
        contextSummary,
        teacherAlignment,
        examBlueprintAudit,
        studyCoachPack,
        persistenceWarning: persisted.persistenceWarning,
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[generate-exam] Error:', message, err instanceof Error ? err.stack : '');
    const mapped = mapUnhandledError(message);
    return jsonResponse(
      { success: false, error: mapped.error, message: mapped.message, retryable: mapped.retryable },
      mapped.status,
      corsHeaders,
    );
  }
});
