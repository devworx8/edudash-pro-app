/**
 * Group Management Screen
 *
 * Allows principals and teachers to create and manage school groups.
 * Uses principal_groups table (scoped by preschool_id/organization_id).
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, RefreshControl } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
const GROUP_TYPES = [
  { value: 'teacher_team', label: 'Teacher Team', icon: 'people-outline', color: '#6366F1' },
  { value: 'grade_group', label: 'Grade Group', icon: 'school-outline', color: '#10B981' },
  { value: 'subject_group', label: 'Subject Group', icon: 'book-outline', color: '#F59E0B' },
  { value: 'study_group', label: 'Study Group', icon: 'clipboard-outline', color: '#8B5CF6' },
  { value: 'parent_group', label: 'Parent Group', icon: 'chatbubbles-outline', color: '#06B6D4' },
  { value: 'custom', label: 'Custom', icon: 'apps-outline', color: '#64748B' },
];

interface PrincipalGroup {
  id: string;
  name: string;
  description: string | null;
  group_type: string | null;
  icon: string | null;
  color: string | null;
  preschool_id: string;
  created_by: string;
  created_at: string | null;
  is_active: boolean | null;
}

export default function GroupManagementScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const styles = useMemo(() => createStyles(theme, insets.top), [theme, insets.top]);
  const { showAlert, alertProps } = useAlertModal();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupType, setNewGroupType] = useState('teacher_team');

  const orgId = profile?.organization_id || profile?.preschool_id;
  const role = String(profile?.role || '').toLowerCase();
  const canManageGroups = ['teacher', 'principal', 'principal_admin', 'admin', 'super_admin', 'superadmin'].includes(role);

  const { data: groups, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['principal-groups', orgId],
    queryFn: async () => {
      if (!orgId) return [] as PrincipalGroup[];
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('principal_groups')
        .select('*')
        .eq('preschool_id', orgId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as PrincipalGroup[];
    },
    enabled: !!orgId,
  });

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !user?.id) {
        throw new Error('Missing organization or user');
      }

      const typeConfig = GROUP_TYPES.find((type) => type.value === newGroupType) || GROUP_TYPES[0];

      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('principal_groups')
        .insert({
          name: newGroupName.trim(),
          description: newGroupDescription.trim() || null,
          group_type: newGroupType,
          icon: typeConfig.icon,
          color: typeConfig.color,
          preschool_id: orgId,
          created_by: user.id,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as PrincipalGroup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['principal-groups'] });
      setShowCreateModal(false);
      setNewGroupName('');
      setNewGroupDescription('');
      setNewGroupType('teacher_team');
      showAlert({ title: 'Success', message: 'Group created successfully.', type: 'success' });
    },
    onError: (err: any) => {
      showAlert({ title: 'Error', message: err?.message || 'Failed to create group', type: 'error' });
    },
  });

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      showAlert({ title: 'Missing name', message: 'Please enter a group name.', type: 'warning' });
      return;
    }
    createGroupMutation.mutate();
  };

  const renderGroup = (group: PrincipalGroup) => {
    const typeConfig = GROUP_TYPES.find((type) => type.value === group.group_type) || GROUP_TYPES[0];
    return (
      <Card key={group.id} style={styles.groupCard} padding={16} elevation="small">
        <View style={styles.groupHeader}>
          <View style={[styles.groupIcon, { backgroundColor: (group.color || typeConfig.color) + '20' }]}> 
            <Ionicons name={(group.icon || typeConfig.icon) as any} size={22} color={group.color || typeConfig.color} />
          </View>
          <View style={styles.groupInfo}>
            <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
            {group.description ? (
              <Text style={styles.groupDescription} numberOfLines={2}>{group.description}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.groupMeta}>
          <View style={styles.metaChip}>
            <Text style={styles.metaText}>{typeConfig.label}</Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Groups', headerShown: true }} />

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Groups</Text>
          <Text style={styles.subtitle}>Create and manage teacher or learner groups</Text>
        </View>
        {canManageGroups && (
          <TouchableOpacity style={styles.addButton} onPress={() => setShowCreateModal(true)}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>New</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={theme.primary} />}
      >
        {!canManageGroups ? (
          <EmptyState
            icon="lock-closed"
            title="Access restricted"
            description="Only teachers and principals can manage groups."
          />
        ) : isLoading ? (
          <View style={styles.loadingState}>
            <EduDashSpinner color={theme.primary} />
            <Text style={styles.loadingText}>{t('common.loading', { defaultValue: 'Loading...' })}</Text>
          </View>
        ) : error ? (
          <View style={styles.loadingState}>
            <Text style={styles.errorText}>Unable to load groups. Pull to refresh.</Text>
          </View>
        ) : groups && groups.length > 0 ? (
          groups.map(renderGroup)
        ) : (
          <EmptyState
            icon="people"
            title="No groups yet"
            description="Create your first group to organize teachers, grades, or subjects."
            actionLabel="Create Group"
            onActionPress={() => setShowCreateModal(true)}
          />
        )}
      </ScrollView>

      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Group</Text>

            <TextInput
              style={styles.input}
              placeholder="Group name"
              placeholderTextColor={theme.textSecondary}
              value={newGroupName}
              onChangeText={setNewGroupName}
            />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Description (optional)"
              placeholderTextColor={theme.textSecondary}
              value={newGroupDescription}
              onChangeText={setNewGroupDescription}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.sectionLabel}>Group type</Text>
            <View style={styles.typeGrid}>
              {GROUP_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.typeChip,
                    newGroupType === type.value && { borderColor: type.color, backgroundColor: type.color + '20' },
                  ]}
                  onPress={() => setNewGroupType(type.value)}
                >
                  <Ionicons name={type.icon as any} size={16} color={type.color} />
                  <Text style={styles.typeLabel}>{type.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButtonGhost} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalButtonGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={handleCreateGroup}
                disabled={createGroupMutation.isPending}
              >
                {createGroupMutation.isPending ? (
                  <EduDashSpinner color="#fff" />
                ) : (
                  <Text style={styles.modalButtonText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any, _topInset: number) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.text,
  },
  subtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: theme.primary,
    borderRadius: 999,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    gap: 12,
  },
  groupCard: {
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  groupDescription: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 4,
  },
  groupMeta: {
    marginTop: 12,
    flexDirection: 'row',
  },
  metaChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  metaText: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  loadingState: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: theme.textSecondary,
  },
  errorText: {
    color: theme.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: theme.surface,
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
    marginBottom: 12,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 8,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  typeLabel: {
    fontSize: 12,
    color: theme.text,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 12,
  },
  modalButton: {
    backgroundColor: theme.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalButtonGhost: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
  },
  modalButtonGhostText: {
    color: theme.text,
    fontWeight: '600',
  },
});
