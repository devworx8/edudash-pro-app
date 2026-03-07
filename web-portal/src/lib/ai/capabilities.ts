/**
 * Dash AI Capability System
 *
 * Tier-based feature flagging system for controlling access to AI features
 * based on user subscription tier.
 *
 * @module lib/ai/capabilities
 *
 * Future enhancements:
 * - [ ] Dynamic capability loading from database/remote config
 * - [ ] A/B testing framework integration for gradual rollouts
 * - [ ] Per-user capability overrides for beta testing
 * - [ ] Usage analytics and telemetry per capability
 * - [ ] Capability expiration/time-based access
 * - [ ] Quota tracking per capability (e.g., API calls/month)
 */

/**
 * Available subscription tiers in ascending order of features.
 * Must stay in sync with CapabilityTier in `/lib/tiers/index.ts` (mobile canonical source).
 */
export type Tier = 'free' | 'starter' | 'premium' | 'enterprise';

/**
 * Granular capability identifiers for feature gating
 *
 * Naming convention: <domain>.<feature>.<variant>
 * - domain: chat, memory, multimodal, homework, lessons, insights, agent, export
 * - feature: specific functionality area
 * - variant: optional specificity (basic, advanced, etc.)
 */
export type DashCapability =
  // Chat capabilities
  | 'chat.basic'                    // Basic text-based chat
  | 'chat.streaming'                // Real-time token streaming
  | 'chat.thinking'                 // Show AI reasoning process
  | 'chat.priority'                 // Priority queue processing

  // Memory capabilities
  | 'memory.lite'                   // 7-day conversation history
  | 'memory.standard'               // 30-day conversation history
  | 'memory.advanced'               // Unlimited history + behavioral learning
  | 'memory.patterns'               // Cross-session pattern detection

  // Multimodal capabilities
  | 'multimodal.vision'             // Image analysis and understanding
  | 'multimodal.ocr'                // Optical character recognition
  | 'multimodal.documents'          // PDF/DOCX processing
  | 'multimodal.handwriting'        // Handwriting recognition

  // Homework capabilities
  | 'homework.assign'               // Create and assign homework
  | 'homework.grade.basic'          // Basic objective grading (math, MC)
  | 'homework.grade.advanced'       // Advanced subjective grading (essays)
  | 'homework.grade.bulk'           // Batch grading for 100+ submissions
  | 'homework.rubric'               // Auto-generate grading rubrics
  | 'homework.feedback'             // Personalized feedback generation

  // Lesson capabilities
  | 'lessons.basic'                 // Basic lesson help and guidance
  | 'lessons.curriculum'            // Curriculum-aligned lesson plans
  | 'lessons.adaptive'              // Step-by-step adaptive lessons
  | 'lessons.trends'                // Trend-based lesson generation
  | 'lessons.personalized'          // Student-specific customization

  // Insights & Analytics
  | 'insights.basic'                // Basic statistics and metrics
  | 'insights.proactive'            // Daily briefings and suggestions
  | 'insights.predictive'           // Predictive analytics and forecasts
  | 'insights.custom'               // Custom report generation
  | 'insights.realtime'             // Real-time activity monitoring

  // Agent capabilities
  | 'agent.workflows'               // Multi-step task workflows
  | 'agent.autonomous'              // Autonomous task planning
  | 'agent.background'              // Background task processing
  | 'agent.scheduling'              // Automated scheduling

  // Export capabilities
  | 'export.pdf.basic'              // Basic PDF generation
  | 'export.pdf.advanced'           // Advanced templates with branding
  | 'export.pdf.bulk'               // Batch PDF generation
  | 'export.conversation'           // Export conversation history

  // Processing capabilities
  | 'processing.priority'           // Priority queue access
  | 'processing.background'         // Background job processing
  | 'processing.batch'              // Batch operations;

/**
 * Tier capability matrix - defines which capabilities are available per tier
 *
 * Organized by tier in ascending order, with each tier inheriting all
 * capabilities from lower tiers plus its own additions.
 */
export const CAPABILITY_MATRIX: Readonly<Record<Tier, readonly DashCapability[]>> = {
  free: [
    'chat.basic',
    'memory.lite',
    'multimodal.vision',         // Free tier gets limited vision access (4/day)
    'lessons.basic',
    'insights.basic',
  ],

  starter: [
    'chat.basic',
    'chat.streaming',
    'memory.lite',
    'memory.standard',
    'multimodal.vision',         // Phase 2.1: Vision support for Starter tier (R299)
    'multimodal.documents',      // Document processing for Starter tier
    'homework.assign',
    'homework.grade.basic',
    'lessons.basic',
    'lessons.curriculum',
    'insights.basic',
    'export.pdf.basic',
    'export.conversation',
  ],


  premium: [
    'chat.basic',
    'chat.streaming',
    'chat.thinking',
    'chat.priority',
    'memory.standard',
    'memory.advanced',
    'memory.patterns',
    'multimodal.vision',
    'multimodal.ocr',
    'multimodal.documents',
    'multimodal.handwriting',
    'homework.assign',
    'homework.grade.basic',
    'homework.grade.advanced',
    'homework.grade.bulk',
    'homework.rubric',
    'homework.feedback',
    'lessons.basic',
    'lessons.curriculum',
    'lessons.adaptive',
    'lessons.trends',
    'lessons.personalized',
    'insights.basic',
    'insights.proactive',
    'insights.predictive',
    'insights.realtime',
    'agent.workflows',
    'agent.autonomous',
    'agent.background',
    'agent.scheduling',
    'export.pdf.basic',
    'export.pdf.advanced',
    'export.pdf.bulk',
    'export.conversation',
    'processing.priority',
    'processing.background',
    'processing.batch',
  ],

  enterprise: [
    'chat.basic',
    'chat.streaming',
    'chat.thinking',
    'chat.priority',
    'memory.standard',
    'memory.advanced',
    'memory.patterns',
    'multimodal.vision',
    'multimodal.ocr',
    'multimodal.documents',
    'multimodal.handwriting',
    'homework.assign',
    'homework.grade.basic',
    'homework.grade.advanced',
    'homework.grade.bulk',
    'homework.rubric',
    'homework.feedback',
    'lessons.basic',
    'lessons.curriculum',
    'lessons.adaptive',
    'lessons.trends',
    'lessons.personalized',
    'insights.basic',
    'insights.proactive',
    'insights.predictive',
    'insights.custom',
    'insights.realtime',
    'agent.workflows',
    'agent.autonomous',
    'agent.background',
    'agent.scheduling',
    'export.pdf.basic',
    'export.pdf.advanced',
    'export.pdf.bulk',
    'export.conversation',
    'processing.priority',
    'processing.background',
    'processing.batch',
  ],
} as const;

/**
 * Capability metadata for display and documentation
 */
export interface CapabilityMetadata {
  id: DashCapability;
  name: string;
  description: string;
  requiredTier: Tier;
  category: 'chat' | 'memory' | 'multimodal' | 'homework' | 'lessons' | 'insights' | 'agent' | 'export' | 'processing';
}

/**
 * Check if a specific capability is available for a given tier
 *
 * @param tier - User's subscription tier
 * @param capability - Capability to check
 * @returns True if capability is available for the tier
 *
 * @example
 * ```typescript
 * if (hasCapability('premium', 'multimodal.vision')) {
 *   // User can analyze images
 * }
 * ```
 */
export function hasCapability(tier: Tier, capability: DashCapability): boolean {
  return CAPABILITY_MATRIX[tier].includes(capability);
}

/**
 * Get all available capabilities for a given tier
 *
 * @param tier - User's subscription tier
 * @returns Array of available capabilities
 *
 * @example
 * ```typescript
 * const capabilities = getCapabilities('starter');
 * console.log(capabilities); // ['chat.basic', 'chat.streaming', ...]
 * ```
 */
export function getCapabilities(tier: Tier): readonly DashCapability[] {
  return CAPABILITY_MATRIX[tier];
}

/**
 * Get the minimum required tier for a capability
 *
 * @param capability - Capability to check
 * @returns Minimum tier that has this capability, or null if not found
 *
 * @example
 * ```typescript
 * const minTier = getRequiredTier('multimodal.vision');
 * console.log(minTier); // 'premium'
 * ```
 *
 * Future enhancements:
 * - [ ] Cache results for performance
 * - [ ] Return tier display name instead of identifier
 */
export function getRequiredTier(capability: DashCapability): Tier | null {
  const tiers: Tier[] = ['free', 'starter', 'premium', 'enterprise'];

  for (const tier of tiers) {
    if (hasCapability(tier, capability)) {
      return tier;
    }
  }

  return null;
}

/**
 * Get capabilities unique to a tier (not available in lower tiers)
 *
 * @param tier - Target tier
 * @returns Capabilities exclusive to this tier
 *
 * @example
 * ```typescript
 * const exclusiveFeatures = getExclusiveCapabilities('premium');
 * // Returns capabilities only available in premium, not in basic
 * ```
 */
export function getExclusiveCapabilities(tier: Tier): DashCapability[] {
  const tiers: Tier[] = ['free', 'starter', 'premium', 'enterprise'];
  const tierIndex = tiers.indexOf(tier);

  if (tierIndex === 0) {
    return [...CAPABILITY_MATRIX[tier]];
  }

  const lowerTier = tiers[tierIndex - 1];
  const currentCapabilities = new Set(CAPABILITY_MATRIX[tier]);
  const lowerCapabilities = new Set(CAPABILITY_MATRIX[lowerTier]);

  return Array.from(currentCapabilities).filter(cap => !lowerCapabilities.has(cap));
}

/**
 * Compare two tiers
 *
 * @param tier1 - First tier
 * @param tier2 - Second tier
 * @returns Negative if tier1 < tier2, 0 if equal, positive if tier1 > tier2
 *
 * @example
 * ```typescript
 * if (compareTiers('premium', 'starter') > 0) {
 *   console.log('Premium is higher than starter');
 * }
 * ```
 */
export function compareTiers(tier1: Tier, tier2: Tier): number {
  const tiers: Tier[] = ['free', 'starter', 'premium', 'enterprise'];
  return tiers.indexOf(tier1) - tiers.indexOf(tier2);
}

/**
 * Feature gating error thrown when user attempts to use unavailable capability
 *
 * @example
 * ```typescript
 * throw new FeatureGatedError(
 *   'Image analysis requires Premium subscription',
 *   'multimodal.vision',
 *   'premium'
 * );
 * ```
 */
export class FeatureGatedError extends Error {
  public readonly capability: DashCapability;
  public readonly requiredTier: Tier;
  public readonly currentTier?: Tier;

  constructor(
    message: string,
    capability: DashCapability,
    requiredTier: Tier,
    currentTier?: Tier
  ) {
    super(message);
    this.name = 'FeatureGatedError';
    this.capability = capability;
    this.requiredTier = requiredTier;
    this.currentTier = currentTier;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FeatureGatedError);
    }
  }

  /**
   * Get user-friendly error message for display
   */
  public getUserMessage(): string {
    const tierDisplay = this.requiredTier.charAt(0).toUpperCase() + this.requiredTier.slice(1);
    return `This feature requires ${tierDisplay} subscription. Upgrade to unlock!`;
  }
}

/**
 * Helper to assert a capability is available, throwing if not
 *
 * @param tier - User's current tier
 * @param capability - Required capability
 * @param customMessage - Optional custom error message
 * @throws {FeatureGatedError} If capability is not available
 *
 * @example
 * ```typescript
 * assertCapability(userTier, 'multimodal.vision');
 * // If user doesn't have vision capability, throws FeatureGatedError
 * ```
 */
export function assertCapability(
  tier: Tier,
  capability: DashCapability,
  customMessage?: string
): void {
  if (!hasCapability(tier, capability)) {
    const requiredTier = getRequiredTier(capability);
    const message = customMessage ||
      `Feature '${capability}' requires ${requiredTier} tier or higher`;

    throw new FeatureGatedError(
      message,
      capability,
      requiredTier || 'premium',
      tier
    );
  }
}

/**
 * Batch check multiple capabilities
 *
 * @param tier - User's tier
 * @param capabilities - Capabilities to check
 * @returns Object mapping capability to availability
 *
 * @example
 * ```typescript
 * const access = checkCapabilities('starter', [
 *   'chat.streaming',
 *   'multimodal.vision'
 * ]);
 * // { 'chat.streaming': true, 'multimodal.vision': true }
 * ```
 */
export function checkCapabilities(
  tier: Tier,
  capabilities: DashCapability[]
): Record<string, boolean> {
  return capabilities.reduce((acc, capability) => {
    acc[capability] = hasCapability(tier, capability);
    return acc;
  }, {} as Record<string, boolean>);
}

/**
 * Get tier display information
 *
 * @param tier - Tier to get info for
 * @returns Display information for the tier
 */
export function getTierInfo(tier: Tier): {
  id: Tier;
  name: string;
  color: string;
  order: number;
} {
  const tiers = {
    free: { name: 'Free', color: '#8E8E93', order: 0 },
    starter: { name: 'Starter', color: '#34C759', order: 1 },
    premium: { name: 'Premium', color: '#FF9500', order: 2 },
    enterprise: { name: 'Enterprise', color: '#007AFF', order: 3 },
  };

  return { id: tier, ...tiers[tier] };
}