/**
 * SectionHeader — Consistent section header for next-gen dashboards.
 *
 * Features:
 * - Title with optional subtitle
 * - Optional right-side action link ("See All →")
 * - Subtle accent underline indicator
 * - Matches next-gen design language
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { nextGenPalette, nextGenTypography } from '@/contexts/theme/nextGenTokens';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  /** Action button label (e.g. "See All") */
  actionLabel?: string;
  onAction?: () => void;
  /** Accent underline color (defaults to green) */
  accentColor?: string;
  /** Show the subtle accent underline (default true) */
  showAccent?: boolean;
}

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  accentColor = nextGenPalette.green2,
  showAccent = true,
}: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={styles.titleRow}>
          {showAccent && (
            <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
          )}
          <Text style={styles.title}>{title}</Text>
        </View>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          style={styles.actionButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Text style={[styles.actionText, { color: accentColor }]}>
            {actionLabel}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={accentColor}
            style={styles.actionIcon}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginBottom: 8,
  },
  left: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accentBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
    marginRight: 8,
  },
  title: {
    ...nextGenTypography.title,
    color: nextGenPalette.text,
  },
  subtitle: {
    ...nextGenTypography.caption,
    color: nextGenPalette.textMuted,
    marginTop: 2,
    marginLeft: 11,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  actionText: {
    ...nextGenTypography.label,
    fontWeight: '600',
  },
  actionIcon: {
    marginLeft: 2,
  },
});

export default SectionHeader;
