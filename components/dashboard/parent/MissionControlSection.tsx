/**
 * MissionControlSection — Responsive action grid with grouped sub-sections.
 *
 * Layout tiers:
 *   < 768px   →  3 cols, sections stacked vertically  (mobile)
 *   768–1023px →  4 cols, sections in 2-column pairs   (tablet)
 *   ≥ 1024px  →  5 cols, sections in 2-column pairs   (desktop)
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
}

interface MissionControlSectionProps {
  sections: ActionSection[];
  groupedActions: Record<string, QuickAction[]>;
  onAction: (actionId: string) => void;
  onUpgrade: () => void;
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function getLayout(windowWidth: number): {
  cols: number;
  innerPad: number;
  isWide: boolean;
} {
  if (windowWidth >= 1024) return { cols: 5, innerPad: 5, isWide: true };
  if (windowWidth >= 768)  return { cols: 4, innerPad: 5, isWide: true };
  return { cols: 3, innerPad: 4, isWide: false };
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
  onAction: (id: string) => void;
  onUpgrade: () => void;
}

const SectionGrid: React.FC<SectionGridProps> = ({
  section, actions, cols, innerPad, onAction, onUpgrade,
}) => {
  const { theme } = useTheme();
  if (actions.length === 0) return null;

  return (
    <View style={styles.actionSection}>
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconBadge, {
          backgroundColor: theme.surfaceVariant ?? 'rgba(255,255,255,0.06)',
          borderColor: theme.borderLight ?? 'rgba(255,255,255,0.08)',
        }]}>
          <Ionicons name={section.icon as any} size={12} color={theme.textSecondary} />
        </View>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {section.title}
        </Text>
      </View>

      {/* Card grid — negative margin neutralises the outer cell padding */}
      <View style={[styles.grid, { marginHorizontal: -innerPad }]}>
        {actions.map((action, index) => (
          <View
            key={action.id}
            style={[
              styles.gridCell,
              {
                width: getCellWidth(index, actions.length, cols),
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
    </View>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const MissionControlSection: React.FC<MissionControlSectionProps> = ({
  sections, groupedActions, onAction, onUpgrade,
}) => {
  const { theme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const { cols, innerPad, isWide } = useMemo(() => getLayout(windowWidth), [windowWidth]);

  const activeSections = useMemo(
    () => sections.filter((s) => (groupedActions[s.id] ?? []).length > 0),
    [sections, groupedActions],
  );

  return (
    <View style={styles.root}>
      {isWide ? (
        // ── Tablet / Desktop: 2-column section pairs ─────────────────────────
        <>
          {Array.from({ length: Math.ceil(activeSections.length / 2) }, (_, rowIdx) => {
            const left  = activeSections[rowIdx * 2];
            const right = activeSections[rowIdx * 2 + 1];
            return (
              <View key={left.id} style={styles.wideRow}>
                <View style={styles.wideCell}>
                  <SectionGrid
                    section={left}
                    actions={groupedActions[left.id] ?? []}
                    cols={cols}
                    innerPad={innerPad}
                    onAction={onAction}
                    onUpgrade={onUpgrade}
                  />
                </View>
                {right && (
                  <>
                    <View style={[styles.wideDivider, { backgroundColor: theme.borderLight ?? 'rgba(255,255,255,0.08)' }]} />
                    <View style={styles.wideCell}>
                      <SectionGrid
                        section={right}
                        actions={groupedActions[right.id] ?? []}
                        cols={cols}
                        innerPad={innerPad}
                        onAction={onAction}
                        onUpgrade={onUpgrade}
                      />
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </>
      ) : (
        // ── Mobile: sections stacked vertically ──────────────────────────────
        activeSections.map((section) => (
          <SectionGrid
            key={section.id}
            section={section}
            actions={groupedActions[section.id] ?? []}
            cols={cols}
            innerPad={innerPad}
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
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 10,
  },
  sectionIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  // Percentage grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  wideRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  wideCell: {
    flex: 1,
  },
  wideDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 12,
    opacity: 0.35,
  },
});

export default MissionControlSection;
