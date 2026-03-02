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
  normalizeLanguageLocale,
  normalizeText,
  parseExamJson,
  recalculateExamMarks,
  resolveArtifactType,
  sanitizeLearnerFacingExamContent,
  softenWeakGroundingComprehensionOptions,
  toUserFacingGenerationWarning,
  stripMetaPromptQuestions,
  validateComprehensionIntegrity,
  validateLearnerLanguageConsistency,
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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY =
  Deno.env.get('OPENAI_API_KEY') ||
  Deno.env.get('SERVER_OPENAI_API_KEY') ||
  Deno.env.get('OPENAI_API_KEY_2') ||
  '';
const OPENAI_EXAM_MODEL = Deno.env.get('OPENAI_EXAM_MODEL') || 'gpt-4o-mini';
const DEFAULT_ANTHROPIC_EXAM_MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_MODEL_ALIASES: Record<string, string> = {
  'claude-3-5-sonnet-20241022': DEFAULT_ANTHROPIC_EXAM_MODEL,
  'claude-3-5-sonnet-latest': DEFAULT_ANTHROPIC_EXAM_MODEL,
};
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
const STUDY_MATERIAL_MARKER = 'study material extracted from uploaded images/pdfs:';
const MAX_STUDY_MATERIAL_BLOCKS = 5;
const MAX_STUDY_MATERIAL_SUMMARY_LENGTH = 2400;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

type JsonRecord = Record<string, unknown>;

type ProfileRow = {
  id: string;
  role: string | null;
  organization_id: string | null;
  preschool_id: string | null;
  auth_user_id: string | null;
  subscription_tier: string | null;
};

type StudentRow = {
  id: string;
  parent_id: string | null;
  guardian_id: string | null;
  class_id: string | null;
  organization_id: string | null;
  preschool_id: string | null;
  grade: string | null;
  grade_level: string | null;
  student_id: string | null;
  first_name: string | null;
  last_name: string | null;
};

type AuthorizedRequestScope = {
  profile: ProfileRow;
  role: string;
  student: StudentRow | null;
  effectiveClassId: string | null;
  effectiveSchoolId: string | null;
  effectiveStudentId: string | null;
};

type ScopeDiagnostics = {
  requestedStudentId: string | null;
  requestedClassId: string | null;
  requestedSchoolId: string | null;
  effectiveStudentId: string | null;
  effectiveClassId: string | null;
  effectiveSchoolId: string | null;
  useTeacherContext: boolean;
};

function isWeakComprehensionGroundingIssue(issue: string): boolean {
  const normalized = String(issue || '').toLowerCase();
  return normalized.includes('weakly grounded in passage context');
}

type UploadedStudyMaterial = {
  sourceName: string;
  summary: string;
};

type StoredStudyMaterialRow = {
  source_name: string | null;
  summary_text: string | null;
};

const STAFF_ROLES = new Set([
  'teacher',
  'principal',
  'principal_admin',
  'admin',
  'school_admin',
  'super_admin',
]);

const PARENT_ROLES = new Set(['parent', 'guardian', 'sponsor']);
const STUDENT_ROLES = new Set(['student', 'learner']);

const EXAM_SYSTEM_PROMPT = `You are an expert South African CAPS/DBE exam generator.
Return ONLY valid JSON and no markdown.

Required JSON shape:
{
  "title": "string",
  "grade": "string",
  "subject": "string",
  "duration": "string",
  "totalMarks": number,
  "sections": [
    {
      "name": "string",
      "questions": [
        {
          "id": "q1",
          "question": "string",
          "type": "multiple_choice|true_false|short_answer|fill_in_blank",
          "marks": number,
          "options": ["A", "B", "C", "D"],
          "correctAnswer": "string",
          "explanation": "string"
        }
      ]
    }
  ]
}

Rules:
- CAPS/DBE aligned for selected grade and subject.
- Include mark allocation on every question.
- Use age-appropriate cognitive progression and South African context.
- Provide a valid correctAnswer and explanation for each question.
- At least 2 sections and at least 20 questions for practice_test (do not go below 20).
- Prefer concise, clean question text.
`;

function jsonResponse(body: JsonRecord, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeOrgId(profile: ProfileRow): string | null {
  return profile.organization_id || profile.preschool_id || null;
}

function normalizeAnthropicModel(model: string | null | undefined): string {
  const raw = String(model || '').trim();
  if (!raw) return DEFAULT_ANTHROPIC_EXAM_MODEL;
  return ANTHROPIC_MODEL_ALIASES[raw] || raw;
}

function getDefaultModelForTier(tier: string | null | undefined): string {
  const t = String(tier ?? 'free').toLowerCase();
  if (t.includes('enterprise') || t === 'superadmin' || t === 'super_admin') {
    return DEFAULT_ANTHROPIC_EXAM_MODEL;
  }
  if (t.includes('premium') || t.includes('pro') || t.includes('plus') || t.includes('basic')) {
    return DEFAULT_ANTHROPIC_EXAM_MODEL;
  }
  if (t.includes('starter') || t === 'trial') return 'claude-3-5-haiku-20241022';
  return 'claude-3-5-haiku-20241022';
}

function normalizeTierForExamRole(role: string, profileTier: string | null, resolvedTier: string | null): string {
  const normalizedRole = String(role || '').toLowerCase();
  const normalizedProfileTier = String(profileTier || 'free').toLowerCase();
  const normalizedResolvedTier = String(resolvedTier || 'free').toLowerCase();

  if (normalizedRole === 'super_admin') return 'enterprise';

  // Parents/students must use personal tier only (do not inherit school enterprise plans).
  if (PARENT_ROLES.has(normalizedRole) || STUDENT_ROLES.has(normalizedRole)) {
    return normalizedProfileTier || 'free';
  }

  return normalizedResolvedTier || normalizedProfileTier || 'free';
}

function isFreemiumTier(tier: string | null | undefined): boolean {
  const t = String(tier || 'free').toLowerCase();
  return (
    t === 'free' ||
    t.includes('freemium') ||
    t.includes('starter') ||
    t.includes('trial')
  );
}

function buildModelFallbackChain(preferredModel: string): string[] {
  const ordered = [
    preferredModel,
    ...ANTHROPIC_EXAM_MODEL_FALLBACKS,
    DEFAULT_ANTHROPIC_EXAM_MODEL,
    'claude-3-5-haiku-20241022',
    'claude-3-haiku-20240307',
  ];
  return [...new Set(ordered.map((model) => normalizeAnthropicModel(model)).filter(Boolean))];
}

function isCreditOrBillingError(status: number, responseText: string): boolean {
  const text = String(responseText || '').toLowerCase();
  if (status === 402) return true;
  return (
    text.includes('credit balance is too low') ||
    text.includes('insufficient credits') ||
    text.includes('insufficient_quota') ||
    text.includes('quota') && text.includes('exceeded') ||
    text.includes('billing')
  );
}

function stripNumberPrefix(line: string): string {
  return line.replace(/^\(?\d+\)?[.)\-:\s]+/, '').trim();
}

function stripInlineTranslationNoise(line: string): string {
  return line
    .replace(/\((?:teacher|class|translation|english)\s*:[^)]*\)/gi, '')
    .replace(/\[(?:teacher|class|translation|english)\s*:[^\]]*\]/gi, '')
    .trim();
}

function isMaterialHeadingLine(line: string): boolean {
  const normalized = stripNumberPrefix(line).toLowerCase();
  return [
    'topics to revise',
    'key facts/formulas',
    'common mistakes',
    'suggested question angles',
  ].includes(normalized);
}

function isLikelyMaterialMetaLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed === '---') return true;
  if (/^\d{6,}\.(?:jpg|jpeg|png|webp|pdf)$/i.test(trimmed)) return true;
  if (/^page\s+\d+$/i.test(trimmed)) return true;
  if (/^part\s+\d+$/i.test(trimmed)) return true;
  return isMaterialHeadingLine(trimmed);
}

function extractStudyMaterialBody(customPrompt?: string): string | null {
  const raw = String(customPrompt || '').trim();
  if (!raw) return null;

  const markerIndex = raw.toLowerCase().indexOf(STUDY_MATERIAL_MARKER);
  if (markerIndex === -1) return null;

  let block = raw.slice(markerIndex + STUDY_MATERIAL_MARKER.length);
  const lowerBlock = block.toLowerCase();
  const stopMarkers = [
    '\n\nkeep all learner-facing content strictly in',
    '\n\nwhen generated content includes non-english terminology',
    '\n\nadditional learner requirements:',
  ];

  let cutIndex = block.length;
  for (const stopMarker of stopMarkers) {
    const idx = lowerBlock.indexOf(stopMarker);
    if (idx >= 0) cutIndex = Math.min(cutIndex, idx);
  }
  block = block.slice(0, cutIndex).trim();
  return block || null;
}

function parseUploadedStudyMaterials(customPrompt?: string): UploadedStudyMaterial[] {
  const block = extractStudyMaterialBody(customPrompt);
  if (!block) return [];

  const chunks = block
    .split(/\n\s*---\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const materialBlocks: UploadedStudyMaterial[] = [];
  for (const chunk of chunks) {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) continue;

    let sourceName = 'Uploaded material';
    const contentLines: string[] = [];

    for (const line of lines) {
      if (/^source:\s*/i.test(line)) {
        const parsedSource = line.replace(/^source:\s*/i, '').trim();
        if (parsedSource) sourceName = parsedSource;
        continue;
      }

      const cleaned = stripInlineTranslationNoise(stripNumberPrefix(line))
        .replace(/^[-*•]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleaned || isLikelyMaterialMetaLine(cleaned)) continue;
      contentLines.push(cleaned);
    }

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const line of contentLines) {
      const normalized = normalizeText(line);
      if (!normalized || normalized.length < 4 || seen.has(normalized)) continue;
      seen.add(normalized);
      deduped.push(line);
    }

    if (deduped.length === 0) continue;

    materialBlocks.push({
      sourceName: sourceName.slice(0, 120),
      summary: deduped.join('\n').slice(0, MAX_STUDY_MATERIAL_SUMMARY_LENGTH),
    });

    if (materialBlocks.length >= MAX_STUDY_MATERIAL_BLOCKS) break;
  }

  return materialBlocks;
}

function formatStudyMaterialPromptBlock(materials: UploadedStudyMaterial[]): string | null {
  if (materials.length === 0) return null;
  const chunks = materials.map((material) => `Source: ${material.sourceName}\n${material.summary}`);
  return `Study material extracted from uploaded images/PDFs:\n${chunks.join('\n\n---\n\n')}`;
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadStoredStudyMaterials(
  supabase: ReturnType<typeof createClient>,
  params: {
    authUserId: string;
    studentScope: string;
    subject: string;
    grade: string;
  },
): Promise<UploadedStudyMaterial[]> {
  const queryRows = async (scopeKey: string): Promise<StoredStudyMaterialRow[]> => {
    const { data, error } = await supabase
      .from('exam_study_materials')
      .select('source_name, summary_text')
      .eq('auth_user_id', params.authUserId)
      .eq('student_scope', scopeKey)
      .eq('subject', params.subject)
      .eq('grade', params.grade)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(12);

    if (error) {
      console.warn('[generate-exam] study material memory query failed', error.message);
      return [];
    }

    return (data || []) as StoredStudyMaterialRow[];
  };

  let rows = await queryRows(params.studentScope);
  if (rows.length === 0 && params.studentScope) {
    rows = await queryRows('');
  }

  const materials: UploadedStudyMaterial[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const summary = String(row.summary_text || '').trim();
    if (!summary) continue;
    const normalized = normalizeText(summary);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    materials.push({
      sourceName: String(row.source_name || 'Saved study material').slice(0, 120),
      summary: summary.slice(0, MAX_STUDY_MATERIAL_SUMMARY_LENGTH),
    });
    if (materials.length >= 3) break;
  }

  return materials;
}

async function persistUploadedStudyMaterials(
  supabase: ReturnType<typeof createClient>,
  params: {
    authUserId: string;
    studentId: string | null;
    schoolId: string | null;
    grade: string;
    subject: string;
    language: string;
    examId: string | null;
    materials: UploadedStudyMaterial[];
  },
): Promise<void> {
  if (params.materials.length === 0) return;

  const studentScope = params.studentId || '';
  const nowIso = new Date().toISOString();
  const rows = [];

  for (const material of params.materials.slice(0, MAX_STUDY_MATERIAL_BLOCKS)) {
    const summary = String(material.summary || '').trim();
    if (summary.length < 40) continue;
    const hashInput = `${normalizeText(summary)}|${normalizeText(material.sourceName)}|${params.grade}|${params.subject}`;
    const contentHash = await sha256Hex(hashInput);
    rows.push({
      auth_user_id: params.authUserId,
      student_id: params.studentId,
      school_id: params.schoolId,
      student_scope: studentScope,
      grade: params.grade,
      subject: params.subject,
      language: params.language,
      source_name: material.sourceName,
      summary_text: summary,
      content_hash: contentHash,
      last_used_at: nowIso,
      updated_at: nowIso,
      metadata: {
        saved_from: 'generate_exam',
        generated_exam_id: params.examId,
      },
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('exam_study_materials')
    .upsert(rows, { onConflict: 'auth_user_id,student_scope,content_hash' });

  if (error) {
    console.warn('[generate-exam] study material memory upsert failed', error.message);
  }
}

async function attemptExamQualityRepair(params: {
  modelUsed: string;
  grade: string;
  subject: string;
  language: string;
  issues: string[];
  customPrompt?: string;
  normalizedExam: unknown;
}): Promise<string | null> {
  const issueList = params.issues.map((issue, idx) => `${idx + 1}. ${issue}`).join('\n');
  const promptLines = [
    `The previous exam JSON draft failed quality checks for ${params.grade} ${params.subject}.`,
    'Repair the draft and return a corrected full exam JSON only (no markdown).',
    `Quality issues to fix:\n${issueList}`,
    `Learner language must be strictly ${params.language}.`,
    'If uploaded study material exists, keep questions strictly grounded in that material.',
    'Do not include OCR labels/file names/translation annotations in learner-facing content.',
    'Keep CAPS alignment and preserve realistic mark distribution.',
    `Previous draft JSON:\n${JSON.stringify(params.normalizedExam)}`,
  ];
  if (params.customPrompt) {
    promptLines.push(`Original additional instructions:\n${params.customPrompt}`);
  }
  const repairPrompt = promptLines.join('\n\n');

  if (params.modelUsed.startsWith('openai:') && OPENAI_API_KEY) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_EXAM_MODEL,
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: EXAM_SYSTEM_PROMPT },
          { role: 'user', content: repairPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[generate-exam] quality repair OpenAI failed', response.status, errorText);
      return null;
    }

    const data = await response.json();
    return String(data?.choices?.[0]?.message?.content || '').trim() || null;
  }

  if (!ANTHROPIC_API_KEY) return null;

  const repairModel = params.modelUsed.startsWith('openai:')
    ? EXAM_PRIMARY_MODEL
    : normalizeAnthropicModel(params.modelUsed || EXAM_PRIMARY_MODEL);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: repairModel,
      max_tokens: 4096,
      system: EXAM_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: repairPrompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn('[generate-exam] quality repair Anthropic failed', response.status, errorText);
    return null;
  }

  const data = await response.json();
  return String(data?.content?.[0]?.text || '').trim() || null;
}


async function fetchProfileByAuthUser(supabase: ReturnType<typeof createClient>, authUserId: string): Promise<ProfileRow | null> {
  const byAuth = await supabase
    .from('profiles')
    .select('id, role, organization_id, preschool_id, auth_user_id, subscription_tier')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (!byAuth.error && byAuth.data) {
    return byAuth.data as ProfileRow;
  }

  const byId = await supabase
    .from('profiles')
    .select('id, role, organization_id, preschool_id, auth_user_id, subscription_tier')
    .eq('id', authUserId)
    .maybeSingle();

  if (!byId.error && byId.data) {
    return byId.data as ProfileRow;
  }

  return null;
}

async function isParentLinkedToStudent(
  supabase: ReturnType<typeof createClient>,
  parentProfileId: string,
  studentId: string,
): Promise<boolean> {
  const studentResult = await supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .or(`parent_id.eq.${parentProfileId},guardian_id.eq.${parentProfileId}`)
    .maybeSingle();

  if (!studentResult.error && studentResult.data) {
    return true;
  }

  const relationResult = await supabase
    .from('student_parent_relationships')
    .select('id')
    .eq('student_id', studentId)
    .eq('parent_id', parentProfileId)
    .maybeSingle();

  return !relationResult.error && !!relationResult.data;
}

async function resolveStudentForRequest(
  supabase: ReturnType<typeof createClient>,
  studentId: string,
): Promise<StudentRow | null> {
  const { data, error } = await supabase
    .from('students')
    .select('id, parent_id, guardian_id, class_id, organization_id, preschool_id, grade, grade_level, student_id, first_name, last_name')
    .eq('id', studentId)
    .maybeSingle();

  if (error || !data) return null;
  return data as StudentRow;
}

async function resolveStudentForStudentRole(
  supabase: ReturnType<typeof createClient>,
  profile: ProfileRow,
  authUserId: string,
): Promise<StudentRow | null> {
  const candidateIds = [profile.id, authUserId]
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0);

  if (candidateIds.length === 0) return null;

  for (const candidate of candidateIds) {
    const { data, error } = await supabase
      .from('students')
      .select('id, parent_id, guardian_id, class_id, organization_id, preschool_id, grade, grade_level, student_id, first_name, last_name')
      .eq('student_id', candidate)
      .limit(1);

    if (!error && data && data.length === 1) {
      return data[0] as StudentRow;
    }
  }

  return null;
}

async function resolveAuthorizedScope(
  supabase: ReturnType<typeof createClient>,
  authUserId: string,
  payload: {
    studentId?: string;
    classId?: string;
    schoolId?: string;
    useTeacherContext: boolean;
  },
): Promise<AuthorizedRequestScope> {
  const profile = await fetchProfileByAuthUser(supabase, authUserId);
  if (!profile) {
    throw new Error('Organization membership required');
  }

  const role = String(profile.role || '').toLowerCase();
  const isParent = PARENT_ROLES.has(role);
  const isStudent = STUDENT_ROLES.has(role);
  const isStaff = STAFF_ROLES.has(role);
  const isSuperAdmin = role === 'super_admin';
  const profileOrgId = normalizeOrgId(profile);

  if (isStaff && !isSuperAdmin && !profileOrgId) {
    throw new Error('School membership required for staff exam generation');
  }

  let student: StudentRow | null = null;
  if (payload.studentId) {
    student = await resolveStudentForRequest(supabase, payload.studentId);
  } else if (isStudent) {
    student = await resolveStudentForStudentRole(supabase, profile, authUserId);
  }

  if (payload.studentId && !student && payload.useTeacherContext && !isStudent) {
    throw new Error('Requested student record was not found');
  }

  if (student) {
    if (isParent) {
      const linked = await isParentLinkedToStudent(supabase, profile.id, student.id);
      if (!linked) {
        throw new Error('Parent can only generate exams for linked children');
      }
    }

    if (isStudent) {
      const matchesSelf =
        student.id === profile.id ||
        student.student_id === profile.id ||
        student.student_id === authUserId;

      if (!matchesSelf && payload.studentId) {
        throw new Error('Student can only generate for self');
      }
    }

    if (isStaff && !isSuperAdmin) {
      const studentOrg = student.organization_id || student.preschool_id || null;
      if (profileOrgId && studentOrg && profileOrgId !== studentOrg) {
        throw new Error('Staff can only access students in their own school scope');
      }
    }
  } else if (isParent && payload.useTeacherContext) {
    throw new Error('A linked learner is required to use teacher artifact context');
  }

  const studentOrgId = student?.organization_id || student?.preschool_id || null;

  let effectiveSchoolId = payload.schoolId || studentOrgId || profileOrgId || null;
  if (payload.schoolId) {
    if (studentOrgId && payload.schoolId !== studentOrgId) {
      throw new Error('Requested school scope does not match learner scope');
    }

    if (!studentOrgId && isStaff && !isSuperAdmin && profileOrgId && payload.schoolId !== profileOrgId) {
      throw new Error('Requested school scope is outside staff access');
    }
  }

  let effectiveClassId = payload.classId || student?.class_id || null;
  if (student?.class_id) {
    effectiveClassId = student.class_id;
  }

  if (!effectiveClassId && payload.useTeacherContext && (isParent || isStudent)) {
    // Teacher context can still run with school scope only, but this is a useful guardrail.
    console.warn('[generate-exam] teacher context running without class scope', {
      role,
      studentId: student?.id,
    });
  }

  if (isStaff && effectiveClassId && !isSuperAdmin && profileOrgId) {
    const { data: klass } = await supabase
      .from('classes')
      .select('id, preschool_id, organization_id')
      .eq('id', effectiveClassId)
      .maybeSingle();

    if (!klass) {
      throw new Error('Requested class was not found');
    }

    const classOrg = klass.organization_id || klass.preschool_id || null;
    if (classOrg && classOrg !== profileOrgId) {
      throw new Error('Requested class is outside staff school scope');
    }

    if (!effectiveSchoolId) {
      effectiveSchoolId = classOrg;
    }
  }

  return {
    profile,
    role,
    student,
    effectiveClassId,
    effectiveSchoolId,
    effectiveStudentId: student?.id || null,
  };
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

    // Quota check — prevent unbounded exam generation
    const environment = Deno.env.get('ENVIRONMENT') || 'production';
    const devBypass = Deno.env.get('AI_QUOTA_BYPASS') === 'true' &&
                      (environment === 'development' || environment === 'local');
    let forceFreemiumFallback = false;
    let freemiumPremiumExamCount = 0;

    if (isFreemium) {
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
        if (isFreemium) {
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

    const tierDefaultModel = getDefaultModelForTier(effectiveTierForRole);
    const preferredModel = normalizeAnthropicModel(modelOverride || tierDefaultModel || EXAM_PRIMARY_MODEL);
    const modelCandidates = buildModelFallbackChain(preferredModel);
    let modelUsed = preferredModel;

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

    let aiContent = '';
    let localFallbackReason: string | null = null;
    let lastModelError = 'Failed to generate exam content';
    let anthropicCreditIssue = false;

    if (forceFreemiumFallback) {
      if (!allowFallback || !canFallbackForReason(fallbackPolicy, 'freemium_limit')) {
        return jsonResponse(
          {
            success: false,
            error: 'premium_exam_limit_reached',
            message: `Premium exam generation limit reached (${freemiumPremiumExamCount}/${FREEMIUM_PREMIUM_EXAM_LIMIT}) for this cycle.`,
            retryable: false,
          },
          429,
          corsHeaders,
        );
      }
      localFallbackReason = `Freemium plan limit reached: you've used ${freemiumPremiumExamCount} premium exam generations. A basic fallback exam is being used. Upgrade to restore premium Sonnet exam generation.`;
      modelUsed = 'fallback:freemium-limit-v1';
    } else if (ANTHROPIC_API_KEY) {
      for (const candidateModel of modelCandidates) {
        const candidateResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: candidateModel,
            max_tokens: 4096,
            system: EXAM_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
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
    } else {
      lastModelError = 'ANTHROPIC_API_KEY missing';
    }

    if (!aiContent && OPENAI_API_KEY) {
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_EXAM_MODEL,
          temperature: 0.2,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: EXAM_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (openAIResponse.ok) {
        const openAIData = await openAIResponse.json();
        aiContent = String(openAIData?.choices?.[0]?.message?.content || '');
        modelUsed = `openai:${OPENAI_EXAM_MODEL}`;
      } else {
        const openAIErr = await openAIResponse.text();
        lastModelError = openAIErr || `openai_status=${openAIResponse.status}`;
        console.error('[generate-exam] OpenAI API error:', openAIResponse.status, openAIErr);
        if (openAIResponse.status === 429 && !isCreditOrBillingError(openAIResponse.status, openAIErr)) {
          throw new Error('AI service is busy. Please try again in a moment.');
        }
      }
    }

    let normalizedExam: any;

    if (!aiContent) {
      if (!allowFallback || !canFallbackForReason(fallbackPolicy, 'provider_unavailable')) {
        return jsonResponse(
          {
            success: false,
            error: 'ai_provider_unavailable',
            message: anthropicCreditIssue
              ? 'AI provider credits are currently depleted. Please try again later.'
              : 'AI providers are currently unavailable. Please retry shortly.',
            retryable: true,
          },
          503,
          corsHeaders,
        );
      }

      modelUsed = 'fallback:local-template-v1';
      localFallbackReason = anthropicCreditIssue
        ? 'AI provider credits are currently depleted. Generated a local fallback practice exam.'
        : 'AI providers are currently unavailable. Generated a local fallback practice exam.';
      normalizedExam = normalizeExamShape(
        buildLocalFallbackExam(grade, subject, examType, language, contextSummary, customPrompt),
        grade,
        subject,
        examType,
      );
    } else {
      let parsedRawExam: any;
      try {
        const jsonBlock = extractJsonBlock(aiContent);
        parsedRawExam = parseExamJson(jsonBlock);
        normalizedExam = normalizeExamShape(parsedRawExam, grade, subject, examType);
      } catch (parseError) {
        console.error('[generate-exam] parse error', parseError);
        if (!allowFallback || !canFallbackForReason(fallbackPolicy, 'parse_failed')) {
          return jsonResponse(
            {
              success: false,
              error: 'generation_parse_failed',
              message: 'AI returned malformed exam JSON. Retry generation.',
              retryable: true,
            },
            502,
            corsHeaders,
          );
        }
        modelUsed = 'fallback:local-template-v1';
        localFallbackReason = 'AI returned malformed exam JSON. Generated a local fallback practice exam.';
        normalizedExam = normalizeExamShape(
          buildLocalFallbackExam(grade, subject, examType, language, contextSummary, customPrompt),
          grade,
          subject,
          examType,
        );
      }
    }

    const countPolicy = getQuestionCountPolicy(grade, examType);

    normalizedExam = ensureMinimumQuestionCoverage(normalizedExam, {
      grade,
      subject,
      examType,
      contextSummary,
      minQuestionCount: fullPaperMode ? countPolicy.min : Math.min(countPolicy.min, 16),
    });
    normalizedExam = enforceQuestionUpperBound(normalizedExam, countPolicy.max);
    normalizedExam = sanitizeLearnerFacingExamContent(normalizedExam);
    normalizedExam = ensureLanguageReadingPassage(normalizedExam, subject, grade, language);
    normalizedExam = augmentQuestionVisuals(normalizedExam, visualMode);
    normalizedExam = recalculateExamMarks(normalizedExam);
    const languageConsistencyIssues = validateLearnerLanguageConsistency(
      normalizedExam,
      subject,
      language,
      effectiveQualityMode,
    );
    let integrityIssues = [
      ...validateComprehensionIntegrity(normalizedExam, subject, language),
      ...languageConsistencyIssues,
    ];
    const initialIntegrityIssues = [...integrityIssues];
    let qualityRepaired = false;
    if (integrityIssues.length > 0) {
      const repairedExam = stripMetaPromptQuestions(normalizedExam);
      const repairedComprehensionIssues = validateComprehensionIntegrity(repairedExam, subject, language);
      const repairedLanguageIssues = validateLearnerLanguageConsistency(
        repairedExam,
        subject,
        language,
        effectiveQualityMode,
      );
      const repairedIssues = [...repairedComprehensionIssues, ...repairedLanguageIssues];
      const hasEnoughQuestions =
        repairedExam.sections?.some((s: any) => Array.isArray(s?.questions) && s.questions.length >= 2) ?? false;
      if (repairedIssues.length === 0 && hasEnoughQuestions) {
        normalizedExam = repairedExam;
        normalizedExam = recalculateExamMarks(normalizedExam);
        qualityRepaired = true;
        if (integrityIssues.some((i) => i.includes('instruction/meta prompt'))) {
          localFallbackReason = 'Some instruction-only items were removed from the comprehension section.';
        }
        integrityIssues = [];
      }
    }
    if (integrityIssues.length > 0 && aiContent && !modelUsed.startsWith('fallback:')) {
      try {
        const repairedContent = await attemptExamQualityRepair({
          modelUsed,
          grade,
          subject,
          language,
          issues: integrityIssues,
          customPrompt,
          normalizedExam,
        });

        if (repairedContent) {
          const repairedJson = extractJsonBlock(repairedContent);
          const repairedRawExam = parseExamJson(repairedJson);
          let aiRepairedExam = normalizeExamShape(repairedRawExam, grade, subject, examType);
          aiRepairedExam = ensureMinimumQuestionCoverage(aiRepairedExam, {
            grade,
            subject,
            examType,
            contextSummary,
            minQuestionCount: fullPaperMode ? countPolicy.min : Math.min(countPolicy.min, 16),
          });
          aiRepairedExam = enforceQuestionUpperBound(aiRepairedExam, countPolicy.max);
          aiRepairedExam = sanitizeLearnerFacingExamContent(aiRepairedExam);
          aiRepairedExam = ensureLanguageReadingPassage(aiRepairedExam, subject, grade, language);
          aiRepairedExam = augmentQuestionVisuals(aiRepairedExam, visualMode);
          aiRepairedExam = recalculateExamMarks(aiRepairedExam);

          const postRepairIssues = [
            ...validateComprehensionIntegrity(aiRepairedExam, subject, language),
            ...validateLearnerLanguageConsistency(aiRepairedExam, subject, language, effectiveQualityMode),
          ];
          if (postRepairIssues.length === 0) {
            normalizedExam = aiRepairedExam;
            integrityIssues = [];
            qualityRepaired = true;
            localFallbackReason = localFallbackReason || 'Dash applied an automatic quality repair pass to improve exam grounding.';
          }
        }
      } catch (repairError) {
        console.warn(
          '[generate-exam] quality repair pass failed',
          repairError instanceof Error ? repairError.message : String(repairError),
        );
      }
    }
    if (integrityIssues.length > 0 && hasStudyMaterialContext && isLanguageSubject(subject)) {
      const softenedExam = softenWeakGroundingComprehensionOptions(normalizedExam, language);
      if (softenedExam !== normalizedExam) {
        const postSoftenIssues = [
          ...validateComprehensionIntegrity(softenedExam, subject, language),
          ...validateLearnerLanguageConsistency(softenedExam, subject, language, effectiveQualityMode),
        ];
        const blockingIssues = postSoftenIssues.filter((issue) => !isWeakComprehensionGroundingIssue(issue));
        if (blockingIssues.length === 0) {
          normalizedExam = recalculateExamMarks(softenedExam);
          integrityIssues = [];
          qualityRepaired = true;
          localFallbackReason =
            localFallbackReason ||
            'Dash softened some comprehension items to keep answers strictly grounded in uploaded study material.';
        }
      }
    }
    if (integrityIssues.length > 0) {
      if (!allowFallback || !canFallbackForReason(fallbackPolicy, 'quality_guardrail')) {
        return jsonResponse(
          {
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
          422,
          corsHeaders,
        );
      }
      console.warn('[generate-exam] integrity issues detected, switching to safe fallback', {
        subject,
        grade,
        language,
        issues: integrityIssues,
      });
      modelUsed = 'fallback:language-integrity-guardrail-v1';
      localFallbackReason = `Generated exam failed language/comprehension checks (${integrityIssues.join(' ')}). A safe fallback exam was used.`;
      normalizedExam = normalizeExamShape(
        buildLocalFallbackExam(grade, subject, examType, language, contextSummary, customPrompt),
        grade,
        subject,
        examType,
      );
      normalizedExam = ensureLanguageReadingPassage(normalizedExam, subject, grade, language);
      normalizedExam = augmentQuestionVisuals(normalizedExam, visualMode);
      normalizedExam = recalculateExamMarks(normalizedExam);
    }

    if (!normalizedExam.sections.length || !normalizedExam.sections.some((section: any) => section.questions.length > 0)) {
      throw new Error(`Generated exam has no valid questions. ${lastModelError}`);
    }

    const teacherAlignment = computeTeacherAlignmentSummary(contextSummary);
    const examBlueprintAudit = computeBlueprintAudit(normalizedExam, grade, examType);
    const studyCoachPack = buildStudyCoachPack(grade, subject, language, contextSummary);
    const artifactType = resolveArtifactType(examType);
    const artifact = buildArtifactFromExam({
      artifactType,
      exam: normalizedExam,
      grade,
      subject,
      contextSummary,
      studyCoachPack,
    });

    const generationSource = localFallbackReason
      ? 'local_fallback'
      : uploadedStudyMaterials.length > 0
      ? 'uploaded_study_material'
      : storedStudyMaterials.length > 0
      ? 'stored_study_material_memory'
      : useTeacherContext
      ? 'teacher_artifact_context'
      : 'caps_baseline';

    const metadata = {
      source: generationSource,
      artifactType,
      contextSummary,
      scopeDiagnostics,
      teacherAlignment,
      examBlueprintAudit,
      studyCoachPack,
      caps: {
        aligned: true,
        framework: 'CAPS/DBE',
        lookbackDays,
        language,
      },
      studyMaterialContext: {
        hasStudyMaterialContext,
        uploadedCount: uploadedStudyMaterials.length,
        reusedCount: storedStudyMaterials.length,
      },
      generationWarning: localFallbackReason
        ? toUserFacingGenerationWarning(localFallbackReason)
        : undefined,
    };

    let persistedExamId = `temp-${Date.now()}`;
    const warningParts: string[] = [];
    if (localFallbackReason) warningParts.push(toUserFacingGenerationWarning(localFallbackReason));
    if (useTeacherContext && !scopeDiagnostics.effectiveSchoolId) {
      warningParts.push('Teacher context ran without a resolved school scope. Results may be generic.');
    }
    if (useTeacherContext && contextSummary.assignmentCount + contextSummary.lessonCount === 0) {
      warningParts.push('No recent teacher artifacts were found. Generated content leans on CAPS baseline.');
    }
    if (uploadedStudyMaterials.length === 0 && storedStudyMaterials.length > 0) {
      warningParts.push('No new upload was provided, so Dash used previously saved study material for this learner.');
    }

    const persistedGeneratedContent =
      artifactType === 'practice_test'
        ? normalizedExam
        : {
            artifactType,
            artifact,
            exam: normalizedExam,
          };

    const { data: savedExam, error: saveError } = await supabase
      .from('exam_generations')
      .insert({
        user_id: scope.profile.id,
        grade,
        subject,
        exam_type: examType,
        display_title: normalizedExam.title,
        generated_content: JSON.stringify(persistedGeneratedContent),
        status: 'completed',
        model_used: modelUsed,
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
      await persistUploadedStudyMaterials(supabase, {
        authUserId: user.id,
        studentId: scope.effectiveStudentId || null,
        schoolId: scope.effectiveSchoolId || null,
        grade,
        subject,
        language,
        examId: persistedExamId,
        materials: uploadedStudyMaterials,
      });
    } catch (materialPersistError) {
      console.warn(
        '[generate-exam] study material persistence non-fatal error',
        materialPersistError instanceof Error ? materialPersistError.message : String(materialPersistError),
      );
    }

    // Record usage after successful generation
    if (!devBypass && !forceFreemiumFallback) {
      try {
        await supabase.rpc('increment_ai_usage', {
          p_user_id: user.id,
          p_request_type: 'exam_generation',
          p_status: 'success',
          p_metadata: { scope: 'generate_exam', model_used: modelUsed, exam_id: persistedExamId },
        });
      } catch (usageErr) {
        console.warn('[generate-exam] increment_ai_usage failed (non-fatal):', usageErr);
      }
    }

    const persistenceWarning = warningParts.length > 0 ? warningParts.join(' ') : undefined;
    const generationMode = modelUsed === 'fallback:local-template-v1' ? 'outage_fallback' : 'ai';
    const qualityReport = {
      passed:
        initialIntegrityIssues.length === 0 ||
        qualityRepaired ||
        modelUsed.startsWith('fallback:'),
      issues: initialIntegrityIssues,
      repaired: qualityRepaired,
    };

    return jsonResponse(
      {
        success: true,
        exam: artifactType === 'practice_test' ? normalizedExam : undefined,
        artifactType,
        artifact,
        generationMode,
        qualityReport,
        retryable: false,
        examId: persistedExamId,
        scopeDiagnostics,
        contextSummary,
        teacherAlignment,
        examBlueprintAudit,
        studyCoachPack,
        persistenceWarning,
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
