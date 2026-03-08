/**
 * Color constants for EduDash Pro
 * 
 * Modern dark theme color system based on educational app design
 * Features navy blue backgrounds with purple/green accents
 */

// Brand Colors
const primaryPurple = '#8B5CF6';
const primaryPurpleLight = '#A78BFA';
const primaryPurpleDark = '#7C3AED';
const accentPink = '#EC4899';

export const Colors = {
  light: {
    // Background Colors
    background: '#FFFFFF',
    backgroundSecondary: '#F9FAFB',
    backgroundCard: '#FFFFFF',
    backgroundElevated: '#F3F4F6',
    
    // Text Colors
    text: '#111827',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    
    // Brand Colors
    tint: primaryPurple,
    primary: primaryPurple,
    primaryLight: primaryPurpleLight,
    primaryDark: primaryPurpleDark,
    accent: accentPink,
    
    // Tab/Nav Colors
    tabIconDefault: '#9CA3AF',
    tabIconSelected: primaryPurple,
    
    // Status Colors
    success: '#10B981',
    successLight: '#34D399',
    successBackground: 'rgba(16, 185, 129, 0.1)',
    warning: '#F59E0B',
    warningLight: '#FBBF24',
    warningBackground: 'rgba(245, 158, 11, 0.1)',
    error: '#EF4444',
    errorLight: '#F87171',
    errorBackground: 'rgba(239, 68, 68, 0.1)',
    info: '#3B82F6',
    infoLight: '#60A5FA',
    infoBackground: 'rgba(59, 130, 246, 0.1)',
    
    // UI Colors
    cardBackground: '#FFFFFF',
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    
    // Grade Colors
    gradeA: '#10B981',
    gradeB: '#3B82F6',
    gradeC: '#F59E0B',
    gradeD: '#EF4444',

    // Progress Colors
    progressHigh: '#10B981',
    progressMedium: '#F59E0B',
    progressLow: '#EF4444',

    // Nav Colors (light parity)
    navBackground: '#FFFFFF',
    navActive: primaryPurple,
    navInactive: '#9CA3AF',
    gradientStart: primaryPurple,
    gradientEnd: accentPink,

    // Button Colors (light parity)
    buttonPrimary: primaryPurple,
    buttonPrimaryHover: primaryPurpleDark,
    buttonSecondary: '#F3F4F6',
    buttonDisabled: '#D1D5DB',

    // Glow Effects (light parity — subtle)
    glowPurple: 'rgba(139, 92, 246, 0.2)',
    glowGreen: 'rgba(16, 185, 129, 0.2)',
    glowBlue: 'rgba(59, 130, 246, 0.2)',

    // UI extras (light parity)
    borderFocus: primaryPurple,
    divider: '#F3F4F6',
    overlay: 'rgba(0, 0, 0, 0.4)',
    shadow: 'rgba(0, 0, 0, 0.1)',

    // Legacy compatibility
    secondary: '#6B7280',
  },

  dark: {
    // Background Colors (Dark Navy Theme)
    background: '#0D1117',
    backgroundSecondary: '#161B22',
    backgroundCard: '#1C2128',
    backgroundElevated: '#21262D',
    
    // Text Colors
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    textMuted: '#6B7280',
    
    // Brand Colors
    tint: primaryPurple,
    primary: primaryPurple,
    primaryLight: primaryPurpleLight,
    primaryDark: primaryPurpleDark,
    accent: accentPink,
    
    // Gradient Colors
    gradientStart: primaryPurple,
    gradientEnd: accentPink,
    
    // Tab/Nav Colors
    tabIconDefault: '#6B7280',
    tabIconSelected: primaryPurple,
    navBackground: '#0D1117',
    navActive: primaryPurple,
    navInactive: '#6B7280',
    
    // Status Colors
    success: '#10B981',
    successLight: '#34D399',
    successBackground: 'rgba(16, 185, 129, 0.15)',
    warning: '#F59E0B',
    warningLight: '#FBBF24',
    warningBackground: 'rgba(245, 158, 11, 0.15)',
    error: '#EF4444',
    errorLight: '#F87171',
    errorBackground: 'rgba(239, 68, 68, 0.15)',
    info: '#3B82F6',
    infoLight: '#60A5FA',
    infoBackground: 'rgba(59, 130, 246, 0.15)',
    
    // UI Colors
    cardBackground: '#1C2128',
    border: '#30363D',
    borderLight: '#21262D',
    borderFocus: primaryPurple,
    divider: '#21262D',
    overlay: 'rgba(0, 0, 0, 0.6)',
    shadow: 'rgba(0, 0, 0, 0.3)',
    
    // Button Colors
    buttonPrimary: primaryPurple,
    buttonPrimaryHover: primaryPurpleDark,
    buttonSecondary: '#21262D',
    buttonDisabled: '#374151',
    
    // Grade Colors
    gradeA: '#10B981',
    gradeB: '#3B82F6',
    gradeC: '#F59E0B',
    gradeD: '#EF4444',
    
    // Progress Colors
    progressHigh: '#10B981',
    progressMedium: '#F59E0B',
    progressLow: '#EF4444',
    
    // Glow Effects
    glowPurple: 'rgba(139, 92, 246, 0.4)',
    glowGreen: 'rgba(16, 185, 129, 0.4)',
    glowBlue: 'rgba(59, 130, 246, 0.4)',

    // Legacy compatibility
    secondary: '#6B7280',
  },
};

// Export commonly used color values for direct access
export const themeColors = {
  // Primary Purple
  purple: primaryPurple,
  purpleLight: primaryPurpleLight,
  purpleDark: primaryPurpleDark,
  
  // Accent Pink
  pink: accentPink,
  
  // Status Colors
  green: '#10B981',
  greenLight: '#34D399',
  orange: '#F59E0B',
  orangeLight: '#FBBF24',
  red: '#EF4444',
  redLight: '#F87171',
  blue: '#3B82F6',
  blueLight: '#60A5FA',
  
  // Background Colors
  darkBg: '#0D1117',
  darkBgSecondary: '#161B22',
  darkBgCard: '#1C2128',
  
  // Text Colors
  white: '#F9FAFB',
  gray: '#9CA3AF',
  grayMuted: '#6B7280',
};

export default Colors;