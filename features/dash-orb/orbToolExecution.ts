/**
 * features/dash-orb/orbToolExecution.ts
 *
 * Extracted from DashOrbImpl.tsx — tool detection indicators, manual tool
 * execution with age-band safety gate, and auto tool planning.
 */

import { ToolRegistry } from '@/services/AgentTools';
import { formatToolResultMessage } from '@/lib/ai/toolUtils';
import { planToolCall, shouldAttemptToolPlan } from '@/lib/ai/toolPlanner';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { ChatMessage } from '@/components/dash-orb/ChatModal';

// ─── Types ──────────────────────────────────────────────────

export interface ToolShortcut {
  name: string;
  label: string;
  description?: string;
  category?: string;
}

export interface PlannerTool {
  name: string;
  description: string;
  parameters?: unknown;
}

export interface ToolExecutionContext {
  profile: Record<string, any> | null;
  user: { id?: string } | null;
  normalizedRole: string;
  ageBand: string;
  toolShortcuts: ToolShortcut[];
  autoToolShortcuts: ToolShortcut[];
  plannerTools: PlannerTool[];
}

export interface AutoToolResult {
  toolName: string;
  execution: unknown;
  toolChatMessage: ChatMessage;
}

// ─── Detect tool indicators ─────────────────────────────────

export function detectToolsNeeded(command: string): ChatMessage['toolCalls'] {
  const tools: ChatMessage['toolCalls'] = [];
  const lowerCommand = command.toLowerCase();

  if (lowerCommand.includes('build') || lowerCommand.includes('eas')) {
    tools.push({ name: 'eas_trigger_build', status: 'pending' });
  }
  if (lowerCommand.includes('commit') || lowerCommand.includes('git')) {
    tools.push({ name: 'github_get_commits', status: 'pending' });
  }
  if (lowerCommand.includes('pull request') || lowerCommand.includes('pr')) {
    tools.push({ name: 'github_list_prs', status: 'pending' });
  }
  if (lowerCommand.includes('stat') || lowerCommand.includes('metric') || lowerCommand.includes('analytics')) {
    tools.push({ name: 'get_platform_stats', status: 'pending' });
  }
  if (lowerCommand.includes('ai usage') || lowerCommand.includes('token')) {
    tools.push({ name: 'get_ai_usage', status: 'pending' });
  }
  if (lowerCommand.includes('report') || lowerCommand.includes('revenue')) {
    tools.push({ name: 'generate_report', status: 'pending' });
  }
  if (lowerCommand.includes('school') || lowerCommand.includes('preschool')) {
    tools.push({ name: 'list_schools', status: 'pending' });
  }
  if (lowerCommand.includes('user') || lowerCommand.includes('principal') || lowerCommand.includes('teacher')) {
    tools.push({ name: 'list_users', status: 'pending' });
  }
  if (lowerCommand.includes('query') || lowerCommand.includes('select') || lowerCommand.includes('count')) {
    tools.push({ name: 'query_database', status: 'pending' });
  }
  if (lowerCommand.includes('feature') || lowerCommand.includes('flag')) {
    tools.push({ name: 'manage_feature_flag', status: 'pending' });
  }
  if (lowerCommand.includes('announce') || lowerCommand.includes('broadcast')) {
    tools.push({ name: 'send_announcement', status: 'pending' });
  }
  if (/\b(image|picture|poster|illustration|draw|visual)\b/.test(lowerCommand)) {
    tools.push({ name: 'generate_image', status: 'pending' });
  }

  return tools.length > 0 ? tools : [{ name: 'ai_analysis', status: 'pending' }];
}

// ─── Manual tool execution ──────────────────────────────────

function isMinorAgeBand(ageBand: string): boolean {
  return ageBand !== 'adult' && ageBand !== '16-18';
}

function buildToolContext(ctx: ToolExecutionContext, traceId: string, source: string, toolName?: string) {
  let supabaseClient: any = null;
  try { supabaseClient = assertSupabase(); } catch {}
  return {
    profile: ctx.profile,
    user: ctx.user,
    supabase: supabaseClient,
    role: ctx.normalizedRole || 'parent',
    tier: (ctx.profile as any)?.tier || 'free',
    organizationId: (ctx.profile as any)?.organization_id || (ctx.profile as any)?.preschool_id || null,
    hasOrganization: Boolean((ctx.profile as any)?.organization_id || (ctx.profile as any)?.preschool_id),
    isGuest: !ctx.user?.id,
    ageBand: ctx.ageBand,
    trace_id: traceId,
    tool_plan: { source, tool: toolName },
  };
}

export async function handleRunTool(
  toolName: string,
  params: Record<string, any>,
  ctx: ToolExecutionContext,
  appendMessage: (msg: ChatMessage) => void,
): Promise<void> {
  const tool = ToolRegistry.getTool(toolName);
  const label = ctx.toolShortcuts.find((item) => item.name === toolName)?.label || toolName;

  if (!tool) {
    logger.warn('DashOrb.handleRunTool', { toolName, error: 'not_registered' });
    appendMessage({
      id: `tool_err_${Date.now()}`, role: 'assistant',
      content: `Tool "${toolName}" not found in allowlist.`, timestamp: new Date(),
    });
    return;
  }

  const toolRisk = (tool as any)?.risk || (tool as any)?.riskLevel || 'low';
  if (isMinorAgeBand(ctx.ageBand) && (toolRisk === 'high' || toolRisk === 'medium')) {
    logger.info('DashOrb.toolBlocked', { toolName, ageBand: ctx.ageBand, toolRisk });
    appendMessage({
      id: `tool_blocked_${Date.now()}`, role: 'assistant',
      content: "This action isn't available for younger learners. Ask a parent or teacher for help.",
      timestamp: new Date(),
    });
    return;
  }

  const traceId = `dash_orb_manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const context = buildToolContext(ctx, traceId, 'dash_orb.run_tool', toolName);
  const startMs = Date.now();
  const result = await ToolRegistry.execute(toolName, params, context);
  const durationMs = Date.now() - startMs;
  const message = formatToolResultMessage(label, result);

  logger.info('DashOrb.toolExecuted', {
    traceId, tool: toolName, args: params,
    success: (result as any)?.success !== false, durationMs,
    ageBand: ctx.ageBand, source: 'manual',
  });

  appendMessage({
    id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: 'assistant', content: message, timestamp: new Date(),
  });
}

// ─── Auto tool planning ─────────────────────────────────────

export async function runAutoToolIfNeeded(
  userText: string,
  ctx: ToolExecutionContext,
  appendMessage: (msg: ChatMessage) => void,
): Promise<AutoToolResult | null> {
  if (!shouldAttemptToolPlan(userText)) return null;
  if (ctx.plannerTools.length === 0) return null;

  let supabaseClient: any = null;
  try { supabaseClient = assertSupabase(); } catch { return null; }

  const plan = await planToolCall({
    supabaseClient,
    role: ctx.normalizedRole || 'parent',
    message: userText,
    tools: ctx.plannerTools,
  });

  if (!plan?.tool) return null;
  const toolName = plan.tool;

  if (!ToolRegistry.hasTool(toolName)) {
    logger.warn('DashOrb.autoTool.notRegistered', { toolName });
    return null;
  }

  const autoTool = ToolRegistry.getTool(toolName);
  const autoToolRisk = (autoTool as any)?.risk || (autoTool as any)?.riskLevel || 'low';
  if (isMinorAgeBand(ctx.ageBand) && (autoToolRisk === 'high' || autoToolRisk === 'medium')) {
    logger.info('DashOrb.autoTool.blocked', { toolName, ageBand: ctx.ageBand, autoToolRisk });
    return null;
  }

  const traceId = `dash_orb_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const context = buildToolContext(ctx, traceId, 'dash_orb.auto_planner', toolName);
  const startMs = Date.now();
  const execution = await ToolRegistry.execute(toolName, plan.parameters || {}, context);
  const durationMs = Date.now() - startMs;
  const label = ctx.autoToolShortcuts.find((t) => t.name === toolName)?.label || toolName;
  const toolMessage = formatToolResultMessage(label, execution);

  logger.info('DashOrb.toolExecuted', {
    traceId, tool: toolName, args: plan.parameters,
    success: (execution as any)?.success !== false, durationMs,
    ageBand: ctx.ageBand, source: 'auto_planner',
  });

  const toolChatMessage: ChatMessage = {
    id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: 'assistant', content: toolMessage, timestamp: new Date(),
  };

  appendMessage(toolChatMessage);

  return { toolName, execution, toolChatMessage };
}
