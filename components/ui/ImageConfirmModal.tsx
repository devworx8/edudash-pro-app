/**
 * ImageConfirmModal
 * 
 * Reusable modal shown after image selection (gallery or camera).
 * Displays a preview of the selected image with:
 *   - Optional "Crop" button to center-crop using the configured aspect ratio
 *   - A configurable confirm button ("Set Photo", "Upload", "Send", etc.)
 *   - A cancel / close button
 *
 * Usage:
 *   <ImageConfirmModal
 *     visible={!!pendingImageUri}
 *     imageUri={pendingImageUri}
 *     onConfirm={(uri) => uploadImage(uri)}
 *     onCancel={() => setPendingImageUri(null)}
 *     confirmLabel="Set Photo"        // optional, default "Confirm"
 *     title="Preview Photo"           // optional, default "Preview"
 *     showCrop                        // optional – shows "Edit" button
 *     cropAspect={[1, 1]}             // optional – aspect ratio for crop
 *     loading={uploading}             // optional – shows spinner on confirm
 *   />
 */

import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ImageCropEditor } from './ImageCropEditor';
import { applySmartCrop, type SmartCropMode } from '@/lib/utils/smartCrop';
import { ModalLayer } from './ModalLayer';

// Safe spinner import
let EduDashSpinner: React.FC<any> = ({ size, color }: any) => null;
try {
  EduDashSpinner = require('@/components/ui/EduDashSpinner').default;
} catch {}

interface ImageConfirmModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** The URI of the image to preview */
  imageUri: string | null;
  /** Called when user taps the confirm button – receives the (potentially cropped) URI */
  onConfirm: (uri: string) => void;
  /** Called when user cancels / closes the modal */
  onCancel: () => void;
  /** Label for the confirm button (default: "Confirm") */
  confirmLabel?: string;
  /** Modal title (default: "Preview") */
  title?: string;
  /** Whether to show the edit/crop button (default: false) */
  showCrop?: boolean;
  /** Aspect ratio for the crop editor (default: undefined = free-form) */
  cropAspect?: [number, number];
  /** Show a loading spinner on the confirm button */
  loading?: boolean;
  /** Icon name for the confirm button (default: "checkmark-circle-outline") */
  confirmIcon?: keyof typeof Ionicons.glyphMap;
  /** Smart crop mode — auto-frames image on load. Only used when showCrop is true. */
  smartCropMode?: SmartCropMode;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PREVIEW_SIZE = Math.min(SCREEN_WIDTH - 64, 340);

export const ImageConfirmModal: React.FC<ImageConfirmModalProps> = ({
  visible,
  imageUri,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  title = 'Preview',
  showCrop = false,
  cropAspect,
  loading = false,
  confirmIcon = 'checkmark-circle-outline',
  smartCropMode = 'auto',
}) => {
  const [currentUri, setCurrentUri] = React.useState<string | null>(imageUri);
  const [originalUri, setOriginalUri] = React.useState<string | null>(imageUri);
  const [showCropEditor, setShowCropEditor] = React.useState(false);
  const [autoCropping, setAutoCropping] = React.useState(false);
  const [wasAutoCropped, setWasAutoCropped] = React.useState(false);

  // Sync external imageUri changes + apply smart auto-crop
  useEffect(() => {
    setOriginalUri(imageUri);
    setCurrentUri(imageUri);
    setWasAutoCropped(false);

    if (imageUri && showCrop && cropAspect) {
      setAutoCropping(true);
      applySmartCrop(imageUri, smartCropMode, cropAspect)
        .then((result) => {
          if (result.wasAutoCropped) {
            setCurrentUri(result.uri);
            setWasAutoCropped(true);
          }
        })
        .catch(() => {
          // Fallback: use original image if smart crop fails
        })
        .finally(() => setAutoCropping(false));
    }
  }, [imageUri, showCrop, cropAspect, smartCropMode]);

  const handleAdjust = useCallback(() => {
    setShowCropEditor(true);
  }, []);

  const handleCropDone = useCallback((croppedUri: string) => {
    setCurrentUri(croppedUri);
    setWasAutoCropped(true);
    setShowCropEditor(false);
  }, []);

  const handleReset = useCallback(() => {
    setCurrentUri(originalUri);
    setWasAutoCropped(false);
  }, [originalUri]);

  const handleConfirm = useCallback(() => {
    if (currentUri) {
      onConfirm(currentUri);
    }
  }, [currentUri, onConfirm]);

  if (!visible || !currentUri) return null;

  return (
    <ModalLayer
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeBtn} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
              <Ionicons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Image preview */}
          <View style={styles.previewContainer}>
            {autoCropping && (
              <View style={styles.autoCropOverlay}>
                <ActivityIndicator color="#3b82f6" size="small" />
                <Text style={styles.autoCropText}>Auto-framing...</Text>
              </View>
            )}
            <Image
              source={{ uri: currentUri }}
              style={[styles.preview, autoCropping && { opacity: 0.5 }]}
              resizeMode="contain"
            />
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            {showCrop && (
              <View style={styles.adjustRow}>
                <TouchableOpacity
                  style={styles.adjustBtn}
                  onPress={handleAdjust}
                  activeOpacity={0.7}
                >
                  <Ionicons name="options-outline" size={18} color="#3b82f6" />
                  <Text style={styles.adjustText}>Adjust</Text>
                </TouchableOpacity>
                {wasAutoCropped && (
                  <TouchableOpacity
                    style={styles.resetBtn}
                    onPress={handleReset}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh-outline" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[styles.confirmBtn, !showCrop && { flex: 1 }]}
              onPress={handleConfirm}
              disabled={loading || autoCropping}
              activeOpacity={0.8}
            >
              {loading ? (
                <EduDashSpinner size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name={confirmIcon} size={20} color="#fff" />
                  <Text style={styles.confirmText}>{confirmLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      
      {/* Interactive crop editor */}
      <ImageCropEditor
        visible={showCropEditor}
        imageUri={currentUri}
        aspectRatio={cropAspect}
        onDone={handleCropDone}
        onCancel={() => setShowCropEditor(false)}
      />
    </ModalLayer>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  closeBtn: {
    padding: 4,
  },
  previewContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  preview: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: 14,
    backgroundColor: '#0f172a',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingTop: 8,
  },
  autoCropOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  autoCropText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adjustBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
    backgroundColor: 'rgba(59, 130, 246, 0.06)',
  },
  adjustText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3b82f6',
  },
  resetBtn: {
    padding: 8,
    borderRadius: 8,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#3b82f6',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

export default ImageConfirmModal;
