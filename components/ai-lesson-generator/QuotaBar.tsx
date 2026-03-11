/**
 * QuotaBar - Quota usage visualization bar
 * @module components/ai-lesson-generator/QuotaBar
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { QuotaBarProps } from './types';
import { percentWidth } from '@/lib/progress/clampPercent';

/**
 * Get bar color based on usage percentage
 */
function getBarColor(
  percentage: number,
  warningThreshold: number,
  criticalThreshold: number
): string {
  if (percentage >= criticalThreshold) return '#EF4444'; // Red
  if (percentage >= warningThreshold) return '#F59E0B'; // Amber
  return '#10B981'; // Green
}

/**
 * Get status icon based on usage
 */
function getStatusIcon(
  percentage: number,
  warningThreshold: number,
  criticalThreshold: number
): keyof typeof Ionicons.glyphMap {
  if (percentage >= criticalThreshold) return 'warning';
  if (percentage >= warningThreshold) return 'alert-circle';
  return 'checkmark-circle';
}

/**
 * Get status message based on usage
 */
function getStatusMessage(
  percentage: number,
  remaining: number,
  warningThreshold: number,
  criticalThreshold: number
): string {
  if (percentage >= 100) return 'Quota exhausted - please upgrade';
  if (percentage >= criticalThreshold) return `Low quota - ${remaining} remaining`;
  if (percentage >= warningThreshold) return `${remaining} generations left today`;
  return `${remaining} generations available`;
}

/**
 * Quota visualization bar component
 */
export function QuotaBar({
  used,
  limit,
  label = 'Daily AI Quota',
  showPercentage = true,
  warningThreshold = 70,
  criticalThreshold = 90,
}: QuotaBarProps) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const remaining = Math.max(limit - used, 0);
  const barColor = getBarColor(percentage, warningThreshold, criticalThreshold);
  const statusIcon = getStatusIcon(percentage, warningThreshold, criticalThreshold);
  const statusMessage = getStatusMessage(
    percentage,
    remaining,
    warningThreshold,
    criticalThreshold
  );

  const isLow = percentage >= warningThreshold;
  const isExhausted = percentage >= 100;

  return (
    <View style={[styles.container, isExhausted && styles.containerExhausted]}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.labelContainer}>
          <Ionicons
            name={statusIcon}
            size={16}
            color={barColor}
          />
          <Text style={[styles.label, isLow && { color: barColor }]}>
            {label}
          </Text>
        </View>
        {showPercentage && (
          <Text style={[styles.percentage, { color: barColor }]}>
            {Math.round(percentage)}%
          </Text>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.barBackground}>
        <View
          style={[
            styles.barFill,
            { width: percentWidth(percentage), backgroundColor: barColor },
          ]}
        />
      </View>

      {/* Usage details */}
      <View style={styles.details}>
        <Text style={styles.usageText}>
          {used} / {limit} used
        </Text>
        <Text style={[styles.statusText, { color: barColor }]}>
          {statusMessage}
        </Text>
      </View>

      {/* Upgrade prompt when low/exhausted */}
      {isLow && (
        <View style={[styles.upgradeHint, { backgroundColor: barColor + '10' }]}>
          <Ionicons name="arrow-up-circle" size={14} color={barColor} />
          <Text style={[styles.upgradeHintText, { color: barColor }]}>
            {isExhausted
              ? 'Upgrade your plan for more generations'
              : 'Consider upgrading for higher limits'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: 16,
  },
  containerExhausted: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  percentage: {
    fontSize: 14,
    fontWeight: '700',
  },
  barBackground: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  usageText: {
    fontSize: 12,
    color: '#6B7280',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  upgradeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  upgradeHintText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
});

export default QuotaBar;
