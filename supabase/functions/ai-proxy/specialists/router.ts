// ── Specialist Router ───────────────────────────────────────────────────────
// Routes specific service types to optimal provider + specialist system prompt.
// Dash (Claude) remains the primary orchestrator. Specialists handle domain-
// specific tasks where a focused system prompt + cheaper/faster model wins.
// ────────────────────────────────────────────────────────────────────────────

import { getDeepSeekApiKey } from '../providers/deepseek.ts';
import { getGeminiApiKey } from '../providers/gemini.ts';
import { getOpenAIApiKey } from '../auth.ts';

export type SpecialistProvider = 'anthropic' | 'openai' | 'deepseek' | 'gemini';

export type SpecialistRoute = {
  /** Which provider to use */
  provider: SpecialistProvider;
  /** Model override (null = use provider default) */
  model: string | null;
  /** Specialist system prompt key */
  specialistId: string;
  /** Max tokens override for this specialist */
  maxTokens: number;
  /** Temperature override */
  temperature?: number;
};

/**
 * Service types that have specialist routing.
 * Everything else falls through to the default Dash (Claude) path.
 */
const SPECIALIST_ROUTES: Record<string, SpecialistRoute> = {
  // ── CAPS Curriculum Expert ────────────────────────────────────────
  // High-volume structured lookups → DeepSeek (cheapest) or Gemini (fast)
  caps_curriculum_query: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    specialistId: 'caps_curriculum',
    maxTokens: 3072,
    temperature: 0.2,
  },
  caps_lesson_alignment: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    specialistId: 'caps_curriculum',
    maxTokens: 3072,
    temperature: 0.2,
  },

  // ── Progress Report Writer ────────────────────────────────────────
  // Needs strong English prose quality → OpenAI GPT-4o-mini
  progress_report_generation: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    specialistId: 'report_writer',
    maxTokens: 4096,
    temperature: 0.5,
  },
  progress_report_comment: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    specialistId: 'report_writer',
    maxTokens: 2048,
    temperature: 0.5,
  },

  // ── Parent Communicator ───────────────────────────────────────────
  // Multilingual SA languages → OpenAI (better multilingual than DeepSeek)
  parent_notification: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    specialistId: 'parent_communicator',
    maxTokens: 1024,
    temperature: 0.4,
  },
  parent_message_draft: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    specialistId: 'parent_communicator',
    maxTokens: 1024,
    temperature: 0.4,
  },
  sms_template: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    specialistId: 'parent_communicator',
    maxTokens: 256,
    temperature: 0.3,
  },
  whatsapp_message: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    specialistId: 'parent_communicator',
    maxTokens: 512,
    temperature: 0.4,
  },

  // ── Assessment Builder ────────────────────────────────────────────
  // Structured output, high-volume → DeepSeek (cheapest)
  exam_generation: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    specialistId: 'assessment_builder',
    maxTokens: 4096,
    temperature: 0.3,
  },
  quiz_generation: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    specialistId: 'assessment_builder',
    maxTokens: 3072,
    temperature: 0.3,
  },
  homework_generation: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    specialistId: 'assessment_builder',
    maxTokens: 3072,
    temperature: 0.3,
  },

  // ── AI Tutor (Learner Interactions) ───────────────────────────────
  // High-volume, conversational → Gemini Flash (cheapest for chat)
  homework_help: {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    specialistId: 'ai_tutor',
    maxTokens: 2048,
    temperature: 0.4,
  },
  explain_concept: {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    specialistId: 'ai_tutor',
    maxTokens: 2048,
    temperature: 0.4,
  },
};

/**
 * Check if a service type has a specialist route.
 */
export function hasSpecialistRoute(serviceType: string): boolean {
  return serviceType in SPECIALIST_ROUTES;
}

/**
 * Resolve a specialist route, falling back gracefully if the target
 * provider is not configured.
 */
export function resolveSpecialistRoute(serviceType: string): SpecialistRoute | null {
  const route = SPECIALIST_ROUTES[serviceType];
  if (!route) return null;

  // Check if target provider is available, fall back if not
  const resolved = { ...route };

  switch (resolved.provider) {
    case 'deepseek':
      if (!getDeepSeekApiKey()) {
        // Fall back: Gemini → OpenAI → return null (use default Dash)
        if (getGeminiApiKey()) {
          resolved.provider = 'gemini';
          resolved.model = 'gemini-2.0-flash';
        } else if (getOpenAIApiKey()) {
          resolved.provider = 'openai';
          resolved.model = 'gpt-4o-mini';
        } else {
          return null; // Use default Claude path
        }
      }
      break;

    case 'gemini':
      if (!getGeminiApiKey()) {
        if (getDeepSeekApiKey()) {
          resolved.provider = 'deepseek';
          resolved.model = 'deepseek-chat';
        } else if (getOpenAIApiKey()) {
          resolved.provider = 'openai';
          resolved.model = 'gpt-4o-mini';
        } else {
          return null;
        }
      }
      break;

    case 'openai':
      if (!getOpenAIApiKey()) {
        if (getGeminiApiKey()) {
          resolved.provider = 'gemini';
          resolved.model = 'gemini-2.0-flash';
        } else if (getDeepSeekApiKey()) {
          resolved.provider = 'deepseek';
          resolved.model = 'deepseek-chat';
        } else {
          return null;
        }
      }
      break;
  }

  return resolved;
}

/**
 * Get all available specialist IDs for diagnostics/admin.
 */
export function getSpecialistIds(): string[] {
  const ids = new Set<string>();
  for (const route of Object.values(SPECIALIST_ROUTES)) {
    ids.add(route.specialistId);
  }
  return Array.from(ids);
}

/**
 * Get all service types routed to a specific specialist.
 */
export function getServiceTypesForSpecialist(specialistId: string): string[] {
  return Object.entries(SPECIALIST_ROUTES)
    .filter(([_, route]) => route.specialistId === specialistId)
    .map(([serviceType]) => serviceType);
}
