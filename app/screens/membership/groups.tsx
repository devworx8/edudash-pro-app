/**
 * Member Groups Screen
 * Manage and create groups for SOA organization members
 * Groups can be used for study groups, regional teams, special committees, etc.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, RefreshControl, Modal } from 'react-native';
import { Stack, router } from 'expo-router';
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
// Group types for SOA organization
const GROUP_TYPES = [
  { value: 'study_group', label: 'Study Group', icon: 'book-outline', color: '#3B82F6' },
  { value: 'committee', label: 'Committee', icon: 'people-outline', color: '#8B5CF6' },
  { value: 'project_team', label: 'Project Team', icon: 'briefcase-outline', color: '#10B981' },
  { value: 'regional_team', label: 'Regional Team', icon: 'location-outline', color: '#F59E0B' },
  { value: 'wing_group', label: 'Wing Group', icon: 'shield-outline', color: '#EC4899' },
  { value: 'custom', label: 'Custom', icon: 'apps-outline', color: '#6B7280' },
];

// Authorized member types that can manage groups
const GROUP_MANAGER_TYPES = [
  'ceo', 'president', 'deputy_president', 'secretary_general', 'treasurer', 'national_admin',
  'youth_president', 'youth_deputy', 'youth_secretary',
  'women_president', 'women_deputy', 'women_secretary',
  'veterans_president',
  'regional_manager', 'provincial_manager', 'branch_manager',
];

interface MemberGroup {
  id: string;
  name: string;
  description: string | null;
  group_type: string;
  organization_id: string;
  program_id: string | null;
  members: any[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator?: {
    first_name: string | null;
    last_name: string | null;
  };
  _count?: {
    members: number;
  };
}

export default function MemberGroupsScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { showAlert, alertProps } = useAlertModal();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupType, setNewGroupType] = useState('study_group');
  
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Get organization ID from profile
  const orgId = (profile as any)?.organization_membership?.organization_id ||
                (profile as any)?.organization_id;

  // Check if user can manage groups
  const memberType = (profile as any)?.organization_membership?.member_type;
  const canManageGroups = memberType && GROUP_MANAGER_TYPES.includes(memberType);

  // Fetch groups
  const { data: groups, isLoading, error, refetch } = useQuery({
    queryKey: ['member-groups', orgId, filterType],
    queryFn: async () => {
      if (!orgId) return [];
      
      const supabase = assertSupabase();
      let query = supabase
        .from('study_groups')
        .select(`
          *,
          creator:profiles!created_by(first_name, last_name)
        `)
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (filterType) {
        // Filter based on metadata or name patterns
        query = query.ilike('name', `%${filterType}%`);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data as MemberGroup[];
    },
    enabled: !!orgId,
  });

  // Create group mutation
  const createGroupMutation = useMutation({
    mutationFn: async ({ name, description, groupType }: { 
      name: string; 
      description: string; 
      groupType: string 
    }) => {
      if (!orgId || !user?.id) throw new Error('Missing required data');
      
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('study_groups')
        .insert({
          name,
          description: description || null,
          organization_id: orgId,
          created_by: user.id,
          members: [],
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-groups'] });
      setShowCreateModal(false);
      setNewGroupName('');
      setNewGroupDescription('');
      setNewGroupType('study_group');
      showAlert({ title: 'Success', message: 'Group created successfully' });
    },
    onError: (error: any) => {
      showAlert({ title: 'Error', message: error.message || 'Failed to create group' });
    },
  });

  // Filter groups by search
  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (!searchQuery.trim()) return groups;
    
    const query = searchQuery.toLowerCase();
    return groups.filter(g => 
      g.name.toLowerCase().includes(query) ||
      g.description?.toLowerCase()?.includes(query)
    );
  }, [groups, searchQuery]);

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      showAlert({ title: 'Error', message: 'Please enter a group name' });
      return;
    }
    
    createGroupMutation.mutate({
      name: newGroupName.trim(),
      description: newGroupDescription.trim(),
      groupType: newGroupType,
    });
  };

  const handleGroupPress = (group: MemberGroup) => {
    router.push({
      pathname: '/screens/membership/group-detail',
      params: { id: group.id, name: group.name },
    });
  };

  const getGroupTypeConfig = (typeName: string) => {
    // Try to determine group type from name
    const lowerName = typeName?.toLowerCase() || '';
    for (const type of GROUP_TYPES) {
      if (lowerName.includes(type.value.replace('_', ' '))) {
        return type;
      }
    }
    return GROUP_TYPES[5]; // Default to custom
  };

  const renderGroup = ({ item }: { item: MemberGroup }) => {
    const typeConfig = getGroupTypeConfig(item.name);
    const memberCount = Array.isArray(item.members) ? item.members.length : 0;

    return (
      <TouchableOpacity
        onPress={() => handleGroupPress(item)}
        activeOpacity={0.75}
      >
        <Card padding={16} margin={0} elevation="small" style={styles.groupCard}>
          <View style={styles.groupHeader}>
            <View style={[styles.groupIcon, { backgroundColor: typeConfig.color + '20' }]}>
              <Ionicons name={typeConfig.icon as any} size={24} color={typeConfig.color} />
            </View>
            <View style={styles.groupInfo}>
              <Text style={styles.groupName} numberOfLines={1}>{item.name}</Text>
              {item.description && (
                <Text style={styles.groupDescription} numberOfLines={2}>
                  {item.description}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
          </View>
          
          <View style={styles.groupMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="people" size={14} color={theme.textSecondary} />
              <Text style={styles.metaText}>
                {memberCount} member{memberCount !== 1 ? 's' : ''}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={theme.textSecondary} />
              <Text style={styles.metaText}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
            {item.creator && (
              <View style={styles.metaItem}>
                <Ionicons name="person-outline" size={14} color={theme.textSecondary} />
                <Text style={styles.metaText}>
                  {item.creator.first_name} {item.creator.last_name}
                </Text>
              </View>
            )}
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <>
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen 
        options={{ 
          title: t('membership.groups', { defaultValue: 'Groups' }),
          headerRight: canManageGroups ? () => (
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={() => setShowCreateModal(true)}
            >
              <Ionicons name="add-circle" size={28} color={theme.primary} />
            </TouchableOpacity>
          ) : undefined,
        }} 
      />

      <DashboardWallpaperBackground>
        <View style={styles.content}>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={theme.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('common.search', { defaultValue: 'Search groups...' })}
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Pills */}
          <View style={styles.filterRow}>
            <ScrollablePills
              items={[
                { value: null, label: 'All' },
                ...GROUP_TYPES.map(t => ({ value: t.value, label: t.label })),
              ]}
              selected={filterType}
              onSelect={setFilterType}
              theme={theme}
            />
          </View>

          {/* Groups List */}
          {isLoading ? (
            <View style={styles.centered}>
              <EduDashSpinner size="large" color={theme.primary} />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <EmptyState
                icon="alert-circle-outline"
                title={t('common.error', { defaultValue: 'Error' })}
                description={t('common.error_loading', { defaultValue: 'Failed to load groups' })}
                actionLabel={t('common.retry', { defaultValue: 'Retry' })}
                onActionPress={() => refetch()}
              />
            </View>
          ) : filteredGroups.length === 0 ? (
            <View style={styles.centered}>
              <EmptyState
                icon="people-outline"
                title={t('membership.no_groups', { defaultValue: 'No Groups Yet' })}
                description={
                  canManageGroups 
                    ? t('membership.create_group_prompt', { defaultValue: 'Create groups to organize members for projects, studies, and committees' })
                    : t('membership.no_groups_desc', { defaultValue: 'Groups will appear here when created by administrators' })
                }
                actionLabel={canManageGroups ? t('membership.create_group', { defaultValue: 'Create Group' }) : undefined}
                onActionPress={canManageGroups ? () => setShowCreateModal(true) : undefined}
              />
            </View>
          ) : (
            <FlatList
              data={filteredGroups}
              renderItem={renderGroup}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isLoading}
                  onRefresh={refetch}
                  tintColor={theme.primary}
                />
              }
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            />
          )}
        </View>
      </DashboardWallpaperBackground>

      {/* Create Group Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {t('membership.create_group', { defaultValue: 'Create Group' })}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.modalContent}>
            {/* Group Type Selection */}
            <Text style={styles.inputLabel}>
              {t('membership.group_type', { defaultValue: 'Group Type' })}
            </Text>
            <View style={styles.typeGrid}>
              {GROUP_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.typeOption,
                    newGroupType === type.value && { 
                      borderColor: type.color, 
                      backgroundColor: type.color + '10' 
                    },
                  ]}
                  onPress={() => setNewGroupType(type.value)}
                >
                  <Ionicons 
                    name={type.icon as any} 
                    size={24} 
                    color={newGroupType === type.value ? type.color : theme.textSecondary} 
                  />
                  <Text style={[
                    styles.typeLabel,
                    newGroupType === type.value && { color: type.color }
                  ]}>
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Group Name */}
            <Text style={styles.inputLabel}>
              {t('membership.group_name', { defaultValue: 'Group Name' })} *
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder={t('membership.enter_group_name', { defaultValue: 'Enter group name' })}
              placeholderTextColor={theme.textSecondary}
              value={newGroupName}
              onChangeText={setNewGroupName}
              autoFocus
            />

            {/* Group Description */}
            <Text style={styles.inputLabel}>
              {t('membership.description', { defaultValue: 'Description' })}
            </Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder={t('membership.enter_description', { defaultValue: 'Enter description (optional)' })}
              placeholderTextColor={theme.textSecondary}
              value={newGroupDescription}
              onChangeText={setNewGroupDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* Create Button */}
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: theme.primary }]}
              onPress={handleCreateGroup}
              disabled={createGroupMutation.isPending || !newGroupName.trim()}
            >
              {createGroupMutation.isPending ? (
                <EduDashSpinner size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text style={styles.createButtonText}>
                    {t('membership.create_group', { defaultValue: 'Create Group' })}
                  </Text>
                </>
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

// Scrollable filter pills component
function ScrollablePills({ 
  items, 
  selected, 
  onSelect, 
  theme 
}: { 
  items: { value: string | null; label: string }[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  theme: any;
}) {
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(item) => item.value || 'all'}
      showsHorizontalScrollIndicator={false}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[
            {
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
              marginRight: 8,
              backgroundColor: selected === item.value ? theme.primary : theme.surface,
              borderWidth: 1,
              borderColor: selected === item.value ? theme.primary : theme.border,
            },
          ]}
          onPress={() => onSelect(item.value)}
        >
          <Text style={{ 
            color: selected === item.value ? '#fff' : theme.text,
            fontSize: 13,
            fontWeight: '500',
          }}>
            {item.label}
          </Text>
        </TouchableOpacity>
      )}
    />
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
  headerButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: theme.text,
  },
  filterRow: {
    marginBottom: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 32,
  },
  groupCard: {
    borderRadius: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 2,
  },
  groupDescription: {
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
  },
  groupMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: theme.textSecondary,
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeOption: {
    width: '31%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: 'center',
    gap: 6,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: theme.textSecondary,
    textAlign: 'center',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    marginTop: 32,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
