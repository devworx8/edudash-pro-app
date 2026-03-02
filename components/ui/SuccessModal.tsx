/**
 * SuccessModal Component
 * 
 * Modern, visually appealing success modal that replaces basic Alert.alert()
 * Features: Custom styling, theme support, celebration animation
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { ModalLayer } from '@/components/ui/ModalLayer';

interface SuccessModalProps {
  visible: boolean;
  title: string;
  message: string;
  buttonText?: string;
  onClose: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  type?: 'success' | 'error' | 'warning' | 'info';
  /** Optional secondary button */
  secondaryButtonText?: string;
  onSecondaryPress?: () => void;
}

export const SuccessModal: React.FC<SuccessModalProps> = ({
  visible,
  title,
  message,
  buttonText = 'OK',
  onClose,
  icon = 'checkmark-circle',
  type = 'success',
  secondaryButtonText,
  onSecondaryPress,
}) => {
  const { theme } = useTheme();
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const isWeb = Platform.OS === 'web';
  const closeGuardEnabledRef = React.useRef(false);
  const closeGuardTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get color based on type
  const getColor = () => {
    switch (type) {
      case 'error':
        return theme.error || '#EF4444';
      case 'warning':
        return theme.warning || '#F59E0B';
      case 'info':
        return theme.primary;
      default:
        return theme.success;
    }
  };

  const iconColor = getColor();

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
        // RN Web can keep modal scale at 0 with native-driver animations.
        scaleAnim.setValue(1);
        pulseAnim.setValue(1);
        return;
      }
      // Scale in animation
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();

      // Pulse animation for icon
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scaleAnim.setValue(0);
      pulseAnim.setValue(1);
      closeGuardEnabledRef.current = false;
    }
    return () => {
      if (closeGuardTimerRef.current) {
        clearTimeout(closeGuardTimerRef.current);
        closeGuardTimerRef.current = null;
      }
    };
  }, [visible, isWeb, scaleAnim, pulseAnim]);

  const handleBackdropPress = React.useCallback(() => {
    if (isWeb && !closeGuardEnabledRef.current) return;
    onClose();
  }, [isWeb, onClose]);

  return (
    <ModalLayer
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity 
          style={StyleSheet.absoluteFill} 
          activeOpacity={1} 
          onPress={handleBackdropPress}
        />
        
        <Animated.View
          style={[
            styles.modalContainer,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                transform: [{ scale: isWeb ? 1 : scaleAnim }],
              },
            ]}
          >
          {/* Icon with pulse animation */}
          <Animated.View 
            style={[
              styles.iconContainer, 
              { 
                backgroundColor: iconColor + '15',
                transform: [{ scale: isWeb ? 1 : pulseAnim }],
              }
            ]}
          >
            <Ionicons name={icon as any} size={64} color={iconColor} />
          </Animated.View>

          {/* Title */}
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

          {/* Message */}
          <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>

          {/* Action Buttons */}
          <View style={secondaryButtonText ? styles.buttonRow : undefined}>
            {secondaryButtonText && onSecondaryPress && (
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.secondaryButton,
                  { 
                    backgroundColor: 'transparent',
                    borderColor: theme.border,
                  },
                ]}
                onPress={onSecondaryPress}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.textSecondary }]}>
                  {secondaryButtonText}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.button,
                secondaryButtonText ? styles.primaryButtonFlex : null,
                { backgroundColor: iconColor },
              ]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>{buttonText}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </ModalLayer>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
  },
  iconContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  button: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  primaryButtonFlex: {
    flex: 1,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
