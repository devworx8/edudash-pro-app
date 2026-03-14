import type { CapabilityTier } from '@/lib/tiers';
import type { ConversationContextMessage, DashMessage } from '@/services/dash-ai/types';

export interface ConversationContextOptions {
  maxMessages?: number;
  maxTokens?: number;
}

const DEFAULT_MAX_TOKENS = 8000;
const MESSAGE_OVERHEAD_TOKENS = 8;
const PDF_TOOL_NAMES = new Set(['export_pdf', 'generate_worksheet', 'generate_pdf_from_prompt', 'generate_chart']);

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function resolveConversationWindowByTier(tier: CapabilityTier): { maxMessages: number; maxTokens: number } {
  switch (tier) {
    case 'free':
      return { maxMessages: 10, maxTokens: 6000 };
    case 'starter':
      return { maxMessages: 20, maxTokens: 8000 };
    case 'premium':
    case 'enterprise':
      return { maxMessages: 30, maxTokens: 10000 };
    default:
      return { maxMessages: 20, maxTokens: DEFAULT_MAX_TOKENS };
  }
}

function mapMessageRole(type: DashMessage['type']): 'user' | 'assistant' | null {
  if (type === 'user') return 'user';
  if (type === 'assistant' || type === 'task_result' || type === 'system') return 'assistant';
  return null;
}

function normalizeMessageContent(content: string | null | undefined): string {
  return String(content || '').replace(/\s+/g, ' ').trim();
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function extractArtifactCue(message: DashMessage): string | null {
  const metadata = (message.metadata || {}) as Record<string, any>;
  const toolResults = Array.isArray(metadata.tool_results) ? metadata.tool_results : [];
  const fallbackTool = metadata.tool_result
    ? [{ name: metadata.tool_name, output: metadata.tool_result?.result ?? metadata.tool_result, success: metadata.tool_result?.success !== false }]
    : [];
  const combinedTools = [...toolResults, ...fallbackTool];

  for (let i = combinedTools.length - 1; i >= 0; i -= 1) {
    const entry = combinedTools[i] as Record<string, any>;
    const toolName = String(entry?.name || metadata.tool_name || '').toLowerCase();
    if (!PDF_TOOL_NAMES.has(toolName)) continue;

    const output = entry?.output && typeof entry.output === 'object' ? entry.output : {};
    const nested = output?.result && typeof output.result === 'object' ? output.result : {};
    const payload = { ...output, ...nested };
    const filename = firstText(payload.filename, payload.file_name, payload.name);
    const link = firstText(
      payload.downloadUrl,
      payload.download_url,
      payload.signedUrl,
      payload.signed_url,
      payload.publicUrl,
      payload.public_url,
      payload.uri,
      payload.url,
    );

    if (filename || link) {
      return `[PDF artifact available: ${filename || 'Generated document'}${link ? ` | ${link}` : ''}]`;
    }
    return '[PDF artifact available]';
  }

  const attachmentPdf = (message.attachments || []).find((attachment) => {
    const kind = String(attachment?.kind || '').toLowerCase();
    const name = String(attachment?.name || '');
    return kind === 'pdf' || /\.pdf$/i.test(name);
  });
  if (attachmentPdf) {
    return `[PDF attachment: ${attachmentPdf.name || 'document.pdf'}]`;
  }

  return null;
}

export function buildConversationContext(
  messages: DashMessage[],
  options: ConversationContextOptions = {},
): ConversationContextMessage[] {
  const maxMessages = Math.max(1, options.maxMessages || 20);
  const maxTokens = Math.max(1000, options.maxTokens || DEFAULT_MAX_TOKENS);

  const context: ConversationContextMessage[] = [];
  let tokenBudget = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const role = mapMessageRole(message.type);
    if (!role) continue;

    const content = normalizeMessageContent(message.content);
    const artifactCue = role === 'assistant' ? extractArtifactCue(message) : null;

    // Add image cue so AI knows an image was shared in this turn of the conversation
    const imageCue = role === 'user' && (message.attachments || []).some((a) => {
      const kind = String(a?.kind || '').toLowerCase();
      return kind === 'image';
    })
      ? `[Image attached: ${(message.attachments || []).filter((a) => String(a?.kind || '').toLowerCase() === 'image').map((a) => a.name || 'image').join(', ')}]`
      : null;

    const contextualContent = [content, imageCue, artifactCue].filter(Boolean).join('\n');
    if (!contextualContent) continue;

    const messageTokens = estimateTokenCount(contextualContent) + MESSAGE_OVERHEAD_TOKENS;
    if (context.length >= maxMessages) break;
    if (context.length > 0 && tokenBudget + messageTokens > maxTokens) break;

    context.push({ role, content: contextualContent });
    tokenBudget += messageTokens;
  }

  return context.reverse();
}
