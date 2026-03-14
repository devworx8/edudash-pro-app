import { normalizeRole } from '@/lib/rbac';
import { getCapabilityTier, normalizeTierName } from '@/lib/tiers';
import {
  ToolRegistry as ModuleToolRegistry,
  type AgentTool as ModuleAgentTool,
} from '@/services/modules/DashToolRegistry';
import type {
  Tool as LegacyTool,
  ToolExecutionContext as LegacyExecutionContext,
  ToolExecutionResult as LegacyExecutionResult,
  ToolCategory as LegacyToolCategory,
  RiskLevel as LegacyRiskLevel,
} from '@/services/dash-ai/types';
import type {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolRole,
  ToolTier,
  ToolRiskLevel,
  UnifiedClientToolDef,
  UnifiedToolDefinition,
  UnifiedToolRegistryStats,
} from './types';

const TIER_ORDER: ToolTier[] = [
  'free',
  'starter',
  'basic',
  'premium',
  'pro',
  'enterprise',
];

const TOOL_ACCESS_RULES: Record<string, { roles?: ToolRole[]; minTier?: ToolTier }> = {
  // CAPS + curriculum + tutoring tools
  search_caps_curriculum: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  get_caps_documents: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  get_caps_subjects: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  textbook_content_lookup: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  get_exam_prep: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },
  get_learning_progress: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },
  detect_mistake_patterns: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },
  get_context_aware_resources: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },
  run_student_tutor: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },

  // Data tools
  get_schedule: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  get_assignments: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  get_member_list: { roles: ['teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },
  get_member_progress: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },
  get_organization_stats: { roles: ['principal_admin', 'super_admin'], minTier: 'starter' },
  query_database: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },

  // Communication + PDF + navigation + visual generation
  compose_message: { roles: ['teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },
  export_pdf: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  generate_image: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },
  generate_worksheet: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  generate_chart: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },
  generate_pdf_from_prompt: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  send_email: { roles: ['teacher', 'principal_admin', 'super_admin'], minTier: 'premium' },
  open_document: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  get_screen_context: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  get_active_tasks: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  support_check_user_context: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },
  support_create_ticket: { roles: ['parent', 'student', 'teacher', 'principal_admin', 'super_admin'], minTier: 'free' },

  // Superadmin inventory — user management
  superadmin_list_users: { roles: ['super_admin'], minTier: 'enterprise' },
  superadmin_suspend_user: { roles: ['super_admin'], minTier: 'enterprise' },
  superadmin_reactivate_user: { roles: ['super_admin'], minTier: 'enterprise' },
  superadmin_update_user_role: { roles: ['super_admin'], minTier: 'enterprise' },

  // Superadmin inventory — system monitoring
  superadmin_get_system_health: { roles: ['super_admin'], minTier: 'enterprise' },
  superadmin_get_error_logs: { roles: ['super_admin'], minTier: 'enterprise' },
  superadmin_get_platform_stats: { roles: ['super_admin'], minTier: 'enterprise' },

  // Superadmin inventory — feature flags & AI usage
  superadmin_list_feature_flags: { roles: ['super_admin'], minTier: 'enterprise' },
  superadmin_toggle_feature_flag: { roles: ['super_admin'], minTier: 'enterprise' },
  superadmin_get_ai_usage_stats: { roles: ['super_admin'], minTier: 'enterprise' },
  superadmin_update_ai_quota: { roles: ['super_admin'], minTier: 'enterprise' },

  // Superadmin inventory — announcements
  superadmin_create_announcement: { roles: ['super_admin'], minTier: 'enterprise' },
  superadmin_list_announcements: { roles: ['super_admin'], minTier: 'enterprise' },

  // Superadmin inventory — subscriptions
  superadmin_list_subscriptions: { roles: ['super_admin'], minTier: 'enterprise' },
  superadmin_update_subscription_status: { roles: ['super_admin'], minTier: 'enterprise' },

  // Teacher AI tools
  generate_teaching_strategy: { roles: ['teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },
  generate_homework: { roles: ['teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },
  batch_grade_submissions: { roles: ['teacher', 'principal_admin', 'super_admin'], minTier: 'starter' },
};

const DISABLED_TOOL_NAMES = new Set<string>([
  // Complex structured content generators remain gated in assistant/orb flows.
  'generate_worksheet',
  'generate_chart',
]);

const MODULE_CATEGORY_MAP: Record<string, string> = {
  get_member_list: 'data',
  get_member_progress: 'data',
  get_schedule: 'data',
  get_assignments: 'data',
  get_organization_stats: 'data',
  compose_message: 'communication',
  export_pdf: 'communication',
  generate_image: 'communication',
  generate_worksheet: 'communication',
  generate_chart: 'communication',
  generate_pdf_from_prompt: 'communication',
  send_email: 'communication',
  search_caps_curriculum: 'caps',
  get_caps_documents: 'caps',
  get_caps_subjects: 'caps',
  open_document: 'navigation',
  get_screen_context: 'navigation',
  get_active_tasks: 'navigation',
  support_check_user_context: 'support',
  support_create_ticket: 'support',
  generate_teaching_strategy: 'teacher',
  generate_homework: 'teacher',
  batch_grade_submissions: 'teacher',
};

function parseToolRole(role?: string | null): { role: ToolRole; known: boolean } {
  const raw = String(role || '').toLowerCase().trim();
  if (!raw) return { role: 'parent', known: true };

  if (raw === 'principal') return { role: 'principal_admin', known: true };
  if (raw === 'superadmin') return { role: 'super_admin', known: true };
  if (raw === 'admin') return { role: 'principal_admin', known: true };
  if (raw === 'guest') return { role: 'guest', known: true };

  const normalized = normalizeRole(raw);
  if (normalized === 'parent') return { role: 'parent', known: true };
  if (normalized === 'student') return { role: 'student', known: true };
  if (normalized === 'teacher') return { role: 'teacher', known: true };
  if (normalized === 'principal_admin') return { role: 'principal_admin', known: true };
  if (normalized === 'super_admin') return { role: 'super_admin', known: true };

  if (raw.includes('super')) return { role: 'super_admin', known: true };
  if (raw.includes('principal')) return { role: 'principal_admin', known: true };
  if (raw.includes('teacher')) return { role: 'teacher', known: true };
  if (raw.includes('student') || raw.includes('learner')) return { role: 'student', known: true };
  if (raw.includes('parent')) return { role: 'parent', known: true };

  return { role: 'guest', known: false };
}

function parseToolTier(value?: string | null): { tier: ToolTier; known: boolean } {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw) return { tier: 'free', known: true };

  if ((TIER_ORDER as string[]).includes(raw)) {
    return { tier: raw as ToolTier, known: true };
  }

  if (raw === 'group_5' || raw === 'solo' || raw === 'trial' || raw === 'trialing') {
    return { tier: 'starter', known: true };
  }
  if (raw === 'group_10') return { tier: 'premium', known: true };

  // Canonical tier mapping (strict): if we can't normalize it, treat it as unknown.
  const aligned = normalizeTierName(raw);
  if (aligned === 'free' && raw !== 'free') {
    return { tier: 'free', known: false };
  }
  const capabilityTier = getCapabilityTier(aligned);
  if (capabilityTier === 'enterprise') return { tier: 'enterprise', known: true };
  if (capabilityTier === 'premium') return { tier: 'premium', known: true };
  if (capabilityTier === 'starter') return { tier: 'starter', known: true };
  if (capabilityTier === 'free') return { tier: 'free', known: true };

  return { tier: 'free', known: false };
}

function roleAllowed(requiredRoles: ToolRole[] | undefined, role: ToolRole): boolean {
  if (!requiredRoles || requiredRoles.length === 0) return role !== 'guest';
  return requiredRoles.includes(role);
}

function tierAllowed(minTier: ToolTier | undefined, userTier: ToolTier): boolean {
  if (!minTier) return true;
  return TIER_ORDER.indexOf(userTier) >= TIER_ORDER.indexOf(minTier);
}

function mapLegacyCategory(category: LegacyToolCategory): string {
  switch (category) {
    case 'education':
      return 'caps';
    case 'database':
      return 'data';
    case 'profile':
      return 'data';
    case 'communication':
      return 'communication';
    case 'navigation':
      return 'navigation';
    default:
      return category;
  }
}

function mapLegacyRisk(risk: LegacyRiskLevel): ToolRiskLevel {
  if (risk === 'high' || risk === 'medium' || risk === 'low') return risk;
  return 'low';
}

function inferModuleSchema(tool: ModuleAgentTool): Record<string, unknown> {
  if (tool.parameters && typeof tool.parameters === 'object') {
    return tool.parameters as Record<string, unknown>;
  }
  return {
    type: 'object',
    properties: {},
    required: [],
  };
}

function inferLegacySchema(tool: LegacyTool): Record<string, unknown> {
  if (
    tool.claudeToolDefinition?.input_schema &&
    typeof tool.claudeToolDefinition.input_schema === 'object'
  ) {
    return tool.claudeToolDefinition.input_schema as Record<string, unknown>;
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of tool.parameters || []) {
    properties[param.name] = {
      type: param.type,
      description: param.description,
      ...(param.enum ? { enum: param.enum } : {}),
    };
    if (param.required) required.push(param.name);
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

function isRetryableErrorMessage(message?: string): boolean {
  const value = String(message || '').toLowerCase();
  return (
    value.includes('timeout') ||
    value.includes('timed out') ||
    value.includes('network') ||
    value.includes('fetch') ||
    value.includes('503') ||
    value.includes('429') ||
    value.includes('temporar') ||
    value.includes('service unavailable')
  );
}

function isToolDisabled(toolName?: string | null): boolean {
  return DISABLED_TOOL_NAMES.has(String(toolName || '').trim());
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class UnifiedToolRegistry {
  private readonly legacyTools = new Map<string, LegacyTool>();
  private executionCount = 0;
  private successCount = 0;

  registerLegacyTool(tool: LegacyTool): void {
    const existing = this.legacyTools.get(tool.id);
    if (existing) {
      console.warn(`[UnifiedToolRegistry] Overwriting legacy tool: ${tool.id}`);
    }
    this.legacyTools.set(tool.id, tool);
  }

  clearLegacyTools(): void {
    this.legacyTools.clear();
    this.executionCount = 0;
    this.successCount = 0;
  }

  getLegacyTool(toolId: string): LegacyTool | undefined {
    return this.legacyTools.get(toolId);
  }

  listLegacy(role?: string, tier?: string): LegacyTool[] {
    const resolvedRole = parseToolRole(role);
    const resolvedTier = parseToolTier(tier);

    if (!resolvedRole.known || !resolvedTier.known) {
      return [];
    }

    return Array.from(this.legacyTools.values()).filter((tool) => {
      if (isToolDisabled(tool.id)) return false;
      const fallbackRule = TOOL_ACCESS_RULES[tool.id];
      const allowedRoles = fallbackRule?.roles || tool.allowedRoles.map((r) => parseToolRole(r).role);
      const minTier = fallbackRule?.minTier || (tool.requiredTier as ToolTier | undefined);
      return roleAllowed(allowedRoles, resolvedRole.role) && tierAllowed(minTier, resolvedTier.tier);
    });
  }

  list(role?: string, tier?: string): UnifiedToolDefinition[] {
    const resolvedRole = parseToolRole(role);
    const resolvedTier = parseToolTier(tier);
    if (!resolvedRole.known || !resolvedTier.known) {
      return [];
    }

    const normalizedRole = resolvedRole.role;
    const normalizedTier = resolvedTier.tier;
    const combined = new Map<string, UnifiedToolDefinition>();

    for (const moduleTool of ModuleToolRegistry.getAllTools()) {
      if (isToolDisabled(moduleTool.name)) continue;
      const rule = TOOL_ACCESS_RULES[moduleTool.name];
      const allowedRoles = rule?.roles;
      const requiredTier = rule?.minTier;

      if (!roleAllowed(allowedRoles, normalizedRole)) continue;
      if (!tierAllowed(requiredTier, normalizedTier)) continue;

      combined.set(moduleTool.name, {
        name: moduleTool.name,
        description: moduleTool.description,
        category: MODULE_CATEGORY_MAP[moduleTool.name] || 'data',
        risk: moduleTool.risk,
        requiresConfirmation: !!moduleTool.requiresConfirmation,
        parameters: inferModuleSchema(moduleTool),
        requiredTier,
        allowedRoles,
        source: 'module',
      });
    }

    for (const legacyTool of this.listLegacy(normalizedRole, normalizedTier)) {
      if (combined.has(legacyTool.id)) continue;

      const rule = TOOL_ACCESS_RULES[legacyTool.id];
      combined.set(legacyTool.id, {
        name: legacyTool.id,
        description: legacyTool.description,
        category: mapLegacyCategory(legacyTool.category),
        risk: mapLegacyRisk(legacyTool.riskLevel),
        requiresConfirmation: legacyTool.riskLevel === 'high',
        parameters: inferLegacySchema(legacyTool),
        requiredTier: (rule?.minTier || legacyTool.requiredTier) as ToolTier | undefined,
        allowedRoles: (rule?.roles || legacyTool.allowedRoles.map((r) => parseToolRole(r).role)) as ToolRole[],
        source: 'legacy',
      });
    }

    return Array.from(combined.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  getTool(name: string): UnifiedToolDefinition | undefined {
    if (isToolDisabled(name)) {
      return undefined;
    }

    const moduleTool = ModuleToolRegistry.getTool(name);
    if (moduleTool) {
      const rule = TOOL_ACCESS_RULES[moduleTool.name];
      return {
        name: moduleTool.name,
        description: moduleTool.description,
        category: MODULE_CATEGORY_MAP[moduleTool.name] || 'data',
        risk: moduleTool.risk,
        requiresConfirmation: !!moduleTool.requiresConfirmation,
        parameters: inferModuleSchema(moduleTool),
        requiredTier: rule?.minTier,
        allowedRoles: rule?.roles,
        source: 'module',
      };
    }

    const legacy = this.legacyTools.get(name);
    if (!legacy) return undefined;

    const rule = TOOL_ACCESS_RULES[legacy.id];
    return {
      name: legacy.id,
      description: legacy.description,
      category: mapLegacyCategory(legacy.category),
      risk: mapLegacyRisk(legacy.riskLevel),
      requiresConfirmation: legacy.riskLevel === 'high',
      parameters: inferLegacySchema(legacy),
      requiredTier: (rule?.minTier || legacy.requiredTier) as ToolTier | undefined,
      allowedRoles: (rule?.roles || legacy.allowedRoles.map((r) => parseToolRole(r).role)) as ToolRole[],
      source: 'legacy',
    };
  }

  hasTool(name: string, role?: string, tier?: string): boolean {
    if (isToolDisabled(name)) return false;
    return this.list(role, tier).some((tool) => tool.name === name);
  }

  toClientToolDefs(role?: string, tier?: string): UnifiedClientToolDef[] {
    return this.list(role, tier).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  getToolSpecs(role?: string, tier?: string): UnifiedClientToolDef[] {
    return this.toClientToolDefs(role, tier);
  }

  getStats(): UnifiedToolRegistryStats {
    const moduleTools = ModuleToolRegistry.getAllTools().length;
    const legacyTools = this.legacyTools.size;
    const totalTools = this.list('super_admin', 'enterprise').length;

    return {
      totalTools,
      moduleTools,
      legacyTools,
      recentExecutions: this.executionCount,
      successRate: this.executionCount > 0 ? this.successCount / this.executionCount : 0,
    };
  }

  private buildTraceId(context: ToolExecutionContext): string {
    const explicit = context.trace_id || context.traceId;
    if (typeof explicit === 'string' && explicit.trim().length > 0) {
      return explicit;
    }
    return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private normalizeExecutionContext(
    context: ToolExecutionContext,
    traceId: string,
    role: ToolRole,
    tier: ToolTier
  ): ToolExecutionContext {
    const organizationId =
      (context.organizationId as string | null | undefined) ??
      (context.preschoolId as string | null | undefined) ??
      ((context.profile as any)?.organization_id as string | null | undefined) ??
      ((context.profile as any)?.preschool_id as string | null | undefined) ??
      null;

    const userId =
      (context.userId as string | undefined) ||
      ((context.user as any)?.id as string | undefined) ||
      ((context.profile as any)?.id as string | undefined) ||
      '';

    const hasOrganization =
      typeof context.hasOrganization === 'boolean'
        ? context.hasOrganization
        : Boolean(organizationId);

    const isGuest =
      typeof context.isGuest === 'boolean'
        ? context.isGuest
        : !userId;

    return {
      ...context,
      userId,
      role,
      tier,
      organizationId,
      preschoolId: context.preschoolId ?? organizationId,
      hasOrganization,
      isGuest,
      trace_id: traceId,
      traceId,
      supabaseClient: context.supabaseClient || context.supabase,
    };
  }

  private async runWithRetry<T extends { success?: boolean; error?: string }>(
    fn: () => Promise<T>,
    maxAttempts: number
  ): Promise<T> {
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const result = await fn();
        if (result?.success !== false) {
          return result;
        }
        if (attempt < maxAttempts && isRetryableErrorMessage(result?.error)) {
          await sleep(120 * attempt);
          continue;
        }
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts && isRetryableErrorMessage((error as Error)?.message)) {
          await sleep(120 * attempt);
          continue;
        }
        break;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Tool execution failed');
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolExecutionContext = {}
  ): Promise<ToolExecutionResult> {
    const resolvedRole = parseToolRole(context.role as string | undefined);
    const resolvedTier = parseToolTier(context.tier as string | undefined);
    const role = resolvedRole.role;
    const tier = resolvedTier.tier;
    const traceId = this.buildTraceId(context);

    if (!resolvedRole.known) {
      return {
        success: false,
        error: `Unknown role "${String(context.role || '')}" for tool execution`,
        trace_id: traceId,
        metadata: {
          trace_id: traceId,
          tool_name: toolName,
          role: context.role,
          tier: context.tier,
        },
      };
    }

    if (!resolvedTier.known) {
      return {
        success: false,
        error: `Unknown tier "${String(context.tier || '')}" for tool execution`,
        trace_id: traceId,
        metadata: {
          trace_id: traceId,
          tool_name: toolName,
          role,
          tier: context.tier,
        },
      };
    }

    if (isToolDisabled(toolName)) {
      return {
        success: false,
        error: `Tool ${toolName} is disabled.`,
        trace_id: traceId,
        metadata: {
          trace_id: traceId,
          tool_name: toolName,
          disabled: true,
        },
      };
    }

    const normalizedContext = this.normalizeExecutionContext(context, traceId, role, tier);

    const tool = this.getTool(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool ${toolName} not found in unified registry`,
        trace_id: traceId,
        metadata: { trace_id: traceId, tool_name: toolName },
      };
    }

    if (!this.hasTool(toolName, role, tier)) {
      const errorMessage =
        role === 'guest'
          ? `Guest users cannot execute tools. Tool: ${toolName}`
          : `Insufficient permissions or tier for tool ${toolName}`;
      return {
        success: false,
        error: errorMessage,
        trace_id: traceId,
        metadata: {
          trace_id: traceId,
          tool_name: toolName,
          role,
          tier,
        },
      };
    }

    const confirmedTools = Array.isArray(context.confirmedTools)
      ? context.confirmedTools.map((value) => String(value))
      : [];
    const isConfirmed = confirmedTools.includes(toolName);
    const requiresConfirmation = tool.requiresConfirmation || tool.risk === 'high';

    if (requiresConfirmation && !isConfirmed) {
      return {
        success: false,
        error: `Tool ${toolName} requires explicit confirmation`,
        requires_confirmation: true,
        trace_id: traceId,
        metadata: {
          trace_id: traceId,
          tool_name: toolName,
          requires_confirmation: true,
        },
      };
    }

    this.executionCount += 1;
    console.log('[UnifiedToolRegistry] Executing tool', {
      trace_id: traceId,
      tool: toolName,
      role,
      tier,
      source: tool.source,
    });

    try {
      const moduleTool = ModuleToolRegistry.getTool(toolName);
      if (moduleTool) {
        const execution = await this.runWithRetry(
          () => ModuleToolRegistry.execute(toolName, params, normalizedContext),
          2
        ) as { success?: boolean; error?: string; result?: unknown };

        const nestedResult = execution.result as Record<string, unknown> | undefined;
        const nestedSuccess = typeof nestedResult?.success === 'boolean'
          ? nestedResult.success
          : null;
        const nestedError = typeof nestedResult?.error === 'string'
          ? nestedResult.error
          : null;
        const effectiveSuccess = Boolean(execution.success) && nestedSuccess !== false;
        const effectiveError = execution.error || (!effectiveSuccess ? (nestedError || 'Tool execution failed') : undefined);

        if (effectiveSuccess) {
          this.successCount += 1;
        }

        return {
          success: effectiveSuccess,
          result: execution.result,
          error: effectiveError,
          trace_id: traceId,
          metadata: {
            trace_id: traceId,
            tool_name: toolName,
            source: 'module',
            risk: moduleTool.risk,
            requires_confirmation: !!moduleTool.requiresConfirmation,
          },
        };
      }

      const legacyTool = this.legacyTools.get(toolName);
      if (!legacyTool) {
        return {
          success: false,
          error: `Tool ${toolName} is not registered`,
          trace_id: traceId,
          metadata: { trace_id: traceId, tool_name: toolName },
        };
      }

      const legacyContext: LegacyExecutionContext = {
        userId: normalizedContext.userId || '',
        organizationId: (normalizedContext.organizationId as string | null) ?? null,
        preschoolId: (normalizedContext.preschoolId as string | null) ?? null,
        role: String(normalizedContext.role || role),
        tier: String(normalizedContext.tier || tier),
        hasOrganization: Boolean(normalizedContext.hasOrganization),
        isGuest: Boolean(normalizedContext.isGuest),
        supabaseClient: normalizedContext.supabaseClient,
      };

      const execution = await this.runWithRetry<LegacyExecutionResult>(
        () => legacyTool.execute(params, legacyContext),
        2
      );

      if (execution.success) {
        this.successCount += 1;
      }

      return {
        success: !!execution.success,
        result: execution.data,
        error: execution.error,
        trace_id: traceId,
        metadata: {
          ...(execution.metadata || {}),
          trace_id: traceId,
          tool_name: toolName,
          source: 'legacy',
          risk: legacyTool.riskLevel,
          requires_confirmation: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message,
        trace_id: traceId,
        metadata: {
          trace_id: traceId,
          tool_name: toolName,
          source: tool.source,
        },
      };
    }
  }
}

export const unifiedToolRegistry = new UnifiedToolRegistry();
