/**
 * TTS Constants — Single Source of Truth
 *
 * All TTS rate, pitch, and timing values live here.
 * Every consumer (useVoiceTTS, DashVoiceController, tts-proxy) MUST
 * import from this module instead of defining local constants.
 *
 * @see MASTER_ENGINEERING_PLAN.md Sprint 3.1 / Sprint 8.1
 * @module lib/dash-ai/ttsConstants
 */

// ── Azure Speech Rates ──────────────────────────────────────────────
// Azure SSML <prosody rate="X%"> where 0 = normal, negative = slower.

/** Normal speech rate — slightly faster than Azure default for snappier responses */
export const AZURE_RATE_NORMAL = 8;

/** Phonics sentence-level rate: keep full sentence delivery at normal pace */
export const AZURE_RATE_PHONICS = 0;

/** Phonics phoneme-level rate: applied to individual /s/, /m/ SSML tags */
export const AZURE_RATE_PHONEME = -18;

// ── Device TTS Rates ────────────────────────────────────────────────
// expo-speech rate: 1.0 = normal.

/** Device TTS normal rate — matches Azure 8% bump */
export const DEVICE_RATE_NORMAL = 1.08;

/** Device TTS phonics rate: keep sentence-level pacing natural */
export const DEVICE_RATE_PHONICS = 1.0;

// ── Phonics SSML Break Durations ────────────────────────────────────

/** Pause after a single phoneme marker (e.g. /s/) in ms */
export const PHONICS_MARKER_BREAK_MS = 220;

/** Pause between blend segments (/k/ - /a/ - /t/) in ms */
export const PHONICS_BLEND_SEGMENT_BREAK_MS = 250;

/** Pause after the full blend before speaking the word in ms */
export const PHONICS_BLEND_FINAL_BREAK_MS = 320;

/** Fallback pause for individual letters in ms */
export const PHONICS_FALLBACK_LETTER_BREAK_MS = 220;
