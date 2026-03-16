/**
 * Principal School Pulse
 *
 * Fast, at-a-glance snapshot for non-technical principals.
 * Keeps language simple and links directly to the relevant screens.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';

import { useTheme } from '@/contexts/ThemeContext';
import { useNotificationCounts } from '@/contexts/NotificationContext';
import type { SchoolStats } from '@/hooks/usePrincipalHub';

type PulseTone = 'neutral' | 'good' | 'warn' | 'bad';

function toneForCount(count: number): PulseTone {
  if (count <= 0) return 'good';
  if (count <= 2) return 'warn';
  return 'bad';
}

function toneForAttendance(attendanceRate: number): PulseTone {
  if (attendanceRate >= 90) return 'good';
  if (attendanceRate >= 80) return 'warn';
  return 'bad';
}

function toneColor(theme: any, tone: PulseTone): string {
  switch (tone) {
    case 'good':
      return theme.success || '#10B981';
    case 'warn':
      return theme.warning || '#F59E0B';
    case 'bad':
      return theme.error || '#EF4444';
    case 'neutral':
    default:
      return theme.primary || '#6366F1';
  }
}

function isDarkHex(hex: string): boolean {
  const match = String(hex || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return false;
  const value = match[1];
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.55;
}

export interface PrincipalSchoolPulseProps {
  stats?: SchoolStats | null;
  hideFinanceTiles?: boolean;
  attendancePresent?: number;
}

export const PrincipalSchoolPulse: React.FC<PrincipalSchoolPulseProps> = ({ stats, hideFinanceTiles = false, attendancePresent: attendancePresentProp }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const counts = useNotificationCounts();
  const { width } = useWindowDimensions();
  const isTablet = width > 768;
  const isSmallScreen = width < 380;
  const styles = useMemo(() => createStyles(theme, width), [theme, width]);

  const totalStudents = stats?.students?.total ?? 0;
  const attendanceRate = Number(stats?.attendanceRate?.percentage ?? 0);
  const attendancePresent = attendancePresentProp ?? (totalStudents > 0 ? Math.round((attendanceRate / 100) * totalStudents) : 0);

  const unpaidFees = stats?.pendingPayments?.total ?? 0;
  const popPending = stats?.pendingPOPUploads?.total ?? 0;
  const unreadMessages = counts.messages ?? 0;

  const tiles = useMemo(
    () => [
      {
        id: 'attendance',
        icon: 'checkmark-circle',
        label: t('dashboard.attendance', { defaultValue: 'Attendance' }),
        value: `${attendanceRate.toFixed(0)}%`,
        caption:
          totalStudents > 0
            ? t('dashboard.attendance_present_out_of', {
                defaultValue: '{{present}}/{{total}} present',
                present: attendancePresent,
                total: totalStudents,
              })
            : t('dashboard.attendance_no_students', { defaultValue: 'No students yet' }),
        tone: toneForAttendance(attendanceRate),
        route: '/screens/attendance',
      },
      {
        id: 'messages',
        icon: 'chatbubbles',
        label: t('dashboard.messages', { defaultValue: 'Messages' }),
        value:
          unreadMessages > 0
            ? t('dashboard.unread_count', { defaultValue: '{{count}} unread', count: unreadMessages })
            : t('dashboard.all_caught_up', { defaultValue: 'All caught up' }),
        caption: t('dashboard.open_inbox', { defaultValue: 'Open inbox' }),
        tone: toneForCount(unreadMessages),
        route: '/screens/principal-messages',
      },
      ...(!hideFinanceTiles ? [
        {
          id: 'fees',
          icon: 'cash',
          label: t('dashboard.unpaid_fees', { defaultValue: 'Unpaid Fees' }),
          value: unpaidFees > 0 ? String(unpaidFees) : t('common.none', { defaultValue: 'None' }),
          caption: t('dashboard.review_fees', { defaultValue: 'Review fees' }),
          tone: toneForCount(unpaidFees),
          route: '/screens/finance-control-center?tab=receivables',
        },
        {
          id: 'pops',
          icon: 'document-text',
          label: t('dashboard.payment_proofs', { defaultValue: 'Proof of Payment' }),
          value: popPending > 0 ? String(popPending) : t('common.none', { defaultValue: 'None' }),
          caption: t('dashboard.verify_pops', { defaultValue: 'Verify uploads' }),
          tone: toneForCount(popPending),
          route: '/screens/pop-review',
        },
      ] : []),
    ],
    [
      attendancePresent,
      attendanceRate,
      hideFinanceTiles,
      popPending,
      t,
      totalStudents,
      unpaidFees,
      unreadMessages,
    ]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('dashboard.school_pulse', { defaultValue: 'School Pulse' })}</Text>
      <Text style={styles.subtitle}>
        {t('dashboard.school_pulse_hint', { defaultValue: 'Today at a glance' })}
      </Text>

      <View style={styles.grid}>
        {tiles.map((tile) => {
          const color = toneColor(theme, tile.tone);
          return (
            <TouchableOpacity
              key={tile.id}
              style={[styles.tile, { borderLeftColor: color }]}
              activeOpacity={0.85}
              onPress={() => router.push(tile.route as any)}
            >
              <View style={[styles.iconWrap, { backgroundColor: `${color}18` }]}>
                <Ionicons name={tile.icon as any} size={isSmallScreen ? 18 : 20} color={color} />
              </View>
              <View style={styles.textWrap}>
                <Text style={styles.label} numberOfLines={1}>
                  {tile.label}
                </Text>
                <Text style={styles.value} numberOfLines={1}>
                  {tile.value}
                </Text>
                <Text style={styles.caption} numberOfLines={1}>
                  {tile.caption}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary || theme.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const createStyles = (theme: any, windowWidth: number) => {
  const isTablet = windowWidth > 768;
  const isSmallScreen = windowWidth < 380;
  const gap = isTablet ? 12 : isSmallScreen ? 8 : 10;
  const isDark = isDarkHex(theme?.background);
  const tileBackground = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.72)';
  const tileBorder = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.92)';
  return StyleSheet.create({
    container: {
      marginTop: 10,
      marginBottom: 8,
    },
    title: {
      fontSize: isTablet ? 18 : 16,
      fontWeight: '800',
      color: theme.text,
      paddingHorizontal: 4,
    },
    subtitle: {
      marginTop: 4,
      marginBottom: 10,
      fontSize: 12,
      color: theme.textSecondary,
      paddingHorizontal: 4,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap,
    },
    tile: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: tileBackground,
      borderRadius: 16,
      padding: isSmallScreen ? 12 : 14,
      borderWidth: 1,
      borderColor: tileBorder,
      borderLeftWidth: 4,
      width: isTablet ? '49%' : '100%',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 16,
      elevation: 4,
    },
    iconWrap: {
      width: isSmallScreen ? 36 : 40,
      height: isSmallScreen ? 36 : 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    textWrap: {
      flex: 1,
      minWidth: 0,
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
      marginBottom: 2,
    },
    value: {
      fontSize: isSmallScreen ? 16 : 18,
      fontWeight: '900',
      color: theme.text,
      marginBottom: 2,
    },
    caption: {
      fontSize: 12,
      color: theme.textTertiary || theme.textSecondary,
    },
  });
};

export default PrincipalSchoolPulse;
