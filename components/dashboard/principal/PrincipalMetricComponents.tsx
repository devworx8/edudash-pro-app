import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { percentWidth } from '@/lib/progress/clampPercent';

// --------------- Shared Types ---------------

interface BaseTheme {
  text: string;
  textSecondary: string;
  textTertiary?: string;
  surface: string;
  border: string;
}

// --------------- formatCurrency ---------------

export const formatCurrency = (amount?: number | null): string => {
  if (!amount) return 'R0';
  if (amount >= 1000000) return `R${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `R${(amount / 1000).toFixed(0)}k`;
  return `R${amount.toFixed(0)}`;
};

// --------------- OperationRow ---------------

interface OperationRowProps {
  icon: string;
  label: string;
  value: string;
  detail: string;
  color: string;
  theme: BaseTheme;
}

export const OperationRow: React.FC<OperationRowProps> = ({
  icon,
  label,
  value,
  detail,
  color,
  theme,
}) => (
  <View style={opRowStyles.container}>
    <View style={[opRowStyles.iconContainer, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon as any} size={18} color={color} />
    </View>
    <View style={opRowStyles.info}>
      <Text style={[opRowStyles.label, { color: theme.text }]}>{label}</Text>
      <Text style={[opRowStyles.detail, { color: theme.textSecondary }]}>{detail}</Text>
    </View>
    <Text style={[opRowStyles.value, { color: theme.text }]}>{value}</Text>
  </View>
);

// --------------- MetricTile ---------------

interface MetricTileProps {
  icon: string;
  label: string;
  value: string;
  sublabel?: string;
  color: string;
  theme: BaseTheme;
}

export const MetricTile: React.FC<MetricTileProps> = ({
  icon,
  label,
  value,
  sublabel,
  color,
  theme,
}) => (
  <View style={[tileStyles.tile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={[tileStyles.icon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon as any} size={18} color={color} />
    </View>
    <Text style={[tileStyles.value, { color: theme.text }]}>{value}</Text>
    <Text style={[tileStyles.label, { color: theme.textSecondary }]}>{label}</Text>
    {sublabel ? (
      <Text style={[tileStyles.sublabel, { color: theme.textTertiary || '#6B7280' }]}>
        {sublabel}
      </Text>
    ) : null}
  </View>
);

// --------------- MetricInline ---------------

interface MetricInlineProps {
  label: string;
  value: string;
  theme: BaseTheme;
}

export const MetricInline: React.FC<MetricInlineProps> = ({ label, value, theme }) => (
  <View style={inlineStyles.row}>
    <Text style={[inlineStyles.label, { color: theme.textSecondary }]}>{label}</Text>
    <Text style={[inlineStyles.value, { color: theme.text }]}>{value}</Text>
  </View>
);

// --------------- InfoRow ---------------

const TONE_COLORS = {
  info: '#3B82F6',
  warning: '#F59E0B',
  error: '#EF4444',
  success: '#10B981',
  muted: '#9CA3AF',
} as const;

interface InfoRowProps {
  icon: string;
  label: string;
  value: string;
  tone: keyof typeof TONE_COLORS;
  theme: BaseTheme;
}

export const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value, tone, theme }) => (
  <View style={[infoStyles.row, { borderBottomColor: theme.border }]}>
    <Ionicons name={icon as any} size={16} color={TONE_COLORS[tone]} />
    <Text style={[infoStyles.label, { color: theme.text }]}>{label}</Text>
    <Text style={[infoStyles.value, { color: TONE_COLORS[tone] }]}>{value}</Text>
  </View>
);

// --------------- ProgressBar ---------------

interface ProgressBarProps {
  progress: number;
  color: string;
  trackColor?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, color, trackColor }) => (
  <View style={[progressBarStyles.track, trackColor ? { backgroundColor: trackColor } : null]}>
    <View
      style={[
        progressBarStyles.fill,
        { width: percentWidth(Math.min(Math.max(progress, 0), 1) * 100), backgroundColor: color },
      ]}
    />
  </View>
);

// --------------- Styles ---------------

const opRowStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600' },
  detail: { fontSize: 12 },
  value: { fontSize: 16, fontWeight: '700' },
});

const tileStyles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: '45%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  value: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 12, marginTop: 4 },
  sublabel: { fontSize: 11, marginTop: 2 },
});

const inlineStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  label: { fontSize: 13 },
  value: { fontSize: 14, fontWeight: '600' },
});

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  label: { flex: 1, marginLeft: 8, fontSize: 13 },
  value: { fontSize: 12, fontWeight: '600' },
});

const progressBarStyles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
});
