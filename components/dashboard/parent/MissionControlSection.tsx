/**
 * MissionControlSection — Responsive action grid with grouped sub-sections.
 *
 * Layout tiers:
 *   < 768px    → sections stacked vertically, 3 cols each
 *   768–1023px → Missions gets a primary 4-col row, secondary groups pair below
 *   ≥ 1024px   → Missions stays primary, secondary groups use roomier 3-col grids
 *
 * Uses percentage-based cell widths + inner padding (negative-margin grid
 * pattern) so layout is always correct regardless of ancestor padding —
 * no pixel measurement or onLayout required.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { MetricCard } from '../shared';
import {
  getMissionControlLayout,
  splitMissionControlSections,
  splitSecondaryMissionSections,
  splitMissionSectionActions,
} from './missionControlLayout';

export interface QuickAction {
  id: string;
  title: string;
  icon: string;
  color: string;
  disabled?: boolean;
  subtitle?: string;
  glow?: boolean;
}

export interface ActionSection {
  id: string;
  title: string;
  icon: string;
  description?: string;
  eyebrow?: string;
}

interface MissionControlSectionProps {
  sections: ActionSection[];
  groupedActions: Record<string, QuickAction[]>;
  onAction: (actionId: string) => void;
  onUpgrade: () => void;
}

function getCellWidth(index: number, total: number, cols: number): `${number}%` {
  const remainder = total % cols;
  const baseWidth = `${(100 / cols).toFixed(4)}%` as `${number}%`;

  if (remainder === 0) return baseWidth;

  const lastRowStart = total - remainder;
  if (index < lastRowStart) return baseWidth;

  return `${(100 / remainder).toFixed(4)}%` as `${number}%`;
}

// ─── Single section grid ──────────────────────────────────────────────────────

interface SectionGridProps {
  section: ActionSection;
  actions: QuickAction[];
  cols: number;
  innerPad: number;
  variant?: 'primary' | 'secondary';
  onAction: (id: string) => void;
  onUpgrade: () => void;
}

const SectionGrid: React.FC<SectionGridProps> = ({
  section, actions, cols, innerPad, variant = 'secondary', onAction, onUpgrade,
}) => {
  const { theme } = useTheme();
  const isPrimary = variant === 'primary';
  const { featuredActions, remainingActions } = isPrimary
    ? splitMissionSectionActions(actions)
    : { featuredActions: [] as QuickAction[], remainingActions: actions };
  const remainderLabel = section.title.trim();

  if (actions.length === 0) return null;

  return (
    <View
      style={[
        styles.actionSection,
        isPrimary ? styles.primaryActionSection : styles.secondaryActionSection,
        {
          backgroundColor: isPrimary
            ? theme.surface ?? theme.cardBackground ?? 'rgba(255,255,255,0.04)'
            : theme.surfaceVariant ?? theme.surface ?? 'rgba(255,255,255,0.03)',
          borderColor: isPrimary
            ? `${theme.primary ?? '#0EA5E9'}33`
            : theme.borderLight ?? 'rgba(255,255,255,0.08)',
          shadowColor: isPrimary ? theme.shadow ?? '#000000' : 'transparent',
        },
      ]}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderMain}>
          <View style={[styles.sectionIconBadge, {
            width: isPrimary ? 28 : 22,
            height: isPrimary ? 28 : 22,
            borderRadius: isPrimary ? 9 : 6,
            backgroundColor: isPrimary
              ? `${theme.primary ?? '#0EA5E9'}18`
              : theme.surfaceVariant ?? 'rgba(255,255,255,0.06)',
            borderColor: isPrimary
              ? `${theme.primary ?? '#0EA5E9'}30`
              : theme.borderLight ?? 'rgba(255,255,255,0.08)',
          }]}>
            <Ionicons
              name={section.icon as any}
              size={isPrimary ? 14 : 12}
              color={isPrimary ? theme.primary : theme.textSecondary}
            />
          </View>
          <View style={styles.sectionTitleBlock}>
            {section.eyebrow ? (
              <Text style={[styles.sectionEyebrow, { color: isPrimary ? theme.primary : theme.textSecondary }]}>
                {section.eyebrow}
              </Text>
            ) : null}
            <Text style={[
              styles.sectionTitle,
              isPrimary && styles.primarySectionTitle,
              { color: isPrimary ? theme.text : theme.textSecondary },
            ]}>
              {section.title}
            </Text>
          </View>
        </View>
        <View style={[styles.sectionCountPill, {
          backgroundColor: isPrimary
            ? `${theme.primary ?? '#0EA5E9'}16`
            : theme.surfaceVariant ?? 'rgba(255,255,255,0.06)',
          borderColor: isPrimary
            ? `${theme.primary ?? '#0EA5E9'}30`
            : theme.borderLight ?? 'rgba(255,255,255,0.08)',
        }]}>
          <Ionicons
            name="grid-outline"
            size={11}
            color={isPrimary ? theme.primary : theme.textSecondary}
          />
          <Text style={[styles.sectionCountText, { color: isPrimary ? theme.primary : theme.textSecondary }]}>
            {actions.length}
          </Text>
        </View>
      </View>

      {section.description ? (
        <Text style={[
          styles.sectionDescription,
          isPrimary && styles.primarySectionDescription,
          { color: theme.textSecondary },
        ]}>
          {section.description}
        </Text>
      ) : null}

      {featuredActions.length > 0 ? (
        <View style={[styles.featuredGrid, { marginHorizontal: -innerPad }]}>
          {featuredActions.map((action) => (
            <View
              key={action.id}
              style={[
                styles.featuredCell,
                {
                  width: featuredActions.length === 1 ? '100%' : '50%',
                  paddingHorizontal: innerPad,
                  paddingBottom: innerPad * 2,
                },
                action.disabled && styles.disabled,
              ]}
            >
              <MetricCard
                title={action.disabled ? `${action.title} 🔒` : action.title}
                subtitle={action.subtitle}
                value=""
                icon={action.icon}
                color={action.disabled ? theme.textSecondary : action.color}
                size="medium"
                cardWidth={1}
                glow={Boolean(action.glow)}
                attentionBadge={Boolean(action.glow)}
                onPress={() => action.disabled ? onUpgrade() : onAction(action.id)}
              />
            </View>
          ))}
        </View>
      ) : null}

      {isPrimary && featuredActions.length > 0 && remainingActions.length > 0 ? (
        <View style={styles.primaryDivider}>
          <View style={[styles.primaryDividerLine, { backgroundColor: theme.borderLight ?? 'rgba(255,255,255,0.08)' }]} />
          <Text style={[styles.primaryDividerText, { color: theme.textSecondary }]}>
            {remainderLabel}
          </Text>
          <View style={[styles.primaryDividerLine, { backgroundColor: theme.borderLight ?? 'rgba(255,255,255,0.08)' }]} />
        </View>
      ) : null}

      {remainingActions.length > 0 ? (
        <View style={[styles.grid, styles.sectionGrid, { marginHorizontal: -innerPad }]}>
          {remainingActions.map((action, index) => (
            <View
              key={action.id}
              style={[
                styles.gridCell,
                {
                  width: getCellWidth(index, remainingActions.length, cols),
                  paddingHorizontal: innerPad,
                  paddingBottom: innerPad * 2,
                },
                action.disabled && styles.disabled,
              ]}
            >
              <MetricCard
                title={action.disabled ? `${action.title} 🔒` : action.title}
                subtitle={action.subtitle}
                value=""
                icon={action.icon}
                color={action.disabled ? theme.textSecondary : action.color}
                size="small"
                // Pass a truthy sentinel so MetricCard uses width:'100%' inside its cell.
                // The actual width is owned by gridCell above.
                cardWidth={1}
                glow={Boolean(action.glow)}
                attentionBadge={Boolean(action.glow)}
                onPress={() => action.disabled ? onUpgrade() : onAction(action.id)}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const MissionControlSection: React.FC<MissionControlSectionProps> = ({
  sections, groupedActions, onAction, onUpgrade,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const {
    primaryCols,
    secondaryRowCols,
    secondarySectionsPerRow,
    innerPad,
    isWide,
  } = useMemo(
    () => getMissionControlLayout(windowWidth),
    [windowWidth],
  );

  const activeSections = useMemo(
    () => sections.filter((s) => (groupedActions[s.id] ?? []).length > 0),
    [sections, groupedActions],
  );

  const { primarySection, secondarySections } = useMemo(
    () => splitMissionControlSections(activeSections),
    [activeSections],
  );
  const { leadSection, trailingSections } = useMemo(
    () => splitSecondaryMissionSections(secondarySections),
    [secondarySections],
  );
  const stackedSections = useMemo(
    () => primarySection ? [primarySection, ...secondarySections] : secondarySections,
    [primarySection, secondarySections],
  );
  const trailingSectionsPerRow = useMemo(
    () => leadSection ? Math.min(2, secondarySectionsPerRow) : secondarySectionsPerRow,
    [leadSection, secondarySectionsPerRow],
  );
  const trailingRows = useMemo(
    () => Array.from(
      { length: Math.ceil(trailingSections.length / trailingSectionsPerRow) },
      (_, rowIdx) => trailingSections.slice(
        rowIdx * trailingSectionsPerRow,
        (rowIdx + 1) * trailingSectionsPerRow,
      ),
    ),
    [trailingSections, trailingSectionsPerRow],
  );

  return (
    <View style={styles.root}>
      {isWide ? (
        // ── Tablet / Desktop: primary Missions lane gets its own hierarchy ───
        <>
          {primarySection ? (
            <View style={styles.primarySection}>
              <SectionGrid
                section={primarySection}
                actions={groupedActions[primarySection.id] ?? []}
                cols={primaryCols}
                innerPad={innerPad}
                variant="primary"
                onAction={onAction}
                onUpgrade={onUpgrade}
              />
            </View>
          ) : null}

          {leadSection ? (
            <View style={styles.secondaryLeadRow}>
              <SectionGrid
                section={leadSection}
                actions={groupedActions[leadSection.id] ?? []}
                cols={secondaryRowCols}
                innerPad={innerPad}
                variant="secondary"
                onAction={onAction}
                onUpgrade={onUpgrade}
              />
            </View>
          ) : null}

          {trailingRows.map((row, rowIdx) => {
            if (row.length === 0) return null;

            return (
              <View key={`${row[0]?.id ?? 'secondary'}-${rowIdx}`} style={styles.wideRow}>
                {row.map((section) => (
                  <View
                    key={section.id}
                    style={[styles.wideCell, row.length === 1 && styles.wideCellSolo]}
                  >
                    <SectionGrid
                      section={section}
                      actions={groupedActions[section.id] ?? []}
                      cols={secondaryRowCols}
                      innerPad={innerPad}
                      variant="secondary"
                      onAction={onAction}
                      onUpgrade={onUpgrade}
                    />
                  </View>
                ))}
              </View>
            );
          })}
        </>
      ) : (
        // ── Mobile: sections stacked vertically ──────────────────────────────
        stackedSections.map((section) => (
          <SectionGrid
            key={section.id}
            section={section}
            actions={groupedActions[section.id] ?? []}
            cols={primaryCols}
            innerPad={innerPad}
            variant={section.id === primarySection?.id ? 'primary' : 'secondary'}
            onAction={onAction}
            onUpgrade={onUpgrade}
          />
        ))
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  // Section
  actionSection: {
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  primaryActionSection: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  secondaryActionSection: {
    borderRadius: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  sectionHeaderMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 9,
  },
  sectionCountPill: {
    minWidth: 34,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sectionIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sectionTitleBlock: {
    flex: 1,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  primarySectionTitle: {
    fontSize: 14,
    letterSpacing: 0.2,
  },
  sectionDescription: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  primarySectionDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  // Percentage grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  featuredGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  primaryDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  primaryDividerLine: {
    flex: 1,
    height: 1,
    opacity: 0.8,
  },
  primaryDividerText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  featuredCell: {
    flexGrow: 0,
    flexShrink: 0,
  },
  sectionGrid: {
    marginTop: 2,
  },
  gridCell: {
    // width set inline as percentage
    flexGrow: 0,
    flexShrink: 0,
  },
  disabled: {
    opacity: 0.5,
  },
  // Wide layout (tablet / desktop)
  primarySection: {
    marginBottom: 10,
  },
  secondaryLeadRow: {
    marginBottom: 2,
  },
  wideRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  wideCell: {
    flex: 1,
  },
  wideCellSolo: {
    flex: 0,
    width: '100%',
  },
});

export default MissionControlSection;
