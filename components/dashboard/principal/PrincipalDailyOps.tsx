import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/contexts/ThemeContext';
import { OperationRow, InfoRow } from './PrincipalMetricComponents';
import { createSectionStyles } from './PrincipalDashboardV2.styles';

export interface PrincipalDailyOpsProps {
  attendancePresent: number;
  totalStudents: number;
  attendanceRate: number;
  totalTeachers: number;
  urgentCount: number;
  pendingPayments: number;
  pendingPOPs: number;
  pendingApprovalsTotal: number;
  pendingReports: number;
}

export const PrincipalDailyOps: React.FC<PrincipalDailyOpsProps> = ({
  attendancePresent,
  totalStudents,
  attendanceRate,
  totalTeachers,
  urgentCount,
  pendingPayments,
  pendingPOPs,
  pendingApprovalsTotal,
  pendingReports,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => createSectionStyles(theme), [theme]);

  return (
    <View style={styles.sectionBody}>
      <Text style={styles.sectionDescriptor}>
        {t('dashboard.section.daily_ops.copy', {
          defaultValue: 'Keep attendance, staffing, and safety on track for the day.',
        })}
      </Text>

      <View style={styles.card}>
        <OperationRow
          icon="checkmark-circle"
          label={t('dashboard.attendance_rate', { defaultValue: 'Attendance' })}
          value={`${attendancePresent}/${totalStudents}`}
          detail={`${attendanceRate.toFixed(0)}% ${t('dashboard.attendance_avg', { defaultValue: 'average' })}`}
          color={theme.info}
          theme={theme}
        />
        <OperationRow
          icon="people"
          label={t('dashboard.staff_coverage', { defaultValue: 'Staff Coverage' })}
          value={`${totalTeachers}`}
          detail={t('dashboard.staff_active', { defaultValue: 'Active staff' })}
          color={theme.success}
          theme={theme}
        />
        <OperationRow
          icon="alert-circle"
          label={t('dashboard.urgent_items', { defaultValue: 'Urgent Items' })}
          value={`${urgentCount}`}
          detail={t('dashboard.urgent_items_detail', {
            defaultValue: '{{payments}} payments • {{pops}} POPs • {{approvals}} approvals',
            payments: pendingPayments,
            pops: pendingPOPs,
            approvals: pendingApprovalsTotal,
          })}
          color={theme.error}
          theme={theme}
        />
      </View>

      <View style={styles.card}>
        <InfoRow
          icon="medkit"
          label={t('dashboard.medical_alerts', { defaultValue: 'Medical Alerts' })}
          value={t('dashboard.no_alerts', { defaultValue: 'None today' })}
          tone="muted"
          theme={theme}
        />
        <InfoRow
          icon="alert"
          label={t('dashboard.incident_reports', { defaultValue: 'Pending Reports' })}
          value={`${pendingReports}`}
          tone={pendingReports > 0 ? 'warning' : 'success'}
          theme={theme}
        />
        <InfoRow
          icon="document"
          label={t('dashboard.expiring_docs', { defaultValue: 'Expiring Documents' })}
          value={t('dashboard.none_due', { defaultValue: 'None due' })}
          tone="muted"
          theme={theme}
        />
      </View>
    </View>
  );
};

export default PrincipalDailyOps;
