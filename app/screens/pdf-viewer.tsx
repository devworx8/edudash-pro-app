/**
 * PDF Viewer Screen
 * 
 * Displays PDF documents using react-native-pdf with offline caching support.
 * Includes page navigation, zoom controls, and reading progress tracking.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { logger } from '@/lib/logger';
import {
  extractGeneratedPdfStoragePathFromUrl,
  isGeneratedPdfPublicUrl,
  isSupportedPdfContentType,
} from '@/lib/pdf-viewer-utils';

const TAG = 'PDFViewer';
const GENERATED_PDF_BUCKET = 'generated-pdfs';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { PDFViewer as PDFViewerWebView } from '@/components/pdf/PDFViewer';
// Conditional import for react-native-pdf (requires native module)
let Pdf: any = null;
try {
  Pdf = require('react-native-pdf').default;
} catch (error) {
  console.warn('[PDFViewer] react-native-pdf not available:', error);
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PDFViewerParams {
  url?: string;
  storagePath?: string;
  localUri?: string;
  title: string;
  bookId?: string;
}

export default function PDFViewerScreen() {
  const params = useLocalSearchParams() as Partial<PDFViewerParams>;
  const { theme } = useTheme();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [remotePdfUrl, setRemotePdfUrl] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  
  const pdfRef = useRef<any>(null);

  const rawUrl = Array.isArray(params.url) ? params.url[0] : params.url;
  const rawStoragePath = Array.isArray(params.storagePath) ? params.storagePath[0] : params.storagePath;
  const rawLocalUri = Array.isArray(params.localUri) ? params.localUri[0] : params.localUri;
  const rawTitle = Array.isArray(params.title) ? params.title[0] : params.title;
  const rawBookId = Array.isArray(params.bookId) ? params.bookId[0] : params.bookId;
  const url = typeof rawUrl === 'string' ? rawUrl : '';
  const storagePath = typeof rawStoragePath === 'string' ? rawStoragePath : '';
  const localUriParam = typeof rawLocalUri === 'string' ? rawLocalUri : '';
  const title = typeof rawTitle === 'string' ? rawTitle : '';
  const bookId = typeof rawBookId === 'string' ? rawBookId : undefined;

  const getFilenameFromSource = useCallback((targetUrl: string, targetStoragePath?: string) => {
    const fromStoragePath = String(targetStoragePath || '').trim();
    const source = fromStoragePath || String(targetUrl || '').trim();
    if (!source) return 'book.pdf';
    const withoutQuery = source.split('?')[0].split('#')[0];
    const baseName = withoutQuery.split('/').pop() || 'book.pdf';
    const decoded = decodeURIComponent(baseName);
    return decoded.endsWith('.pdf') ? decoded : `${decoded || 'book'}.pdf`;
  }, []);

  const removeLocalFileIfExists = useCallback(async (targetPath: string) => {
    try {
      const info = await FileSystem.getInfoAsync(targetPath);
      if (info.exists) {
        await FileSystem.deleteAsync(targetPath, { idempotent: true });
      }
    } catch {
      // Ignore cleanup failures.
    }
  }, []);

  const hasPdfMagicHeader = useCallback(async (targetPath: string): Promise<boolean> => {
    try {
      const info = await FileSystem.getInfoAsync(targetPath);
      if (!info.exists || (typeof info.size === 'number' && info.size <= 0)) return false;

      const headerBase64 = await FileSystem.readAsStringAsync(targetPath, {
        encoding: FileSystem.EncodingType.Base64,
        position: 0,
        length: 8,
      } as any);

      return /^JVBERi0/i.test(String(headerBase64 || ''));
    } catch (inspectError) {
      logger.warn(TAG, 'Failed to inspect PDF header:', inspectError);
      return false;
    }
  }, []);

  const formatPdfLoadError = useCallback((rawError: unknown): string => {
    const message = String((rawError as any)?.message || rawError || '').toLowerCase();
    if (message.includes('expired') || message.includes('regenerate')) {
      return 'This PDF preview link expired. Return to Dash and regenerate the PDF preview.';
    }
    if (message.includes('http 404') || message.includes('404')) {
      return 'This PDF link is invalid or expired. Please regenerate the PDF and try again.';
    }
    if (
      message.includes('expected a pdf') ||
      message.includes('not a valid pdf') ||
      message.includes('not in pdf format')
    ) {
      return 'The link did not return a valid PDF file. Please regenerate the PDF and try again.';
    }
    if (message.includes('network') || message.includes('timeout') || message.includes('fetch')) {
      return 'Unable to download the PDF right now. Check your connection and retry.';
    }
    return 'Unable to open this PDF preview. Please regenerate the PDF and try again.';
  }, []);

  const resolveDownloadTarget = useCallback(async (): Promise<{
    downloadUrl: string;
    resolvedStoragePath: string | null;
  }> => {
    const explicitStoragePath = String(storagePath || '').trim();
    const urlStoragePath = extractGeneratedPdfStoragePathFromUrl(url);
    const resolvedStoragePath = explicitStoragePath || urlStoragePath || null;
    const isLegacyGeneratedPublicUrl = isGeneratedPdfPublicUrl(url);

    if (resolvedStoragePath) {
      try {
        const { data, error } = await supabase.storage
          .from(GENERATED_PDF_BUCKET)
          .createSignedUrl(resolvedStoragePath, 60 * 60);
        if (error) throw error;
        const signedUrl = String(data?.signedUrl || '').trim();
        if (signedUrl) {
          return { downloadUrl: signedUrl, resolvedStoragePath };
        }
      } catch (error) {
        logger.warn(TAG, 'Failed to refresh signed URL from storage path', {
          storagePath: resolvedStoragePath,
          error: String((error as any)?.message || error || 'unknown_error'),
        });
        if (!url || isLegacyGeneratedPublicUrl) {
          throw new Error('This preview link has expired. Please regenerate the PDF and try again.');
        }
      }
    }

    const fallbackUrl = String(url || '').trim();
    if (!fallbackUrl) {
      throw new Error('No PDF URL provided');
    }

    if (isLegacyGeneratedPublicUrl) {
      throw new Error('This preview link has expired. Please regenerate the PDF and try again.');
    }

    return {
      downloadUrl: fallbackUrl,
      resolvedStoragePath,
    };
  }, [storagePath, url]);

  // Check if PDF is available locally
  const checkLocalCache = useCallback(async (targetUrl: string, targetStoragePath?: string | null) => {
    if (!targetUrl && !targetStoragePath) return null;

    try {
      const filename = getFilenameFromSource(targetUrl, targetStoragePath || undefined);
      const localPath = `${FileSystem.cacheDirectory}ebooks/${filename}`;
      
      const info = await FileSystem.getInfoAsync(localPath);
      if (info.exists) {
        const cachedFileIsValid = await hasPdfMagicHeader(localPath);
        if (cachedFileIsValid) {
          logger.debug(TAG, 'Using cached PDF:', localPath);
          return localPath;
        }
        logger.warn(TAG, 'Removing invalid cached PDF:', localPath);
        await removeLocalFileIfExists(localPath);
      }
    } catch (error) {
      console.warn('[PDFViewer] Cache check error:', error);
    }
    
    return null;
  }, [getFilenameFromSource, hasPdfMagicHeader, removeLocalFileIfExists]);

  // Download and cache PDF
  const downloadPdf = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDownloadProgress(0);

    try {
      const candidateLocalUri = String(localUriParam || '').trim();
      if (candidateLocalUri) {
        setRemotePdfUrl(candidateLocalUri);
        setLocalUri(candidateLocalUri);
        setLoading(false);
        return;
      }

      const resolved = await resolveDownloadTarget();
      const targetUrl = resolved.downloadUrl;
      const resolvedStoragePath = resolved.resolvedStoragePath;
      setRemotePdfUrl(targetUrl);

      // First check cache
      const cached = await checkLocalCache(targetUrl, resolvedStoragePath);
      if (cached) {
        setLocalUri(cached);
        setLoading(false);
        return;
      }

      // Create cache directory
      const cacheDir = `${FileSystem.cacheDirectory}ebooks`;
      const dirInfo = await FileSystem.getInfoAsync(cacheDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
      }

      // Download with progress
      const filename = getFilenameFromSource(targetUrl, resolvedStoragePath || undefined);
      const localPath = `${cacheDir}/${filename}`;

      const downloadResumable = FileSystem.createDownloadResumable(
        targetUrl,
        localPath,
        {},
        (downloadProgress) => {
          const expectedBytes = downloadProgress.totalBytesExpectedToWrite;
          if (expectedBytes > 0) {
            const progress = downloadProgress.totalBytesWritten / expectedBytes;
            setDownloadProgress(Math.round(progress * 100));
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (result?.uri) {
        const status = Number((result as any)?.status || 0);
        if (status && (status < 200 || status >= 300)) {
          await removeLocalFileIfExists(result.uri);
          throw new Error(`Download failed with HTTP ${status}`);
        }

        const responseHeaders = ((result as any)?.headers || {}) as Record<string, unknown>;
        const contentType = String(
          responseHeaders['content-type'] ||
            responseHeaders['Content-Type'] ||
            '',
        ).toLowerCase();
        if (!isSupportedPdfContentType(contentType)) {
          await removeLocalFileIfExists(result.uri);
          throw new Error(`Expected a PDF file but received ${contentType}`);
        }

        const isPdfDocument = await hasPdfMagicHeader(result.uri);
        if (!isPdfDocument) {
          await removeLocalFileIfExists(result.uri);
          throw new Error('Downloaded file is not a valid PDF');
        }

        setLocalUri(result.uri);
        logger.debug(TAG, 'Downloaded PDF to:', result.uri);
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      console.error('[PDFViewer] Download error:', error);
      setLocalUri(null);
      setError(formatPdfLoadError(error));
    } finally {
      setLoading(false);
    }
  }, [
    localUriParam,
    resolveDownloadTarget,
    checkLocalCache,
    getFilenameFromSource,
    removeLocalFileIfExists,
    hasPdfMagicHeader,
    formatPdfLoadError,
  ]);

  useEffect(() => {
    downloadPdf();
  }, [downloadPdf]);

  // Save reading progress
  const saveProgress = useCallback(async () => {
    if (!bookId || currentPage <= 1) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('reading_progress').upsert({
        user_id: user.id,
        textbook_id: bookId,
        last_page: currentPage,
        total_pages: totalPages,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,textbook_id',
      });
    } catch (error) {
      console.warn('[PDFViewer] Failed to save progress:', error);
    }
  }, [bookId, currentPage, totalPages]);

  // Save progress when leaving
  useEffect(() => {
    return () => {
      saveProgress();
    };
  }, [saveProgress]);

  // Zoom controls
  const zoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3.0));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => setScale(1.0);

  // Page navigation
  const goToPage = (page: number) => {
    if (pdfRef.current && page >= 1 && page <= totalPages) {
      pdfRef.current.setPage(page);
    }
  };

  // If react-native-pdf is not available, use WebView fallback when we have a URL
  if (!Pdf) {
    const fallbackUri = remotePdfUrl;
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen
          options={{
            title: title || 'PDF Viewer',
            headerLeft: () => (
              <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
                <Ionicons name="arrow-back" size={24} color={theme.text} />
              </TouchableOpacity>
            ),
          }}
        />
        {loading && (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.muted }]}>
              {downloadProgress > 0 && downloadProgress < 100
                ? `Downloading... ${downloadProgress}%`
                : 'Loading PDF...'}
            </Text>
          </View>
        )}
        {error && !loading && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: theme.primary }]}
              onPress={downloadPdf}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: theme.surfaceVariant, marginTop: 8 }]}
              onPress={() => router.back()}
            >
              <Text style={styles.retryButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}
        {!loading && !error && fallbackUri ? (
          <View style={{ flex: 1 }}>
            <PDFViewerWebView
              uri={fallbackUri}
              filename={getFilenameFromSource(fallbackUri, storagePath || undefined)}
              onClose={() => router.back()}
            />
          </View>
        ) : null}
        {!loading && !error && !fallbackUri && (
          <View style={styles.fallbackContainer}>
            <Ionicons name="document-text-outline" size={64} color={theme.muted} />
            <Text style={[styles.fallbackTitle, { color: theme.text }]}>
              PDF Viewer Unavailable
            </Text>
            <Text style={[styles.fallbackText, { color: theme.muted }]}>
              PDF viewing requires a development build or a valid PDF URL.
            </Text>
            <TouchableOpacity
              style={[styles.fallbackButton, { backgroundColor: theme.primary }]}
              onPress={() => router.back()}
            >
              <Text style={styles.fallbackButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: title || 'PDF Viewer',
          headerRight: () => (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={zoomOut} style={styles.headerButton}>
                <Ionicons name="remove" size={24} color={theme.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={resetZoom} style={styles.headerButton}>
                <Text style={[styles.zoomText, { color: theme.primary }]}>
                  {Math.round(scale * 100)}%
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={zoomIn} style={styles.headerButton}>
                <Ionicons name="add" size={24} color={theme.primary} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {/* Loading State */}
      {loading && (
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.muted }]}>
            {downloadProgress > 0 && downloadProgress < 100
              ? `Downloading... ${downloadProgress}%`
              : 'Loading PDF...'}
          </Text>
        </View>
      )}

      {/* Error State */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            onPress={downloadPdf}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* PDF View */}
      {!loading && !error && localUri && (
        <Pdf
          ref={pdfRef}
          source={{ uri: localUri }}
          style={styles.pdf}
          scale={scale}
          minScale={0.5}
          maxScale={3.0}
          spacing={8}
          fitPolicy={0}
          enablePaging={true}
          horizontal={false}
          onLoadComplete={(numberOfPages: number) => {
            setTotalPages(numberOfPages);
            logger.debug(TAG, 'Loaded', numberOfPages, 'pages');
          }}
          onPageChanged={(page: number) => {
            setCurrentPage(page);
          }}
          onError={(error: any) => {
            console.error('[PDFViewer] Error:', error);
            setError(formatPdfLoadError(error));
          }}
          trustAllCerts={false}
        />
      )}

      {/* Page Indicator */}
      {!loading && totalPages > 0 && (
        <View style={[styles.pageIndicator, { backgroundColor: theme.surface }]}>
          <TouchableOpacity
            onPress={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            style={styles.pageButton}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={currentPage <= 1 ? theme.muted : theme.primary}
            />
          </TouchableOpacity>

          <Text style={[styles.pageText, { color: theme.text }]}>
            {currentPage} / {totalPages}
          </Text>

          <TouchableOpacity
            onPress={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            style={styles.pageButton}
          >
            <Ionicons
              name="chevron-forward"
              size={24}
              color={currentPage >= totalPages ? theme.muted : theme.primary}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 8,
  },
  zoomText: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 48,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  pdf: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  pageIndicator: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 24,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  pageButton: {
    padding: 8,
  },
  pageText: {
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 16,
  },
  fallbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  fallbackText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  fallbackButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  fallbackButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
