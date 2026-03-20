/**
 * EduDash Pro Custom Agent Types
 *
 * Shared type definitions for all custom AI agents.
 * Each agent registers a service_type with ai-proxy and
 * uses these interfaces for request/response contracts.
 */

/** Agent identifiers — extend this union as new agents are added */
export type AgentId = 'remediation-lead';

/** Agent operational modes */
export type RemediationMode = 'remediate' | 'audit' | 'plan';

/** Request to invoke a custom agent via ai-proxy */
export interface AgentRequest {
  /** Which agent to invoke */
  agentId: AgentId;
  /** The task description / user prompt */
  prompt: string;
  /** Optional code or file content to analyze */
  code?: string;
  /** Optional file path for context */
  filePath?: string;
  /** Agent-specific mode */
  mode?: RemediationMode;
  /** Extra context (e.g., from Master-Audit.md) */
  context?: string;
  /** Target task from 30-Day Action Plan */
  targetTask?: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/** Structured response from an agent */
export interface AgentResponse {
  /** Full raw content from the AI */
  content: string;
  /** Parsed sections (if the agent follows output contract) */
  sections?: {
    summary?: string;
    code?: string;
    debtItems?: string[];
    flags?: AgentFlag[];
  };
  /** Token usage */
  usage?: {
    tokens_in?: number;
    tokens_out?: number;
  };
  /** Model that served the request */
  model?: string;
  /** Trace ID for debugging */
  traceId?: string;
}

/** Structured flag from agent output */
export interface AgentFlag {
  severity: 'security' | 'migration' | 'test' | 'info';
  message: string;
}

/** Maps AgentId → ai-proxy service_type */
export const AGENT_SERVICE_TYPES: Record<AgentId, string> = {
  'remediation-lead': 'agent_remediation',
};
