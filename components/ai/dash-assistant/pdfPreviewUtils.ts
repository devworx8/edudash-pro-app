import { Platform, Alert, Linking } from 'react-native';
import { router } from 'expo-router';

export async function openPdfPreview(
  targetUrl: string,
  title?: string,
  storagePath?: string,
): Promise<void> {
  const safeUrl = String(targetUrl || '').trim();
  const safeStoragePath = String(storagePath || '').trim();
  if (!safeUrl && !safeStoragePath) return;
  if (Platform.OS !== 'web') {
    try {
      router.push({
        pathname: '/screens/pdf-viewer',
        params: {
          ...(safeUrl ? { url: safeUrl } : {}),
          title: title || 'Generated PDF',
          ...(safeStoragePath ? { storagePath: safeStoragePath } : {}),
        },
      } as any);
      return;
    } catch {
      // fall through to external open
    }
  }
  try {
    if (!safeUrl) {
      Alert.alert('Unable to preview PDF', 'Please regenerate the PDF to refresh the preview link.');
      return;
    }
    if (Platform.OS === 'web') {
      window.open(safeUrl, '_blank');
    } else {
      const canOpen = await Linking.canOpenURL(safeUrl);
      if (!canOpen) throw new Error('UNSUPPORTED_URL');
      await Linking.openURL(safeUrl);
    }
  } catch {
    Alert.alert('Unable to preview PDF', 'Please try again from a stable connection.');
  }
}

const GENERATED_PDFS_PUBLIC_URL_REGEX = /\/storage\/v1\/object\/public\/generated-pdfs\//i;

export function isGeneratedPdfsPublicUrl(value?: string | null): boolean {
  const text = String(value || '').trim();
  if (!text) return false;
  return GENERATED_PDFS_PUBLIC_URL_REGEX.test(text);
}

export function sanitizeGeneratedPdfUrl(
  value: string | null | undefined,
  options?: { allowGeneratedPublic?: boolean },
): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (isGeneratedPdfsPublicUrl(text) && options?.allowGeneratedPublic !== true) {
    return null;
  }
  return text;
}

export function resolvePdfPreviewTarget(params: {
  isPdfToolOperation: boolean;
  isToolOperation: boolean;
  toolDownloadUrl?: string | null;
  toolStoragePath?: string | null;
  extractedPdfUrl?: string | null;
  attachmentPdfUrl?: string | null;
  assistantPdfUrl?: string | null;
}): { url: string | null; storagePath: string | null } {
  const {
    isPdfToolOperation,
    isToolOperation,
    toolDownloadUrl,
    toolStoragePath,
    extractedPdfUrl,
    attachmentPdfUrl,
    assistantPdfUrl,
  } = params;

  if (isPdfToolOperation) {
    return {
      url: sanitizeGeneratedPdfUrl(toolDownloadUrl, { allowGeneratedPublic: true }),
      storagePath: String(toolStoragePath || '').trim() || null,
    };
  }

  return {
    url:
      sanitizeGeneratedPdfUrl(extractedPdfUrl) ||
      sanitizeGeneratedPdfUrl(attachmentPdfUrl) ||
      (!isToolOperation ? sanitizeGeneratedPdfUrl(assistantPdfUrl) : null),
    storagePath: null,
  };
}
