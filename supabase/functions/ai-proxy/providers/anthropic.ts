import { getAnthropicApiKey } from '../auth.ts';
import { DEFAULT_MAX_TOKENS, DEFAULT_SYSTEM_PROMPT, SERVER_TOOL_NAMES } from '../config.ts';
import { resolveTemperature } from '../config.ts';
import {
  DEFAULT_ANTHROPIC_ALLOWED_MODELS,
  normalizeAnthropicAllowedModelsWithTierDefaults,
  normalizeRequestedModel,
  parseAllowedModels,
  pickAllowedModel,
} from '../models.ts';
import {
  buildProviderConversationMessages,
  hasActionableUserMessages,
} from '../message-processing.ts';
import { buildAnthropicTools } from '../tools/builders.ts';
import { webSearchTool } from '../tools/web-search.ts';
import { searchCapsCurriculumTool, getCapsDocumentsTool, getCapsSubjectsTool } from '../tools/caps.ts';
import {
  WebSearchArgsSchema,
  CAPSCurriculumArgsSchema,
  GetCapsDocumentsArgsSchema,
  GetCapsSubjectsArgsSchema,
} from '../schemas.ts';
import { RETRYABLE_PROVIDER_STATUSES } from '../prompts/system.ts';
import type { JsonRecord, ProviderResponse, ToolResult } from '../types.ts';

export async function callAnthropic(
  supabase: any,
  messages: Array<JsonRecord>,
  enableTools: boolean,
  requestedModel?: string | null,
  allowedOverride?: string[],
  requestMetadata: Record<string, unknown> = {},
  maxTokens: number = DEFAULT_MAX_TOKENS,
  clientTools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>,
): Promise<ProviderResponse> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  }
  const allowed = normalizeAnthropicAllowedModelsWithTierDefaults(
    allowedOverride || parseAllowedModels('ANTHROPIC_ALLOWED_MODELS', DEFAULT_ANTHROPIC_ALLOWED_MODELS)
  );
  const fallbackModel = normalizeRequestedModel(DEFAULT_ANTHROPIC_ALLOWED_MODELS[0]) || DEFAULT_ANTHROPIC_ALLOWED_MODELS[0];
  const normalizedRequestedModel = normalizeRequestedModel(requestedModel || Deno.env.get('ANTHROPIC_MODEL'));
  const selection = pickAllowedModel(normalizedRequestedModel, allowed, fallbackModel);
  if (selection.usedFallback) {
    console.warn('[ai-proxy] Anthropic model fallback:', selection.reason);
  }
  const preferredModel = selection.model;
  const tools = buildAnthropicTools(enableTools, clientTools);
  const systemPrompt = messages.find((m) => m.role === 'system')?.content || DEFAULT_SYSTEM_PROMPT;
  const providerMessages = buildProviderConversationMessages(messages);
  if (!hasActionableUserMessages(providerMessages)) {
    throw new Error('invalid_request_no_user_message: Please send a question or attach a file before asking Dash.');
  }

  const callAnthropicOnce = async (model: string) => {
    const body: JsonRecord = {
      model,
      max_tokens: maxTokens,
      temperature: resolveTemperature(requestMetadata),
      messages: providerMessages,
      system: systemPrompt,
    };

    if (tools) body.tools = tools;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, status: response.status, errText, data: null as JsonRecord | null };
    }

    const data = (await response.json()) as JsonRecord;
    return { ok: true, status: response.status, errText: null as string | null, data };
  };

  const isModelNotFound = (errText: string | null): boolean => {
    if (!errText) return false;
    try {
      const parsed = JSON.parse(errText) as JsonRecord;
      const errType = (parsed?.error as JsonRecord | undefined)?.type;
      return errType === 'not_found_error';
    } catch {
      return false;
    }
  };

  const callAnthropicWithFallbacks = async (models: string[]) => {
    let lastError: { ok: false; status: number; errText: string | null; data: JsonRecord | null } | null = null;
    for (const model of models) {
      let res = await callAnthropicOnce(model);
      if (!res.ok && RETRYABLE_PROVIDER_STATUSES.has(res.status)) {
        // Brief retry for transient errors
        await new Promise((resolve) => setTimeout(resolve, 500));
        res = await callAnthropicOnce(model);
      }
      if (res.ok) {
        return { response: res, model };
      }
      if (isModelNotFound(res.errText)) {
        console.warn(`[ai-proxy] Anthropic model not found: ${model}. Trying next...`);
        lastError = res;
        continue;
      }
      if (RETRYABLE_PROVIDER_STATUSES.has(res.status)) {
        lastError = res;
        continue;
      }
      return { response: res, model };
    }
    return { response: lastError as any, model: models[0] };
  };

  const candidates = [preferredModel, ...allowed.filter((m) => m !== preferredModel)];
  const initial = await callAnthropicWithFallbacks(candidates);
  let response = initial.response;
  let modelUsed = initial.model;

  if (!response.ok || !response.data) {
    throw new Error(`Anthropic error: ${response.status} ${response.errText || ''}`);
  }

  const result = response.data as JsonRecord;
  const contentBlocks = Array.isArray(result.content) ? result.content : [];
  const toolResults: ToolResult[] = [];

  let contentText = '';
  const toolUses: Array<JsonRecord> = [];

  for (const block of contentBlocks) {
    const entry = block as JsonRecord;
    if (entry.type === 'text' && typeof entry.text === 'string') {
      contentText += entry.text;
    }
    if (entry.type === 'tool_use') {
      toolUses.push(entry);
    }
  }

  if (enableTools && toolUses.length > 0) {
    // Separate server-side tools from client-side tools.
    // Server tools are executed here; everything else becomes pending_tool_calls.
    const serverToolUses = toolUses.filter((tu) => SERVER_TOOL_NAMES.has(String(tu.name || '')));
    const clientToolUses = toolUses.filter((tu) => !SERVER_TOOL_NAMES.has(String(tu.name || '')));

    for (const toolUse of serverToolUses) {
      const toolName = String(toolUse.name || '');
      const rawInput = (toolUse.input || {}) as JsonRecord;

      let success = true;
      let inputForLog: JsonRecord = rawInput;
      let output: JsonRecord;

      if (toolName === 'web_search') {
        const parsed = WebSearchArgsSchema.safeParse(rawInput);
        if (parsed.success) {
          inputForLog = parsed.data;
          output = await webSearchTool(parsed.data);
        } else {
          success = false;
          output = { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        }
      } else if (toolName === 'search_caps_curriculum' || toolName === 'caps_curriculum_query') {
        const parsed = CAPSCurriculumArgsSchema.safeParse(rawInput);
        if (parsed.success) {
          inputForLog = parsed.data as any;
          output = await searchCapsCurriculumTool(supabase, parsed.data);
        } else {
          success = false;
          output = { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        }
      } else if (toolName === 'get_caps_documents') {
        const parsed = GetCapsDocumentsArgsSchema.safeParse(rawInput);
        if (parsed.success) {
          inputForLog = parsed.data as any;
          output = await getCapsDocumentsTool(supabase, parsed.data);
        } else {
          success = false;
          output = { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        }
      } else if (toolName === 'get_caps_subjects') {
        const parsed = GetCapsSubjectsArgsSchema.safeParse(rawInput);
        if (parsed.success) {
          inputForLog = parsed.data as any;
          output = await getCapsSubjectsTool(supabase, parsed.data);
        } else {
          success = false;
          output = { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        }
      } else {
        success = false;
        output = { success: false, error: 'tool_not_supported', tool: toolName };
      }

      toolResults.push({ name: toolName, input: inputForLog, output, success });

      messages.push({
        role: 'assistant',
        content: [
          { type: 'tool_use', id: toolUse.id, name: toolName, input: inputForLog },
        ],
      });

      messages.push({
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(output) },
        ],
      });
    }

    if (toolResults.length > 0) {
      const followUpCandidates = [modelUsed, ...allowed.filter((m) => m !== modelUsed)];
      const followUpResult = await callAnthropicWithFallbacks(followUpCandidates);
      const followUpResponse = followUpResult.response;
      const followUpModel = followUpResult.model;

      if (!followUpResponse.ok || !followUpResponse.data) {
        throw new Error(`Anthropic tool follow-up error: ${followUpResponse.status} ${followUpResponse.errText || ''}`);
      }

      const followUpData = followUpResponse.data as JsonRecord;
      const followUpBlocks = Array.isArray(followUpData.content) ? followUpData.content : [];
      let followUpText = '';
      for (const block of followUpBlocks) {
        const entry = block as JsonRecord;
        if (entry.type === 'text' && typeof entry.text === 'string') {
          followUpText += entry.text;
        }
      }

      const pendingCalls = clientToolUses.length > 0
        ? clientToolUses.map((tu) => ({
            id: tu.id as string,
            name: tu.name as string,
            input: (tu.input || {}) as Record<string, unknown>,
          }))
        : undefined;

      return {
        content: followUpText,
        usage: {
          tokens_in: typeof followUpData.usage === 'object' && followUpData.usage
            ? (followUpData.usage as JsonRecord).input_tokens as number | undefined
            : undefined,
          tokens_out: typeof followUpData.usage === 'object' && followUpData.usage
            ? (followUpData.usage as JsonRecord).output_tokens as number | undefined
            : undefined,
        },
        model: followUpModel,
        tool_results: toolResults,
        pending_tool_calls: pendingCalls,
      };
    }

    // If there are client-side tool calls that we can't execute server-side,
    // return them as pending_tool_calls for the client to handle
    if (clientToolUses.length > 0) {
      const pendingCalls = clientToolUses.map(tu => ({
        id: tu.id as string,
        name: tu.name as string,
        input: (tu.input || {}) as Record<string, unknown>,
      }));
      return {
        content: contentText,
        usage: {
          tokens_in: typeof result.usage === 'object' && result.usage
            ? (result.usage as JsonRecord).input_tokens as number | undefined
            : undefined,
          tokens_out: typeof result.usage === 'object' && result.usage
            ? (result.usage as JsonRecord).output_tokens as number | undefined
            : undefined,
        },
        model: modelUsed,
        tool_results: toolResults,
        pending_tool_calls: pendingCalls,
      };
    }
  }

  return {
    content: contentText,
    usage: {
      tokens_in: typeof result.usage === 'object' && result.usage
        ? (result.usage as JsonRecord).input_tokens as number | undefined
        : undefined,
      tokens_out: typeof result.usage === 'object' && result.usage
        ? (result.usage as JsonRecord).output_tokens as number | undefined
        : undefined,
    },
    model: modelUsed,
    tool_results: toolResults,
  };
}
