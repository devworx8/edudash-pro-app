import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { retrySupabaseRead } from '@/lib/supabaseErrors';
import { useEduDashAlert } from '@/components/ui/EduDashAlert';
import EduDashSpinner from '@/components/ui/EduDashSpinner';

type StationeryList = {
  id: string;
  school_id: string;
  age_group_label: string;
  age_min: number | null;
  age_max: number | null;
  is_visible: boolean;
  is_published: boolean;
  sort_order: number;
};

type StationeryItem = {
  id: string;
  list_id: string;
  item_name: string;
  required_quantity: number;
  unit_label: string | null;
  sort_order: number;
  is_visible: boolean;
};

type StudentRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  preschool_id?: string | null;
  organization_id?: string | null;
  classes?: { name?: string | null } | null;
};

function getAcademicYear(): number {
  try {
    return Number(
      new Intl.DateTimeFormat('en-ZA', {
        timeZone: 'Africa/Johannesburg',
        year: 'numeric',
      }).format(new Date())
    );
  } catch {
    return new Date().getFullYear();
  }
}

function getAgeFromDob(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function getProfileSchoolIds(profile: any): string[] {
  const ids = [profile?.organization_id, profile?.preschool_id]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function getStudentSchoolIds(student: StudentRow): string[] {
  const ids = [student.organization_id, student.preschool_id]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

export default function PrincipalStationeryScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { showError, showWarning, showSuccess, AlertComponent } = useEduDashAlert();
  const supabase = useMemo(() => assertSupabase(), []);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const schoolIds = useMemo(() => getProfileSchoolIds(profile), [profile]);
  const academicYear = useMemo(() => getAcademicYear(), []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lists, setLists] = useState<StationeryList[]>([]);
  const [items, setItems] = useState<StationeryItem[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [checks, setChecks] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [activeSchoolId, setActiveSchoolId] = useState<string>('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemUnit, setNewItemUnit] = useState('pc');

  const load = useCallback(async () => {
    if (!schoolIds.length) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      await Promise.all(
        schoolIds.map((schoolId) =>
          supabase.rpc('ensure_stationery_year_templates', {
            p_school_id: schoolId,
            p_academic_year: academicYear,
          })
        )
      );

      const [
        { data: listRows, error: listError },
        { data: studentsByPreschool, error: studentsByPreschoolError },
        { data: studentsByOrg, error: studentsByOrgError },
      ] = await Promise.all([
        supabase
          .from('stationery_lists')
          .select('id, school_id, age_group_label, age_min, age_max, is_visible, is_published, sort_order')
          .in('school_id', schoolIds)
          .eq('academic_year', academicYear)
          .order('sort_order', { ascending: true }),
        supabase
          .from('students')
          .select('id, first_name, last_name, date_of_birth, preschool_id, organization_id, classes(name)')
          .in('preschool_id', schoolIds)
          .eq('is_active', true)
          .order('first_name', { ascending: true }),
        supabase
          .from('students')
          .select('id, first_name, last_name, date_of_birth, preschool_id, organization_id, classes(name)')
          .in('organization_id', schoolIds)
          .eq('is_active', true)
          .order('first_name', { ascending: true }),
      ]);

      if (listError) throw listError;
      if (studentsByPreschoolError) throw studentsByPreschoolError;
      if (studentsByOrgError) throw studentsByOrgError;

      const loadedLists = (listRows || []) as StationeryList[];
      const studentById = new Map<string, StudentRow>();
      [...(studentsByPreschool || []), ...(studentsByOrg || [])].forEach((row: any) => {
        if (row?.id) studentById.set(String(row.id), row as StudentRow);
      });
      const mergedStudents = Array.from(studentById.values());

      const studentCountBySchoolId = new Map<string, number>();
      mergedStudents.forEach((student) => {
        getStudentSchoolIds(student).forEach((studentSchoolId) => {
          studentCountBySchoolId.set(
            studentSchoolId,
            Number(studentCountBySchoolId.get(studentSchoolId) || 0) + 1
          );
        });
      });

      const listSchoolIds = Array.from(new Set(loadedLists.map((list) => String(list.school_id)).filter(Boolean)));
      const nextSchoolId = [activeSchoolId, ...listSchoolIds, ...schoolIds]
        .filter(Boolean)
        .sort((a, b) => {
          const bCount = Number(studentCountBySchoolId.get(b) || 0);
          const aCount = Number(studentCountBySchoolId.get(a) || 0);
          return bCount - aCount;
        })[0] || '';

      const scopedLists = nextSchoolId
        ? loadedLists.filter((list) => String(list.school_id) === nextSchoolId)
        : loadedLists;
      const listIds = scopedLists.map((row) => row.id);
      const scopedStudents = mergedStudents.filter((student) => {
        if (!nextSchoolId) return true;
        return getStudentSchoolIds(student).includes(nextSchoolId);
      });
      const studentIds = scopedStudents.map((row) => row.id);

      const [{ data: itemRows }, { data: checkRows }, { data: overrideRows }] = await Promise.all([
        listIds.length
          ? supabase
              .from('stationery_list_items')
              .select('id, list_id, item_name, required_quantity, unit_label, sort_order, is_visible')
              .in('list_id', listIds)
              .order('sort_order', { ascending: true })
          : Promise.resolve({ data: [] as any[] }),
        studentIds.length
          ? supabase
              .from('stationery_parent_checks')
              .select('student_id, item_id, is_bought')
              .in('student_id', studentIds)
              .eq('academic_year', academicYear)
          : Promise.resolve({ data: [] as any[] }),
        studentIds.length
          ? supabase
              .from('stationery_student_overrides')
              .select('student_id, list_id')
              .in('student_id', studentIds)
              .eq('academic_year', academicYear)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const { data: noteRows, error: noteError } = studentIds.length
        ? await retrySupabaseRead(() =>
            supabase
              .from('stationery_parent_notes')
              .select('student_id, note_text, expected_completion_date')
              .in('student_id', studentIds)
              .eq('academic_year', academicYear)
          )
        : { data: [] as any[], error: null };

      if (noteError) {
        logger.warn('[PrincipalStationery] parent notes read failed; continuing without notes', {
          academicYear,
          studentCount: studentIds.length,
          noteError,
        });
      }

      setActiveSchoolId(nextSchoolId);
      setLists(scopedLists);
      setItems((itemRows || []) as StationeryItem[]);
      setStudents(scopedStudents);
      setChecks(checkRows || []);
      setNotes(noteRows || []);
      setOverrides(
        Object.fromEntries(
          (overrideRows || [])
            .filter((row: any) => row?.student_id && row?.list_id)
            .map((row: any) => [String(row.student_id), String(row.list_id)])
        )
      );

      setSelectedListId((prev) => {
        if (prev && scopedLists.some((list) => list.id === prev)) return prev;
        return scopedLists[0]?.id || '';
      });
    } catch (e: any) {
      showError('Error', e?.message || 'Failed to load stationery data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [academicYear, activeSchoolId, schoolIds, showError, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const itemsByList = useMemo(() => {
    const map = new Map<string, StationeryItem[]>();
    items.forEach((item) => {
      const list = map.get(item.list_id) || [];
      list.push(item);
      map.set(item.list_id, list);
    });
    for (const [key, value] of map.entries()) {
      value.sort((a, b) => a.sort_order - b.sort_order);
      map.set(key, value);
    }
    return map;
  }, [items]);

  const selectedListItems = useMemo(
    () => (selectedListId ? itemsByList.get(selectedListId) || [] : []),
    [itemsByList, selectedListId]
  );

  const studentProgress = useMemo(() => {
    const checkMap = new Map<string, boolean>();
    checks.forEach((row: any) => {
      if (!row?.student_id || !row?.item_id) return;
      checkMap.set(`${row.student_id}:${row.item_id}`, Boolean(row.is_bought));
    });
    const noteMap = new Map<string, any>();
    notes.forEach((row: any) => {
      if (!row?.student_id) return;
      noteMap.set(String(row.student_id), row);
    });

    return students.map((student) => {
      const overrideListId = overrides[student.id] || null;
      const age = getAgeFromDob(student.date_of_birth || null);
      let activeList = lists.find((list) => list.id === overrideListId) || null;
      if (!activeList) {
        activeList =
          lists.find((list) => {
            if (age == null) return false;
            if (list.age_min != null && age < list.age_min) return false;
            if (list.age_max != null && age > list.age_max) return false;
            return true;
          }) || lists[0] || null;
      }

      const activeItems = activeList ? itemsByList.get(activeList.id) || [] : [];
      const boughtCount = activeItems.filter((item) => checkMap.get(`${student.id}:${item.id}`)).length;
      const totalCount = activeItems.length;
      const remainingCount = Math.max(totalCount - boughtCount, 0);
      const note = noteMap.get(student.id);

      return {
        studentId: student.id,
        studentName: `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student',
        className: student.classes?.name || 'Class not set',
        listId: activeList?.id || '',
        listLabel: activeList?.age_group_label || 'No list',
        boughtCount,
        remainingCount,
        totalCount,
        noteText: String(note?.note_text || ''),
        expectedBy: String(note?.expected_completion_date || ''),
      };
    });
  }, [checks, itemsByList, lists, notes, overrides, students]);

  const saveListToggle = async (listId: string, field: 'is_visible' | 'is_published', value: boolean) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('stationery_lists')
        .update({ [field]: value })
        .eq('id', listId);
      if (error) throw error;
      await load();
      showSuccess('Updated', 'Stationery list settings updated.');
    } catch (e: any) {
      showError('Error', e?.message || 'Failed to update list');
    } finally {
      setSaving(false);
    }
  };

  const saveItemVisibility = async (itemId: string, value: boolean) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('stationery_list_items')
        .update({ is_visible: value })
        .eq('id', itemId);
      if (error) throw error;
      await load();
    } catch (e: any) {
      showError('Error', e?.message || 'Failed to update item');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (itemId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('stationery_list_items')
        .delete()
        .eq('id', itemId);
      if (error) throw error;
      await load();
    } catch (e: any) {
      showError('Error', e?.message || 'Failed to delete item');
    } finally {
      setSaving(false);
    }
  };

  const addItem = async () => {
    if (!selectedListId) {
      showWarning('Select list', 'Select an age-group list first.');
      return;
    }
    const itemName = newItemName.trim();
    const quantity = Number.parseInt(newItemQty.trim(), 10);
    if (!itemName || !Number.isFinite(quantity) || quantity < 0) {
      showWarning('Invalid input', 'Enter a valid item name and quantity.');
      return;
    }

    setSaving(true);
    try {
      const nextSort =
        selectedListItems.length > 0
          ? Math.max(...selectedListItems.map((item) => Number(item.sort_order || 0))) + 10
          : 10;

      const { error } = await supabase
        .from('stationery_list_items')
        .insert({
          list_id: selectedListId,
          item_name: itemName,
          required_quantity: quantity,
          unit_label: (newItemUnit || 'pc').trim() || 'pc',
          sort_order: nextSort,
          is_visible: true,
        });
      if (error) throw error;
      setNewItemName('');
      setNewItemQty('1');
      setNewItemUnit('pc');
      await load();
      showSuccess('Saved', 'Stationery item added.');
    } catch (e: any) {
      showError('Error', e?.message || 'Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  const saveOverride = async (studentId: string, listId: string, currentListId: string) => {
    if (!listId || listId === currentListId) return;
    const targetList = lists.find((list) => list.id === listId);
    if (!targetList) {
      showWarning('List unavailable', 'The selected list is no longer available. Refresh and try again.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('stationery_student_overrides')
        .upsert(
          {
            school_id: targetList.school_id,
            student_id: studentId,
            list_id: listId,
            academic_year: academicYear,
            set_by: (profile as any)?.id || null,
          },
          { onConflict: 'student_id,academic_year' }
        );
      if (error) throw error;
      setOverrides((prev) => ({ ...prev, [studentId]: listId }));
      await load();
    } catch (e: any) {
      showError('Error', e?.message || 'Failed to save override');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Stationery', headerStyle: { backgroundColor: theme.background }, headerTitleStyle: { color: theme.text }, headerTintColor: theme.primary }} />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        {loading ? (
          <View style={styles.loadingBox}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={styles.muted}>Loading stationery...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          >
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="checkbox-outline" size={22} color={theme.primary} />
                <Text style={styles.sectionTitle}>Stationery Control ({academicYear})</Text>
              </View>
              <Text style={styles.sectionHint}>
                Manage age-group lists and track per-student stationery completion from one place.
              </Text>
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{studentProgress.length}</Text>
                  <Text style={styles.statLabel}>Students</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, { color: '#22c55e' }]}>
                    {studentProgress.filter((row) => row.totalCount > 0 && row.remainingCount === 0).length}
                  </Text>
                  <Text style={styles.statLabel}>Complete</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, { color: '#f59e0b' }]}>
                    {studentProgress.filter((row) => row.remainingCount > 0).length}
                  </Text>
                  <Text style={styles.statLabel}>Incomplete</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Templates</Text>
              {lists.map((list) => {
                const active = selectedListId === list.id;
                return (
                  <View key={list.id} style={styles.listCard}>
                    <View style={styles.rowBetween}>
                      <TouchableOpacity style={[styles.chipBtn, active && styles.chipBtnActive]} onPress={() => setSelectedListId(list.id)}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{list.age_group_label}</Text>
                      </TouchableOpacity>
                      <View style={styles.actionsInline}>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => void saveListToggle(list.id, 'is_visible', !list.is_visible)}
                          disabled={saving}
                        >
                          <Ionicons name={list.is_visible ? 'eye-outline' : 'eye-off-outline'} size={16} color={theme.text} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => void saveListToggle(list.id, 'is_published', !list.is_published)}
                          disabled={saving}
                        >
                          <Ionicons name={list.is_published ? 'cloud-done-outline' : 'cloud-offline-outline'} size={16} color={theme.text} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={styles.muted}>Age: {list.age_min ?? '-'} - {list.age_max ?? '-'}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Items</Text>
              <View style={styles.addRow}>
                <TextInput style={[styles.input, styles.nameInput]} placeholder="Item name" placeholderTextColor={theme.textSecondary} value={newItemName} onChangeText={setNewItemName} />
                <TextInput style={styles.input} placeholder="Qty" placeholderTextColor={theme.textSecondary} value={newItemQty} onChangeText={setNewItemQty} keyboardType="numeric" />
                <TextInput style={styles.input} placeholder="Unit" placeholderTextColor={theme.textSecondary} value={newItemUnit} onChangeText={setNewItemUnit} />
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => void addItem()} disabled={saving}>
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : 'Add Item'}</Text>
              </TouchableOpacity>

              {selectedListItems.map((item) => (
                <View key={item.id} style={styles.itemCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.item_name}</Text>
                    <Text style={styles.muted}>Required: {item.required_quantity} {item.unit_label || 'pc'}</Text>
                  </View>
                  <View style={styles.actionsInline}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => void saveItemVisibility(item.id, !item.is_visible)} disabled={saving}>
                      <Ionicons name={item.is_visible ? 'eye-outline' : 'eye-off-outline'} size={16} color={theme.text} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => void deleteItem(item.id)} disabled={saving}>
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Student Progress</Text>
              {studentProgress.map((row) => (
                <View key={row.studentId} style={styles.progressCard}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{row.studentName}</Text>
                      <Text style={styles.muted}>{row.className}</Text>
                      {row.noteText ? <Text style={styles.noteText}>{row.noteText}</Text> : null}
                    </View>
                    <View style={styles.progressPill}>
                      <Text style={styles.progressText}>{row.boughtCount}/{row.totalCount}</Text>
                    </View>
                  </View>
                  <Text style={styles.muted}>Still needed: {row.remainingCount} • Expected by: {row.expectedBy || '-'}</Text>
                  <View style={styles.overrideRow}>
                    <Text style={styles.overrideLabel}>Override age-group list</Text>
                    <View style={styles.pickerWrap}>
                      {lists.length > 0 ? (
                        <Picker
                          selectedValue={overrides[row.studentId] || row.listId || lists[0]?.id || ''}
                          onValueChange={(value) => {
                            if (typeof value === 'string' && value) {
                              void saveOverride(row.studentId, value, overrides[row.studentId] || row.listId || '');
                            }
                          }}
                          enabled={!saving}
                          style={styles.picker}
                          dropdownIconColor={theme.text}
                        >
                          {lists.map((list) => (
                            <Picker.Item key={list.id} label={list.age_group_label} value={list.id} color={theme.text} />
                          ))}
                        </Picker>
                      ) : (
                        <Text style={styles.muted}>No age-group lists available.</Text>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
      <AlertComponent />
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 28, gap: 12 },
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    section: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 10,
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
    sectionHint: { color: theme.textSecondary, fontSize: 12, lineHeight: 17 },
    muted: { color: theme.textSecondary, fontSize: 12 },
    statsRow: { flexDirection: 'row', gap: 8 },
    statCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    statValue: { color: theme.text, fontSize: 16, fontWeight: '700' },
    statLabel: { color: theme.textSecondary, fontSize: 11, marginTop: 2 },
    listCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 10,
      gap: 8,
    },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    chipBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: theme.background,
    },
    chipBtnActive: { borderColor: theme.primary, backgroundColor: `${theme.primary}20` },
    chipText: { color: theme.text, fontSize: 12, fontWeight: '600' },
    chipTextActive: { color: theme.primary },
    actionsInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    addRow: { flexDirection: 'row', gap: 8 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 9,
      color: theme.text,
      backgroundColor: theme.background,
      minWidth: 64,
    },
    nameInput: { flex: 1 },
    primaryBtn: {
      marginTop: 2,
      borderRadius: 10,
      backgroundColor: theme.primary,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    itemCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.background,
    },
    itemName: { color: theme.text, fontWeight: '700', fontSize: 14 },
    progressCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 10,
      gap: 8,
      backgroundColor: theme.background,
    },
    progressPill: {
      borderWidth: 1,
      borderColor: theme.primary,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: `${theme.primary}15`,
    },
    progressText: { color: theme.primary, fontWeight: '700', fontSize: 12 },
    noteText: { color: theme.textSecondary, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
    overrideRow: { gap: 4 },
    overrideLabel: { color: theme.textSecondary, fontSize: 12, fontWeight: '600' },
    pickerWrap: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.surface,
    },
    picker: { color: theme.text, height: 44, marginHorizontal: -8 },
  });
