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

interface DashOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onOpenHistory: () => void;
  onOpenSearch: () => void;
  onOpenOrb: () => void;
  onOpenSettings: () => void;
  onOpenScanner?: () => void;
  onRunScheduleTool?: () => void;
  onRunAssignmentsTool?: () => void;
  isBusy?: boolean;
}

interface OptionItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}

function OptionItem({
  icon,
  title,
  subtitle,
  onPress,
  disabled = false,
}: OptionItemProps) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.optionButton,
        {
          backgroundColor: theme.surfaceVariant || '#1f2937',
          borderColor: theme.border || '#334155',
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
        color={theme.primary || '#8b5cf6'}
      />
      <View style={styles.optionTextWrap}>
        <Text style={[styles.optionTitle, { color: theme.text || '#f8fafc' }]}>
          {title}
        </Text>
        <Text style={[styles.optionSubtitle, { color: theme.textSecondary || '#94a3b8' }]}>
          {subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function DashOptionsSheet({
  visible,
  onClose,
  onNewChat,
  onOpenHistory,
  onOpenSearch,
  onOpenOrb,
  onOpenSettings,
  onOpenScanner,
  onRunScheduleTool,
  onRunAssignmentsTool,
  isBusy = false,
}: DashOptionsSheetProps) {
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
            <Ionicons name="sparkles-outline" size={22} color={theme.primary || '#8b5cf6'} />
            <Text style={[styles.headerTitle, { color: theme.text || '#f8fafc' }]}>
              Dash Options
            </Text>
          </View>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary || '#94a3b8' }]}>
            Quick actions and tools
          </Text>

          <OptionItem
            icon="add-circle-outline"
            title="New Chat"
            subtitle="Start a fresh conversation"
            disabled={isBusy}
            onPress={() => closeThen(onNewChat)}
          />
          <OptionItem
            icon="time-outline"
            title="Conversation History"
            subtitle="Open recent chats"
            disabled={isBusy}
            onPress={() => closeThen(onOpenHistory)}
          />
          <OptionItem
            icon="search-outline"
            title="Find App Feature"
            subtitle="Search screens and tools"
            disabled={isBusy}
            onPress={() => closeThen(onOpenSearch)}
          />
          {!!onOpenScanner && (
            <OptionItem
              icon="camera-outline"
              title="Scan Homework"
              subtitle="Capture and analyze from camera"
              disabled={isBusy}
              onPress={() => closeThen(onOpenScanner)}
            />
          )}
          {!!onRunScheduleTool && (
            <OptionItem
              icon="calendar-outline"
              title="Upcoming Schedule"
              subtitle="Run agent tool for weekly events"
              disabled={isBusy}
              onPress={() => closeThen(onRunScheduleTool)}
            />
          )}
          {!!onRunAssignmentsTool && (
            <OptionItem
              icon="document-text-outline"
              title="Assignments Due"
              subtitle="Run agent tool for pending work"
              disabled={isBusy}
              onPress={() => closeThen(onRunAssignmentsTool)}
            />
          )}
          <OptionItem
            icon="planet-outline"
            title="Open Dash Orb"
            subtitle="Switch to voice-first mode"
            disabled={isBusy}
            onPress={() => closeThen(onOpenOrb)}
          />
          <OptionItem
            icon="settings-outline"
            title="Dash Settings"
            subtitle="Personalise Dash — voice, model, memory"
            onPress={() => closeThen(onOpenSettings)}
          />
          <TouchableOpacity
            style={[
              styles.closeButton,
              { backgroundColor: theme.error || '#ef4444' },
            ]}
            activeOpacity={0.85}
            onPress={onClose}
          >
            <Text style={[styles.closeText, { color: theme.onError || '#fff' }]}>Close</Text>
          </TouchableOpacity>
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
  closeButton: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '700',
  },
});

export default DashOptionsSheet;
