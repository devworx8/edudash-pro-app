import { logger } from '@/lib/logger';
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { getCapabilityTier, normalizeTierName } from '@/lib/tiers'
import { 
  AIModelId, 
  AIModelInfo, 
  SubscriptionTier,
  getModelsForTier, 
  getDefaultModelForTier, 
  canAccessModel,
  getTierQuotas
} from '@/lib/ai/models'

export interface AIModelSelectionState {
  availableModels: AIModelInfo[]
  selectedModel: AIModelId
  canSelectModel: (modelId: AIModelId) => boolean
  setSelectedModel: (modelId: AIModelId) => void
  tier: SubscriptionTier
  quotas: {
    ai_requests: number
    priority_support: boolean
    rpm_limit: number
  }
  isLoading: boolean
}

/**
 * Hook for managing AI model selection based on user's subscription tier
 * 
 * @param feature - The AI feature being used (for quota tracking)
 * @param initialModel - Optional initial model selection
 * @returns Model selection state and controls
 */
export function useAIModelSelection(
  feature: string = 'ai_requests',
  initialModel?: AIModelId
): AIModelSelectionState {
  const { tier: subscriptionTier, ready } = useSubscription()
  // Start with Haiku 4.5 as a safe placeholder; upgraded to tier default once subscription loads.
  const [selectedModel, setSelectedModelState] = useState<AIModelId>('claude-haiku-4-5-20251001')
  const [isLoading, setIsLoading] = useState(true)

  // Normalize tier for consistency
  const tier = useMemo((): SubscriptionTier => {
    if (!subscriptionTier) return 'free'

    const capabilityTier = getCapabilityTier(normalizeTierName(String(subscriptionTier)))
    return capabilityTier as SubscriptionTier
  }, [subscriptionTier])

  // Get available models based on tier
  const availableModels = useMemo(() => {
    return getModelsForTier(tier)
  }, [tier])

  // Get tier quotas
  const quotas = useMemo(() => {
    return getTierQuotas(tier)
  }, [tier])

  // Set default model when tier loads or changes
  useEffect(() => {
    if (!ready) return

    const defaultModel = initialModel || getDefaultModelForTier(tier)

    if (!canAccessModel(tier, selectedModel)) {
      // Current model is above this tier — downgrade to tier default
      setSelectedModelState(defaultModel)
    } else if (selectedModel === 'claude-haiku-4-5-20251001' || selectedModel === 'claude-3-haiku-20240307') {
      // Still on the initial placeholder — upgrade to the tier's proper default.
      // (Stored user preferences are restored later by useDashChatModelPreference.)
      setSelectedModelState(defaultModel)
    } else if (initialModel && canAccessModel(tier, initialModel)) {
      setSelectedModelState(initialModel)
    }

    setIsLoading(false)
  }, [tier, ready, initialModel, selectedModel])

  // Check if user can access a specific model
  const canSelectModel = useCallback((modelId: AIModelId): boolean => {
    return canAccessModel(tier, modelId)
  }, [tier])

  // Safe model setter that respects tier limits
  const setSelectedModel = useCallback((modelId: AIModelId) => {
    if (canSelectModel(modelId)) {
      setSelectedModelState(modelId)
    } else {
      logger.warn(`Model ${modelId} not available for tier ${tier}, using default`)
      setSelectedModelState(getDefaultModelForTier(tier))
    }
  }, [canSelectModel, tier])

  return {
    availableModels,
    selectedModel,
    canSelectModel,
    setSelectedModel,
    tier,
    quotas,
    isLoading: isLoading || !ready
  }
}

/**
 * Hook specifically for lesson generation with appropriate model defaults
 */
export function useLessonGeneratorModels(initialModel?: AIModelId) {
  return useAIModelSelection('lesson_generation', initialModel)
}

/**
 * Hook specifically for homework help with appropriate model defaults
 */
export function useHomeworkHelperModels(initialModel?: AIModelId) {
  return useAIModelSelection('homework_help', initialModel)
}

/**
 * Hook specifically for grading assistance with appropriate model defaults
 */
export function useGradingModels(initialModel?: AIModelId) {
  return useAIModelSelection('grading_assistance', initialModel)
}

/**
 * Simple tier display information hook
 */
export function useTierInfo() {
  const { tier: subscriptionTier, ready } = useSubscription()
  
  const tierInfo = useMemo(() => {
    if (!subscriptionTier) return null
    
    const normalizedTier = subscriptionTier.toLowerCase()
    
    switch (normalizedTier) {
      case 'free':
        return {
          name: 'Free Plan',
          color: '#6B7280',
          badge: 'Free',
          description: 'Basic AI assistance'
        }
      case 'starter':
      case 'parent_starter':
      case 'teacher_starter':
      case 'school_starter':
      case 'trial':
        return {
          name: 'Starter Plan', 
          color: '#059669',
          badge: 'Starter',
          description: 'Enhanced AI with better models'
        }
      case 'premium':
      case 'parent_plus':
      case 'teacher_pro':
      case 'school_premium':
      case 'school_pro':
      case 'pro':
        return {
          name: 'Premium Plan',
          color: '#7C3AED', 
          badge: 'Premium',
          description: 'Advanced AI with all models'
        }
      case 'enterprise':
      case 'school_enterprise':
      case 'super_admin':
      case 'superadmin':
        return {
          name: 'Enterprise Plan',
          color: '#DC2626',
          badge: 'Enterprise', 
          description: 'Unlimited AI with priority support'
        }
      default:
        return {
          name: 'Free Plan',
          color: '#6B7280',
          badge: 'Free',
          description: 'Basic AI assistance'
        }
    }
  }, [subscriptionTier])
  
  return {
    tierInfo,
    isLoading: !ready
  }
}
