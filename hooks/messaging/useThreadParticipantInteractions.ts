import { useCallback, useMemo, useState } from 'react';
import type { AlertButton } from '@/components/ui/AlertModal';
import { assertSupabase } from '@/lib/supabase';
import type { ThreadParticipant } from '@/hooks/useParentMessageThread';

type ShowThreadAlert = (title: string, message: string, buttons?: AlertButton[]) => void;

type ParticipantSheetDetails = {
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  role?: string | null;
};

type ParticipantQuickAction = {
  key: string;
  label: string;
  icon: 'call-outline' | 'videocam-outline' | 'search-outline' | 'images-outline' | 'ellipsis-horizontal';
  onPress: () => void;
};

interface UseThreadParticipantInteractionsProps {
  isGroup: boolean;
  recipientId: string;
  recipientRole: string | null;
  recipientAvatarUrl: string | null;
  currentUserId?: string;
  groupParticipants: ThreadParticipant[];
  isUserOnline: (userId: string) => boolean;
  showThreadAlert: ShowThreadAlert;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onOpenSearch: () => void;
  onOpenMedia: () => void;
  onOpenMoreOptions: () => void;
}

export function useThreadParticipantInteractions({
  isGroup,
  recipientId,
  recipientRole,
  recipientAvatarUrl,
  currentUserId,
  groupParticipants,
  isUserOnline,
  showThreadAlert,
  onVoiceCall,
  onVideoCall,
  onOpenSearch,
  onOpenMedia,
  onOpenMoreOptions,
}: UseThreadParticipantInteractionsProps) {
  const [showParticipantSheet, setShowParticipantSheet] = useState(false);
  const [participantSheetLoading, setParticipantSheetLoading] = useState(false);
  const [participantSheetDetails, setParticipantSheetDetails] = useState<ParticipantSheetDetails | null>(null);

  const participantSheetMembers = useMemo(() => (
    groupParticipants.map((participant, index) => {
      const first = participant.user_profile?.first_name || '';
      const last = participant.user_profile?.last_name || '';
      return {
        id: participant.user_id || `participant-${index}`,
        name: `${first} ${last}`.trim() || `Member ${index + 1}`,
        role: participant.user_profile?.role || participant.role || 'member',
        online: participant.user_id ? isUserOnline(participant.user_id) : false,
      };
    })
  ), [groupParticipants, isUserOnline]);

  const openParticipantSheet = useCallback(async () => {
    setShowParticipantSheet(true);

    if (isGroup) return;

    if (!recipientId) {
      setParticipantSheetDetails({
        role: recipientRole,
        avatar_url: recipientAvatarUrl,
      });
      return;
    }

    setParticipantSheetLoading(true);
    try {
      const { data, error } = await assertSupabase()
        .from('profiles')
        .select('role, email, phone, avatar_url')
        .eq('id', recipientId)
        .maybeSingle();
      if (error) throw error;

      setParticipantSheetDetails({
        role: data?.role || recipientRole,
        email: data?.email || null,
        phone: data?.phone || null,
        avatar_url: data?.avatar_url || recipientAvatarUrl,
      });
    } catch {
      setParticipantSheetDetails({
        role: recipientRole,
        avatar_url: recipientAvatarUrl,
      });
    } finally {
      setParticipantSheetLoading(false);
    }
  }, [isGroup, recipientAvatarUrl, recipientId, recipientRole]);

  const handleReactionDetails = useCallback(async (emoji: string, reactedByUserIds: string[]) => {
    if (reactedByUserIds.length === 0) return;

    try {
      const uniqueUserIds = Array.from(new Set(reactedByUserIds));
      const participantNameMap = new Map<string, string>();

      groupParticipants.forEach((participant) => {
        const first = participant.user_profile?.first_name || '';
        const last = participant.user_profile?.last_name || '';
        const fullName = `${first} ${last}`.trim();
        if (participant.user_id && fullName) participantNameMap.set(participant.user_id, fullName);
      });

      const missingUserIds = uniqueUserIds.filter((id) => !participantNameMap.has(id));
      if (missingUserIds.length > 0) {
        const { data: profiles } = await assertSupabase()
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', missingUserIds);

        (profiles || []).forEach((profile: { id: string; first_name?: string; last_name?: string }) => {
          const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
          if (fullName) participantNameMap.set(profile.id, fullName);
        });
      }

      const names = uniqueUserIds.map((id) => (id === currentUserId ? 'You' : participantNameMap.get(id) || 'Someone'));
      showThreadAlert('Who reacted', `${emoji}\n\n${names.map((name) => `• ${name}`).join('\n')}`, [{ text: 'OK' }]);
    } catch {
      showThreadAlert('Who reacted', emoji, [{ text: 'OK' }]);
    }
  }, [currentUserId, groupParticipants, showThreadAlert]);

  const participantQuickActions = useMemo<ParticipantQuickAction[]>(() => {
    if (isGroup) {
      return [
        { key: 'search', label: 'Search', icon: 'search-outline', onPress: onOpenSearch },
        { key: 'media', label: 'Media', icon: 'images-outline', onPress: onOpenMedia },
        { key: 'more', label: 'More', icon: 'ellipsis-horizontal', onPress: onOpenMoreOptions },
      ];
    }

    return [
      { key: 'call', label: 'Call', icon: 'call-outline', onPress: onVoiceCall },
      { key: 'video', label: 'Video', icon: 'videocam-outline', onPress: onVideoCall },
      { key: 'more', label: 'More', icon: 'ellipsis-horizontal', onPress: onOpenMoreOptions },
    ];
  }, [isGroup, onOpenMedia, onOpenMoreOptions, onOpenSearch, onVideoCall, onVoiceCall]);

  return {
    showParticipantSheet,
    setShowParticipantSheet,
    participantSheetLoading,
    participantSheetDetails,
    participantSheetMembers,
    participantQuickActions,
    openParticipantSheet,
    handleReactionDetails,
  };
}
