import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { CategoryIcon } from './CategoryIcon';
import { WINDOW_TYPE_CONFIG, CATEGORY_CONFIG, type InputWindow, type SubmissionCategory } from './types';

interface InputWindowCardProps {
  window: InputWindow;
  submissionCount?: number;
  onPress: (window: InputWindow) => void;
  onManage?: (window: InputWindow) => void;
}

export function InputWindowCard({ window: w, submissionCount, onPress, onManage }: InputWindowCardProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const typeConfig = WINDOW_TYPE_CONFIG[w.window_type] || WINDOW_TYPE_CONFIG.open_call;

  const { isOpen, timeLabel, urgencyColor } = useMemo(() => {
    const now = Date.now();
    const opens = new Date(w.opens_at).getTime();
    const closes = new Date(w.closes_at).getTime();
    const open = w.is_active && now >= opens && now <= closes;
    const daysLeft = Math.ceil((closes - now) / (1000 * 60 * 60 * 24));

    let label = '';
    let color = theme.textSecondary;
    if (!w.is_active) {
      label = 'Closed';
      color = theme.textSecondary;
    } else if (now < opens) {
      const daysUntil = Math.ceil((opens - now) / (1000 * 60 * 60 * 24));
      label = `Opens in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;
    } else if (open) {
      if (daysLeft <= 3) {
        label = `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
        color = '#EF4444';
      } else if (daysLeft <= 7) {
        label = `${daysLeft} days left`;
        color = '#F59E0B';
      } else {
        label = `${daysLeft} days left`;
        color = '#10B981';
      }
    } else {
      label = 'Expired';
      color = theme.textSecondary;
    }

    return { isOpen: open, timeLabel: label, urgencyColor: color };
  }, [w, theme]);

  return (
    <TouchableOpacity
      style={[styles.card, isOpen && styles.cardActive]}
      onPress={() => onPress(w)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.statusDot, { backgroundColor: isOpen ? '#10B981' : theme.textSecondary }]} />
          <Text style={styles.title} numberOfLines={1}>{w.title}</Text>
        </View>
        {onManage && (
          <TouchableOpacity onPress={() => onManage(w)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.typeLabel}>{typeConfig.label}</Text>

      {w.description ? (
        <Text style={styles.description} numberOfLines={2}>{w.description}</Text>
      ) : null}

      <View style={styles.categories}>
        {w.allowed_categories.slice(0, 4).map((cat: SubmissionCategory) => (
          <View key={cat} style={styles.categoryPill}>
            <CategoryIcon category={cat} size={14} />
            <Text style={styles.categoryText}>{CATEGORY_CONFIG[cat]?.label || cat}</Text>
          </View>
        ))}
        {w.allowed_categories.length > 4 && (
          <Text style={styles.moreText}>+{w.allowed_categories.length - 4}</Text>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={[styles.timeLabel, { color: urgencyColor }]}>{timeLabel}</Text>
        {submissionCount !== undefined && (
          <View style={styles.countBadge}>
            <Ionicons name="document-text-outline" size={14} color={theme.textSecondary} />
            <Text style={styles.countText}>{submissionCount}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardActive: {
    borderColor: '#10B98140',
    borderWidth: 1.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
    flex: 1,
  },
  typeLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 6,
    marginLeft: 16,
  },
  description: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  moreText: {
    fontSize: 11,
    color: theme.textSecondary,
    alignSelf: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countText: {
    fontSize: 12,
    color: theme.textSecondary,
  },
});
