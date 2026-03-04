/* eslint-disable i18next/no-literal-string */
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import type { ThemeColors } from '@/contexts/ThemeContext';
import type { ExamGenerationResponse } from '@/components/exam-prep/types';
import { examGenerationStyles as styles } from '@/features/exam-generation/styles';

type ModelProfileBadgeProps = {
  compact?: boolean;
  modelProfile: ExamGenerationResponse['modelProfile'] | null;
  modelUsed: string | null;
  theme: ThemeColors;
};

export function ModelProfileBadge({
  compact = false,
  modelProfile,
  modelUsed,
  theme,
}: ModelProfileBadgeProps): React.ReactElement | null {
  const modelBadgeTheme = useMemo(() => {
    if (modelProfile?.colorKey === 'success') {
      return {
        border: `${theme.success}66`,
        bg: `${theme.success}18`,
        text: theme.success,
      };
    }
    if (modelProfile?.colorKey === 'info') {
      return {
        border: `${theme.info}66`,
        bg: `${theme.info}16`,
        text: theme.info,
      };
    }
    if (modelProfile?.colorKey === 'warning') {
      return {
        border: `${theme.warning}66`,
        bg: `${theme.warning}18`,
        text: theme.warning,
      };
    }
    return {
      border: `${theme.primary}66`,
      bg: `${theme.primary}16`,
      text: theme.primary,
    };
  }, [modelProfile?.colorKey, theme.info, theme.primary, theme.success, theme.warning]);

  if (!modelProfile) {
    return null;
  }

  return (
    <View
      style={[
        styles.modelBadge,
        compact && styles.modelBadgeCompact,
        {
          borderColor: modelBadgeTheme.border,
          backgroundColor: modelBadgeTheme.bg,
        },
      ]}
    >
      <Text style={[styles.modelBadgeLabel, { color: modelBadgeTheme.text }]}>
        {modelProfile.label}
      </Text>
      {modelProfile.usage ? (
        <Text
          style={[
            styles.modelBadgeMeta,
            compact && styles.modelBadgeMetaCompact,
            { color: modelBadgeTheme.text },
          ]}
        >
          {modelProfile.usage.used}/{modelProfile.usage.limit} high-end used •{' '}
          {modelProfile.usage.remaining} left
        </Text>
      ) : modelUsed ? (
        <Text
          style={[
            styles.modelBadgeMeta,
            compact && styles.modelBadgeMetaCompact,
            { color: modelBadgeTheme.text },
          ]}
        >
          {modelUsed}
        </Text>
      ) : null}
    </View>
  );
}
