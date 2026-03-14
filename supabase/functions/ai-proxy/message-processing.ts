import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

import { RequestSchema } from './schemas.ts';
import type { JsonRecord } from './types.ts';

export function stripBase64DataUri(value: string): string {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
  return match ? match[1] : trimmed;
}

export function normalizeVisionMediaType(raw: string): {
  mediaType: string;
  blockType: 'image' | 'document';
} {
  const lower = String(raw || '').trim().toLowerCase();
  if (lower === 'application/pdf') {
    return { mediaType: 'application/pdf', blockType: 'document' };
  }
  if (lower === 'image/jpg') {
    return { mediaType: 'image/jpeg', blockType: 'image' };
  }
  if (lower === 'image/jpeg' || lower === 'image/png' || lower === 'image/gif' || lower === 'image/webp') {
    return { mediaType: lower, blockType: 'image' };
  }
  if (lower.startsWith('image/')) {
    // Normalize uncommon/unsupported image formats (e.g. HEIC) to a supported hint.
    return { mediaType: 'image/jpeg', blockType: 'image' };
  }
  return { mediaType: 'image/jpeg', blockType: 'image' };
}

export function hasMessageContent(content: unknown): boolean {
  if (typeof content === 'string') {
    return content.trim().length > 0;
  }
  if (Array.isArray(content)) {
    return content.some((part) => {
      if (!part || typeof part !== 'object') return false;
      const block = part as JsonRecord;
      if (typeof block.text === 'string' && block.text.trim().length > 0) return true;
      if (block.type === 'image' || block.type === 'document') return true;
      const source = block.source as JsonRecord | undefined;
      if (source && typeof source.data === 'string' && source.data.trim().length > 0) return true;
      return false;
    });
  }
  if (content && typeof content === 'object') {
    return Object.keys(content as Record<string, unknown>).length > 0;
  }
  return false;
}

export function normalizeConversationRole(value: unknown): 'system' | 'user' | 'assistant' | null {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'system' || role === 'user' || role === 'assistant') return role;
  if (role === 'model') return 'assistant';
  return null;
}

export function hasActionableUserMessages(messages: Array<JsonRecord>): boolean {
  return messages.some((msg) => {
    const role = normalizeConversationRole((msg as JsonRecord).role);
    if (role !== 'user') return false;
    return hasMessageContent((msg as JsonRecord).content);
  });
}

export function buildProviderConversationMessages(messages: Array<JsonRecord>): Array<JsonRecord> {
  const normalized: Array<JsonRecord> = [];
  for (const raw of messages) {
    const role = normalizeConversationRole(raw?.role);
    if (!role || role === 'system') continue;
    if (!hasMessageContent(raw?.content)) continue;
    normalized.push({ ...raw, role });
  }
  return normalized;
}

export function hasQuotaOrRateLimitSignal(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('insufficient_quota') ||
    normalized.includes('rate limit') ||
    normalized.includes('workspace api usage limits') ||
    normalized.includes('api usage limits') ||
    normalized.includes('will regain access on') ||
    normalized.includes(' 429 ') ||
    normalized.includes('status":429')
  );
}

export function isNonRetryableInvalidRequest(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('invalid_request_no_user_message') ||
    normalized.includes('messages: at least one message is required') ||
    normalized.includes('please send a question or attach a file')
  );
}

export function shouldAttemptCrossProviderFallback(message: string): boolean {
  return !isNonRetryableInvalidRequest(message);
}

export function mapProviderErrorStatus(message: string): number {
  const normalized = String(message || '').toLowerCase();
  if (isNonRetryableInvalidRequest(message)) return 400;
  if (hasQuotaOrRateLimitSignal(message)) {
    return 429;
  }
  if (
    normalized.includes('provider_not_configured') ||
    normalized.includes('api_key') ||
    normalized.includes('not configured') ||
    normalized.includes('missing')
  ) {
    return 503;
  }
  const statusMatch = message.match(/\b(\d{3})\b/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    if (status >= 400 && status <= 599) return status;
  }
  return 502;
}

export function normalizeMessages(payload: z.infer<typeof RequestSchema>['payload'], systemPrompt: string) {
  const baseMessages = payload.conversationHistory || payload.messages;
  const messages: Array<JsonRecord> = [];

  messages.push({ role: 'system', content: systemPrompt });

  if (Array.isArray(baseMessages) && baseMessages.length > 0) {
    for (const rawMsg of baseMessages) {
      if (!rawMsg || typeof rawMsg !== 'object') continue;
      const msg = rawMsg as JsonRecord;
      const role = normalizeConversationRole(msg.role);
      if (!role || role === 'system') continue;
      if (!hasMessageContent(msg.content)) continue;
      messages.push({ ...msg, role });
    }
  }

  const promptText = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (promptText.length > 0) {
    const isDuplicatePrompt = messages.some((msg) =>
      String(msg.role || '').toLowerCase() === 'user' &&
      typeof msg.content === 'string' &&
      msg.content.trim() === promptText
    );
    if (!isDuplicatePrompt) {
      messages.push({ role: 'user', content: promptText });
    }
  }

  const images = Array.isArray(payload.images) ? payload.images : [];
  if (images.length > 0) {
    const imageBlocks = images.map((img) => {
      const normalized = normalizeVisionMediaType(String(img.media_type || ''));
      const blockType = normalized.blockType;
      return {
        type: blockType,
        source: {
          type: 'base64',
          media_type: normalized.mediaType,
          data: stripBase64DataUri(String(img.data || '')),
        },
      };
    });
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const existing = messages[i].content;
        if (Array.isArray(existing)) {
          messages[i] = { ...messages[i], content: [...existing, ...imageBlocks] };
        } else {
          messages[i] = {
            ...messages[i],
            content: [
              { type: 'text', text: typeof existing === 'string' ? existing : '' },
              ...imageBlocks,
            ],
          };
        }
        return messages;
      }
    }
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: 'Attached file for review.' }, ...imageBlocks],
    });
  }

  return messages;
}

export function mapOpenAIContent(content: unknown) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');
  const mapped = content.map((part: any) => {
    if (part?.type === 'text') {
      return { type: 'text', text: part.text || '' };
    }
    if (part?.type === 'image' && part?.source?.data) {
      const mediaType = part.source.media_type || 'image/jpeg';
      const url = `data:${mediaType};base64,${part.source.data}`;
      return { type: 'image_url', image_url: { url } };
    }
    if (part?.type === 'document' && part?.source?.data) {
      const mediaType = part.source.media_type || 'application/octet-stream';
      return { type: 'text', text: `[Attached ${mediaType} document for OCR review]` };
    }
    if (part?.type === 'tool_use' || part?.type === 'tool_result') {
      // Never surface raw tool payload JSON in user-visible assistant text.
      return { type: 'text', text: '' };
    }
    if (typeof part?.text === 'string') {
      return { type: 'text', text: part.text };
    }
    return { type: 'text', text: '' };
  });
  return mapped;
}

export function normalizeOpenAIMessages(messages: Array<JsonRecord>) {
  return messages.map((msg) => {
    const content = mapOpenAIContent((msg as any).content);
    return { ...msg, content };
  });
}

export function chunkText(text: string, maxLen = 120): string[] {
  const safe = (text || '').trim();
  if (!safe) return [];
  const words = safe.split(/\s+/);
  const chunks: string[] = [];
  let buffer = '';
  for (const word of words) {
    const next = buffer ? `${buffer} ${word}` : word;
    if (next.length > maxLen && buffer) {
      chunks.push(buffer);
      buffer = word;
    } else {
      buffer = next;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

export function summarizeServerToolResult(toolName: string, output: JsonRecord): string | null {
  const success = Boolean(output?.success);
  if (!success) return null;

  if (toolName === 'web_search') {
    const results = Array.isArray(output?.results) ? output.results : [];
    const top = results
      .slice(0, 3)
      .map((entry) => String((entry as JsonRecord)?.title || '').trim())
      .filter(Boolean);
    if (top.length > 0) {
      return `\n\nI checked the web and found: ${top.join(' | ')}.`;
    }
    const count = Number(output?.count || 0);
    if (Number.isFinite(count) && count > 0) {
      return `\n\nI checked the web and found ${count} relevant source${count === 1 ? '' : 's'}.`;
    }
    return null;
  }

  if (toolName === 'search_caps_curriculum' || toolName === 'caps_curriculum_query' || toolName === 'get_caps_documents') {
    const documents = Array.isArray(output?.documents) ? output.documents : [];
    const topDocs = documents
      .slice(0, 3)
      .map((entry) => String((entry as JsonRecord)?.title || '').trim())
      .filter(Boolean);
    if (topDocs.length > 0) {
      return `\n\nI found CAPS documents: ${topDocs.join(' | ')}.`;
    }
    const count = Number(output?.count || 0);
    if (Number.isFinite(count) && count > 0) {
      return `\n\nI found ${count} CAPS document${count === 1 ? '' : 's'} relevant to this request.`;
    }
    return null;
  }

  if (toolName === 'get_caps_subjects') {
    const subjects = Array.isArray(output?.subjects) ? output.subjects : [];
    const topSubjects = subjects
      .slice(0, 6)
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (topSubjects.length > 0) {
      return `\n\nAvailable CAPS subjects include: ${topSubjects.join(', ')}.`;
    }
  }

  return null;
}

export function buildSseStream(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = chunkText(content, 120);
  return new ReadableStream({
    async start(controller) {
      if (chunks.length === 0) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        return;
      }
      for (const chunk of chunks) {
        const payload = {
          type: 'content_block_delta',
          delta: { text: `${chunk} ` },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}
