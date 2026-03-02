/**
 * ConfirmationModal Component
 * 
 * Modern, visually appealing confirmation modal that replaces basic Alert.alert()
 * Features: Custom styling, theme support, icons, smooth animations
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { ModalLayer } from '@/components/ui/ModalLayer';

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmColor?: string;
  confirmDisabled?: boolean;
  type?: 'info' | 'warning' | 'success' | 'error';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  visible,
  title,
  message,
  icon = 'help-circle',
  iconColor,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  confirmColor,
  confirmDisabled = false,
  type = 'info',
}) => {
  const { theme } = useTheme();
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const isWeb = Platform.OS === 'web';

  React.useEffect(() => {
    if (visible) {
      if (isWeb) {
        // Prevent blank modal overlay state on RN Web.
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
    }
  }, [visible, isWeb, scaleAnim]);

  const getTypeColor = () => {
    switch (type) {
      case 'success': return theme.success;
      case 'error': return theme.error;
      case 'warning': return theme.warning;
      default: return theme.primary;
    }
  };

  const getTypeIcon = () => {
    switch (type) {
      case 'success': return 'checkmark-circle';
      case 'error': return 'close-circle';
      case 'warning': return 'alert-circle';
      default: return icon;
    }
  };

  const finalIconColor = iconColor || getTypeColor();
  const finalConfirmColor = confirmColor || getTypeColor();

  return (
    <ModalLayer
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <TouchableOpacity 
          style={StyleSheet.absoluteFill} 
          activeOpacity={1} 
          onPress={onCancel}
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
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: finalIconColor + '15' }]}>
            <Ionicons name={getTypeIcon() as any} size={56} color={finalIconColor} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

          {/* Message */}
          <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.cancelButton,
                { 
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={[styles.buttonText, { color: theme.textSecondary }]}>
                {cancelText}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                {
                  backgroundColor: confirmDisabled ? theme.surface : finalConfirmColor,
                  borderColor: confirmDisabled ? theme.border : finalConfirmColor,
                  opacity: confirmDisabled ? 0.5 : 1,
                },
              ]}
              onPress={onConfirm}
              disabled={confirmDisabled}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.buttonText,
                  styles.confirmButtonText,
                  { color: confirmDisabled ? theme.textSecondary : '#FFFFFF' },
                ]}
              >
                {confirmText}
              </Text>
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
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelButton: {
    // Styles defined via inline props
  },
  confirmButton: {
    // Styles defined via inline props
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButtonText: {
    fontWeight: '700',
  },
});
