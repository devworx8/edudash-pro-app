/**
 * Teacher Timetable Screen
 *
 * Teachers can view their weekly class timetable (read-only).
 * Shows day-of-week tabbed view with Print and Save to PDF.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { assertSupabase } from '@/lib/supabase';
import { fetchTeacherClassIds } from '@/lib/dashboard/fetchTeacherClassIds';
import { logger } from '@/lib/logger';

interface TimetableSlot {
  id: string;
  class_id: string | null;
  teacher_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string | null;
  activity_type: string;
  room: string | null;
  notes: string | null;
  class_name?: string;
  teacher_name?: string;
}

const DAYS: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};
const WEEKDAYS = [1, 2, 3, 4, 5];

export default function TeacherTimetableScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const { showAlert, AlertModalComponent } = useAlertModal();
  const styles = createStyles(theme);
  const organizationId = extractOrganizationId(profile);
  const userId = user?.id ?? (profile as { auth_user_id?: string })?.auth_user_id;

  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay() || 1);
  const [exporting, setExporting] = useState(false);

  const fetchSlots = useCallback(async () => {
    if (!organizationId || !userId) return;
    try {
      const supabase = assertSupabase();
      // Get teacher's assigned class IDs (lead + assistant)
      const classIds = await fetchTeacherClassIds(userId, organizationId);
      // Show slots where teacher_id matches OR class_id is in assigned classes
      const orFilters = [`teacher_id.eq.${userId}`];
      if (classIds.length > 0) {
        orFilters.push(`class_id.in.(${classIds.join(',')})`);
      }
      const { data, error } = await supabase
        .from('timetable_slots')
        .select('*')
        .eq('school_id', organizationId)
        .or(orFilters.join(','))
        .order('start_time', { ascending: true });

      if (error) throw error;
      setSlots((data as TimetableSlot[]) || []);
    } catch (err) {
      logger.error('[TeacherTimetable]', 'Failed to load slots', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, userId]);

  useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchSlots();
  }, [fetchSlots]);

  const daySlots = slots.filter((s) => s.day_of_week === selectedDay);

  const handlePrint = useCallback(async () => {
    setExporting(true);
    try {
      const html = buildTimetableHTML(slots, selectedDay, 'My Weekly Timetable');
      await Print.printAsync({ html });
    } catch (err) {
      logger.error('[TeacherTimetable]', 'Print failed', err);
      showAlert({ title: 'Print failed', message: 'Could not open print dialog. Please try again.' });
    } finally {
      setExporting(false);
    }
  }, [slots, selectedDay]);

  const handleSavePDF = useCallback(async () => {
    setExporting(true);
    try {
      const html = buildTimetableHTML(slots, selectedDay, 'My Weekly Timetable');
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const filename = `timetable-${new Date().toISOString().slice(0, 10)}.pdf`;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Save ${filename}`,
        });
      } else {
        showAlert({ title: 'Saved', message: `PDF saved as ${filename}` });
      }
    } catch (err) {
      logger.error('[TeacherTimetable]', 'PDF export failed', err);
      showAlert({ title: 'Export failed', message: 'Could not save PDF. Please try again.' });
    } finally {
      setExporting(false);
    }
  }, [slots, selectedDay]);

  if (loading) {
    return (
      <DesktopLayout role="teacher" title="My Timetable">
        <Stack.Screen options={{ title: 'My Timetable', headerShown: false }} />
        <View style={styles.center}>
          <EduDashSpinner />
        </View>
      </DesktopLayout>
    );
  }

  return (
    <DesktopLayout role="teacher" title="My Timetable">
      <Stack.Screen options={{ title: 'My Timetable', headerShown: false }} />
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>My Weekly Timetable</Text>
            <Text style={styles.subtitle}>Your class schedule</Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, exporting && styles.actionBtnDisabled]}
              onPress={handlePrint}
              disabled={exporting}
            >
              <Ionicons name="print-outline" size={20} color={theme.primary} />
              <Text style={styles.actionBtnText}>Print</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, exporting && styles.actionBtnDisabled]}
              onPress={handleSavePDF}
              disabled={exporting}
            >
              <Ionicons name="document-outline" size={20} color={theme.primary} />
              <Text style={styles.actionBtnText}>Save PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabs}>
          {WEEKDAYS.map((day) => (
            <TouchableOpacity
              key={day}
              style={[styles.dayTab, selectedDay === day && styles.dayTabActive]}
              onPress={() => setSelectedDay(day)}
            >
              <Text style={[styles.dayTabText, selectedDay === day && styles.dayTabTextActive]}>
                {DAYS[day] ?? `Day ${day}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {daySlots.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={theme.textSecondary} />
            <Text style={styles.emptyText}>No classes scheduled for {DAYS[selectedDay] ?? `Day ${selectedDay}`}</Text>
          </View>
        ) : (
          daySlots.map((slot) => (
            <View key={slot.id} style={styles.slotCard}>
              <View style={styles.slotTime}>
                <Text style={styles.timeText}>{slot.start_time?.slice(0, 5)}</Text>
                <Text style={styles.timeSeparator}>–</Text>
                <Text style={styles.timeText}>{slot.end_time?.slice(0, 5)}</Text>
              </View>
              <View style={styles.slotInfo}>
                <Text style={styles.slotSubject}>{slot.subject || slot.activity_type}</Text>
                {slot.room && <Text style={styles.slotDetail}>📍 {slot.room}</Text>}
              </View>
            </View>
          ))
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
      <AlertModalComponent />
    </DesktopLayout>
  );
}

function buildTimetableHTML(slots: TimetableSlot[], selectedDay: number, title: string): string {
  const daySlots = slots.filter((s) => s.day_of_week === selectedDay);
  const dayName = DAYS[selectedDay] ?? `Day ${selectedDay}`;
  const rows = daySlots
    .map(
      (s) =>
        `<tr><td>${s.start_time?.slice(0, 5) || ''} – ${s.end_time?.slice(0, 5) || ''}</td><td>${s.subject || s.activity_type || ''}</td><td>${s.room || '-'}</td></tr>`
    )
    .join('');
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;color:#333}
h1{font-size:20px;margin-bottom:4px}
.sub{font-size:12px;color:#666;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ddd;padding:10px;text-align:left}
th{background:#f5f5f5;font-weight:600}
.footer{font-size:11px;color:#999;margin-top:24px}
</style>
</head>
<body>
<h1>${title}</h1>
<p class="sub">${dayName} • Generated ${new Date().toLocaleDateString()}</p>
<table>
<thead><tr><th>Time</th><th>Subject / Activity</th><th>Room</th></tr></thead>
<tbody>${rows || '<tr><td colspan="3">No classes scheduled</td></tr>'}</tbody>
</table>
<p class="footer">EduDash Pro</p>
</body>
</html>`;
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, padding: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    heading: { fontSize: 22, fontWeight: '700', color: theme.text, marginBottom: 4 },
    subtitle: { fontSize: 14, color: theme.textSecondary, marginBottom: 16 },
    actions: { flexDirection: 'row', gap: 12 },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    actionBtnDisabled: { opacity: 0.5 },
    actionBtnText: { fontSize: 14, fontWeight: '600', color: theme.primary },
    dayTabs: { flexDirection: 'row', marginBottom: 16 },
    dayTab: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 999,
      backgroundColor: theme.cardBackground || theme.surface,
      marginRight: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    dayTabActive: { backgroundColor: `${theme.primary}15`, borderColor: theme.primary },
    dayTabText: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
    dayTabTextActive: { color: theme.primary },
    emptyState: { alignItems: 'center', paddingVertical: 48 },
    emptyText: { fontSize: 16, fontWeight: '600', color: theme.text, marginTop: 12 },
    slotCard: {
      flexDirection: 'row',
      backgroundColor: theme.cardBackground || theme.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    slotTime: { width: 70, alignItems: 'center', justifyContent: 'center' },
    timeText: { fontSize: 13, fontWeight: '700', color: theme.primary },
    timeSeparator: { fontSize: 11, color: theme.textSecondary },
    slotInfo: { flex: 1, marginLeft: 12 },
    slotSubject: { fontSize: 15, fontWeight: '600', color: theme.text },
    slotDetail: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
  });
