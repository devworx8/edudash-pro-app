import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '@/contexts/ThemeContext';

type Props = {
  theme: ThemeColors;
  hasGenerationWarning: boolean;
  showDetails: boolean;
  onToggle: () => void;
  persistenceWarning?: string | null;
  usesUploadedMaterial: boolean;
  generationMode: 'ai' | 'outage_fallback';
  qualityRepaired: boolean;
  compact?: boolean;
};

export function GenerationStatusChip({
  theme,
  hasGenerationWarning,
  showDetails,
  onToggle,
  persistenceWarning,
  usesUploadedMaterial,
  generationMode,
  qualityRepaired,
  compact = false,
}: Props): React.ReactElement {
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[
          styles.header,
          compact && styles.headerCompact,
          {
            borderColor: hasGenerationWarning ? `${theme.warning}55` : `${theme.primary}55`,
            backgroundColor: hasGenerationWarning ? `${theme.warning}16` : `${theme.primary}16`,
          },
        ]}
        onPress={onToggle}
        activeOpacity={0.85}
      >
        <View style={styles.headerLeft}>
          <Ionicons
            name={hasGenerationWarning ? 'warning-outline' : 'document-attach-outline'}
            size={13}
            color={hasGenerationWarning ? theme.warning : theme.primary}
          />
          <Text
            style={[
              styles.headerText,
              compact && styles.headerTextCompact,
              { color: hasGenerationWarning ? theme.warning : theme.primary },
            ]}
            numberOfLines={compact ? 2 : 1}
          >
            {hasGenerationWarning ? 'Generation status requires review' : 'Uploaded material active'}
          </Text>
        </View>
        <Ionicons
          name={showDetails ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={hasGenerationWarning ? theme.warning : theme.primary}
        />
      </TouchableOpacity>

      {showDetails ? (
        <View style={[styles.body, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          {persistenceWarning ? (
            <Text style={[styles.bodyText, { color: theme.warning }]}>
              {persistenceWarning}
            </Text>
          ) : null}
          {usesUploadedMaterial ? (
            <Text style={[styles.bodyText, { color: theme.primary }]}>
              Uploaded material was included in exam generation.
            </Text>
          ) : null}
          {generationMode === 'outage_fallback' ? (
            <Text style={[styles.bodyText, { color: theme.warning }]}>
              AI provider outage detected. A temporary fallback paper was used.
            </Text>
          ) : null}
          {qualityRepaired ? (
            <Text style={[styles.bodyText, { color: theme.primary }]}>
              Quality checks required auto-repairs before finalizing this exam.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 4,
  },
  header: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCompact: {
    alignItems: 'flex-start',
    paddingVertical: 9,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  headerText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  headerTextCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  body: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
    gap: 6,
  },
  bodyText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
});
