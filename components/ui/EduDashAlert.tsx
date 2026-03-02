/**
 * EduDash Pro Styled Alert Modal
 * 
 * Custom alert that matches the dark theme design.
 * Use instead of Alert.alert() for consistent styling.
 * 
 * Usage:
 * ```tsx
 * import { useEduDashAlert } from '@/components/ui/EduDashAlert';
 * 
 * const { showAlert, AlertComponent } = useEduDashAlert();
 * 
 * // Show alert
 * showAlert({
 *   type: 'success',
 *   title: 'Success',
 *   message: 'Operation completed!',
 *   buttons: [{ text: 'OK' }],
 * });
 * 
 * // Render in JSX
 * return (
 *   <>
 *     {content}
 *     <AlertComponent />
 *   </>
 * );
 * ```
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { ModalLayer } from '@/components/ui/ModalLayer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface EduDashAlertProps {
  visible: boolean;
  type?: AlertType;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onClose: () => void;
  icon?: string;
  children?: React.ReactNode;
}

const alertConfig: Record<AlertType, { icon: string; color: string; bgColor: string }> = {
  success: { icon: 'checkmark-circle', color: '#10B981', bgColor: 'rgba(16, 185, 129, 0.15)' },
  error: { icon: 'alert-circle', color: '#EF4444', bgColor: 'rgba(239, 68, 68, 0.15)' },
  warning: { icon: 'warning', color: '#F59E0B', bgColor: 'rgba(245, 158, 11, 0.15)' },
  info: { icon: 'information-circle', color: '#6366F1', bgColor: 'rgba(99, 102, 241, 0.15)' },
  confirm: { icon: 'help-circle', color: '#8B5CF6', bgColor: 'rgba(139, 92, 246, 0.15)' },
};

export const EduDashAlert: React.FC<EduDashAlertProps> = ({
  visible,
  type = 'info',
  title,
  message,
  buttons = [{ text: 'OK', style: 'default' }],
  onClose,
  icon,
  children,
}) => {
  const { theme, isDark } = useTheme();
  const config = alertConfig[type];
  const displayIcon = icon || config.icon;

  const handleButtonPress = (button: AlertButton) => {
    button.onPress?.();
    onClose();
  };

  const getButtonStyle = (style?: AlertButton['style'], isOnly?: boolean) => {
    const baseStyle: any = {
      flex: isOnly ? undefined : 1,
      minWidth: isOnly ? 120 : undefined,
    };
    
    switch (style) {
      case 'destructive':
        return { ...baseStyle, backgroundColor: '#EF4444' };
      case 'cancel':
        return { 
          ...baseStyle, 
          backgroundColor: 'transparent', 
          borderWidth: 1.5, 
          borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' 
        };
      default:
        return { ...baseStyle, backgroundColor: '#6366F1' };
    }
  };

  const getButtonTextStyle = (style?: AlertButton['style']) => {
    switch (style) {
      case 'cancel':
        return { color: theme.textSecondary };
      default:
        return { color: '#FFFFFF' };
    }
  };

  return (
    <ModalLayer
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[
          styles.container, 
          { 
            backgroundColor: isDark ? '#1E1E2E' : '#FFFFFF',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          }
        ]}>
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: config.bgColor }]}>
            <Ionicons name={displayIcon as any} size={36} color={config.color} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

          {/* Message */}
          {message && (
            <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
          )}

          {/* Custom Content */}
          {children}

          {/* Buttons */}
          <View style={[
            styles.buttonContainer,
            buttons.length === 1 && styles.buttonContainerSingle
          ]}>
            {buttons.map((button, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.button,
                  getButtonStyle(button.style, buttons.length === 1),
                  buttons.length > 1 && index < buttons.length - 1 && { marginRight: 12 },
                ]}
                onPress={() => handleButtonPress(button)}
                activeOpacity={0.8}
              >
                <Text style={[styles.buttonText, getButtonTextStyle(button.style)]}>
                  {button.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </ModalLayer>
  );
};

// Helper hook for showing alerts imperatively
interface AlertState {
  visible: boolean;
  type: AlertType;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  children?: React.ReactNode;
}

export const useEduDashAlert = () => {
  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    type: 'info',
    title: '',
  });

  const showAlert = useCallback((config: Omit<AlertState, 'visible'>) => {
    setAlertState({ ...config, visible: true });
  }, []);

  const hideAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  }, []);

  // Convenience methods
  const showSuccess = useCallback((title: string, message?: string, onOk?: () => void) => {
    showAlert({
      type: 'success',
      title,
      message,
      buttons: [{ text: 'OK', onPress: onOk }],
    });
  }, [showAlert]);

  const showError = useCallback((title: string, message?: string, onOk?: () => void) => {
    showAlert({
      type: 'error',
      title,
      message,
      buttons: [{ text: 'OK', onPress: onOk }],
    });
  }, [showAlert]);

  const showWarning = useCallback((title: string, message?: string, onOk?: () => void) => {
    showAlert({
      type: 'warning',
      title,
      message,
      buttons: [{ text: 'OK', onPress: onOk }],
    });
  }, [showAlert]);

  const showConfirm = useCallback((
    title: string, 
    message: string, 
    onConfirm: () => void, 
    onCancel?: () => void
  ) => {
    showAlert({
      type: 'confirm',
      title,
      message,
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: onCancel },
        { text: 'Confirm', onPress: onConfirm },
      ],
    });
  }, [showAlert]);

  const AlertComponent = useCallback(() => (
    <EduDashAlert
      visible={alertState.visible}
      type={alertState.type}
      title={alertState.title}
      message={alertState.message}
      buttons={alertState.buttons}
      onClose={hideAlert}
    >
      {alertState.children}
    </EduDashAlert>
  ), [alertState, hideAlert]);

  return { 
    showAlert, 
    hideAlert, 
    showSuccess,
    showError,
    showWarning,
    showConfirm,
    AlertComponent,
  };
};

// Standalone function for simple alerts (mimics Alert.alert API)
export const eduDashAlert = {
  success: (title: string, message?: string) => {
    // This is a placeholder - for true imperative usage, 
    // you'd need a global alert provider
    console.log('[EduDashAlert] Success:', title, message);
  },
  error: (title: string, message?: string) => {
    console.log('[EduDashAlert] Error:', title, message);
  },
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 24,
  },
  container: {
    width: Math.min(SCREEN_WIDTH - 48, 360),
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    marginTop: 4,
  },
  buttonContainerSingle: {
    justifyContent: 'center',
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});

export default EduDashAlert;
