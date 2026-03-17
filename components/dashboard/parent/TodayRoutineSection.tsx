/**
 * TodayRoutineSection — Compact today's routine timeline for parent dashboard.
 *
 * Shows published daily program blocks for the current day.
 * Tapping "View Full Routine" navigates to parent-daily-program screen.
 *
 * Extracted per WARP (components ≤400 lines).
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { CollapsibleSection } from '../shared';
import { EmptyState } from '@/components/ui/EmptyState';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useTodayRoutineBlocks, type RoutineBlock } from '@/hooks/useTodayRoutineBlocks';
import { getRoutineBlockTypePresentation } from '@/lib/routines/blockTypePresentation';

interface TodayRoutineSectionProps {
  preschoolId?: string | null;
  activeChildId: string | null;
  children: any[];
  collapsedSections: Set<string>;
  toggleSection: (sectionId: string, isCollapsed?: boolean) => void;
}

function formatTime(value: string | null): string {
  if (!value) return '';
  // Strip seconds from HH:MM:SS → HH:MM
  const parts = value.split(':');
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return value;
}

function RoutineBlockRow({ block }: { block: RoutineBlock }) {
  const pres = getRoutineBlockTypePresentation(block.blockType);
  const timeStr = block.startTime
    ? block.endTime
      ? `${formatTime(block.startTime)} – ${formatTime(block.endTime)}`
      : formatTime(block.startTime)
    : '';

  return (
    <View style={[styles.blockRow, { borderLeftColor: pres.baseColor }]}>
      <View style={styles.blockHeader}>
        <View style={[styles.typeBadge, { backgroundColor: pres.backgroundColor }]}>
          <Text style={[styles.typeBadgeText, { color: pres.textColor }]}>{pres.label}</Text>
        </View>
        {timeStr ? (
          <Text style={styles.timeText}>{timeStr}</Text>
        ) : null}
      </View>
      <Text style={styles.blockTitle}>{block.title}</Text>
      {block.parentTip ? (
        <View style={styles.tipRow}>
          <Ionicons name="bulb-outline" size={12} color="#F59E0B" />
          <Text style={styles.tipText}>{block.parentTip}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const TodayRoutineSection: React.FC<TodayRoutineSectionProps> = ({
  preschoolId,
  activeChildId,
  children,
  collapsedSections,
  toggleSection,
}) => {
  const { t } = useTranslation();

  const activeChild = children.find((c: any) => c.id === activeChildId) || children[0] || null;
  const classId = activeChild?.classId || activeChild?.class_id || null;

  const { blocks, programTitle, weekLabel, isLoading, error } = useTodayRoutineBlocks(
    preschoolId,
    classId,
  );

  const dayName = new Date().toLocaleDateString('en-ZA', { weekday: 'long' });
  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;

  return (
    <CollapsibleSection
      title={t('dashboard.parent.section.todays_routine', { defaultValue: "Today's Routine" })}
      sectionId="todays-routine"
      icon="time-outline"
      hint={t('dashboard.hints.todays_routine', {
        defaultValue: "Your child's daily schedule published by the school.",
      })}
      defaultCollapsed={collapsedSections.has('todays-routine')}
      onToggle={toggleSection}
      actionLabel={blocks.length > 0 ? t('dashboard.view_full', { defaultValue: 'View Full' }) : undefined}
      onActionPress={blocks.length > 0 ? () => router.push('/screens/parent-daily-program' as any) : undefined}
    >
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="small" />
        </View>
      ) : error ? (
        <EmptyState
          icon="alert-circle-outline"
          title={t('dashboard.parent.empty.routine_error.title', { defaultValue: 'Could not load routine' })}
          description={error}
          size="small"
          secondary
        />
      ) : isWeekend ? (
        <EmptyState
          icon="sunny-outline"
          title={t('dashboard.parent.empty.routine_weekend.title', { defaultValue: 'No school today' })}
          description={t('dashboard.parent.empty.routine_weekend.description', {
            defaultValue: 'Enjoy the weekend! Routines resume on Monday.',
          })}
          size="small"
          secondary
        />
      ) : blocks.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title={t('dashboard.parent.empty.routine.title', { defaultValue: 'No routine published yet' })}
          description={t('dashboard.parent.empty.routine.description', {
            defaultValue: "The school hasn't published a daily routine for this week yet.",
          })}
          size="small"
          secondary
        />
      ) : (
        <View style={styles.container}>
          {programTitle ? (
            <View style={styles.headerRow}>
              <Text style={styles.programTitle}>{programTitle}</Text>
              {weekLabel ? <Text style={styles.weekLabel}>{weekLabel}</Text> : null}
            </View>
          ) : null}
          <Text style={styles.dayLabel}>{dayName}</Text>
          {blocks.slice(0, 6).map((block) => (
            <RoutineBlockRow key={block.id} block={block} />
          ))}
          {blocks.length > 6 ? (
            <TouchableOpacity
              style={styles.viewMoreBtn}
              onPress={() => router.push('/screens/parent-daily-program' as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.viewMoreText}>
                {t('parent.routine_view_more', { count: blocks.length - 6, defaultValue: '+{{count}} more — View Full Routine' })}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#06B6D4" />
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </CollapsibleSection>
  );
};

const styles = StyleSheet.create({
  container: { gap: 8 },
  loadingContainer: { alignItems: 'center', paddingVertical: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  programTitle: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  weekLabel: { color: 'rgba(203,213,225,0.7)', fontSize: 11, fontWeight: '600' },
  dayLabel: { color: '#06B6D4', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  blockRow: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 6,
    gap: 3,
  },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  timeText: { color: 'rgba(203,213,225,0.8)', fontSize: 11, fontWeight: '600' },
  blockTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  tipText: { color: '#F59E0B', fontSize: 11, fontStyle: 'italic', flex: 1 },
  viewMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 4 },
  viewMoreText: { color: '#06B6D4', fontSize: 12, fontWeight: '600' },
});
