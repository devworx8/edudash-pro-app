/**
 * useDashAITools — Manual (user-triggered) tool execution.
 *
 * Extracted from useDashAssistantImpl.ts (Phase 1 refactor).
 * Handles ToolRegistry lookup, execution, and result message creation.
 *
 * NOTE: The *automatic* tool-planning that happens inside sendMessageInternal
 * (planToolCall / auto-tool merge) stays in the send pipeline for now because
 * it is tightly coupled to the streaming response lifecycle.
 */

import { useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { ToolRegistry } from '@/services/AgentTools';
import { getDashToolShortcutsForRole } from '@/lib/ai/toolCatalog';
import { formatToolResultMessage } from '@/lib/ai/toolUtils';
import type { DashMessage } from '@/services/dash-ai/types';
import type { IDashAIAssistant } from '@/services/dash-ai/DashAICompat';
import { formatDashToolActivityLabel } from './types';

// ─── Types ──────────────────────────────────────────────────

export interface UseDashAIToolsOptions {
  dashInstance: IDashAIAssistant | null;
  tier: string | undefined;
  setMessages: React.Dispatch<React.SetStateAction<DashMessage[]>>;
  setActiveToolLabel: React.Dispatch<React.SetStateAction<string | null>>;
  setHasActiveToolExecution: React.Dispatch<React.SetStateAction<boolean>>;
  showAlert: (config: { title: string; message: string; type?: string; icon?: string; buttons?: any[] }) => void;
}

// ─── Hook ───────────────────────────────────────────────────

export function useDashAITools(opts: UseDashAIToolsOptions) {
  const {
    dashInstance,
    tier,
    setMessages,
    setActiveToolLabel,
    setHasActiveToolExecution,
    showAlert,
  } = opts;
  const { user, profile } = useAuth();

  const activeToolCountRef = useRef(0);

  const beginToolExecution = useCallback(() => {
    activeToolCountRef.current += 1;
    if (activeToolCountRef.current === 1) setHasActiveToolExecution(true);
  }, [setHasActiveToolExecution]);

  const endToolExecution = useCallback(() => {
    activeToolCountRef.current = Math.max(0, activeToolCountRef.current - 1);
    if (activeToolCountRef.current === 0) {
      setHasActiveToolExecution(false);
      setActiveToolLabel(null);
    }
  }, [setHasActiveToolExecution, setActiveToolLabel]);

  // Pre-computed tool shortcut lists (role-gated)
  const toolShortcuts = useMemo(() => {
    const shortcuts = getDashToolShortcutsForRole(profile?.role || null);
    return shortcuts.filter((tool) => ToolRegistry.hasTool(tool.name));
  }, [profile?.role]);

  const autoToolShortcuts = useMemo(() => {
    const role = String(profile?.role || '').toLowerCase();
    const capsAllowedForRole = !['parent', 'student'].includes(role);
    return toolShortcuts.filter(
      (tool) =>
        (tool.category === 'caps' && capsAllowedForRole) ||
        tool.category === 'data' ||
        tool.category === 'navigation' ||
        (tool.category === 'communication' &&
          (tool.name === 'export_pdf' || tool.name === 'generate_pdf_from_prompt')),
    );
  }, [toolShortcuts, profile?.role]);

  const plannerTools = useMemo(
    () =>
      autoToolShortcuts
        .map((tool) => {
          const rt = ToolRegistry.getTool(tool.name);
          return {
            name: tool.name,
            description: tool.description || rt?.description || tool.label,
            parameters: rt?.parameters,
          };
        })
        .filter((t) => !!t.name),
    [autoToolShortcuts],
  );

  /** Execute a named tool manually (from a tool-shortcut button or AI suggestion). */
  const runTool = useCallback(
    async (toolName: string, params: Record<string, any>) => {
      const tool = ToolRegistry.getTool(toolName);
      const label = tool?.name || toolName;

      if (!tool) {
        showAlert({
          title: 'Tool Not Found',
          message: `The tool "${toolName}" is not available right now.`,
          type: 'warning',
          icon: 'alert-circle-outline',
          buttons: [{ text: 'OK', style: 'default' }],
        });
        return;
      }

      let supabaseClient: any = null;
      try {
        supabaseClient = assertSupabase();
      } catch { /* noop */ }

      const context = {
        profile,
        user,
        supabase: supabaseClient,
        role: String(profile?.role || 'parent').toLowerCase(),
        tier: tier || 'free',
        organizationId:
          (profile as any)?.organization_id || (profile as any)?.preschool_id || null,
        hasOrganization: Boolean(
          (profile as any)?.organization_id || (profile as any)?.preschool_id,
        ),
        isGuest: !user?.id,
        trace_id: `dash_assistant_manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tool_plan: { source: 'useDashAITools.runTool', tool: toolName },
      };

      setActiveToolLabel(formatDashToolActivityLabel(toolName, label));
      beginToolExecution();
      const execution = await ToolRegistry.execute(toolName, params, context).finally(() => {
        endToolExecution();
      });
      const content = formatToolResultMessage(label, execution);

      const toolMessage: DashMessage = {
        id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'assistant',
        content,
        timestamp: Date.now(),
        metadata: {
          tool_name: toolName,
          tool_result: execution,
          tool_args: params || {},
          tool_origin: 'manual_tool',
          tool_outcome:
            execution?.success === false
              ? { status: 'failed', source: 'tool_registry', errorCode: String(execution?.error || 'manual_tool_failed') }
              : { status: 'success', source: 'tool_registry' },
        },
      };

      setMessages((prev) => [...prev, toolMessage]);

      const convId = dashInstance?.getCurrentConversationId?.();
      if (dashInstance && convId) {
        try {
          await dashInstance.addMessageToConversation(convId, toolMessage);
        } catch (error) {
          console.warn('[useDashAITools] Failed to persist tool message:', error);
        }
      }
    },
    [dashInstance, profile, user, showAlert, tier, beginToolExecution, endToolExecution, setMessages, setActiveToolLabel],
  );

  return {
    runTool,
    beginToolExecution,
    endToolExecution,
    toolShortcuts,
    autoToolShortcuts,
    plannerTools,
  };
}
