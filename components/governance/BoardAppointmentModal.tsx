/**
 * Board Appointment Modal Component
 * Allows president/admin to appoint members to board positions
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppointableMember } from '@/hooks/membership/useBoardPositions';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface BoardAppointmentModalProps {
  visible: boolean;
  theme: any;
  positionTitle: string;
  members: AppointableMember[];
  loading: boolean;
  onClose: () => void;
  onAppoint: (memberId: string) => void;
}

export function BoardAppointmentModal({
  visible,
  theme,
  positionTitle,
  members,
  loading,
  onClose,
  onAppoint,
}: BoardAppointmentModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [appointing, setAppointing] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setSearchQuery('');
      setSelectedMemberId(null);
      setAppointing(false);
    }
  }, [visible]);

  const filteredMembers = members.filter(member => {
    const fullName = `${member.first_name || ''} ${member.last_name || ''}`.toLowerCase();
    const email = (member.email || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || email.includes(query);
  });

  const handleAppoint = async () => {
    if (!selectedMemberId) return;
    setAppointing(true);
    await onAppoint(selectedMemberId);
    setAppointing(false);
  };

  const getInitials = (member: AppointableMember) => {
    const first = member.first_name?.[0] || '';
    const last = member.last_name?.[0] || '';
    return (first + last).toUpperCase() || '?';
  };

  const renderMemberItem = ({ item }: { item: AppointableMember }) => {
    const isSelected = selectedMemberId === item.id;
    const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unknown Member';

    return (
      <TouchableOpacity
        style={[
          styles.memberItem,
          { backgroundColor: theme.card },
          isSelected && { borderColor: theme.primary, borderWidth: 2 },
        ]}
        onPress={() => setSelectedMemberId(item.id)}
      >
        <View style={[styles.memberAvatar, { backgroundColor: theme.primary + '20' }]}>
          <Text style={[styles.memberAvatarText, { color: theme.primary }]}>
            {getInitials(item)}
          </Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, { color: theme.text }]}>{fullName}</Text>
          {item.email && (
            <Text style={[styles.memberEmail, { color: theme.textSecondary }]}>{item.email}</Text>
          )}
          {item.member_type && (
            <Text style={[styles.memberType, { color: theme.textSecondary }]}>
              {item.member_type.replace(/_/g, ' ')}
            </Text>
          )}
        </View>
        {isSelected && (
          <View style={[styles.selectedIndicator, { backgroundColor: theme.primary }]}>
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: theme.card }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={[styles.title, { color: theme.text }]}>Appoint Member</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Select a member for {positionTitle}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[styles.searchContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Ionicons name="search" size={20} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search members..."
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

          {/* Member List */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <EduDashSpinner size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                Loading members...
              </Text>
            </View>
          ) : filteredMembers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {searchQuery ? 'No members match your search' : 'No available members to appoint'}
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {filteredMembers.map(item => (
                <React.Fragment key={item.id}>
                  {renderMemberItem({ item } as any)}
                </React.Fragment>
              ))}
            </ScrollView>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: theme.border }]}
              onPress={onClose}
            >
              <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.appointButton,
                { backgroundColor: theme.primary },
                (!selectedMemberId || appointing) && styles.buttonDisabled,
              ]}
              onPress={handleAppoint}
              disabled={!selectedMemberId || appointing}
            >
              {appointing ? (
                <EduDashSpinner size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.appointButtonText}>Appoint</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    minHeight: 200,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    minHeight: 200,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 16,
    gap: 8,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberAvatarText: {
    fontSize: 16,
    fontWeight: '600',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
  },
  memberEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  memberType: {
    fontSize: 11,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  appointButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  appointButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default BoardAppointmentModal;
