import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { splitPdfIntoSinglePages } from '@/components/exam-prep/pdfSplit';
import {
  formatSizeMB,
  MATERIAL_QUEUE_MAX_ATTEMPTS,
  MAX_MATERIAL_SIZE_BYTES,
  MAX_MATERIAL_SIZE_MB,
  parseFunctionInvokeError,
  readFileAsBase64,
  sleep,
  summarizeStudyMaterial,
  toMaterialErrorMessage,
} from '@/components/exam-prep/studyMaterialPipeline.utils';
import type { SouthAfricanLanguage } from '@/components/exam-prep/types';

type Status = 'queued' | 'processing' | 'ready' | 'error' | 'paused_rate_limited';
export type StudyMaterial = { id: string; name: string; mimeType: string; status: Status; summary?: string; error?: string; sourceUri?: string; sourceSize?: number; attempts: number };
export type StudyMaterialInputFile = { uri: string; name: string; mimeType: string; size?: number };
export type PdfSplitProgress = { fileName: string; totalParts: number; completedParts: number; partIds: string[] };

const STORAGE_KEY = 'exam-prep.study-material.pipeline.v1';
const BASE_RETRY_MS = 4000;
const MAX_RETRY_MS = 60000;
const PART_COOLDOWN_MS = 900;

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

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as StudyMaterial[];
        setStudyMaterials(parsed.map((item) => item.status === 'processing' ? { ...item, status: 'queued' } : item));
      } catch { /* ignore */ }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(studyMaterials)).catch(() => undefined);
  }, [studyMaterials]);

  useEffect(() => {
    if (!pdfSplitProgress) return;
    const completed = pdfSplitProgress.partIds.filter((id) => {
      const item = studyMaterials.find((m) => m.id === id);
      return item && item.status !== 'queued' && item.status !== 'processing';
    }).length;
    if (completed !== pdfSplitProgress.completedParts) {
      setPdfSplitProgress((prev) => prev ? { ...prev, completedParts: completed } : prev);
    }
    if (completed >= pdfSplitProgress.totalParts && pdfSplitProgress.totalParts > 0) {
      const timeout = setTimeout(() => setPdfSplitProgress(null), 900);
      return () => clearTimeout(timeout);
    }
  }, [pdfSplitProgress, studyMaterials]);

  const updateItem = useCallback((id: string, patch: Partial<StudyMaterial>) => {
    setStudyMaterials((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m));
  }, []);

  const processQueuedItem = useCallback(async (item: StudyMaterial) => {
    updateItem(item.id, { status: 'processing', error: undefined });
    try {
      const base64 = await readFileAsBase64(item.sourceUri || '');
      const summary = await summarizeStudyMaterial({ base64, mimeType: item.mimeType, fileName: item.name, selectedLanguageName });
      updateItem(item.id, { status: 'ready', summary, error: undefined });
    } catch (error) {
      const info = await parseFunctionInvokeError(error, 'Failed to analyze study material.');
      const message = toMaterialErrorMessage(info);
      if (info.rateLimited && !info.quotaExceeded && item.attempts < MATERIAL_QUEUE_MAX_ATTEMPTS) {
        const retryMs = Math.min(MAX_RETRY_MS, (info.retryAfterSeconds ? info.retryAfterSeconds * 1000 : BASE_RETRY_MS * Math.pow(2, item.attempts)) + Math.floor(Math.random() * 600));
        updateItem(item.id, { status: 'paused_rate_limited', error: message, attempts: item.attempts + 1 });
        setQueuePausedUntilMs(Date.now() + retryMs);
      } else {
        updateItem(item.id, { status: 'error', error: message, attempts: item.attempts + 1 });
        if (info.quotaExceeded || info.rateLimited) Alert.alert('Study material analysis unavailable', message);
      }
    } finally {
      await sleep(PART_COOLDOWN_MS);
    }
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
    const created: StudyMaterial[] = files.map((file, idx) => ({ id: `material_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`, name: file.name || `material-${Date.now()}`, mimeType: file.mimeType, status: 'queued', sourceUri: file.uri, sourceSize: file.size, attempts: 0 }));
    setStudyMaterials((prev) => [...prev, ...created]);
    return created.map((m) => m.id);
  }, []);

  const processStudyMaterial = useCallback(async (file: StudyMaterialInputFile) => {
    let sizeBytes = typeof file.size === 'number' && file.size > 0 ? file.size : 0;
    if (sizeBytes <= 0) {
      if (Platform.OS === 'web') {
        try {
          const response = await fetch(file.uri);
          if (response.ok) {
            const blob = await response.blob();
            sizeBytes = blob.size || 0;
          }
        } catch {
          sizeBytes = 0;
        }
      } else {
        try {
          const info = await FileSystem.getInfoAsync(file.uri);
          sizeBytes = info.exists && typeof info.size === 'number' ? info.size : 0;
        } catch {
          sizeBytes = 0;
        }
      }
    }

    if (sizeBytes > MAX_MATERIAL_SIZE_BYTES && file.mimeType !== 'application/pdf') {
      Alert.alert('File too large', `This file is ${formatSizeMB(sizeBytes)}MB. Please use files up to ${MAX_MATERIAL_SIZE_MB}MB.`);
      return;
    }
    if (file.mimeType !== 'application/pdf') { enqueueFiles([{ ...file, size: sizeBytes }]); return; }
    Alert.alert('Preparing PDF pages', `This PDF is ${formatSizeMB(sizeBytes)}MB. Dash will upload each page separately.`);
    const parts = await splitPdfIntoSinglePages({ uri: file.uri, name: file.name, sizeBytes });
    if (parts.length === 0) throw new Error('No PDF pages were created.');
    parts.forEach((part, index) => { if (part.size > MAX_MATERIAL_SIZE_BYTES) throw new Error(`Page ${index + 1} is still too large (${formatSizeMB(part.size)}MB).`); });
    const partIds = enqueueFiles(parts);
    setPdfSplitProgress({ fileName: file.name, totalParts: partIds.length, completedParts: 0, partIds });
  }, [enqueueFiles]);

  const handlePickMaterialImage = useCallback(async () => {
    if (isMaterialPipelineBusy) return;
    setMaterialSelectionBusy(true);
    try {
      if (Platform.OS === 'web') {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['image/*'],
          copyToCacheDirectory: true,
          multiple: true,
        });
        if (result.canceled || !result.assets?.length) return;
        await Promise.all(
          result.assets.map((asset, index) =>
            processStudyMaterial({
              uri: asset.uri,
              name: asset.name || `image-${Date.now()}-${index + 1}.jpg`,
              mimeType: asset.mimeType || 'image/jpeg',
              size: asset.size,
            }),
          ),
        );
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission required', 'Please allow photo library access.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 15,
        quality: 0.9,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.length) return;
      await Promise.all(
        result.assets.map((asset, index) =>
          processStudyMaterial({
            uri: asset.uri,
            name: asset.fileName || `image-${Date.now()}-${index + 1}.jpg`,
            mimeType: asset.mimeType || 'image/jpeg',
            size: asset.fileSize,
          }),
        ),
      );
    } catch { Alert.alert('Upload failed', 'Could not add image study material.'); } finally { setMaterialSelectionBusy(false); }
  }, [isMaterialPipelineBusy, processStudyMaterial]);

  const handlePickMaterialPdf = useCallback(async () => {
    if (isMaterialPipelineBusy) return;
    setMaterialSelectionBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      await processStudyMaterial({ uri: asset.uri, name: asset.name || `document-${Date.now()}.pdf`, mimeType: asset.mimeType || 'application/pdf', size: asset.size });
    } catch (error) { Alert.alert('PDF split failed', error instanceof Error ? error.message : 'Could not add PDF study material.'); } finally { setMaterialSelectionBusy(false); }
  }, [isMaterialPipelineBusy, processStudyMaterial]);

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
    handleRemoveMaterial: (id: string) => {
      setStudyMaterials((prev) => prev.filter((m) => m.id !== id));
    },
    handleRetryMaterial: (id: string) => {
      updateItem(id, { status: 'queued', error: undefined, attempts: 0 });
    },
    handleRetryFailedMaterials: () => {
      setStudyMaterials((prev) =>
        prev.map((m) =>
          m.status === 'error'
            ? { ...m, status: 'queued', error: undefined, attempts: 0 }
            : m,
        ),
      );
    },
    handleResumeQueue: () => {
      setQueuePausedUntilMs(null);
      setStudyMaterials((prev) =>
        prev.map((m) =>
          m.status === 'paused_rate_limited' ? { ...m, status: 'queued' } : m,
        ),
      );
    },
    handleCancelQueue: () => {
      setQueuePausedUntilMs(null);
      setStudyMaterials((prev) =>
        prev.map((m) =>
          m.status === 'queued' || m.status === 'processing' || m.status === 'paused_rate_limited'
            ? { ...m, status: 'error', error: 'Processing canceled by user.' }
            : m,
        ),
      );
    },
  };
}
