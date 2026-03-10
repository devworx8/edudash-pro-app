/**
 * Premium Dash Theme - Preschool/K-12 Design System
 * 
 * Inspired by the reference design images:
 * - Dark navy blue background (#1a2a4a)
 * - Purple/magenta accent colors
 * - Glowing cosmic orb design
 * - Modern card-based layouts
 * - High contrast for readability
 */

import { Platform } from 'react-native';

// Primary color palette
export const PREMIUM_COLORS = {
  // Background colors
  background: '#1a2a4a',          // Deep navy blue
  backgroundDark: '#0f1a2e',      // Darker variant
  surface: '#1e3a5f',             // Card backgrounds
  surfaceLight: '#2a4a6f',        // Elevated surfaces
  surfaceCard: '#233654',         // Card backgrounds
  
  // Primary accent - Purple/Magenta
  primary: '#8b5cf6',             // Vibrant purple
  primaryLight: '#a78bfa',        // Lighter purple
  primaryDark: '#6366f1',         // Indigo variant
  primaryGlow: 'rgba(139, 92, 246, 0.3)', // Glow effect
  
  // Secondary accent - Cyan/Teal
  secondary: '#06b6d4',           // Cyan
  secondaryLight: '#22d3ee',      // Light cyan
  secondaryGlow: 'rgba(6, 182, 212, 0.3)',
  
  // Tertiary accent - Gold/Orange
  tertiary: '#fbbf24',            // Gold
  tertiaryLight: '#fcd34d',       // Light gold
  tertiaryGlow: 'rgba(251, 191, 36, 0.3)',
  
  // Text colors
  text: '#f1f5f9',                // Primary text (off-white)
  textSecondary: '#94a3b8',       // Secondary text (gray)
  textTertiary: '#64748b',        // Tertiary text (muted)
  textOnPrimary: '#ffffff',       // Text on primary color
  
  // Status colors
  success: '#22c55e',             // Green
  successLight: '#4ade80',
  successGlow: 'rgba(34, 197, 94, 0.3)',
  
  warning: '#f59e0b',             // Orange/Amber
  warningLight: '#fbbf24',
  warningGlow: 'rgba(245, 158, 11, 0.3)',
  
  error: '#ef4444',               // Red
  errorLight: '#f87171',
  errorGlow: 'rgba(239, 68, 68, 0.3)',
  
  info: '#3b82f6',                // Blue
  infoLight: '#60a5fa',
  infoGlow: 'rgba(59, 130, 246, 0.3)',
  
  // UI elements
  border: '#334155',              // Border color
  borderLight: '#475569',         // Lighter border
  divider: 'rgba(255, 255, 255, 0.1)',
  
  // Orb colors
  orbCore: '#a78bfa',             // Purple core
  orbGlow: 'rgba(139, 92, 246, 0.5)',
  orbRing1: '#8b5cf6',            // Purple ring
  orbRing2: '#06b6d4',            // Cyan ring
  orbRing3: '#fbbf24',            // Gold ring
  
  // Whiteboard colors (chalkboard style)
  boardBackground: '#1a3a2a',     // Dark green
  boardBorder: '#5c3d1e',         // Wood frame
  chalkWhite: '#f1f5f9',
  chalkYellow: '#fbbf24',
  chalkCyan: '#67e8f9',
  chalkGreen: '#86efac',
  chalkPink: '#f9a8d4',
} as const;

// Spacing tokens
export const PREMIUM_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  cardPadding: 16,
  screenPadding: 20,
} as const;

// Border radius tokens
export const PREMIUM_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
  card: 14,
  button: 12,
  input: 10,
} as const;

// Typography tokens
export const PREMIUM_TYPOGRAPHY = {
  // Font families
  fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  fontFamilyMono: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  fontFamilyChalk: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace',
  
  // Font sizes
  fontSize: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 22,
    xxxl: 28,
    display: 36,
    hero: 48,
  },
  
  // Font weights
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
  
  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// Shadow tokens for elevation
export const PREMIUM_SHADOWS = {
  none: {},
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
} as const;

// Animation durations
export const PREMIUM_ANIMATION = {
  duration: {
    fast: 150,
    normal: 300,
    slow: 500,
    verySlow: 800,
  },
  easing: {
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
  },
} as const;

export type PremiumColors = typeof PREMIUM_COLORS;
export type PremiumSpacing = typeof PREMIUM_SPACING;
export type PremiumRadius = typeof PREMIUM_RADIUS;
export type PremiumTypography = typeof PREMIUM_TYPOGRAPHY;
export type PremiumShadows = typeof PREMIUM_SHADOWS;

// =============================================================================
// ThemeContext Override - Compatible with ThemeOverride
// =============================================================================

import type { ThemeOverride } from '@/contexts/ThemeContext';

/**
 * Premium theme override for use with ThemeOverrideProvider
 * 
 * Usage:
 * ```tsx
 * import { ThemeOverrideProvider } from '@/contexts/ThemeContext';
 * import { premiumThemeOverride } from '@/lib/theme/premiumDashTheme';
 * 
 * <ThemeOverrideProvider override={premiumThemeOverride}>
 *   <DashOrbScreen />
 * </ThemeOverrideProvider>
 * ```
 */
export const premiumThemeOverride: ThemeOverride = {
  // Primary colors
  primary: PREMIUM_COLORS.primary,
  primaryLight: PREMIUM_COLORS.primaryLight,
  primaryDark: PREMIUM_COLORS.primaryDark,
  onPrimary: PREMIUM_COLORS.textOnPrimary,

  // Secondary colors
  secondary: PREMIUM_COLORS.secondary,
  secondaryLight: PREMIUM_COLORS.secondaryLight,
  onSecondary: '#ffffff',

  // Background colors
  background: PREMIUM_COLORS.background,
  surface: PREMIUM_COLORS.surface,
  surfaceVariant: PREMIUM_COLORS.surfaceLight,
  elevated: PREMIUM_COLORS.surfaceLight,

  // Text colors
  text: PREMIUM_COLORS.text,
  textSecondary: PREMIUM_COLORS.textSecondary,
  textTertiary: PREMIUM_COLORS.textTertiary,
  textDisabled: '#475569',

  // UI element colors
  border: PREMIUM_COLORS.border,
  borderLight: PREMIUM_COLORS.borderLight,
  divider: PREMIUM_COLORS.divider,

  // Status colors
  success: PREMIUM_COLORS.success,
  successLight: PREMIUM_COLORS.successLight,
  warning: PREMIUM_COLORS.warning,
  warningLight: PREMIUM_COLORS.warningLight,
  error: PREMIUM_COLORS.error,
  errorLight: PREMIUM_COLORS.errorLight,
  info: PREMIUM_COLORS.info,
  infoLight: PREMIUM_COLORS.infoLight,

  // Accent colors
  accent: PREMIUM_COLORS.primary,
  accentLight: PREMIUM_COLORS.primaryLight,
  onAccent: '#ffffff',

  // Special UI elements
  tint: PREMIUM_COLORS.primary,
  tabIconDefault: PREMIUM_COLORS.textTertiary,
  tabIconSelected: PREMIUM_COLORS.primary,
  cardBackground: PREMIUM_COLORS.surfaceCard,
  card: PREMIUM_COLORS.surfaceCard,
  modalBackground: PREMIUM_COLORS.surface,
  modalOverlay: 'rgba(0, 0, 0, 0.7)',
  muted: PREMIUM_COLORS.textTertiary,

  // Input colors
  inputBackground: PREMIUM_COLORS.backgroundDark,
  inputBorder: PREMIUM_COLORS.border,
  inputBorderFocused: PREMIUM_COLORS.primary,
  inputText: PREMIUM_COLORS.text,
  inputPlaceholder: PREMIUM_COLORS.textTertiary,

  // Navigation colors
  headerBackground: PREMIUM_COLORS.surface,
  headerText: PREMIUM_COLORS.text,
  headerTint: PREMIUM_COLORS.primary,

  // Shadow and overlay
  shadow: 'rgba(0, 0, 0, 0.4)',
  overlay: 'rgba(0, 0, 0, 0.6)',

  // Chart colors
  chartPrimary: PREMIUM_COLORS.primary,
  chartSecondary: PREMIUM_COLORS.secondary,
  chartTertiary: PREMIUM_COLORS.success,
  chartQuaternary: PREMIUM_COLORS.tertiary,
  chartQuinary: PREMIUM_COLORS.primaryLight,

  // Card variant colors
  cardSecondary: PREMIUM_COLORS.surfaceLight,

  // Notification colors
  notificationBackground: PREMIUM_COLORS.surface,
  notificationText: PREMIUM_COLORS.text,
  notificationBorder: PREMIUM_COLORS.border,

  // Nested colors object for Material-like compatibility
  colors: {
    primary: PREMIUM_COLORS.primary,
    secondary: PREMIUM_COLORS.secondary,
    onPrimary: PREMIUM_COLORS.textOnPrimary,
    primaryContainer: PREMIUM_COLORS.surfaceLight,
    onPrimaryContainer: PREMIUM_COLORS.text,
    surface: PREMIUM_COLORS.surface,
    surfaceVariant: PREMIUM_COLORS.surfaceLight,
    onSurface: PREMIUM_COLORS.text,
    onSurfaceVariant: PREMIUM_COLORS.textSecondary,
    outline: PREMIUM_COLORS.border,
    background: PREMIUM_COLORS.background,
    error: PREMIUM_COLORS.error,
    errorContainer: PREMIUM_COLORS.errorLight,
    onErrorContainer: '#ffffff',
    onBackground: PREMIUM_COLORS.text,
    text: PREMIUM_COLORS.text,
    textSecondary: PREMIUM_COLORS.textSecondary,
    border: PREMIUM_COLORS.border,
    success: PREMIUM_COLORS.success,
    warning: PREMIUM_COLORS.warning,
    info: PREMIUM_COLORS.info,
    disabled: '#475569',
    cardBackground: PREMIUM_COLORS.surfaceCard,
  },
};

/**
 * Check if premium theme should be applied based on user/org settings
 */
export function shouldUsePremiumTheme(orgType?: string): boolean {
  // Premium theme is available for preschool and k-12 org types
  return orgType === 'preschool' || orgType === 'k-12' || orgType === 'school';
}