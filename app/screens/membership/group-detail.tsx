/**
 * Group Detail Screen
 * View and manage a specific group - add/remove members, edit details
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, RefreshControl } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { DashboardWallpaperBackground } from '@/components/membership/dashboard';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Authorized member types that can manage groups
const GROUP_MANAGER_TYPES = [
  'ceo', 'president', 'deputy_president', 'secretary_general', 'treasurer', 'national_admin',
  'youth_president', 'youth_deputy', 'youth_secretary',
  'women_president', 'women_deputy', 'women_secretary',
  'veterans_president',
  'regional_manager', 'provincial_manager', 'branch_manager',
];

interface GroupMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  member_type?: string;
}

interface GroupDetails {
  id: string;
  name: string;
  description: string | null;
  organization_id: string;
  program_id: string | null;
  members: string[]; // Array of member IDs
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator?: {
    first_name: string | null;
    last_name: string | null;
  };
}

export default function GroupDetailScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { showAlert, alertProps } = useAlertModal();
  const queryClient = useQueryClient();
  
  const groupId = typeof params.id === 'string' ? params.id : params.id?.[0] || null;
  const groupName = typeof params.name === 'string' ? params.name : params.name?.[0] || 'Group';
  
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Get organization ID from profile
  const orgId = (profile as any)?.organization_membership?.organization_id ||
                (profile as any)?.organization_id;

  // Check if user can manage groups
  const memberType = (profile as any)?.organization_membership?.member_type;
  const canManageGroups = memberType && GROUP_MANAGER_TYPES.includes(memberType);

  // Fetch group details
  const { data: group, isLoading: groupLoading, refetch: refetchGroup } = useQuery({
    queryKey: ['group-detail', groupId],
    queryFn: async () => {
      if (!groupId) return null;
      
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('study_groups')
        .select(`
          *,
          creator:profiles!created_by(first_name, last_name)
        `)
        .eq('id', groupId)
        .single();
      
      if (error) throw error;
      return data as GroupDetails;
    },
    enabled: !!groupId,
  });

  // Fetch group members' profiles
  const { data: members, isLoading: membersLoading, refetch: refetchMembers } = useQuery({
    queryKey: ['group-members', groupId, group?.members],
    queryFn: async () => {
      if (!group?.members || group.members.length === 0) return [];
      
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url')
        .in('id', group.members);
      
      if (error) throw error;
      return data as GroupMember[];
    },
    enabled: !!group?.members && group.members.length > 0,
  });

  // Fetch available members (organization members not in group)
  const { data: availableMembers, isLoading: availableLoading } = useQuery({
    queryKey: ['available-members', orgId, group?.members],
    queryFn: async () => {
      if (!orgId) return [];
      
      const supabase = assertSupabase();
      let query = supabase
        .from('organization_members')
        .select(`
          user_id,
          member_type,
          profile:profiles!user_id(id, first_name, last_name, email, avatar_url)
        `)
        .eq('organization_id', orgId)
        .eq('status', 'active');

      const { data, error } = await query;
      
      if (error) throw error;
      
      // Filter out members already in the group
      const existingMemberIds = group?.members || [];
      return (data || [])
        .filter((m: any) => m.profile && !existingMemberIds.includes(m.user_id))
        .map((m: any) => ({
          id: m.user_id,
          first_name: m.profile?.first_name,
          last_name: m.profile?.last_name,
          email: m.profile?.email,
          avatar_url: m.profile?.avatar_url,
          member_type: m.member_type,
        }));
    },
    enabled: !!orgId && showAddMemberModal,
  });

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      if (!groupId || !group) throw new Error('Group not found');
      
      const newMembers = [...(group.members || []), memberId];
      
      const supabase = assertSupabase();
      const { error } = await supabase
        .from('study_groups')
        .update({ 
          members: newMembers,
          updated_at: new Date().toISOString(),
        })
        .eq('id', groupId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] });
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
      queryClient.invalidateQueries({ queryKey: ['available-members'] });
      showAlert({ title: 'Success', message: 'Member added to group' });
    },
    onError: (error: any) => {
      showAlert({ title: 'Error', message: error.message || 'Failed to add member' });
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      if (!groupId || !group) throw new Error('Group not found');
      
      const newMembers = (group.members || []).filter((id: string) => id !== memberId);
      
      const supabase = assertSupabase();
      const { error } = await supabase
        .from('study_groups')
        .update({ 
          members: newMembers,
          updated_at: new Date().toISOString(),
        })
        .eq('id', groupId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] });
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
      queryClient.invalidateQueries({ queryKey: ['available-members'] });
    },
    onError: (error: any) => {
      showAlert({ title: 'Error', message: error.message || 'Failed to remove member' });
    },
  });

  // Update group mutation
  const updateGroupMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      if (!groupId) throw new Error('Group not found');
      
      const supabase = assertSupabase();
      const { error } = await supabase
        .from('study_groups')
        .update({ 
          name,
          description: description || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', groupId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] });
      queryClient.invalidateQueries({ queryKey: ['member-groups'] });
      setShowEditModal(false);
      showAlert({ title: 'Success', message: 'Group updated' });
    },
    onError: (error: any) => {
      showAlert({ title: 'Error', message: error.message || 'Failed to update group' });
    },
  });

  // Delete group mutation
  const deleteGroupMutation = useMutation({
    mutationFn: async () => {
      if (!groupId) throw new Error('Group not found');
      
      const supabase = assertSupabase();
      const { error } = await supabase
        .from('study_groups')
        .update({ is_active: false })
        .eq('id', groupId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-groups'] });
      router.back();
      showAlert({ title: 'Success', message: 'Group deleted' });
    },
    onError: (error: any) => {
      showAlert({ title: 'Error', message: error.message || 'Failed to delete group' });
    },
  });

  const handleRemoveMember = (member: GroupMember) => {
    showAlert({
      title: 'Remove Member',
      message: `Remove ${member.first_name} ${member.last_name} from this group?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: () => removeMemberMutation.mutate(member.id),
        },
      ],
    });
  };

  const handleDeleteGroup = () => {
    showAlert({
      title: 'Delete Group',
      message: 'Are you sure you want to delete this group? This action cannot be undone.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => deleteGroupMutation.mutate(),
        },
      ],
    });
  };

  const handleEditPress = () => {
    if (group) {
      setEditName(group.name);
      setEditDescription(group.description || '');
      setShowEditModal(true);
    }
  };

  // Filter available members by search
  const filteredAvailableMembers = useMemo(() => {
    if (!availableMembers) return [];
    if (!searchQuery.trim()) return availableMembers;
    
    const query = searchQuery.toLowerCase();
    return availableMembers.filter((m: GroupMember) => 
      m.first_name?.toLowerCase()?.includes(query) ||
      m.last_name?.toLowerCase()?.includes(query) ||
      m.email?.toLowerCase()?.includes(query)
    );
  }, [availableMembers, searchQuery]);

  const isLoading = groupLoading || membersLoading;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ title: groupName }} />
        <View style={styles.centered}>
          <EduDashSpinner size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ title: 'Group Not Found' }} />
        <View style={styles.centered}>
          <EmptyState
            icon="alert-circle-outline"
            title="Group Not Found"
            description="This group may have been deleted or you don't have permission to view it."
            actionLabel="Go Back"
            onActionPress={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen 
        options={{ 
          title: group.name,
          headerRight: canManageGroups ? () => (
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.headerButton} onPress={handleEditPress}>
                <Ionicons name="create-outline" size={24} color={theme.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerButton} onPress={handleDeleteGroup}>
                <Ionicons name="trash-outline" size={24} color={theme.error || '#EF4444'} />
              </TouchableOpacity>
            </View>
          ) : undefined,
        }} 
      />

      <DashboardWallpaperBackground>
        <ScrollView 
          style={styles.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => {
                refetchGroup();
                refetchMembers();
              }}
              tintColor={theme.primary}
            />
          }
        >
          {/* Group Info Card */}
          <Card padding={16} margin={0} elevation="small" style={styles.infoCard}>
            <Text style={styles.groupName}>{group.name}</Text>
            {group.description && (
              <Text style={styles.groupDescription}>{group.description}</Text>
            )}
            <View style={styles.groupMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="people" size={16} color={theme.textSecondary} />
                <Text style={styles.metaText}>
                  {members?.length || 0} member{(members?.length || 0) !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
                <Text style={styles.metaText}>
                  Created {new Date(group.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
            {group.creator && (
              <Text style={styles.creatorText}>
                By {group.creator.first_name} {group.creator.last_name}
              </Text>
            )}
          </Card>

          {/* Members Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {t('membership.members', { defaultValue: 'Members' })}
              </Text>
              {canManageGroups && (
                <TouchableOpacity 
                  style={[styles.addButton, { backgroundColor: theme.primary }]}
                  onPress={() => setShowAddMemberModal(true)}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              )}
            </View>

            {(!members || members.length === 0) ? (
              <Card padding={24} margin={0} elevation="small">
                <EmptyState
                  icon="people-outline"
                  title={t('membership.no_members', { defaultValue: 'No Members' })}
                  description={t('membership.add_members_prompt', { defaultValue: 'Add members to this group to get started' })}
                />
              </Card>
            ) : (
              <View style={styles.membersList}>
                {members.map((member) => (
                  <Card key={member.id} padding={12} margin={0} elevation="small" style={styles.memberCard}>
                    <View style={styles.memberRow}>
                      <View style={styles.memberAvatar}>
                        <Text style={styles.avatarText}>
                          {member.first_name?.[0]?.toUpperCase() || '?'}
                          {member.last_name?.[0]?.toUpperCase() || ''}
                        </Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>
                          {member.first_name} {member.last_name}
                        </Text>
                        {member.email && (
                          <Text style={styles.memberEmail}>{member.email}</Text>
                        )}
                      </View>
                      {canManageGroups && (
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => handleRemoveMember(member)}
                        >
                          <Ionicons name="close-circle" size={24} color={theme.error || '#EF4444'} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </DashboardWallpaperBackground>

      {/* Add Member Modal */}
      <Modal
        visible={showAddMemberModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddMemberModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddMemberModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Members</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.modalContent}>
            {/* Search */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={theme.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search members..."
                placeholderTextColor={theme.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {availableLoading ? (
              <View style={styles.centered}>
                <EduDashSpinner size="large" color={theme.primary} />
              </View>
            ) : filteredAvailableMembers.length === 0 ? (
              <View style={styles.centered}>
                <EmptyState
                  icon="people-outline"
                  title="No Available Members"
                  description="All organization members are already in this group"
                />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {filteredAvailableMembers.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {index > 0 && (
                      <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 60 }} />
                    )}
                    <TouchableOpacity
                      style={styles.availableMemberRow}
                      onPress={() => {
                        addMemberMutation.mutate(item.id);
                      }}
                    >
                      <View style={styles.memberAvatar}>
                        <Text style={styles.avatarText}>
                          {item.first_name?.[0]?.toUpperCase() || '?'}
                          {item.last_name?.[0]?.toUpperCase() || ''}
                        </Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>
                          {item.first_name} {item.last_name}
                        </Text>
                        {item.email && (
                          <Text style={styles.memberEmail}>{item.email}</Text>
                        )}
                      </View>
                      <Ionicons name="add-circle" size={28} color={theme.primary} />
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Edit Group Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Group</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.inputLabel}>Group Name *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter group name"
              placeholderTextColor={theme.textSecondary}
              value={editName}
              onChangeText={setEditName}
            />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Enter description (optional)"
              placeholderTextColor={theme.textSecondary}
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: theme.primary }]}
              onPress={() => updateGroupMutation.mutate({ 
                name: editName.trim(), 
                description: editDescription.trim() 
              })}
              disabled={updateGroupMutation.isPending || !editName.trim()}
            >
              {updateGroupMutation.isPending ? (
                <EduDashSpinner size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
    <AlertModal {...alertProps} />
    </>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 8,
  },
  infoCard: {
    marginBottom: 24,
  },
  groupName: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 8,
  },
  groupDescription: {
    fontSize: 15,
    color: theme.textSecondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  groupMeta: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  creatorText: {
    fontSize: 12,
    color: theme.textSecondary,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  membersList: {
    gap: 8,
  },
  memberCard: {
    marginBottom: 0,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.primary,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 2,
  },
  memberEmail: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  removeButton: {
    padding: 4,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: theme.text,
  },
  availableMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.text,
    marginBottom: 8,
    marginTop: 16,
  },
  textInput: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: theme.text,
    borderWidth: 1,
    borderColor: theme.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 32,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
