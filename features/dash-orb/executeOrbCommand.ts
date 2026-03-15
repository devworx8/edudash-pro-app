/**
 * features/dash-orb/executeOrbCommand.ts
 *
 * Extracted from DashOrbImpl.tsx — the non-streaming AI command execution
 * function that handles superadmin-ai / ai-proxy routing, OCR, image
 * payloads, fallback chains, and error formatting.
 */

import { assertSupabase } from '@/lib/supabase';
import { calculateAge } from '@/lib/date-utils';
import {
  detectOCRTask,
  getCriteriaResponsePrompt,
  getOCRPromptForTask,
  isOCRIntent,
  isShortOrAttachmentOnlyPrompt,
} from '@/lib/dash-ai/ocrPrompts';
import { shouldUsePhonicsMode } from '@/lib/dash-ai/phonicsDetection';
import { buildImagePayloadsFromAttachments } from '@/lib/dash-ai/imagePayloadBuilder';
import { classifyResponseMode } from '@/lib/dash-ai/responseMode';
import { detectLanguageOverrideFromText, resolveResponseLocale } from '@/lib/dash-ai/languageRouting';
import { resolveAIProxyScopeFromRole } from '@/lib/ai/aiProxyScope';
import { shouldEnableVoiceTurnTools } from '@/lib/dash-voice-utils';
import type { DashAttachment } from '@/services/dash-ai/types';

// ─── Types ──────────────────────────────────────────────────

export type ExecuteCommandResult = {
  text: string;
  ok: boolean;
  ocrMode: boolean;
};

export interface OrbCommandContext {
  normalizedRole: string;
  isUserSuperAdmin: boolean;
  profile: Record<string, any> | null;
  selectedModel: string;
  selectedLanguage: 'en-ZA' | 'af-ZA' | 'zu-ZA';
  memorySnapshot: string;
  learnerAgeYears: number | null;
  learnerGrade: string | null;
  learnerName: string | null;
  learnerSchoolType: string | null;
  dashPolicyDefaultMode: string;
  dashPolicySystemPromptAddendum: string | null;
  isTutorRole: boolean;
}

// ─── Helpers (pure) ─────────────────────────────────────────

function toReadableOCRText(raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(value) as {
      extracted_text?: string;
      analysis?: string;
      confidence?: number;
      document_type?: string;
    };
    if (!parsed || typeof parsed !== 'object') return null;
    const analysis = typeof parsed.analysis === 'string' ? parsed.analysis.trim() : '';
    const extracted = typeof parsed.extracted_text === 'string' ? parsed.extracted_text.trim() : '';
    if (!analysis && !extracted) return null;
    const confidencePct = typeof parsed.confidence === 'number'
      ? `\n\nConfidence: ${Math.round(parsed.confidence * 100)}%`
      : '';
    const documentType = typeof parsed.document_type === 'string'
      ? `Document type: ${parsed.document_type}`
      : '';
    const extractedBlock = extracted ? `\n\nExtracted text:\n${extracted}` : '';
    return [analysis || documentType, documentType && analysis ? '' : null, extractedBlock, confidencePct]
      .filter(Boolean)
      .join('');
  } catch {
    return null;
  }
}

function parseAiProxyResponse(data: any): string {
  if (typeof data?.ocr?.analysis === 'string') return data.ocr.analysis;
  if (typeof data?.content === 'string') return toReadableOCRText(data.content) || data.content;
  if (Array.isArray(data?.content) && data.content[0]?.text) return data.content[0].text;
  if (typeof data?.message?.content === 'string') return data.message.content;
  if (typeof data?.text === 'string') return data.text;
  if (typeof data?.response === 'string') return data.response;
  if (data?.success && data?.content) return typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
  console.warn('[DashOrb] Unknown ai-proxy response format:', Object.keys(data || {}));
  return 'I received your message but could not parse the response.';
}

function isFallbackWorthy(status: number, message: string): boolean {
  const lower = message.toLowerCase();
  return (
    status === 404 || status === 502 || status === 503 ||
    lower.includes('function not found') || lower.includes('superadmin-ai') || lower.includes('not deployed')
  );
}

// ─── Main export ────────────────────────────────────────────

export async function executeOrbCommand(
  command: string,
  history: Array<{ role: string; content: string }>,
  attachments: DashAttachment[],
  ctx: OrbCommandContext,
): Promise<ExecuteCommandResult> {
  let attemptedOCRMode = false;
  try {
    const supabase = assertSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated. Please log in again.');

    const isLearnerRole = ['student', 'learner'].includes(ctx.normalizedRole);
    const ageYears = isLearnerRole
      ? (ctx.profile?.date_of_birth ? calculateAge(ctx.profile.date_of_birth) : null)
      : (ctx.normalizedRole === 'parent' ? ctx.learnerAgeYears : null);

    const ageContext = ageYears
      ? `Learner age: ${ageYears}. Provide age-appropriate, child-safe guidance.`
      : (isLearnerRole ? 'Provide age-appropriate, child-safe guidance.' : undefined);
    const gradeContext = ctx.learnerGrade ? `Learner grade: ${ctx.learnerGrade}.` : undefined;
    const nameContext = ctx.learnerName ? `Learner name: ${ctx.learnerName}.` : undefined;
    const schoolTypeContext = ctx.learnerSchoolType ? `School type: ${ctx.learnerSchoolType}.` : undefined;

    const roleContext = ctx.isTutorRole
      ? 'Role: Parent/Student tutor. Use diagnose → teach → practice. Start with one diagnostic question and WAIT. Ask one question at a time. Avoid teacher/admin-only sections.'
      : (ctx.normalizedRole ? `Role: ${ctx.normalizedRole}. Provide role-appropriate guidance.` : undefined);
    const lessonContext = ctx.isTutorRole
      ? 'If asked for a lesson plan, output a learner-ready mini-lesson with examples, practice, and a quick check question. Add 1-2 tips for parents to help at home.'
      : undefined;

    const traceId = `dash_orb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const explicitLanguage = detectLanguageOverrideFromText(command);
    const responseMode = classifyResponseMode({ text: command, hasAttachments: attachments.length > 0 });
    const languageResolution = resolveResponseLocale({
      explicitOverride: explicitLanguage, responseText: command, fallbackPreference: ctx.selectedLanguage,
    });
    const languageSource = languageResolution.source || (explicitLanguage ? 'explicit_override' : 'preference');

    const superAdminEndpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/superadmin-ai`;
    const aiProxyEndpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-proxy`;

    const images = await buildImagePayloadsFromAttachments({ attachments });
    const detectedOCRTask = images.length > 0 ? detectOCRTask(command) : null;
    const ocrMode = images.length > 0 && (
      isOCRIntent(command) || detectedOCRTask !== null || isShortOrAttachmentOnlyPrompt(command)
    );
    attemptedOCRMode = ocrMode;
    const ocrTask = detectedOCRTask || 'document';

    const attachmentContext = attachments.length > 0
      ? ['ATTACHMENTS:', ...attachments.map(a => {
          const sizeLabel = typeof a.size === 'number' && a.size > 0 ? ` (${Math.round(a.size / 1024)} KB)` : '';
          return `- ${a.name || 'Attachment'} [${a.kind || 'file'}]${sizeLabel}`;
        })].join('\n')
      : null;

    const criteriaContext = getCriteriaResponsePrompt(command);
    const ocrContext = ocrMode ? getOCRPromptForTask(ocrTask) : null;
    const aiScope = resolveAIProxyScopeFromRole(ctx.normalizedRole);
    const enableToolsForTurn = shouldEnableVoiceTurnTools(command, {
      hasAttachment: images.length > 0, ocrMode, criteriaIntent: Boolean(criteriaContext),
    });

    const aiProxyBody = {
      scope: aiScope,
      service_type: ocrMode ? 'image_analysis' : 'dash_conversation',
      payload: {
        prompt: command,
        model: ctx.selectedModel,
        images: images.length > 0 ? images : undefined,
        ocr_mode: ocrMode || undefined,
        ocr_task: ocrMode ? ocrTask : undefined,
        ocr_response_format: ocrMode ? 'json' : undefined,
        context: [
          history.length > 0 ? history.map(h => `${h.role}: ${h.content}`).join('\n') : null,
          ctx.memorySnapshot ? `Conversation memory snapshot: ${ctx.memorySnapshot}` : null,
          attachmentContext, criteriaContext, ocrContext,
          nameContext, gradeContext, schoolTypeContext, ageContext, roleContext, lessonContext,
          ctx.dashPolicySystemPromptAddendum,
        ].filter(Boolean).join('\n\n') || undefined,
      },
      stream: false,
      enable_tools: enableToolsForTurn,
      metadata: {
        role: ctx.normalizedRole, model: ctx.selectedModel, source: 'dash_orb',
        dash_mode: ctx.dashPolicyDefaultMode, response_mode: responseMode,
        language_source: languageSource,
        detected_language: languageResolution.locale || undefined,
        age_years: ageYears ?? undefined,
        has_image: images.length > 0, attachment_count: attachments.length,
        ocr_mode: ocrMode, ocr_task: ocrMode ? ocrTask : undefined,
        stream_tool_mode: enableToolsForTurn ? 'enabled' : 'deferred',
        trace_id: traceId,
        tool_plan: { source: 'dash_orb.executeCommand', history_count: history.length },
      },
    };

    const superAdminBody = { action: 'chat', message: command, history, max_tokens: 1024 };

    const invoke = async (endpoint: string, body: Record<string, unknown>) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    };

    const forceAiProxy = ocrMode || images.length > 0;
    let mode: 'superadmin' | 'ai_proxy' = ctx.isUserSuperAdmin && !forceAiProxy ? 'superadmin' : 'ai_proxy';
    let response = await invoke(
      mode === 'superadmin' ? superAdminEndpoint : aiProxyEndpoint,
      mode === 'superadmin' ? superAdminBody : aiProxyBody,
    );

    if (!response.ok && mode === 'superadmin') {
      const message = String(response.data?.error || response.data?.message || `Request failed: ${response.status}`);
      if (isFallbackWorthy(response.status, message)) {
        console.warn('[DashOrb] superadmin-ai unavailable, falling back to ai-proxy', { status: response.status, message });
        mode = 'ai_proxy';
        response = await invoke(aiProxyEndpoint, aiProxyBody);
      }
    }

    if (!response.ok) {
      const rawError = response.data?.error || response.data?.message || `Request failed: ${response.status}`;
      console.warn('[DashOrb] AI error payload:', response.data);
      if (typeof rawError === 'string' && rawError.toLowerCase().includes('ai_proxy_error')) {
        throw new Error('AI service is temporarily unavailable. Please try again shortly.');
      }
      throw new Error(rawError);
    }

    if (mode === 'superadmin') {
      if (!response.data?.success) {
        const fallbackError = String(response.data?.error || response.data?.message || 'Unknown error occurred');
        if (isFallbackWorthy(200, fallbackError)) {
          const fallback = await invoke(aiProxyEndpoint, aiProxyBody);
          if (!fallback.ok) throw new Error(fallback.data?.error || fallback.data?.message || 'Fallback ai-proxy request failed');
          return { text: parseAiProxyResponse(fallback.data), ok: true, ocrMode };
        }
        throw new Error(fallbackError);
      }
      return { text: String(response.data?.response || ''), ok: true, ocrMode: false };
    }

    return { text: parseAiProxyResponse(response.data), ok: true, ocrMode };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('Not authenticated')) return { text: '⚠️ **Authentication Required**\n\nPlease log out and log back in to refresh your session.', ok: false, ocrMode: attemptedOCRMode };
    if (errorMessage.includes('Super admin')) return { text: '🔒 **Access Denied**\n\nThis feature requires Super Admin privileges.', ok: false, ocrMode: attemptedOCRMode };
    if (errorMessage.includes('quota') || errorMessage.includes('limit')) return { text: '📊 **AI Quota Exceeded**\n\nYou\'ve reached your AI usage limit. Please try again later or upgrade your subscription.', ok: false, ocrMode: attemptedOCRMode };
    if (errorMessage.includes('ANTHROPIC_API_KEY')) return { text: '⚙️ **Configuration Required**\n\nThe AI service is not configured. Please contact support.', ok: false, ocrMode: attemptedOCRMode };
    return { text: `❌ **Error**\n\n${errorMessage}\n\nPlease try again or contact support if the issue persists.`, ok: false, ocrMode: attemptedOCRMode };
  }
}

// Re-export phonics helper (used by DashOrbImpl for TTS after executeOrbCommand)
export { shouldUsePhonicsMode };
