/**
 * Add Participant Modal
 * 
 * Modal to search and invite organization users to an ongoing call.
 * Shows online status indicators and allows sending invites via push notification.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Modal, StyleSheet, TextInput, TouchableOpacity, Image, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
const getSupabase = () => assertSupabase();

interface OrgUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string;
  is_online: boolean;
  last_seen_at: string | null;
}

interface AddParticipantModalProps {
  visible: boolean;
  onClose: () => void;
  callId: string | null;
  meetingUrl: string | null;
  callerName: string;
  callType: 'video' | 'voice';
  excludeUserIds?: string[]; // Users already in the call
}

export function AddParticipantModal({
  visible,
  onClose,
  callId,
  meetingUrl,
  callerName,
  callType,
  excludeUserIds = [],
}: AddParticipantModalProps) {
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Fetch organization users
  const fetchOrgUsers = useCallback(async () => {
    if (!profile?.organization_id && !profile?.preschool_id) {
      console.log('[AddParticipant] No organization context');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabase();
      const currentUserId = user?.id;
      const orgId = profile.organization_id || profile.preschool_id;

      // Fetch users from same organization
      // PRIVACY FIX: Parents should only see teachers/principals, not other parents
      // Include their online presence status
      
      // Determine allowed roles based on current user's role
      let roleFilter = '';
      if (profile.role === 'parent') {
        // Parents can ONLY call teachers and principals (NOT other parents)
        roleFilter = `role.in.(teacher,principal,principal_admin,admin)`;
      } else {
        // Teachers and principals can call everyone
        roleFilter = `role.in.(teacher,principal,parent,principal_admin,admin)`;
      }
      
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          email,
          avatar_url,
          role,
          last_seen_at
        `)
        .or(`organization_id.eq.${orgId},preschool_id.eq.${orgId}`)
        .or(roleFilter) // Apply role-based filtering
        .neq('id', currentUserId) // Exclude self
        .order('first_name', { ascending: true });

      if (fetchError) {
        console.error('[AddParticipant] Fetch error:', fetchError);
        setError('Failed to load contacts');
        return;
      }

      // Calculate online status (within last 5 minutes = online)
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const usersWithOnlineStatus: OrgUser[] = (data || [])
        .filter(u => !excludeUserIds.includes(u.id)) // Exclude already in call
        .map(u => ({
          ...u,
          is_online: u.last_seen_at 
            ? new Date(u.last_seen_at) > fiveMinutesAgo 
            : false,
        }))
        // Sort: online first, then alphabetically
        .sort((a, b) => {
          if (a.is_online && !b.is_online) return -1;
          if (!a.is_online && b.is_online) return 1;
          return (a.first_name || '').localeCompare(b.first_name || '');
        });

      setUsers(usersWithOnlineStatus);
      setFilteredUsers(usersWithOnlineStatus);
    } catch (err) {
      console.error('[AddParticipant] Error:', err);
      setError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [profile?.organization_id, profile?.preschool_id, user?.id, excludeUserIds]);

  // Fetch users when modal opens
  useEffect(() => {
    if (visible) {
      fetchOrgUsers();
      setSearchQuery('');
      setInvitedUserIds(new Set());
    }
  }, [visible, fetchOrgUsers]);

  // Filter users based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = users.filter(u => {
      const fullName = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      return fullName.includes(query) || u.email.toLowerCase().includes(query);
    });
    setFilteredUsers(filtered);
  }, [searchQuery, users]);

  // Invite user to call
  const inviteUser = useCallback(async (targetUser: OrgUser) => {
    if (!callId || !meetingUrl || !user?.id) {
      setError('Call information not available');
      return;
    }

    setInvitingUserId(targetUser.id);
    setError(null);

    try {
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setError('Not authenticated');
        return;
      }

      // Insert call signal to invite user
      const { error: signalError } = await supabase.from('call_signals').insert({
        call_id: callId,
        from_user_id: user.id,
        to_user_id: targetUser.id,
        signal_type: 'invite',
        payload: {
          meeting_url: meetingUrl,
          call_type: callType,
          caller_name: callerName,
          invite_type: 'add_participant',
        },
      });

      if (signalError) {
        console.error('[AddParticipant] Signal error:', signalError);
      }

      // Send push notification
      const pushResponse = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-expo-push`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            user_ids: [targetUser.id],
            title: callType === 'video' ? '📹 Video Call Invite' : '📞 Voice Call Invite',
            body: `${callerName} is inviting you to join a ${callType} call`,
            data: {
              type: 'call_invite',
              call_id: callId,
              caller_id: user.id,
              caller_name: callerName,
              call_type: callType,
              meeting_url: meetingUrl,
            },
            sound: 'default',
            priority: 'high',
            channelId: 'incoming-calls',
            categoryId: 'call_invite',
            ttl: 60, // 1 minute expiry
          }),
        }
      );

      if (pushResponse.ok) {
        console.log('[AddParticipant] ✅ Invite sent to:', targetUser.email);
        setInvitedUserIds(prev => new Set(prev).add(targetUser.id));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const errorText = await pushResponse.text();
        console.warn('[AddParticipant] Push failed:', errorText);
        setError('Failed to send invite');
      }
    } catch (err) {
      console.error('[AddParticipant] Invite error:', err);
      setError('Failed to send invite');
    } finally {
      setInvitingUserId(null);
    }
  }, [callId, meetingUrl, user?.id, callerName, callType]);

  const renderUser = ({ item }: { item: OrgUser }) => {
    const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.email;
    const isInvited = invitedUserIds.has(item.id);
    const isInviting = invitingUserId === item.id;

    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => !isInvited && !isInviting && inviteUser(item)}
        disabled={isInvited || isInviting}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={24} color="#666" />
            </View>
          )}
          {/* Online indicator */}
          {item.is_online && <View style={styles.onlineIndicator} />}
        </View>

        {/* User info */}
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{fullName}</Text>
          <Text style={styles.userRole}>
            {item.role.replace('_', ' ')} {item.is_online ? '• Online' : ''}
          </Text>
        </View>

        {/* Invite button / Status */}
        {isInviting ? (
          <EduDashSpinner size="small" color="#6366f1" />
        ) : isInvited ? (
          <View style={styles.invitedBadge}>
            <Ionicons name="checkmark" size={16} color="#22c55e" />
            <Text style={styles.invitedText}>Invited</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.inviteButton}
            onPress={() => inviteUser(item)}
          >
            <Ionicons name="person-add" size={18} color="#fff" />
          </TouchableOpacity>
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
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add Participant</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* User list */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <EduDashSpinner size="large" color="#6366f1" />
              <Text style={styles.loadingText}>Loading contacts...</Text>
            </View>
          ) : filteredUsers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color="#666" />
              <Text style={styles.emptyText}>
                {searchQuery ? 'No users found' : 'No contacts available'}
              </Text>
            </View>
          ) : (
            <FlashList
              data={filteredUsers}
              keyExtractor={(item) => item.id}
              renderItem={renderUser}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              estimatedItemSize={60}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  content: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    marginTop: 60,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: '#fff',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
  },
  errorText: {
    color: '#ef4444',
    marginLeft: 8,
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#666',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#666',
    marginTop: 12,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    marginBottom: 8,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#1a1a2e',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  userRole: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  inviteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderRadius: 16,
    gap: 4,
  },
  invitedText: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '500',
  },
});

export default AddParticipantModal;
