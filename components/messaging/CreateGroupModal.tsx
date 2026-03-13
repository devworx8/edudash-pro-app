/**
 * CreateGroupModal — Native full-screen modal for group creation (M7)
 *
 * Step-based flow:
 *   1. Group type selection (Class Group, Parent Group, Announcement Channel)
 *   2. Group name + description
 *   3. Member selection (searchable, with chips for selected members)
 *   4. Confirm + Create
 *
 * Uses existing hooks from useGroupMessaging.ts for Supabase RPCs.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { toast } from '@/components/ui/ToastProvider';
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
  OrgMember,
} from '@/hooks/useGroupMessaging';

type GroupType = 'class_group' | 'parent_group' | 'announcement';
type Step = 'type' | 'details' | 'members' | 'confirm';

// ─── Emoji auto-mapping by class name keywords ───────────────────
const CLASS_EMOJI_MAP: Record<string, string> = {
  art: '🎨', craft: '🎨', draw: '🎨',
  science: '🔬', stem: '🔬', lab: '🔬',
  sport: '⚽', pe: '⚽', physical: '⚽', athletics: '⚽',
  music: '🎵', choir: '🎵', band: '🎵', sing: '🎵',
  math: '📐', maths: '📐', numeracy: '📐',
  english: '📖', reading: '📖', literacy: '📖', language: '📖',
  history: '🏛️', social: '🏛️',
  geography: '🌍', nature: '🌿', garden: '🌿',
  tech: '💻', computer: '💻', coding: '💻', ict: '💻',
  drama: '🎭', theatre: '🎭',
  nursery: '🧒', reception: '🧒', grade_r: '🧒', 'grade r': '🧒',
  baby: '👶', toddler: '👶',
};
const EMOJI_OPTIONS = ['📚', '🎨', '🔬', '⚽', '🎵', '📐', '📖', '🏛️', '🌍', '💻', '🎭', '🧒', '👶', '🌿', '🌟', '💡', '📝', '🎓', '🏫', '❤️'];

function autoSelectEmoji(className: string): string {
  const lower = className.toLowerCase();
  for (const [keyword, emoji] of Object.entries(CLASS_EMOJI_MAP)) {
    if (lower.includes(keyword)) return emoji;
  }
  return '📚';
}

interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onGroupCreated: (threadId: string) => void;
}

const GROUP_TYPES: {
  key: GroupType;
  label: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  requiredRole: 'staff' | 'principal';
}[] = [
  {
    key: 'class_group',
    label: 'Class Group',
    desc: 'Auto-adds all parents & teacher for a class',
    icon: 'school',
    iconBg: '#dbeafe',
    iconColor: '#3b82f6',
    requiredRole: 'staff',
  },
  {
    key: 'parent_group',
    label: 'Parent Group',
    desc: 'Create a custom group with specific parents',
    icon: 'people',
    iconBg: '#dcfce7',
    iconColor: '#22c55e',
    requiredRole: 'staff',
  },
  {
    key: 'announcement',
    label: 'Announcement Channel',
    desc: 'One-way broadcast to parents, teachers, or everyone',
    icon: 'megaphone',
    iconBg: '#fef3c7',
    iconColor: '#f59e0b',
    requiredRole: 'principal',
  },
];

export function CreateGroupModal({
  visible,
  onClose,
  onGroupCreated,
}: CreateGroupModalProps) {
  const { theme, isDark } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const userRole = (profile as any)?.role || 'parent';
  const isStaff = ['teacher', 'principal', 'admin', 'principal_admin', 'super_admin'].includes(userRole);
  const isPrincipal = ['principal', 'admin', 'principal_admin', 'super_admin'].includes(userRole);

  const [step, setStep] = useState<Step>('type');
  const [groupType, setGroupType] = useState<GroupType | null>(null);
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [audience, setAudience] = useState<'all_parents' | 'all_teachers' | 'all_staff' | 'everyone'>('all_parents');
  const [allowReplies, setAllowReplies] = useState(true);
  const [groupEmoji, setGroupEmoji] = useState<string>('📚');
  const memberRoleFilter = groupType === 'parent_group' ? ['parent'] : undefined;

  const { data: members = [], isLoading: membersLoading } = useOrgMembers(memberRoleFilter);
  const { data: classes = [], isLoading: classesLoading } = useOrgClasses();

  const createClassGroup = useCreateClassGroup();
  const createParentGroup = useCreateParentGroup();
  const createAnnouncement = useCreateAnnouncementChannel();
  const isCreating =
    createClassGroup.isPending ||
    createParentGroup.isPending ||
    createAnnouncement.isPending;

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(
      (m) =>
        m.display_name.toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q),
    );
  }, [members, searchQuery]);

  const toggleMember = useCallback((id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }, []);

  const resetState = useCallback(() => {
    setStep('type');
    setGroupType(null);
    setGroupName('');
    setDescription('');
    setSelectedClassId(null);
    setSelectedMembers([]);
    setSearchQuery('');
    setAudience('all_parents');
    setAllowReplies(true);
    setGroupEmoji('📚');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleSelectType = useCallback((type: GroupType) => {
    setGroupType(type);
    if (type === 'class_group') {
      setStep('members');
    } else {
      setStep('details');
    }
  }, []);

  const handleSelectClass = useCallback((classId: string) => {
    setSelectedClassId(classId);
    const cls = classes.find((c) => c.id === classId);
    if (cls) setGroupEmoji(autoSelectEmoji(cls.name));
  }, [classes]);

  const handleNextFromDetails = useCallback(() => {
    if (!groupName.trim()) {
      toast.warn('Please enter a name for the group.');
      return;
    }
    if (groupType === 'announcement') {
      setStep('confirm');
    } else {
      setStep('members');
    }
  }, [groupName, groupType]);

  const handleNextFromMembers = useCallback(() => {
    if (groupType === 'class_group' && !selectedClassId) {
      toast.warn('Please select a class.');
      return;
    }
    if (groupType === 'parent_group' && selectedMembers.length === 0) {
      toast.warn('Please select at least one member.');
      return;
    }
    setStep('confirm');
  }, [groupType, selectedClassId, selectedMembers]);

  const handleBack = useCallback(() => {
    if (step === 'confirm') {
      if (groupType === 'announcement') {
        setStep('details');
      } else {
        setStep('members');
      }
    } else if (step === 'members') {
      if (groupType === 'class_group') {
        setStep('type');
      } else {
        setStep('details');
      }
    } else if (step === 'details') {
      setStep('type');
    } else {
      handleClose();
    }
  }, [step, groupType, handleClose]);

  const handleCreate = useCallback(async () => {
    try {
      let threadId: string | undefined;

      if (groupType === 'class_group' && selectedClassId) {
        threadId = await createClassGroup.mutateAsync({
          classId: selectedClassId,
          groupName: groupName.trim() || undefined,
        });
        // Set group emoji on the newly created thread
        if (threadId && groupEmoji) {
          try {
            const client = (await import('@/lib/supabase')).assertSupabase();
            await client
              .from('message_threads')
              .update({ group_emoji: groupEmoji })
              .eq('id', threadId);
          } catch {}
        }
      } else if (groupType === 'parent_group') {
        threadId = await createParentGroup.mutateAsync({
          groupName: groupName.trim(),
          parentIds: selectedMembers,
          description: description.trim() || undefined,
          allowReplies,
        });
      } else if (groupType === 'announcement') {
        threadId = await createAnnouncement.mutateAsync({
          channelName: groupName.trim(),
          description: description.trim() || undefined,
          audience,
        });
      }

      if (threadId) {
        toast.success('Group created successfully!');
        resetState();
        onGroupCreated(threadId);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create group.');
    }
  }, [
    groupType,
    selectedClassId,
    groupName,
    groupEmoji,
    selectedMembers,
    description,
    audience,
    allowReplies,
    createClassGroup,
    createParentGroup,
    createAnnouncement,
    resetState,
    onGroupCreated,
  ]);

  const selectedClassName = classes.find((c) => c.id === selectedClassId)?.name;
  const selectedMemberNames = members
    .filter((m) => selectedMembers.includes(m.id))
    .map((m) => m.display_name);
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

  const bg = isDark ? '#0f172a' : '#f8fafc';
  const cardBg = isDark ? '#1e293b' : '#ffffff';
  const textColor = isDark ? '#e2e8f0' : '#1e293b';
  const subtextColor = isDark ? '#94a3b8' : '#64748b';
  const borderColor = isDark ? '#334155' : '#e2e8f0';
  const accentColor = '#06b6d4';
  const formatRoleLabel = (role: string) =>
    role.split('_').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
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

  const stepTitle =
    step === 'type'
      ? 'New Group'
      : step === 'details'
        ? 'Group Details'
        : step === 'members'
          ? groupType === 'class_group'
            ? 'Select Class'
            : 'Select Members'
          : 'Confirm';

  const canProceed =
    step === 'confirm'
      ? !isCreating
      : step === 'members'
        ? groupType === 'class_group'
          ? !!selectedClassId
          : selectedMembers.length > 0
        : step === 'details'
          ? !!groupName.trim()
          : true;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: borderColor, paddingTop: insets.top + 8 },
          ]}
        >
          <TouchableOpacity onPress={handleBack} style={styles.headerBtn}>
            <Ionicons
              name={step === 'type' ? 'close' : 'arrow-back'}
              size={24}
              color={textColor}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textColor }]}>
            {stepTitle}
          </Text>
          <View style={styles.headerBtn}>
            {step !== 'type' && step !== 'confirm' && (
              <TouchableOpacity
                onPress={
                  step === 'details'
                    ? handleNextFromDetails
                    : handleNextFromMembers
                }
                disabled={!canProceed}
                style={{ opacity: canProceed ? 1 : 0.4 }}
              >
                <Text style={[styles.nextText, { color: accentColor }]}>
                  Next
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Step 1: Type selection ── */}
          {step === 'type' && (
            <>
              <Text style={[styles.sectionTitle, { color: subtextColor }]}>
                What would you like to create?
              </Text>
              {GROUP_TYPES.filter((gt) =>
                gt.requiredRole === 'principal' ? isPrincipal : isStaff,
              ).map((gt) => (
                <TouchableOpacity
                  key={gt.key}
                  style={[styles.typeCard, { backgroundColor: cardBg, borderColor }]}
                  onPress={() => handleSelectType(gt.key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.typeIcon, { backgroundColor: gt.iconBg }]}>
                    <Ionicons name={gt.icon} size={24} color={gt.iconColor} />
                  </View>
                  <View style={styles.typeInfo}>
                    <Text style={[styles.typeTitle, { color: textColor }]}>
                      {gt.label}
                    </Text>
                    <Text style={[styles.typeDesc, { color: subtextColor }]}>
                      {gt.desc}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={subtextColor} />
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* ── Step 2: Details ── */}
          {step === 'details' && (
            <>
              <Text style={[styles.sectionTitle, { color: subtextColor }]}>
                {groupType === 'announcement' ? 'Channel Name' : 'Group Name'}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
                placeholder={groupCopy.namePlaceholder}
                placeholderTextColor={subtextColor}
                value={groupName}
                onChangeText={setGroupName}
                autoFocus
              />
              {renderSuggestionChips(groupCopy.nameSuggestions, setGroupName)}

              <Text style={[styles.sectionTitle, { color: subtextColor }]}>
                Description (optional)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  styles.multilineInput,
                  { backgroundColor: cardBg, color: textColor, borderColor },
                ]}
                placeholder={groupCopy.descriptionPlaceholder}
                placeholderTextColor={subtextColor}
                value={description}
                onChangeText={setDescription}
                multiline
              />
              {renderSuggestionChips(groupCopy.descriptionSuggestions, setDescription)}

              {groupType === 'parent_group' && (
                <>
                  <View style={styles.toggleRow}>
                    <Text style={[styles.toggleLabel, { color: textColor }]}>Allow Replies</Text>
                    <TouchableOpacity onPress={() => setAllowReplies((value) => !value)}>
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
                </>
              )}

              {groupType === 'announcement' && (
                <>
                  <Text style={[styles.sectionTitle, { color: subtextColor }]}>
                    Audience
                  </Text>
                  {(
                    [
                      'all_parents',
                      'all_teachers',
                      'all_staff',
                      'everyone',
                    ] as const
                  ).map((a) => (
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
                        {a === 'all_parents'
                          ? 'All Parents'
                          : a === 'all_teachers'
                            ? 'All Teachers'
                            : a === 'all_staff'
                              ? 'All Staff'
                              : 'Everyone'}
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
            </>
          )}

          {/* ── Step 3: Member / class selection ── */}
          {step === 'members' && groupType === 'class_group' && (
            <>
              <Text style={[styles.sectionTitle, { color: subtextColor }]}>
                Select a Class
              </Text>
              {classesLoading ? (
                <SkeletonLoader width="100%" height={60} />
              ) : classes.length === 0 ? (
                <Text style={[styles.emptyText, { color: subtextColor }]}>
                  No classes found.
                </Text>
              ) : (
                classes.map((cls) => (
                  <TouchableOpacity
                    key={cls.id}
                    style={[
                      styles.selectItem,
                      { backgroundColor: cardBg, borderColor },
                      selectedClassId === cls.id && {
                        borderColor: accentColor,
                        borderWidth: 2,
                      },
                    ]}
                    onPress={() => handleSelectClass(cls.id)}
                  >
                    <Ionicons
                      name={
                        selectedClassId === cls.id
                          ? 'radio-button-on'
                          : 'radio-button-off'
                      }
                      size={22}
                      color={selectedClassId === cls.id ? accentColor : subtextColor}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.selectItemText, { color: textColor }]}>
                        {cls.name}
                      </Text>
                      {(cls.parent_count != null || cls.teacher_id) && (
                        <Text style={[styles.classSubtext, { color: subtextColor }]}>
                          {cls.parent_count ?? 0} parents{cls.teacher_id ? ', 1 teacher' : ''}
                        </Text>
                      )}
                    </View>
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

              <Text style={[styles.sectionTitle, { color: subtextColor, marginTop: 8 }]}>
                Group Emoji
              </Text>
              <View style={styles.emojiGrid}>
                {EMOJI_OPTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.emojiCell,
                      { borderColor: groupEmoji === emoji ? accentColor : borderColor },
                      groupEmoji === emoji && { borderWidth: 2, backgroundColor: accentColor + '15' },
                    ]}
                    onPress={() => setGroupEmoji(emoji)}
                  >
                    <Text style={styles.emojiCellText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {step === 'members' && groupType === 'parent_group' && (
            <>
              {/* Selected member chips */}
              {selectedMembers.length > 0 && (
                <View style={styles.chipRow}>
                  {selectedMemberNames.map((name, i) => (
                    <View
                      key={selectedMembers[i]}
                      style={[styles.chip, { backgroundColor: accentColor + '22', borderColor: accentColor }]}
                    >
                      <Text style={[styles.chipText, { color: accentColor }]}>
                        {name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => toggleMember(selectedMembers[i])}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="close-circle" size={16} color={accentColor} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Text style={[styles.sectionTitle, { color: subtextColor }]}>
                {`Select Members (${selectedMembers.length} selected)`}
              </Text>
              <TextInput
                style={[styles.searchInput, { backgroundColor: cardBg, color: textColor, borderColor }]}
                placeholder="Search by name or email..."
                placeholderTextColor={subtextColor}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {membersLoading ? (
                <SkeletonLoader width="100%" height={60} />
              ) : filteredMembers.length === 0 ? (
                <Text style={[styles.emptyText, { color: subtextColor }]}>
                  {searchQuery ? 'No matches found.' : 'No members found.'}
                </Text>
              ) : (
                filteredMembers.map((member) => {
                  const isSelected = selectedMembers.includes(member.id);
                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={[
                        styles.memberItem,
                        { backgroundColor: cardBg, borderColor },
                        isSelected && { borderColor: accentColor, borderWidth: 2 },
                      ]}
                      onPress={() => toggleMember(member.id)}
                    >
                      <View
                        style={[
                          styles.avatar,
                          { backgroundColor: isDark ? '#334155' : '#e2e8f0' },
                        ]}
                      >
                        <Text style={[styles.avatarText, { color: accentColor }]}>
                          {member.initials}
                        </Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={[styles.memberName, { color: textColor }]}>
                          {member.display_name}
                        </Text>
                        <Text style={[styles.memberRole, { color: subtextColor }]}>
                          {member.email
                            ? `${formatRoleLabel(member.role)} • ${member.email}`
                            : formatRoleLabel(member.role)}
                        </Text>
                      </View>
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? accentColor : subtextColor}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

          {/* ── Step 4: Confirm ── */}
          {step === 'confirm' && (
            <>
              <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.summaryLabel, { color: subtextColor }]}>
                  Type
                </Text>
                <Text style={[styles.summaryValue, { color: textColor }]}>
                  {groupType === 'class_group'
                    ? 'Class Group'
                    : groupType === 'parent_group'
                      ? 'Parent Group'
                      : 'Announcement Channel'}
                </Text>

                {groupName.trim() ? (
                  <>
                    <Text style={[styles.summaryLabel, { color: subtextColor, marginTop: 12 }]}>
                      Name
                    </Text>
                    <Text style={[styles.summaryValue, { color: textColor }]}>
                      {groupName}
                    </Text>
                  </>
                ) : null}

                {description.trim() ? (
                  <>
                    <Text style={[styles.summaryLabel, { color: subtextColor, marginTop: 12 }]}>
                      Description
                    </Text>
                    <Text style={[styles.summaryValue, { color: textColor }]}>
                      {description}
                    </Text>
                  </>
                ) : null}

                {groupType === 'class_group' && selectedClassName && (
                  <>
                    <Text style={[styles.summaryLabel, { color: subtextColor, marginTop: 12 }]}>
                      Class
                    </Text>
                    <Text style={[styles.summaryValue, { color: textColor }]}>
                      {groupEmoji} {selectedClassName}
                    </Text>
                  </>
                )}

                {groupType === 'parent_group' && selectedMembers.length > 0 && (
                  <>
                    <Text style={[styles.summaryLabel, { color: subtextColor, marginTop: 12 }]}>
                      Members ({selectedMembers.length})
                    </Text>
                    <Text style={[styles.summaryValue, { color: textColor }]}>
                      {selectedMemberNames.join(', ')}
                    </Text>
                  </>
                )}

                {groupType === 'parent_group' && replyPolicy && (
                  <>
                    <Text style={[styles.summaryLabel, { color: subtextColor, marginTop: 12 }]}>
                      Replies
                    </Text>
                    <Text style={[styles.summaryValue, { color: textColor }]}>
                      {replyPolicy.title}
                    </Text>
                  </>
                )}

                {groupType === 'announcement' && (
                  <>
                    <Text style={[styles.summaryLabel, { color: subtextColor, marginTop: 12 }]}>
                      Audience
                    </Text>
                    <Text style={[styles.summaryValue, { color: textColor }]}>
                      {audience === 'all_parents'
                        ? 'All Parents'
                        : audience === 'all_teachers'
                          ? 'All Teachers'
                          : audience === 'all_staff'
                            ? 'All Staff'
                            : 'Everyone'}
                    </Text>
                    {replyPolicy ? (
                      <>
                        <Text style={[styles.summaryLabel, { color: subtextColor, marginTop: 12 }]}>
                          Replies
                        </Text>
                        <Text style={[styles.summaryValue, { color: textColor }]}>
                          {replyPolicy.title}
                        </Text>
                      </>
                    ) : null}
                  </>
                )}
              </View>

              <TouchableOpacity
                style={[styles.createButton, { backgroundColor: accentColor }]}
                onPress={handleCreate}
                disabled={isCreating}
                activeOpacity={0.85}
              >
                {isCreating ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.createButtonText}>Create Group</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerBtn: { width: 48, alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  nextText: { fontSize: 16, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
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
    minHeight: 60,
    textAlignVertical: 'top',
  },
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
  classSubtext: { fontSize: 12, marginTop: 2 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  emojiCell: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiCellText: { fontSize: 22 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  chipText: { fontSize: 13, fontWeight: '500' },
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
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  summaryValue: { fontSize: 15, marginTop: 2 },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default CreateGroupModal;
