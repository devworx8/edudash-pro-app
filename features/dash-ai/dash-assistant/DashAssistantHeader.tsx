import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { headerStyles } from '@/components/ai/dash-assistant/styles';
import { CompactModelPicker } from '@/components/ai/model-picker/CompactModelPicker';
import { CircularQuotaRing } from '@/components/ui/CircularQuotaRing';
import type { AIModelId } from '@/lib/ai/models';

interface SpeechControlsProps {
  isSpeaking: boolean;
  chunkCount: number;
  displaySpeechIndex: number;
  canSeekBack: boolean;
  canSeekForward: boolean;
  onToggle: () => void;
  onSeek: (index: number) => void;
  onExpand: (expanded: boolean) => void;
}

interface DashAssistantHeaderProps {
  theme: any;
  tierStatus: { quotaUsed: number; quotaLimit: number } | null;
  shellSubtitle: string;
  isTutorUiActive: boolean;
  useMinimalNextGenLayout: boolean;
  tutorModeLabel: string;
  effectiveVoiceEnabled: boolean;
  showMiniSpeechControls: boolean;
  showFullSpeechControls: boolean;
  speech: SpeechControlsProps;
  isTypingActive: boolean;
  isLoading: boolean;
  isUploading: boolean;
  isRecording: boolean;
  allModels: any[];
  selectedModel: AIModelId | null;
  canSelectModel: (modelId: AIModelId) => boolean;
  onSelectModel: (modelId: AIModelId) => void;
  onStopAllActivity: () => void;
  onOpenOptions: () => void;
  onOpenOrb: () => void;
  onClose?: () => void;
  onClosePress: () => void;
}

export const DashAssistantHeader: React.FC<DashAssistantHeaderProps> = ({
  theme, tierStatus, shellSubtitle, isTutorUiActive, useMinimalNextGenLayout,
  tutorModeLabel, effectiveVoiceEnabled, showMiniSpeechControls, showFullSpeechControls,
  speech, isTypingActive, isLoading, isUploading, isRecording,
  allModels, selectedModel, canSelectModel, onSelectModel,
  onStopAllActivity, onOpenOptions, onOpenOrb, onClose, onClosePress,
}) => (
  <View style={[headerStyles.header, { backgroundColor: 'transparent' }]}>
    <View style={[
      headerStyles.headerShell,
      { backgroundColor: theme.surface + 'CC', borderColor: 'transparent', borderWidth: 0,
        shadowColor: '#020617', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
    ]}>
      <View style={headerStyles.headerTopRow}>
        <View style={headerStyles.headerLeft}>
          <View style={headerStyles.headerTitleRow}>
            <View style={[headerStyles.headerAccentDot, { backgroundColor: theme.primary }]} />
            <Text style={[headerStyles.headerTitle, { color: theme.text }]}>Dash</Text>
          </View>
          <Text style={[headerStyles.headerSubtitle, { color: theme.textSecondary }]}>{shellSubtitle}</Text>
        </View>
        {tierStatus && tierStatus.quotaLimit > 0 && (
          <CircularQuotaRing used={tierStatus.quotaUsed} limit={tierStatus.quotaLimit} size={32} strokeWidth={3} showPercentage={false} percentageMode="used" />
        )}
        <View style={headerStyles.headerRight}>
          <View style={[
            headerStyles.actionRail,
            { backgroundColor: theme.surfaceVariant + 'D9', borderColor: 'transparent', borderWidth: 0,
              shadowColor: '#020617', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
          ]}>
            {(speech.isSpeaking || isTypingActive || isRecording) && (
              <TouchableOpacity
                style={[headerStyles.iconButton, { backgroundColor: theme.error, borderColor: 'transparent', borderWidth: 0 }]}
                accessibilityLabel="Stop Dash activity"
                onPress={onStopAllActivity}
              >
                <Ionicons name="stop" size={16} color={theme.onError || theme.background} />
              </TouchableOpacity>
            )}
            <CompactModelPicker
              models={allModels} selectedModelId={selectedModel} canSelectModel={canSelectModel}
              onSelectModel={onSelectModel}
              onLockedPress={() => { router.push('/screens/subscription-setup?reason=model_selection&source=dash_assistant' as any); }}
              disabled={isLoading || isUploading}
            />
            <TouchableOpacity
              style={[headerStyles.iconButton, { backgroundColor: theme.surfaceVariant, borderColor: 'transparent', borderWidth: 0 }]}
              accessibilityLabel="Open Dash options" onPress={onOpenOptions}
            >
              <Ionicons name="ellipsis-horizontal" size={16} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[headerStyles.iconButton, headerStyles.orbIconButton, { backgroundColor: theme.primary + '22', borderColor: 'transparent', borderWidth: 0 }]}
              accessibilityLabel="Open Dash Orb" onPress={onOpenOrb}
            >
              <Ionicons name="planet" size={17} color={theme.primary} />
            </TouchableOpacity>
            {onClose && (
              <TouchableOpacity
                style={[headerStyles.closeButton, { backgroundColor: theme.surfaceVariant, borderColor: 'transparent', borderWidth: 0 }]}
                onPress={onClosePress} accessibilityLabel="Close"
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {isTutorUiActive && !useMinimalNextGenLayout && (
        <View style={headerStyles.headerStatusRow}>
          <View style={[headerStyles.headerStatusPill, { borderColor: theme.primary + '66', backgroundColor: theme.primary + '18' }]}>
            <Ionicons name="school-outline" size={12} color={theme.primary} />
            <Text style={[headerStyles.headerStatusText, { color: theme.primary }]}>Tutor Session Active</Text>
          </View>
          <View style={[headerStyles.headerStatusPill, { borderColor: theme.border, backgroundColor: theme.surfaceVariant }]}>
            <Ionicons name="git-network-outline" size={12} color={theme.textSecondary} />
            <Text style={[headerStyles.headerStatusSubtle, { color: theme.textSecondary }]}>Mode: {tutorModeLabel}</Text>
          </View>
        </View>
      )}

      {effectiveVoiceEnabled && showMiniSpeechControls && (
        <View style={{ marginTop: 8, borderWidth: 1, borderColor: theme.border, borderRadius: 11, backgroundColor: theme.surfaceVariant + 'C7', paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={[headerStyles.iconButton, { backgroundColor: theme.primary + '22', borderColor: theme.primary + '44' }]}
            onPress={speech.onToggle} accessibilityLabel={speech.isSpeaking ? 'Stop speech' : 'Play speech'}
          >
            <Ionicons name={speech.isSpeaking ? 'stop' : 'play'} size={14} color={theme.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>Speech controls</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '600' }}>
              {speech.chunkCount > 0 ? `${speech.displaySpeechIndex + 1}/${speech.chunkCount}` : '0/0'}
            </Text>
          </View>
          <TouchableOpacity
            style={[headerStyles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => speech.onExpand(true)} accessibilityLabel="Expand speech controls"
          >
            <Ionicons name="chevron-down" size={15} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {effectiveVoiceEnabled && showFullSpeechControls && (
        <View style={{ marginTop: 8, borderWidth: 1, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.surfaceVariant + 'CC', paddingHorizontal: 10, paddingVertical: 7, gap: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700', flex: 1 }} numberOfLines={1}>
              {speech.isSpeaking ? 'Dash speaking' : 'Speech controls'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '600' }}>
                {speech.chunkCount > 0 ? `${speech.displaySpeechIndex + 1}/${speech.chunkCount}` : '0/0'}
              </Text>
              {!speech.isSpeaking && (
                <TouchableOpacity
                  style={[headerStyles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => speech.onExpand(false)} accessibilityLabel="Collapse speech controls"
                >
                  <Ionicons name="chevron-up" size={14} color={theme.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              style={[headerStyles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => speech.onSeek(speech.displaySpeechIndex - 1)} disabled={!speech.canSeekBack}
              accessibilityLabel="Rewind spoken content"
            >
              <Ionicons name="play-back" size={16} color={speech.canSeekBack ? theme.text : theme.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[headerStyles.iconButton, { backgroundColor: theme.primary + '22', borderColor: theme.primary + '44' }]}
              onPress={speech.onToggle} accessibilityLabel={speech.isSpeaking ? 'Stop speech' : 'Play speech'}
            >
              <Ionicons name={speech.isSpeaking ? 'stop' : 'play'} size={16} color={theme.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[headerStyles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => speech.onSeek(speech.displaySpeechIndex + 1)} disabled={!speech.canSeekForward}
              accessibilityLabel="Fast forward spoken content"
            >
              <Ionicons name="play-forward" size={16} color={speech.canSeekForward ? theme.text : theme.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  </View>
);