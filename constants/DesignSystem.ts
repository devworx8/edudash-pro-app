/**
 * EduDash Pro Design System
 * 
 * Modern dark theme design system with purple/green accents
 * Based on educational app UI/UX best practices
 */

export const DesignSystem = {
  // Core Colors
  colors: {
    // Background Colors
    background: '#0D1117',
    backgroundSecondary: '#161B22',
    surface: '#1C2128',
    surfaceElevated: '#21262D',
    
    // Brand Colors
    primary: '#8B5CF6',
    primaryLight: '#A78BFA',
    primaryDark: '#7C3AED',
    secondary: '#EC4899',
    
    // Accent Colors
    accent: '#8B5CF6',
    accentSecondary: '#EC4899',
    
    // Text Colors
    text: {
      primary: '#F9FAFB',
      secondary: '#9CA3AF',
      muted: '#6B7280',
      inverse: '#111827',
      quantum: '#8B5CF6',
    },
    
    // Status Colors
    success: '#10B981',
    successLight: '#34D399',
    warning: '#F59E0B',
    warningLight: '#FBBF24',
    error: '#EF4444',
    errorLight: '#F87171',
    info: '#3B82F6',
    infoLight: '#60A5FA',
    
    // UI Colors
    border: '#30363D',
    borderLight: '#21262D',
    divider: '#21262D',
    overlay: 'rgba(0, 0, 0, 0.6)',
    
    // Grade Colors
    gradeA: '#10B981',
    gradeB: '#3B82F6',
    gradeC: '#F59E0B',
    gradeD: '#EF4444',
  },
  
  // Gradients
  gradients: {
    // Primary brand gradient (purple to pink)
    primary: ['#8B5CF6', '#EC4899'],
    primaryReversed: ['#EC4899', '#8B5CF6'],
    
    // Dark surface gradients
    surfaceDark: ['#0D1117', '#161B22'],
    surfaceCard: ['#1C2128', '#21262D'],
    surfaceElevated: ['#21262D', '#30363D'],
    
    // Success gradient
    success: ['#10B981', '#34D399'],
    
    // Glow effects
    glowPurple: ['rgba(139, 92, 246, 0.6)', 'rgba(139, 92, 246, 0)'],
    glowGreen: ['rgba(16, 185, 129, 0.6)', 'rgba(16, 185, 129, 0)'],
    glowBlue: ['rgba(59, 130, 246, 0.6)', 'rgba(59, 130, 246, 0)'],
    
    // Legacy compatibility
    professionalSubtle: ['#1C2128', '#21262D'],
  },
  
  // Border Radius
  borderRadius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    full: 9999,
  },
  
  // Spacing Scale
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  
  // Typography
  typography: {
    fontSize: {
      xs: 10,
      sm: 12,
      md: 14,
      lg: 16,
      xl: 18,
      xxl: 20,
      xxxl: 24,
      display: 32,
      hero: 40,
    },
    fontWeight: {
      regular: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },
  
  // Shadows
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
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
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    },
    glow: {
      purple: {
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
        elevation: 8,
      },
      green: {
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
        elevation: 8,
      },
    },
  },
  
  // Breakpoints
  breakpoints: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
  },
  
  // Animation
  animation: {
    duration: {
      fast: 150,
      normal: 300,
      slow: 500,
    },
    easing: {
      easeIn: 'ease-in',
      easeOut: 'ease-out',
      easeInOut: 'ease-in-out',
    },
  },
} as const;

// Export Colors as an alias to DesignSystem.colors for backward compatibility
export const Colors = DesignSystem.colors;

/**
 * Get role-specific colors for different user types
 */
export function getRoleColors(role: string) {
  switch (role) {
    case 'student':
      return { 
        primary: '#8B5CF6', 
        secondary: '#EC4899',
        accent: '#10B981',
      } as const;
    case 'parent':
      return { 
        primary: '#3B82F6', 
        secondary: '#8B5CF6',
        accent: '#10B981',
      } as const;
    case 'teacher':
      return { 
        primary: '#EC4899', 
        secondary: '#F59E0B',
        accent: '#10B981',
      } as const;
    case 'principal':
      return { 
        primary: '#8B5CF6', 
        secondary: '#3B82F6',
        accent: '#10B981',
      } as const;
    case 'admin':
      return { 
        primary: '#EF4444', 
        secondary: '#F59E0B',
        accent: '#8B5CF6',
      } as const;
    default:
      return { 
        primary: '#8B5CF6', 
        secondary: '#EC4899',
        accent: '#10B981',
      } as const;
  }
}

/**
 * Get grade color based on percentage
 */
export function getGradeColor(percentage: number): string {
  if (percentage >= 80) return DesignSystem.colors.gradeA;
  if (percentage >= 60) return DesignSystem.colors.gradeB;
  if (percentage >= 40) return DesignSystem.colors.gradeC;
  return DesignSystem.colors.gradeD;
}

/**
 * Get progress color based on percentage
 */
export function getProgressColor(percentage: number): string {
  if (percentage >= 75) return DesignSystem.colors.success;
  if (percentage >= 50) return DesignSystem.colors.warning;
  return DesignSystem.colors.error;
}

export default DesignSystem;