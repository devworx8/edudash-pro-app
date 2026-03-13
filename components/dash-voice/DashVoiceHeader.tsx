/**
 * DashVoiceHeader — Top navigation bar for the Dash Voice screen.
 *
 * Extracted from app/screens/dash-voice.tsx as part of the WARP refactor.
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CircularQuotaRing } from '@/components/ui/CircularQuotaRing';
import { s } from '@/app/screens/dash-voice.styles';
import type { TierStatus } from '@/hooks/useRealtimeTier';

interface DashVoiceHeaderProps {
  paddingTop: number;
  theme: any;
  statusLabel: string;
  langLabel: string;
  showTranscript: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  tierStatus: TierStatus | null;
  onBack: () => void;
  onStop: () => void;
  onSearch: () => void;
  onToggleTranscript: () => void;
  onOpenLangMenu: () => void;
}

export function DashVoiceHeader({
  paddingTop,
  theme,
  statusLabel,
  langLabel,
  showTranscript,
  isSpeaking,
  isProcessing,
  tierStatus,
  onBack,
  onStop,
  onSearch,
  onToggleTranscript,
  onOpenLangMenu,
}: DashVoiceHeaderProps) {
  return (
    <View style={[s.header, { paddingTop }]}>
      <TouchableOpacity onPress={onBack} style={s.headerBtn}>
        <Ionicons name="arrow-back" size={24} color={theme.text} />
      </TouchableOpacity>
      <View style={s.headerCenter}>
        <View style={s.headerTitleRow}>
          <Text style={[s.headerTitle, { color: theme.text }]}>Dash</Text>
          {tierStatus && tierStatus.quotaLimit > 0 && (
            <CircularQuotaRing
              used={tierStatus.quotaUsed}
              limit={tierStatus.quotaLimit}
              size={50}
              strokeWidth={5}
              percentageMode="used"
            />
          )}
        </View>
        <Text style={[s.headerSub, { color: theme.textSecondary }]}>{statusLabel}</Text>
      </View>
      <View style={s.headerRight}>
        {(isSpeaking || isProcessing) && (
          <TouchableOpacity
            onPress={onStop}
            style={[s.headerIconBtn, { borderColor: theme.error || '#ef4444', backgroundColor: (theme as any).error || '#ef4444' }]}
            accessibilityLabel="Stop Dash speaking"
          >
            <Ionicons name="stop" size={16} color={theme.onError || theme.background || '#fff'} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onSearch}
          style={[s.headerIconBtn, { borderColor: theme.border }]}
          accessibilityLabel="Find Dash features"
        >
          <Ionicons name="search-outline" size={16} color={theme.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onToggleTranscript}
          style={[s.headerIconBtn, { borderColor: theme.border, backgroundColor: showTranscript ? theme.surface : 'transparent' }]}
          accessibilityLabel={showTranscript ? 'Hide transcript' : 'Show transcript'}
        >
          <Ionicons
            name={showTranscript ? 'document-text' : 'document-text-outline'}
            size={16}
            color={showTranscript ? theme.text : theme.primary}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={onOpenLangMenu} style={[s.langBtn, { borderColor: theme.border }]}>
          <Ionicons name="language-outline" size={16} color={theme.primary} />
          <Text style={[s.langBtnText, { color: theme.primary }]}>{langLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
