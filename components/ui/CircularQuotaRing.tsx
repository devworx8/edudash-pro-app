/**
 * CircularQuotaRing
 *
 * A circular progress ring showing how much AI / generation quota
 * the user has remaining. Used across principal, teacher, parent,
 * and admin dashboards wherever AI generation is in progress.
 *
 * Usage:
 *   <CircularQuotaRing used={3} limit={10} label="Exams" />
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

interface CircularQuotaRingProps {
  used: number;
  limit: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  showPercentage?: boolean;
  percentageMode?: 'remaining' | 'used';
  colorFull?: string;
  colorEmpty?: string;
  colorWarning?: string;
  colorCritical?: string;
}

export function CircularQuotaRing({
  used,
  limit,
  size = 80,
  strokeWidth = 7,
  label,
  showPercentage = false,
  percentageMode = 'remaining',
  colorFull = '#10B981',
  colorEmpty = 'rgba(255,255,255,0.08)',
  colorWarning = '#F59E0B',
  colorCritical = '#EF4444',
}: CircularQuotaRingProps) {
  const { theme } = useTheme();
  const remaining = Math.max(0, limit - used);
  const percentUsed = limit > 0 ? Math.min(1, used / limit) : 0;
  const percentRemaining = 1 - percentUsed;
  const progressRatio = percentageMode === 'used' ? percentUsed : percentRemaining;

  const ringColor = useMemo(() => {
    if (percentageMode === 'used') {
      if (percentUsed >= 0.9) return colorCritical;
      if (percentUsed >= 0.75) return colorWarning;
      return colorFull;
    }
    if (percentRemaining <= 0.1) return colorCritical;
    if (percentRemaining <= 0.3) return colorWarning;
    return colorFull;
  }, [percentageMode, percentUsed, percentRemaining, colorFull, colorWarning, colorCritical]);

  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  const segments = useMemo(() => {
    const totalSegments = 36;
    const filledSegments = Math.round(totalSegments * progressRatio);
    const segmentAngle = 360 / totalSegments;
    const gapAngle = 2;
    const arcAngle = segmentAngle - gapAngle;

    return Array.from({ length: totalSegments }, (_, i) => {
      const startAngle = (i * segmentAngle - 90) * (Math.PI / 180);
      const endAngle = ((i * segmentAngle + arcAngle) - 90) * (Math.PI / 180);
      const isFilled = i < filledSegments;

      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);

      return { x1, y1, x2, y2, isFilled };
    });
  }, [center, radius, progressRatio]);

  const displayValue = showPercentage
    ? `${Math.round(progressRatio * 100)}%`
    : `${remaining}`;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Ring segments rendered as positioned dot pairs */}
      <View style={[styles.ring, { width: size, height: size }]}>
        {segments.map((seg, i) => {
          const midAngle = ((i * 10 + 4) - 90) * (Math.PI / 180);
          const dotX = center + radius * Math.cos(midAngle);
          const dotY = center + radius * Math.sin(midAngle);
          return (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  width: strokeWidth,
                  height: strokeWidth,
                  borderRadius: strokeWidth / 2,
                  left: dotX - strokeWidth / 2,
                  top: dotY - strokeWidth / 2,
                  backgroundColor: seg.isFilled ? ringColor : colorEmpty,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Center content */}
      <View style={styles.centerContent}>
        <Text style={[styles.valueText, { fontSize: Math.max(size * 0.38, 13), color: ringColor }]}>
          {displayValue}
        </Text>
        {label && (
          <Text style={[styles.labelText, { fontSize: size * 0.12, color: theme.textSecondary }]} numberOfLines={1}>
            {label}
          </Text>
        )}
        {!showPercentage && limit > 0 && (
          <Text style={[styles.ofText, { fontSize: size * 0.1, color: theme.textSecondary }]}>
            of {limit}
          </Text>
        )}
      </View>
    </View>
  );
}

interface QuotaRingWithStatusProps extends CircularQuotaRingProps {
  featureName: string;
  isGenerating?: boolean;
}

export function QuotaRingWithStatus({
  featureName,
  isGenerating = false,
  ...ringProps
}: QuotaRingWithStatusProps) {
  const { theme } = useTheme();
  const remaining = Math.max(0, ringProps.limit - ringProps.used);
  const isExhausted = ringProps.limit > 0 && remaining <= 0;

  return (
    <View style={styles.statusContainer}>
      <CircularQuotaRing {...ringProps} />
      <View style={styles.statusInfo}>
        <Text style={[styles.featureName, { color: theme.text }]}>{featureName}</Text>
        <Text style={[styles.statusText, { color: theme.textSecondary }, isExhausted && { color: theme.error }]}>
          {isGenerating
            ? 'Generating...'
            : isExhausted
              ? 'Monthly limit reached'
              : `${remaining} remaining this month`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
  },
  dot: {
    position: 'absolute',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  labelText: {
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    marginTop: 1,
  },
  ofText: {
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '500',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statusInfo: {
    flex: 1,
  },
  featureName: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 12,
    marginTop: 2,
  },
});
