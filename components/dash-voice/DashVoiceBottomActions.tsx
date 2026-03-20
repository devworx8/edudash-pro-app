/**
 * DashVoiceBottomActions — Quick-action chips and action links for Dash Voice.
 *
 * Extracted from app/screens/dash-voice.tsx as part of the WARP refactor.
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { s } from '@/app/screens/dash-voice.styles';
import type { OrbPdfArtifact } from '@/hooks/dash-voice/types';

interface QuickAction {
  id: string;
  icon: string;
  label: string;
  prompt: string;
}

interface DashVoiceBottomActionsProps {
  theme: any;
  quickActions: QuickAction[];
  showQuickActions: boolean;
  latestPdfArtifact: OrbPdfArtifact | null;
  flowEnabled: boolean;
  onQuickAction: (prompt: string) => void;
  onOpenPdf: () => void;
  onContinueFullChat: () => void;
  onToggleFlowMode: () => void;
}

export function DashVoiceBottomActions({
  theme, quickActions, showQuickActions, latestPdfArtifact,
  flowEnabled, onQuickAction, onOpenPdf, onContinueFullChat, onToggleFlowMode,
}: DashVoiceBottomActionsProps) {
  return (
    <>
      {showQuickActions && (
        <View style={s.quickActions}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={[s.quickChip, { borderColor: theme.border, backgroundColor: theme.surface }]}
              onPress={() => onQuickAction(action.prompt)}
              activeOpacity={0.7}
            >
              <Ionicons name={action.icon as any} size={18} color={theme.primary} />
              <Text style={[s.quickChipText, { color: theme.text }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {latestPdfArtifact?.url && (
        <TouchableOpacity
          style={[s.fullChatLink, { borderColor: theme.primary + '44', borderWidth: 1, backgroundColor: theme.primary + '12' }]}
          onPress={onOpenPdf}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open latest generated PDF"
        >
          <Ionicons name="document-text-outline" size={16} color={theme.primary} />
          <Text style={[s.fullChatText, { color: theme.primary }]}>Open latest PDF</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.fullChatLink} onPress={onContinueFullChat}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.primary} />
        <Text style={[s.fullChatText, { color: theme.primary }]}>Continue in full Dash chat</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.fullChatLink}
        onPress={onToggleFlowMode}
        activeOpacity={0.7}
        accessibilityRole="switch"
        accessibilityLabel="Toggle Flow Mode"
        accessibilityState={{ checked: flowEnabled }}
      >
        <Ionicons
          name={flowEnabled ? 'eye' : 'eye-off-outline'}
          size={16}
          color={flowEnabled ? theme.primary : theme.textSecondary}
        />
        <Text style={[s.fullChatText, { color: flowEnabled ? theme.primary : theme.textSecondary }]}>
          {flowEnabled ? 'Flow Mode on — auto-correct active' : 'Flow Mode off — auto-send'}
        </Text>
      </TouchableOpacity>
    </>
  );
}
