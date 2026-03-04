export const nextGenPalette = {
  // Base backgrounds
  bg0: '#0F121E',
  bg1: '#181C2B',
  bg2: '#22283A',

  // Glass surfaces
  glass: 'rgba(255,255,255,0.05)',
  glassStrong: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.10)',

  // Text
  text: '#EAF0FF',
  textMuted: 'rgba(234,240,255,0.72)',
  textSubtle: 'rgba(234,240,255,0.55)',

  // Green accent
  green0: '#22433F',
  green1: '#284F46',
  green2: '#3C8E62',
  green3: '#67A884',

  // Purple accent
  purple0: '#23214D',
  purple1: '#2F2863',
  purple2: '#5A409D',
  purple3: '#9584C0',

  // Status
  danger: '#FF5C5C',
  warning: '#FFCC66',
  success: '#3C8E62',
} as const;

export const nextGenRadii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
} as const;

export const nextGenSpacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
} as const;

export const nextGenGradients = {
  green: ['#22433F', '#284F46', '#3C8E62'] as [string, string, string],
  purple: ['#23214D', '#2F2863', '#5A409D'] as [string, string, string],
  cosmic: ['#23214D', '#3C8E62'] as [string, string],
  navGlass: ['rgba(15,18,30,0.92)', 'rgba(15,18,30,0.85)'] as [string, string],
  headerFade: ['rgba(15,18,30,1)', 'rgba(15,18,30,0)'] as [string, string],
  accentGlow: ['rgba(90,64,157,0.25)', 'rgba(90,64,157,0)'] as [string, string],
} as const;

export const nextGenTypography = {
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
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
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  glow: (color: string, intensity = 0.35) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: intensity,
    shadowRadius: 18,
    elevation: 8,
  }),
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
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
