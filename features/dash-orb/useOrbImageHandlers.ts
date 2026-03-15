// Image attachment, camera scanning, and budget tracking for DashOrb
import { useState, useCallback, useEffect } from 'react';
import { toast } from '@/components/ui/ToastProvider';
import { pickImages } from '@/services/AttachmentService';
import type { DashAttachment } from '@/services/dash-ai/types';
import { FREE_IMAGE_BUDGET_PER_DAY, loadImageBudget, loadAutoScanBudget } from '@/lib/dash-ai/imageBudget';
import type { HomeworkScanResult } from '@/components/ai/HomeworkScanner';

interface UseOrbImageHandlersParams {
  isProcessing: boolean;
  isFreeImageBudgetTier: boolean;
  tierLabel: string;
  autoScanUserId: string | null;
}

export function useOrbImageHandlers({ isProcessing, isFreeImageBudgetTier, tierLabel, autoScanUserId }: UseOrbImageHandlersParams) {
  const [pendingAttachments, setPendingAttachments] = useState<DashAttachment[]>([]);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [remainingAutoScans, setRemainingAutoScans] = useState<number | null>(null);

  const getRemainingSlots = useCallback(async () => {
    if (!isFreeImageBudgetTier) return Number.POSITIVE_INFINITY;
    const budget = await loadImageBudget();
    return Math.max(0, budget.remainingCount - pendingAttachments.filter((a) => a.kind === 'image').length);
  }, [isFreeImageBudgetTier, pendingAttachments]);

  const refreshAutoScanBudget = useCallback(async () => {
    const b = await loadAutoScanBudget(tierLabel || 'free', autoScanUserId);
    setRemainingAutoScans(b.remainingCount);
  }, [autoScanUserId, tierLabel]);

  useEffect(() => { void refreshAutoScanBudget(); }, [refreshAutoScanBudget]);

  const handleOrbAttach = useCallback(async () => {
    if (isProcessing) return;
    const remaining = await getRemainingSlots();
    if (remaining <= 0) { toast.info(`Daily image limit reached (${FREE_IMAGE_BUDGET_PER_DAY}). Upgrade for more.`); return; }
    const picked = await pickImages();
    if (!picked?.length) return;
    const allowed = Number.isFinite(remaining) ? picked.slice(0, remaining) : picked;
    if (!allowed.length) { toast.info(`Daily image limit reached (${FREE_IMAGE_BUDGET_PER_DAY}). Upgrade for more.`); return; }
    setPendingAttachments((p) => [...p, ...allowed].slice(0, 5));
    if (allowed.length < picked.length) toast.info(`Added ${allowed.length}/${picked.length} images (daily free limit).`);
    else toast.success(`${allowed.length} image${allowed.length === 1 ? '' : 's'} attached`);
  }, [getRemainingSlots, isProcessing]);

  const handleOrbCamera = useCallback(() => { if (!isProcessing) setScannerVisible(true); }, [isProcessing]);

  const handleScannerScanned = useCallback(async (result: HomeworkScanResult) => {
    if (!result?.base64) return;
    const remaining = await getRemainingSlots();
    if (remaining <= 0) { setScannerVisible(false); toast.info(`Daily image limit reached (${FREE_IMAGE_BUDGET_PER_DAY}). Upgrade for more.`); return; }
    const attachment: DashAttachment = {
      id: `attach_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: `homework_scan_${Date.now()}.jpg`,
      mimeType: 'image/jpeg', size: Math.max(0, Math.floor(result.base64.length * 0.75)),
      bucket: 'attachments', storagePath: '', kind: 'image', status: 'pending',
      previewUri: result.uri, uploadProgress: 0,
      meta: { base64: result.base64, image_base64: result.base64, image_media_type: 'image/jpeg', width: result.width, height: result.height, source: 'homework_scanner' },
    };
    setPendingAttachments((p) => [...p, attachment].slice(0, 5));
    void refreshAutoScanBudget();
    setScannerVisible(false);
    toast.success('Homework scan attached');
  }, [getRemainingSlots, refreshAutoScanBudget]);

  return {
    pendingAttachments, setPendingAttachments,
    scannerVisible, setScannerVisible,
    remainingAutoScans, refreshAutoScanBudget,
    handleOrbAttach, handleOrbCamera, handleScannerScanned,
  };
}
