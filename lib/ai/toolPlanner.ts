import { resolveAIProxyScopeFromRole } from './aiProxyScope';

export type ToolPlannerCandidate = {
  name: string;
  description: string;
  parameters?: any;
};

export type ToolPlanResult = {
  tool: string | null;
  parameters?: Record<string, any>;
  reason?: string;
  intent?: 'tool' | 'plan_mode' | 'none';
  intent_confidence?: number;
};

const KEYWORD_HINTS = [
  // Curriculum & education
  'caps', 'curriculum', 'syllabus', 'lesson', 'subject', 'grade',
  // Assignments & homework
  'assignment', 'assignments', 'homework', 'activity',
  // Schedule & events
  'schedule', 'timetable', 'event', 'events', 'due', 'calendar',
  // Students & classes
  'attendance', 'progress', 'student', 'learner', 'class', 'classes',
  // Analytics & reports
  'stats', 'statistics', 'report', 'analytics', 'performance',
  // Documents & export
  'export', 'document', 'open', 'link', 'pdf', 'printable', 'download',
  // Communication
  'message', 'email', 'compose', 'send', 'notify',
  // Support
  'help', 'support', 'ticket', 'issue',
  // Members
  'teacher', 'parent', 'member', 'list',
];

const CAPS_SEARCH_PATTERN = /\b(caps|curriculum|south\s*afric(?:a|an)|dbe)\b/i;
const SEARCH_ACTION_PATTERN = /\b(search|look\s*up|find|check|align|guideline|criteria)\b/i;
const PLAN_MODE_PATTERN = /\b(please\s+implement\s+this\s+plan|implement\s+this\s+plan|implement\s+the\s+plan|execute\s+this\s+plan|execution\s+plan|implementation\s+plan|rollout\s+plan)\b/i;
const PLAN_SUPPORT_PATTERN = /\b(plan|phases?|steps?|milestones?|hardening|rollout|implementation)\b/i;
const PDF_REQUEST_PATTERN = /\b(pdf|printable|print[- ]?ready|downloadable)\b/i;
const PDF_ACTION_PATTERN = /\b(create|generate|make|export|save|convert|turn|prepare|print)\b/i;

const normalizeSpaces = (value: string): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

function resolveDeterministicToolPlan(message: string, tools: ToolPlannerCandidate[]): ToolPlanResult | null {
  const normalized = normalizeSpaces(message);
  if (PLAN_MODE_PATTERN.test(normalized)) {
    return {
      tool: null,
      reason: 'deterministic_plan_mode_intent',
      intent: 'plan_mode',
      intent_confidence: 0.96,
    };
  }
  if (
    /\bplan\b/i.test(normalized) &&
    /\b(implement|execute|ship|deliver|build|apply)\b/i.test(normalized) &&
    PLAN_SUPPORT_PATTERN.test(normalized)
  ) {
    return {
      tool: null,
      reason: 'deterministic_plan_mode_intent_secondary',
      intent: 'plan_mode',
      intent_confidence: 0.82,
    };
  }

  const availableTools = new Set(
    tools
      .map((tool) => String(tool?.name || '').trim())
      .filter(Boolean)
  );

  if (
    PDF_REQUEST_PATTERN.test(normalized) &&
    (PDF_ACTION_PATTERN.test(normalized) || /\bpdf\b/i.test(normalized)) &&
    availableTools.has('generate_pdf_from_prompt')
  ) {
    let documentType: string | undefined;
    if (/\bworksheet\b/i.test(normalized)) documentType = 'worksheet';
    else if (/\b(study\s*guide|revision)\b/i.test(normalized)) documentType = 'study_guide';
    else if (/\b(report|progress)\b/i.test(normalized)) documentType = 'report';
    else if (/\b(letter|email)\b/i.test(normalized)) documentType = 'letter';

    return {
      tool: 'generate_pdf_from_prompt',
      parameters: {
        prompt: normalized,
        ...(documentType ? { document_type: documentType } : {}),
      },
      reason: 'deterministic_pdf_generation_intent',
      intent: 'tool',
      intent_confidence: 0.94,
    };
  }

  if (
    CAPS_SEARCH_PATTERN.test(normalized) &&
    SEARCH_ACTION_PATTERN.test(normalized) &&
    availableTools.has('search_caps_curriculum')
  ) {
    return {
      tool: 'search_caps_curriculum',
      parameters: {
        query: normalized.slice(0, 220),
      },
      reason: 'deterministic_caps_search_intent',
    };
  }

  return null;
}

export function shouldAttemptToolPlan(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (normalized.length < 6) return false;
  if (PLAN_MODE_PATTERN.test(normalized)) return true;
  return KEYWORD_HINTS.some((keyword) => normalized.includes(keyword));
}

const buildPlannerPrompt = (message: string, tools: ToolPlannerCandidate[]) => {
  const toolList = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  return [
    'You are a tool planner for the Dash app.',
    'Decide if a single tool should be called to answer the user.',
    'Only select a tool if it clearly helps answer the request.',
    'If no tool is needed, respond with {"tool": null}.',
    'Return JSON only. No markdown, no explanations.',
    '',
    `User message: """${message}"""`,
    '',
    'Allowed tools:',
    JSON.stringify(toolList, null, 2),
    '',
    'Return JSON in this format:',
    '{"tool": "tool_name_or_null", "parameters": { "param": "value" }, "reason": "short reason"}',
  ].join('\n');
};

const extractJsonBlock = (text: string): string | null => {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
};

export async function planToolCall(options: {
  supabaseClient: any;
  role: string;
  message: string;
  tools: ToolPlannerCandidate[];
}): Promise<ToolPlanResult | null> {
  const { supabaseClient, role, message, tools } = options;

  const deterministicPlan = resolveDeterministicToolPlan(message, tools);
  if (deterministicPlan) {
    return deterministicPlan;
  }
  if (!supabaseClient || tools.length === 0) return null;

  const prompt = buildPlannerPrompt(message, tools);
  const scope = resolveAIProxyScopeFromRole(role);

  const { data, error } = await supabaseClient.functions.invoke('ai-proxy', {
    body: {
      scope,
      service_type: 'chat_message',
      payload: {
        prompt,
      },
      stream: false,
      enable_tools: false,
      prefer_openai: true,
      metadata: {
        source: 'dash_tool_planner',
      },
    },
  });

  if (error) {
    return null;
  }

  const content = typeof data?.content === 'string' ? data.content : '';
  const jsonBlock = extractJsonBlock(content);
  if (!jsonBlock) return null;

  try {
    const parsed = JSON.parse(jsonBlock);
    const toolName = parsed.tool || parsed.tool_name || parsed.name || null;
    const normalizedTool = typeof toolName === 'string' ? toolName.trim() : null;
    if (!normalizedTool || normalizedTool === 'none') {
      return {
        tool: null,
        intent: parsed.intent === 'plan_mode' ? 'plan_mode' : 'none',
        intent_confidence:
          typeof parsed.intent_confidence === 'number' ? parsed.intent_confidence : undefined,
      };
    }
    const allowed = tools.some((tool) => tool.name === normalizedTool);
    if (!allowed) return null;

    return {
      tool: normalizedTool,
      parameters: parsed.parameters || {},
      reason: parsed.reason,
      intent: 'tool',
      intent_confidence:
        typeof parsed.intent_confidence === 'number' ? parsed.intent_confidence : undefined,
    };
  } catch {
    return null;
  }
}
