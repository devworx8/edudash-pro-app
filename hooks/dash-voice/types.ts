/**
 * Shared types and constants for the dash-voice hook family.
 */

import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import type { ResolvedDashPolicy } from '@/lib/dash-ai/DashPolicyResolver';
import type { WhiteboardContent } from '@/components/ai/DashTutorWhiteboard';

export type OrbPdfArtifact = { url: string; title: string; filename?: string | null };

export type DashVoiceDictationProbe = {
  run_id?: string;
  platform: 'mobile' | 'web';
  source: string;
  stt_start_at?: string;
  first_partial_at?: string;
  final_transcript_at?: string;
  commit_at?: string;
};

export type ConversationEntry = { role: 'user' | 'assistant'; content: string };

export type AttachedImage = { uri: string; base64: string; source: 'scanner' | 'library' } | null;

export interface UseDashVoiceSendMessageParams {
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  setLastResponse: (v: string) => void;
  setStreamingText: (v: string) => void;
  setWhiteboardContent: (v: WhiteboardContent | null) => void;
  setConversationHistory: (v: ConversationEntry[]) => void;
  setLatestPdfArtifact: (v: OrbPdfArtifact | null) => void;
  setRestartBlocked: (v: boolean) => void;
  setAttachedImage: (v: AttachedImage) => void;
  conversationHistoryRef: React.MutableRefObject<ConversationEntry[]>;
  conversationIdRef: React.MutableRefObject<string>;
  activeRequestRef: React.MutableRefObject<{ abort: () => void } | null>;
  speechQueueRef: React.MutableRefObject<string[]>;
  streamedPrefixQueuedRef?: React.MutableRefObject<string>;
  attachedImage: AttachedImage;
  role: string;
  orgType: string;
  aiScope: string;
  preferredLanguage: SupportedLanguage;
  profile: any;
  user: any;
  dashPolicy: ResolvedDashPolicy;
  activeTier: string;
  autoScanUserId: string | null;
  streamingTTSEnabled?: boolean;
  enqueueSpeech: (text: string) => void;
  maybeEnqueueStreamingSpeech?: (text: string) => void;
  flushStreamingSpeechFinal?: (text: string) => void;
  resetStreamingSpeech?: () => void;
  longestCommonPrefixLen?: (left: string, right: string) => number;
  logDashTrace: (event: string, payload?: Record<string, unknown>) => void;
  refreshAutoScanBudget: () => Promise<void>;
  voiceOrbRef: React.RefObject<any>;
}

// ── PDF intent helpers ──────────────────────────────────────────────────────
const PDF_INTENT_REGEX = /\b(pdf|worksheet|document)\b/i;
const PDF_ACTION_REGEX = /\b(generate|create|make|export|regenerate|rebuild|produce|save)\b/i;

export const wantsPdfArtifact = (text: string): boolean => {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  if (PDF_INTENT_REGEX.test(normalized) && PDF_ACTION_REGEX.test(normalized)) return true;
  return /\bcan you generate me a pdf\b/i.test(normalized);
};

export const buildPdfTitleFromPrompt = (prompt: string): string => {
  const compact = String(prompt || '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .trim();
  if (!compact) return 'Dash Voice Document';
  const base = compact.slice(0, 64).trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
};

export const firstText = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};
