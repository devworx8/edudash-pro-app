import { getOpenAIApiKey } from '../auth.ts';
import { DEFAULT_MAX_TOKENS, DEFAULT_OPENAI_ALLOWED_MODELS, SERVER_TOOL_NAMES } from '../config.ts';
import { resolveTemperature } from '../config.ts';
import { parseAllowedModels, pickAllowedModel } from '../models.ts';
import { normalizeOpenAIMessages } from '../message-processing.ts';
import { buildOpenAITools } from '../tools/builders.ts';
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

export async function callOpenAI(
  supabase: any,
  messages: Array<JsonRecord>,
  enableTools: boolean,
  requestedModel?: string | null,
  requestMetadata: Record<string, unknown> = {},
  maxTokens: number = DEFAULT_MAX_TOKENS,
  clientTools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>,
): Promise<ProviderResponse> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  const allowed = parseAllowedModels('OPENAI_ALLOWED_MODELS', DEFAULT_OPENAI_ALLOWED_MODELS);
  const fallbackModel = DEFAULT_OPENAI_ALLOWED_MODELS[0];
  const selection = pickAllowedModel(requestedModel || Deno.env.get('OPENAI_MODEL'), allowed, fallbackModel);
  if (selection.usedFallback) {
    console.warn('[ai-proxy] OpenAI model fallback:', selection.reason);
  }
  const model = selection.model;
  const tools = buildOpenAITools(enableTools, clientTools);

  const body: JsonRecord = {
    model,
    messages: normalizeOpenAIMessages(messages),
    temperature: resolveTemperature(requestMetadata),
    max_tokens: maxTokens,
  };

  if (tools) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  let response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (RETRYABLE_PROVIDER_STATUSES.has(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const retryText = await response.text();
        throw new Error(`OpenAI error: ${response.status} ${retryText}`);
      }
    } else {
      throw new Error(`OpenAI error: ${response.status} ${errText}`);
    }
  }

  const result = (await response.json()) as JsonRecord;
  const choice = (result.choices as Array<JsonRecord> | undefined)?.[0];
  const message = choice?.message as JsonRecord | undefined;
  const content = typeof message?.content === 'string' ? message.content : '';

  const toolCalls = Array.isArray(message?.tool_calls) ? message?.tool_calls : [];
  const toolResults: ToolResult[] = [];

  if (enableTools && toolCalls.length > 0) {
    let executedServerTool = false;
    const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    for (const call of toolCalls) {
      const toolCall = call as JsonRecord;
      const functionCall = toolCall.function as JsonRecord | undefined;
      const toolName = typeof functionCall?.name === 'string' ? functionCall.name : '';
      if (!toolName) continue;

      let parsedArgs: JsonRecord = {};
      if (typeof functionCall.arguments === 'string') {
        try {
          parsedArgs = JSON.parse(functionCall.arguments) as JsonRecord;
        } catch {
          parsedArgs = {};
        }
      } else if (functionCall.arguments && typeof functionCall.arguments === 'object') {
        parsedArgs = functionCall.arguments as JsonRecord;
      }

      const args = parsedArgs;
      const toolCallId = String(toolCall.id || '');

      if (!SERVER_TOOL_NAMES.has(toolName)) {
        pendingToolCalls.push({
          id: toolCallId,
          name: toolName,
          input: args as Record<string, unknown>,
        });
        continue;
      }

      executedServerTool = true;

      if (toolName === 'web_search') {
        const parsed = WebSearchArgsSchema.safeParse(args);
        const output = parsed.success
          ? await webSearchTool(parsed.data)
          : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        toolResults.push({ name: 'web_search', input: parsed.success ? parsed.data : args, output, success: parsed.success });
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(output) });
        continue;
      }

      if (toolName === 'search_caps_curriculum' || toolName === 'caps_curriculum_query') {
        const parsed = CAPSCurriculumArgsSchema.safeParse(args);
        const output = parsed.success
          ? await searchCapsCurriculumTool(supabase, parsed.data)
          : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        toolResults.push({ name: toolName, input: parsed.success ? parsed.data : args, output, success: parsed.success });
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(output) });
        continue;
      }

      if (toolName === 'get_caps_documents') {
        const parsed = GetCapsDocumentsArgsSchema.safeParse(args);
        const output = parsed.success
          ? await getCapsDocumentsTool(supabase, parsed.data)
          : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        toolResults.push({ name: toolName, input: parsed.success ? parsed.data : args, output, success: parsed.success });
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(output) });
        continue;
      }

      if (toolName === 'get_caps_subjects') {
        const parsed = GetCapsSubjectsArgsSchema.safeParse(args);
        const output = parsed.success
          ? await getCapsSubjectsTool(supabase, parsed.data)
          : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        toolResults.push({ name: toolName, input: parsed.success ? parsed.data : args, output, success: parsed.success });
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(output) });
        continue;
      }
    }

    if (executedServerTool) {
      const followUpBody: JsonRecord = {
        model,
        messages: normalizeOpenAIMessages(messages),
        temperature: resolveTemperature(requestMetadata),
        max_tokens: maxTokens,
      };

      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(followUpBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI tool follow-up error: ${response.status} ${errText}`);
      }

      const followUpResult = (await response.json()) as JsonRecord;
      const followUpChoice = (followUpResult.choices as Array<JsonRecord> | undefined)?.[0];
      const followUpMessage = followUpChoice?.message as JsonRecord | undefined;
      const followUpContent = typeof followUpMessage?.content === 'string' ? followUpMessage.content : '';

      return {
        content: followUpContent,
        usage: {
          tokens_in: typeof followUpResult.usage === 'object' && followUpResult.usage
            ? (followUpResult.usage as JsonRecord).prompt_tokens as number | undefined
            : undefined,
          tokens_out: typeof followUpResult.usage === 'object' && followUpResult.usage
            ? (followUpResult.usage as JsonRecord).completion_tokens as number | undefined
            : undefined,
        },
        model,
        tool_results: toolResults,
        pending_tool_calls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
      };
    }

    if (pendingToolCalls.length > 0) {
      return {
        content,
        usage: {
          tokens_in: typeof result.usage === 'object' && result.usage
            ? (result.usage as JsonRecord).prompt_tokens as number | undefined
            : undefined,
          tokens_out: typeof result.usage === 'object' && result.usage
            ? (result.usage as JsonRecord).completion_tokens as number | undefined
            : undefined,
        },
        model,
        tool_results: toolResults,
        pending_tool_calls: pendingToolCalls,
      };
    }
  }

  return {
    content,
    usage: {
      tokens_in: typeof result.usage === 'object' && result.usage
        ? (result.usage as JsonRecord).prompt_tokens as number | undefined
        : undefined,
      tokens_out: typeof result.usage === 'object' && result.usage
        ? (result.usage as JsonRecord).completion_tokens as number | undefined
        : undefined,
    },
    model,
    tool_results: toolResults,
  };
}
