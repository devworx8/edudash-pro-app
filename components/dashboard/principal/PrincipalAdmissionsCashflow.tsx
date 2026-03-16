import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/contexts/ThemeContext';
import {
  MetricTile,
  MetricInline,
  ProgressBar,
  formatCurrency,
} from './PrincipalMetricComponents';
import { createSectionStyles } from './PrincipalDashboardV2.styles';

export interface PrincipalAdmissionsCashflowProps {
  pendingApplications: number;
  pendingRegistrations: number;
  pendingPayments: number;
  pendingPaymentsAmount?: number;
  pendingPaymentsOverdueAmount?: number;
  pendingPOPs: number;
  pendingApprovalsTotal: number;
  monthlyRevenue?: number | null;
  utilization: number;
  uniformSummary?: {
    paidCount: number;
    pendingCount: number;
    pendingUploads: number;
    totalPaid?: number;
    totalOutstanding?: number;
    pendingUploadAmount?: number;
    totalStudents?: number;
    submittedOrders?: number;
    noOrderCount?: number;
    paidStudentCount?: number;
    pendingStudentCount?: number;
    unpaidStudentCount?: number;
  } | null;
  showUniformSection: boolean;
  onOpenUniforms?: () => void;
  onMessageUnpaid?: () => void;
  onMessageNoOrder?: () => void;
  hideFinancialData?: boolean;
}

export const PrincipalAdmissionsCashflow: React.FC<PrincipalAdmissionsCashflowProps> = ({
  pendingApplications,
  pendingRegistrations,
  pendingPayments,
  pendingPaymentsAmount = 0,
  pendingPaymentsOverdueAmount = 0,
  pendingPOPs,
  pendingApprovalsTotal,
  monthlyRevenue,
  utilization,
  uniformSummary,
  showUniformSection,
  onOpenUniforms,
  onMessageUnpaid,
  onMessageNoOrder,
  hideFinancialData = false,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => createSectionStyles(theme), [theme]);

  return (
    <View style={styles.sectionBody}>
      <Text style={styles.sectionDescriptor}>
        {t('dashboard.section.admissions_cashflow.copy', {
          defaultValue: 'Track new-family pipeline and payment health month by month.',
        })}
      </Text>

      <View style={styles.metricGrid}>
        <MetricTile
          icon="document-text"
          label={t('dashboard.new_applications', { defaultValue: 'Applications' })}
          value={`${pendingApplications}`}
          sublabel={t('dashboard.awaiting_review', { defaultValue: 'Awaiting review' })}
          color={theme.primary}
          theme={theme}
        />
        <MetricTile
          icon="person-add"
          label={t('dashboard.pending_registrations', { defaultValue: 'Registrations' })}
          value={`${pendingRegistrations}`}
          sublabel={t('dashboard.awaiting_payment', { defaultValue: 'Awaiting payment' })}
          color={theme.warning}
          theme={theme}
        />
        {!hideFinancialData ? (
          <MetricTile
            icon="cash"
            label={t('dashboard.unpaid_fees', { defaultValue: 'Unpaid Fees' })}
            value={`${pendingPayments}`}
            sublabel={t('dashboard.overdue', { defaultValue: 'Overdue' })}
            color={theme.error}
            theme={theme}
          />
        ) : null}
        {!hideFinancialData ? (
          <MetricTile
            icon="card"
            label={t('dashboard.payment_proofs', { defaultValue: 'POPs' })}
            value={`${pendingPOPs}`}
            sublabel={t('dashboard.to_verify', { defaultValue: 'To verify' })}
            color={theme.info}
            theme={theme}
          />
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.inlineSectionTitle}>
          {hideFinancialData
            ? t('dashboard.admissions_snapshot', { defaultValue: 'Admissions Snapshot' })
            : t('dashboard.money_summary', { defaultValue: 'Finance Snapshot' })}
        </Text>
        {!hideFinancialData ? (
          <MetricInline
            label={t('dashboard.money_received', { defaultValue: 'Collected' })}
            value={formatCurrency(monthlyRevenue)}
            theme={theme}
          />
        ) : null}
        {!hideFinancialData ? (
          <MetricInline
            label={t('dashboard.money_owed', { defaultValue: 'Outstanding' })}
            value={
              pendingPaymentsAmount > 0
                ? `${formatCurrency(pendingPaymentsAmount)} • ${pendingPayments}`
                : `${pendingPayments}`
            }
            theme={theme}
          />
        ) : null}
        {!hideFinancialData ? (
          <MetricInline
            label={t('dashboard.overdue', { defaultValue: 'Overdue' })}
            value={formatCurrency(pendingPaymentsOverdueAmount)}
            theme={theme}
          />
        ) : null}
        <MetricInline
          label={t('dashboard.pending_approvals', { defaultValue: 'Pending Approvals' })}
          value={`${pendingApprovalsTotal}`}
          theme={theme}
        />
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>
            {t('dashboard.capacity_usage', { defaultValue: 'Capacity Usage' })}
          </Text>
          <Text style={styles.progressValue}>{utilization}%</Text>
        </View>
        <ProgressBar
          progress={Math.min(Math.max(utilization / 100, 0), 1)}
          color={theme.primary}
          trackColor={theme.border}
        />
      </View>

      {showUniformSection && (
        <View style={styles.card}>
          <Text style={styles.inlineSectionTitle}>
            {t('dashboard.uniform_collections', { defaultValue: 'Uniform Collections' })}
          </Text>
          <Text style={styles.uniformNote}>
            {t('dashboard.uniform_collections_note', {
                  defaultValue:
                    'Uniform payments are tracked separately from school revenue.',
                })}
          </Text>
          <MetricInline
            label={t('dashboard.uniform_paid', { defaultValue: 'Paid (Uniforms)' })}
            value={`${formatCurrency(uniformSummary?.totalPaid || 0)} • ${uniformSummary?.paidStudentCount || 0} students`}
            theme={theme}
          />
          <MetricInline
            label={t('dashboard.uniform_outstanding', { defaultValue: 'Outstanding' })}
            value={`${formatCurrency(uniformSummary?.totalOutstanding || 0)} • ${((uniformSummary?.unpaidStudentCount || 0) + (uniformSummary?.pendingStudentCount || 0))} students`}
            theme={theme}
          />
          <MetricInline
            label={t('dashboard.uniform_no_order', { defaultValue: 'No Order Submitted' })}
            value={`${uniformSummary?.noOrderCount || 0} students`}
            theme={theme}
          />
          <MetricInline
            label={t('dashboard.uniform_pending_pops', { defaultValue: 'Pending POPs' })}
            value={
              uniformSummary?.pendingUploadAmount
                ? `${uniformSummary?.pendingUploads || 0} pending (${formatCurrency(uniformSummary.pendingUploadAmount)})`
                : `${uniformSummary?.pendingUploads || 0} pending`
            }
            theme={theme}
          />

          <View style={styles.uniformBreakdownRow}>
            <View style={[styles.uniformStatusPill, styles.uniformPaidPill]}>
              <Text style={styles.uniformStatusPillText}>
                {t('dashboard.uniform_status_paid', { defaultValue: 'Paid' })}: {uniformSummary?.paidStudentCount || 0}
              </Text>
            </View>
            <View style={[styles.uniformStatusPill, styles.uniformPendingPill]}>
              <Text style={styles.uniformStatusPillText}>
                {t('dashboard.uniform_status_pending', { defaultValue: 'Pending' })}: {uniformSummary?.pendingStudentCount || 0}
              </Text>
            </View>
            <View style={[styles.uniformStatusPill, styles.uniformUnpaidPill]}>
              <Text style={styles.uniformStatusPillText}>
                {t('dashboard.uniform_status_unpaid', { defaultValue: 'Unpaid' })}: {uniformSummary?.unpaidStudentCount || 0}
              </Text>
            </View>
          </View>

          <View style={styles.uniformActionsRow}>
            <TouchableOpacity style={[styles.uniformActionButton, styles.uniformActionPrimary]} onPress={onOpenUniforms}>
              <Text style={styles.uniformActionPrimaryText}>
                {t('dashboard.uniform_open_hub', { defaultValue: 'Open Uniform Hub' })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.uniformActionButton}
              onPress={onMessageUnpaid}
              disabled={!onMessageUnpaid || (uniformSummary?.unpaidStudentCount || 0) === 0}
            >
              <Text style={styles.uniformActionText}>
                {t('dashboard.uniform_message_unpaid', { defaultValue: 'Message Unpaid' })} ({uniformSummary?.unpaidStudentCount || 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.uniformActionButton}
              onPress={onMessageNoOrder}
              disabled={!onMessageNoOrder || (uniformSummary?.noOrderCount || 0) === 0}
            >
              <Text style={styles.uniformActionText}>
                {t('dashboard.uniform_message_no_order', { defaultValue: 'Message No Order' })} ({uniformSummary?.noOrderCount || 0})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

export default PrincipalAdmissionsCashflow;
