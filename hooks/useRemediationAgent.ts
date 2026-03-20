/**
 * useRemediationAgent
 *
 * React hook for invoking the EduDash-Remediation-Lead AI agent.
 * Manages loading state, cancellation, and error handling.
 *
 * Usage:
 *   const { run, audit, plan, isLoading, result, error } = useRemediationAgent();
 *   await run({ agentId: 'remediation-lead', prompt: 'Fix CORS...', code: '...' });
 */

import { useState, useCallback, useRef } from 'react';
import { RemediationLeadAgent } from '@/services/agents/RemediationLeadAgent';
import type { AgentRequest, AgentResponse } from '@/services/agents/types';

interface UseRemediationAgentReturn {
  /** Invoke the agent with a full request */
  run: (request: AgentRequest) => Promise<AgentResponse | null>;
  /** Shorthand: audit code for anti-patterns */
  audit: (code: string, filePath?: string) => Promise<AgentResponse | null>;
  /** Shorthand: produce a remediation plan */
  plan: (goal: string, context?: string) => Promise<AgentResponse | null>;
  /** Cancel the current request */
  cancel: () => void;
  /** Whether a request is in flight */
  isLoading: boolean;
  /** Last successful result */
  result: AgentResponse | null;
  /** Last error message */
  error: string | null;
}

export function useRemediationAgent(): UseRemediationAgentReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const agentRef = useRef<RemediationLeadAgent | null>(null);

  const getAgent = useCallback(() => {
    if (!agentRef.current) {
      agentRef.current = new RemediationLeadAgent();
    }
    return agentRef.current;
  }, []);

  const run = useCallback(async (request: AgentRequest): Promise<AgentResponse | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const response = await getAgent().run({
        ...request,
        signal: controller.signal,
      });
      setResult(response);
      return response;
    } catch (err) {
      if (controller.signal.aborted) return null;
      const message = err instanceof Error ? err.message : 'Agent request failed';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getAgent]);

  const audit = useCallback(async (code: string, filePath?: string): Promise<AgentResponse | null> => {
    return run({
      agentId: 'remediation-lead',
      prompt: 'Audit this code for anti-patterns, security issues, and WARP violations.',
      code,
      filePath,
      mode: 'audit',
    });
  }, [run]);

  const plan = useCallback(async (goal: string, context?: string): Promise<AgentResponse | null> => {
    return run({
      agentId: 'remediation-lead',
      prompt: goal,
      mode: 'plan',
      context,
    });
  }, [run]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { run, audit, plan, cancel, isLoading, result, error };
}
