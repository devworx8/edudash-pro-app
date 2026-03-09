/**
 * EduDash Pro Next-Gen Theme Variant
 * 
 * Modern dark theme variant with purple/cyan/gold accents
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
      secondary: p.cyan2,
      secondaryLight: p.cyan3,
      secondaryDark: p.cyan1,
      accent: p.gold2,
      
      // Status Colors
      success: p.success,
      successLight: p.green3,
      warning: p.warning,
      warningLight: p.orange3,
      error: p.danger,
      errorLight: p.red3,
      info: p.info,
      infoLight: p.blue3,
      
      // Header
      headerBackground: chrome,
      headerText: p.text,
      headerTint: p.cyan3,
      
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
      
      // Buttons
      tint: p.purple2,
      tabIconDefault: p.textSubtle,
      tabIconSelected: p.cyan3,
      modalOverlay: 'rgba(0, 0, 0, 0.6)',
      textDisabled: '#6B7280',
      chartPrimary: p.purple2,
      chartSecondary: p.cyan2,
      chartTertiary: p.gold2,
      chartQuaternary: p.info,
      chartQuinary: p.success,
      cardSecondary: p.glassStrong,
      notificationBackground: p.bg2,
      notificationText: p.text,
      notificationBorder: p.border,
      successDark: p.green1,
      onSuccess: '#FFFFFF',
      warningDark: p.orange1,
      onWarning: '#FFFFFF',
      errorDark: p.red1,
      onError: '#FFFFFF',
      infoDark: p.blue1,
      onInfo: '#FFFFFF',
      accentLight: p.gold3,
      accentDark: p.gold1,
      onAccent: '#111827',
    },
    aliases: {
      primary: p.purple2,
      onPrimary: '#FFFFFF',
      primaryContainer: p.purple1,
      onPrimaryContainer: '#EDE9FE',
      secondary: p.cyan2,
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
