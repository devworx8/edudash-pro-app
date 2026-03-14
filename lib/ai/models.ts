export type AIModelId =
  | 'claude-3-haiku-20240307'
  | 'claude-haiku-4-5-20251001'
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-7-sonnet-20250219'
  | 'claude-sonnet-4-20250514'
  | 'claude-sonnet-4-5-20250514'
export type SubscriptionTier = 'free' | 'starter' | 'premium' | 'enterprise'

export type AIModelInfo = {
  id: AIModelId
  name: string
  provider: 'claude' | 'openai' | 'custom'
  relativeCost: number // configurable weight for pricing/cost hints (1x, 5x, 20x)
  notes?: string
  minTier: SubscriptionTier // Minimum subscription tier required
  displayName: string // User-friendly display name
  description: string // Detailed description for UI
}

// Central place to tune model weights for UI hints and rough cost estimates
export const MODEL_WEIGHTS: Record<AIModelId, number> = {
  'claude-3-haiku-20240307': 1,
  'claude-haiku-4-5-20251001': 2,
  'claude-3-5-haiku-20241022': 3,
  'claude-3-5-sonnet-20241022': 5,
  'claude-3-7-sonnet-20250219': 6,
  'claude-sonnet-4-20250514': 8,
  'claude-sonnet-4-5-20250514': 10,
}

// Tier hierarchy for access checks
export const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  'free': 1,
  'starter': 2,
  'premium': 3,
  'enterprise': 4,
}

// Monthly quota limits by tier (number of AI requests)
export const TIER_QUOTAS: Record<SubscriptionTier, { ai_requests: number; priority_support: boolean; rpm_limit: number }> = {
  'free': { ai_requests: 300, priority_support: false, rpm_limit: 5 },
  'starter': { ai_requests: 1500, priority_support: false, rpm_limit: 15 },
  'premium': { ai_requests: 6000, priority_support: true, rpm_limit: 30 },
  'enterprise': { ai_requests: -1, priority_support: true, rpm_limit: 60 }, // -1 = unlimited
}

export function getDefaultModels(): AIModelInfo[] {
  return [
    {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      displayName: 'Dash Quick',
      provider: 'claude',
      relativeCost: MODEL_WEIGHTS['claude-3-haiku-20240307'],
      minTier: 'free',
      description: 'Lightning-fast responses for quick questions and basic lesson planning',
      notes: 'Available on all plans'
    },
    {
      id: 'claude-haiku-4-5-20251001',
      name: 'Claude Haiku 4.5',
      displayName: 'Dash Swift',
      provider: 'claude',
      relativeCost: MODEL_WEIGHTS['claude-haiku-4-5-20251001'],
      minTier: 'free',
      description: 'Fast, modern baseline model for daily tutoring and routine generation',
      notes: 'Default for Free tier'
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      displayName: 'Dash Swift (Legacy)',
      provider: 'claude',
      relativeCost: MODEL_WEIGHTS['claude-3-5-haiku-20241022'],
      minTier: 'starter',
      description: 'Faster reasoning with better explanations for everyday tutoring',
      notes: 'Starter plan and above'
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      displayName: 'Dash Smart',
      provider: 'claude',
      relativeCost: MODEL_WEIGHTS['claude-3-5-sonnet-20241022'],
      minTier: 'starter',
      description: 'Balanced intelligence for detailed lesson planning and feedback',
      notes: 'Starter plan and above'
    },
    {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      displayName: 'Dash Advanced',
      provider: 'claude',
      relativeCost: MODEL_WEIGHTS['claude-3-7-sonnet-20250219'],
      minTier: 'starter',
      description: 'Higher accuracy for lesson and routine planning with strong instruction-following',
      notes: 'Default for Starter tier'
    },
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      displayName: 'Dash Pro',
      provider: 'claude',
      relativeCost: MODEL_WEIGHTS['claude-sonnet-4-20250514'],
      minTier: 'premium',
      description: 'Top-tier reasoning for premium tutoring and generation workflows',
      notes: 'Default for Premium/Plus/Trial tiers'
    },
    {
      id: 'claude-sonnet-4-5-20250514',
      name: 'Claude Sonnet 4.5',
      displayName: 'Dash Pro+',
      provider: 'claude',
      relativeCost: MODEL_WEIGHTS['claude-sonnet-4-5-20250514'],
      minTier: 'enterprise',
      description: 'Fastest, strongest Sonnet tier for heavy autonomy tasks',
      notes: 'Enterprise only (requires availability)'
    },
  ]
}

/**
 * Check if a user's tier allows access to a specific model
 */
export function canAccessModel(userTier: SubscriptionTier, modelId: AIModelId): boolean {
  const model = getDefaultModels().find(m => m.id === modelId)
  if (!model) return false
  
  return TIER_HIERARCHY[userTier] >= TIER_HIERARCHY[model.minTier]
}

/**
 * Get all models available to a specific tier
 */
export function getModelsForTier(tier: SubscriptionTier): AIModelInfo[] {
  return getDefaultModels().filter(model => canAccessModel(tier, model.id))
}

/**
 * Get the default/recommended model for a tier
 */
export function getDefaultModelForTier(tier: SubscriptionTier): AIModelId {
  const costSafeDefaults: Record<SubscriptionTier, AIModelId> = {
    free: 'claude-haiku-4-5-20251001',
    starter: 'claude-3-7-sonnet-20250219',
    premium: 'claude-sonnet-4-20250514',
    enterprise: 'claude-sonnet-4-5-20250514',
  }
  const preferred = costSafeDefaults[tier] || 'claude-3-haiku-20240307'
  if (canAccessModel(tier, preferred)) return preferred
  const availableModels = getModelsForTier(tier)
  return availableModels[0]?.id || 'claude-3-haiku-20240307'
}

/**
 * Check quota limits for a tier
 */
export function getTierQuotas(tier: SubscriptionTier) {
  return TIER_QUOTAS[tier]
}
