/**
 * Shared types for the Dash AI hook system.
 *
 * These types are consumed by all hooks in `hooks/dash-ai/`
 * and by the DashAIContext provider. They have NO runtime
 * dependencies — only type imports.
 */

import type { DashMessage, DashConversation, DashAttachment } from '@/services/dash-ai/types';
import type { IDashAIAssistant } from '@/services/dash-ai/DashAICompat';
import type { AIModelId, AIModelInfo } from '@/lib/ai/models';
import type { SpeechChunkProgress } from '@/hooks/dash-assistant/voiceHandlers';
import type { LearnerContext } from '@/lib/dash-ai/learnerContext';
import type { TutorSession } from '@/hooks/dash-assistant/tutorTypes';
import type { AttachmentProgress } from '@/hooks/useDashAttachments';
import type { AIQuotaFeature } from '@/lib/ai/limits';

// ─── Constants ──────────────────────────────────────────────

export const DASH_AI_SERVICE_TYPE: AIQuotaFeature = 'homework_help';
export const LOCAL_SNAPSHOT_LIMIT = 200;
export const LOCAL_SNAPSHOT_MAX = 200;
export const DUPLICATE_SEND_WINDOW_MS = 1200;

// ─── Alert State ────────────────────────────────────────────

export interface AlertState {
  visible: boolean;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  icon?: string;
  buttons?: Array<{
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
  }>;
  autoDismissMs?: number;
  bannerMode?: boolean;
}

// ─── Pending Request (queue item) ───────────────────────────

export interface PendingDashRequest {
  text: string;
  attachments: DashAttachment[];
  signature: string;
  queuedAt: number;
}

// ─── Response Lifecycle ─────────────────────────────────────

export type ResponseLifecycleState = 'idle' | 'draft_streaming' | 'committed' | 'finalized';

export interface ResponseLifecycleTracker {
  requestId: string | null;
  state: ResponseLifecycleState;
  committedText: string | null;
}

// ─── Tool Activity Labels ───────────────────────────────────

export const TOOL_ACTIVITY_LABELS: Record<string, string> = {
  export_pdf: 'Generating PDF',
  generate_pdf_from_prompt: 'Generating PDF',
  search_caps_curriculum: 'Searching CAPS',
  get_caps_documents: 'Opening CAPS documents',
  get_assignments: 'Checking assignments',
  get_schedule: 'Checking your schedule',
  send_school_announcement: 'Sending announcement',
  send_inbox_message: 'Sending inbox message',
  send_broadcast_message: 'Sending broadcast',
  summarize_broadcast_rsvp: 'Checking RSVP responses',
  support_check_user_context: 'Checking support context',
  support_create_ticket: 'Creating support ticket',
};

export function formatDashToolActivityLabel(
  toolName: string,
  fallbackLabel?: string,
): string {
  const normalized = String(toolName || '').trim().toLowerCase();
  if (fallbackLabel) return fallbackLabel;
  if (normalized && TOOL_ACTIVITY_LABELS[normalized]) {
    return TOOL_ACTIVITY_LABELS[normalized];
  }
  return normalized
    ? `Using ${normalized.replace(/_/g, ' ')}`
    : 'Using a helper tool';
}

// ─── Shared Dash AI State (exposed by DashAIContext) ────────

export interface DashAIState {
  /** Current conversation messages */
  messages: DashMessage[];
  /** Active conversation object */
  conversation: DashConversation | null;
  /** Lazy-loaded DashAIAssistant singleton */
  dashInstance: IDashAIAssistant | null;
  /** Whether initialization has completed */
  isInitialized: boolean;

  /** AI is processing a request */
  isLoading: boolean;
  /** Status hint while processing */
  loadingStatus: 'uploading' | 'analyzing' | 'thinking' | 'responding' | null;
  /** ID of the message currently being streamed */
  streamingMessageId: string | null;
  /** Accumulated streaming text */
  streamingContent: string;

  /** A tool execution is in progress */
  hasActiveToolExecution: boolean;
  /** User-facing label for current tool */
  activeToolLabel: string | null;

  /** TTS playback is active */
  isSpeaking: boolean;
  /** Message ID being spoken */
  speakingMessageId: string | null;
  /** Chunk-level TTS progress */
  speechChunkProgress: SpeechChunkProgress | null;

  /** Model selection */
  availableModels: AIModelInfo[];
  selectedModel: AIModelId;

  /** Resolved learner context for the current session */
  learnerContext: LearnerContext | null;

  /** Active tutor session (D→T→P→C) */
  tutorSession: TutorSession | null;

  /** Subscription tier info */
  tier: string | undefined;
  subReady: boolean;
}

// ─── Shared Dash AI Actions (dispatched via DashAIContext) ──

export interface DashAIActions {
  setMessages: React.Dispatch<React.SetStateAction<DashMessage[]>>;
  setConversation: React.Dispatch<React.SetStateAction<DashConversation | null>>;
  setDashInstance: React.Dispatch<React.SetStateAction<IDashAIAssistant | null>>;
  setIsInitialized: React.Dispatch<React.SetStateAction<boolean>>;

  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadingStatus: React.Dispatch<React.SetStateAction<DashAIState['loadingStatus']>>;
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setStreamingContent: React.Dispatch<React.SetStateAction<string>>;

  setHasActiveToolExecution: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveToolLabel: React.Dispatch<React.SetStateAction<string | null>>;

  setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
  setSpeakingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setSpeechChunkProgress: React.Dispatch<React.SetStateAction<SpeechChunkProgress | null>>;

  setSelectedModel: (modelId: AIModelId) => void;

  setLearnerContext: React.Dispatch<React.SetStateAction<LearnerContext | null>>;
  setTutorSession: React.Dispatch<React.SetStateAction<TutorSession | null>>;

  /** Show a modal alert (replaces native Alert.alert) */
  showAlert: (config: Omit<AlertState, 'visible'>) => void;
  hideAlert: () => void;
  alertState: AlertState;
}

// ─── Combined context value ─────────────────────────────────

export type DashAIContextValue = DashAIState & DashAIActions;
