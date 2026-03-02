/**
 * Themed Modal Component
 * 
 * A modal component that properly uses the theme system
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { ThemedButton } from './ThemedButton';
import { ModalLayer } from './ModalLayer';

interface ThemedModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  actions?: Array<{
    text: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  }>;
  showCloseButton?: boolean;
  scrollable?: boolean;
  size?: 'small' | 'medium' | 'large' | 'full';
}

export function ThemedModal({
  visible,
  onClose,
  title,
  children,
  actions,
  showCloseButton = true,
  scrollable = false,
  size = 'medium',
}: ThemedModalProps) {
  const { theme } = useTheme();

  const getModalSize = () => {
    switch (size) {
      case 'small':
        return { maxWidth: 320, maxHeight: '50%' };
      case 'medium':
        return { maxWidth: 480, maxHeight: '70%' };
      case 'large':
        return { maxWidth: 640, maxHeight: '85%' };
      case 'full':
        return { maxWidth: '95%', maxHeight: '95%' };
      default:
        return { maxWidth: 480, maxHeight: '70%' };
    }
  };

  const modalSize = getModalSize();

  const content = (
    <>
      {/* Header */}
      {(title || showCloseButton) && (
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.modalBackground,
              borderBottomColor: theme.divider,
            },
          ]}
        >
          {title && (
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          )}
          {showCloseButton && (
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>{children}</View>

      {/* Actions */}
      {actions && actions.length > 0 && (
        <View
          style={[
            styles.actions,
            {
              backgroundColor: theme.modalBackground,
              borderTopColor: theme.divider,
            },
          ]}
        >
          {actions.map((action, index) => (
            <ThemedButton
              key={index}
              title={action.text}
              onPress={action.onPress}
              variant={action.variant || 'primary'}
              style={styles.actionButton}
            />
          ))}
        </View>
      )}
    </>
  );

  return (
    <ModalLayer
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.overlay, { backgroundColor: theme.modalOverlay }]}
          onPress={onClose}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.modalContainer,
              {
                backgroundColor: theme.modalBackground,
              },
              modalSize as any,
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {scrollable ? (
              <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {content}
              </ScrollView>
            ) : (
              content
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </ModalLayer>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  closeButton: {
    marginLeft: 16,
  },
  content: {
    padding: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  actionButton: {
    minWidth: 80,
  },
});
