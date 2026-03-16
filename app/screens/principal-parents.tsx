import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, RefreshControl, Modal } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';

interface ParentRow {
  auth_user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  children: string[];
}

export default function PrincipalParentsScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();

  const schoolId = (profile?.organization_id as string) || (profile as any)?.preschool_id || null;

  const [parents, setParents] = useState<ParentRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [selectedParent, setSelectedParent] = useState<ParentRow | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      // 1) Fetch students for the school
      const { data: students, error: studentsErr } = await assertSupabase()
        .from('students')
        .select('id, first_name, last_name, parent_id, guardian_id, preschool_id, is_active')
        .eq('preschool_id', schoolId)
        .eq('is_active', true);
      if (studentsErr) throw studentsErr;

      const idToChildren: Record<string, string[]> = {};
      const uniqueIds = new Set<string>();

      (students || []).forEach((s: any) => {
        const childName = `${s.first_name || ''} ${s.last_name || ''}`.trim();
        if (s.parent_id) {
          uniqueIds.add(s.parent_id);
          idToChildren[s.parent_id] = idToChildren[s.parent_id] || [];
          idToChildren[s.parent_id].push(childName);
        }
        if (s.guardian_id && s.guardian_id !== s.parent_id) {
          uniqueIds.add(s.guardian_id);
          idToChildren[s.guardian_id] = idToChildren[s.guardian_id] || [];
          idToChildren[s.guardian_id].push(childName);
        }
      });

      const ids = Array.from(uniqueIds);
      if (ids.length === 0) {
        setParents([]);
        return;
      }

      // 2) Fetch parent profiles by id (profiles.id = auth_user_id)
      const { data: users, error: usersErr } = await assertSupabase()
        .from('profiles')
        .select('id, first_name, last_name, email, phone')
        .in('id', ids);
      if (usersErr) throw usersErr;

      const merged: ParentRow[] = (users || []).map((u: any) => ({
        auth_user_id: u.id,
        first_name: u.first_name,
        last_name: u.last_name,
        email: u.email,
        phone: u.phone,
        children: idToChildren[u.id] || [],
      }));

      // Sort by name/email
      merged.sort((a, b) => {
        const aName = `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email || '';
        const bName = `${b.first_name || ''} ${b.last_name || ''}`.trim() || b.email || '';
        return aName.localeCompare(bName);
      });

      setParents(merged);
    } catch (e: any) {
      showAlert({ title: 'Error', message: e?.message || 'Failed to load parents', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter(p =>
      (`${p.first_name || ''} ${p.last_name || ''}`.trim()).toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q)
    );
  }, [parents, search]);

  const openEdit = (parent: ParentRow) => {
    setSelectedParent(parent);
    setEditFirstName(parent.first_name || '');
    setEditLastName(parent.last_name || '');
    setEditEmail(parent.email || '');
    setEditPhone(parent.phone || '');
    setShowEditModal(true);
  };

  const closeEdit = () => {
    setShowEditModal(false);
    setSelectedParent(null);
  };

  const saveParentUpdates = async () => {
    if (!selectedParent) return;
    try {
      setSavingEdit(true);
      const { error } = await assertSupabase().rpc('update_profile_contact_by_staff', {
        target_profile_id: selectedParent.auth_user_id,
        new_first_name: editFirstName.trim() || null,
        new_last_name: editLastName.trim() || null,
        new_phone: editPhone.trim() || null,
        new_email: editEmail.trim() || null,
      });

      if (error) {
        throw error;
      }

      setParents(prev =>
        prev.map(p =>
          p.auth_user_id === selectedParent.auth_user_id
            ? {
                ...p,
                first_name: editFirstName.trim() || null,
                last_name: editLastName.trim() || null,
                email: editEmail.trim() || null,
                phone: editPhone.trim() || null,
              }
            : p
        )
      );

      showAlert({ title: 'Success', message: 'Parent details updated.', type: 'success' });
      closeEdit();
    } catch (e: any) {
      showAlert({ title: 'Error', message: e?.message || 'Failed to update parent details', type: 'error' });
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Parents', headerShown: true }} />
      {!schoolId ? (
        <Text style={styles.text}>No school found on your profile.</Text>
      ) : (
        <>
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, email, or phone"
            placeholderTextColor={theme?.textSecondary || '#9CA3AF'}
          />
          <FlashList
            data={filtered}
            keyExtractor={(item) => item.auth_user_id}
            estimatedItemSize={80}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme?.primary || '#00f5ff'} />}
            ListEmptyComponent={
              loading ? <Text style={styles.muted}>Loading…</Text> : <Text style={styles.muted}>No parents found</Text>
            }
            renderItem={({ item }) => {
              const childCount = item.children.length;
              const childPreview = item.children.slice(0, 2).join(', ');
              const displayName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.email || 'Parent';
              return (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.name}>{displayName}</Text>
                    <TouchableOpacity style={styles.editButton} onPress={() => openEdit(item)}>
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  {!!item.email && <Text style={styles.text}>Email: {item.email}</Text>}
                  {!!item.phone && <Text style={styles.text}>Phone: {item.phone}</Text>}
                  <Text style={styles.text}>Children: {childCount}{childPreview ? ` – ${childPreview}${childCount > 2 ? '…' : ''}` : ''}</Text>
                </View>
              );
            }}
          />
        </>
      )}

      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Parent Details</Text>
              <TouchableOpacity onPress={closeEdit}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>First Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editFirstName}
              onChangeText={setEditFirstName}
              placeholder="First name"
              placeholderTextColor={theme?.textSecondary || '#9CA3AF'}
            />

            <Text style={styles.modalLabel}>Last Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editLastName}
              onChangeText={setEditLastName}
              placeholder="Last name"
              placeholderTextColor={theme?.textSecondary || '#9CA3AF'}
            />

            <Text style={styles.modalLabel}>Email</Text>
            <TextInput
              style={styles.modalInput}
              value={editEmail}
              onChangeText={setEditEmail}
              placeholder="Email"
              placeholderTextColor={theme?.textSecondary || '#9CA3AF'}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.modalLabel}>Phone</Text>
            <TextInput
              style={styles.modalInput}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="Phone"
              placeholderTextColor={theme?.textSecondary || '#9CA3AF'}
              keyboardType="phone-pad"
            />

            <TouchableOpacity
              style={[styles.saveButton, savingEdit && styles.saveButtonDisabled]}
              onPress={saveParentUpdates}
              disabled={savingEdit}
            >
              <Text style={styles.saveButtonText}>{savingEdit ? 'Saving…' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <AlertModal {...alertProps} />
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme?.background || '#0b1220', padding: 12 },
  text: { color: theme?.text || '#fff' },
  muted: { color: theme?.textSecondary || '#9CA3AF', padding: 12, textAlign: 'center' },
  search: { backgroundColor: theme?.surface || '#111827', color: theme?.text || '#fff', borderRadius: 10, padding: 12, borderColor: theme?.border || '#1f2937', borderWidth: 1, marginBottom: 8 },
  card: { backgroundColor: theme?.cardBackground || '#111827', borderRadius: 12, padding: 12, borderColor: theme?.border || '#1f2937', borderWidth: 1, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  name: { color: theme?.text || '#fff', fontWeight: '800', fontSize: 16, marginBottom: 4 },
  editButton: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: theme?.primary || '#2563eb' },
  editButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: theme?.surface || '#111827', borderRadius: 12, padding: 16, borderColor: theme?.border || '#1f2937', borderWidth: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { color: theme?.text || '#fff', fontSize: 18, fontWeight: '700' },
  modalClose: { color: theme?.textSecondary || '#9CA3AF', fontSize: 14 },
  modalLabel: { color: theme?.textSecondary || '#9CA3AF', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 6 },
  modalInput: { backgroundColor: theme?.background || '#0b1220', color: theme?.text || '#fff', borderRadius: 8, padding: 10, borderColor: theme?.border || '#1f2937', borderWidth: 1 },
  saveButton: { marginTop: 16, backgroundColor: theme?.primary || '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '700' },
});
