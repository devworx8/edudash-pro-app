/**
 * useDashVoiceFlowMode — Auto-correct with visual feedback for voice input.
 *
 * When Flow Mode is enabled, the raw transcript is shown briefly alongside
 * the auto-corrected version so the user can SEE the corrections applied
 * (filler removal, grammar fixes, STT dictionary). The corrected text is
 * then auto-sent after a short delay (no manual confirm step).
 *
 * This mirrors Wispr Flow's auto-correct-and-send behaviour.
 *
 * @module hooks/dash-voice/useDashVoiceFlowMode
 */

import { useState, useCallback, useRef, useEffect } from 'react';

/** How long (ms) to show the correction flash before auto-clearing. */
const CORRECTION_FLASH_MS = 1800;

export interface FlowCorrectionFlash {
  /** Raw transcript before correction. */
  raw: string;
  /** Auto-corrected transcript (what actually got sent). */
  corrected: string;
  /** Timestamp when the correction was displayed. */
  shownAt: number;
}

export interface FlowModeReturn {
  /** Whether Flow Mode (auto-correct display) is enabled. */
  enabled: boolean;
  /** Toggle Flow Mode on/off. */
  setEnabled: (enabled: boolean) => void;
  /**
   * The latest correction flash to display.
   * Non-null for CORRECTION_FLASH_MS after a correction, then auto-clears.
   */
  correctionFlash: FlowCorrectionFlash | null;
  /**
   * Record a correction event (called by handleVoiceInput after formatting).
   * Only sets the flash if the corrected text differs from raw.
   */
  recordCorrection: (raw: string, corrected: string) => void;
}

export function useDashVoiceFlowMode(): FlowModeReturn {
  const [enabled, setEnabled] = useState(false);
  const [correctionFlash, setCorrectionFlash] = useState<FlowCorrectionFlash | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recordCorrection = useCallback((raw: string, corrected: string) => {
    // Only flash if there's an actual difference
    if (!raw || raw.trim() === corrected.trim()) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setCorrectionFlash({ raw: raw.trim(), corrected: corrected.trim(), shownAt: Date.now() });
    timerRef.current = setTimeout(() => setCorrectionFlash(null), CORRECTION_FLASH_MS);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    enabled,
    setEnabled,
    correctionFlash,
    recordCorrection,
  };
}
