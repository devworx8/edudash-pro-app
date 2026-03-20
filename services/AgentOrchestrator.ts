/**
 * AgentOrchestrator - the planner/executor/verifier loop for Dash.
 */

import { ToolRegistry } from './AgentTools';
import { MemoryService } from './MemoryService';
import { EventBus, Events } from './EventBus';
import { getDefaultModelIdForTier } from '@/lib/ai/modelForTier';
import { hasCapability } from '@/lib/ai/capabilities';
import { assertSupabase } from '@/lib/supabase';
import { getCurrentProfile } from '@/lib/sessionManager';
import { getAssistant } from './core/getAssistant';
import { searchSupportKnowledge, type SupportKnowledgeSnippet } from './dash-ai/workflows/SupportKnowledgeService';

export interface AgentGoal {
  objective: string;
  context?: any;
  constraints?: {
    maxSteps?: number;
    maxTools?: number;
    timeout?: number;
  };
}

export interface AgentResult {
  success: boolean;
  message: string;
  toolsUsed: string[];
  reflection?: string;
  metadata?: any;
}

interface ToolCall {
  name: string;
  arguments: any;
}

interface PlannerDecision {
  content?: string;
  toolCalls: ToolCall[];
}

interface ValidationDecision {
  shouldFinish: boolean;
  summary?: string;
  reason?: string;
  confidenceScore?: number;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  escalationRecommended?: boolean;
}

interface AgentPerception {
  userId: string;
  userRole: string;
  userTier: string;
  organizationId: string | null;
  confirmedTools: string[];
  memories: any[];
  toolSpecs: Array<{ name: string; description: string; input_schema: any }>;
  screenContext: any;
  knowledgeSnippets: SupportKnowledgeSnippet[];
  knowledgeConfidence: number;
  timestamp: string;
}

interface AgentRuntimeDefaults {
  maxSteps: number;
  maxTools: number;
  timeout: number;
  confidenceThreshold: number;
  verifierRetries: number;
}

/**
 * Interface for AgentOrchestrator
 */
export interface IAgentOrchestrator {
  run(goal: AgentGoal): Promise<AgentResult>;
  dispose(): void;
}

export class AgentOrchestratorClass implements IAgentOrchestrator {
  private isRunning = false;
  private currentRunId?: string;

  constructor() {}

  private clampIntegerEnv(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number
  ): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  private clampFloatEnv(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number
  ): number {
    const parsed = Number.parseFloat(String(value ?? ''));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  private getRuntimeDefaults(): AgentRuntimeDefaults {
    return {
      maxSteps: this.clampIntegerEnv(process.env.EXPO_PUBLIC_AGENT_MAX_STEPS, 4, 1, 10),
      maxTools: this.clampIntegerEnv(process.env.EXPO_PUBLIC_AGENT_MAX_TOOLS, 5, 1, 20),
      timeout: this.clampIntegerEnv(process.env.EXPO_PUBLIC_AGENT_TIMEOUT_MS, 20000, 2000, 120000),
      confidenceThreshold: this.clampFloatEnv(
        process.env.EXPO_PUBLIC_AGENT_CONFIDENCE_THRESHOLD,
        0.7,
        0.05,
        0.99
      ),
      verifierRetries: this.clampIntegerEnv(process.env.EXPO_PUBLIC_AGENT_VERIFIER_RETRIES, 1, 0, 2),
    };
  }

  /**
   * Main planner → execute → verifier loop.
   */
  async run(goal: AgentGoal): Promise<AgentResult> {
    if (this.isRunning) {
      return {
        success: false,
        message: 'Agent is already running another task',
        toolsUsed: [],
      };
    }

    this.isRunning = true;
    this.currentRunId = `run_${Date.now()}`;
    const runId = this.currentRunId;

    const startTime = Date.now();
    const toolsUsed: string[] = [];
    const runtime = this.getRuntimeDefaults();
    const constraints = {
      maxSteps: goal.constraints?.maxSteps || runtime.maxSteps,
      maxTools: goal.constraints?.maxTools || runtime.maxTools,
      timeout: goal.constraints?.timeout || runtime.timeout,
    };

    try {
      console.log(`[Agent] Starting run ${runId} for objective:`, goal.objective);

      const perception = await this.perceive(goal);

      // §3.7: Block free-tier users from agentic tools
      if (!hasCapability(perception.userTier || 'free', 'agent.tools')) {
        return {
          success: false,
          message: 'Agentic tools require a Starter tier or above. Please upgrade to use Dash as an agent.',
          toolsUsed: [],
        };
      }
      const messages: any[] = [
        {
          role: 'system',
          content: this.buildSystemPrompt(perception, constraints),
        },
        {
          role: 'user',
          content: goal.objective,
        },
      ];

      let steps = 0;
      let toolCount = 0;
      let resolved = false;
      let resolutionStatus: 'resolved' | 'needs_clarification' | 'escalated' = 'resolved';
      let confidenceScore = 1;
      let escalationOffer = false;
      let escalationReferenceId: string | null = null;
      let clarificationAsked = false;
      let lastValidation: ValidationDecision | null = null;
      let stopReason = 'completed';
      let verifierRetriesUsed = 0;

      while (steps < constraints.maxSteps && toolCount < constraints.maxTools) {
        if (!this.isRunning) {
          console.warn(`[Agent] Run ${runId} was cancelled`);
          stopReason = 'cancelled';
          resolutionStatus = 'needs_clarification';
          escalationOffer = true;
          break;
        }

        if (Date.now() - startTime > constraints.timeout) {
          console.warn(`[Agent] Timeout reached for run ${runId}`);
          stopReason = 'timeout';
          resolutionStatus = 'needs_clarification';
          escalationOffer = true;
          break;
        }

        const decision = await this.planNextStep(messages, perception, {
          runId,
          step: steps,
          remainingTools: constraints.maxTools - toolCount,
        });

        if (!decision.toolCalls || decision.toolCalls.length === 0) {
          messages.push({
            role: 'assistant',
            content: decision.content || "I've completed the requested task.",
          });
          resolved = true;
          resolutionStatus = 'resolved';
          confidenceScore = Math.max(confidenceScore, runtime.confidenceThreshold);
          stopReason = 'planner_completed_no_tools';
          break;
        }

        for (const toolCall of decision.toolCalls) {
          if (toolCount >= constraints.maxTools) break;

          const result = await this.executePlannedTool(toolCall, perception, runId);
          toolsUsed.push(toolCall.name);
          toolCount += 1;

          messages.push({
            role: 'tool',
            name: toolCall.name,
            content: JSON.stringify(result),
          });

          await EventBus.publish(Events.TOOL_EXECUTED, {
            runId,
            tool: toolCall.name,
            args: toolCall.arguments,
            result,
          });
        }

        let validation = await this.validateStep(
          goal.objective,
          messages,
          toolsUsed,
          runId,
          runtime.confidenceThreshold
        );
        let verifierRetryCount = 0;
        while (
          verifierRetryCount < runtime.verifierRetries &&
          !validation.shouldFinish &&
          !validation.needsClarification &&
          typeof validation.confidenceScore === 'number' &&
          validation.confidenceScore < runtime.confidenceThreshold
        ) {
          verifierRetryCount += 1;
          verifierRetriesUsed += 1;
          validation = await this.validateStep(
            goal.objective,
            messages,
            toolsUsed,
            runId,
            runtime.confidenceThreshold
          );
        }
        lastValidation = validation;
        if (typeof validation.confidenceScore === 'number') {
          confidenceScore = validation.confidenceScore;
        }

        if (validation.shouldFinish) {
          messages.push({
            role: 'assistant',
            content: validation.summary || decision.content || "I've completed the requested task.",
          });
          resolved = true;
          resolutionStatus = 'resolved';
          stopReason = validation.reason || 'verifier_should_finish';
          break;
        }

        const shouldAskClarification =
          !!validation.needsClarification ||
          (
            typeof validation.confidenceScore === 'number' &&
            validation.confidenceScore < runtime.confidenceThreshold &&
            !clarificationAsked
          );

        if (shouldAskClarification && !clarificationAsked) {
          clarificationAsked = true;
          resolutionStatus = 'needs_clarification';
          escalationOffer = false;
          stopReason = validation.reason || 'verifier_needs_clarification';
          const clarificationQuestion =
            validation.clarificationQuestion ||
            'I need one clarification to proceed accurately. Can you share one specific example of the issue?';
          messages.push({
            role: 'assistant',
            content: clarificationQuestion,
          });
          break;
        }

        steps += 1;
      }

      if (!resolved && !clarificationAsked && stopReason === 'completed') {
        if (steps >= constraints.maxSteps) {
          stopReason = 'max_steps_reached';
        } else if (toolCount >= constraints.maxTools) {
          stopReason = 'max_tools_reached';
        } else {
          stopReason = 'unresolved_after_loop';
        }
      }

      if (!resolved && !clarificationAsked) {
        const escalationReason = [
          stopReason,
          lastValidation?.reason,
          typeof lastValidation?.confidenceScore === 'number'
            ? `confidence:${lastValidation.confidenceScore.toFixed(2)}`
            : null,
        ]
          .filter(Boolean)
          .join(' | ');

        const escalation = await this.escalateUnresolvedGoal(
          goal,
          perception,
          runId,
          toolsUsed,
          escalationReason || 'unresolved_goal'
        );

        if (escalation.referenceId) {
          escalationReferenceId = escalation.referenceId;
          resolutionStatus = 'escalated';
          escalationOffer = true;
          confidenceScore = Math.min(confidenceScore, runtime.confidenceThreshold * 0.9);
          messages.push({
            role: 'assistant',
            content: `I couldn't fully resolve this automatically, so I created support ticket ${escalation.referenceId}. ${escalation.message}`,
          });
        } else {
          resolutionStatus = 'needs_clarification';
          escalationOffer = true;
          messages.push({
            role: 'assistant',
            content: escalation.message,
          });
        }
      }

      const reflection = await this.reflect(goal.objective, messages, toolsUsed, runId);
      await this.storeExecution(goal, toolsUsed, reflection);

      const finalMessage =
        messages
          .filter((m) => m.role === 'assistant')
          .pop()?.content || 'Task completed successfully.';

      return {
        success: true,
        message: finalMessage,
        toolsUsed,
        reflection,
        metadata: {
          runId,
          steps,
          duration: Date.now() - startTime,
          toolCount,
          resolution_status: resolutionStatus,
          confidence_score: Number(Math.max(0, Math.min(1, confidenceScore)).toFixed(2)),
          escalation_offer: escalationOffer,
          escalation_reference_id: escalationReferenceId,
          stop_reason: stopReason,
          verifier_retries: runtime.verifierRetries,
          verifier_retries_used: verifierRetriesUsed,
          confidence_threshold: runtime.confidenceThreshold,
        },
      };
    } catch (error) {
      console.error(`[Agent] Run ${runId} failed:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An error occurred',
        toolsUsed,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * PERCEIVE - gather context, memory, and role-scoped tool availability.
   */
  private async perceive(goal: AgentGoal): Promise<AgentPerception> {
    const profile = await getCurrentProfile();
    const memories = await MemoryService.retrieveRelevant(goal.objective, 8);
    const supportKnowledge = searchSupportKnowledge(goal.objective, { limit: 3 });

    const userRole = String(profile?.role || 'teacher').toLowerCase();
    const userTier = String((profile as any)?.tier || 'free').toLowerCase();
    const toolSpecs = ToolRegistry.getToolSpecs(userRole, userTier);

    const dash = await getAssistant();
    const screenContext = dash.getCurrentScreenContext();

    const confirmedTools = Array.isArray(goal.context?.confirmedTools)
      ? goal.context.confirmedTools.map((value: unknown) => String(value))
      : [];

    return {
      userId: String(profile?.id || ''),
      userRole,
      userTier,
      organizationId: (profile as any)?.organization_id || (profile as any)?.preschool_id || null,
      confirmedTools,
      memories,
      toolSpecs,
      screenContext,
      knowledgeSnippets: supportKnowledge.snippets,
      knowledgeConfidence: supportKnowledge.confidence_score,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * PLAN - decide next tool calls from AI planner model.
   */
  private async planNextStep(
    messages: any[],
    perception: AgentPerception,
    context: { runId: string; step: number; remainingTools: number }
  ): Promise<PlannerDecision> {
    try {
      const supabase = assertSupabase();
      const traceId = `${context.runId}_plan_${context.step}`;

      const model = getDefaultModelIdForTier(perception.userTier ?? 'free');
      const { data, error } = await this.invokeWithRetry(() =>
        supabase.functions.invoke('ai-proxy', {
          body: {
            scope: 'admin',
            service_type: 'agent_plan',
            payload: {
              messages,
              model,
            },
            enable_tools: true,
            stream: false,
            client_tools: perception.toolSpecs,
            metadata: {
              source: 'agent_orchestrator.planner',
              trace_id: traceId,
              temperature: 0.2,
              tool_budget_remaining: context.remainingTools,
            },
          },
        })
      );

      if (error) throw error;

      return {
        content: data?.content,
        toolCalls: Array.isArray(data?.tool_calls) ? data.tool_calls : [],
      };
    } catch (error) {
      console.error('[Agent] Planner step failed:', error);
      return {
        content: "I couldn't build a reliable plan for this request right now.",
        toolCalls: [],
      };
    }
  }

  /**
   * EXECUTE - run a planned tool call with traceability and safety checks.
   */
  private async executePlannedTool(
    toolCall: ToolCall,
    perception: AgentPerception,
    runId: string
  ): Promise<any> {
    const toolName = String(toolCall.name || 'unknown_tool');
    const traceId = `${runId}_tool_${toolName}_${Date.now()}`;

    const toolDef = ToolRegistry.getTool(toolName);
    const requiresConfirmation = Boolean(
      toolDef?.requiresConfirmation || toolDef?.risk === 'high'
    );

    if (requiresConfirmation && !perception.confirmedTools.includes(toolName)) {
      return {
        success: false,
        error: `Tool ${toolName} requires explicit confirmation`,
        requires_confirmation: true,
        trace_id: traceId,
      };
    }

    const context = {
      userId: perception.userId,
      role: perception.userRole,
      tier: perception.userTier,
      organizationId: perception.organizationId,
      hasOrganization: Boolean(perception.organizationId),
      isGuest: !perception.userId,
      trace_id: traceId,
      confirmedTools: perception.confirmedTools,
      tool_plan: {
        source: 'agent_orchestrator.executor',
        run_id: runId,
      },
    };

    console.log('[Agent] Executing tool', { tool: toolName, trace_id: traceId });

    return ToolRegistry.execute(toolName, toolCall.arguments || {}, context);
  }

  /**
   * VERIFY - decide if we should continue or finish after current step.
   */
  private async validateStep(
    objective: string,
    messages: any[],
    toolsUsed: string[],
    runId: string,
    confidenceThreshold: number
  ): Promise<ValidationDecision> {
    const recent = messages.slice(-6);
    const latestToolResult = recent.find((m) => m.role === 'tool');
    const latestAssistant = [...recent].reverse().find((m) => m.role === 'assistant');

    if (!latestToolResult && latestAssistant?.content) {
      return {
        shouldFinish: true,
        summary: latestAssistant.content,
        reason: 'assistant_complete_no_pending_tools',
      };
    }

    try {
      const supabase = assertSupabase();
      const profile = await getCurrentProfile();
      const userTier = String((profile as any)?.tier || 'free').toLowerCase();
      const model = getDefaultModelIdForTier(userTier);
      const traceId = `${runId}_verify_${Date.now()}`;

      const prompt = [
        `Objective: ${objective}`,
        `Tools used: ${toolsUsed.join(', ') || '(none)'}`,
        'Decide if the objective appears satisfied.',
        'Return strict JSON only:',
        '{"should_finish":boolean,"summary":"short summary","reason":"why","confidence_score":0.0,"needs_clarification":boolean,"clarification_question":"optional","escalation_recommended":boolean}',
      ].join('\n');

      const { data, error } = await this.invokeWithRetry(() =>
        supabase.functions.invoke('ai-proxy', {
          body: {
            scope: 'admin',
            service_type: 'agent_reflection',
            payload: {
              messages: [
                {
                  role: 'system',
                  content: 'You verify whether an agent loop should continue or finish. Respond in JSON only.',
                },
                {
                  role: 'user',
                  content: `${prompt}\n\nRecent conversation:\n${JSON.stringify(recent)}`,
                },
              ],
              model,
            },
            enable_tools: false,
            stream: false,
            metadata: {
              source: 'agent_orchestrator.verifier',
              trace_id: traceId,
            },
          },
        })
      );

      if (error) throw error;

      const parsed = this.parseJsonFromText(data?.content || '');
      if (!parsed) {
        return {
          shouldFinish: false,
          reason: 'verifier_unparseable',
          confidenceScore: Math.max(0.35, confidenceThreshold - 0.25),
          needsClarification: true,
        };
      }

      const rawConfidence = this.extractConfidenceScore(parsed.confidence_score);
      const confidenceScore = typeof rawConfidence === 'number'
        ? rawConfidence
        : Math.max(0.35, confidenceThreshold - 0.15);
      const needsClarification = Boolean(parsed.needs_clarification) || confidenceScore < confidenceThreshold;
      const escalationRecommended = Boolean(parsed.escalation_recommended) || confidenceScore < (confidenceThreshold * 0.75);

      return {
        shouldFinish: Boolean(parsed.should_finish),
        summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
        reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
        confidenceScore,
        needsClarification,
        clarificationQuestion:
          typeof parsed.clarification_question === 'string'
            ? parsed.clarification_question
            : undefined,
        escalationRecommended,
      };
    } catch (error) {
      console.warn('[Agent] Verifier step failed, continuing loop:', error);
      return {
        shouldFinish: false,
        reason: 'verifier_error',
        confidenceScore: Math.max(0.3, confidenceThreshold - 0.3),
        needsClarification: true,
      };
    }
  }

  /**
   * REFLECT - store short learning summary for future runs.
   */
  private async reflect(
    objective: string,
    messages: any[],
    toolsUsed: string[],
    runId: string
  ): Promise<string> {
    try {
      const supabase = assertSupabase();
      const profile = await getCurrentProfile();
      const userTier = String((profile as any)?.tier || 'free').toLowerCase();
      const model = getDefaultModelIdForTier(userTier);

      const reflectionPrompt = `
Based on the execution:
- Objective: ${objective}
- Tools used: ${toolsUsed.join(', ')}
- Message count: ${messages.length}

Provide a brief reflection (1-2 sentences) on:
1. What worked well?
2. What could be improved next time?
`;

      const { data } = await this.invokeWithRetry(() =>
        supabase.functions.invoke('ai-proxy', {
          body: {
            scope: 'admin',
            service_type: 'agent_reflection',
            payload: {
              messages: [
                { role: 'system', content: 'You are Dash reflecting on task execution.' },
                { role: 'user', content: reflectionPrompt },
              ],
              model,
            },
            enable_tools: false,
            stream: false,
            metadata: {
              source: 'agent_orchestrator.reflect',
              trace_id: `${runId}_reflect`,
            },
          },
        })
      );

      return data?.content || 'Execution completed as expected.';
    } catch (error) {
      console.error('[Agent] Reflection failed:', error);
      return 'Execution completed.';
    }
  }

  private async invokeWithRetry<T>(
    invokeFn: () => Promise<T>,
    maxAttempts = 2
  ): Promise<T> {
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        return await invokeFn();
      } catch (error) {
        lastError = error;
        const message = (error as any)?.message || '';
        const retryable = /timeout|timed out|network|503|429|temporar|fetch/i.test(String(message));
        if (!retryable || attempt >= maxAttempts) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Invoke failed');
  }

  private parseJsonFromText(text: string): Record<string, any> | null {
    const trimmed = String(text || '').trim();
    if (!trimmed) return null;

    const direct = trimmed.startsWith('{') && trimmed.endsWith('}') ? trimmed : null;
    const fallbackStart = trimmed.indexOf('{');
    const fallbackEnd = trimmed.lastIndexOf('}');
    const candidate = direct || (fallbackStart >= 0 && fallbackEnd > fallbackStart
      ? trimmed.slice(fallbackStart, fallbackEnd + 1)
      : '');

    if (!candidate) return null;

    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  private extractConfidenceScore(value: unknown): number | undefined {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseFloat(value)
          : Number.NaN;

    if (!Number.isFinite(parsed)) return undefined;
    return Math.max(0, Math.min(1, parsed));
  }

  private async escalateUnresolvedGoal(
    goal: AgentGoal,
    perception: AgentPerception,
    runId: string,
    toolsUsed: string[],
    reason: string
  ): Promise<{ referenceId: string | null; message: string }> {
    const traceId = `${runId}_escalate_${Date.now()}`;
    const ticketSubject = `Dash escalation: ${goal.objective.slice(0, 90) || 'Unresolved request'}`;
    const ticketDescription = [
      `Objective: ${goal.objective}`,
      `Reason: ${reason}`,
      `Role: ${perception.userRole}`,
      `Tier: ${perception.userTier}`,
      `Tools used: ${toolsUsed.join(', ') || '(none)'}`,
      `Trace ID: ${traceId}`,
    ].join('\n');

    try {
      const result = await ToolRegistry.execute(
        'support_create_ticket',
        {
          subject: ticketSubject,
          description: ticketDescription,
          priority: 'medium',
          status: 'open',
        },
        {
          userId: perception.userId,
          role: perception.userRole,
          tier: perception.userTier,
          organizationId: perception.organizationId,
          hasOrganization: Boolean(perception.organizationId),
          isGuest: !perception.userId,
          trace_id: traceId,
          confirmedTools: perception.confirmedTools,
          tool_plan: {
            source: 'agent_orchestrator.escalation',
            run_id: runId,
            reason,
          },
        }
      );

      const referenceId =
        String((result as any)?.result?.reference_id || (result as any)?.result?.ticket?.id || '').trim() ||
        null;

      await EventBus.publish(Events.TOOL_EXECUTED, {
        runId,
        tool: 'support_create_ticket',
        args: { subject: ticketSubject },
        result,
      });

      if (result?.success && referenceId) {
        console.log('[Agent] Escalation ticket created', { trace_id: traceId, reference_id: referenceId });
        return {
          referenceId,
          message: `A support specialist can continue from here. Reference ID: ${referenceId}.`,
        };
      }

      return {
        referenceId: null,
        message:
          'I could not auto-create a support ticket right now. Please share one more detail and I will retry, or contact support manually.',
      };
    } catch (error) {
      console.warn('[Agent] Escalation failed:', error);
      return {
        referenceId: null,
        message:
          'I could not auto-create a support ticket right now. Please share one more detail and I will retry, or contact support manually.',
      };
    }
  }

  /**
   * Store execution details in memory.
   */
  private async storeExecution(
    goal: AgentGoal,
    toolsUsed: string[],
    reflection: string
  ) {
    await MemoryService.upsertMemory({
      type: 'interaction',
      content: {
        objective: goal.objective,
        toolsUsed,
        reflection,
        timestamp: new Date().toISOString(),
      },
      importance: 3,
    });

    if (toolsUsed.length > 0) {
      await MemoryService.upsertMemory({
        type: 'pattern',
        content: {
          pattern: `For objectives like "${goal.objective}", use tools: ${toolsUsed.join(', ')}`,
          success: true,
        },
        importance: 5,
      });
    }
  }

  /**
   * Build system prompt with role/memory/tool budgets.
   */
  private buildSystemPrompt(
    perception: AgentPerception,
    constraints: { maxSteps: number; maxTools: number; timeout: number }
  ): string {
    const memoryContext = perception.memories
      .slice(0, 4)
      .map((memory: any) => `- ${JSON.stringify(memory.content)}`)
      .join('\n');
    const knowledgeContext = perception.knowledgeSnippets
      .slice(0, 3)
      .map((snippet) => `- [${snippet.title}] ${snippet.snippet} (source: ${snippet.source})`)
      .join('\n');

    return `You are Dash, a high-reliability AI assistant operating in a strict loop.

Execution contract:
- Plan the next best action.
- Use tools only when they materially improve accuracy.
- After each tool call, verify progress against the objective.
- Stop once objective is satisfied and produce a concise final answer.

Budgets:
- Max steps: ${constraints.maxSteps}
- Max tools: ${constraints.maxTools}
- Timeout (ms): ${constraints.timeout}

Context:
- User role: ${perception.userRole}
- User tier: ${perception.userTier}
- Current screen: ${perception.screenContext?.screen || 'unknown'}
- Time: ${perception.timestamp}

Relevant memories:
${memoryContext || '(No relevant memories)'}

Support knowledge (confidence ${perception.knowledgeConfidence}):
${knowledgeContext || '(No relevant support knowledge found)'}

Safety:
- High-risk tools require explicit confirmation.
- Use deterministic, factual outputs.
- If uncertain, ask one focused clarification question.`;
  }

  /**
   * Cancel current execution.
   */
  cancelCurrentRun(): void {
    if (this.isRunning && this.currentRunId) {
      console.log(`[Agent] Cancelling run ${this.currentRunId}`);
      this.isRunning = false;
    }
  }

  /**
   * Check if agent is currently running.
   */
  isAgentRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Dispose method for cleanup.
   */
  public dispose(): void {
    this.cancelCurrentRun();
  }
}

// Backward compatibility: Export singleton instance
// TODO: Remove once all call sites migrated to DI
import { container, TOKENS } from '../lib/di/providers/default';
export const AgentOrchestratorInstance = (() => {
  try {
    return container.resolve(TOKENS.agentOrchestrator);
  } catch {
    // Fallback during initialization
    return new AgentOrchestratorClass();
  }
})();

// Back-compat export for legacy call sites
export const AgentOrchestrator = AgentOrchestratorInstance;

export default AgentOrchestratorInstance;
