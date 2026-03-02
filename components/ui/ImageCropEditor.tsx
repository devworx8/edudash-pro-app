/**
 * ImageCropEditor
 *
 * Interactive image crop component with pinch-to-zoom and pan gestures.
 * The image sits behind a fixed crop frame – users drag and zoom the image
 * to frame the area they want. On confirm, the visible region is exported
 * via expo-image-manipulator.
 *
 * Works with react-native-gesture-handler (already in the project).
 *
 * Usage:
 *   <ImageCropEditor
 *     visible={showCropEditor}
 *     imageUri={uri}
 *     aspectRatio={[1, 1]}       // or [4,3], [16,9], undefined for free
 *     onDone={(croppedUri) => { ... }}
 *     onCancel={() => setShowCropEditor(false)}
 *   />
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ModalLayer } from './ModalLayer';

// Safe spinner import
let EduDashSpinner: React.FC<any> = () => null;
try {
  EduDashSpinner = require('@/components/ui/EduDashSpinner').default;
} catch {}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CROP_PADDING = 24;
// Maximum crop frame size (leave room for header + footer)
const MAX_CROP_SIZE = Math.min(SCREEN_W - CROP_PADDING * 2, SCREEN_H * 0.55);

interface ImageCropEditorProps {
  visible: boolean;
  imageUri: string | null;
  /** Aspect ratio as [width, height]. undefined = square (1:1). */
  aspectRatio?: [number, number];
  onDone: (croppedUri: string) => void;
  onCancel: () => void;
}

export const ImageCropEditor: React.FC<ImageCropEditorProps> = ({
  visible,
  imageUri,
  aspectRatio = [1, 1],
  onDone,
  onCancel,
}) => {
  // Original image dimensions
  const [imgW, setImgW] = useState(1);
  const [imgH, setImgH] = useState(1);
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Crop frame dimensions (fixed, centered)
  const aspectW = aspectRatio[0];
  const aspectH = aspectRatio[1];
  const ratio = aspectW / aspectH;
  let cropW = MAX_CROP_SIZE;
  let cropH = MAX_CROP_SIZE;
  if (ratio >= 1) {
    cropH = cropW / ratio;
  } else {
    cropW = cropH * ratio;
  }

  // Pan/zoom state ------------------------------------
  // We track the *image* offset relative to the crop frame center.
  const scaleRef = useRef(1);
  const baseScaleRef = useRef(1);
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);
  const baseOffsetXRef = useRef(0);
  const baseOffsetYRef = useRef(0);
  const lastDistanceRef = useRef(0);

  // Animated values for smooth rendering
  const animScale = useRef(new Animated.Value(1)).current;
  const animX = useRef(new Animated.Value(0)).current;
  const animY = useRef(new Animated.Value(0)).current;

  // Image display size (fit inside crop frame at scale=1)
  const [displayW, setDisplayW] = useState(cropW);
  const [displayH, setDisplayH] = useState(cropH);

  // Load image dimensions on change
  useEffect(() => {
    if (!imageUri || !visible) return;
    setReady(false);
    Image.getSize(
      imageUri,
      (w, h) => {
        setImgW(w);
        setImgH(h);
        // Fit image so it *covers* the crop frame (fill, not fit)
        const scaleToFillW = cropW / w;
        const scaleToFillH = cropH / h;
        const minScale = Math.max(scaleToFillW, scaleToFillH);
        const dw = w * minScale;
        const dh = h * minScale;
        setDisplayW(dw);
        setDisplayH(dh);
        // Reset transforms
        scaleRef.current = 1;
        baseScaleRef.current = 1;
        offsetXRef.current = 0;
        offsetYRef.current = 0;
        animScale.setValue(1);
        animX.setValue(0);
        animY.setValue(0);
        setReady(true);
      },
      () => setReady(true),
    );
  }, [imageUri, visible]);

  // Clamp so the image always covers the crop frame
  const clampOffset = useCallback(
    (ox: number, oy: number, s: number) => {
      const scaledW = displayW * s;
      const scaledH = displayH * s;
      const maxX = Math.max(0, (scaledW - cropW) / 2);
      const maxY = Math.max(0, (scaledH - cropH) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, ox)),
        y: Math.min(maxY, Math.max(-maxY, oy)),
      };
    },
    [displayW, displayH, cropW, cropH],
  );

  // PanResponder for drag + pinch-to-zoom
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (_, gestureState) => {
        baseOffsetXRef.current = offsetXRef.current;
        baseOffsetYRef.current = offsetYRef.current;
        baseScaleRef.current = scaleRef.current;
        lastDistanceRef.current = 0;
      },

      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches || [];
        if (touches.length >= 2) {
          // Pinch-to-zoom
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (lastDistanceRef.current > 0) {
            const pinchScale = dist / lastDistanceRef.current;
            const newScale = Math.min(5, Math.max(1, baseScaleRef.current * pinchScale));
            scaleRef.current = newScale;
            animScale.setValue(newScale);
            // Re-clamp offset at new scale
            const clamped = clampOffset(offsetXRef.current, offsetYRef.current, newScale);
            offsetXRef.current = clamped.x;
            offsetYRef.current = clamped.y;
            animX.setValue(clamped.x);
            animY.setValue(clamped.y);
          } else {
            lastDistanceRef.current = dist;
            baseScaleRef.current = scaleRef.current;
          }
          lastDistanceRef.current = dist;
        } else {
          // Pan (single finger)
          const rawX = baseOffsetXRef.current + gestureState.dx;
          const rawY = baseOffsetYRef.current + gestureState.dy;
          const clamped = clampOffset(rawX, rawY, scaleRef.current);
          offsetXRef.current = clamped.x;
          offsetYRef.current = clamped.y;
          animX.setValue(clamped.x);
          animY.setValue(clamped.y);
        }
      },

      onPanResponderRelease: () => {
        lastDistanceRef.current = 0;
        // Snap scale back to 1 if below
        if (scaleRef.current < 1) {
          scaleRef.current = 1;
          Animated.spring(animScale, { toValue: 1, useNativeDriver: true }).start();
          const clamped = clampOffset(offsetXRef.current, offsetYRef.current, 1);
          offsetXRef.current = clamped.x;
          offsetYRef.current = clamped.y;
          Animated.spring(animX, { toValue: clamped.x, useNativeDriver: true }).start();
          Animated.spring(animY, { toValue: clamped.y, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  // Export the visible crop region via manipulateAsync
  const handleDone = useCallback(async () => {
    if (!imageUri || processing) return;
    setProcessing(true);
    try {
      const s = scaleRef.current;
      const scaledW = displayW * s;
      const scaledH = displayH * s;
      const ox = offsetXRef.current;
      const oy = offsetYRef.current;

      // Image top-left relative to crop frame top-left (in display pixels)
      const imgLeft = (cropW - scaledW) / 2 + ox;
      const imgTop = (cropH - scaledH) / 2 + oy;

      // Crop region in display pixels
      const cropLeft = -imgLeft;
      const cropTop = -imgTop;

      // Convert to original image pixel coordinates
      const displayToOriginal = imgW / (displayW * s);
      const originX = Math.max(0, Math.round(cropLeft * displayToOriginal));
      const originY = Math.max(0, Math.round(cropTop * displayToOriginal));
      const origCropW = Math.min(imgW - originX, Math.round(cropW * displayToOriginal));
      const origCropH = Math.min(imgH - originY, Math.round(cropH * displayToOriginal));

      const result = await manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX,
              originY,
              width: Math.max(1, origCropW),
              height: Math.max(1, origCropH),
            },
          },
        ],
        { compress: 0.9, format: SaveFormat.JPEG },
      );

      onDone(result.uri);
    } catch (err) {
      console.error('[ImageCropEditor] crop failed:', err);
    } finally {
      setProcessing(false);
    }
  }, [imageUri, displayW, displayH, cropW, cropH, imgW, imgH, onDone, processing]);

  // Reset zoom
  const handleReset = useCallback(() => {
    scaleRef.current = 1;
    offsetXRef.current = 0;
    offsetYRef.current = 0;
    Animated.parallel([
      Animated.spring(animScale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(animX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(animY, { toValue: 0, useNativeDriver: true }),
    ]).start();
  }, []);

  if (!visible || !imageUri) return null;

  return (
    <ModalLayer
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color="#e2e8f0" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Crop Photo</Text>
          <TouchableOpacity onPress={handleReset} style={styles.headerBtn}>
            <Ionicons name="refresh" size={22} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Crop area */}
        <View style={styles.cropWrapper}>
          {/* Dark overlay with hole */}
          <View style={[styles.cropFrame, { width: cropW, height: cropH }]}>
            {ready && (
              <View
                style={styles.gestureArea}
                {...panResponder.panHandlers}
              >
                <Animated.Image
                  source={{ uri: imageUri }}
                  style={{
                    width: displayW,
                    height: displayH,
                    transform: [
                      { translateX: animX },
                      { translateY: animY },
                      { scale: animScale },
                    ],
                  }}
                  resizeMode="contain"
                />
              </View>
            )}
            {/* Grid overlay */}
            <View style={styles.gridOverlay} pointerEvents="none">
              <View style={[styles.gridLineH, { top: '33.33%' }]} />
              <View style={[styles.gridLineH, { top: '66.66%' }]} />
              <View style={[styles.gridLineV, { left: '33.33%' }]} />
              <View style={[styles.gridLineV, { left: '66.66%' }]} />
            </View>
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>

        {/* Instructions */}
        <Text style={styles.hint}>Drag to move · Pinch to zoom</Text>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDone}
            style={[styles.doneBtn, processing && { opacity: 0.6 }]}
            disabled={processing}
          >
            {processing ? (
              <EduDashSpinner size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={22} color="#fff" />
                <Text style={styles.doneText}>Done</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ModalLayer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 40,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  cropWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropFrame: {
    overflow: 'hidden',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: '#111',
  },
  gestureArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#fff',
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 2,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 2,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 2,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 2,
  },
  hint: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 8,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94a3b8',
  },
  doneBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#3b82f6',
  },
  doneText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

export default ImageCropEditor;
