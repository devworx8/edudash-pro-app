/**
 * useDashVoiceMediaPicker — Image picker + scanner callbacks for Dash Voice.
 *
 * Extracted from app/screens/dash-voice.tsx as part of the WARP refactor.
 */

import { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import type { HomeworkScanResult } from '@/components/ai/HomeworkScanner';

type AttachedImage = {
  uri: string;
  base64: string;
  source: 'scanner' | 'library';
};

interface UseDashVoiceMediaPickerParams {
  setAttachedImage: (image: AttachedImage | null) => void;
  setScannerVisible: (visible: boolean) => void;
  refreshAutoScanBudget: () => Promise<void>;
}

export function useDashVoiceMediaPicker({
  setAttachedImage,
  setScannerVisible,
  refreshAutoScanBudget,
}: UseDashVoiceMediaPickerParams) {
  const pickMedia = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: false, quality: 0.7, base64: true,
      });
      if (!result.canceled && result.assets[0]?.base64) {
        setAttachedImage({ uri: result.assets[0].uri, base64: result.assets[0].base64, source: 'library' });
      }
    } catch { /* cancelled */ }
  }, [setAttachedImage]);

  const takePhoto = useCallback(async () => {
    setScannerVisible(true);
  }, [setScannerVisible]);

  const handleScannerScanned = useCallback((result: HomeworkScanResult) => {
    if (!result?.base64) return;
    setAttachedImage({
      uri: result.uri,
      base64: result.base64,
      source: 'scanner',
    });
    void refreshAutoScanBudget();
    setScannerVisible(false);
  }, [refreshAutoScanBudget, setAttachedImage, setScannerVisible]);

  return { pickMedia, takePhoto, handleScannerScanned };
}
