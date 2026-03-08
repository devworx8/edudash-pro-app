/**
 * MissionControlSection — Responsive action grid with grouped sub-sections.
 *
 * Layout tiers:
 *   < 768px   →  3 cols, sections stacked vertically  (mobile)
 *   768–1023px →  4 cols, sections in 2-column pairs   (tablet)
 *   ≥ 1024px  →  5 cols, sections in 2-column pairs   (desktop)
 */

import React, { useMemo, useState, useCallback } from 'react';
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

function getLayout(containerWidth: number): { cols: number; gap: number; isWide: boolean } {
  if (containerWidth >= 1024) return { cols: 5, gap: 10, isWide: true };
  if (containerWidth >= 768)  return { cols: 4, gap: 10, isWide: true };
  return { cols: 3, gap: 8, isWide: false };
}

// ─── Single section grid ──────────────────────────────────────────────────────

interface SectionGridProps {
  section: ActionSection;
  actions: QuickAction[];
  cardWidth: number;
  gap: number;
  onAction: (id: string) => void;
  onUpgrade: () => void;
}

const SectionGrid: React.FC<SectionGridProps> = ({
  section, actions, cardWidth, gap, onAction, onUpgrade,
}) => {
  const { theme } = useTheme();
  if (actions.length === 0) return null;

  return (
    <View style={styles.actionSection}>
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

      <View style={[styles.grid, { gap }]}>
        {actions.map((action) => (
          <View
            key={action.id}
            style={[styles.gridCell, { width: cardWidth }, action.disabled && styles.disabled]}
          >
            <MetricCard
              title={action.disabled ? `${action.title} 🔒` : action.title}
              subtitle={action.subtitle}
              value=""
              icon={action.icon}
              color={action.disabled ? theme.textSecondary : action.color}
              size="small"
              cardWidth={cardWidth}
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
  const [containerWidth, setContainerWidth] = useState(0);

  const onLayout = useCallback((e: any) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0) setContainerWidth(w);
  }, []);

  // Use measured width for accuracy; window width as initial fallback
  const w = containerWidth > 0 ? containerWidth : windowWidth;
  const { cols, gap, isWide } = useMemo(() => getLayout(w), [w]);

  // Card width fills the row with gaps between cards
  const cardWidth = useMemo(
    () => Math.max(72, Math.floor((w - gap * (cols - 1)) / cols)),
    [w, gap, cols],
  );

  const activeSections = useMemo(
    () => sections.filter((s) => (groupedActions[s.id] ?? []).length > 0),
    [sections, groupedActions],
  );

  return (
    <View onLayout={onLayout} style={styles.root}>
      {isWide ? (
        // ── Tablet / Desktop: 2-column section pairs ─────────────────────────
        <>
          {Array.from({ length: Math.ceil(activeSections.length / 2) }, (_, rowIdx) => {
            const left  = activeSections[rowIdx * 2];
            const right = activeSections[rowIdx * 2 + 1];
            return (
              <View key={left.id} style={[styles.wideRow, { gap: gap * 3 }]}>
                <View style={styles.wideCell}>
                  <SectionGrid
                    section={left}
                    actions={groupedActions[left.id] ?? []}
                    cardWidth={cardWidth}
                    gap={gap}
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
                        cardWidth={cardWidth}
                        gap={gap}
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
            cardWidth={cardWidth}
            gap={gap}
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
  // Card grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridCell: {
    // width set inline
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
    opacity: 0.35,
  },
});

export default MissionControlSection;