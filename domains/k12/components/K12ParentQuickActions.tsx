/**
 * K12ParentQuickActions
 *
 * K-12 parents route to a dedicated dashboard path, so this component needs
 * to carry the hierarchy change directly instead of relying on the non-K12
 * Mission Control section.
 */

import React, { useMemo } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { GlassCard } from '@/components/nextgen/GlassCard';
import { styles } from './K12ParentDashboard.styles';
import {
  K12MissionActionCard,
  type K12MissionAction,
} from './K12MissionActionCard';
import {
  getK12MissionSectionLayout,
  getMissionCellWidth,
  getMissionTrackWidth,
} from './K12MissionLayout';
import { missionControlStyles } from './K12ParentQuickActions.styles';

interface K12ParentQuickActionsProps {
  onActionPress: (actionId: K12MissionAction['actionId']) => void;
  theme: ThemeColors;
  quickWinsEnabled: boolean;
  /** When true, the Payments card shows glow, pulse, and attention badge */
  paymentsNeedAttention?: boolean;
}

interface QuickActionGroup {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  actions: K12MissionAction[];
}

export function K12ParentQuickActions({
  onActionPress,
  theme,
  quickWinsEnabled,
  paymentsNeedAttention = false,
}: K12ParentQuickActionsProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const compactLayout = width < 360;
  const stackFeaturedCards = width < 560;

  const quickActions = useMemo<K12MissionAction[]>(() => [
    {
      id: 'homework',
      actionId: 'homework',
      icon: 'document-text',
      label: t('dashboard.parent.nav.homework', { defaultValue: 'Homework' }),
      subtitle: t('dashboard.parent.k12.homework_hint', { defaultValue: 'Assignments, due dates, and study tasks.' }),
      color: '#06B6D4',
    },
    {
      id: 'messages',
      actionId: 'messages',
      icon: 'chatbubbles',
      label: t('navigation.messages', { defaultValue: 'Messages' }),
      subtitle: t('dashboard.parent.k12.messages_hint', { defaultValue: 'Teacher updates and quick replies.' }),
      color: '#38BDF8',
    },
    {
      id: 'children',
      actionId: 'children',
      icon: 'people',
      label: t('dashboard.parent.nav.my_children', { defaultValue: 'My Children' }),
      subtitle: t('dashboard.parent.k12.children_hint', { defaultValue: 'Switch profiles and view learner details.' }),
      color: '#7C3AED',
    },
    {
      id: 'attendance',
      actionId: 'attendance',
      icon: 'calendar-outline',
      label: t('dashboard.parent.nav.attendance', { defaultValue: 'Attendance' }),
      subtitle: t('dashboard.parent.k12.attendance_hint', { defaultValue: 'Track today and weekly attendance.' }),
      color: '#F8CA59',
    },
    {
      id: 'progress',
      actionId: 'progress',
      icon: 'ribbon',
      label: t('dashboard.progress', { defaultValue: 'Progress' }),
      subtitle: t('dashboard.parent.k12.progress_hint', { defaultValue: 'Marks, trends, and school reports.' }),
      color: '#10B981',
    },
    {
      id: 'payments',
      actionId: 'payments',
      icon: 'card',
      label: t('dashboard.parent.nav.payments', { defaultValue: 'Payments' }),
      subtitle: t('dashboard.parent.k12.payments_hint', { defaultValue: 'Fees, invoices, and proof of payment.' }),
      color: '#8B5CF6',
    },
    {
      id: 'calculator',
      actionId: 'calculator',
      icon: 'calculator',
      label: t('dashboard.parent.nav.calculator', { defaultValue: 'Calculator' }),
      subtitle: t('dashboard.parent.k12.calculator_hint', { defaultValue: 'Fast maths support during homework.' }),
      color: '#34D399',
    },
  ], [t]);

  const featuredActions = useMemo(
    () => quickActions.filter((action) => action.id === 'homework' || action.id === 'messages'),
    [quickActions],
  );

  const groupedSections = useMemo<QuickActionGroup[]>(
    () => [
      {
        id: 'family',
        eyebrow: t('dashboard.parent.k12.family_lane_eyebrow', { defaultValue: 'Stay synced' }),
        title: t('dashboard.parent.k12.family_lane', { defaultValue: 'Family lane' }),
        description: t('dashboard.parent.k12.family_lane_hint', {
          defaultValue: 'Move between children, attendance, and progress without hunting through the menu.',
        }),
        actions: quickActions.filter((action) => (
          action.id === 'children' || action.id === 'attendance' || action.id === 'progress'
        )),
      },
      {
        id: 'admin',
        eyebrow: t('dashboard.parent.k12.admin_lane_eyebrow', { defaultValue: 'School admin' }),
        title: t('dashboard.parent.k12.admin_lane', { defaultValue: 'Payments & tools' }),
        description: t('dashboard.parent.k12.admin_lane_hint', {
          defaultValue: 'Handle fees quickly and keep a calculator close during homework support.',
        }),
        actions: quickActions.filter((action) => action.id === 'payments' || action.id === 'calculator'),
      },
    ],
    [quickActions, t],
  );
  const groupedSectionLayout = useMemo(
    () => getK12MissionSectionLayout(width, groupedSections.length, groupedSections[0]?.actions.length ?? 1),
    [groupedSections.length, groupedSections, width],
  );
  const groupSectionWidth = getMissionTrackWidth(groupedSectionLayout.sectionTracks);

  return (
    <View style={styles.section}>
      <GlassCard style={[styles.sectionHeaderCard, missionControlStyles.headerCard]} padding={16}>
        <Text
          style={[
            missionControlStyles.headerEyebrow,
            { color: quickWinsEnabled ? '#93C5FD' : (theme.primary || '#38BDF8') },
          ]}
        >
          {t('dashboard.parent.k12.mission_control_eyebrow', { defaultValue: 'Top priority' })}
        </Text>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeaderTitle, missionControlStyles.headerTitle, { color: theme.text }]}>
            {t('dashboard.parent.k12.mission_control', { defaultValue: 'Mission Control' })}
          </Text>
          <View
            style={[
              missionControlStyles.headerCountPill,
              {
                backgroundColor: quickWinsEnabled ? 'rgba(56, 189, 248, 0.16)' : 'rgba(59, 130, 246, 0.14)',
                borderColor: quickWinsEnabled ? 'rgba(56, 189, 248, 0.3)' : (theme.border || 'rgba(255,255,255,0.08)'),
              },
            ]}
          >
            <Ionicons
              name="sparkles-outline"
              size={12}
              color={quickWinsEnabled ? '#E0F2FE' : (theme.primary || '#38BDF8')}
            />
            <Text
              style={[
                missionControlStyles.headerCountText,
                { color: quickWinsEnabled ? '#E0F2FE' : (theme.primary || '#38BDF8') },
              ]}
            >
              {quickActions.length}
            </Text>
          </View>
        </View>
        <Text style={[styles.sectionHeaderHint, missionControlStyles.headerHint, { color: theme.textSecondary }]}>
          {t('dashboard.parent.k12.mission_control_hint', {
            defaultValue: 'Start with homework and messages first, then use the grouped school tools below.',
          })}
        </Text>
      </GlassCard>

      <View style={[missionControlStyles.featuredRow, stackFeaturedCards && missionControlStyles.featuredRowStacked]}>
        {featuredActions.map((action) => (
          <View
            key={action.id}
            style={[
              missionControlStyles.featuredItem,
              { width: stackFeaturedCards ? '100%' : '48.5%' },
            ]}
          >
            <K12MissionActionCard
              action={action}
              onPress={onActionPress}
              theme={theme}
              quickWinsEnabled={quickWinsEnabled}
              compactLayout={compactLayout}
              featured
            />
          </View>
        ))}
      </View>

      <View
        style={[
          missionControlStyles.groupSections,
          groupedSectionLayout.isWide && missionControlStyles.groupSectionsWide,
        ]}
      >
        {groupedSections.map((section) => {
          const sectionLayout = getK12MissionSectionLayout(width, groupedSections.length, section.actions.length);

          return (
            <View
              key={section.id}
              style={[
                missionControlStyles.groupSectionShell,
                groupedSectionLayout.isWide && { width: groupSectionWidth },
              ]}
            >
              <GlassCard
                style={[
                  missionControlStyles.groupCard,
                  groupedSectionLayout.isWide && missionControlStyles.groupCardWide,
                ]}
                padding={14}
              >
                <View style={missionControlStyles.groupHeader}>
                  <View style={missionControlStyles.groupTitleBlock}>
                    <Text style={[missionControlStyles.groupEyebrow, { color: theme.textSecondary }]}>
                      {section.eyebrow}
                    </Text>
                    <Text style={[missionControlStyles.groupTitle, { color: theme.text }]}>
                      {section.title}
                    </Text>
                  </View>
                  <View
                    style={[
                      missionControlStyles.groupCountPill,
                      { borderColor: theme.border || 'rgba(255,255,255,0.08)' },
                    ]}
                  >
                    <Text style={[missionControlStyles.groupCountText, { color: theme.textSecondary }]}>
                      {section.actions.length}
                    </Text>
                  </View>
                </View>
                <Text style={[missionControlStyles.groupDescription, { color: theme.textSecondary }]}>
                  {section.description}
                </Text>
                <View style={missionControlStyles.groupGrid}>
                  {section.actions.map((action, index) => (
                    <View
                      key={action.id}
                      style={[
                        missionControlStyles.groupItem,
                        {
                          width: getMissionCellWidth(index, section.actions.length, sectionLayout.actionTracks),
                        },
                      ]}
                    >
                      <K12MissionActionCard
                        action={action}
                        onPress={onActionPress}
                        theme={theme}
                        quickWinsEnabled={quickWinsEnabled}
                        compactLayout={compactLayout}
                        needsAttention={action.id === 'payments' && paymentsNeedAttention}
                      />
                    </View>
                  ))}
                </View>
              </GlassCard>
            </View>
          );
        })}
      </View>
    </View>
  );
}
