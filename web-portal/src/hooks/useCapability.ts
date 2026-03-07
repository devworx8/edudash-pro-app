/**
 * useCapability Hook
 *
 * Provides easy access to capability checking in React components
 * Integrates with SubscriptionContext for current tier
 */

import { useContext, useMemo } from 'react';
import { SubscriptionContext } from '../contexts/SubscriptionContext';
import {
  hasCapability,
  getCapabilities,
  getTierInfo,
  checkCapabilities,
  type DashCapability,
  type Tier,
} from '../lib/ai/capabilities';

export function useCapability() {
  const { tier, ready } = useContext(SubscriptionContext);

  const capabilities = useMemo(() => {
    if (!ready) return [];
    return getCapabilities(tier as Tier);
  }, [tier, ready]);

  const tierInfo = useMemo(() => {
    if (!ready) return null;
    return getTierInfo(tier as Tier);
  }, [tier, ready]);

  /**
   * Check if a single capability is available
   */
  const can = (capability: DashCapability): boolean => {
    if (!ready) return false;
    return hasCapability(tier as Tier, capability);
  };

  /**
   * Check multiple capabilities at once
   */
  const canMultiple = (caps: DashCapability[]) => {
    if (!ready) return {};
    return checkCapabilities(tier as Tier, caps);
  };

  /**
   * Check if user has any of the specified capabilities
   */
  const canAny = (caps: DashCapability[]): boolean => {
    if (!ready) return false;
    return caps.some(cap => hasCapability(tier as Tier, cap));
  };

  /**
   * Check if user has all of the specified capabilities
   */
  const canAll = (caps: DashCapability[]): boolean => {
    if (!ready) return false;
    return caps.every(cap => hasCapability(tier as Tier, cap));
  };

  return {
    // State
    tier: tier as Tier,
    tierInfo,
    capabilities,
    ready,

    // Methods
    can,
    canMultiple,
    canAny,
    canAll,
  };
}

/**
 * Hook specifically for checking a single capability
 * Useful for conditional rendering
 *
 * @example
 * const canAnalyzeImages = useHasCapability('multimodal.vision');
 * if (!canAnalyzeImages) return <UpgradePrompt />;
 */
export function useHasCapability(capability: DashCapability): boolean {
  const { can } = useCapability();
  return can(capability);
}