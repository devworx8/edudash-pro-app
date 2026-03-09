import type { ToolChartPreview } from '@/components/ai/dash-assistant/DashMessageBubble.utils';
import { firstText } from '@/components/ai/dash-assistant/DashMessageBubble.utils';

export interface DashMessageMeta {
  assistantContent: string;
  userContent: string;
  assistantDisplayText: string;
  metadata: Record<string, any>;
  confidenceScore: number;
  unclearSpans: string[];
  shouldOfferRetake: boolean;
  showPracticeMicrocopy: boolean;
  isToolOperation: boolean;
  rawToolName: string | null;
  toolNameKey: string;
  toolExecution: Record<string, any> | undefined;
  toolArgs: Record<string, any> | undefined;
  toolPayload: any;
  toolSuccess: boolean;
  toolError: string | null;
  toolErrorFriendly: string | null;
  allowRawToolPayload: boolean;
  generatedImages: Array<{ signed_url: string }>;
  toolSummary: string | null;
  toolMetaPills: string[];
  toolRawPayload: string | null;
  toolChartPreview: ToolChartPreview | null;
  isPdfToolOperation: boolean;
  toolDownloadUrl: string | null;
  toolStoragePath: string | null;
  pdfPreviewTarget: { url: string | null; storagePath: string | null };
  pdfPreviewUrl: string | null;
  hasPdfPreview: boolean;
  toolFilename: string | null;
  toolLinkStatus: string;
  toolWarning: string | null;
  conciseToolNarrative: string;
  assistantNarrative: string;
  showToolNarrativeToggle: boolean;
  inlineActionUrl: string | null;
  inlineActionIsPdf: boolean;
}

export function buildToolSummary(
  metadata: Record<string, any>,
  toolExecution: Record<string, any> | undefined,
  toolPayload: any,
  toolNameKey: string,
): string | null {
  const explicit = firstText(metadata.tool_summary);
  if (explicit) return explicit;
  if (!toolExecution) return null;
  const s = firstText(toolPayload?.summary, toolPayload?.message, toolPayload?.status_message, toolPayload?.title);
  if (s) return s;
  const count = typeof toolPayload?.count === 'number' ? toolPayload.count : null;
  const grade = firstText(toolPayload?.grade, toolPayload?.grade_level);
  const subject = firstText(toolPayload?.subject, toolPayload?.topic);
  if (toolNameKey === 'get_caps_documents') {
    const target = [grade ? `Grade ${String(grade).replace(/^grade\s*/i, '')}` : null, subject].filter(Boolean).join(' ');
    if (count === 0) return `No CAPS documents found${target ? ` for ${target}` : ''}.`;
    if (count !== null) return `Found ${count} CAPS document${count === 1 ? '' : 's'}${target ? ` for ${target}` : ''}.`;
  }
  if (Array.isArray(toolPayload?.documents)) return `Found ${toolPayload.documents.length} document${toolPayload.documents.length === 1 ? '' : 's'}.`;
  if (Array.isArray(toolPayload?.recommendations)) return `Generated ${toolPayload.recommendations.length} recommendation${toolPayload.recommendations.length === 1 ? '' : 's'}.`;
  if (count !== null) return `${count} result${count === 1 ? '' : 's'} returned.`;
  return null;
}

export function buildToolMetaPills(toolPayload: any): string[] {
  if (!toolPayload || typeof toolPayload !== 'object') return [];
  const pills: string[] = [];
  const count = typeof toolPayload.count === 'number' ? toolPayload.count : null;
  const grade = firstText(toolPayload.grade, toolPayload.grade_level);
  const subject = firstText(toolPayload.subject, toolPayload.topic);
  const term = firstText(toolPayload.term, toolPayload.period, toolPayload.time_period);
  if (count !== null) pills.push(`${count} result${count === 1 ? '' : 's'}`);
  if (grade) pills.push(String(grade).toLowerCase().startsWith('grade') ? grade : `Grade ${grade}`);
  if (subject) pills.push(subject);
  if (term) pills.push(`Term ${term}`.replace(/\bterm term\b/i, 'Term'));
  return pills.slice(0, 4);
}

export function extractUrl(content: string): string | undefined {
  try {
    for (const c of [content, content.replace(/\s*\n+\s*/g, ''), content.replace(/\s+/g, ' ')]) {
      const m = String(c || '').match(/https?:\/\/[^\s)]+/i);
      if (m?.[0]) return m[0].replace(/[.,;:!?]+$/g, '');
    }
  } catch { /* noop */ }
  return undefined;
}
