import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeRole } from '@/lib/rbac/profile-utils';
import { addDays, CLEANING_SHIFT_SLOTS, getWeekStart, toDateKey, type CleaningShiftSlot } from '@/lib/cleaning-roster/constants';
import { useCleaningRosterManager, type CleaningAssignmentStatus } from '@/hooks/cleaning-roster';
import { createCleaningRosterStyles } from './cleaning-roster.styles';

function formatDateLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export default function CleaningRosterScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { profile } = useAuth();
  const styles = useMemo(() => createCleaningRosterStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();

  const organizationId = profile?.organization_id || profile?.preschool_id || null;
  const role = normalizeRole(profile?.role || '');
  const canManage = role === 'principal' || role === 'principal_admin' || role === 'super_admin';

  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [areaName, setAreaName] = useState('');
  const [areaDescription, setAreaDescription] = useState('');
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [shiftDate, setShiftDate] = useState(() => toDateKey(new Date()));
  const [shiftSlot, setShiftSlot] = useState<CleaningShiftSlot>('morning');
  const [requiredStaffCount, setRequiredStaffCount] = useState('1');
  const [shiftNotes, setShiftNotes] = useState('');

  const {
    areas,
    shifts,
    assignments,
    teachers,
    loading,
    saving,
    error,
    loadRoster,
    createArea,
    createShift,
    assignTeacher,
    unassignTeacher,
    updateAssignmentStatus,
  } = useCleaningRosterManager({ organizationId });

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const rangeFrom = useMemo(() => toDateKey(weekStart), [weekStart]);
  const rangeTo = useMemo(() => toDateKey(weekEnd), [weekEnd]);

  const loadCurrentWeek = useCallback(async () => {
    await loadRoster({ from: rangeFrom, to: rangeTo });
  }, [loadRoster, rangeFrom, rangeTo]);

  useEffect(() => {
    if (!organizationId || !canManage) return;
    void loadCurrentWeek();
  }, [organizationId, canManage, loadCurrentWeek]);

  const areaById = useMemo(() => {
    return new Map(areas.map((area) => [area.id, area]));
  }, [areas]);

  const assignmentsByShift = useMemo(() => {
    const map = new Map<string, typeof assignments>();
    assignments.forEach((assignment) => {
      const list = map.get(assignment.cleaning_shift_id) || [];
      list.push(assignment);
      map.set(assignment.cleaning_shift_id, list);
    });
    return map;
  }, [assignments]);

  const teacherByUserId = useMemo(() => {
    return new Map(teachers.map((teacher) => [teacher.teacherUserId, teacher]));
  }, [teachers]);

  const handleCreateArea = useCallback(async () => {
    try {
      await createArea(areaName, areaDescription);
      setAreaName('');
      setAreaDescription('');
      await loadCurrentWeek();
    } catch (err) {
      showAlert({ title: 'Create Area Failed', message: err instanceof Error ? err.message : 'Could not create cleaning area.', type: 'error' });
    }
  }, [areaDescription, areaName, createArea, loadCurrentWeek]);

  const handleCreateShift = useCallback(async () => {
    try {
      await createShift({
        areaId: selectedAreaId,
        shiftDate,
        slot: shiftSlot,
        requiredStaffCount: Number(requiredStaffCount || '1'),
        notes: shiftNotes,
      });
      setShiftNotes('');
      await loadCurrentWeek();
    } catch (err) {
      showAlert({ title: 'Create Shift Failed', message: err instanceof Error ? err.message : 'Could not create shift.', type: 'error' });
    }
  }, [createShift, loadCurrentWeek, requiredStaffCount, selectedAreaId, shiftDate, shiftNotes, shiftSlot]);

  const handleAssignTeacher = useCallback(async (shiftId: string, teacherUserId: string) => {
    try {
      await assignTeacher(shiftId, teacherUserId);
      await loadCurrentWeek();
    } catch (err) {
      showAlert({ title: 'Assign Teacher Failed', message: err instanceof Error ? err.message : 'Could not assign teacher.', type: 'error' });
    }
  }, [assignTeacher, loadCurrentWeek]);

  const handleUnassignTeacher = useCallback(async (assignmentId: string) => {
    try {
      await unassignTeacher(assignmentId);
      await loadCurrentWeek();
    } catch (err) {
      showAlert({ title: 'Unassign Failed', message: err instanceof Error ? err.message : 'Could not remove assignment.', type: 'error' });
    }
  }, [loadCurrentWeek, unassignTeacher]);

  const handleUpdateStatus = useCallback(async (assignmentId: string, status: CleaningAssignmentStatus) => {
    try {
      await updateAssignmentStatus(assignmentId, status);
      await loadCurrentWeek();
    } catch (err) {
      showAlert({ title: 'Status Update Failed', message: err instanceof Error ? err.message : 'Could not update task status.', type: 'error' });
    }
  }, [loadCurrentWeek, updateAssignmentStatus]);

  if (!canManage) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerMessage}>
          <Ionicons name="lock-closed-outline" size={28} color={theme.error} />
          <Text style={styles.centerTitle}>Access Restricted</Text>
          <Text style={styles.centerSubtitle}>Only principal/admin users can manage cleaning rosters.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!organizationId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerMessage}>
          <Ionicons name="business-outline" size={28} color={theme.warning} />
          <Text style={styles.centerTitle}>No School Linked</Text>
          <Text style={styles.centerSubtitle}>Please link your profile to a school before using cleaning roster.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cleaning Roster</Text>
        <TouchableOpacity onPress={() => router.push('/screens/teacher-cleaning-tasks' as any)} style={styles.iconButton}>
          <Ionicons name="list-outline" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.weekNav}>
          <TouchableOpacity style={styles.weekButton} onPress={() => setWeekStart((current) => addDays(current, -7))}>
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.weekLabelWrap}>
            <Text style={styles.weekLabel}>{formatDateLabel(rangeFrom)} - {formatDateLabel(rangeTo)}</Text>
            <Text style={styles.weekHint}>Weekly planning window</Text>
          </View>
          <TouchableOpacity style={styles.weekButton} onPress={() => setWeekStart((current) => addDays(current, 7))}>
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add Cleaning Area</Text>
          <TextInput
            style={styles.input}
            value={areaName}
            onChangeText={setAreaName}
            placeholder="Area name (e.g. Classroom A)"
            placeholderTextColor={theme.textSecondary}
          />
          <TextInput
            style={styles.input}
            value={areaDescription}
            onChangeText={setAreaDescription}
            placeholder="Optional description"
            placeholderTextColor={theme.textSecondary}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleCreateArea} disabled={saving || !areaName.trim()}>
            <Text style={styles.primaryButtonText}>Create Area</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create Shift</Text>
          <Text style={styles.label}>Area</Text>
          <View style={styles.chipWrap}>
            {areas.map((area) => {
              const selected = selectedAreaId === area.id;
              return (
                <TouchableOpacity
                  key={area.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setSelectedAreaId(area.id)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{area.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={shiftDate}
            onChangeText={setShiftDate}
            placeholder="2026-03-02"
            placeholderTextColor={theme.textSecondary}
          />

          <Text style={styles.label}>Shift Slot</Text>
          <View style={styles.chipWrap}>
            {CLEANING_SHIFT_SLOTS.map((slot) => {
              const selected = shiftSlot === slot.id;
              return (
                <TouchableOpacity
                  key={slot.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setShiftSlot(slot.id)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{slot.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Required Staff</Text>
          <TextInput
            style={styles.input}
            value={requiredStaffCount}
            onChangeText={setRequiredStaffCount}
            keyboardType="numeric"
            placeholder="1"
            placeholderTextColor={theme.textSecondary}
          />

          <TextInput
            style={[styles.input, styles.notesInput]}
            value={shiftNotes}
            onChangeText={setShiftNotes}
            placeholder="Notes (optional)"
            placeholderTextColor={theme.textSecondary}
            multiline
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleCreateShift} disabled={saving || !selectedAreaId}>
            <Text style={styles.primaryButtonText}>Create Shift</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly Roster</Text>
          {loading && (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={styles.inlineLoadingText}>Loading roster...</Text>
            </View>
          )}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {shifts.length === 0 && !loading ? (
            <Text style={styles.emptyText}>No shifts scheduled for this week.</Text>
          ) : null}

          {shifts.map((shift) => {
            const shiftAssignments = assignmentsByShift.get(shift.id) || [];
            const areaNameForShift = areaById.get(shift.cleaning_area_id)?.name || 'Area';
            return (
              <View key={shift.id} style={styles.shiftCard}>
                <View style={styles.shiftHeader}>
                  <View>
                    <Text style={styles.shiftTitle}>{areaNameForShift}</Text>
                    <Text style={styles.shiftSubtitle}>
                      {formatDateLabel(shift.shift_date)} - {shift.shift_slot} - {shiftAssignments.length}/{shift.required_staff_count} assigned
                    </Text>
                  </View>
                </View>

                {shiftAssignments.map((assignment) => {
                  const teacher = teacherByUserId.get(assignment.teacher_user_id);
                  return (
                    <View key={assignment.id} style={styles.assignmentRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.assignmentName}>{teacher?.displayName || 'Teacher'}</Text>
                        <Text style={styles.assignmentStatus}>Status: {assignment.status}</Text>
                      </View>
                      <TouchableOpacity style={styles.smallButton} onPress={() => handleUpdateStatus(assignment.id, 'completed')}>
                        <Text style={styles.smallButtonText}>Done</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.smallButton} onPress={() => handleUpdateStatus(assignment.id, 'missed')}>
                        <Text style={styles.smallButtonText}>Missed</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.smallDangerButton} onPress={() => handleUnassignTeacher(assignment.id)}>
                        <Text style={styles.smallDangerButtonText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}

                <Text style={styles.label}>Assign teacher</Text>
                <View style={styles.chipWrap}>
                  {teachers.map((teacher) => {
                    const alreadyAssigned = shiftAssignments.some((item) => item.teacher_user_id === teacher.teacherUserId);
                    return (
                      <TouchableOpacity
                        key={`${shift.id}-${teacher.teacherUserId}`}
                        style={[styles.chip, alreadyAssigned && styles.chipDisabled]}
                        disabled={alreadyAssigned || saving}
                        onPress={() => handleAssignTeacher(shift.id, teacher.teacherUserId)}
                      >
                        <Text style={[styles.chipText, alreadyAssigned && styles.chipDisabledText]}>
                          {teacher.displayName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
