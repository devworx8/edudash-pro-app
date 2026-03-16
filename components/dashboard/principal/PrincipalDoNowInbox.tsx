/**
 * Principal Dashboard - Do Now Inbox
 *
 * A simple prioritized list of what the principal should do next.
 * Designed for non-technical users: plain language, clear counts, one-tap navigation.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';

type DoNowItemId = 'registrations' | 'payment_proofs' | 'unpaid_fees' | 'approvals';

interface DoNowInboxCounts {
  pendingRegistrations: number;
  pendingPaymentProofs: number;
  pendingUnpaidFees: number;
  pendingApprovals: number;
}

interface PrincipalDoNowInboxProps {
  counts: DoNowInboxCounts;
  /** Optional override to change default navigation targets */
  routes?: Partial<Record<DoNowItemId, string>>;
  hideFinanceItems?: boolean;
}

const DEFAULT_ROUTES: Record<DoNowItemId, string> = {
  registrations: '/screens/principal-registrations',
  payment_proofs: '/screens/pop-review',
  unpaid_fees: '/screens/finance-control-center?tab=receivables',
  approvals: '/screens/principal-approval-dashboard',
};

export const PrincipalDoNowInbox: React.FC<PrincipalDoNowInboxProps> = ({ counts, routes, hideFinanceItems = false }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const resolvedRoutes = { ...DEFAULT_ROUTES, ...(routes || {}) };

  const items = useMemo(() => {
    const all = [
      ...(!hideFinanceItems ? [
        {
          id: 'payment_proofs' as const,
          title: t('dashboard.do_now.payment_proofs', { defaultValue: 'Check proof of payment' }),
          subtitle: t('dashboard.do_now.payment_proofs_hint', { defaultValue: 'Approve or reject uploads from parents' }),
          count: counts.pendingPaymentProofs,
          icon: 'document-text',
          color: '#F59E0B',
          priority: 'urgent' as const,
        },
        {
          id: 'unpaid_fees' as const,
          title: t('dashboard.do_now.unpaid_fees', { defaultValue: 'Follow up unpaid fees' }),
          subtitle: t('dashboard.do_now.unpaid_fees_hint', { defaultValue: 'See who has not paid and send reminders' }),
          count: counts.pendingUnpaidFees,
          icon: 'alert-circle',
          color: '#EF4444',
          priority: 'urgent' as const,
        },
      ] : []),
      {
        id: 'registrations' as const,
        title: t('dashboard.do_now.registrations', { defaultValue: 'Review registrations' }),
        subtitle: t('dashboard.do_now.registrations_hint', { defaultValue: 'Approve new families and learners' }),
        count: counts.pendingRegistrations,
        icon: 'person-add',
        color: '#6366F1',
        priority: 'important' as const,
      },
      {
        id: 'approvals' as const,
        title: t('dashboard.do_now.approvals', { defaultValue: 'Approvals' }),
        subtitle: t('dashboard.do_now.approvals_hint', { defaultValue: 'Review POPs, petty cash, and other pending items' }),
        count: counts.pendingApprovals,
        icon: 'checkmark-circle',
        color: '#06B6D4',
        priority: 'important' as const,
      },
    ];

    // Only show non-zero items first, but keep the list stable.
    const nonZero = all.filter((x) => x.count > 0);
    const zero = all.filter((x) => x.count <= 0);
    return [...nonZero, ...zero];
  }, [counts.pendingApprovals, counts.pendingPaymentProofs, counts.pendingRegistrations, counts.pendingUnpaidFees, hideFinanceItems, t]);

  const totalPending =
    counts.pendingRegistrations +
    counts.pendingPaymentProofs +
    counts.pendingUnpaidFees +
    counts.pendingApprovals;

  const firstActionable = items.find((i) => i.count > 0) || null;

  const onStart = () => {
    if (!firstActionable) return;
    router.push(resolvedRoutes[firstActionable.id] as any);
  };

  const onOpen = (id: DoNowItemId) => {
    router.push(resolvedRoutes[id] as any);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>
            {t('dashboard.do_now.title', { defaultValue: 'Do Now' })}
          </Text>
          <Text style={styles.headerSub}>
            {totalPending > 0
              ? t('dashboard.do_now.subtitle', { defaultValue: 'Your next actions for today' })
              : t('dashboard.do_now.caught_up', { defaultValue: 'All caught up for now' })}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.startButton, !firstActionable && styles.startButtonDisabled]}
          onPress={onStart}
          disabled={!firstActionable}
          activeOpacity={0.8}
        >
          <Text style={[styles.startButtonText, !firstActionable && styles.startButtonTextDisabled]}>
            {t('dashboard.do_now.start', { defaultValue: 'Start' })}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={14}
            color={!firstActionable ? theme.textSecondary : theme.onPrimary}
          />
        </TouchableOpacity>
      </View>

      {totalPending <= 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: '#10B98115' }]}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
          </View>
          <Text style={styles.emptyTitle}>
            {t('dashboard.all_caught_up', { defaultValue: 'All caught up' })}
          </Text>
          <Text style={styles.emptyText}>
            {t('dashboard.no_pending_items', { defaultValue: 'No pending items need your attention right now.' })}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.slice(0, 4).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.row, item.count > 0 && styles.rowActive]}
              onPress={() => onOpen(item.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.icon, { backgroundColor: `${item.color}15` }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
                {item.count > 0 ? (
                  <View style={[styles.badge, { backgroundColor: item.color }]}>
                    <Text style={styles.badgeText}>{item.count > 99 ? '99+' : String(item.count)}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={2}>
                  {item.subtitle}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const createStyles = (theme: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      marginHorizontal: 16,
      marginTop: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    headerLeft: {
      flex: 1,
      paddingRight: 10,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.text,
    },
    headerSub: {
      marginTop: 2,
      fontSize: 12,
      color: theme.textSecondary,
    },
    startButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    startButtonDisabled: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    startButtonText: {
      color: theme.onPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    startButtonTextDisabled: {
      color: theme.textSecondary,
    },
    list: {
      gap: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.cardBackground || theme.surface,
    },
    rowActive: {
      borderColor: `${theme.primary}40`,
      backgroundColor: `${theme.primary}0A`,
    },
    icon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      position: 'relative',
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.cardBackground || theme.surface,
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
      lineHeight: 12,
    },
    rowBody: {
      flex: 1,
      marginRight: 8,
    },
    rowTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.text,
    },
    rowSubtitle: {
      marginTop: 2,
      fontSize: 12,
      color: theme.textSecondary,
      lineHeight: 16,
    },
    emptyState: {
      paddingVertical: 8,
      paddingHorizontal: 8,
      alignItems: 'flex-start',
      gap: 6,
    },
    emptyIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.text,
    },
    emptyText: {
      fontSize: 12,
      color: theme.textSecondary,
      lineHeight: 16,
    },
  });

export default PrincipalDoNowInbox;
