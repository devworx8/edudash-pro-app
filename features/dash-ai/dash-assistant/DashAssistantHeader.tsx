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
}

interface DashAssistantHeaderProps {
  theme: any;
  tierStatus: { quotaUsed: number; quotaLimit: number } | null;
  shellSubtitle: string;
  isTutorUiActive: boolean;
  useMinimalNextGenLayout: boolean;
  tutorModeLabel: string;
  effectiveVoiceEnabled: boolean;
  showSpeechControls: boolean;
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
  theme,
  tierStatus,
  shellSubtitle,
  isTutorUiActive,
  useMinimalNextGenLayout,
  tutorModeLabel,
  effectiveVoiceEnabled,
  showSpeechControls,
  speech,
  isTypingActive,
  isLoading,
  isUploading,
  isRecording,
  allModels,
  selectedModel,
  canSelectModel,
  onSelectModel,
  onStopAllActivity,
  onOpenOptions,
  onOpenOrb,
  onClose,
  onClosePress,
}) => (
  <View style={[headerStyles.header, { backgroundColor: 'transparent' }]}>
    <View
      style={[
        headerStyles.headerShell,
        {
          backgroundColor: theme.surface + 'CC',
          borderColor: 'transparent',
          borderWidth: 0,
          shadowColor: '#020617',
          shadowOpacity: 0.25,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        },
      ]}
    >
      <View style={headerStyles.headerTopRow}>
        <View style={headerStyles.headerLeft}>
          <View style={headerStyles.headerTitleRow}>
            <View style={[headerStyles.headerAccentDot, { backgroundColor: theme.primary }]} />
            <Text style={[headerStyles.headerTitle, { color: theme.text }]}>Dash</Text>
          </View>
          <Text style={[headerStyles.headerSubtitle, { color: theme.textSecondary }]}>
            {shellSubtitle}
          </Text>
        </View>
        {/* Quota ring + ORB button grouped together */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {tierStatus && tierStatus.quotaLimit > 0 && (
            <CircularQuotaRing
              used={tierStatus.quotaUsed}
              limit={tierStatus.quotaLimit}
              size={44}
              strokeWidth={3.5}
              showPercentage={false}
              percentageMode="used"
            />
          )}
          <TouchableOpacity
            style={[
              headerStyles.iconButton,
              headerStyles.orbIconButton,
              {
                backgroundColor: theme.primary + '22',
                borderColor: 'transparent',
                borderWidth: 0,
              },
            ]}
            accessibilityLabel="Open Dash Orb"
            onPress={onOpenOrb}
          >
            <Ionicons name="planet" size={17} color={theme.primary} />
          </TouchableOpacity>
        </View>

        <View style={headerStyles.headerRight}>
          <View
            style={[
              headerStyles.actionRail,
              {
                backgroundColor: theme.surfaceVariant + 'D9',
                borderColor: 'transparent',
                borderWidth: 0,
                shadowColor: '#020617',
                shadowOpacity: 0.22,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                elevation: 5,
              },
            ]}
          >
            {(speech.isSpeaking || isTypingActive || isRecording) && (
              <TouchableOpacity
                style={[
                  headerStyles.iconButton,
                  { backgroundColor: theme.error, borderColor: 'transparent', borderWidth: 0 },
                ]}
                accessibilityLabel="Stop Dash activity"
                onPress={onStopAllActivity}
              >
                <Ionicons name="stop" size={16} color={theme.onError || theme.background} />
              </TouchableOpacity>
            )}
            <CompactModelPicker
              models={allModels}
              selectedModelId={selectedModel}
              canSelectModel={canSelectModel}
              onSelectModel={onSelectModel}
              onLockedPress={() => {
                router.push(
                  '/screens/subscription-setup?reason=model_selection&source=dash_assistant' as any,
                );
              }}
              disabled={isLoading || isUploading}
            />
            <TouchableOpacity
              style={[
                headerStyles.iconButton,
                {
                  backgroundColor: theme.surfaceVariant,
                  borderColor: 'transparent',
                  borderWidth: 0,
                },
              ]}
              accessibilityLabel="Open Dash settings"
              onPress={onOpenOptions}
            >
              <Ionicons name="settings-outline" size={16} color={theme.text} />
            </TouchableOpacity>
            {onClose && (
              <TouchableOpacity
                style={[
                  headerStyles.closeButton,
                  {
                    backgroundColor: theme.surfaceVariant,
                    borderColor: 'transparent',
                    borderWidth: 0,
                  },
                ]}
                onPress={onClosePress}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {isTutorUiActive && !useMinimalNextGenLayout && (
        <View style={headerStyles.headerStatusRow}>
          <View
            style={[
              headerStyles.headerStatusPill,
              { borderColor: theme.primary + '66', backgroundColor: theme.primary + '18' },
            ]}
          >
            <Ionicons name="school-outline" size={12} color={theme.primary} />
            <Text style={[headerStyles.headerStatusText, { color: theme.primary }]}>
              Tutor Session Active
            </Text>
          </View>
          <View
            style={[
              headerStyles.headerStatusPill,
              { borderColor: theme.border, backgroundColor: theme.surfaceVariant },
            ]}
          >
            <Ionicons name="git-network-outline" size={12} color={theme.textSecondary} />
            <Text style={[headerStyles.headerStatusSubtle, { color: theme.textSecondary }]}>
              Mode: {tutorModeLabel}
            </Text>
          </View>
        </View>
      )}

      {effectiveVoiceEnabled && showSpeechControls && (
        <View
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 10,
            backgroundColor: theme.surfaceVariant + 'CC',
            paddingHorizontal: 10,
            paddingVertical: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <TouchableOpacity
            style={[
              headerStyles.iconButton,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                width: 28,
                height: 28,
                borderRadius: 14,
              },
            ]}
            onPress={() => speech.onSeek(speech.displaySpeechIndex - 1)}
            disabled={!speech.canSeekBack}
            accessibilityLabel="Rewind"
          >
            <Ionicons
              name="play-back"
              size={13}
              color={speech.canSeekBack ? theme.text : theme.textTertiary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: theme.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={speech.onToggle}
            accessibilityLabel={speech.isSpeaking ? 'Stop speech' : 'Play speech'}
          >
            <Ionicons
              name={speech.isSpeaking ? 'stop' : 'play'}
              size={15}
              color={theme.onPrimary || '#fff'}
            />
          </TouchableOpacity>
          <View style={{ flex: 1, justifyContent: 'center', height: 28 }}>
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.border,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: theme.primary,
                  width:
                    speech.chunkCount > 0
                      ? (`${Math.round(((speech.displaySpeechIndex + (speech.isSpeaking ? 1 : 0)) / speech.chunkCount) * 100)}%` as any)
                      : ('0%' as any),
                }}
              />
            </View>
          </View>
          <TouchableOpacity
            style={[
              headerStyles.iconButton,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                width: 28,
                height: 28,
                borderRadius: 14,
              },
            ]}
            onPress={() => speech.onSeek(speech.displaySpeechIndex + 1)}
            disabled={!speech.canSeekForward}
            accessibilityLabel="Fast forward"
          >
            <Ionicons
              name="play-forward"
              size={13}
              color={speech.canSeekForward ? theme.text : theme.textTertiary}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  </View>
);
