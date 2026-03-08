/**
 * Utility functions for Subscription Setup
 * Extracted from app/screens/subscription-setup.tsx
 */

/**
 * Get the label for a school type
 */
export function getSchoolTypeLabel(schoolType: string): string {
  switch (schoolType) {
    case 'preschool':
      return 'Preschool';
    case 'k12_school':
      return 'K-12 School';
    case 'hybrid':
      return 'Hybrid Institution';
    default:
      return 'School';
  }
}

/**
 * Get the description for a school type
 */
export function getSchoolTypeDescription(schoolType: string): string {
  switch (schoolType) {
    case 'preschool':
      return 'Plans optimized for early childhood education';
    case 'k12_school':
      return 'Plans designed for primary and secondary schools';
    case 'hybrid':
      return 'Comprehensive plans for combined educational institutions';
    default:
      return 'Educational institution plans';
  }
}

/**
 * Check if a plan tier is a parent plan
 */
export function isParentPlan(tier: string): boolean {
  const tierLower = tier.toLowerCase();
  return (
    tierLower.startsWith('parent-') ||
    tierLower === 'parent_starter' ||
    tierLower === 'parent_plus'
  );
}

/**
 * Get the color for a plan tier
 */
export function getPlanColor(tier: string): string {
  switch (tier.toLowerCase()) {
    case 'free':
      return '#6b7280';
    case 'starter':
    case 'school_starter':
    case 'parent_starter':
    case 'teacher_starter':
      return '#3b82f6';
    case 'premium':
    case 'school_premium':
    case 'parent_plus':
    case 'teacher_pro':
      return '#8b5cf6';
    case 'pro':
    case 'school_pro':
      return '#f59e0b';
    case 'enterprise':
    case 'school_enterprise':
      return '#f59e0b';
    default:
      return '#00f5ff';
  }
}

/**
 * Convert raw price to rands
 * Handles both cents and rands formats from database
 */
export function convertPriceToRands(rawPrice: number): number {
  if (!Number.isFinite(rawPrice) || rawPrice === 0) return 0;
  // Subscription prices are stored in rands (decimal). Keep as-is.
  // If your database stores cents, fix the data instead of applying heuristics.
  return Math.max(0.01, rawPrice);
}

/**
 * Check if launch promo is active
 */
export function isLaunchPromoActive(): boolean {
  const promoEndDate = new Date('2026-03-31T23:59:59.999Z');
  return new Date() <= promoEndDate;
}
