import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, pickSectionError } from '@/hooks/useFinanceControlCenter';
import { clampPercent, percentWidth } from '@/lib/progress/clampPercent';
import type { FinanceControlCenterBundle } from '@/types/finance';

interface FinanceOverviewTabProps {
  bundle: FinanceControlCenterBundle | null;
  snapshot: FinanceControlCenterBundle['snapshot'] | null;
  derivedOverview: {
    due: number;
    collected: number;
    collectedAllocated: number;
    collectedSource: string;
    outstanding: number;
    expenses: number;
    pettyCashExpenses: number;
    financialExpenses: number;
    expenseEntries: number;
    netAfterExpenses: number;
    pendingAmount: number;
    overdueAmount: number;
    pendingStudents: number;
    overdueStudents: number;
    pendingCount: number;
    overdueCount: number;
    pendingPOPs: number;
    prepaid: number;
    payrollDue: number;
    payrollPaid: number;
    kpiCorrelated: boolean;
    kpiDelta: number;
    allocationGap: number;
    snapshotAsOf: string | null;
  };
  monthLabel: string;
  theme: any;
  styles: any;
  renderSectionError: (message: string | null) => React.ReactNode;
}

export function FinanceOverviewTab({
  bundle,
  snapshot,
  derivedOverview,
  monthLabel,
  theme,
  styles,
  renderSectionError,
}: FinanceOverviewTabProps) {
  const collectionRate = derivedOverview.due > 0
    ? Math.round((derivedOverview.collected / derivedOverview.due) * 100)
    : 0;
  const collectionPercent = clampPercent(collectionRate, { source: 'FinanceOverviewTab.collectionRate' });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{monthLabel} — At a Glance</Text>
      {renderSectionError(pickSectionError(bundle?.errors, 'snapshot'))}
      {renderSectionError(pickSectionError(bundle?.errors, 'expenses'))}

      {/* Hero: Expected vs Collected */}
      <View
        style={[
          styles.metricCard,
          {
            width: '100%',
            borderLeftWidth: 4,
            borderLeftColor: theme.primary,
            marginBottom: 16,
            paddingHorizontal: 16,
            paddingVertical: 14,
          },
        ]}
      >
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.metricLabel, { fontSize: 14, marginBottom: 4 }]}>Expected Income</Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.metricValue, { fontSize: 34, lineHeight: 40 }]}
          >
            {formatCurrency(derivedOverview.due)}
          </Text>
        </View>
        <View style={{ height: 1, backgroundColor: theme.border + 'AA', marginBottom: 12 }} />
        <View style={{ marginBottom: 10 }}>
          <Text style={[styles.metricLabel, { fontSize: 14, marginBottom: 4 }]}>Collected</Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.metricValue, { fontSize: 34, lineHeight: 40, color: theme.success }]}
          >
            {formatCurrency(derivedOverview.collected)}
          </Text>
        </View>
        <View style={{ height: 10, backgroundColor: theme.border, borderRadius: 6, overflow: 'hidden', marginTop: 2 }}>
          <View
            style={{
              width: percentWidth(collectionPercent),
              height: '100%',
              backgroundColor:
                collectionPercent >= 80
                  ? theme.success
                  : collectionPercent >= 50
                    ? theme.warning || '#F59E0B'
                    : theme.error,
              borderRadius: 6,
            }}
          />
        </View>
        <Text style={[styles.metricLabel, { marginTop: 8, marginBottom: 0, textAlign: 'right', fontSize: 13 }]}>
          {collectionPercent}% collected
        </Text>
      </View>

      {/* Key numbers grid */}
      <View style={styles.cardGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Outstanding</Text>
          <Text style={[styles.metricValue, { color: theme.error }]}>{formatCurrency(derivedOverview.outstanding)}</Text>
          <Text style={[styles.metricLabel, { fontSize: 11, marginTop: 2 }]}>{derivedOverview.pendingStudents + derivedOverview.overdueStudents} families</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Overdue</Text>
          <Text style={[styles.metricValue, { color: '#EF4444' }]}>{formatCurrency(derivedOverview.overdueAmount)}</Text>
          <Text style={[styles.metricLabel, { fontSize: 11, marginTop: 2 }]}>{derivedOverview.overdueStudents} families</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Pending POPs</Text>
          <Text style={[styles.metricValue, { color: theme.warning || '#F59E0B' }]}>{derivedOverview.pendingPOPs}</Text>
          <Text style={[styles.metricLabel, { fontSize: 11, marginTop: 2 }]}>to verify</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Net Income</Text>
          <Text style={[styles.metricValue, { color: derivedOverview.netAfterExpenses >= 0 ? theme.success : theme.error }]}>
            {formatCurrency(derivedOverview.netAfterExpenses)}
          </Text>
          <Text style={[styles.metricLabel, { fontSize: 11, marginTop: 2 }]}>after expenses</Text>
        </View>
      </View>

      {snapshot && !derivedOverview.kpiCorrelated && (
        <View style={styles.errorCard}>
          <Ionicons name="analytics-outline" size={16} color={theme.warning || '#F59E0B'} />
          <Text style={styles.errorText}>
            KPI variance: {formatCurrency(derivedOverview.kpiDelta)} difference detected.
          </Text>
        </View>
      )}

      {/* Receivables summary */}
      <View style={styles.calloutCard}>
        <Text style={styles.calloutTitle}>Receivables Summary</Text>
        <Text style={styles.calloutText}>
          {derivedOverview.pendingStudents} pending ({derivedOverview.pendingCount} fees) · {derivedOverview.overdueStudents} overdue ({derivedOverview.overdueCount} fees)
        </Text>
      </View>

      {/* Payroll and expenses */}
      <View style={styles.calloutCard}>
        <Text style={styles.calloutTitle}>Payroll</Text>
        <Text style={styles.calloutText}>
          Due {formatCurrency(derivedOverview.payrollDue)} · Paid {formatCurrency(derivedOverview.payrollPaid)}
        </Text>
      </View>

      <View style={styles.calloutCard}>
        <Text style={styles.calloutTitle}>Expenses</Text>
        <Text style={styles.calloutText}>
          Petty cash {formatCurrency(derivedOverview.pettyCashExpenses)} · Logged {formatCurrency(derivedOverview.financialExpenses)} · {derivedOverview.expenseEntries} entries
        </Text>
      </View>

      {snapshot && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            Data scoped to {monthLabel} as of {new Date(derivedOverview.snapshotAsOf || Date.now()).toLocaleDateString('en-ZA')}.
          </Text>
        </View>
      )}
    </View>
  );
}
