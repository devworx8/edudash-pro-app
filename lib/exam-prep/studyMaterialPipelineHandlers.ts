import { Alert, Platform } from 'react-native';
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
import {
  BASE_RETRY_MS,
  MAX_RETRY_MS,
  PART_COOLDOWN_MS,
} from '@/lib/exam-prep/studyMaterialPipelineTypes';
import type {
  EnqueueStudyMaterialFiles,
  PdfSplitProgress,
  QueuePauseSetter,
  SelectedLanguageName,
  StudyMaterial,
  StudyMaterialInputFile,
  UpdateStudyMaterialItem,
} from '@/lib/exam-prep/studyMaterialPipelineTypes';

function inferMimeType(name: string, fallback: string): string {
  const extension = name.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'pdf':
      return 'application/pdf';
    default:
      return fallback;
  }
}

export function normalizeMaterialMimeType(input: string | undefined, fileName: string): string {
  const normalized = String(input || '').trim().toLowerCase();
  if (
    !normalized ||
    normalized === 'image/*' ||
    normalized === '*/*' ||
    normalized === 'application/octet-stream'
  ) {
    return inferMimeType(fileName, 'image/jpeg');
  }
  return normalized;
}

export function isStaleWebSourceUri(uri: string | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith('blob:') || uri.startsWith('file:');
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const readerCtor = (globalThis as any).FileReader;
  if (!readerCtor) {
    throw new Error('Web file reader is unavailable.');
  }
  return await new Promise((resolve, reject) => {
    const reader = new readerCtor();
    reader.onerror = () => reject(new Error('Could not read selected file.'));
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Invalid file payload.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function processQueuedMaterialItem(params: {
  item: StudyMaterial;
  selectedLanguageName: SelectedLanguageName;
  updateItem: UpdateStudyMaterialItem;
  setQueuePausedUntilMs: QueuePauseSetter;
}): Promise<void> {
  const { item, selectedLanguageName, setQueuePausedUntilMs, updateItem } = params;
  updateItem(item.id, { status: 'processing', error: undefined });
  try {
    const base64 = await readFileAsBase64(item.sourceUri || '');
    const summary = await summarizeStudyMaterial({
      base64,
      mimeType: item.mimeType,
      fileName: item.name,
      selectedLanguageName,
    });
    updateItem(item.id, { status: 'ready', summary, error: undefined });
  } catch (error) {
    const info = await parseFunctionInvokeError(error, 'Failed to analyze study material.');
    const message = toMaterialErrorMessage(info);
    if (info.rateLimited && !info.quotaExceeded && item.attempts < MATERIAL_QUEUE_MAX_ATTEMPTS) {
      const retryMs = Math.min(
        MAX_RETRY_MS,
        (info.retryAfterSeconds
          ? info.retryAfterSeconds * 1000
          : BASE_RETRY_MS * Math.pow(2, item.attempts)) + Math.floor(Math.random() * 600),
      );
      updateItem(item.id, {
        status: 'paused_rate_limited',
        error: message,
        attempts: item.attempts + 1,
      });
      setQueuePausedUntilMs(Date.now() + retryMs);
    } else {
      updateItem(item.id, { status: 'error', error: message, attempts: item.attempts + 1 });
      if (info.quotaExceeded || info.rateLimited) {
        Alert.alert('Study material analysis unavailable', message);
      }
    }
  } finally {
    await sleep(PART_COOLDOWN_MS);
  }
}

export async function processStudyMaterialInput(params: {
  file: StudyMaterialInputFile;
  enqueueFiles: EnqueueStudyMaterialFiles;
  setPdfSplitProgress: (value: PdfSplitProgress) => void;
}): Promise<void> {
  const { enqueueFiles, file, setPdfSplitProgress } = params;
  let resolvedUri = file.uri;
  let sizeBytes = typeof file.size === 'number' && file.size > 0 ? file.size : 0;

  if (Platform.OS === 'web') {
    if (resolvedUri.startsWith('data:')) {
      if (sizeBytes <= 0) {
        const marker = resolvedUri.indexOf('base64,');
        if (marker >= 0) {
          const clean = resolvedUri.slice(marker + 7).replace(/\s+/g, '');
          const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
          sizeBytes = Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
        }
      }
    } else {
      const maybeBlob = file.webFile as Blob | undefined;
      if (typeof Blob !== 'undefined' && maybeBlob instanceof Blob) {
        sizeBytes = sizeBytes > 0 ? sizeBytes : maybeBlob.size;
        resolvedUri = await blobToDataUrl(maybeBlob);
      } else {
        const response = await fetch(resolvedUri);
        if (!response.ok) {
          throw new Error(`Could not read selected file (${response.status}).`);
        }
        const blob = await response.blob();
        sizeBytes = sizeBytes > 0 ? sizeBytes : blob.size;
        resolvedUri = await blobToDataUrl(blob);
      }
    }
  } else if (sizeBytes <= 0) {
    try {
      const info = await FileSystem.getInfoAsync(resolvedUri);
      sizeBytes = info.exists && typeof info.size === 'number' ? info.size : 0;
    } catch {
      sizeBytes = 0;
    }
  }

  if (sizeBytes > MAX_MATERIAL_SIZE_BYTES && file.mimeType !== 'application/pdf') {
    Alert.alert(
      'File too large',
      `This file is ${formatSizeMB(sizeBytes)}MB. Please use files up to ${MAX_MATERIAL_SIZE_MB}MB.`,
    );
    return;
  }
  if (file.mimeType !== 'application/pdf') {
    enqueueFiles([{ ...file, uri: resolvedUri, size: sizeBytes }]);
    return;
  }

  if (Platform.OS === 'web') {
    if (sizeBytes > MAX_MATERIAL_SIZE_BYTES) {
      Alert.alert(
        'PDF too large',
        `This PDF is ${formatSizeMB(sizeBytes)}MB. Please use a PDF up to ${MAX_MATERIAL_SIZE_MB}MB on web.`,
      );
      return;
    }
    enqueueFiles([{ ...file, uri: resolvedUri, size: sizeBytes }]);
    return;
  }

  Alert.alert(
    'Preparing PDF pages',
    `This PDF is ${formatSizeMB(sizeBytes)}MB. Dash will upload each page separately.`,
  );
  const parts = await splitPdfIntoSinglePages({ uri: resolvedUri, name: file.name, sizeBytes });
  if (parts.length === 0) throw new Error('No PDF pages were created.');
  parts.forEach((part, index) => {
    if (part.size > MAX_MATERIAL_SIZE_BYTES) {
      throw new Error(`Page ${index + 1} is still too large (${formatSizeMB(part.size)}MB).`);
    }
  });
  const partIds = enqueueFiles(parts);
  setPdfSplitProgress({
    fileName: file.name,
    totalParts: partIds.length,
    completedParts: 0,
    partIds,
  });
}

export async function pickMaterialImages(params: {
  isMaterialPipelineBusy: boolean;
  processStudyMaterial: (file: StudyMaterialInputFile) => Promise<void>;
}): Promise<void> {
  const { isMaterialPipelineBusy, processStudyMaterial } = params;
  if (isMaterialPipelineBusy) return;

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
          mimeType: normalizeMaterialMimeType(
            asset.mimeType,
            asset.name || `image-${Date.now()}-${index + 1}.jpg`,
          ),
          size: asset.size,
          webFile: (asset as any).file,
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
        mimeType: normalizeMaterialMimeType(
          asset.mimeType,
          asset.fileName || `image-${Date.now()}-${index + 1}.jpg`,
        ),
        size: asset.fileSize,
      }),
    ),
  );
}

export async function pickMaterialPdf(params: {
  isMaterialPipelineBusy: boolean;
  processStudyMaterial: (file: StudyMaterialInputFile) => Promise<void>;
}): Promise<void> {
  const { isMaterialPipelineBusy, processStudyMaterial } = params;
  if (isMaterialPipelineBusy) return;

  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return;
  const asset = result.assets[0];
  await processStudyMaterial({
    uri: asset.uri,
    name: asset.name || `document-${Date.now()}.pdf`,
    mimeType: normalizeMaterialMimeType(asset.mimeType, asset.name || `document-${Date.now()}.pdf`),
    size: asset.size,
    webFile: (asset as any).file,
  });
}
