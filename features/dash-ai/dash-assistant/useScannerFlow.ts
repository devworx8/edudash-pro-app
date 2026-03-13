import { useCallback, useEffect, useRef, useState } from 'react';
import { loadAutoScanBudget } from '@/lib/dash-ai/imageBudget';
import { deriveRetakePrompt } from '@/lib/dash-ai/retakeFlow';
import type { DashAttachment, DashMessage } from '@/services/dash-ai/types';
import type { HomeworkScanResult } from '@/components/ai/HomeworkScanner';

interface UseScannerFlowParams {
  autoScanUserId: string | null;
  tierRef: React.MutableRefObject<string | undefined>;
  messages: DashMessage[];
  isLoading: boolean;
  isUploading: boolean;
  selectedAttachments: DashAttachment[];
  addAttachments: (attachments: DashAttachment[]) => void;
  sendMessage: (text?: string) => Promise<void>;
  setInputText: (text: string) => void;
}

export function useScannerFlow({
  autoScanUserId,
  tierRef,
  messages,
  isLoading,
  isUploading,
  selectedAttachments,
  addAttachments,
  sendMessage,
  setInputText,
}: UseScannerFlowParams) {
  const [scannerVisible, setScannerVisible] = useState(false);
  const [remainingScans, setRemainingScans] = useState<number | null>(null);
  const [retakeContext, setRetakeContext] = useState<{
    assistantMessageId: string;
    prompt: string;
    pendingAttachmentId: string | null;
  } | null>(null);
  const retakeAutoSendRef = useRef(false);

  const refreshScanBudget = useCallback(async (tierOverride?: string | null) => {
    const activeTier = String(tierOverride || tierRef.current || 'free');
    const budget = await loadAutoScanBudget(activeTier, autoScanUserId);
    setRemainingScans(budget.remainingCount);
  }, [autoScanUserId, tierRef]);

  const openScanner = useCallback(() => { setScannerVisible(true); }, []);

  const closeScanner = useCallback(() => {
    setScannerVisible(false);
    setRetakeContext((prev) => (prev && !prev.pendingAttachmentId ? null : prev));
  }, []);

  const handleRetakeForClarity = useCallback((assistantMessage: DashMessage) => {
    const prompt = deriveRetakePrompt(messages, assistantMessage.id);
    setInputText(prompt);
    setRetakeContext({ assistantMessageId: assistantMessage.id, prompt, pendingAttachmentId: null });
    setScannerVisible(true);
  }, [messages, setInputText]);

  const handleScannerScanned = useCallback((result: HomeworkScanResult) => {
    if (!result?.base64) return;
    const attachmentId = `attach_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const attachment: DashAttachment = {
      id: attachmentId,
      name: `scan_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      size: Math.max(0, Math.floor(result.base64.length * 0.75)),
      bucket: 'attachments',
      storagePath: '',
      kind: 'image',
      status: 'pending',
      previewUri: result.uri,
      uploadProgress: 0,
      meta: {
        base64: result.base64,
        image_base64: result.base64,
        image_media_type: 'image/jpeg',
        width: result.width,
        height: result.height,
        source: 'scanner',
      },
    };
    addAttachments([attachment]);
    setRetakeContext((prev) => prev ? { ...prev, pendingAttachmentId: attachmentId } : prev);
    void refreshScanBudget();
    setScannerVisible(false);
  }, [addAttachments, refreshScanBudget]);

  useEffect(() => {
    if (!retakeContext?.pendingAttachmentId) return;
    if (retakeAutoSendRef.current) return;
    if (isLoading || isUploading) return;
    const hasAttachment = selectedAttachments.some((a) => a.id === retakeContext.pendingAttachmentId);
    if (!hasAttachment) return;
    const prompt = String(retakeContext.prompt || '').trim();
    if (!prompt) { setRetakeContext(null); return; }
    retakeAutoSendRef.current = true;
    void sendMessage(prompt).finally(() => {
      retakeAutoSendRef.current = false;
      setRetakeContext(null);
    });
  }, [retakeContext, selectedAttachments, sendMessage, isLoading, isUploading]);

  return { scannerVisible, remainingScans, refreshScanBudget, openScanner, closeScanner, handleRetakeForClarity, handleScannerScanned };
}