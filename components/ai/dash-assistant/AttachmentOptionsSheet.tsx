import React, { useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { ModalLayer } from '@/components/ui/ModalLayer';

interface AttachmentOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onPickImages: () => void;
  onPickDocuments?: () => void;
  showDocuments?: boolean;
  isBusy?: boolean;
}

interface OptionItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}

function OptionItem({
  icon,
  title,
  subtitle,
  onPress,
  disabled = false,
  danger = false,
}: OptionItemProps) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.optionButton,
        {
          backgroundColor: danger ? (theme.error || '#ef4444') : (theme.surfaceVariant || '#1f2937'),
          borderColor: danger ? (theme.error || '#ef4444') : (theme.border || '#334155'),
          opacity: disabled ? 0.55 : 1,
        },
      ]}
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={20}
        color={danger ? (theme.onError || '#ffffff') : (theme.primary || '#8b5cf6')}
      />
      <View style={styles.optionTextWrap}>
        <Text
          style={[
            styles.optionTitle,
            { color: danger ? (theme.onError || '#ffffff') : (theme.text || '#f8fafc') },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.optionSubtitle,
            { color: danger ? (theme.onError || '#ffffff') : (theme.textSecondary || '#94a3b8') },
          ]}
        >
          {subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function AttachmentOptionsSheet({
  visible,
  onClose,
  onTakePhoto,
  onPickImages,
  onPickDocuments,
  showDocuments = true,
  isBusy = false,
}: AttachmentOptionsSheetProps) {
  const { theme } = useTheme();

  const closeThen = useCallback((next: () => void) => {
    onClose();
    setTimeout(() => {
      next();
    }, 40);
  }, [onClose]);

  return (
    <ModalLayer
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface || '#111827',
              borderColor: theme.border || '#334155',
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Ionicons name="attach" size={22} color={theme.primary || '#8b5cf6'} />
            <Text style={[styles.headerTitle, { color: theme.text || '#f8fafc' }]}>
              Add Attachment
            </Text>
          </View>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary || '#94a3b8' }]}>
            Pick how you want to attach content
          </Text>

          <OptionItem
            icon="camera-outline"
            title="Take Photo"
            subtitle="Fast in-app camera capture"
            disabled={isBusy}
            onPress={() => closeThen(onTakePhoto)}
          />
          <OptionItem
            icon="images-outline"
            title="Choose Images"
            subtitle="Select from your gallery"
            disabled={isBusy}
            onPress={() => closeThen(onPickImages)}
          />
          {showDocuments && onPickDocuments ? (
            <OptionItem
              icon="document-text-outline"
              title="Choose Documents"
              subtitle="PDF and files"
              disabled={isBusy}
              onPress={() => closeThen(onPickDocuments)}
            />
          ) : null}
          <OptionItem
            icon="close-circle-outline"
            title="Cancel"
            subtitle="Close picker"
            danger
            onPress={onClose}
          />
        </View>
      </View>
    </ModalLayer>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(2, 6, 23, 0.92)',
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 14,
    marginBottom: 6,
  },
  optionButton: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  optionSubtitle: {
    marginTop: 1,
    fontSize: 13,
  },
});

export default AttachmentOptionsSheet;
