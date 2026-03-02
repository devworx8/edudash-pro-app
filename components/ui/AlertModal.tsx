/**
 * AlertModal Component
 * 
 * Modern, visually appealing modal that replaces React Native's Alert.alert()
 * Features: Custom styling, theme support, icons, smooth animations, multiple buttons
 * 
 * Supports both confirmation (2 buttons) and info (1 button) modes
 */

import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { ModalLayer } from '@/components/ui/ModalLayer';

const toOpaqueColor = (input?: string, fallback = '#111827'): string => {
  const color = String(input || '').trim();
  if (!color) return fallback;
  if (color.toLowerCase() === 'transparent') return fallback;

  // rgba(r,g,b,a) -> rgb(r,g,b)
  const rgbaMatch = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      const [r, g, b] = parts;
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  // #RRGGBBAA -> #RRGGBB
  if (/^#[0-9a-f]{8}$/i.test(color)) {
    return color.slice(0, 7);
  }

  // #RGBA -> #RRGGBB
  if (/^#[0-9a-f]{4}$/i.test(color)) {
    const [, r, g, b] = color;
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  // hsla(h,s%,l%,a) / hsl(h,s%,l%) -> rgb(r,g,b)
  const hslMatch = color.match(/^hsla?\(([^)]+)\)$/i);
  if (hslMatch) {
    const parts = hslMatch[1].split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      const h = Number(parts[0]);
      const s = Number(parts[1].replace('%', '')) / 100;
      const l = Number(parts[2].replace('%', '')) / 100;
      if (Number.isFinite(h) && Number.isFinite(s) && Number.isFinite(l)) {
        const c = (1 - Math.abs((2 * l) - 1)) * s;
        const hh = ((h % 360) + 360) % 360 / 60;
        const x = c * (1 - Math.abs((hh % 2) - 1));
        let r1 = 0; let g1 = 0; let b1 = 0;
        if (hh >= 0 && hh < 1) { r1 = c; g1 = x; b1 = 0; }
        else if (hh < 2) { r1 = x; g1 = c; b1 = 0; }
        else if (hh < 3) { r1 = 0; g1 = c; b1 = x; }
        else if (hh < 4) { r1 = 0; g1 = x; b1 = c; }
        else if (hh < 5) { r1 = x; g1 = 0; b1 = c; }
        else { r1 = c; g1 = 0; b1 = x; }
        const m = l - c / 2;
        const r = Math.round((r1 + m) * 255);
        const g = Math.round((g1 + m) * 255);
        const b = Math.round((b1 + m) * 255);
        return `rgb(${r}, ${g}, ${b})`;
      }
    }
  }

  return color;
};

const withAlpha = (input: string, alpha: number, fallback = 'rgba(17,24,39,0.16)'): string => {
  const clamped = Math.max(0, Math.min(alpha, 1));
  const color = toOpaqueColor(input, '');
  if (!color) return fallback;

  const rgbMatch = color.match(/^rgb\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => Number(part.trim()));
    if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
      const [r, g, b] = parts;
      return `rgba(${r}, ${g}, ${b}, ${clamped})`;
    }
  }

  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamped})`;
  }

  return fallback;
};

export interface AlertButton {
  text: string;
  onPress?: () => void | Promise<void>;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertModalProps {
  visible: boolean;
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  buttons?: AlertButton[];
  onClose: () => void;
  type?: 'info' | 'warning' | 'success' | 'error';
}

export const AlertModal: React.FC<AlertModalProps> = ({
  visible,
  title,
  message,
  icon,
  iconColor,
  buttons = [{ text: 'OK', style: 'default' }],
  onClose,
  type = 'info',
}) => {
  const { theme } = useTheme();
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const isWeb = Platform.OS === 'web';
  const closeGuardEnabledRef = React.useRef(false);
  const closeGuardTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (closeGuardTimerRef.current) {
      clearTimeout(closeGuardTimerRef.current);
      closeGuardTimerRef.current = null;
    }

    if (visible) {
      closeGuardEnabledRef.current = false;
      closeGuardTimerRef.current = setTimeout(() => {
        closeGuardEnabledRef.current = true;
      }, 260);
      if (isWeb) {
        // RN Web + native-driver springs can leave scale at 0, causing a blank overlay.
        scaleAnim.setValue(1);
        return;
      }
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    } else {
      scaleAnim.setValue(0);
      closeGuardEnabledRef.current = false;
    }
    return () => {
      if (closeGuardTimerRef.current) {
        clearTimeout(closeGuardTimerRef.current);
        closeGuardTimerRef.current = null;
      }
    };
  }, [visible, scaleAnim, isWeb]);

  const handleBackdropPress = React.useCallback(() => {
    if (isWeb && !closeGuardEnabledRef.current) return;
    onClose();
  }, [isWeb, onClose]);

  const getTypeColor = useCallback(() => {
    switch (type) {
      case 'success': return theme.success || '#10B981';
      case 'error': return theme.error || '#EF4444';
      case 'warning': return theme.warning || '#F59E0B';
      default: return theme.primary;
    }
  }, [type, theme]);

  const getTypeIcon = useCallback((): keyof typeof Ionicons.glyphMap => {
    if (icon) return icon;
    switch (type) {
      case 'success': return 'checkmark-circle';
      case 'error': return 'close-circle';
      case 'warning': return 'alert-circle';
      default: return 'information-circle';
    }
  }, [type, icon]);

  const finalIconColor = iconColor || getTypeColor();
  const modalSurfaceColor = toOpaqueColor((theme as any).cardBackground || theme.surface, toOpaqueColor(theme.background, '#111827'));
  const subtleSurfaceColor = toOpaqueColor((theme as any).surfaceVariant || theme.surface, modalSurfaceColor);
  const borderColor = toOpaqueColor(theme.border, '#334155');

  const handleButtonPress = async (button: AlertButton) => {
    onClose();
    try {
      await button.onPress?.();
    } catch (error) {
      console.error('[AlertModal] Button action failed:', error);
    }
  };

  const getButtonStyle = (button: AlertButton, index: number) => {
    const isCancel = button.style === 'cancel';
    const isDestructive = button.style === 'destructive';
    const isPrimary = !isCancel && !isDestructive && index === buttons.length - 1;

    if (isCancel) {
      return {
        backgroundColor: theme.error || '#DC2626',
        borderColor: theme.error || '#DC2626',
      };
    }
    if (isDestructive) {
      return {
        backgroundColor: theme.error || '#EF4444',
        borderColor: theme.error || '#EF4444',
      };
    }
    if (isPrimary) {
      return {
        backgroundColor: getTypeColor(),
        borderColor: getTypeColor(),
      };
    }
    return {
      backgroundColor: subtleSurfaceColor,
      borderColor: theme.border,
    };
  };

  const getButtonTextColor = (button: AlertButton, index: number) => {
    const isCancel = button.style === 'cancel';
    const isDestructive = button.style === 'destructive';
    const isPrimary = !isCancel && !isDestructive && index === buttons.length - 1;

    if (isCancel || isDestructive || isPrimary) return '#FFFFFF';
    return theme.text;
  };

  // Sort buttons: cancel LAST (at bottom), others first
  const sortedButtons = [...buttons].sort((a, b) => {
    if (a.style === 'cancel') return 1;
    if (b.style === 'cancel') return -1;
    return 0;
  });

  return (
    <ModalLayer
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: 'rgba(2, 6, 23, 0.94)' }]}>
        <TouchableOpacity 
          style={StyleSheet.absoluteFill} 
          activeOpacity={1} 
          onPress={handleBackdropPress}
        />
        
        <Animated.View
          style={[
            styles.modalContainer,
            {
              backgroundColor: modalSurfaceColor,
              borderColor,
              transform: [{ scale: isWeb ? 1 : scaleAnim }],
            },
          ]}
        >
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: withAlpha(finalIconColor, 0.14, subtleSurfaceColor) }]}>
            <Ionicons name={getTypeIcon()} size={56} color={finalIconColor} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

          {/* Message */}
          {message && (
            <ScrollView style={styles.messageScroll} showsVerticalScrollIndicator={false}>
              <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
            </ScrollView>
          )}

          {/* Action Buttons */}
          <View style={[
            buttons.length >= 4 ? styles.buttonContainerVertical : styles.buttonContainer,
            buttons.length === 1 && styles.singleButtonContainer
          ]}>
            {sortedButtons.map((button, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.button,
                  buttons.length === 1 && styles.singleButton,
                  buttons.length >= 4 && styles.buttonFullWidth,
                  getButtonStyle(button, index),
                ]}
                onPress={() => handleButtonPress(button)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.buttonText,
                    { color: getButtonTextColor(button, index) },
                    button.style !== 'cancel' && styles.primaryButtonText,
                  ]}
                >
                  {button.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </View>
    </ModalLayer>
  );
};

// Hook for easier Alert replacement
interface UseAlertModalReturn {
  showAlert: (config: Omit<AlertModalProps, 'visible' | 'onClose'>) => void;
  hideAlert: () => void;
  AlertModalComponent: React.FC;
  alertProps: AlertModalProps;
}

export const useAlertModal = (): UseAlertModalReturn => {
  const [alertProps, setAlertProps] = React.useState<AlertModalProps>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
    onClose: () => {},
  });

  const showAlert = useCallback((config: Omit<AlertModalProps, 'visible' | 'onClose'>) => {
    setAlertProps({
      ...config,
      visible: true,
      onClose: () => setAlertProps(prev => ({ ...prev, visible: false })),
    });
  }, []);

  const hideAlert = useCallback(() => {
    setAlertProps(prev => ({ ...prev, visible: false }));
  }, []);

  const AlertModalComponent: React.FC = useCallback(() => (
    <AlertModal {...alertProps} />
  ), [alertProps]);

  return { showAlert, hideAlert, AlertModalComponent, alertProps };
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
    overflow: 'hidden',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  messageScroll: {
    maxHeight: 150,
    marginBottom: 28,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  buttonContainerVertical: {
    flexDirection: 'column',
    gap: 10,
    width: '100%',
  },
  singleButtonContainer: {
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: 48,
  },
  buttonFullWidth: {
    flex: 0,
    width: '100%',
  },
  singleButton: {
    flex: 0,
    minWidth: 140,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButtonText: {
    fontWeight: '700',
  },
});

export default AlertModal;
