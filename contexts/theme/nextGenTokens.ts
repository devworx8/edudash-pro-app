/**
 * EduDash Pro Next-Gen Theme Tokens
 * 
 * Modern dark theme design system with purple/cyan/gold accents
 * Based on educational app UI/UX best practices
 */

export const nextGenPalette = {
  // Base backgrounds (Dark Navy Theme)
  bg0: '#0D1117',           // Main dark background
  bg1: '#161B22',           // Secondary dark background
  bg2: '#1C2128',           // Card/surface background
  bg3: '#21262D',           // Elevated surfaces

  // Glass surfaces
  glass: 'rgba(255, 255, 255, 0.05)',
  glassStrong: 'rgba(255, 255, 255, 0.08)',
  glassSubtle: 'rgba(255, 255, 255, 0.03)',
  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.15)',

  // Text
  text: '#F9FAFB',          // Primary text (white/off-white)
  textMuted: '#9CA3AF',     // Secondary text (gray)
  textSubtle: '#6B7280',    // Muted text
  textInverse: '#111827',   // Text on light backgrounds

  // Purple accent (Primary Brand)
  purple0: '#2E1F5E',       // Darkest purple
  purple1: '#5B21B6',       // Dark purple
  purple2: '#8B5CF6',       // Main purple (primary)
  purple3: '#A78BFA',       // Light purple
  purple4: '#C4B5FD',       // Lighter purple

  // Pink accent (legacy compatibility)
  pink0: '#831843',         // Darkest pink
  pink1: '#BE185D',         // Dark pink
  pink2: '#EC4899',         // Main pink (secondary)
  pink3: '#F472B6',         // Light pink

  // Cyan accent (SUPER_NINJA / Dash orb)
  cyan0: '#12384D',
  cyan1: '#0F6A8A',
  cyan2: '#06B6D4',
  cyan3: '#22D3EE',
  cyan4: '#67E8F9',

  // Gold accent (SUPER_NINJA highlight)
  gold0: '#6B4F13',
  gold1: '#B78A1E',
  gold2: '#FBBF24',
  gold3: '#FCD34D',
  gold4: '#FDE68A',

  // Green accent (Success/Actions)
  green0: '#064E3B',        // Darkest green
  green1: '#047857',        // Dark green
  green2: '#10B981',        // Main green (success)
  green3: '#34D399',        // Light green
  green4: '#6EE7B7',        // Lighter green

  // Blue accent (Info)
  blue0: '#1E3A5F',         // Dark blue
  blue1: '#1E40AF',         // Darker blue
  blue2: '#3B82F6',         // Main blue (info)
  blue3: '#60A5FA',         // Light blue
  blue4: '#93C5FD',         // Lighter blue

  // Orange accent (Warning)
  orange0: '#78350F',       // Dark orange
  orange1: '#B45309',       // Darker orange
  orange2: '#F59E0B',       // Main orange (warning)
  orange3: '#FBBF24',       // Light orange
  orange4: '#FCD34D',       // Lighter orange

  // Red accent (Error/Danger)
  red0: '#7F1D1D',          // Dark red
  red1: '#B91C1C',          // Darker red
  red2: '#EF4444',          // Main red (error)
  red3: '#F87171',          // Light red
  red4: '#FCA5A5',          // Lighter red

  // Status colors
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
  info: '#3B82F6',

  // Grade colors
  gradeA: '#10B981',        // A grade - green
  gradeB: '#3B82F6',        // B grade - blue
  gradeC: '#F59E0B',        // C grade - orange
  gradeD: '#EF4444',        // D grade - red
} as const;

export const nextGenRadii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 28,
  full: 9999,
} as const;

export const nextGenSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const nextGenGradients = {
  // Primary brand gradients
  purple: ['#5B21B6', '#8B5CF6', '#A78BFA'] as [string, string, string],
  pinkPurple: ['#EC4899', '#8B5CF6'] as [string, string],
  primaryBrand: ['#8B5CF6', '#22D3EE'] as [string, string],
  cosmicHalo: ['#8B5CF6', '#22D3EE', '#FCD34D'] as [string, string, string],
  
  // Action gradients
  green: ['#047857', '#10B981', '#34D399'] as [string, string, string],
  success: ['#10B981', '#34D399'] as [string, string],
  
  // Info gradients
  blue: ['#1E40AF', '#3B82F6', '#60A5FA'] as [string, string, string],
  info: ['#3B82F6', '#60A5FA'] as [string, string],
  
  // Warning gradients
  orange: ['#B45309', '#F59E0B', '#FBBF24'] as [string, string, string],
  warning: ['#F59E0B', '#FBBF24'] as [string, string],
  
  // Danger gradients
  red: ['#B91C1C', '#EF4444', '#F87171'] as [string, string, string],
  danger: ['#EF4444', '#F87171'] as [string, string],
  
  // Cosmic/special gradients
  cosmic: ['#2E1F5E', '#06B6D4'] as [string, string],
  cosmicPurple: ['#2E1F5E', '#8B5CF6'] as [string, string],
  auroraGold: ['#06B6D4', '#FCD34D'] as [string, string],
  
  // Navigation/UI gradients
  navGlass: ['rgba(13, 17, 23, 0.95)', 'rgba(13, 17, 23, 0.88)'] as [string, string],
  headerFade: ['rgba(13, 17, 23, 1)', 'rgba(13, 17, 23, 0)'] as [string, string],
  
  // Glow effects
  accentGlow: ['rgba(34, 211, 238, 0.32)', 'rgba(34, 211, 238, 0)'] as [string, string],
  greenGlow: ['rgba(16, 185, 129, 0.3)', 'rgba(16, 185, 129, 0)'] as [string, string],
  blueGlow: ['rgba(59, 130, 246, 0.3)', 'rgba(59, 130, 246, 0)'] as [string, string],
  goldGlow: ['rgba(252, 211, 77, 0.28)', 'rgba(252, 211, 77, 0)'] as [string, string],
} as const;

export const nextGenTypography = {
  display: { fontSize: 36, fontWeight: '800' as const, letterSpacing: -0.5 },
  headline: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  titleLarge: { fontSize: 22, fontWeight: '700' as const, letterSpacing: 0 },
  title: { fontSize: 18, fontWeight: '600' as const, letterSpacing: 0 },
  bodyLarge: { fontSize: 16, fontWeight: '400' as const, letterSpacing: 0.15 },
  body: { fontSize: 14, fontWeight: '400' as const, letterSpacing: 0.1 },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.5 },
  caption: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.4 },
} as const;

export const nextGenShadows = {
  glass: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  glow: (color: string, intensity = 0.4) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: intensity,
    shadowRadius: 20,
    elevation: 8,
  }),
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  // Pre-defined glow effects
  purpleGlow: {
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 8,
  },
  greenGlow: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 8,
  },
} as const;

export const nextGenAnimation = {
  fast: 150,
  normal: 280,
  slow: 450,
  entrance: 550,
  spring: {
    damping: 14,
    stiffness: 120,
    mass: 0.8,
  },
  bouncy: {
    damping: 10,
    stiffness: 150,
    mass: 0.6,
  },
} as const;
