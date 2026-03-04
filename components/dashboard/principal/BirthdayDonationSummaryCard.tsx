import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { BirthdayDonationsService } from '@/features/birthday-donations/services/BirthdayDonationsService';
import type { BirthdayDonationDay, BirthdayDonationMonthSummary } from '@/features/birthday-donations/types/birthdayDonations.types';
import { useAuth } from '@/contexts/AuthContext';
import { getOrganizationType } from '@/lib/tenant/compat';
import { assertSupabase } from '@/lib/supabase';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface BirthdayDonationSummaryCardProps {
  organizationId?: string | null;
}

const padDatePart = (value: number) => String(value).padStart(2, '0');
const formatDateKey = (date: Date) => `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;

export const BirthdayDonationSummaryCard: React.FC<BirthdayDonationSummaryCardProps> = ({ organizationId }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { profile } = useAuth();
  const orgType = getOrganizationType(profile);
  const isPreschool = orgType === 'preschool';

  const todayString = useMemo(() => formatDateKey(new Date()), []);
  const isFriday = useMemo(() => new Date().getDay() === 5, []);
  const [daySummary, setDaySummary] = useState<BirthdayDonationDay | null>(null);
  const [monthSummary, setMonthSummary] = useState<BirthdayDonationMonthSummary>({
    totalExpected: 0,
    totalReceived: 0,
    daysWithBirthdays: 0,
  });
  const [todayBirthdaysCount, setTodayBirthdaysCount] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);

  const monthRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      start: formatDateKey(start),
      end: formatDateKey(end),
    };
  }, []);

  const loadSummary = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [day, month, birthdays] = await Promise.all([
        BirthdayDonationsService.getDaySummary(organizationId, todayString),
        BirthdayDonationsService.getMonthSummary(organizationId, monthRange.start, monthRange.end),
        BirthdayDonationsService.getTodayBirthdays(organizationId, todayString),
      ]);
      const { count: studentCount } = await assertSupabase()
        .from('students')
        .select('id', { count: 'exact', head: true })
        .or(`preschool_id.eq.${organizationId},organization_id.eq.${organizationId}`)
        .eq('is_active', true);
      setDaySummary(day);
      setMonthSummary(month);
      setTodayBirthdaysCount(Array.isArray(birthdays) ? birthdays.length : 0);
      setTotalStudents(studentCount || 0);
    } finally {
      setLoading(false);
    }
  }, [organizationId, todayString, monthRange.start, monthRange.end]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const birthdayCountToday = Math.max(daySummary?.birthdayCount ?? 0, todayBirthdaysCount);
  const expectedToday = Math.max(daySummary?.expectedAmount ?? 0, birthdayCountToday * 25);
  const receivedToday = daySummary?.totalReceived ?? 0;
  const displayExpectedToday = Math.max(expectedToday, receivedToday);
  const remainingToday = Math.max(displayExpectedToday - receivedToday, 0);
  const noBirthdaysToday = expectedToday <= 0;

  // Principals typically expect the monthly goal to be "R25 per active student".
  // Some backends compute expected based on birthday-days; keep the larger value so
  // we don't understate the denominator (e.g. R25 instead of R1275 for 51 students).
  const monthExpected = Math.max(monthSummary.totalExpected, totalStudents * 25);
  const monthReceived = monthSummary.totalReceived;
  const displayMonthExpected = Math.max(monthExpected, monthReceived);
  const monthPercentRaw = monthExpected > 0 ? Math.round((monthReceived / monthExpected) * 100) : 0;
  const monthPercent = Math.min(100, monthPercentRaw);

  if (!organizationId) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t('dashboard.birthday_donations.title', { defaultValue: 'Birthday Donations' })}</Text>
        <Text style={styles.muted}>{t('dashboard.birthday_donations.no_org', { defaultValue: 'Connect your school profile to track donations.' })}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('dashboard.birthday_donations.title', { defaultValue: 'Birthday Donations' })}</Text>
      <Text style={styles.subtitle}>{t('dashboard.birthday_donations.principal_subtitle', { defaultValue: 'Track daily and monthly birthday pack contributions.' })}</Text>
      {loading ? (
        <View style={styles.loadingRow}>
          <EduDashSpinner color={theme.primary} />
          <Text style={styles.muted}>{t('common.loading', { defaultValue: 'Loading...' })}</Text>
        </View>
      ) : (
        <>
          <View style={styles.summaryRow}>
            <Text style={styles.label}>{t('dashboard.birthday_donations.today_label', { defaultValue: 'Today' })}</Text>
            <Text style={styles.value}>
              R{receivedToday.toFixed(2)} / R{displayExpectedToday.toFixed(2)}
            </Text>
          </View>
          {noBirthdaysToday ? (
            <Text style={styles.muted}>
              {t('dashboard.birthday_donations.no_birthdays_today', { defaultValue: 'No birthdays today across the school.' })}
            </Text>
          ) : (
            <>
              {isPreschool && isFriday && (
                <Text style={styles.badge}>
                  {t('dashboard.birthday_donations.friday_mode', { defaultValue: 'Friday celebration day' })}
                </Text>
              )}
              <Text style={styles.muted}>{t('dashboard.birthday_donations.remaining', { defaultValue: 'Remaining' })}: R{remainingToday.toFixed(2)}</Text>
            </>
          )}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.label}>{t('dashboard.birthday_donations.month_label', { defaultValue: 'This month' })}</Text>
            <Text style={styles.value}>R{monthReceived.toFixed(2)} / R{displayMonthExpected.toFixed(2)}</Text>
          </View>
          <Text style={styles.muted}>
            {t('dashboard.birthday_donations.month_progress', { defaultValue: '{{percent}}% collected across {{days}} birthday days', percent: monthPercent, days: monthSummary.daysWithBirthdays })}
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.refreshButton} onPress={loadSummary}>
              <Text style={styles.refreshText}>{t('dashboard.birthday_donations.refresh', { defaultValue: 'Refresh' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.manageButton}
              onPress={() => router.push('/screens/birthday-donation-reminders' as any)}
            >
              <Text style={styles.manageButtonText}>
                {t('dashboard.birthday_donations.open_reminders', { defaultValue: 'Open reminders' })}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
  },
  muted: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '600',
    color: theme.primary,
    backgroundColor: theme.primary + '22',
  },
  divider: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 10,
  },
  refreshButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.primary + '15',
  },
  refreshText: {
    fontSize: 12,
    color: theme.primary,
    fontWeight: '600',
  },
  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  manageButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.success + '18',
    borderWidth: 1,
    borderColor: theme.success + '42',
  },
  manageButtonText: {
    fontSize: 12,
    color: theme.success,
    fontWeight: '700',
  },
});
