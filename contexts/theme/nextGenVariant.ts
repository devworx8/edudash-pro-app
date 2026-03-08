/**
 * EduDash Pro Next-Gen Theme Variant
 * 
 * Modern dark theme variant with purple/green accents
 * Based on educational app UI/UX best practices
 */

import type { ThemeColors } from '@/contexts/ThemeContext';
import { nextGenPalette as p } from './nextGenTokens';

export interface NextGenThemeOverrides {
  root: Partial<ThemeColors>;
  aliases: Partial<ThemeColors['colors']>;
}

export const getNextGenThemeOverrides = (isDark: boolean): NextGenThemeOverrides => {
  // Dark theme is the primary theme for EduDash Pro
  const background = isDark ? p.bg0 : '#F9FAFB';
  const chrome = isDark ? p.bg1 : '#F3F4F6';
  const elevated = isDark ? p.bg2 : '#FFFFFF';

  return {
    root: {
      // Backgrounds
      background,
      surface: p.glass,
      surfaceVariant: p.glassStrong,
      elevated,
      cardBackground: p.glass,
      card: p.glass,
      
      // Borders & Dividers
      border: p.border,
      borderLight: 'rgba(255, 255, 255, 0.06)',
      divider: 'rgba(255, 255, 255, 0.06)',
      
      // Text
      text: p.text,
      textSecondary: p.textMuted,
      textTertiary: p.textSubtle,
      muted: p.textSubtle,
      
      // Brand Colors
      primary: p.purple2,           // Main purple
      primaryLight: p.purple3,
      primaryDark: p.purple1,
      secondary: p.green2,          // Main green
      secondaryLight: p.green3,
      secondaryDark: p.green1,
      accent: p.pink2,              // Pink accent
      
      // Status Colors
      success: p.success,
      successLight: p.green3,
      successBackground: 'rgba(16, 185, 129, 0.15)',
      warning: p.warning,
      warningLight: p.orange3,
      warningBackground: 'rgba(245, 158, 11, 0.15)',
      error: p.danger,
      errorLight: p.red3,
      errorBackground: 'rgba(239, 68, 68, 0.15)',
      info: p.info,
      infoLight: p.blue3,
      infoBackground: 'rgba(59, 130, 246, 0.15)',
      
      // Header
      headerBackground: chrome,
      headerText: p.text,
      headerTint: p.purple3,
      
      // Modal & Overlay
      modalBackground: elevated,
      shadow: 'rgba(0, 0, 0, 0.4)',
      overlay: 'rgba(0, 0, 0, 0.6)',
      
      // Inputs
      inputBackground: 'rgba(255, 255, 255, 0.06)',
      inputBorder: 'rgba(255, 255, 255, 0.12)',
      inputBorderFocused: p.purple3,
      inputText: p.text,
      inputPlaceholder: p.textSubtle,
      
      // Navigation
      navBackground: p.bg0,
      navActive: p.purple2,
      navInactive: p.textSubtle,
      
      // Buttons
      buttonPrimary: p.purple2,
      buttonPrimaryHover: p.purple1,
      buttonSecondary: p.bg2,
      buttonDisabled: '#374151',
      
      // Grade Colors
      gradeA: p.gradeA,
      gradeB: p.gradeB,
      gradeC: p.gradeC,
      gradeD: p.gradeD,
    },
    aliases: {
      primary: p.purple2,
      onPrimary: '#FFFFFF',
      primaryContainer: p.purple1,
      onPrimaryContainer: '#EDE9FE',
      secondary: p.green2,
      onSecondary: '#FFFFFF',
      secondaryContainer: p.green1,
      onSecondaryContainer: '#D1FAE5',
      surface: p.glass,
      surfaceVariant: p.glassStrong,
      onSurface: p.text,
      onSurfaceVariant: p.textMuted,
      outline: p.border,
      background,
      error: p.danger,
      errorContainer: 'rgba(239, 68, 68, 0.18)',
      onErrorContainer: '#FFE4E4',
      onBackground: p.text,
      text: p.text,
      textSecondary: p.textMuted,
      border: p.border,
      success: p.success,
      warning: p.warning,
      info: p.info,
      disabled: p.textSubtle,
      cardBackground: p.glass,
      
      // Additional aliases for common use
      accent: p.pink2,
      gradeA: p.gradeA,
      gradeB: p.gradeB,
      gradeC: p.gradeC,
      gradeD: p.gradeD,
    },
  };
};

export const createNextGenTheme = (base: ThemeColors, isDark: boolean): ThemeColors => {
  const overrides = getNextGenThemeOverrides(isDark);
  return {
    ...base,
    ...overrides.root,
    colors: {
      ...base.colors,
      ...overrides.aliases,
    },
  };
};