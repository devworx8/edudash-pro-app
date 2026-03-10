/**
 * Haptic Feedback Utilities
 * 
 * Centralized haptic feedback patterns for consistent tactile responses
 * across the EduDash Pro app. Uses expo-haptics under the hood.
 * 
 * @module lib/utils/haptics
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptic feedback patterns for different UI interactions
 */
export const HapticPatterns = {
  /**
   * Light tap feedback - for subtle UI interactions
   * Use case: Tab switches, toggle changes
   */
  light: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Intentional: non-fatal, haptics may not be available
    }
  },

  /**
   * Medium impact feedback - for standard button presses
   * Use case: Calculator buttons, action buttons
   */
  medium: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Intentional: non-fatal
    }
  },

  /**
   * Heavy impact feedback - for important actions
   * Use case: Delete actions, significant state changes
   */
  heavy: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      // Intentional: non-fatal
    }
  },

  /**
   * Selection feedback - for picker/selector changes
   * Use case: Scroll pickers, dropdown selections
   */
  selection: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.selectionAsync();
    } catch {
      // Intentional: non-fatal
    }
  },

  /**
   * Success notification - for completed actions
   * Use case: Form submission success, calculation complete
   */
  success: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Intentional: non-fatal
    }
  },

  /**
   * Warning notification - for caution states
   * Use case: Validation warnings, rate limits
   */
  warning: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      // Intentional: non-fatal
    }
  },

  /**
   * Error notification - for failure states
   * Use case: Calculation errors, form validation failures
   */
  error: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {
      // Intentional: non-fatal
    }
  },

  /**
   * Calculator button press - optimized for rapid input
   * Uses medium impact for tactile feedback without fatigue
   */
  calculatorPress: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Intentional: non-fatal
    }
  },

  /**
   * Calculator equals button - success indication for result
   */
  calculatorEquals: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Intentional: non-fatal
    }
  },

  /**
   * Calculator clear button - heavier feedback for destructive action
   */
  calculatorClear: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      // Intentional: non-fatal
    }
  },

  /**
   * Calculator delete button - medium feedback with slight delay
   */
  calculatorDelete: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Intentional: non-fatal
    }
  },

  /**
   * Calculator error state - error notification for math errors
   */
  calculatorError: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {
      // Intentional: non-fatal
    }
  },
} as const;

/**
 * Hook-friendly haptic feedback wrapper
 * Can be used directly in React components
 */
export const useHaptics = () => {
  return HapticPatterns;
};

export default HapticPatterns;