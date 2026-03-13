/**
 * HiringView Component
 * 
 * Displays available teachers and invitations for hiring.
 * Extracted from app/screens/teacher-management.tsx per WARP.md standards.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Share,
  Linking,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TeacherInviteService } from '@/lib/services/teacherInviteService';
import * as Clipboard from 'expo-clipboard';
import { buildTeacherInviteLink, buildTeacherInviteMessage } from '@/lib/utils/teacherInviteLink';
import type { AlertButton } from '@/components/ui/AlertModal';
import type { AvailableTeacher, TeacherInvite } from '@/types/teacher-management';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { createStyles } from './HiringView.styles';

interface HiringViewProps {
  availableTeachers: AvailableTeacher[];
  invites: TeacherInvite[];
  hiringSearch: string;
  radiusKm: number;
  loading: boolean;
  theme?: ThemeColors;
  userId?: string;
  preschoolId: string | null;
  onSearchChange: (search: string) => void;
  onRadiusChange: (km: number) => void;
  onRefresh: () => void;
  onLoadInvites: () => Promise<void>;
  schoolName?: string | null;
  inviterName?: string | null;
  showAlert: (config: { title: string; message?: string; type?: 'info' | 'warning' | 'success' | 'error'; buttons?: AlertButton[] }) => void;
  onHireTeacher?: (teacher: AvailableTeacher) => void;
}

export function HiringView({
  availableTeachers,
  invites,
  hiringSearch,
  radiusKm,
  loading,
  theme,
  userId,
  preschoolId,
  onSearchChange,
  onRadiusChange,
  onRefresh,
  onLoadInvites,
  schoolName,
  inviterName,
  showAlert,
  onHireTeacher,
}: HiringViewProps) {
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const openShareOptions = async (inviteToken: string, inviteEmail: string) => {
    const message = buildTeacherInviteMessage({
      token: inviteToken,
      email: inviteEmail,
      schoolName,
      inviterName,
      roleLabel: 'teacher',
    });
    const inviteLink = buildTeacherInviteLink(inviteToken, inviteEmail);

    const openWhatsApp = async () => {
      const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        showAlert({
          title: 'WhatsApp Not Available',
          message: 'Install WhatsApp to use this option.',
          type: 'warning',
        });
        return;
      }
      await Linking.openURL(url);
    };

    const openSms = async () => {
      const url = `sms:?body=${encodeURIComponent(message)}`;
      await Linking.openURL(url);
    };

    const openEmail = async () => {
      const subject = encodeURIComponent(`EduDash Pro Teacher Invite`);
      const body = encodeURIComponent(message);
      const url = `mailto:${inviteEmail}?subject=${subject}&body=${body}`;
      await Linking.openURL(url);
    };

    const copyLink = async () => {
      await Clipboard.setStringAsync(inviteLink);
      showAlert({
        title: 'Copied',
        message: 'Invite link copied to clipboard.',
        type: 'success',
      });
    };

    const shareGeneric = async () => {
      await Share.share({ message, url: inviteLink });
    };

    showAlert({
      title: 'Invite Ready',
      message: `Choose how you want to send the invite.\n\nInvite token: ${inviteToken}\nLink: ${inviteLink}`,
      type: 'info',
      buttons: [
        { text: 'Share', onPress: () => void shareGeneric() },
        { text: 'WhatsApp', onPress: () => void openWhatsApp() },
        { text: 'SMS', onPress: () => void openSms() },
        { text: 'Email', onPress: () => void openEmail() },
        { text: 'Copy Link', onPress: () => void copyLink() },
        { text: 'Close', style: 'cancel' },
      ],
    });
  };

  const handleInvite = async (teacher: AvailableTeacher) => {
    try {
      if (!preschoolId) return;
      if (!teacher.email) {
        showAlert({
          title: 'Missing Email',
          message: 'This teacher profile has no email.',
          type: 'warning',
        });
        return;
      }
      const invite = await TeacherInviteService.createInvite({
        schoolId: preschoolId,
        email: teacher.email,
        invitedBy: userId || '',
      });
      await onLoadInvites();
      await openShareOptions(invite.token, teacher.email);
    } catch (_e) {
      console.error('Invite error:', _e);
      showAlert({
        title: 'Error',
        message: 'Failed to send invite.',
        type: 'error',
      });
    }
  };

  const handleViewReferences = (teacher: AvailableTeacher) => {
    if (!teacher.id) return;
    router.push({
      pathname: '/screens/teacher-references',
      params: { teacherUserId: teacher.id },
    });
  };

  const renderRatingStars = (rating?: number | null) => {
    if (!rating) return null;
    const rounded = Math.round(rating);
    return (
      <View style={styles.ratingStars}>
        {Array.from({ length: 5 }).map((_, idx) => (
          <Ionicons
            key={idx}
            name={idx + 1 <= rounded ? 'star' : 'star-outline'}
            size={14}
            color={idx + 1 <= rounded ? '#F59E0B' : '#D1D5DB'}
          />
        ))}
      </View>
    );
  };

  const handleDeleteInvite = async (inviteId: string, inviteEmail: string) => {
    showAlert({
      title: 'Delete Invite?',
      message: `Remove the invite for ${inviteEmail}? This cannot be undone.`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await TeacherInviteService.deleteInvite(inviteId, { schoolId: preschoolId });
              await onLoadInvites();
              showAlert({
                title: 'Invite Deleted',
                message: 'The invite has been removed.',
                type: 'success',
              });
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : 'Failed to delete invite';
              showAlert({
                title: 'Delete Failed',
                message,
                type: 'error',
              });
            }
          },
        },
      ],
    });
  };

  const renderAvailableTeacher = ({ item }: { item: AvailableTeacher }) => (
    <View style={styles.candidateCard}>
      <View style={styles.candidateHeader}>
        <View style={styles.candidateInfo}>
          <Text style={styles.candidateName}>{item.name}</Text>
          <Text style={styles.candidateEmail}>{item.email}</Text>
          <Text style={styles.candidateDetails}>
            {(item.home_city || 'Unknown city') +
              (item.home_postal_code ? ` • ${item.home_postal_code}` : '')}
            {item.distance_km !== undefined && ` • ${item.distance_km.toFixed(1)} km away`}
          </Text>
          {item.rating_average ? (
            <View style={styles.ratingRow}>
              {renderRatingStars(item.rating_average)}
              <Text style={styles.ratingText}>
                {item.rating_average.toFixed(1)}
                {item.rating_count ? ` (${item.rating_count})` : ''}
              </Text>
            </View>
          ) : (
            <Text style={styles.ratingEmpty}>No ratings yet</Text>
          )}
        </View>
        <TouchableOpacity style={styles.inviteButton} onPress={() => handleInvite(item)}>
          <Ionicons name="send" size={16} color="#fff" />
          <Text style={styles.inviteButtonText}>Invite</Text>
        </TouchableOpacity>
        {onHireTeacher && (
          <TouchableOpacity
            style={[styles.inviteButton, { backgroundColor: '#10B981', marginLeft: 6 }]}
            onPress={() => onHireTeacher(item)}
          >
            <Ionicons name="person-add" size={16} color="#fff" />
            <Text style={styles.inviteButtonText}>Hire</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity style={styles.referencesButton} onPress={() => handleViewReferences(item)}>
        <Ionicons name="star-outline" size={16} color="#0f172a" />
        <Text style={styles.referencesText}>View References</Text>
      </TouchableOpacity>
    </View>
  );

  const renderInvite = ({ item }: { item: TeacherInvite }) => (
    <View style={styles.candidateCard}>
      <View style={styles.candidateHeader}>
        <View style={styles.candidateInfo}>
          <Text style={styles.candidateName}>{item.email}</Text>
          <Text style={styles.candidateEmail}>Status: {item.status}</Text>
        </View>
        <TouchableOpacity
          style={styles.revokeButton}
          onPress={() => handleDeleteInvite(item.id, item.email)}
        >
          <Ionicons name="trash" size={18} color="#dc2626" />
          <Text style={styles.revokeButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
      {item.status === 'pending' && (
        <View style={styles.inviteActionsRow}>
          <TouchableOpacity
            style={[styles.inviteActionButton, { backgroundColor: '#4F46E5' + '15' }]}
            onPress={() => openShareOptions(item.token, item.email)}
          >
            <Ionicons name="send" size={16} color="#4F46E5" />
            <Text style={[styles.inviteActionText, { color: '#4F46E5' }]}>Share Invite</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.inviteActionButton, { backgroundColor: '#0EA5E9' + '15' }]}
            onPress={async () => {
              const link = buildTeacherInviteLink(item.token, item.email);
              await Clipboard.setStringAsync(link);
              showAlert({
                title: 'Link Copied',
                message: 'Invite link copied to clipboard.',
                type: 'success',
              });
            }}
          >
            <Ionicons name="link-outline" size={16} color="#0EA5E9" />
            <Text style={[styles.inviteActionText, { color: '#0EA5E9' }]}>Copy Link</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.inviteActionButton, { backgroundColor: '#10B981' + '15' }]}
            onPress={async () => {
              await Clipboard.setStringAsync(item.token);
              showAlert({
                title: 'Token Copied',
                message: 'Invite token copied to clipboard.',
                type: 'success',
              });
            }}
          >
            <Ionicons name="key-outline" size={16} color="#10B981" />
            <Text style={[styles.inviteActionText, { color: '#10B981' }]}>Copy Token</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Available teachers section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Available Teachers</Text>
        <Text style={styles.sectionSubtitle}>{availableTeachers.length} available</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={theme?.textSecondary || '#666'} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, email, city or postal code..."
            value={hiringSearch}
            onChangeText={onSearchChange}
            onSubmitEditing={onRefresh}
          />
        </View>
        <View style={styles.radiusChips}>
          {[5, 10, 25].map((km) => (
            <TouchableOpacity
              key={km}
              style={[styles.radiusChip, radiusKm === km && styles.radiusChipActive]}
              onPress={() => onRadiusChange(km)}
            >
              <Text style={[styles.radiusChipText, radiusKm === km && styles.radiusChipTextActive]}>
                {km} km
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlashList
        data={availableTeachers}
        keyExtractor={(i) => i.id}
        renderItem={renderAvailableTeacher}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No available teachers</Text>}
        estimatedItemSize={100}
      />

      {/* Invites section */}
      <View style={[styles.sectionHeader, { marginTop: 16 }]}>
        <Text style={styles.sectionTitle}>Invitations</Text>
        <Text style={styles.sectionSubtitle}>{invites.length} invites</Text>
      </View>

      <FlashList
        data={invites}
        keyExtractor={(i) => i.id}
        renderItem={renderInvite}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.emptyText}>No pending invitations</Text>}
        estimatedItemSize={80}
      />
    </View>
  );
}

export default HiringView;
