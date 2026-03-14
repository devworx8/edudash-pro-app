import { getAnthropicApiKey } from '../auth.ts';
import { DEFAULT_MAX_TOKENS, SERVER_TOOL_NAMES } from '../config.ts';
import { resolveTemperature } from '../config.ts';
import { DEFAULT_SYSTEM_PROMPT } from '../config.ts';
import {
  DEFAULT_ANTHROPIC_ALLOWED_MODELS,
  normalizeAnthropicAllowedModelsWithTierDefaults,
  normalizeRequestedModel,
  parseAllowedModels,
  pickAllowedModel,
  normalizeAnthropicAllowedModels,
  DEFAULT_SUPERADMIN_ALLOWED_MODELS,
} from '../models.ts';
import {
  buildProviderConversationMessages,
  hasActionableUserMessages,
  summarizeServerToolResult,
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
import type { JsonRecord, ProviderResponse } from '../types.ts';

/**
 * Call Anthropic with native SSE streaming.
 * Returns a TransformStream that pipes Anthropic's SSE events to the client
 * in a normalised format, and also collects usage/content for post-call logging.
 */
export function callAnthropicStreaming(
  supabase: any,
  messages: Array<JsonRecord>,
  requestedModel: string | null | undefined,
  allowedOverride: string[] | undefined,
  isSuperAdmin: boolean,
  requestMetadata: Record<string, unknown>,
  maxTokens: number = DEFAULT_MAX_TOKENS,
  enableTools: boolean = false,
  clientTools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>,
): { stream: ReadableStream<Uint8Array>; meta: Promise<ProviderResponse> } {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');

  const allowed = normalizeAnthropicAllowedModelsWithTierDefaults(
    allowedOverride || parseAllowedModels('ANTHROPIC_ALLOWED_MODELS', DEFAULT_ANTHROPIC_ALLOWED_MODELS)
  );
  const fallbackModel = normalizeRequestedModel(DEFAULT_ANTHROPIC_ALLOWED_MODELS[0]) || DEFAULT_ANTHROPIC_ALLOWED_MODELS[0];
  const superAdminAllowed = normalizeAnthropicAllowedModels(
    parseAllowedModels('SUPERADMIN_ANTHROPIC_MODELS', DEFAULT_SUPERADMIN_ALLOWED_MODELS)
  );
  const selectionAllowed = isSuperAdmin ? superAdminAllowed : allowed;
  const normalizedRequestedModel = normalizeRequestedModel(requestedModel || Deno.env.get('ANTHROPIC_MODEL'));
  const selection = pickAllowedModel(
    normalizedRequestedModel,
    selectionAllowed,
    selectionAllowed[0] || fallbackModel
  );
  if (selection.usedFallback) console.warn('[ai-proxy] Anthropic streaming model fallback:', selection.reason);
  const model = selection.model;

  const systemPrompt = messages.find((m) => m.role === 'system')?.content || DEFAULT_SYSTEM_PROMPT;
  const providerMessages = buildProviderConversationMessages(messages);
  if (!hasActionableUserMessages(providerMessages)) {
    throw new Error('invalid_request_no_user_message: Please send a question or attach a file before asking Dash.');
  }
  const encoder = new TextEncoder();

  // Mutable collectors for post-call logging (resolved via metaPromise)
  let fullContent = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let modelUsed = model;
  const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
  let currentToolInputJson = '';
  let resolveMetaPromise: (v: ProviderResponse) => void;
  let rejectMetaPromise: (e: Error) => void;
  const metaPromise = new Promise<ProviderResponse>((res, rej) => {
    resolveMetaPromise = res;
    rejectMetaPromise = rej;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const callAnthropicStream = async (modelName: string, withTools: boolean) =>
          await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: modelName,
              max_tokens: maxTokens,
              temperature: resolveTemperature(requestMetadata),
              stream: true,
              messages: providerMessages,
              system: systemPrompt,
              ...(withTools ? { tools: buildAnthropicTools(true, clientTools) } : {}),
            }),
          });

        const isModelNotFoundError = (status: number, errText: string): boolean => {
          if (status !== 404) return false;
          try {
            const parsed = JSON.parse(errText) as JsonRecord;
            const errorObj = parsed?.error as JsonRecord | undefined;
            const errType = String(errorObj?.type || '').toLowerCase();
            const errMsg = String(errorObj?.message || '').toLowerCase();
            return errType === 'not_found_error' || errMsg.includes('model:');
          } catch {
            return errText.toLowerCase().includes('model:');
          }
        };

        const modelCandidates = [model, ...selectionAllowed.filter((m) => m !== model)];
        let usedToolsForRequest = enableTools;
        let responseModel = model;
        let response: Response | null = null;
        let failureErrText = '';

        for (const candidateModel of modelCandidates) {
          responseModel = candidateModel;
          usedToolsForRequest = enableTools;
          let candidatePrimaryError = '';
          let candidateResponse = await callAnthropicStream(candidateModel, usedToolsForRequest);

          if ((!candidateResponse.ok || !candidateResponse.body) && candidateResponse.status === 400 && usedToolsForRequest) {
            candidatePrimaryError = await candidateResponse.text();
            console.warn('[ai-proxy] Anthropic streaming 400 with tools enabled; retrying without tools', {
              model: candidateModel,
              error: candidatePrimaryError.slice(0, 320),
            });
            usedToolsForRequest = false;
            candidateResponse = await callAnthropicStream(candidateModel, false);
          }

          if (candidateResponse.ok && candidateResponse.body) {
            response = candidateResponse;
            failureErrText = '';
            break;
          }

          const candidateErrText = candidatePrimaryError || await candidateResponse.text();
          if (isModelNotFoundError(candidateResponse.status, candidateErrText)) {
            console.warn('[ai-proxy] Anthropic streaming model not found, trying next allowed model', {
              model: candidateModel,
            });
            failureErrText = candidateErrText;
            continue;
          }

          response = candidateResponse;
          failureErrText = candidateErrText;
          break;
        }

        if (!response || !response.ok || !response.body) {
          const status = response?.status || 500;
          const errText = failureErrText || 'Anthropic streaming request failed.';
          const errLower = errText.toLowerCase();
          const hasVisualAttachmentInput = messages.some((msg) => {
            if (!Array.isArray(msg.content)) return false;
            return msg.content.some((part) => {
              const type = String((part as JsonRecord)?.type || '').toLowerCase();
              const source = (part as JsonRecord)?.source as JsonRecord | undefined;
              const mediaType = String(source?.media_type || '').toLowerCase();
              return (
                type === 'image' ||
                type === 'image_url' ||
                type === 'document' ||
                mediaType.startsWith('image/') ||
                mediaType === 'application/pdf'
              );
            });
          });
          const attachmentErrorSignal = /image|jpeg|jpg|png|webp|gif|pdf|base64|mime|media[_\s-]?type|unsupported|too large|too_big|payload|exceed|size|bytes/i;
          const isLikelyAttachmentRelated =
            status === 400 &&
            hasVisualAttachmentInput &&
            attachmentErrorSignal.test(errLower);
          const userMessage = status === 529
              ? 'The AI service is temporarily overloaded. Please try again in a moment.'
              : status === 401 || status === 403
                ? 'AI service authentication error. Please contact support.'
                : status === 400 && isLikelyAttachmentRelated
                ? 'That file may be too large or in an unsupported format. Try a JPG/PNG image under 12MB, or retake with lower resolution.'
                : `Sorry, the AI service returned an error (${status}). Please try again.`;
          console.warn('[ai-proxy] Anthropic streaming failed', {
            status,
            model: responseModel,
            usedToolsForRequest,
            hasVisualAttachmentInput,
            error: errText.slice(0, 320),
          });
          const errEvent = { type: 'error', error: errText };
          const contentEvent = { type: 'content_block_delta', delta: { text: userMessage } };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errEvent)}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentEvent)}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          rejectMetaPromise!(new Error(`Anthropic streaming error: ${status} ${errText}`));
          return;
        }

        modelUsed = responseModel;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue; // Skip comments & empty lines
            if (!trimmed.startsWith('data: ')) continue;

            const jsonStr = trimmed.slice(6);
            if (jsonStr === '[DONE]') continue;

            try {
              const event = JSON.parse(jsonStr) as JsonRecord;
              const eventType = event.type as string;

              if (eventType === 'message_start') {
                const msg = event.message as JsonRecord | undefined;
                modelUsed = (msg?.model as string) || model;
                const usage = msg?.usage as JsonRecord | undefined;
                tokensIn = (usage?.input_tokens as number) || 0;
              } else if (eventType === 'content_block_start') {
                // Track tool_use content blocks
                const contentBlock = event.content_block as JsonRecord | undefined;
                if (contentBlock?.type === 'tool_use') {
                  pendingToolCalls.push({
                    id: contentBlock.id as string,
                    name: contentBlock.name as string,
                    input: {},
                  });
                  currentToolInputJson = '';
                }
              } else if (eventType === 'content_block_delta') {
                const delta = event.delta as JsonRecord | undefined;
                const deltaType = delta?.type as string | undefined;
                if (deltaType === 'input_json_delta') {
                  // Accumulate tool input JSON fragments
                  currentToolInputJson += (delta?.partial_json as string) || '';
                } else {
                  const text = (delta?.text as string) || '';
                  if (text) {
                    fullContent += text;
                    // Forward to client
                    const clientEvent = {
                      type: 'content_block_delta',
                      delta: { text },
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(clientEvent)}\n\n`));
                  }
                }
              } else if (eventType === 'content_block_stop') {
                // Finalize tool input when block ends
                if (pendingToolCalls.length > 0 && currentToolInputJson) {
                  const lastTool = pendingToolCalls[pendingToolCalls.length - 1];
                  try {
                    lastTool.input = JSON.parse(currentToolInputJson);
                  } catch {
                    lastTool.input = { raw: currentToolInputJson };
                  }
                  currentToolInputJson = '';
                }
              } else if (eventType === 'message_delta') {
                const usage = (event as JsonRecord).usage as JsonRecord | undefined;
                tokensOut = (usage?.output_tokens as number) || 0;
              }
              // Skip ping events
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        // If Claude responded with tool_use blocks, send them as pending_tool_calls for client execution
        if (pendingToolCalls.length > 0) {
          // Separate server-side tools from client-side tools
          const serverTools = pendingToolCalls.filter((t) => SERVER_TOOL_NAMES.has(String(t.name || '')));
          const clientPendingTools = pendingToolCalls.filter((t) => !SERVER_TOOL_NAMES.has(String(t.name || '')));

          // Execute server-side tools post-hoc (streaming mode)
          for (const toolCall of serverTools) {
            try {
              const toolName = String(toolCall.name || '');
              const rawInput = (toolCall.input || {}) as JsonRecord;
              let output: JsonRecord;

              if (toolName === 'web_search') {
                const parsed = WebSearchArgsSchema.safeParse(rawInput);
                output = parsed.success
                  ? await webSearchTool(parsed.data)
                  : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
              } else if (toolName === 'search_caps_curriculum' || toolName === 'caps_curriculum_query') {
                const parsed = CAPSCurriculumArgsSchema.safeParse(rawInput);
                output = parsed.success
                  ? await searchCapsCurriculumTool(supabase, parsed.data)
                  : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
              } else if (toolName === 'get_caps_documents') {
                const parsed = GetCapsDocumentsArgsSchema.safeParse(rawInput);
                output = parsed.success
                  ? await getCapsDocumentsTool(supabase, parsed.data)
                  : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
              } else if (toolName === 'get_caps_subjects') {
                const parsed = GetCapsSubjectsArgsSchema.safeParse(rawInput);
                output = parsed.success
                  ? await getCapsSubjectsTool(supabase, parsed.data)
                  : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
              } else {
                output = { success: false, error: 'tool_not_supported', tool: toolName };
              }

              // Keep tool execution server-side only; never stream raw JSON results
              // into the visible assistant message.
              console.log('[ai-proxy] server_tool_executed', {
                tool: toolName,
                success: Boolean((output as JsonRecord)?.success),
              });
              const summary = summarizeServerToolResult(toolName, output);
              if (summary) {
                fullContent += summary;
                const summaryEvent = { type: 'content_block_delta', delta: { text: summary } };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(summaryEvent)}\n\n`));
              } else if (toolName === 'web_search') {
                const fallback = '\n\nI tried to search the web but couldn\'t find results right now. Let me answer based on what I know.';
                fullContent += fallback;
                const fallbackEvent = { type: 'content_block_delta', delta: { text: fallback } };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(fallbackEvent)}\n\n`));
              }
            } catch {
              // Tool execution failed, continue
            }
          }

          // Send client-side pending tool calls
          if (clientPendingTools.length > 0) {
            const toolCallsEvent = { type: 'pending_tool_calls', tool_calls: clientPendingTools };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolCallsEvent)}\n\n`));
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        resolveMetaPromise!({
          content: fullContent,
          model: modelUsed,
          usage: { tokens_in: tokensIn, tokens_out: tokensOut },
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        try {
          const userMessage = 'Sorry, something went wrong while processing your request. Please try again.';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: userMessage } })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch { /* controller already closed */ }
        rejectMetaPromise!(err instanceof Error ? err : new Error(errMsg));
      }
    },
  });

  return { stream, meta: metaPromise };
}
