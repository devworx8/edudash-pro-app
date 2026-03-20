/**
 * RemediationLeadAgent
 *
 * Client-side service for invoking the EduDash-Remediation-Lead AI agent.
 * Routes requests through ai-proxy with service_type='agent_remediation'.
 *
 * Usage:
 *   const agent = new RemediationLeadAgent(supabase);
 *   const result = await agent.run({ prompt: 'Fix CORS on daily-rooms', code: '...' });
 */

import { assertSupabase } from '@/lib/supabase';
import type {
  AgentRequest,
  AgentResponse,
  AgentFlag,
  RemediationMode,
} from './types';
import { AGENT_SERVICE_TYPES } from './types';

declare const __DEV__: boolean;

/** Parse structured sections from the agent's markdown output */
function parseAgentOutput(content: string): AgentResponse['sections'] {
  const sections: AgentResponse['sections'] = {};

  // Extract "## Refactor Summary" section
  const summaryMatch = content.match(
    /## Refactor Summary\s*\n([\s\S]*?)(?=\n## |$)/
  );
  if (summaryMatch) {
    sections.summary = summaryMatch[1].trim();
  }

  // Extract code block from "## Code" section
  const codeMatch = content.match(
    /## Code\s*\n```[\w]*\n([\s\S]*?)```/
  );
  if (codeMatch) {
    sections.code = codeMatch[1].trim();
  }

  // Extract "## Debt Eradicated" checklist items
  const debtMatch = content.match(
    /## Debt Eradicated\s*\n([\s\S]*?)(?=\n## |$)/
  );
  if (debtMatch) {
    sections.debtItems = debtMatch[1]
      .split('\n')
      .filter((line) => line.match(/^- \[[ x]\]/))
      .map((line) => line.replace(/^- \[[ x]\]\s*/, '').trim());
  }

  // Extract flags from "## ⚠️ Flags" section
  const flagsMatch = content.match(
    /## ⚠️ Flags.*?\n([\s\S]*?)(?=\n## |$)/
  );
  if (flagsMatch) {
    const flags: AgentFlag[] = [];
    const lines = flagsMatch[1].split('\n').filter(Boolean);
    for (const line of lines) {
      if (line.includes('🔴 SECURITY BLOCK')) {
        flags.push({ severity: 'security', message: line.replace(/^-\s*🔴 SECURITY BLOCK:\s*/, '') });
      } else if (line.includes('🟡 MIGRATION NEEDED')) {
        flags.push({ severity: 'migration', message: line.replace(/^-\s*🟡 MIGRATION NEEDED:\s*/, '') });
      } else if (line.includes('🟡 TEST GAP')) {
        flags.push({ severity: 'test', message: line.replace(/^-\s*🟡 TEST GAP:\s*/, '') });
      } else if (line.trim().startsWith('-')) {
        flags.push({ severity: 'info', message: line.replace(/^-\s*/, '').trim() });
      }
    }
    if (flags.length > 0) sections.flags = flags;
  }

  return Object.keys(sections).length > 0 ? sections : undefined;
}

export class RemediationLeadAgent {
  private readonly supabase;

  constructor(supabaseClient?: ReturnType<typeof assertSupabase>) {
    this.supabase = supabaseClient ?? assertSupabase();
  }

  /**
   * Invoke the Remediation-Lead agent.
   *
   * @param request - The agent request with prompt, optional code, mode, etc.
   * @returns Structured agent response with parsed sections.
   */
  async run(request: AgentRequest): Promise<AgentResponse> {
    const serviceType = AGENT_SERVICE_TYPES['remediation-lead'];
    const mode: RemediationMode = request.mode ?? 'remediate';

    // Build prompt — combine user prompt with optional code
    const promptParts: string[] = [request.prompt];
    if (request.filePath) {
      promptParts.push(`\nFile: ${request.filePath}`);
    }
    if (request.code) {
      promptParts.push(`\nCurrent Code:\n\`\`\`\n${request.code}\n\`\`\``);
    }
    const fullPrompt = promptParts.join('\n');

    // Build context from optional fields
    const contextParts: string[] = [];
    if (request.context) contextParts.push(request.context);
    const context = contextParts.length > 0 ? contextParts.join('\n\n') : undefined;

    const traceId = crypto.randomUUID();

    const body = {
      service_type: serviceType,
      payload: {
        prompt: fullPrompt,
        context,
      },
      stream: false,
      enable_tools: false,
      metadata: {
        trace_id: traceId,
        agent_id: 'remediation-lead',
        agent_mode: mode,
        target_task: request.targetTask ?? '',
        file_path: request.filePath ?? '',
      },
    };

    const { data, error } = await this.supabase.functions.invoke(
      'ai-proxy',
      {
        body,
        ...(request.signal ? { signal: request.signal } : {}),
      }
    );

    if (error) {
      throw new Error(
        `Remediation-Lead agent error: ${error.message ?? 'Unknown error'}`
      );
    }

    const content: string = data?.content ?? '';
    const sections = parseAgentOutput(content);

    return {
      content,
      sections,
      usage: data?.usage,
      model: data?.model,
      traceId,
    };
  }

  /** Audit mode shorthand — analyze code for anti-patterns */
  async audit(
    code: string,
    filePath?: string,
    signal?: AbortSignal
  ): Promise<AgentResponse> {
    return this.run({
      agentId: 'remediation-lead',
      prompt: `Audit this code for anti-patterns, security issues, and WARP violations.`,
      code,
      filePath,
      mode: 'audit',
      signal,
    });
  }

  /** Plan mode shorthand — produce a remediation plan for a goal */
  async plan(goal: string, context?: string, signal?: AbortSignal): Promise<AgentResponse> {
    return this.run({
      agentId: 'remediation-lead',
      prompt: goal,
      mode: 'plan',
      context,
      signal,
    });
  }
}
