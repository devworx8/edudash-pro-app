import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { phonicsPracticeStyles as s } from './DashTutorVoiceChat.styles';
import type { PendingPhonicsTarget } from './phonicsUtils';

interface Props {
  target: PendingPhonicsTarget;
  result: { accuracy: number; encouragement: string } | null;
  glowAnim: Animated.Value;
  onDismiss: () => void;
  /** When true uses the dark orb colour palette, otherwise uses theme colours */
  dark?: boolean;
  cardBg?: string;
  textColor?: string;
  subtleColor?: string;
}

export const PhonicsPracticeCard: React.FC<Props> = ({
  target,
  result,
  glowAnim,
  onDismiss,
  dark = false,
  cardBg,
  textColor = dark ? '#e2e8f0' : undefined,
  subtleColor = dark ? 'rgba(255,255,255,0.55)' : undefined,
}) => {
  const bg = cardBg ?? (dark ? 'rgba(99,102,241,0.15)' : undefined);

  return (
    <Animated.View
      style={[
        s.card,
        {
          backgroundColor: bg,
          borderColor: '#6366f1',
          opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
          transform: [
            { scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.99, 1.01] }) },
          ],
        },
      ]}
    >
      <View style={s.cardHeader}>
        <View style={s.iconBadge}>
          <Ionicons name="mic" size={16} color="#fff" />
        </View>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={[s.cardTitle, textColor ? { color: textColor } : {}]}>Practice Time!</Text>
        <TouchableOpacity onPress={onDismiss} style={s.dismissBtn}>
          <Ionicons name="close" size={16} color={subtleColor ?? '#888'} />
        </TouchableOpacity>
      </View>

      <View style={s.phonemeRow}>
        <Text style={s.phonemeDisplay}>
          {target.targetPhoneme ? `/${target.targetPhoneme}/` : target.referenceText}
        </Text>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={[s.phonemeHint, subtleColor ? { color: subtleColor } : {}]}>
          Say the sound out loud
        </Text>
      </View>

      {result ? (
        <View style={s.resultRow}>
          <Ionicons
            name={result.accuracy >= 60 ? 'checkmark-circle' : 'refresh-circle'}
            size={20}
            color={
              result.accuracy >= 80
                ? '#22c55e'
                : result.accuracy >= 60
                  ? '#f59e0b'
                  : '#ef4444'
            }
          />
          <Text style={[s.resultText, textColor ? { color: textColor } : {}]}>
            {result.encouragement}
            {result.accuracy > 0 && ` (${result.accuracy}%)`}
          </Text>
        </View>
      ) : (
        // eslint-disable-next-line i18next/no-literal-string
        <Text style={[s.listenHint, subtleColor ? { color: subtleColor } : {}]}>
          Dash is listening when you speak…
        </Text>
      )}
    </Animated.View>
  );
};