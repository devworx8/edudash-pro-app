/**
 * Styled Alert Component
 * 
 * A branded, themed alternative to React Native's Alert.alert
 * Provides consistent styling and animation with the app's design system.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { ModalLayer } from '@/components/ui/ModalLayer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type AlertType = 'info' | 'success' | 'warning' | 'error' | 'confirm';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface StyledAlertProps {
  visible: boolean;
  type?: AlertType;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onDismiss?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  showCloseButton?: boolean;
}

const ALERT_CONFIG = {
  info: {
    icon: 'information-circle',
    gradientColors: ['#3B82F6', '#2563EB'],
    iconBgColor: 'rgba(59, 130, 246, 0.15)',
    iconColor: '#3B82F6',
  },
  success: {
    icon: 'checkmark-circle',
    gradientColors: ['#10B981', '#059669'],
    iconBgColor: 'rgba(16, 185, 129, 0.15)',
    iconColor: '#10B981',
  },
  warning: {
    icon: 'warning',
    gradientColors: ['#F59E0B', '#D97706'],
    iconBgColor: 'rgba(245, 158, 11, 0.15)',
    iconColor: '#F59E0B',
  },
  error: {
    icon: 'close-circle',
    gradientColors: ['#EF4444', '#DC2626'],
    iconBgColor: 'rgba(239, 68, 68, 0.15)',
    iconColor: '#EF4444',
  },
  confirm: {
    icon: 'help-circle',
    gradientColors: ['#8B5CF6', '#7C3AED'],
    iconBgColor: 'rgba(139, 92, 246, 0.15)',
    iconColor: '#8B5CF6',
  },
};

export function StyledAlert({
  visible,
  type = 'info',
  title,
  message,
  buttons = [{ text: 'OK', style: 'default' }],
  onDismiss,
  icon,
  showCloseButton = true, // Default to showing close button
}: StyledAlertProps) {
  const { theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const isWeb = Platform.OS === 'web';
  
  const config = ALERT_CONFIG[type];
  const displayIcon = icon || config.icon;
  
  useEffect(() => {
    if (visible) {
      if (isWeb) {
        scaleAnim.setValue(1);
        opacityAnim.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      if (isWeb) {
        scaleAnim.setValue(0);
        opacityAnim.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim, isWeb]);
  
  const handleButtonPress = (button: AlertButton) => {
    if (button.onPress) {
      button.onPress();
    }
    if (onDismiss) {
      onDismiss();
    }
  };
  
  const getButtonStyle = (style?: string) => {
    switch (style) {
      case 'cancel':
        return {
          backgroundColor: theme.border,
          textColor: theme.text,
        };
      case 'destructive':
        return {
          backgroundColor: theme.error,
          textColor: '#FFFFFF',
        };
      default:
        return {
          backgroundColor: config.gradientColors[0],
          textColor: '#FFFFFF',
        };
    }
  };
  
  return (
    <ModalLayer
      visible={visible}
      animationType="none"
      onRequestClose={onDismiss}
    >
      <Animated.View 
        style={[
          styles.overlay,
          { opacity: opacityAnim },
        ]}
      >
        <Animated.View 
          style={[
            styles.container,
            { 
              backgroundColor: theme.surface,
              transform: [{ scale: isWeb ? 1 : scaleAnim }],
            },
          ]}
        >
          {/* Close Button */}
          {showCloseButton && (
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={onDismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
          
          {/* Icon Header */}
          <View style={[styles.iconContainer, { backgroundColor: config.iconBgColor }]}>
            <Ionicons 
              name={displayIcon as keyof typeof Ionicons.glyphMap} 
              size={36} 
              color={config.iconColor} 
            />
          </View>
          
          {/* Content */}
          <View style={styles.content}>
            <Text style={[styles.title, { color: theme.text }]}>
              {title}
            </Text>
            {message && (
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                {message}
              </Text>
            )}
          </View>
          
          {/* Buttons */}
          <View style={[
            styles.buttonContainer,
            buttons.length > 2 && styles.buttonContainerVertical,
          ]}>
            {buttons.map((button, index) => {
              const buttonStyle = getButtonStyle(button.style);
              const isLastButton = index === buttons.length - 1;
              
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.button,
                    buttons.length <= 2 && styles.buttonHorizontal,
                    { backgroundColor: buttonStyle.backgroundColor },
                    !isLastButton && buttons.length > 2 && { marginBottom: 10 },
                    buttons.length === 2 && index === 0 && { marginRight: 10 },
                  ]}
                  onPress={() => handleButtonPress(button)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.buttonText, { color: buttonStyle.textColor }]}>
                    {button.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </ModalLayer>
  );
}

// Imperative alert API for drop-in replacement of Alert.alert
interface AlertState {
  visible: boolean;
  type: AlertType;
  title: string;
  message?: string;
  buttons: AlertButton[];
  icon?: keyof typeof Ionicons.glyphMap;
}

type AlertContextType = {
  show: (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: { type?: AlertType; icon?: keyof typeof Ionicons.glyphMap }
  ) => void;
  showSuccess: (title: string, message?: string, onOk?: () => void) => void;
  showError: (title: string, message?: string, onOk?: () => void) => void;
  showWarning: (title: string, message?: string, onOk?: () => void) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void
  ) => void;
};

const AlertContext = React.createContext<AlertContextType | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alertState, setAlertState] = React.useState<AlertState>({
    visible: false,
    type: 'info',
    title: '',
    message: undefined,
    buttons: [],
    icon: undefined,
  });
  
  const hide = () => {
    setAlertState(prev => ({ ...prev, visible: false }));
  };
  
  const show: AlertContextType['show'] = (title, message, buttons = [{ text: 'OK' }], options = {}) => {
    // Ensure there's always a cancel/close button
    const hasCancelButton = buttons.some(b => b.style === 'cancel' || b.text.toLowerCase() === 'cancel' || b.text.toLowerCase() === 'close');
    const finalButtons = hasCancelButton 
      ? buttons 
      : [...buttons, { text: 'Close', style: 'cancel' as const, onPress: () => {} }];
    
    setAlertState({
      visible: true,
      type: options.type || 'info',
      title,
      message,
      buttons: finalButtons,
      icon: options.icon,
    });
  };
  
  const showSuccess: AlertContextType['showSuccess'] = (title, message, onOk) => {
    show(title, message, [{ text: 'OK', onPress: onOk }], { type: 'success' });
  };
  
  const showError: AlertContextType['showError'] = (title, message, onOk) => {
    show(title, message, [{ text: 'OK', onPress: onOk }], { type: 'error' });
  };
  
  const showWarning: AlertContextType['showWarning'] = (title, message, onOk) => {
    show(title, message, [{ text: 'OK', onPress: onOk }], { type: 'warning' });
  };
  
  const showConfirm: AlertContextType['showConfirm'] = (title, message, onConfirm, onCancel) => {
    show(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: onCancel },
        { text: 'Confirm', style: 'default', onPress: onConfirm },
      ],
      { type: 'confirm' }
    );
  };
  
  return (
    <AlertContext.Provider value={{ show, showSuccess, showError, showWarning, showConfirm }}>
      {children}
      <StyledAlert
        visible={alertState.visible}
        type={alertState.type}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        icon={alertState.icon}
        onDismiss={hide}
      />
    </AlertContext.Provider>
  );
}

export function useAlert(): AlertContextType {
  const context = React.useContext(AlertContext);
  if (!context) {
    // Provide fallback that uses native Alert
    const { Alert } = require('react-native');
    return {
      show: (title, message, buttons) => Alert.alert(title, message || '', buttons),
      showSuccess: (title, message, onOk) => Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]),
      showError: (title, message, onOk) => Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]),
      showWarning: (title, message, onOk) => Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]),
      showConfirm: (title, message, onConfirm, onCancel) => 
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel', onPress: onCancel },
          { text: 'Confirm', onPress: onConfirm },
        ]),
    };
  }
  return context;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: Math.min(SCREEN_WIDTH - 40, 360),
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  content: {
    alignItems: 'center',
    marginBottom: 28,
    width: '100%',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.8,
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  buttonContainerVertical: {
    flexDirection: 'column',
    gap: 12,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonHorizontal: {
    flex: 1,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

export default StyledAlert;
