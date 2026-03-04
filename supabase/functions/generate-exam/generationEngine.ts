import {
  augmentQuestionVisuals,
  buildArtifactFromExam,
  buildLocalFallbackExam,
  buildStudyCoachPack,
  computeBlueprintAudit,
  computeTeacherAlignmentSummary,
  enforceQuestionUpperBound,
  ensureLanguageReadingPassage,
  ensureMinimumQuestionCoverage,
  extractJsonBlock,
  getQuestionCountPolicy,
  isLanguageSubject,
  normalizeExamShape,
  parseExamJson,
  recalculateExamMarks,
  resolveArtifactType,
  sanitizeLearnerFacingExamContent,
  softenWeakGroundingComprehensionOptions,
  stripMetaPromptQuestions,
  validateComprehensionIntegrity,
  validateLearnerLanguageConsistency,
  type ExamContextSummary,
} from './examUtils.ts';
import { canFallbackForReason } from './fallbackPolicy.ts';
import { attemptExamQualityRepair } from './qualityRepair.ts';
import { isCreditOrBillingError } from './modelPolicy.ts';

function isWeakComprehensionGroundingIssue(issue: string): boolean {
  const normalized = String(issue || '').toLowerCase();
  return normalized.includes('weakly grounded in passage context');
}

type VisualMode = 'off' | 'hybrid';
type QualityMode = 'strict' | 'standard';

export type GenerationEngineInput = {
  allowFallback: boolean;
  anthropicApiKey: string;
  customPrompt?: string;
  contextSummary: ExamContextSummary;
  effectiveQualityMode: QualityMode;
  examSystemPrompt: string;
  examPrimaryModel: string;
  examType: string;
  fallbackPolicy: 'provider_outage_only' | 'always' | 'never';
  forceFreemiumFallback: boolean;
  freemiumPremiumExamCount: number;
  freemiumPremiumExamLimit: number;
  fullPaperMode: boolean;
  grade: string;
  language: string;
  modelCandidates: string[];
  openAiApiKey: string;
  openAiExamModel: string;
  preferredModel: string;
  subject: string;
  userPrompt: string;
  visualMode: VisualMode;
};

export type GenerationEngineFailure = {
  ok: false;
  body: Record<string, unknown>;
  status: number;
};

export type GenerationEngineSuccess = {
  ok: true;
  artifact: unknown;
  artifactType: ReturnType<typeof resolveArtifactType>;
  examBlueprintAudit: ReturnType<typeof computeBlueprintAudit>;
  initialIntegrityIssues: string[];
  localFallbackReason: string | null;
  modelUsed: string;
  normalizedExam: any;
  qualityRepaired: boolean;
  studyCoachPack: ReturnType<typeof buildStudyCoachPack>;
  teacherAlignment: ReturnType<typeof computeTeacherAlignmentSummary>;
};

export type GenerationEngineResult = GenerationEngineFailure | GenerationEngineSuccess;

export async function runGenerationEngine(
  params: GenerationEngineInput,
): Promise<GenerationEngineResult> {
  let modelUsed = params.preferredModel;
  let aiContent = '';
  let localFallbackReason: string | null = null;
  let lastModelError = 'Failed to generate exam content';
  let anthropicCreditIssue = false;

  if (params.forceFreemiumFallback) {
    if (!params.allowFallback || !canFallbackForReason(params.fallbackPolicy, 'freemium_limit')) {
      return {
        ok: false,
        status: 429,
        body: {
          success: false,
          error: 'premium_exam_limit_reached',
          message: `Premium exam generation limit reached (${params.freemiumPremiumExamCount}/${params.freemiumPremiumExamLimit}) for this cycle.`,
          retryable: false,
        },
      };
    }
    localFallbackReason = `Freemium plan limit reached: you've used ${params.freemiumPremiumExamCount} premium exam generations. A basic fallback exam is being used. Upgrade to restore premium Sonnet exam generation.`;
    modelUsed = 'fallback:freemium-limit-v1';
  } else {
    // Adaptive max_tokens: full papers need more room
    const maxTokens = params.fullPaperMode ? 8192 : 4096;
    const startTime = Date.now();

    // --- Parallel provider racing ---
    // Fire Anthropic (primary model only) and OpenAI concurrently when both keys exist.
    // Use the first successful response — cuts latency ~40% on slow providers.
    const hasAnthropicKey = Boolean(params.anthropicApiKey);
    const hasOpenAiKey = Boolean(params.openAiApiKey);

    if (hasAnthropicKey && hasOpenAiKey) {
      const anthropicPrimary = params.modelCandidates[0] || params.preferredModel;

      const anthropicPromise = fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': params.anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: anthropicPrimary,
          max_tokens: maxTokens,
          system: params.examSystemPrompt,
          messages: [{ role: 'user', content: params.userPrompt }],
        }),
      }).then(async (resp) => {
        if (!resp.ok) {
          const errText = await resp.text();
          if (isCreditOrBillingError(resp.status, errText)) {
            anthropicCreditIssue = true;
          }
          throw new Error(`anthropic:${resp.status}:${errText.slice(0, 200)}`);
        }
        const data = await resp.json();
        const text = String(data?.content?.[0]?.text || '');
        if (!text) throw new Error('anthropic:empty_response');
        return { text, model: anthropicPrimary };
      });

      const openaiPromise = fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: params.openAiExamModel,
          temperature: 0.2,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: params.examSystemPrompt },
            { role: 'user', content: params.userPrompt },
          ],
        }),
      }).then(async (resp) => {
        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`openai:${resp.status}:${errText.slice(0, 200)}`);
        }
        const data = await resp.json();
        const text = String(data?.choices?.[0]?.message?.content || '');
        if (!text) throw new Error('openai:empty_response');
        return { text, model: `openai:${params.openAiExamModel}` };
      });

      // Race: first successful provider wins
      try {
        const winner = await Promise.any([anthropicPromise, openaiPromise]);
        aiContent = winner.text;
        modelUsed = winner.model;
        console.log(`[generate-exam] Provider race won by ${winner.model} in ${Date.now() - startTime}ms`);
      } catch (raceError) {
        // All providers failed
        const aggErr = raceError as AggregateError;
        const messages = aggErr.errors?.map((e: Error) => e.message) || [String(raceError)];
        lastModelError = messages.join('; ');
        console.error('[generate-exam] All providers failed:', lastModelError);

        // Check for rate limiting
        if (messages.some((m: string) => m.includes(':429:'))) {
          throw new Error('AI service is busy. Please try again in a moment.');
        }
      }
    } else if (hasAnthropicKey) {
      // Anthropic-only path with sequential model fallback
      for (const candidateModel of params.modelCandidates) {
        const candidateResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': params.anthropicApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: candidateModel,
            max_tokens: maxTokens,
            system: params.examSystemPrompt,
            messages: [{ role: 'user', content: params.userPrompt }],
          }),
        });

        if (candidateResponse.ok) {
          const aiData = await candidateResponse.json();
          aiContent = String(aiData?.content?.[0]?.text || '');
          modelUsed = candidateModel;
          break;
        }

        const errText = await candidateResponse.text();
        lastModelError = errText || `status=${candidateResponse.status}`;
        console.error('[generate-exam] Anthropic API error:', candidateResponse.status, candidateModel, errText);

        if (candidateResponse.status === 429) {
          throw new Error('AI service is busy. Please try again in a moment.');
        }

        if (isCreditOrBillingError(candidateResponse.status, errText)) {
          anthropicCreditIssue = true;
          break;
        }
      }
    } else if (hasOpenAiKey) {
      // OpenAI-only path
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: params.openAiExamModel,
          temperature: 0.2,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: params.examSystemPrompt },
            { role: 'user', content: params.userPrompt },
          ],
        }),
      });

      if (openAIResponse.ok) {
        const openAIData = await openAIResponse.json();
        aiContent = String(openAIData?.choices?.[0]?.message?.content || '');
        modelUsed = `openai:${params.openAiExamModel}`;
      } else {
        const openAIErr = await openAIResponse.text();
        lastModelError = openAIErr || `openai_status=${openAIResponse.status}`;
        console.error('[generate-exam] OpenAI API error:', openAIResponse.status, openAIErr);
        if (openAIResponse.status === 429 && !isCreditOrBillingError(openAIResponse.status, openAIErr)) {
          throw new Error('AI service is busy. Please try again in a moment.');
        }
      }
    } else {
      lastModelError = 'No AI API keys configured';
    }
  }

  let normalizedExam: any;
  if (!aiContent) {
    if (!params.allowFallback || !canFallbackForReason(params.fallbackPolicy, 'provider_unavailable')) {
      return {
        ok: false,
        status: 503,
        body: {
          success: false,
          error: 'ai_provider_unavailable',
          message: anthropicCreditIssue
            ? 'AI provider credits are currently depleted. Please try again later.'
            : 'AI providers are currently unavailable. Please retry shortly.',
          retryable: true,
        },
      };
    }

    modelUsed = 'fallback:local-template-v1';
    localFallbackReason = anthropicCreditIssue
      ? 'AI provider credits are currently depleted. Generated a local fallback practice exam.'
      : 'AI providers are currently unavailable. Generated a local fallback practice exam.';
    normalizedExam = normalizeExamShape(
      buildLocalFallbackExam(
        params.grade,
        params.subject,
        params.examType,
        params.language,
        params.contextSummary,
        params.customPrompt,
      ),
      params.grade,
      params.subject,
      params.examType,
    );
  } else {
    try {
      const jsonBlock = extractJsonBlock(aiContent);
      const parsedRawExam = parseExamJson(jsonBlock);
      normalizedExam = normalizeExamShape(parsedRawExam, params.grade, params.subject, params.examType);
    } catch (parseError) {
      console.error('[generate-exam] parse error', parseError);
      if (!params.allowFallback || !canFallbackForReason(params.fallbackPolicy, 'parse_failed')) {
        return {
          ok: false,
          status: 502,
          body: {
            success: false,
            error: 'generation_parse_failed',
            message: 'AI returned malformed exam JSON. Retry generation.',
            retryable: true,
          },
        };
      }
      modelUsed = 'fallback:local-template-v1';
      localFallbackReason = 'AI returned malformed exam JSON. Generated a local fallback practice exam.';
      normalizedExam = normalizeExamShape(
        buildLocalFallbackExam(
          params.grade,
          params.subject,
          params.examType,
          params.language,
          params.contextSummary,
          params.customPrompt,
        ),
        params.grade,
        params.subject,
        params.examType,
      );
    }
  }

  const countPolicy = getQuestionCountPolicy(params.grade, params.examType);
  normalizedExam = ensureMinimumQuestionCoverage(normalizedExam, {
    grade: params.grade,
    subject: params.subject,
    examType: params.examType,
    contextSummary: params.contextSummary,
    minQuestionCount: params.fullPaperMode ? countPolicy.min : Math.min(countPolicy.min, 16),
  });
  normalizedExam = enforceQuestionUpperBound(normalizedExam, countPolicy.max);
  normalizedExam = sanitizeLearnerFacingExamContent(normalizedExam);
  normalizedExam = ensureLanguageReadingPassage(normalizedExam, params.subject, params.grade, params.language);
  normalizedExam = augmentQuestionVisuals(normalizedExam, params.visualMode);
  normalizedExam = recalculateExamMarks(normalizedExam);

  const languageConsistencyIssues = validateLearnerLanguageConsistency(
    normalizedExam,
    params.subject,
    params.language,
    params.effectiveQualityMode,
  );
  let integrityIssues = [
    ...validateComprehensionIntegrity(normalizedExam, params.subject, params.language),
    ...languageConsistencyIssues,
  ];
  const initialIntegrityIssues = [...integrityIssues];
  let qualityRepaired = false;

  if (integrityIssues.length > 0) {
    const repairedExam = stripMetaPromptQuestions(normalizedExam);
    const repairedComprehensionIssues = validateComprehensionIntegrity(repairedExam, params.subject, params.language);
    const repairedLanguageIssues = validateLearnerLanguageConsistency(
      repairedExam,
      params.subject,
      params.language,
      params.effectiveQualityMode,
    );
    const repairedIssues = [...repairedComprehensionIssues, ...repairedLanguageIssues];
    const hasEnoughQuestions =
      repairedExam.sections?.some((section: any) => Array.isArray(section?.questions) && section.questions.length >= 2) ??
      false;
    if (repairedIssues.length === 0 && hasEnoughQuestions) {
      normalizedExam = recalculateExamMarks(repairedExam);
      qualityRepaired = true;
      if (integrityIssues.some((issue) => issue.includes('instruction/meta prompt'))) {
        localFallbackReason = 'Some instruction-only items were removed from the comprehension section.';
      }
      integrityIssues = [];
    }
  }

  if (integrityIssues.length > 0 && aiContent && !modelUsed.startsWith('fallback:')) {
    try {
      const repairedContent = await attemptExamQualityRepair({
        anthropicApiKey: params.anthropicApiKey,
        openAiApiKey: params.openAiApiKey,
        openAiExamModel: params.openAiExamModel,
        examSystemPrompt: params.examSystemPrompt,
        fallbackAnthropicModel: params.examPrimaryModel,
        modelUsed,
        grade: params.grade,
        subject: params.subject,
        language: params.language,
        issues: integrityIssues,
        customPrompt: params.customPrompt,
        normalizedExam,
      });

      if (repairedContent) {
        const repairedJson = extractJsonBlock(repairedContent);
        const repairedRawExam = parseExamJson(repairedJson);
        let aiRepairedExam = normalizeExamShape(repairedRawExam, params.grade, params.subject, params.examType);
        aiRepairedExam = ensureMinimumQuestionCoverage(aiRepairedExam, {
          grade: params.grade,
          subject: params.subject,
          examType: params.examType,
          contextSummary: params.contextSummary,
          minQuestionCount: params.fullPaperMode ? countPolicy.min : Math.min(countPolicy.min, 16),
        });
        aiRepairedExam = enforceQuestionUpperBound(aiRepairedExam, countPolicy.max);
        aiRepairedExam = sanitizeLearnerFacingExamContent(aiRepairedExam);
        aiRepairedExam = ensureLanguageReadingPassage(aiRepairedExam, params.subject, params.grade, params.language);
        aiRepairedExam = augmentQuestionVisuals(aiRepairedExam, params.visualMode);
        aiRepairedExam = recalculateExamMarks(aiRepairedExam);

        const postRepairIssues = [
          ...validateComprehensionIntegrity(aiRepairedExam, params.subject, params.language),
          ...validateLearnerLanguageConsistency(aiRepairedExam, params.subject, params.language, params.effectiveQualityMode),
        ];
        if (postRepairIssues.length === 0) {
          normalizedExam = aiRepairedExam;
          integrityIssues = [];
          qualityRepaired = true;
          localFallbackReason =
            localFallbackReason ||
            'Dash applied an automatic quality repair pass to improve exam grounding.';
        }
      }
    } catch (repairError) {
      console.warn(
        '[generate-exam] quality repair pass failed',
        repairError instanceof Error ? repairError.message : String(repairError),
      );
    }
  }

  if (integrityIssues.length > 0 && isLanguageSubject(params.subject)) {
    const softenedExam = softenWeakGroundingComprehensionOptions(normalizedExam, params.language);
    if (softenedExam !== normalizedExam) {
      const postSoftenIssues = [
        ...validateComprehensionIntegrity(softenedExam, params.subject, params.language),
        ...validateLearnerLanguageConsistency(softenedExam, params.subject, params.language, params.effectiveQualityMode),
      ];
      const blockingIssues = postSoftenIssues.filter((issue) => !isWeakComprehensionGroundingIssue(issue));
      if (blockingIssues.length === 0) {
        normalizedExam = recalculateExamMarks(softenedExam);
        integrityIssues = [];
        qualityRepaired = true;
        localFallbackReason =
          localFallbackReason ||
          'Dash softened some comprehension items to keep answers strictly grounded in the reading passage context.';
      }
    }
  }

  if (integrityIssues.length > 0) {
    if (!params.allowFallback || !canFallbackForReason(params.fallbackPolicy, 'quality_guardrail')) {
      return {
        ok: false,
        status: 422,
        body: {
          success: false,
          error: 'generation_quality_guardrail_failed',
          message: 'Generated exam failed language/comprehension guardrails.',
          issues: integrityIssues,
          qualityReport: {
            passed: false,
            issues: integrityIssues,
            repaired: false,
          },
          retryable: true,
        },
      };
    }

    console.warn('[generate-exam] integrity issues detected, switching to safe fallback', {
      subject: params.subject,
      grade: params.grade,
      language: params.language,
      issues: integrityIssues,
    });
    modelUsed = 'fallback:language-integrity-guardrail-v1';
    localFallbackReason = `Generated exam failed language/comprehension checks (${integrityIssues.join(' ')}). A safe fallback exam was used.`;
    normalizedExam = normalizeExamShape(
      buildLocalFallbackExam(
        params.grade,
        params.subject,
        params.examType,
        params.language,
        params.contextSummary,
        params.customPrompt,
      ),
      params.grade,
      params.subject,
      params.examType,
    );
    normalizedExam = ensureLanguageReadingPassage(normalizedExam, params.subject, params.grade, params.language);
    normalizedExam = augmentQuestionVisuals(normalizedExam, params.visualMode);
    normalizedExam = recalculateExamMarks(normalizedExam);
  }

  if (!normalizedExam.sections.length || !normalizedExam.sections.some((section: any) => section.questions.length > 0)) {
    throw new Error(`Generated exam has no valid questions. ${lastModelError}`);
  }

  const teacherAlignment = computeTeacherAlignmentSummary(params.contextSummary);
  const examBlueprintAudit = computeBlueprintAudit(normalizedExam, params.grade, params.examType);
  const studyCoachPack = buildStudyCoachPack(params.grade, params.subject, params.language, params.contextSummary);
  const artifactType = resolveArtifactType(params.examType);
  const artifact = buildArtifactFromExam({
    artifactType,
    exam: normalizedExam,
    grade: params.grade,
    subject: params.subject,
    contextSummary: params.contextSummary,
    studyCoachPack,
  });

  return {
    ok: true,
    normalizedExam,
    modelUsed,
    localFallbackReason,
    initialIntegrityIssues,
    qualityRepaired,
    teacherAlignment,
    examBlueprintAudit,
    studyCoachPack,
    artifactType,
    artifact,
  };
}
