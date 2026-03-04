import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import {
  normalizeMaterialMimeType,
  pickMaterialImages,
  pickMaterialPdf,
  processQueuedMaterialItem,
  processStudyMaterialInput,
} from '@/lib/exam-prep/studyMaterialPipelineHandlers';
import {
  type PdfSplitProgress,
  type StudyMaterial,
  type StudyMaterialInputFile,
} from '@/lib/exam-prep/studyMaterialPipelineTypes';
import {
  cancelQueue,
  removeMaterial,
  resumeQueue,
  retryFailedMaterials,
  retryMaterial,
} from '@/lib/exam-prep/studyMaterialPipelineActions';
import type { SouthAfricanLanguage } from '@/components/exam-prep/types';
import { usePersistedStudyMaterials } from './usePersistedStudyMaterials';
import { usePdfSplitProgressSync } from './usePdfSplitProgressSync';

export type { PdfSplitProgress, StudyMaterial, StudyMaterialInputFile };

export function useStudyMaterialPipeline(selectedLanguage: SouthAfricanLanguage) {
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>([]);
  const [pdfSplitProgress, setPdfSplitProgress] = useState<PdfSplitProgress | null>(null);
  const [materialSelectionBusy, setMaterialSelectionBusy] = useState(false);
  const [queuePausedUntilMs, setQueuePausedUntilMs] = useState<number | null>(null);
  const loopLockRef = useRef(false);

  const selectedLanguageName = useMemo(() => selectedLanguage, [selectedLanguage]);
  const hasQueued = useMemo(() => studyMaterials.some((m) => m.status === 'queued'), [studyMaterials]);
  const hasProcessing = useMemo(() => studyMaterials.some((m) => m.status === 'processing'), [studyMaterials]);
  const hasPaused = useMemo(() => studyMaterials.some((m) => m.status === 'paused_rate_limited'), [studyMaterials]);
  const hasBlockingMaterialErrors = useMemo(
    () => studyMaterials.some((m) => m.status === 'error'),
    [studyMaterials],
  );
  const failedMaterialCount = useMemo(
    () => studyMaterials.filter((m) => m.status === 'error').length,
    [studyMaterials],
  );
  const pausedMaterialCount = useMemo(
    () => studyMaterials.filter((m) => m.status === 'paused_rate_limited').length,
    [studyMaterials],
  );
  const isMaterialPipelineBusy = materialSelectionBusy || hasQueued || hasProcessing || hasPaused || Boolean(pdfSplitProgress);
  const materialPipelineLabel = materialSelectionBusy
    ? 'Preparing selected files...'
    : pdfSplitProgress
    ? 'Uploading PDF pages...'
    : hasProcessing
    ? 'Extracting study notes...'
    : hasQueued
    ? 'Queued for extraction...'
    : hasPaused
    ? 'Queue paused by provider limits...'
    : 'Please wait...';
  const readyMaterialSummaries = useMemo(() => studyMaterials.filter((m) => m.status === 'ready' && m.summary).map((m) => `Source: ${m.name}\n${m.summary}`), [studyMaterials]);
  const splitProgressPercent = useMemo(() => !pdfSplitProgress || pdfSplitProgress.totalParts <= 0 ? 0 : Math.max(8, Math.min(100, (pdfSplitProgress.completedParts / pdfSplitProgress.totalParts) * 100)), [pdfSplitProgress]);

  usePersistedStudyMaterials(studyMaterials, setStudyMaterials);

  usePdfSplitProgressSync({ pdfSplitProgress, setPdfSplitProgress, studyMaterials });

  const updateItem = useCallback((id: string, patch: Partial<StudyMaterial>) => {
    setStudyMaterials((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m));
  }, []);

  const processQueuedItem = useCallback(async (item: StudyMaterial) => {
    await processQueuedMaterialItem({
      item,
      selectedLanguageName,
      updateItem,
      setQueuePausedUntilMs,
    });
  }, [selectedLanguageName, updateItem]);

  useEffect(() => {
    if (loopLockRef.current || materialSelectionBusy) return;
    if (queuePausedUntilMs && queuePausedUntilMs > Date.now()) {
      const wait = queuePausedUntilMs - Date.now();
      const timer = setTimeout(() => {
        setQueuePausedUntilMs(null);
        setStudyMaterials((prev) => prev.map((m) => m.status === 'paused_rate_limited' ? { ...m, status: 'queued' } : m));
      }, wait);
      return () => clearTimeout(timer);
    }
    const next = studyMaterials.find((m) => m.status === 'queued');
    if (!next) return;
    loopLockRef.current = true;
    processQueuedItem(next).finally(() => { loopLockRef.current = false; });
  }, [studyMaterials, queuePausedUntilMs, materialSelectionBusy, processQueuedItem]);

  const enqueueFiles = useCallback((files: StudyMaterialInputFile[]) => {
    const created: StudyMaterial[] = files.map((file, idx) => ({
      id: `material_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      name: file.name || `material-${Date.now()}`,
      mimeType: normalizeMaterialMimeType(file.mimeType, file.name || `material-${Date.now()}`),
      status: 'queued',
      sourceUri: file.uri,
      sourceSize: file.size,
      attempts: 0,
    }));
    setStudyMaterials((prev) => [...prev, ...created]);
    return created.map((m) => m.id);
  }, []);

  const processStudyMaterial = useCallback(async (file: StudyMaterialInputFile) => {
    await processStudyMaterialInput({
      file,
      enqueueFiles,
      setPdfSplitProgress: (value) => setPdfSplitProgress(value),
    });
  }, [enqueueFiles]);

  const handlePickMaterialImage = useCallback(async () => {
    if (isMaterialPipelineBusy) return;
    setMaterialSelectionBusy(true);
    try {
      await pickMaterialImages({
        isMaterialPipelineBusy,
        processStudyMaterial,
      });
    } catch {
      Alert.alert('Upload failed', 'Could not add image study material.');
    } finally {
      setMaterialSelectionBusy(false);
    }
  }, [isMaterialPipelineBusy, processStudyMaterial]);

  const handlePickMaterialPdf = useCallback(async () => {
    if (isMaterialPipelineBusy) return;
    setMaterialSelectionBusy(true);
    try {
      await pickMaterialPdf({
        isMaterialPipelineBusy,
        processStudyMaterial,
      });
    } catch (error) {
      Alert.alert(
        'PDF split failed',
        error instanceof Error ? error.message : 'Could not add PDF study material.',
      );
    } finally {
      setMaterialSelectionBusy(false);
    }
  }, [isMaterialPipelineBusy, processStudyMaterial]);

  const handleRemoveMaterial = useCallback((id: string) => {
    removeMaterial(setStudyMaterials, id);
  }, []);

  const handleRetryMaterial = useCallback((id: string) => {
    retryMaterial({ id, studyMaterials, updateItem });
  }, [studyMaterials, updateItem]);

  const handleRetryFailedMaterials = useCallback(() => {
    retryFailedMaterials(setStudyMaterials);
  }, []);

  const handleResumeQueue = useCallback(() => {
    resumeQueue({ setQueuePausedUntilMs, setStudyMaterials });
  }, []);

  const handleCancelQueue = useCallback(() => {
    cancelQueue({ setQueuePausedUntilMs, setStudyMaterials });
  }, []);

  return {
    studyMaterials,
    pdfSplitProgress,
    materialSelectionBusy,
    isMaterialPipelineBusy,
    hasBlockingMaterialErrors,
    failedMaterialCount,
    pausedMaterialCount,
    materialPipelineLabel,
    splitProgressPercent,
    readyMaterialSummaries,
    handlePickMaterialImage,
    handlePickMaterialPdf,
    handleRemoveMaterial,
    handleRetryMaterial,
    handleRetryFailedMaterials,
    handleResumeQueue,
    handleCancelQueue,
  };
}
