/**
 * useDashAttachments Hook
 * 
 * Manages file attachments for Dash AI.
 * Handles picking, uploading, compression, and preview.
 */

import { useState, useCallback, useEffect } from 'react';
import type { DashAttachment, DashConversation } from '@/services/dash-ai/types';
import {
  pickDocuments,
  pickImages,
  takePhoto,
  recoverPendingPhoto,
  uploadAttachment,
} from '@/services/AttachmentService';
import { compressImageForAI } from '@/lib/dash-ai/imageCompression';
import { FREE_IMAGE_BUDGET_PER_DAY, loadImageBudget, trackImageUsage } from '@/lib/dash-ai/imageBudget';
import * as Haptics from 'expo-haptics';

export interface UseDashAttachmentsOptions {
  conversation: DashConversation | null;
  getConversationId?: () => string | null;
  onShowAlert?: (config: {
    title: string;
    message: string;
    type: 'error' | 'success' | 'warning' | 'info';
    icon?: string;
    buttons?: Array<{
      text: string;
      onPress?: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }>;
  }) => void;
  canUseImages?: boolean;
  canUseDocuments?: boolean;
  isFreeTier?: boolean;
}

export interface AttachmentProgress {
  id: string;
  progress: number;
  status: 'idle' | 'uploading' | 'uploaded' | 'failed';
}

export interface UseDashAttachmentsReturn {
  selectedAttachments: DashAttachment[];
  setSelectedAttachments: React.Dispatch<React.SetStateAction<DashAttachment[]>>;
  isUploading: boolean;
  attachmentProgress: Map<string, AttachmentProgress>;
  
  // Actions
  handleTakePhoto: () => Promise<void>;
  handlePickImages: () => Promise<void>;
  handlePickDocuments: () => Promise<void>;
  handleAttachFile: () => Promise<void>;
  handleRemoveAttachment: (attachmentId: string) => Promise<void>;
  updateAttachmentUri: (attachmentId: string, newUri: string) => void;
  uploadAttachments: (attachments: DashAttachment[], conversationIdOverride?: string | null) => Promise<DashAttachment[]>;
  prepareAttachmentsForAI: (attachments: DashAttachment[]) => Promise<DashAttachment[]>;
}

export function useDashAttachments(options: UseDashAttachmentsOptions): UseDashAttachmentsReturn {
  const { conversation, getConversationId, onShowAlert, canUseImages = true, canUseDocuments = true, isFreeTier = false } = options;
  
  const [selectedAttachments, setSelectedAttachments] = useState<DashAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentProgress, setAttachmentProgress] = useState<Map<string, AttachmentProgress>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const recovered = await recoverPendingPhoto();
      if (cancelled || recovered.length === 0) return;
      setSelectedAttachments((prev) => [...prev, ...recovered].slice(0, 10));
      onShowAlert?.({
        title: 'Camera Recovery',
        message: 'Recovered photo from previous camera session.',
        type: 'info',
        icon: 'camera-outline',
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [onShowAlert]);

  // Update attachment progress
  const updateAttachmentProgress = useCallback((
    attachmentId: string,
    progress: number,
    status: AttachmentProgress['status'] = 'uploading'
  ) => {
    setAttachmentProgress(prev => {
      const next = new Map(prev);
      next.set(attachmentId, { id: attachmentId, progress, status });
      return next;
    });
  }, []);

  const getRemainingImageSlots = useCallback(async () => {
    if (!isFreeTier) {
      return {
        remainingCount: Number.POSITIVE_INFINITY,
        usedCount: 0,
        totalCount: Number.POSITIVE_INFINITY,
        percentUsed: 0,
        selectedCount: selectedAttachments.filter(a => a.kind === 'image').length,
      };
    }

    const budget = await loadImageBudget();
    const selectedCount = selectedAttachments.filter(a => a.kind === 'image').length;
    const remainingCount = Math.max(0, budget.remainingCount - selectedCount);

    return {
      ...budget,
      remainingCount,
      selectedCount,
    };
  }, [isFreeTier, selectedAttachments]);

  const showImageLimitAlert = useCallback((message: string) => {
    onShowAlert?.({
      title: 'Daily Image Limit',
      message,
      type: 'warning',
      icon: 'image-outline',
      buttons: [{ text: 'OK', style: 'default' }],
    });
  }, [onShowAlert]);

  const showUpgradeAlert = useCallback((feature: 'images' | 'documents') => {
    const message = feature === 'documents'
      ? 'Document uploads are available on Starter and above.'
      : 'Image uploads are available on Starter and above.';
    onShowAlert?.({
      title: 'Upgrade Required',
      message,
      type: 'info',
      icon: 'lock-closed-outline',
      buttons: [{ text: 'OK', style: 'default' }],
    });
  }, [onShowAlert]);

  const resolveConversationId = useCallback((): string | null => {
    if (conversation?.id) {
      return conversation.id;
    }
    const fromGetter = getConversationId?.();
    if (fromGetter && typeof fromGetter === 'string') {
      return fromGetter;
    }
    return null;
  }, [conversation?.id, getConversationId]);

  // Take photo with camera
  const handleTakePhoto = useCallback(async () => {
    try {
      if (!canUseImages) {
        showUpgradeAlert('images');
        return;
      }
      const budget = await getRemainingImageSlots();
      if (isFreeTier && budget.remainingCount <= 0) {
        showImageLimitAlert(`You've reached the daily limit of ${FREE_IMAGE_BUDGET_PER_DAY} images. Try again tomorrow or upgrade for more.`);
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const photos = await takePhoto();
      if (photos && photos.length > 0) {
        let allowedPhotos = photos;
        if (isFreeTier) {
          const allowedCount = Math.min(photos.length, budget.remainingCount);
          if (allowedCount <= 0) {
            showImageLimitAlert(`You've reached the daily limit of ${FREE_IMAGE_BUDGET_PER_DAY} images. Try again tomorrow or upgrade for more.`);
            return;
          }
          allowedPhotos = photos.slice(0, allowedCount);
          if (allowedCount < photos.length) {
            showImageLimitAlert(`Only ${allowedCount} image${allowedCount === 1 ? '' : 's'} were added. You can upload up to ${FREE_IMAGE_BUDGET_PER_DAY} images per day.`);
          }
        }
        setSelectedAttachments(prev => [...prev, ...allowedPhotos]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('[Attachments] Failed to take photo:', error);
      onShowAlert?.({
        title: 'Camera Error',
        message: 'Failed to take photo. Please try again.',
        type: 'error',
        icon: 'camera-outline',
      });
    }
  }, [canUseImages, getRemainingImageSlots, isFreeTier, onShowAlert, showImageLimitAlert, showUpgradeAlert]);

  // Pick images from library
  const handlePickImages = useCallback(async () => {
    try {
      if (!canUseImages) {
        showUpgradeAlert('images');
        return;
      }
      const budget = await getRemainingImageSlots();
      if (isFreeTier && budget.remainingCount <= 0) {
        showImageLimitAlert(`You've reached the daily limit of ${FREE_IMAGE_BUDGET_PER_DAY} images. Try again tomorrow or upgrade for more.`);
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const images = await pickImages();
      if (images && images.length > 0) {
        let allowedImages = images;
        if (isFreeTier) {
          const allowedCount = Math.min(images.length, budget.remainingCount);
          if (allowedCount <= 0) {
            showImageLimitAlert(`You've reached the daily limit of ${FREE_IMAGE_BUDGET_PER_DAY} images. Try again tomorrow or upgrade for more.`);
            return;
          }
          allowedImages = images.slice(0, allowedCount);
          if (allowedCount < images.length) {
            showImageLimitAlert(`Only ${allowedCount} image${allowedCount === 1 ? '' : 's'} were added. You can upload up to ${FREE_IMAGE_BUDGET_PER_DAY} images per day.`);
          }
        }
        setSelectedAttachments(prev => [...prev, ...allowedImages]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('[Attachments] Failed to pick images:', error);
      onShowAlert?.({
        title: 'Error',
        message: 'Failed to select images. Please try again.',
        type: 'error',
        icon: 'image-outline',
      });
    }
  }, [canUseImages, getRemainingImageSlots, isFreeTier, onShowAlert, showImageLimitAlert, showUpgradeAlert]);

  // Pick documents
  const handlePickDocuments = useCallback(async () => {
    try {
      if (!canUseDocuments) {
        showUpgradeAlert('documents');
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const docs = await pickDocuments();
      if (docs && docs.length > 0) {
        setSelectedAttachments(prev => [...prev, ...docs]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('[Attachments] Failed to pick documents:', error);
      onShowAlert?.({
        title: 'Error',
        message: 'Failed to select documents. Please try again.',
        type: 'error',
        icon: 'document-outline',
      });
    }
  }, [canUseDocuments, onShowAlert, showUpgradeAlert]);

  // Generic attach file handler (shows options)
  const handleAttachFile = useCallback(async () => {
    const buttons: Array<{
      text: string;
      onPress?: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }> = [
      { text: 'Take Photo', onPress: () => { void handleTakePhoto(); }, style: 'default' },
      { text: 'Choose Images', onPress: () => { void handlePickImages(); }, style: 'default' },
    ];
    if (canUseDocuments) {
      buttons.push({ text: 'Choose Documents', onPress: () => { void handlePickDocuments(); }, style: 'default' });
    } else {
      buttons.push({ text: 'Documents (Upgrade)', onPress: () => showUpgradeAlert('documents'), style: 'default' });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    onShowAlert?.({
      title: 'Add Attachment',
      message: 'Choose attachment type:',
      type: 'info',
      icon: 'attach-outline',
      buttons,
    });
  }, [canUseDocuments, handlePickDocuments, handlePickImages, handleTakePhoto, onShowAlert, showUpgradeAlert]);

  // Remove attachment
  const handleRemoveAttachment = useCallback(async (attachmentId: string) => {
    setSelectedAttachments(prev => prev.filter(a => a.id !== attachmentId));
    setAttachmentProgress(prev => {
      const next = new Map(prev);
      next.delete(attachmentId);
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // Upload attachments to storage
  const uploadAttachments = useCallback(async (
    attachments: DashAttachment[],
    conversationIdOverride?: string | null,
  ): Promise<DashAttachment[]> => {
    const conversationId = conversationIdOverride || resolveConversationId();
    if (!conversationId) {
      throw new Error('No active conversation');
    }

    setIsUploading(true);
    const uploaded: DashAttachment[] = [];

    try {
      for (const attachment of attachments) {
        updateAttachmentProgress(attachment.id, 0, 'uploading');
        
        try {
          const result = await uploadAttachment(
            attachment,
            conversationId,
            (progress) => updateAttachmentProgress(attachment.id, progress, 'uploading')
          );
          
          updateAttachmentProgress(attachment.id, 100, 'uploaded');
          uploaded.push(result);
          if (isFreeTier && attachment.kind === 'image') {
            await trackImageUsage(1);
          }
        } catch (error) {
          console.error(`[Attachments] Failed to upload ${attachment.name}:`, error);
          updateAttachmentProgress(attachment.id, 0, 'failed');
          
          onShowAlert?.({
            title: 'Upload Failed',
            message: `Failed to upload ${attachment.name}. ${error instanceof Error ? error.message : 'Please try again.'}`,
            type: 'error',
            icon: 'cloud-offline-outline',
            buttons: [{ text: 'OK', style: 'default' }],
          });
        }
      }
    } finally {
      setIsUploading(false);
    }

    return uploaded;
  }, [isFreeTier, onShowAlert, resolveConversationId, updateAttachmentProgress]);

  // Prepare attachments for AI (compress images)
  const prepareAttachmentsForAI = useCallback(async (attachments: DashAttachment[]): Promise<DashAttachment[]> => {
    const prepared: DashAttachment[] = [];

    for (const attachment of attachments) {
      // Only compress images on native platforms
      if (attachment.kind === 'image' && attachment.previewUri) {
        try {
          const compressed = await compressImageForAI(attachment.previewUri);
          prepared.push({
            ...attachment,
            meta: {
              ...attachment.meta,
              base64: compressed.base64,
              width: compressed.width,
              height: compressed.height,
              compressed: true,
            },
          });
        } catch (error) {
          console.error('[Attachments] Failed to compress image:', error);
          // Use original if compression fails
          prepared.push(attachment);
        }
      } else {
        prepared.push(attachment);
      }
    }

    return prepared;
  }, []);

  const updateAttachmentUri = useCallback((attachmentId: string, newUri: string) => {
    setSelectedAttachments((prev) =>
      prev.map((a) =>
        a.id === attachmentId
          ? { ...a, previewUri: newUri, uri: newUri, meta: { ...(a.meta || {}), image_base64: undefined } }
          : a
      )
    );
  }, []);

  return {
    selectedAttachments,
    setSelectedAttachments,
    isUploading,
    attachmentProgress,
    handleTakePhoto,
    handlePickImages,
    handlePickDocuments,
    handleAttachFile,
    handleRemoveAttachment,
    updateAttachmentUri,
    uploadAttachments,
    prepareAttachmentsForAI,
  };
}
