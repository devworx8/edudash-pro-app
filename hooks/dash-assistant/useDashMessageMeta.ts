import React from 'react';
import type { DashMessage } from '@/services/dash-ai/types';
import {
  firstText,
  isLikelyPdfUrl,
  normalizeInteractiveJsonFences,
  normalizeToolErrorMessage,
  buildToolChartPreview,
  replaceVisualPlaceholders,
  stripRawInteractiveJsonFromProse,
  PDF_TOOL_NAMES,
} from '@/components/ai/dash-assistant/DashMessageBubble.utils';
import { stripWhiteboardFromDisplay } from '@/components/ai/DashTutorWhiteboard';
import { resolvePdfPreviewTarget, sanitizeGeneratedPdfUrl } from '@/components/ai/dash-assistant/pdfPreviewUtils';
import { buildToolSummary, buildToolMetaPills, extractUrl } from './messageMetaTypes';
import type { DashMessageMeta } from './messageMetaTypes';
export type { DashMessageMeta } from './messageMetaTypes';

export function useDashMessageMeta(
  message: DashMessage,
  isUser: boolean,
  isLoading: boolean,
  isLatestMessage: boolean,
  onRetakeForClarity?: ((msg: DashMessage) => void) | undefined,
): DashMessageMeta {
  const metadata = (message.metadata || {}) as Record<string, any>;

  const assistantContent = React.useMemo(() => {
    if (isUser) return '';
    const s0 = stripWhiteboardFromDisplay(message.content || '');
    const s1 = replaceVisualPlaceholders(s0);
    const s2 = normalizeInteractiveJsonFences(s1);
    const s3 = stripRawInteractiveJsonFromProse(s2);
    return s3.trim();
  }, [isUser, message.content]);

  const userContent = message.content || '';

  const assistantDisplayText = (() => {
    const hasContent = assistantContent.trim().length > 0;
    if (hasContent) return assistantContent;
    return isLoading && isLatestMessage
      ? 'Working on your request...'
      : 'I completed that step. Ask a follow-up and I will refine it.';
  })();

  const confidenceScore = typeof metadata.confidence_score === 'number' ? metadata.confidence_score : Number.NaN;
  const normalizedOCR = metadata.ocr && typeof metadata.ocr === 'object' ? metadata.ocr : null;
  const unclearSpans: string[] = Array.isArray(normalizedOCR?.unclear_spans)
    ? normalizedOCR.unclear_spans.map((s: unknown) => String(s || '').trim()).filter(Boolean).slice(0, 3)
    : [];
  const resolutionStatus = String(metadata.resolution_status || '').toLowerCase();
  const shouldOfferRetake =
    !isUser && typeof onRetakeForClarity === 'function' &&
    (resolutionStatus === 'escalated' || resolutionStatus === 'needs_clarification' ||
      (!Number.isNaN(confidenceScore) && confidenceScore <= 0.75));
  const tutorPhase = String(metadata.tutor_phase || metadata.phase || '').toLowerCase();
  const showPracticeMicrocopy = !isUser && tutorPhase.includes('practice');

  const toolResultsArray = Array.isArray(metadata.tool_results)
    ? metadata.tool_results.filter((e: unknown): e is Record<string, any> => !!e && typeof e === 'object')
    : [];
  const metadataToolName = String(metadata.tool_name || '').trim().toLowerCase();
  const latestMatchingToolResult = metadataToolName
    ? [...toolResultsArray].reverse().find((e) => String(e?.name || e?.tool || '').trim().toLowerCase() === metadataToolName) || null
    : null;
  const latestPdfToolResult = [...toolResultsArray].reverse()
    .find((e) => PDF_TOOL_NAMES.has(String(e?.name || e?.tool || '').trim().toLowerCase())) || null;
  const latestToolResult = latestMatchingToolResult || latestPdfToolResult ||
    (toolResultsArray.length > 0 ? toolResultsArray[toolResultsArray.length - 1] : null);
  const toolResultsCompat = metadata.tool_results && typeof metadata.tool_results === 'object' && !Array.isArray(metadata.tool_results)
    ? metadata.tool_results as Record<string, any> : null;

  const parsedLatestToolOutput = (() => {
    const out = latestToolResult?.output ?? latestToolResult?.result ?? latestToolResult?.data;
    if (typeof out !== 'string') return out;
    const c = out.trim();
    if (!c || (!c.startsWith('{') && !c.startsWith('['))) return out;
    try { return JSON.parse(c); } catch { return out; }
  })();

  const rawToolName = firstText(metadata.tool_name, latestToolResult?.name, latestToolResult?.tool, toolResultsCompat?.tool);
  const toolNameKey = String(rawToolName || '').toLowerCase();
  const toolExecution = (
    metadata.tool_result && typeof metadata.tool_result === 'object'
      ? metadata.tool_result
      : latestToolResult
        ? { success: latestToolResult.success !== false, result: parsedLatestToolOutput ?? latestToolResult.output ?? latestToolResult.result ?? latestToolResult.data ?? latestToolResult, error: firstText(latestToolResult.error) }
        : toolResultsCompat ? { success: true, result: toolResultsCompat } : undefined
  ) as Record<string, any> | undefined;
  const toolArgs = metadata.tool_args as Record<string, any> | undefined;
  const isToolOperation = !isUser && !!rawToolName && !!toolExecution;
  const toolPayload = toolExecution ? (toolExecution.result ?? toolExecution.data ?? null) : null;
  const toolSuccess = toolExecution ? toolExecution.success !== false : true;
  const toolError = toolExecution ? firstText(toolExecution.error) : null;
  const toolErrorFriendly = React.useMemo(() => normalizeToolErrorMessage(toolNameKey, toolError), [toolError, toolNameKey]);
  const allowRawToolPayload = process.env.EXPO_PUBLIC_DASH_SHOW_RAW_TOOL_PAYLOAD === 'true';
  const generatedImages = (Array.isArray(metadata.generated_images) ? metadata.generated_images : [])
    .filter((img: unknown) => typeof (img as any)?.signed_url === 'string' && String((img as any).signed_url).trim().length > 0);

  const toolSummary = buildToolSummary(metadata, toolExecution, toolPayload, toolNameKey);

  const toolMetaPills = buildToolMetaPills(toolPayload);

  const toolRawPayload = React.useMemo(() => {
    if (!toolExecution) return null;
    try { return JSON.stringify(toolPayload ?? toolExecution, null, 2); } catch { return null; }
  }, [toolExecution, toolPayload]);

  const toolChartPreview = React.useMemo(() => buildToolChartPreview(toolNameKey, toolArgs || null), [toolArgs, toolNameKey]);

  const pdfArtifact = metadata.pdf_artifact && typeof metadata.pdf_artifact === 'object' ? metadata.pdf_artifact as Record<string, any> : null;
  const toolDownloadUrl = firstText(pdfArtifact?.downloadUrl, pdfArtifact?.download_url, pdfArtifact?.signedUrl, pdfArtifact?.signed_url, toolPayload?.downloadUrl, toolPayload?.download_url, toolPayload?.signedUrl, toolPayload?.signed_url, toolPayload?.uri, toolPayload?.url);
  const toolStoragePath = firstText(pdfArtifact?.storagePath, pdfArtifact?.storage_path, toolPayload?.storagePath, toolPayload?.storage_path);
  const isPdfToolOperation = isToolOperation && PDF_TOOL_NAMES.has(toolNameKey);

  const url = !isUser ? extractUrl(message.content || '') : undefined;
  const isPdf = isLikelyPdfUrl(url);
  const assistantPdfUrl = !isUser ? extractUrl(assistantContent || '') : undefined;
  const attachmentPdfUrl = firstText(
    ...(message.attachments || [])
      .filter((a) => a.kind === 'pdf' || /\.pdf$/i.test(String(a.name || '')))
      .flatMap((a) => [a.previewUri, a.uri]),
  );
  const pdfPreviewTarget = resolvePdfPreviewTarget({ isPdfToolOperation, isToolOperation, toolDownloadUrl, toolStoragePath, extractedPdfUrl: isPdf ? url : null, attachmentPdfUrl, assistantPdfUrl });
  const pdfPreviewUrl = pdfPreviewTarget.url;
  const hasPdfPreview = isPdfToolOperation ? !!pdfPreviewUrl || !!pdfPreviewTarget.storagePath : !!pdfPreviewUrl && isLikelyPdfUrl(pdfPreviewUrl);

  const toolFilename = firstText(pdfArtifact?.filename, pdfArtifact?.file_name, pdfArtifact?.name, toolPayload?.filename, toolPayload?.file_name, toolPayload?.name);
  const toolLinkType = String(firstText(pdfArtifact?.linkType, pdfArtifact?.link_type, toolPayload?.linkType, toolPayload?.link_type) || '').toLowerCase();
  const toolLinkStatus = isPdfToolOperation ? toolLinkType === 'signed' ? 'Secure link ready' : toolLinkType === 'local' ? 'Saved on this device' : 'Link unavailable' : '';
  const toolWarning = firstText(pdfArtifact?.warning, pdfArtifact?.warning_message, toolPayload?.warning, toolPayload?.warning_message);

  const conciseToolNarrative = toolSummary || (isPdfToolOperation ? 'PDF ready to open.' : (toolSuccess ? 'Task completed.' : 'Task needs attention.'));
  const assistantNarrative = String(assistantContent || '').trim();
  const hasVerboseAssistantNarrative = assistantNarrative.length > 220;
  const showToolNarrativeToggle = isToolOperation && hasVerboseAssistantNarrative && assistantNarrative !== conciseToolNarrative;

  const inlineAssistantUrl = sanitizeGeneratedPdfUrl(url);
  const inlineActionUrl = isPdfToolOperation ? pdfPreviewUrl : inlineAssistantUrl;
  const inlineActionIsPdf = isPdfToolOperation ? !!pdfPreviewUrl : isLikelyPdfUrl(inlineAssistantUrl);

  return {
    assistantContent, userContent, assistantDisplayText, metadata, confidenceScore, unclearSpans,
    shouldOfferRetake, showPracticeMicrocopy, isToolOperation, rawToolName, toolNameKey,
    toolExecution, toolArgs, toolPayload, toolSuccess, toolError, toolErrorFriendly,
    allowRawToolPayload, generatedImages, toolSummary, toolMetaPills, toolRawPayload, toolChartPreview,
    isPdfToolOperation, toolDownloadUrl, toolStoragePath, pdfPreviewTarget, pdfPreviewUrl,
    hasPdfPreview, toolFilename, toolLinkStatus, toolWarning, conciseToolNarrative,
    assistantNarrative, showToolNarrativeToggle, inlineActionUrl, inlineActionIsPdf,
  };
}
