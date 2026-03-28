/**
 * Create Group Screen
 * 
 * Allows teachers and principals to create:
 * - Class groups (auto-adds all parents + teacher)
 * - Custom parent groups (select specific parents)
 * - Announcement channels (one-way broadcast)
 * 
 * Parents can also create parent-to-parent DMs from here.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import {
  getGroupCreationCopy,
  getReplyPolicyCopy,
} from '@/lib/messaging/groupCreationSuggestions';
import {
  useOrgMembers,
  useOrgClasses,
  useCreateClassGroup,
  useCreateParentGroup,
  useCreateAnnouncementChannel,
  useCreateParentThread,
  OrgMember,
} from '@/hooks/useGroupMessaging';

type GroupType = 'class_group' | 'parent_group' | 'announcement' | 'parent_dm';

export default function CreateGroupScreen() {
  const { theme, isDark } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { showAlert, alertProps } = useAlertModal();
  const userRole = (profile as any)?.role || 'parent';
  const params = useLocalSearchParams<{ preselectedClassId?: string; groupType?: GroupType }>();

  // State
  const [groupType, setGroupType] = useState<GroupType | null>(params.groupType ?? null);
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(params.preselectedClassId ?? null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [audience, setAudience] = useState<'all_parents' | 'all_teachers' | 'all_staff' | 'everyone'>('all_parents');
  const [allowReplies, setAllowReplies] = useState(true);
  const parentOnlyMemberFilter = groupType === 'parent_group' || groupType === 'parent_dm'
    ? ['parent']
    : undefined;

  // Data
  const { data: members = [], isLoading: membersLoading } = useOrgMembers(
    parentOnlyMemberFilter
  );
  const { data: classes = [], isLoading: classesLoading } = useOrgClasses();

  // Mutations
  const createClassGroup = useCreateClassGroup();
  const createParentGroup = useCreateParentGroup();
  const createAnnouncement = useCreateAnnouncementChannel();
  const createParentThread = useCreateParentThread();

  const isStaff = ['teacher', 'principal', 'admin', 'principal_admin', 'super_admin'].includes(userRole);
  const isPrincipal = ['principal', 'admin', 'principal_admin', 'super_admin'].includes(userRole);
  const threadScreenPath = isPrincipal
    ? '/screens/principal-message-thread'
    : userRole === 'teacher'
      ? '/screens/teacher-message-thread'
      : '/screens/parent-message-thread';

  const isCreating = createClassGroup.isPending || createParentGroup.isPending
    || createAnnouncement.isPending || createParentThread.isPending;
  const selectedClassName = useMemo(
    () => classes.find((cls) => cls.id === selectedClassId)?.name ?? null,
    [classes, selectedClassId],
  );
  const groupCopy = useMemo(
    () => getGroupCreationCopy({
      groupType,
      audience,
      className: selectedClassName,
      allowReplies,
    }),
    [allowReplies, audience, groupType, selectedClassName],
  );
  const replyPolicy = useMemo(
    () => getReplyPolicyCopy({ groupType, allowReplies }),
    [allowReplies, groupType],
  );

  // Filter members by search
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(m =>
      m.display_name.toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      m.role.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  const toggleMember = (id: string) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    try {
      let threadId: string | undefined;

      if (groupType === 'class_group') {
        if (!selectedClassId) {
          showAlert({ title: 'Select a Class', message: 'Please select a class to create a group for.' });
          return;
        }
        threadId = await createClassGroup.mutateAsync({
          classId: selectedClassId,
          groupName: groupName.trim() || undefined,
        });
      } else if (groupType === 'parent_group') {
        if (!groupName.trim()) {
          showAlert({ title: 'Group Name', message: 'Please enter a name for your group.' });
          return;
        }
        if (selectedMembers.length === 0) {
          showAlert({ title: 'Select Members', message: 'Please select at least one member.' });
          return;
        }
        threadId = await createParentGroup.mutateAsync({
          groupName: groupName.trim(),
          parentIds: selectedMembers,
          description: description.trim() || undefined,
          allowReplies,
        });
      } else if (groupType === 'announcement') {
        if (!groupName.trim()) {
          showAlert({ title: 'Channel Name', message: 'Please enter a name for the announcement channel.' });
          return;
        }
        threadId = await createAnnouncement.mutateAsync({
          channelName: groupName.trim(),
          description: description.trim() || undefined,
          audience,
        });
      } else if (groupType === 'parent_dm') {
        if (selectedMembers.length !== 1) {
          showAlert({ title: 'Select a Parent', message: 'Please select one parent to message.' });
          return;
        }
        threadId = await createParentThread.mutateAsync({ otherParentId: selectedMembers[0] });
      }

      if (threadId) {
        const isGroupThread = groupType !== 'parent_dm';
        const threadTypeParam =
          groupType === 'class_group' ? 'class_group' :
          groupType === 'parent_group' ? 'parent_group' :
          groupType === 'announcement' ? 'announcement' : '';
        router.replace({
          pathname: threadScreenPath,
          params: {
            threadId,
            isGroup: isGroupThread ? '1' : '0',
            threadType: threadTypeParam,
            title: groupName.trim() || undefined,
          },
        });
      }
    } catch (error: any) {
      showAlert({
        title: 'Error',
        message: error?.message || 'Failed to create group. Please try again.',
      });
    }
  };

  const bg = isDark ? '#0f172a' : '#f8fafc';
  const cardBg = isDark ? '#1e293b' : '#ffffff';
  const textColor = isDark ? '#e2e8f0' : '#1e293b';
  const subtextColor = isDark ? '#94a3b8' : '#64748b';
  const borderColor = isDark ? '#334155' : '#e2e8f0';
  const accentColor = '#06b6d4';
  const formatRoleLabel = (role: string) =>
    role.split('_').filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

  const renderSuggestionChips = (
    suggestions: string[],
    onSelect: (value: string) => void,
  ) => {
    if (suggestions.length === 0) return null;

    return (
      <View style={styles.suggestionSection}>
        <Text style={[styles.suggestionLabel, { color: subtextColor }]}>Quick ideas</Text>
        <View style={styles.suggestionWrap}>
          {suggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion}
              style={[styles.suggestionChip, { borderColor, backgroundColor: cardBg }]}
              onPress={() => onSelect(suggestion)}
              activeOpacity={0.8}
            >
              <Text style={[styles.suggestionChipText, { color: textColor }]}>
                {suggestion}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  // ─── Step 1: Select group type ──────────────────────
  if (!groupType) {
    return (
      <View style={[styles.container, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textColor }]}>New Group</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <Text style={[styles.sectionTitle, { color: subtextColor }]}>
            What would you like to create?
          </Text>

          {isStaff && (
            <TouchableOpacity
              style={[styles.typeCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => setGroupType('class_group')}
            >
              <View style={[styles.typeIcon, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="school" size={24} color="#3b82f6" />
              </View>
              <View style={styles.typeInfo}>
                <Text style={[styles.typeTitle, { color: textColor }]}>Class Group</Text>
                <Text style={[styles.typeDesc, { color: subtextColor }]}>
                  Auto-adds all parents & teacher for a class
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={subtextColor} />
            </TouchableOpacity>
          )}

          {isStaff && (
            <TouchableOpacity
              style={[styles.typeCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => setGroupType('parent_group')}
            >
              <View style={[styles.typeIcon, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="people" size={24} color="#22c55e" />
              </View>
              <View style={styles.typeInfo}>
                <Text style={[styles.typeTitle, { color: textColor }]}>Parent Group</Text>
                <Text style={[styles.typeDesc, { color: subtextColor }]}>
                  Create a custom group with specific parents
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={subtextColor} />
            </TouchableOpacity>
          )}

          {isPrincipal && (
            <TouchableOpacity
              style={[styles.typeCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => setGroupType('announcement')}
            >
              <View style={[styles.typeIcon, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="megaphone" size={24} color="#f59e0b" />
              </View>
              <View style={styles.typeInfo}>
                <Text style={[styles.typeTitle, { color: textColor }]}>Announcement Channel</Text>
                <Text style={[styles.typeDesc, { color: subtextColor }]}>
                  One-way broadcast to parents, teachers, or everyone
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={subtextColor} />
            </TouchableOpacity>
          )}

          {!isStaff && (
            <TouchableOpacity
              style={[styles.typeCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => setGroupType('parent_dm')}
            >
              <View style={[styles.typeIcon, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="chatbubble" size={24} color="#8b5cf6" />
              </View>
              <View style={styles.typeInfo}>
                <Text style={[styles.typeTitle, { color: textColor }]}>
                  Message a Parent
                </Text>
                <Text style={[styles.typeDesc, { color: subtextColor }]}>
                  Direct message another parent at your school
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={subtextColor} />
            </TouchableOpacity>
          )}
        </ScrollView>
        <AlertModal {...alertProps} />
      </View>
    );
  }

  // ─── Step 2: Configure group ────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => setGroupType(null)} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>
          {groupType === 'class_group' ? 'Class Group' :
           groupType === 'parent_group' ? 'Parent Group' :
           groupType === 'announcement' ? 'Announcement' :
           'Message a Parent'}
        </Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={isCreating}
          style={[styles.createBtn, { opacity: isCreating ? 0.5 : 1 }]}
        >
          {isCreating ? (
            <EduDashSpinner size="small" color={accentColor} />
          ) : (
            <Text style={[styles.createBtnText, { color: accentColor }]}>
              {groupType === 'parent_dm' ? 'Chat' : 'Create'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* ─── Class Group: Select class ─── */}
        {groupType === 'class_group' && (
          <>
            <Text style={[styles.sectionTitle, { color: subtextColor }]}>Select a Class</Text>
            {classesLoading ? (
              <SkeletonLoader width="100%" height={60} />
            ) : classes.length === 0 ? (
              <Text style={[styles.emptyText, { color: subtextColor }]}>No classes found.</Text>
            ) : (
              classes.map(cls => (
                <TouchableOpacity
                  key={cls.id}
                  style={[
                    styles.selectItem,
                    { backgroundColor: cardBg, borderColor },
                    selectedClassId === cls.id && { borderColor: accentColor, borderWidth: 2 },
                  ]}
                  onPress={() => setSelectedClassId(cls.id)}
                >
                  <Ionicons
                    name={selectedClassId === cls.id ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selectedClassId === cls.id ? accentColor : subtextColor}
                  />
                  <Text style={[styles.selectItemText, { color: textColor }]}>{cls.name}</Text>
                </TouchableOpacity>
              ))
            )}
            <Text style={[styles.sectionTitle, { color: subtextColor, marginTop: 20 }]}>
              Group Name (optional)
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
              placeholder={groupCopy.namePlaceholder}
              placeholderTextColor={subtextColor}
              value={groupName}
              onChangeText={setGroupName}
            />
            {renderSuggestionChips(groupCopy.nameSuggestions, setGroupName)}
          </>
        )}

        {/* ─── Parent Group: Name + Select parents ─── */}
        {groupType === 'parent_group' && (
          <>
            <Text style={[styles.sectionTitle, { color: subtextColor }]}>Group Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
              placeholder={groupCopy.namePlaceholder}
              placeholderTextColor={subtextColor}
              value={groupName}
              onChangeText={setGroupName}
            />
            {renderSuggestionChips(groupCopy.nameSuggestions, setGroupName)}
            <Text style={[styles.sectionTitle, { color: subtextColor }]}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.multilineInput, { backgroundColor: cardBg, color: textColor, borderColor }]}
              placeholder={groupCopy.descriptionPlaceholder}
              placeholderTextColor={subtextColor}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            {renderSuggestionChips(groupCopy.descriptionSuggestions, setDescription)}
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: textColor }]}>Allow Replies</Text>
              <TouchableOpacity onPress={() => setAllowReplies(!allowReplies)}>
                <Ionicons
                  name={allowReplies ? 'toggle' : 'toggle-outline'}
                  size={40}
                  color={allowReplies ? accentColor : subtextColor}
                />
              </TouchableOpacity>
            </View>
            {replyPolicy ? (
              <View style={[styles.infoCard, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.infoCardTitle, { color: textColor }]}>{replyPolicy.title}</Text>
                <Text style={[styles.infoCardText, { color: subtextColor }]}>{replyPolicy.body}</Text>
              </View>
            ) : null}
            {renderMemberSelector()}
          </>
        )}

        {/* ─── Announcement Channel ─── */}
        {groupType === 'announcement' && (
          <>
            <Text style={[styles.sectionTitle, { color: subtextColor }]}>Channel Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
              placeholder={groupCopy.namePlaceholder}
              placeholderTextColor={subtextColor}
              value={groupName}
              onChangeText={setGroupName}
            />
            {renderSuggestionChips(groupCopy.nameSuggestions, setGroupName)}
            <Text style={[styles.sectionTitle, { color: subtextColor }]}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.multilineInput, { backgroundColor: cardBg, color: textColor, borderColor }]}
              placeholder={groupCopy.descriptionPlaceholder}
              placeholderTextColor={subtextColor}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            {renderSuggestionChips(groupCopy.descriptionSuggestions, setDescription)}
            <Text style={[styles.sectionTitle, { color: subtextColor }]}>Audience</Text>
            {(['all_parents', 'all_teachers', 'all_staff', 'everyone'] as const).map(a => (
              <TouchableOpacity
                key={a}
                style={[
                  styles.selectItem,
                  { backgroundColor: cardBg, borderColor },
                  audience === a && { borderColor: accentColor, borderWidth: 2 },
                ]}
                onPress={() => setAudience(a)}
              >
                <Ionicons
                  name={audience === a ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={audience === a ? accentColor : subtextColor}
                />
                <Text style={[styles.selectItemText, { color: textColor }]}>
                  {a === 'all_parents' ? 'All Parents' :
                   a === 'all_teachers' ? 'All Teachers' :
                   a === 'all_staff' ? 'All Staff' : 'Everyone'}
                </Text>
              </TouchableOpacity>
            ))}
            {replyPolicy ? (
              <View style={[styles.infoCard, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.infoCardTitle, { color: textColor }]}>{replyPolicy.title}</Text>
                <Text style={[styles.infoCardText, { color: subtextColor }]}>{replyPolicy.body}</Text>
              </View>
            ) : null}
          </>
        )}

        {/* ─── Parent DM: Select one parent ─── */}
        {groupType === 'parent_dm' && renderMemberSelector(true)}
      </ScrollView>
      <AlertModal {...alertProps} />
    </View>
  );

  // ─── Member selector component ──────────────────────
  function renderMemberSelector(singleSelect = false) {
    const roleFilter = groupType === 'parent_dm' || groupType === 'parent_group' ? ['parent'] : undefined;
    const displayMembers = roleFilter
      ? filteredMembers.filter(m => roleFilter.includes(m.role))
      : filteredMembers;

    const allSelected = displayMembers.length > 0 && displayMembers.every(m => selectedMembers.includes(m.id));

    return (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={[styles.sectionTitle, { color: subtextColor, marginBottom: 0 }]}>
            {singleSelect ? 'Select a Parent' : `Select Members (${selectedMembers.length} selected)`}
          </Text>
          {!singleSelect && displayMembers.length > 0 && (
            <TouchableOpacity onPress={() => setSelectedMembers(allSelected ? [] : displayMembers.map(m => m.id))}>
              <Text style={{ color: accentColor, fontSize: 13, fontWeight: '600' }}>
                {allSelected ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <TextInput
          style={[styles.searchInput, { backgroundColor: cardBg, color: textColor, borderColor, marginTop: 10 }]}
          placeholder="Search by name or email..."
          placeholderTextColor={subtextColor}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {membersLoading ? (
          <SkeletonLoader width="100%" height={60} />
        ) : displayMembers.length === 0 ? (
          <Text style={[styles.emptyText, { color: subtextColor }]}>
            {searchQuery ? 'No matches found.' : 'No members found in your school.'}
          </Text>
        ) : (
          displayMembers.map(member => {
            const isSelected = selectedMembers.includes(member.id);
            return (
              <TouchableOpacity
                key={member.id}
                style={[
                  styles.memberItem,
                  { backgroundColor: cardBg, borderColor },
                  isSelected && { borderColor: accentColor, borderWidth: 2 },
                ]}
                onPress={() => {
                  if (singleSelect) {
                    setSelectedMembers([member.id]);
                  } else {
                    toggleMember(member.id);
                  }
                }}
              >
                <View style={[styles.avatar, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]}>
                  <Text style={[styles.avatarText, { color: accentColor }]}>
                    {member.initials}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={[styles.memberName, { color: textColor }]}>
                    {member.display_name}
                  </Text>
                  <Text style={[styles.memberRole, { color: subtextColor }]}>
                    {member.email ? `${formatRoleLabel(member.role)} • ${member.email}` : formatRoleLabel(member.role)}
                  </Text>
                </View>
                <Ionicons
                  name={isSelected
                    ? (singleSelect ? 'radio-button-on' : 'checkbox')
                    : (singleSelect ? 'radio-button-off' : 'square-outline')
                  }
                  size={22}
                  color={isSelected ? accentColor : subtextColor}
                />
              </TouchableOpacity>
            );
          })
        )}
      </>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  createBtn: { width: 60, alignItems: 'flex-end' },
  createBtnText: { fontSize: 16, fontWeight: '600' },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  typeInfo: { flex: 1 },
  typeTitle: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  typeDesc: { fontSize: 13 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  selectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  selectItemText: { fontSize: 15, fontWeight: '500' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  toggleLabel: { fontSize: 15, fontWeight: '500' },
  infoCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoCardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  infoCardText: { fontSize: 13, lineHeight: 18 },
  suggestionSection: {
    marginTop: -6,
    marginBottom: 16,
  },
  suggestionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  suggestionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  suggestionChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600' },
  memberRole: { fontSize: 12, marginTop: 1 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 20 },
});
