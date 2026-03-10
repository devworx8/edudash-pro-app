import React from 'react';
import { View, Text } from 'react-native';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { layoutStyles } from '@/components/ai/dash-assistant/styles';
import { COMPOSER_FLOAT_GAP } from './utils';

interface DashAssistantThinkingDockProps {
  theme: any;
  show: boolean;
  label: string;
  toolActivityLabel: string | null;
  keyboardHeight: number;
  safeComposerHeight: number;
  composerExtraBottom: number;
}

export const DashAssistantThinkingDock: React.FC<DashAssistantThinkingDockProps> = ({
  theme, show, label, toolActivityLabel, keyboardHeight, safeComposerHeight, composerExtraBottom,
}) => {
  if (!show) return null;
  return (
    <View
      style={[
        layoutStyles.bottomThinkingDock,
        {
          bottom: keyboardHeight + safeComposerHeight + COMPOSER_FLOAT_GAP + composerExtraBottom + 10,
          backgroundColor: theme.surface + 'EE',
        },
      ]}
      pointerEvents="none"
    >
      <EduDashSpinner size="small" color={theme.primary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[layoutStyles.bottomThinkingText, { color: theme.text }]}>{label}</Text>
        {toolActivityLabel ? (
          <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>
            {toolActivityLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
};