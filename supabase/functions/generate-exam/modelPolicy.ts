import { PARENT_ROLES, STUDENT_ROLES } from './scopeResolver.ts';

export const DEFAULT_ANTHROPIC_EXAM_MODEL = 'claude-sonnet-4-20250514';
export const STARTER_HAIKU_MODEL = 'claude-3-5-haiku-20241022';
export const ANTHROPIC_MODEL_ALIASES: Record<string, string> = {
  'claude-3-5-sonnet-20241022': DEFAULT_ANTHROPIC_EXAM_MODEL,
  'claude-3-5-sonnet-latest': DEFAULT_ANTHROPIC_EXAM_MODEL,
  'claude-3-5-haiku-latest': STARTER_HAIKU_MODEL,
};

export function normalizeAnthropicModel(model: string | null | undefined): string {
  const raw = String(model || '').trim();
  if (!raw) return DEFAULT_ANTHROPIC_EXAM_MODEL;
  return ANTHROPIC_MODEL_ALIASES[raw] || raw;
}

export function getDefaultModelForTier(tier: string | null | undefined): string {
  const t = String(tier ?? 'free').toLowerCase();
  if (t.includes('enterprise') || t === 'superadmin' || t === 'super_admin') {
    return DEFAULT_ANTHROPIC_EXAM_MODEL;
  }
  if (t.includes('premium') || t.includes('pro') || t.includes('plus') || t.includes('basic')) {
    return DEFAULT_ANTHROPIC_EXAM_MODEL;
  }
  if (t.includes('starter') || t === 'trial') return STARTER_HAIKU_MODEL;
  return STARTER_HAIKU_MODEL;
}

export function normalizeTierForExamRole(
  role: string,
  profileTier: string | null,
  resolvedTier: string | null,
): string {
  const normalizedRole = String(role || '').toLowerCase();
  const normalizedProfileTier = String(profileTier || 'free').toLowerCase();
  const normalizedResolvedTier = String(resolvedTier || 'free').toLowerCase();

  if (normalizedRole === 'super_admin') return 'enterprise';

  // Parents/students must use personal tier only (do not inherit school enterprise plans).
  if (PARENT_ROLES.has(normalizedRole) || STUDENT_ROLES.has(normalizedRole)) {
    return normalizedProfileTier || 'free';
  }

  return normalizedResolvedTier || normalizedProfileTier || 'free';
}

export function isFreemiumTier(tier: string | null | undefined): boolean {
  const t = String(tier || 'free').toLowerCase();
  return t === 'free' || t.includes('freemium') || t.includes('starter') || t.includes('trial');
}

export function isParentStarterTierForExam(role: string, tier: string | null | undefined): boolean {
  const normalizedRole = String(role || '').toLowerCase();
  const normalizedTier = String(tier || '').toLowerCase();
  return PARENT_ROLES.has(normalizedRole) && normalizedTier.includes('starter');
}

export function buildModelFallbackChain(
  preferredModel: string,
  configuredFallbacks: string[],
): string[] {
  const ordered = [
    preferredModel,
    ...configuredFallbacks,
    DEFAULT_ANTHROPIC_EXAM_MODEL,
    STARTER_HAIKU_MODEL,
    'claude-3-haiku-20240307',
  ];
  return [...new Set(ordered.map((model) => normalizeAnthropicModel(model)).filter(Boolean))];
}

export function isCreditOrBillingError(status: number, responseText: string): boolean {
  const text = String(responseText || '').toLowerCase();
  if (status === 402) return true;
  return (
    text.includes('credit balance is too low') ||
    text.includes('insufficient credits') ||
    text.includes('insufficient_quota') ||
    (text.includes('quota') && text.includes('exceeded')) ||
    text.includes('billing')
  );
}
