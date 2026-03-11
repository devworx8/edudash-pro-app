/**
 * Low-Fidelity Wireframe Components for Role-Based Navigation
 * 
 * This file contains wireframe-style components that demonstrate the 
 * navigation structure and layout patterns for each role. These are
 * intended for prototyping and user testing before final implementation.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DesignSystem } from '@/constants/DesignSystem';
import { percentWidth } from '@/lib/progress/clampPercent';

// Type definitions for wireframe props
type Role = 'superadmin' | 'principal' | 'teacher' | 'parent';

interface WireframeTabConfig {
  label: string;
  icon: string;
  screen: string;
}

interface NavigationShellProps {
  role: Role;
  activeTab: string;
  onTabPress: (screen: string) => void;
  children: React.ReactNode;
}

// Tab configurations for each role
const ROLE_TAB_CONFIGS: Record<Role, WireframeTabConfig[]> = {
  superadmin: [
    { label: 'Dashboard', icon: '🏠', screen: 'dashboard' },
    { label: 'Tenants', icon: '🏢', screen: 'tenants' },
    { label: 'Sales', icon: '📊', screen: 'sales' },
    { label: 'Settings', icon: '⚙️', screen: 'settings' },
  ],
  principal: [
    { label: 'Dashboard', icon: '🏠', screen: 'dashboard' },
    { label: 'Hub', icon: '🎥', screen: 'hub' },
    { label: 'Teachers', icon: '👥', screen: 'teachers' },
    { label: 'Resources', icon: '📁', screen: 'resources' },
    { label: 'Settings', icon: '⚙️', screen: 'settings' },
  ],
  teacher: [
    { label: 'Dashboard', icon: '🏠', screen: 'dashboard' },
    { label: 'AI Tools', icon: '✨', screen: 'ai-tools' },
    { label: 'Assignments', icon: '📋', screen: 'assignments' },
    { label: 'Resources', icon: '📁', screen: 'resources' },
    { label: 'Messages', icon: '💬', screen: 'messages' },
  ],
  parent: [
    { label: 'Dashboard', icon: '🏠', screen: 'dashboard' },
    { label: 'Homework', icon: '📚', screen: 'homework' },
    { label: 'Messages', icon: '💬', screen: 'messages' },
    { label: 'Calendar', icon: '📅', screen: 'calendar' },
    { label: 'Settings', icon: '⚙️', screen: 'settings' },
  ],
};

// Role-based color schemes
const getRoleColors = (role: Role) => {
  const colors = {
    superadmin: { primary: '#ff0080', secondary: '#ff8000' },
    principal: { primary: '#8000ff', secondary: '#00f5ff' },
    teacher: { primary: '#ff0080', secondary: '#ff8000' },
    parent: { primary: '#00f5ff', secondary: '#0080ff' },
  };
  return colors[role];
};

/**
 * Navigation Shell Component
 * Provides the bottom tab navigation structure for each role
 */
export const NavigationShell: React.FC<NavigationShellProps> = ({
  role,
  activeTab,
  onTabPress,
  children,
}) => {
  const tabs = ROLE_TAB_CONFIGS[role];
  const colors = getRoleColors(role);

  return (
    <View style={styles.container}>
      {/* Header - No back arrow when signed in (per rule) */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>EduDash</Text>
        <TouchableOpacity style={styles.headerAction}>
          <Text style={[styles.headerActionText, { color: colors.primary }]}>•••</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <View style={styles.content}>
        {children}
      </View>

      {/* Bottom Tab Navigation */}
      <View style={styles.bottomTabs}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.screen}
            style={styles.tabItem}
            onPress={() => onTabPress(tab.screen)}
          >
            <Text
              style={[
                styles.tabIcon,
                { color: activeTab === tab.screen ? colors.primary : '#9CA3AF' }
              ]}
            >
              {tab.icon}
            </Text>
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab.screen ? colors.primary : '#9CA3AF' }
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

/**
 * Wireframe Card Component
 * Standard card layout used across all dashboards
 */
interface WireframeCardProps {
  title: string;
  children: React.ReactNode;
  actions?: Array<{ label: string; onPress: () => void; primary?: boolean }>;
}

export const WireframeCard: React.FC<WireframeCardProps> = ({ title, children, actions }) => (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>{title}</Text>
    <View style={styles.cardContent}>
      {children}
    </View>
    {actions && (
      <View style={styles.cardActions}>
        {actions.map((action, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.cardButton, action.primary && styles.cardButtonPrimary]}
            onPress={action.onPress}
          >
            <Text
              style={[
                styles.cardButtonText,
                action.primary && styles.cardButtonTextPrimary
              ]}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    )}
  </View>
);

/**
 * Metric Display Component
 * Used for displaying key performance indicators
 */
interface WireframeMetricProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export const WireframeMetric: React.FC<WireframeMetricProps> = ({ 
  label, 
  value, 
  subtext, 
  trend 
}) => {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return '📈';
      case 'down': return '📉';
      default: return '📊';
    }
  };

  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{value}</Text>
        {trend && <Text style={styles.metricTrend}>{getTrendIcon()}</Text>}
      </View>
      {subtext && <Text style={styles.metricSubtext}>{subtext}</Text>}
    </View>
  );
};

/**
 * Quick Action Button Component
 * Floating Action Button style for primary actions
 */
interface WireframeQuickActionProps {
  label: string;
  icon: string;
  onPress: () => void;
  role: Role;
}

export const WireframeQuickAction: React.FC<WireframeQuickActionProps> = ({
  label,
  icon,
  onPress,
  role,
}) => {
  const colors = getRoleColors(role);

  return (
    <TouchableOpacity
      style={[styles.quickAction, { backgroundColor: colors.primary }]}
      onPress={onPress}
    >
      <Text style={styles.quickActionIcon}>{icon}</Text>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
};

/**
 * List Item Component
 * For displaying items in activity feeds, assignments, etc.
 */
interface WireframeListItemProps {
  title: string;
  subtitle?: string;
  metadata?: string;
  icon?: string;
  onPress?: () => void;
  badge?: string;
}

export const WireframeListItem: React.FC<WireframeListItemProps> = ({
  title,
  subtitle,
  metadata,
  icon,
  onPress,
  badge,
}) => (
  <TouchableOpacity style={styles.listItem} onPress={onPress}>
    {icon && <Text style={styles.listItemIcon}>{icon}</Text>}
    <View style={styles.listItemContent}>
      <Text style={styles.listItemTitle}>{title}</Text>
      {subtitle && <Text style={styles.listItemSubtitle}>{subtitle}</Text>}
      {metadata && <Text style={styles.listItemMetadata}>{metadata}</Text>}
    </View>
    {badge && (
      <View style={styles.listItemBadge}>
        <Text style={styles.listItemBadgeText}>{badge}</Text>
      </View>
    )}
  </TouchableOpacity>
);

/**
 * Progress Bar Component
 * For showing usage quotas, completion rates, etc.
 */
interface WireframeProgressProps {
  label: string;
  current: number;
  total: number | 'unlimited';
  color?: string;
}

export const WireframeProgress: React.FC<WireframeProgressProps> = ({
  label,
  current,
  total,
  color = DesignSystem.colors.primary,
}) => {
  const percentage = total === 'unlimited' ? 0 : (current / total) * 100;
  const isUnlimited = total === 'unlimited';

  return (
    <View style={styles.progress}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>
          {current} / {total}
        </Text>
      </View>
      {!isUnlimited && (
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBar,
              { width: percentWidth(percentage), backgroundColor: color }
            ]}
          />
        </View>
      )}
    </View>
  );
};

/**
 * Empty State Component
 * For showing when no data is available
 */
interface WireframeEmptyStateProps {
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export const WireframeEmptyState: React.FC<WireframeEmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onActionPress,
}) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyStateIcon}>{icon}</Text>
    <Text style={styles.emptyStateTitle}>{title}</Text>
    <Text style={styles.emptyStateDescription}>{description}</Text>
    {actionLabel && onActionPress && (
      <TouchableOpacity style={styles.emptyStateAction} onPress={onActionPress}>
        <Text style={styles.emptyStateActionText}>{actionLabel}</Text>
      </TouchableOpacity>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DesignSystem.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: DesignSystem.spacing.md,
    paddingTop: DesignSystem.spacing.md,
    paddingBottom: DesignSystem.spacing.sm,
    backgroundColor: DesignSystem.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: DesignSystem.colors.text.primary,
  },
  headerAction: {
    padding: DesignSystem.spacing.xs,
  },
  headerActionText: {
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  bottomTabs: {
    flexDirection: 'row',
    backgroundColor: DesignSystem.colors.background,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    paddingTop: DesignSystem.spacing.xs,
    paddingBottom: DesignSystem.spacing.md,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: DesignSystem.spacing.xs,
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  card: {
    backgroundColor: DesignSystem.colors.surface,
    borderRadius: 12,
    padding: DesignSystem.spacing.md,
    margin: DesignSystem.spacing.sm,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: DesignSystem.colors.text.primary,
    marginBottom: DesignSystem.spacing.sm,
  },
  cardContent: {
    marginBottom: DesignSystem.spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    gap: DesignSystem.spacing.sm,
  },
  cardButton: {
    paddingHorizontal: DesignSystem.spacing.md,
    paddingVertical: DesignSystem.spacing.sm,
    borderRadius: 8,
    backgroundColor: '#1f2937',
  },
  cardButtonPrimary: {
    backgroundColor: DesignSystem.colors.primary,
  },
  cardButtonText: {
    color: DesignSystem.colors.text.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardButtonTextPrimary: {
    color: '#000',
  },
  metric: {
    alignItems: 'center',
    padding: DesignSystem.spacing.sm,
  },
  metricLabel: {
    fontSize: 12,
    color: DesignSystem.colors.text.secondary,
    marginBottom: 4,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '900',
    color: DesignSystem.colors.text.primary,
  },
  metricTrend: {
    fontSize: 16,
  },
  metricSubtext: {
    fontSize: 10,
    color: DesignSystem.colors.text.secondary,
    marginTop: 2,
  },
  quickAction: {
    position: 'absolute',
    bottom: 80,
    right: DesignSystem.spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  quickActionIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  quickActionLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: '#000',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: DesignSystem.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  listItemIcon: {
    fontSize: 16,
    marginRight: DesignSystem.spacing.sm,
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: DesignSystem.colors.text.primary,
    marginBottom: 2,
  },
  listItemSubtitle: {
    fontSize: 12,
    color: DesignSystem.colors.text.secondary,
  },
  listItemMetadata: {
    fontSize: 10,
    color: DesignSystem.colors.text.secondary,
    marginTop: 2,
  },
  listItemBadge: {
    backgroundColor: DesignSystem.colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  listItemBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#000',
  },
  progress: {
    marginVertical: DesignSystem.spacing.xs,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: DesignSystem.colors.text.secondary,
  },
  progressValue: {
    fontSize: 12,
    fontWeight: '600',
    color: DesignSystem.colors.text.primary,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#1f2937',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: DesignSystem.spacing.xl,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: DesignSystem.spacing.md,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: DesignSystem.colors.text.primary,
    marginBottom: DesignSystem.spacing.sm,
    textAlign: 'center',
  },
  emptyStateDescription: {
    fontSize: 14,
    color: DesignSystem.colors.text.secondary,
    textAlign: 'center',
    marginBottom: DesignSystem.spacing.lg,
  },
  emptyStateAction: {
    backgroundColor: DesignSystem.colors.primary,
    paddingHorizontal: DesignSystem.spacing.lg,
    paddingVertical: DesignSystem.spacing.sm,
    borderRadius: 20,
  },
  emptyStateActionText: {
    color: '#000',
    fontWeight: '700',
  },
});
