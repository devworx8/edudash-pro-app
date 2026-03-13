import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ParticipantSummary = {
  id: string;
  name: string;
  role?: string | null;
  online?: boolean;
  isAdmin?: boolean;
  canSendMessages?: boolean;
  isSelf?: boolean;
};

type QuickAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
};

type GroupAdminCandidate = {
  id: string;
  name: string;
  role?: string | null;
  email?: string | null;
};

type GroupAdminControls = {
  canManageMembers?: boolean;
  canToggleReplies?: boolean;
  allowReplies?: boolean;
  isUpdatingReplies?: boolean;
  onToggleReplies?: (nextValue: boolean) => void;
  addCandidates?: GroupAdminCandidate[];
  isAddingMembers?: boolean;
  onAddMembers?: (userIds: string[]) => void;
  onRemoveParticipant?: (userId: string) => void;
  removingParticipantId?: string | null;
};

interface ChatParticipantSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  avatarLabel?: string;
  isGroup?: boolean;
  isLoading?: boolean;
  participantCount?: number;
  onlineCount?: number;
  participants?: ParticipantSummary[];
  quickActions?: QuickAction[];
  groupDescription?: string | null;
  adminControls?: GroupAdminControls | null;
}

export function ChatParticipantSheet({
  visible,
  onClose,
  title,
  subtitle,
  role,
  email,
  phone,
  avatarUrl,
  avatarLabel = '?',
  isGroup = false,
  isLoading = false,
  participantCount = 0,
  onlineCount = 0,
  participants = [],
  quickActions = [],
  groupDescription,
  adminControls = null,
}: ChatParticipantSheetProps) {
  const insets = useSafeAreaInsets();
  const [candidateQuery, setCandidateQuery] = useState('');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setCandidateQuery('');
      setSelectedCandidateIds([]);
    }
  }, [visible]);

  const filteredCandidates = useMemo(() => {
    const candidates = adminControls?.addCandidates || [];
    if (!candidateQuery.trim()) return candidates;
    const query = candidateQuery.toLowerCase();
    return candidates.filter((candidate) =>
      candidate.name.toLowerCase().includes(query) ||
      (candidate.email || '').toLowerCase().includes(query) ||
      (candidate.role || '').toLowerCase().includes(query),
    );
  }, [adminControls?.addCandidates, candidateQuery]);

  const styles = useMemo(() => StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.68)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: 'rgba(7, 12, 30, 0.98)',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 10,
      paddingBottom: insets.bottom + 18,
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.14)',
      maxHeight: '82%',
      ...Platform.select({
        ios: {
          shadowColor: '#040817',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.42,
          shadowRadius: 24,
        },
        android: {
          elevation: 16,
        },
      }),
    },
    handle: {
      width: 48,
      height: 4,
      borderRadius: 2,
      alignSelf: 'center',
      backgroundColor: 'rgba(191, 212, 255, 0.32)',
      marginTop: 6,
      marginBottom: 14,
    },
    header: {
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(125, 211, 252, 0.12)',
    },
    avatar: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      marginBottom: 12,
    },
    avatarText: {
      color: '#fff',
      fontSize: 22,
      fontWeight: '700',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
      borderRadius: 30,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: '#f8fafc',
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 13,
      color: '#b8c8f4',
      textAlign: 'center',
      marginTop: 4,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    summaryPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: 'rgba(15, 23, 42, 0.84)',
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.16)',
    },
    summaryPillText: {
      color: '#dbeafe',
      fontSize: 12,
      fontWeight: '700',
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 14,
    },
    quickActionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    quickAction: {
      flex: 1,
      minWidth: 0,
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 10,
      backgroundColor: 'rgba(14, 22, 44, 0.9)',
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.14)',
      alignItems: 'center',
      gap: 6,
    },
    quickActionDisabled: {
      opacity: 0.45,
    },
    quickActionLabel: {
      color: '#e2e8f0',
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
    section: {
      marginBottom: 14,
      borderRadius: 20,
      backgroundColor: 'rgba(14, 22, 44, 0.88)',
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.12)',
      overflow: 'hidden',
    },
    sectionTitle: {
      color: '#f8fafc',
      fontSize: 14,
      fontWeight: '800',
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 6,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(125, 211, 252, 0.12)',
    },
    detailLabel: {
      color: '#8fb4ff',
      fontSize: 12,
      fontWeight: '700',
      width: 62,
    },
    detailValue: {
      color: '#e2e8f0',
      fontSize: 14,
      fontWeight: '500',
      flex: 1,
    },
    groupDescriptionText: {
      color: '#dbeafe',
      fontSize: 14,
      lineHeight: 20,
      paddingHorizontal: 14,
      paddingBottom: 14,
      paddingTop: 4,
    },
    controlRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 12,
    },
    controlTextWrap: {
      flex: 1,
    },
    controlTitle: {
      color: '#f8fafc',
      fontSize: 14,
      fontWeight: '700',
    },
    controlBody: {
      color: '#b8c8f4',
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
    },
    controlToggle: {
      minWidth: 68,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: 'rgba(51, 65, 85, 0.78)',
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.14)',
    },
    controlToggleActive: {
      backgroundColor: 'rgba(8, 197, 255, 0.22)',
      borderColor: 'rgba(34, 211, 238, 0.45)',
    },
    controlToggleDisabled: {
      opacity: 0.6,
    },
    controlToggleText: {
      color: '#e2e8f0',
      fontSize: 13,
      fontWeight: '700',
    },
    addMembersBlock: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(125, 211, 252, 0.12)',
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 14,
    },
    searchInput: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.18)',
      backgroundColor: 'rgba(15, 23, 42, 0.88)',
      color: '#e2e8f0',
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 10,
      marginBottom: 10,
    },
    candidateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.12)',
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
      marginBottom: 8,
    },
    candidateRowSelected: {
      borderColor: 'rgba(34, 211, 238, 0.45)',
      backgroundColor: 'rgba(8, 197, 255, 0.1)',
    },
    candidateTextWrap: {
      flex: 1,
    },
    candidateName: {
      color: '#e2e8f0',
      fontSize: 14,
      fontWeight: '600',
    },
    candidateMeta: {
      color: '#b8c8f4',
      fontSize: 12,
      marginTop: 2,
    },
    addButton: {
      alignSelf: 'flex-start',
      marginTop: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(34, 211, 238, 0.18)',
      borderWidth: 1,
      borderColor: 'rgba(34, 211, 238, 0.45)',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    addButtonDisabled: {
      opacity: 0.45,
    },
    addButtonText: {
      color: '#ccfbf1',
      fontSize: 13,
      fontWeight: '700',
    },
    participantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(125, 211, 252, 0.12)',
    },
    participantDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#64748b',
    },
    participantDotOnline: {
      backgroundColor: '#22c55e',
    },
    participantName: {
      color: '#e2e8f0',
      fontSize: 14,
      fontWeight: '600',
    },
    participantTextWrap: {
      flex: 1,
    },
    participantBadges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 4,
    },
    participantRole: {
      color: '#b8c8f4',
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    participantBadge: {
      color: '#ccfbf1',
      fontSize: 11,
      fontWeight: '700',
      backgroundColor: 'rgba(34, 211, 238, 0.16)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    participantBadgeMuted: {
      color: '#fef3c7',
      fontSize: 11,
      fontWeight: '700',
      backgroundColor: 'rgba(245, 158, 11, 0.16)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    participantBadgeSelf: {
      color: '#dbeafe',
      fontSize: 11,
      fontWeight: '700',
      backgroundColor: 'rgba(99, 102, 241, 0.18)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    removeButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(248, 113, 113, 0.35)',
      backgroundColor: 'rgba(127, 29, 29, 0.24)',
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    removeButtonDisabled: {
      opacity: 0.45,
    },
    removeButtonText: {
      color: '#fecaca',
      fontSize: 12,
      fontWeight: '700',
    },
    loadingText: {
      color: '#b8c8f4',
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 18,
    },
  }), [insets.bottom]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <ScrollView bounces={false}>
                <View style={styles.header}>
                  <LinearGradient colors={['#6f7dff', '#7c3aed', '#1cc8ff']} style={styles.avatar}>
                    {avatarUrl && !isGroup ? (
                      <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarText}>{avatarLabel}</Text>
                    )}
                  </LinearGradient>
                  <Text style={styles.title}>{title}</Text>
                  {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                  <View style={styles.summaryRow}>
                    {role ? (
                      <View style={styles.summaryPill}>
                        <Text style={styles.summaryPillText}>{role}</Text>
                      </View>
                    ) : null}
                    {isGroup ? (
                      <>
                        <View style={styles.summaryPill}>
                          <Text style={styles.summaryPillText}>{onlineCount} online</Text>
                        </View>
                        <View style={styles.summaryPill}>
                          <Text style={styles.summaryPillText}>
                            {participantCount} member{participantCount === 1 ? '' : 's'}
                          </Text>
                        </View>
                      </>
                    ) : null}
                  </View>
                </View>

                <View style={styles.body}>
                  {quickActions.length > 0 ? (
                    <View style={styles.quickActionsRow}>
                      {quickActions.map((action) => (
                        <TouchableOpacity
                          key={action.key}
                          style={[styles.quickAction, action.disabled && styles.quickActionDisabled]}
                          onPress={action.onPress}
                          disabled={action.disabled}
                          activeOpacity={0.8}
                        >
                          <Ionicons name={action.icon} size={18} color="#8fe8ff" />
                          <Text style={styles.quickActionLabel}>{action.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  {!isGroup && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Contact details</Text>
                      {isLoading ? (
                        <Text style={styles.loadingText}>Loading contact details...</Text>
                      ) : (
                        <>
                          {role ? (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Role</Text>
                              <Text style={styles.detailValue}>{role}</Text>
                            </View>
                          ) : null}
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Email</Text>
                            <Text style={styles.detailValue}>{email || 'Not available'}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Phone</Text>
                            <Text style={styles.detailValue}>{phone || 'Not available'}</Text>
                          </View>
                        </>
                      )}
                    </View>
                  )}

                  {isGroup && (
                    <>
                      {groupDescription ? (
                        <View style={styles.section}>
                          <Text style={styles.sectionTitle}>About this group</Text>
                          <Text style={styles.groupDescriptionText}>{groupDescription}</Text>
                        </View>
                      ) : null}

                      {(adminControls?.canToggleReplies || adminControls?.canManageMembers) ? (
                        <View style={styles.section}>
                          <Text style={styles.sectionTitle}>Principal controls</Text>
                          {adminControls?.canToggleReplies ? (
                            <View style={styles.controlRow}>
                              <View style={styles.controlTextWrap}>
                                <Text style={styles.controlTitle}>Parent replies</Text>
                                <Text style={styles.controlBody}>
                                  {adminControls.allowReplies
                                    ? 'Parents can send messages in this group.'
                                    : 'Only admins can post. Parents are currently read-only.'}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={[
                                  styles.controlToggle,
                                  adminControls.allowReplies && styles.controlToggleActive,
                                  adminControls.isUpdatingReplies && styles.controlToggleDisabled,
                                ]}
                                onPress={() => adminControls.onToggleReplies?.(!adminControls.allowReplies)}
                                disabled={adminControls.isUpdatingReplies}
                                activeOpacity={0.85}
                              >
                                <Text style={styles.controlToggleText}>
                                  {adminControls.isUpdatingReplies
                                    ? 'Saving...'
                                    : adminControls.allowReplies
                                      ? 'On'
                                      : 'Off'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}

                          {adminControls?.canManageMembers ? (
                            <View style={styles.addMembersBlock}>
                              <Text style={styles.controlTitle}>Add parents</Text>
                              <Text style={styles.controlBody}>
                                Search parents in this school and add them to the group.
                              </Text>
                              <TextInput
                                style={styles.searchInput}
                                value={candidateQuery}
                                onChangeText={setCandidateQuery}
                                placeholder="Search by name or email..."
                                placeholderTextColor="rgba(184, 200, 244, 0.5)"
                              />
                              {filteredCandidates.length === 0 ? (
                                <Text style={styles.loadingText}>No additional parents available.</Text>
                              ) : (
                                filteredCandidates.slice(0, 8).map((candidate) => {
                                  const isSelected = selectedCandidateIds.includes(candidate.id);
                                  return (
                                    <TouchableOpacity
                                      key={candidate.id}
                                      style={[
                                        styles.candidateRow,
                                        isSelected && styles.candidateRowSelected,
                                      ]}
                                      onPress={() => {
                                        setSelectedCandidateIds((current) =>
                                          current.includes(candidate.id)
                                            ? current.filter((id) => id !== candidate.id)
                                            : [...current, candidate.id],
                                        );
                                      }}
                                      activeOpacity={0.8}
                                    >
                                      <View style={styles.candidateTextWrap}>
                                        <Text style={styles.candidateName}>{candidate.name}</Text>
                                        <Text style={styles.candidateMeta}>
                                          {[candidate.role, candidate.email].filter(Boolean).join(' • ')}
                                        </Text>
                                      </View>
                                      <Ionicons
                                        name={isSelected ? 'checkbox' : 'square-outline'}
                                        size={20}
                                        color={isSelected ? '#22d3ee' : '#8fb4ff'}
                                      />
                                    </TouchableOpacity>
                                  );
                                })
                              )}
                              <TouchableOpacity
                                style={[
                                  styles.addButton,
                                  (selectedCandidateIds.length === 0 || adminControls.isAddingMembers) && styles.addButtonDisabled,
                                ]}
                                onPress={() => {
                                  adminControls.onAddMembers?.(selectedCandidateIds);
                                }}
                                disabled={selectedCandidateIds.length === 0 || adminControls.isAddingMembers}
                                activeOpacity={0.85}
                              >
                                <Text style={styles.addButtonText}>
                                  {adminControls.isAddingMembers ? 'Adding...' : `Add ${selectedCandidateIds.length || ''}`.trim()}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
                        </View>
                      ) : null}

                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Members</Text>
                        {participants.length === 0 ? (
                          <Text style={styles.loadingText}>No participant details available yet.</Text>
                        ) : (
                          participants.map((participant) => (
                            <View key={participant.id} style={styles.participantRow}>
                              <View style={[styles.participantDot, participant.online && styles.participantDotOnline]} />
                              <View style={styles.participantTextWrap}>
                                <Text style={styles.participantName}>{participant.name}</Text>
                                <View style={styles.participantBadges}>
                                  {participant.role ? <Text style={styles.participantRole}>{participant.role}</Text> : null}
                                  {participant.isAdmin ? <Text style={styles.participantBadge}>Admin</Text> : null}
                                  {!participant.isAdmin && participant.canSendMessages === false ? (
                                    <Text style={styles.participantBadgeMuted}>Read only</Text>
                                  ) : null}
                                  {participant.isSelf ? <Text style={styles.participantBadgeSelf}>You</Text> : null}
                                </View>
                              </View>
                              {adminControls?.canManageMembers && !participant.isSelf ? (
                                <TouchableOpacity
                                  style={[
                                    styles.removeButton,
                                    adminControls.removingParticipantId === participant.id && styles.removeButtonDisabled,
                                  ]}
                                  onPress={() => adminControls.onRemoveParticipant?.(participant.id)}
                                  disabled={adminControls.removingParticipantId === participant.id}
                                  activeOpacity={0.85}
                                >
                                  <Text style={styles.removeButtonText}>
                                    {adminControls.removingParticipantId === participant.id ? '...' : 'Remove'}
                                  </Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          ))
                        )}
                      </View>
                    </>
                  )}
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export default ChatParticipantSheet;
