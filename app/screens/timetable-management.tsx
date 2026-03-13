/**
 * Timetable Management Screen
 *
 * Principals can view and manage weekly class timetables.
 * Shows a day-of-week tabbed view with time slots.
 * Supports both preschool (ECD) and K-12 activity types with
 * period numbering and color-coded slot display.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { assertSupabase } from '@/lib/supabase';
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
  period_number?: number | null;
  is_break?: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri

const ACTIVITY_TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  lesson:      { bg: '#3B82F620', text: '#3B82F6', label: 'Lesson' },
  break:       { bg: '#F59E0B20', text: '#F59E0B', label: 'Break' },
  assembly:    { bg: '#8B5CF620', text: '#8B5CF6', label: 'Assembly' },
  sports:      { bg: '#10B98120', text: '#10B981', label: 'Sports' },
  study:       { bg: '#6366F120', text: '#6366F1', label: 'Study' },
  free_period: { bg: '#94A3B820', text: '#94A3B8', label: 'Free Period' },
  activity:    { bg: '#EC489920', text: '#EC4899', label: 'Activity' },
  outdoor:     { bg: '#14B8A620', text: '#14B8A6', label: 'Outdoor' },
  meal:        { bg: '#F9731620', text: '#F97316', label: 'Meal' },
  nap:         { bg: '#A78BFA20', text: '#A78BFA', label: 'Nap' },
  other:       { bg: '#71717A20', text: '#71717A', label: 'Other' },
};

function getActivityColor(activityType: string) {
  return ACTIVITY_TYPE_COLORS[activityType] || ACTIVITY_TYPE_COLORS.other;
}

interface NewSlotForm {
  subject: string;
  activityType: string;
  startTime: string;
  endTime: string;
  room: string;
  notes: string;
  periodNumber: string;
  isBreak: boolean;
}

const DEFAULT_NEW_SLOT_FORM: NewSlotForm = {
  subject: '',
  activityType: 'lesson',
  startTime: '08:00',
  endTime: '08:30',
  room: '',
  notes: '',
  periodNumber: '',
  isBreak: false,
};

export default function TimetableManagementScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const styles = createStyles(theme);
  const organizationId = extractOrganizationId(profile);

  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay() || 1);
  const [exporting, setExporting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingSlot, setCreatingSlot] = useState(false);
  const [newSlotForm, setNewSlotForm] = useState<NewSlotForm>(DEFAULT_NEW_SLOT_FORM);

  const fetchSlots = useCallback(async () => {
    if (!organizationId) return;
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('timetable_slots')
        .select('*')
        .eq('school_id', organizationId)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setSlots((data as TimetableSlot[]) || []);
    } catch (err) {
      logger.error('[Timetable]', 'Failed to load slots', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSlots();
  }, [fetchSlots]);

  const daySlots = slots.filter((s) => s.day_of_week === selectedDay);

  const buildTimetableHTML = useCallback(() => {
    const rows = daySlots
      .map(
        (s) =>
          `<tr><td>${s.start_time?.slice(0, 5) || ''} – ${s.end_time?.slice(0, 5) || ''}</td><td>${s.subject || s.activity_type || ''}</td><td>${s.room || '-'}</td></tr>`
      )
      .join('');
    const dayName = DAYS[selectedDay] ?? `Day ${selectedDay}`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Weekly Timetable</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#333}h1{font-size:20px;margin-bottom:4px}
.sub{font-size:12px;color:#666;margin-bottom:16px}table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ddd;padding:10px;text-align:left}th{background:#f5f5f5;font-weight:600}
.footer{font-size:11px;color:#999;margin-top:24px}</style></head><body>
<h1>Weekly Timetable</h1><p class="sub">${dayName} • Generated ${new Date().toLocaleDateString()}</p>
<table><thead><tr><th>Time</th><th>Subject / Activity</th><th>Room</th></tr></thead>
<tbody>${rows || '<tr><td colspan="3">No classes scheduled</td></tr>'}</tbody></table>
<p class="footer">EduDash Pro</p></body></html>`;
  }, [daySlots, selectedDay]);

  const handlePrint = useCallback(async () => {
    setExporting(true);
    try {
      await Print.printAsync({ html: buildTimetableHTML() });
    } catch (err) {
      logger.error('[Timetable]', 'Print failed', err);
      showAlert({ title: 'Print failed', message: 'Could not open print dialog. Please try again.', type: 'error' });
    } finally {
      setExporting(false);
    }
  }, [buildTimetableHTML]);

  const handleSavePDF = useCallback(async () => {
    setExporting(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: buildTimetableHTML(), base64: false });
      const filename = `timetable-${new Date().toISOString().slice(0, 10)}.pdf`;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Save ${filename}` });
      } else {
        showAlert({ title: 'Saved', message: `PDF saved as ${filename}`, type: 'success' });
      }
    } catch (err) {
      logger.error('[Timetable]', 'PDF export failed', err);
      showAlert({ title: 'Export failed', message: 'Could not save PDF. Please try again.', type: 'error' });
    } finally {
      setExporting(false);
    }
  }, [buildTimetableHTML]);

  const openCreateModal = useCallback(() => {
    setNewSlotForm(DEFAULT_NEW_SLOT_FORM);
    setShowCreateModal(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    if (creatingSlot) return;
    setShowCreateModal(false);
  }, [creatingSlot]);

  const upsertForm = useCallback((patch: Partial<NewSlotForm>) => {
    setNewSlotForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleCreateSlot = useCallback(async () => {
    if (!organizationId) {
      showAlert({ title: 'Missing school', message: 'Could not determine your school. Please sign in again.', type: 'error' });
      return;
    }

    const trimmedSubject = newSlotForm.subject.trim();
    const trimmedRoom = newSlotForm.room.trim();
    const trimmedNotes = newSlotForm.notes.trim();
    const activityType = newSlotForm.activityType.trim() || 'lesson';
    const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timePattern.test(newSlotForm.startTime) || !timePattern.test(newSlotForm.endTime)) {
      showAlert({ title: 'Invalid time', message: 'Use 24-hour format HH:MM (for example 08:30).', type: 'warning' });
      return;
    }
    if (newSlotForm.endTime <= newSlotForm.startTime) {
      showAlert({ title: 'Invalid range', message: 'End time must be after start time.', type: 'warning' });
      return;
    }

    const parsedPeriod = newSlotForm.periodNumber.trim()
      ? Number.parseInt(newSlotForm.periodNumber.trim(), 10)
      : null;
    if (newSlotForm.periodNumber.trim() && (!Number.isFinite(parsedPeriod) || parsedPeriod <= 0)) {
      showAlert({ title: 'Invalid period', message: 'Period number must be a positive number.', type: 'warning' });
      return;
    }

    setCreatingSlot(true);
    try {
      const supabase = assertSupabase();
      const { error } = await supabase.from('timetable_slots').insert({
        school_id: organizationId,
        day_of_week: selectedDay,
        start_time: newSlotForm.startTime,
        end_time: newSlotForm.endTime,
        subject: trimmedSubject || null,
        activity_type: activityType,
        room: trimmedRoom || null,
        notes: trimmedNotes || null,
        period_number: parsedPeriod,
        is_break: newSlotForm.isBreak,
      });

      if (error) throw error;

      setShowCreateModal(false);
      await fetchSlots();
      showAlert({ title: 'Added', message: `Timetable slot created for ${DAYS[selectedDay]}.`, type: 'success' });
    } catch (err) {
      logger.error('[Timetable]', 'Failed to create slot', err);
      showAlert({ title: 'Create failed', message: 'Could not create the timetable slot. Please try again.', type: 'error' });
    } finally {
      setCreatingSlot(false);
    }
  }, [fetchSlots, newSlotForm, organizationId, selectedDay]);

  if (loading) {
    return (
      <DesktopLayout role="principal" title="Timetable">
        <Stack.Screen options={{ title: 'Timetable', headerShown: false }} />
        <View style={styles.center}><EduDashSpinner /></View>
      </DesktopLayout>
    );
  }

  return (
    <DesktopLayout role="principal" title="Timetable Management">
      <Stack.Screen options={{ title: 'Timetable', headerShown: false }} />
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>Weekly Timetable</Text>
            <Text style={styles.subtitle}>Manage class schedules and teacher assignments</Text>
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

        {/* Day Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabs}>
          {WEEKDAYS.map((day) => (
            <TouchableOpacity
              key={day}
              style={[styles.dayTab, selectedDay === day && styles.dayTabActive]}
              onPress={() => setSelectedDay(day)}
            >
              <Text style={[styles.dayTabText, selectedDay === day && styles.dayTabTextActive]}>
                {DAYS[day]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Slots for Selected Day */}
        {daySlots.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={theme.textSecondary} />
            <Text style={styles.emptyText}>No classes scheduled for {DAYS[selectedDay]}</Text>
            <Text style={styles.emptyHint}>Tap the + button to add your first timetable slot</Text>
            <View style={styles.emptyGuidance}>
              <Text style={styles.guidanceTitle}>Getting started:</Text>
              <Text style={styles.guidanceItem}>• Add lessons, breaks, assemblies, and sports periods</Text>
              <Text style={styles.guidanceItem}>• Assign subjects, rooms, and teachers to each slot</Text>
              <Text style={styles.guidanceItem}>• K-12 schools can use period numbers for structured scheduling</Text>
            </View>
          </View>
        ) : (
          daySlots.map((slot) => {
            const color = getActivityColor(slot.activity_type);
            return (
              <View key={slot.id} style={[styles.slotCard, { borderLeftColor: color.text, borderLeftWidth: 4 }]}>
                {slot.period_number != null && (
                  <View style={[styles.periodBadge, { backgroundColor: color.bg }]}>
                    <Text style={[styles.periodBadgeText, { color: color.text }]}>P{slot.period_number}</Text>
                  </View>
                )}
                <View style={styles.slotTime}>
                  <Text style={styles.timeText}>{slot.start_time?.slice(0, 5)}</Text>
                  <Text style={styles.timeSeparator}>–</Text>
                  <Text style={styles.timeText}>{slot.end_time?.slice(0, 5)}</Text>
                </View>
                <View style={styles.slotInfo}>
                  <View style={styles.slotHeader}>
                    <Text style={styles.slotSubject}>{slot.subject || slot.activity_type}</Text>
                    <View style={[styles.activityBadge, { backgroundColor: color.bg }]}>
                      <Text style={[styles.activityBadgeText, { color: color.text }]}>{color.label}</Text>
                    </View>
                  </View>
                  {slot.room && <Text style={styles.slotDetail}>📍 {slot.room}</Text>}
                  {slot.teacher_name && <Text style={styles.slotDetail}>👩‍🏫 {slot.teacher_name}</Text>}
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        activeOpacity={0.8}
        onPress={openCreateModal}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={closeCreateModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Timetable Slot</Text>
              <TouchableOpacity onPress={closeCreateModal} disabled={creatingSlot}>
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Day: {DAYS[selectedDay]}</Text>

            <TextInput
              style={styles.input}
              placeholder="Subject (optional)"
              placeholderTextColor={theme.textSecondary}
              value={newSlotForm.subject}
              onChangeText={(text) => upsertForm({ subject: text })}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
              {Object.keys(ACTIVITY_TYPE_COLORS).map((type) => {
                const selected = newSlotForm.activityType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeChip, selected && styles.typeChipActive]}
                    onPress={() => upsertForm({ activityType: type })}
                  >
                    <Text style={[styles.typeChipText, selected && styles.typeChipTextActive]}>
                      {ACTIVITY_TYPE_COLORS[type]?.label || type}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.rowInputs}>
              <TextInput
                style={[styles.input, styles.rowInput]}
                placeholder="Start (HH:MM)"
                placeholderTextColor={theme.textSecondary}
                value={newSlotForm.startTime}
                onChangeText={(text) => upsertForm({ startTime: text })}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, styles.rowInput]}
                placeholder="End (HH:MM)"
                placeholderTextColor={theme.textSecondary}
                value={newSlotForm.endTime}
                onChangeText={(text) => upsertForm({ endTime: text })}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.rowInputs}>
              <TextInput
                style={[styles.input, styles.rowInput]}
                placeholder="Room (optional)"
                placeholderTextColor={theme.textSecondary}
                value={newSlotForm.room}
                onChangeText={(text) => upsertForm({ room: text })}
              />
              <TextInput
                style={[styles.input, styles.rowInput]}
                placeholder="Period # (optional)"
                placeholderTextColor={theme.textSecondary}
                value={newSlotForm.periodNumber}
                onChangeText={(text) => upsertForm({ periodNumber: text })}
                keyboardType="numeric"
              />
            </View>

            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Notes (optional)"
              placeholderTextColor={theme.textSecondary}
              value={newSlotForm.notes}
              onChangeText={(text) => upsertForm({ notes: text })}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.toggleRow, newSlotForm.isBreak && styles.toggleRowActive]}
              onPress={() => upsertForm({ isBreak: !newSlotForm.isBreak })}
            >
              <Ionicons
                name={newSlotForm.isBreak ? 'checkbox' : 'square-outline'}
                size={18}
                color={newSlotForm.isBreak ? theme.primary : theme.textSecondary}
              />
              <Text style={styles.toggleRowText}>Mark as break period</Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={closeCreateModal}
                disabled={creatingSlot}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, creatingSlot && styles.actionBtnDisabled]}
                onPress={handleCreateSlot}
                disabled={creatingSlot}
              >
                <Text style={styles.modalButtonPrimaryText}>{creatingSlot ? 'Saving...' : 'Save Slot'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <AlertModal {...alertProps} />
    </DesktopLayout>
  );
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
    subtitle: { fontSize: 14, color: theme.textSecondary, marginBottom: 16 },
    dayTabs: { flexDirection: 'row', marginBottom: 16 },
    dayTab: {
      paddingVertical: 10, paddingHorizontal: 20, borderRadius: 999,
      backgroundColor: theme.cardBackground || theme.surface,
      marginRight: 8, borderWidth: 1, borderColor: theme.border,
    },
    dayTabActive: { backgroundColor: `${theme.primary}15`, borderColor: theme.primary },
    dayTabText: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
    dayTabTextActive: { color: theme.primary },
    emptyState: { alignItems: 'center', paddingVertical: 48 },
    emptyText: { fontSize: 16, fontWeight: '600', color: theme.text, marginTop: 12 },
    emptyHint: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
    emptyGuidance: {
      marginTop: 20, paddingHorizontal: 24, paddingVertical: 16,
      backgroundColor: theme.cardBackground || theme.surface,
      borderRadius: 12, borderWidth: 1, borderColor: theme.border,
      alignSelf: 'stretch', marginHorizontal: 16,
    },
    guidanceTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 8 },
    guidanceItem: { fontSize: 13, color: theme.textSecondary, marginBottom: 4, lineHeight: 20 },
    slotCard: {
      flexDirection: 'row', backgroundColor: theme.cardBackground || theme.surface,
      borderRadius: 12, padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: theme.border,
    },
    slotTime: { width: 70, alignItems: 'center', justifyContent: 'center' },
    timeText: { fontSize: 13, fontWeight: '700', color: theme.primary },
    timeSeparator: { fontSize: 11, color: theme.textSecondary },
    slotInfo: { flex: 1, marginLeft: 12 },
    slotHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
    slotSubject: { fontSize: 15, fontWeight: '600', color: theme.text },
    slotDetail: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
    activityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    activityBadgeText: { fontSize: 11, fontWeight: '600' },
    periodBadge: {
      width: 36, height: 36, borderRadius: 18,
      justifyContent: 'center', alignItems: 'center', marginRight: 4,
    },
    periodBadgeText: { fontSize: 12, fontWeight: '700' },
    fab: {
      position: 'absolute', right: 20, bottom: 28, width: 56, height: 56,
      borderRadius: 28, justifyContent: 'center', alignItems: 'center',
      elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2, shadowRadius: 5,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(10, 16, 30, 0.7)',
      justifyContent: 'center',
      padding: 16,
    },
    modalCard: {
      backgroundColor: theme.cardBackground || theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      maxHeight: '90%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    modalSubtitle: { fontSize: 13, color: theme.textSecondary, marginBottom: 12 },
    input: {
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      marginBottom: 10,
      fontSize: 14,
    },
    inputMultiline: {
      minHeight: 78,
      textAlignVertical: 'top',
    },
    rowInputs: {
      flexDirection: 'row',
      gap: 8,
    },
    rowInput: {
      flex: 1,
    },
    chipsRow: {
      marginBottom: 10,
    },
    typeChip: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      marginRight: 6,
      backgroundColor: theme.background,
    },
    typeChipActive: {
      borderColor: theme.primary,
      backgroundColor: `${theme.primary}20`,
    },
    typeChipText: { fontSize: 12, color: theme.textSecondary, fontWeight: '600' },
    typeChipTextActive: { color: theme.primary },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 10,
      marginBottom: 10,
      backgroundColor: theme.background,
    },
    toggleRowActive: {
      borderColor: theme.primary,
      backgroundColor: `${theme.primary}15`,
    },
    toggleRowText: { fontSize: 13, color: theme.text },
    modalActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    modalButton: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalButtonPrimary: {
      backgroundColor: theme.primary,
    },
    modalButtonSecondary: {
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalButtonPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    modalButtonSecondaryText: { color: theme.text, fontWeight: '700', fontSize: 14 },
  });
