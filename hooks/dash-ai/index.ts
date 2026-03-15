/**
 * hooks/dash-ai/index.ts — Barrel export for the Dash AI hook system.
 *
 * Re-exports all modular hooks + a composed `useDashAI()` convenience
 * hook that plugs into DashAIContext and wires everything together.
 */

// ─── Types ──────────────────────────────────────────────────

export type {
  AlertState,
  PendingDashRequest,
  ResponseLifecycleState,
  ResponseLifecycleTracker,
  DashAIState,
  DashAIActions,
  DashAIContextValue,
} from './types';

export {
  DASH_AI_SERVICE_TYPE,
  LOCAL_SNAPSHOT_LIMIT,
  LOCAL_SNAPSHOT_MAX,
  DUPLICATE_SEND_WINDOW_MS,
  TOOL_ACTIVITY_LABELS,
  formatDashToolActivityLabel,
} from './types';

// ─── Hooks ──────────────────────────────────────────────────

export { useDashAIMessages } from './useDashAIMessages';
export { useDashAIConversation } from './useDashAIConversation';
export { useDashAIQuota } from './useDashAIQuota';
export { useDashAITools } from './useDashAITools';
export { useDashAIVoice } from './useDashAIVoice';
export { useDashAIScroll } from './useDashAIScroll';

// Re-export return types for consumers that need them
export type { UseDashAIVoiceReturn } from './useDashAIVoice';
export type { UseDashAIScrollReturn } from './useDashAIScroll';
