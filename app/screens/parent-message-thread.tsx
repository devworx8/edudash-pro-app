import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Platform, KeyboardAvoidingView, ImageBackground, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { toast } from '@/components/ui/ToastProvider';
import { useCallSafe } from '@/components/calls/CallProvider';
import type { CallEventContent } from '@/lib/utils/messageContent';
import { TypingIndicator } from '@/components/messaging/TypingIndicator';
import { useMessageActions } from '@/hooks/useMessageActions';
import { useThreadOptions } from '@/hooks/useThreadOptions';
import { FlashList } from '@shopify/flash-list';
import { AlertModal, useAlertModal, type AlertButton } from '@/components/ui/AlertModal';
import {
  Message, DateSeparator, MessageBubble, ChatHeader, MessageComposer,
  ForwardMessagePicker, ChatSearchOverlay, MediaGalleryView, StarredMessagesView,
  ChatParticipantSheet,
} from '@/components/messaging';
import { SwipeableMessageRow } from '@/components/messaging/SwipeableMessageRow';
import { MessageScheduler } from '@/components/messaging/MessageScheduler';
import { TemplatePickerSheet } from '@/components/messaging/TemplatePickerSheet';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useThreadParticipantInteractions } from '@/hooks/messaging/useThreadParticipantInteractions';
import { useParentMessageThread, type ChatRow } from '@/hooks/useParentMessageThread';
import { useAutoTranslateTranscribe } from '@/hooks/messaging/useAutoTranslateTranscribe';
import { parseThemeFromMessage } from '@/lib/messaging/parseThemeFromMessage';
import {
  useAddGroupParticipants,
  useOrgMembers,
  useRemoveGroupParticipant,
  useUpdateGroupReplyPolicy,
} from '@/hooks/useGroupMessaging';
import {
  messageThreadStyles as styles, defaultTheme,
  COMPOSER_FLOAT_GAP, COMPOSER_OVERLAY_HEIGHT,
} from '@/lib/screen-styles/parent-message-thread.styles';

let ChatWallpaperPicker: React.FC<any> | null = null;
let MessageActionsMenu: React.FC<any> | null = null;
let ThreadOptionsMenu: React.FC<any> | null = null;
let WALLPAPER_PRESETS: any[] = [];
try { const w = require('@/components/messaging/ChatWallpaperPicker'); ChatWallpaperPicker = w.ChatWallpaperPicker; WALLPAPER_PRESETS = w.WALLPAPER_PRESETS || []; } catch {}
try { MessageActionsMenu = require('@/components/messaging/MessageActionsMenu').MessageActionsMenu; } catch {}
try { ThreadOptionsMenu = require('@/components/messaging/ThreadOptionsMenu').ThreadOptionsMenu; } catch {}

let useTheme: () => { theme: any; isDark: boolean };
let useAuth: () => { user: any; profile: any };
try { useTheme = require('@/contexts/ThemeContext').useTheme; } catch { useTheme = () => ({ theme: defaultTheme, isDark: true }); }
try { useAuth = require('@/contexts/AuthContext').useAuth; } catch { useAuth = () => ({ user: null, profile: null }); }

export default function ParentMessageThreadScreen() {
  const params = useLocalSearchParams<{
    threadId?: string;
    title?: string;
    teacherName?: string;
    parentName?: string;
    parentId?: string;
    parentid?: string;
    teacherId?: string;
    teacherid?: string;
    recipientId?: string;
    recipientid?: string;
    isGroup?: string;
    threadType?: string;
  }>();
  const threadId = params.threadId || '';
  const routeTitle = params.title || '';
  const routeContactName = params.teacherName || params.parentName || routeTitle || '';
  const routeIsGroup = params.isGroup === '1';
  const routeThreadType = params.threadType || '';
  const theme = useTheme().theme || defaultTheme;
  const { user, profile } = useAuth();

  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { showAlert, alertProps } = useAlertModal();
  const showThreadAlert = useCallback((title: string, message: string, buttons?: AlertButton[]) => {
    showAlert({ title, message, buttons, type: 'warning' });
  }, [showAlert]);
  const h = useParentMessageThread(threadId, user?.id, user?.email);
  const { data: orgParents = [] } = useOrgMembers(['parent']);
  const updateGroupReplyPolicy = useUpdateGroupReplyPolicy();
  const addGroupParticipants = useAddGroupParticipants();
  const removeGroupParticipant = useRemoveGroupParticipant();
  const att = useAutoTranslateTranscribe({
    threadId, userId: user?.id,
    preferredLanguage: (profile?.language as any) || 'en',
    messages: h.allMessages,
  });

  const effectiveThreadType = String(h.threadInfo?.group_type || routeThreadType || h.threadInfo?.type || '');
  const isGroup = Boolean(
    routeIsGroup ||
    h.threadInfo?.is_group === true ||
    h.threadInfo?.group_name ||
    ['class_group', 'parent_group', 'teacher_group', 'announcement'].includes(effectiveThreadType),
  );
  const displayName = useMemo(() => {
    const rawName = isGroup
      ? h.threadInfo?.group_name || routeTitle || h.threadInfo?.subject || routeContactName
      : routeContactName || h.threadInfo?.subject || '';
    try { return rawName ? decodeURIComponent(rawName) : t('parent.teacher', { defaultValue: 'Contact' }); }
    catch { return rawName || 'Contact'; }
  }, [h.threadInfo?.group_name, h.threadInfo?.subject, isGroup, routeContactName, routeTitle, t]);

  const actions = useMessageActions({
    selectedMessage: h.selectedMessage, user, refetch: h.refetch,
    setSelectedMessage: h.setSelectedMessage, setShowMessageActions: h.setShowMessageActions,
    setReplyingTo: h.setReplyingTo, setOptimisticMsgs: h.setOptimisticMsgs,
    showAlert: ({ title, message, buttons }) => showThreadAlert(title, message, buttons),
  });

  const pinnedMessages = useMemo(() =>
    h.allMessages.filter((m: any) => m.is_pinned),
  [h.allMessages]);

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const routeRecipientId =
    params.recipientId ||
    params.recipientid ||
    params.parentId ||
    params.parentid ||
    params.teacherId ||
    params.teacherid;
  const participantRecipient = h.threadParticipants.find(
    (participant) => participant?.user_id && participant.user_id !== user?.id
  );
  const messageSenderName = [
    h.otherParticipant?.sender?.first_name || '',
    h.otherParticipant?.sender?.last_name || '',
  ].join(' ').trim();
  const participantName = [
    participantRecipient?.user_profile?.first_name || '',
    participantRecipient?.user_profile?.last_name || '',
  ].join(' ').trim();
  const recipientId = routeRecipientId || participantRecipient?.user_id || h.otherParticipant?.sender_id || '';
  const recipientName = messageSenderName || participantName || displayName;
  const recipientRole =
    h.otherParticipant?.sender?.role ||
    participantRecipient?.user_profile?.role ||
    null;
  const recipientAvatarUrl =
    h.otherParticipant?.sender?.avatar_url ||
    participantRecipient?.user_profile?.avatar_url ||
    null;
  const isPrincipal =
    profile?.role === 'principal' || profile?.role === 'principal_admin';
  const showAddToWeeklyProgram =
    isPrincipal &&
    !!h.selectedMessage &&
    h.selectedMessage.sender_id !== user?.id;
  const showConvertToRoutineRequest = showAddToWeeklyProgram;
  const handleAddToWeeklyProgram = useCallback(() => {
    const content = h.selectedMessage?.content ?? '';
    const message = typeof content === 'string' ? content : '';
    const parsedTheme = parseThemeFromMessage(message);
    const safe = message.slice(0, 4000);
    h.setShowMessageActions(false);
    h.setSelectedMessage(null);
    router.push({
      pathname: '/screens/add-theme-from-message',
      params: {
        message: safe,
        title: parsedTheme.title ?? '',
        objectives: parsedTheme.objectives.length ? JSON.stringify(parsedTheme.objectives) : '',
      },
    });
  }, [h.selectedMessage, h.setShowMessageActions, h.setSelectedMessage]);
  const handleConvertToRoutineRequest = useCallback(() => {
    const content = h.selectedMessage?.content ?? '';
    const message = typeof content === 'string' ? content : '';
    const parsedTheme = parseThemeFromMessage(message);
    const safe = message.slice(0, 4000);
    h.setShowMessageActions(false);
    h.setSelectedMessage(null);
    router.push({
      pathname: '/screens/principal-routine-requests',
      params: {
        message: safe,
        title: parsedTheme.title ?? '',
        objectives: parsedTheme.objectives.length ? JSON.stringify(parsedTheme.objectives) : '',
        teacherId: h.selectedMessage?.sender_id || '',
      },
    });
  }, [h.selectedMessage, h.setShowMessageActions, h.setSelectedMessage]);
  // Call context
  const callContext = useCallSafe();

  const groupParticipants = useMemo(() => h.threadParticipants || [], [h.threadParticipants]);
  const groupMemberCount = useMemo(() => {
    if (!isGroup) return 0;
    if (typeof h.threadParticipantCount === 'number') return h.threadParticipantCount;
    return groupParticipants.length;
  }, [groupParticipants.length, h.threadParticipantCount, isGroup]);
  const groupOnlineCount = useMemo(() => {
    if (!isGroup || !callContext) return 0;
    return groupParticipants.reduce((count, participant) => {
      if (!participant?.user_id || participant.user_id === user?.id) return count;
      return callContext.isUserOnline(participant.user_id) ? count + 1 : count;
    }, 0);
  }, [callContext, groupParticipants, isGroup, user?.id]);

  const opts = useThreadOptions({
    threadId, userId: user?.id, otherUserId: recipientId,
    refetch: h.refetch, setShowOptionsMenu: h.setShowOptionsMenu,
    setOptimisticMsgs: h.setOptimisticMsgs, displayName,
  });

  const isOnline = recipientId && callContext ? callContext.isUserOnline(recipientId) : false;
  const groupTypeLabel = isGroup
    ? (
      effectiveThreadType === 'class_group'
        ? 'Class group'
        : effectiveThreadType === 'announcement'
          ? 'Announcement channel'
          : effectiveThreadType === 'parent_group'
            ? 'Parent group'
            : effectiveThreadType === 'teacher_group'
              ? 'Teacher group'
              : 'Group'
    )
    : '';
  const lastSeenText = isGroup
    ? [
      groupTypeLabel,
      `${groupOnlineCount} online`,
      groupMemberCount > 0 ? `${groupMemberCount} member${groupMemberCount === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(' • ')
    : (recipientId && callContext ? callContext.getLastSeenText(recipientId) : 'Offline');

  const handleVoiceCall = useCallback(() => {
    if (!callContext) { toast.warn('Voice calling is not available.', 'Voice Call'); return; }
    if (isGroup) { toast.info('Voice calling is currently available for one-to-one chats only.', 'Voice Call'); return; }
    if (!recipientId) { toast.warn('Cannot identify recipient.', 'Voice Call'); return; }
    callContext.startVoiceCall(recipientId, recipientName, { threadId });
  }, [callContext, isGroup, recipientId, recipientName, threadId]);

  const handleVideoCall = useCallback(() => {
    if (!callContext) { toast.warn('Video calling is not available.', 'Video Call'); return; }
    if (isGroup) { toast.info('Video calling is currently available for one-to-one chats only.', 'Video Call'); return; }
    if (!recipientId) { toast.warn('Cannot identify recipient.', 'Video Call'); return; }
    callContext.startVideoCall(recipientId, recipientName, { threadId });
  }, [callContext, isGroup, recipientId, recipientName, threadId]);

  const handleCallEventPress = useCallback((event: CallEventContent) => {
    if (!callContext) {
      toast.warn('Calling is not available right now.', 'Call');
      return;
    }
    if (!event.callerId) {
      toast.warn('Caller details are unavailable for this event.', 'Call');
      return;
    }

    if (event.callType === 'video') {
      callContext.startVideoCall(event.callerId, event.callerName || 'Contact', { threadId });
      return;
    }

    callContext.startVoiceCall(event.callerId, event.callerName || 'Contact', { threadId });
  }, [callContext, threadId]);

  const {
    showParticipantSheet,
    setShowParticipantSheet,
    participantSheetLoading,
    participantSheetDetails,
    participantSheetMembers,
    participantQuickActions,
    openParticipantSheet,
    handleReactionDetails,
  } = useThreadParticipantInteractions({
    isGroup,
    recipientId,
    recipientRole,
    recipientAvatarUrl,
    currentUserId: user?.id,
    groupParticipants,
    isUserOnline: (participantUserId) => !!callContext?.isUserOnline(participantUserId),
    showThreadAlert,
    onVoiceCall: handleVoiceCall,
    onVideoCall: handleVideoCall,
    onOpenSearch: () => {
      setShowParticipantSheet(false);
      opts.handleSearchInChat();
    },
    onOpenMedia: () => {
      setShowParticipantSheet(false);
      opts.handleMediaLinksAndDocs();
    },
    onOpenMoreOptions: () => {
      setShowParticipantSheet(false);
      h.setShowOptionsMenu(true);
    },
  });
  const headerAvatarUrl = participantSheetDetails?.avatar_url || recipientAvatarUrl;

  const handleScrollToMessage = useCallback((messageId: string) => {
    const idx = h.rowsAsc.findIndex((r: ChatRow) => r.type === 'message' && r.msg?.id === messageId);
    if (idx >= 0 && h.listRef?.current) {
      h.listRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    }
  }, [h.rowsAsc, h.listRef]);

  const renderRow = useCallback(({ item }: { item: ChatRow }) => {
    if (item.type === 'date') return <DateSeparator label={item.label} />;
    const msg = item.msg;
    const voiceIndex = msg.voice_url ? h.voiceMessageIdsAsc.indexOf(msg.id) : -1;
    const hasNextVoice = voiceIndex >= 0 && voiceIndex < h.voiceMessageIdsAsc.length - 1;
    const hasPreviousVoice = voiceIndex > 0;
    return (
      <SwipeableMessageRow onSwipeReply={() => h.setReplyingTo(msg)}>
        <MessageBubble
          msg={msg} isOwn={msg.sender_id === user?.id}
          showSenderName={h.showSenderNames}
          showSenderAvatar={h.showSenderNames}
          onLongPress={() => h.handleMessageLongPress(msg)}
          onPlaybackFinished={msg.voice_url ? () => { if (hasNextVoice) h.setCurrentlyPlayingVoiceId(h.voiceMessageIdsAsc[voiceIndex + 1]); else h.setCurrentlyPlayingVoiceId(null); } : undefined}
          onPlayNext={hasNextVoice ? () => h.setCurrentlyPlayingVoiceId(h.voiceMessageIdsAsc[voiceIndex + 1]) : undefined}
          onPlayPrevious={hasPreviousVoice ? () => h.setCurrentlyPlayingVoiceId(h.voiceMessageIdsAsc[voiceIndex - 1]) : undefined}
          hasNextVoice={hasNextVoice} hasPreviousVoice={hasPreviousVoice}
          autoPlayVoice={!!msg.voice_url && h.currentlyPlayingVoiceId === msg.id}
          onReactionPress={actions.handleReactionPress}
          onReactionLongPress={(_messageId, emoji, reactedByUserIds) => handleReactionDetails(emoji, reactedByUserIds)}
          showReactionDetailsOnPress={isGroup || groupMemberCount > 2}
          onReplyPress={handleScrollToMessage}
          onCallEventPress={handleCallEventPress}
          isFirstInGroup={item.isFirstInGroup}
          isLastInGroup={item.isLastInGroup}
          translatedText={att.getTranslation(msg.id)}
          showTranslation={att.isShowingTranslation(msg.id)}
          onToggleTranslation={() => att.toggleShowTranslation(msg.id)}
          transcriptionText={att.getTranscription(msg.id)}
          isTranscribing={att.isTranscribing(msg.id)}
          onTranscribe={msg.voice_url ? () => att.manualTranscribe(msg.voice_url!, msg.id) : undefined}
        />
      </SwipeableMessageRow>
    );
  }, [h.currentlyPlayingVoiceId, h.handleMessageLongPress, h.voiceMessageIdsAsc, h.setReplyingTo, actions.handleReactionPress, handleReactionDetails, handleScrollToMessage, handleCallEventPress, user?.id, att]);

  // Announcement channels: only admins/principals can post
  const userRole = (profile as any)?.role || '';
  const isAdmin = ['principal', 'admin', 'principal_admin', 'super_admin', 'superadmin'].includes(userRole);
  const canUsePrincipalDashAssist = ['principal', 'principal_admin'].includes(userRole);
  const isUserGroupAdmin = h.currentParticipant?.is_admin === true;
  const currentParticipantCanSend = h.currentParticipant?.is_admin === true || h.currentParticipant?.can_send_messages === true;
  const canManageParentGroup =
    effectiveThreadType === 'parent_group' &&
    isAdmin &&
    (isUserGroupAdmin || h.threadInfo?.created_by === user?.id);
  const isAnnouncementReadOnly = Boolean(
    isGroup &&
    effectiveThreadType === 'announcement' &&
    ((h.currentParticipant && !currentParticipantCanSend) || (!h.currentParticipant && !isAdmin))
  );
  const isGroupReplyReadOnly = Boolean(
    isGroup &&
    effectiveThreadType !== 'announcement' &&
    (
      (h.currentParticipant && !currentParticipantCanSend)
      || (!h.currentParticipant && h.threadInfo?.allow_replies === false && !isAdmin)
    )
  );
  const isComposerReadOnly = isAnnouncementReadOnly || isGroupReplyReadOnly;
  const availableParentCandidates = useMemo(() => {
    if (!canManageParentGroup) return [];
    const existingIds = new Set(h.threadParticipants.map((participant) => participant.user_id));
    return orgParents
      .filter((member) => !existingIds.has(member.id))
      .map((member) => ({
        id: member.id,
        name: member.display_name,
        role: member.role,
        email: member.email || null,
      }));
  }, [canManageParentGroup, h.threadParticipants, orgParents]);
  const dashAssistRecipientRole = isGroup
    ? (
      effectiveThreadType === 'announcement'
        ? 'parents and staff in an announcement channel'
        : effectiveThreadType === 'parent_group'
          ? 'a parent group'
          : effectiveThreadType === 'class_group'
            ? 'class parents and staff'
            : effectiveThreadType === 'teacher_group'
              ? 'a teacher group'
              : 'a school group'
    )
    : recipientRole || undefined;
  const announcementBannerStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    height: 52,
    borderTopWidth: 1,
    paddingHorizontal: 16,
  };
  const composerReadOnlyLabel = isAnnouncementReadOnly
    ? 'Only admins can post in this channel'
    : 'Replies are turned off for this group';

  const handleToggleGroupReplies = useCallback(async (nextValue: boolean) => {
    try {
      await updateGroupReplyPolicy.mutateAsync({
        threadId,
        allowReplies: nextValue,
      });
      h.refreshThreadMeta();
      toast.success(nextValue ? 'Replies enabled for parents.' : 'Parents are now read-only.');
    } catch (error: any) {
      showThreadAlert('Reply controls', error?.message || 'Could not update reply permissions.', [{ text: 'OK' }]);
    }
  }, [h.refreshThreadMeta, showThreadAlert, threadId, updateGroupReplyPolicy]);

  const handleAddGroupMembers = useCallback(async (userIds: string[]) => {
    if (userIds.length === 0) return;
    try {
      await addGroupParticipants.mutateAsync({ threadId, userIds });
      h.refreshThreadMeta();
      toast.success(userIds.length === 1 ? 'Parent added to group.' : 'Parents added to group.');
    } catch (error: any) {
      showThreadAlert('Add members', error?.message || 'Could not add members to this group.', [{ text: 'OK' }]);
    }
  }, [addGroupParticipants, h.refreshThreadMeta, showThreadAlert, threadId]);

  const handleRemoveGroupMember = useCallback((participantUserId: string) => {
    const participant = h.threadParticipants.find((entry) => entry.user_id === participantUserId);
    const participantName = [
      participant?.user_profile?.first_name || '',
      participant?.user_profile?.last_name || '',
    ].join(' ').trim() || 'this member';

    showThreadAlert(
      'Remove member',
      `Remove ${participantName} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeGroupParticipant.mutateAsync({
                threadId,
                userId: participantUserId,
              });
              h.refreshThreadMeta();
              toast.success('Member removed from the group.');
            } catch (error: any) {
              showThreadAlert('Remove member', error?.message || 'Could not remove this member.', [{ text: 'OK' }]);
            }
          },
        },
      ],
    );
  }, [h.refreshThreadMeta, h.threadParticipants, removeGroupParticipant, showThreadAlert, threadId]);

  // Layout calculations
  const composerBottomInset = Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, 2);
  const keyboardUp = h.keyboardHeight > 0;
  const safeComposerHeight = isComposerReadOnly
    ? 52
    : Math.max(h.composerHeight, COMPOSER_OVERLAY_HEIGHT);
  // When keyboard is up: move safe-area from padding → bottom offset (clears nav bar).
  // safeComposerHeight (from onLayout) already includes paddingBottom, so don't add composerBottomInset again.
  const composerExtraBottom = keyboardUp ? composerBottomInset : 0;
  const messageViewportInset = h.keyboardHeight + COMPOSER_FLOAT_GAP + composerExtraBottom + safeComposerHeight;

  if (!threadId) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.error} />
          <Text style={[styles.errorText, { color: theme.text }]}>Invalid message thread</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
            <Text style={[styles.btnText, { color: theme.onPrimary }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ChatHeader
        displayName={displayName} isOnline={isOnline} lastSeenText={lastSeenText}
        isLoading={h.loading} isTyping={h.isOtherTyping} typingText={h.typingText}
        recipientRole={isGroup ? null : recipientRole}
        avatarUrl={headerAvatarUrl}
        isGroup={isGroup}
        participantCount={isGroup ? groupMemberCount : undefined}
        onlineCount={isGroup ? groupOnlineCount : undefined}
        onHeaderPress={openParticipantSheet}
        onVoiceCall={handleVoiceCall} onVideoCall={handleVideoCall}
        onOptionsPress={() => h.setShowOptionsMenu(true)}
      />
      <View style={styles.contentArea}>
        {/* Wallpaper */}
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          {h.currentWallpaper?.type === 'url' ? (
            <ImageBackground source={{ uri: h.currentWallpaper.value }} style={StyleSheet.absoluteFillObject} resizeMode="cover">
              <View style={styles.wallpaperOverlay} />
            </ImageBackground>
          ) : (
            <LinearGradient colors={h.getWallpaperGradient()} style={StyleSheet.absoluteFillObject} />
          )}
        </View>

        {/* Messages — clipped above composer so bubbles don't scroll behind it */}
        <View style={[styles.messagesClip, { marginBottom: messageViewportInset }]}>
          {h.loading ? (
            <View style={styles.center}><EduDashSpinner size="large" color={theme.primary} /><Text style={styles.loadingText}>Loading messages...</Text></View>
          ) : h.error ? (
            <View style={styles.center}>
              <Ionicons name="alert-circle-outline" size={48} color={theme.error} />
              <Text style={styles.errorText}>Failed to load messages</Text>
              <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={h.refetch}><Text style={[styles.btnText, { color: theme.onPrimary }]}>Retry</Text></TouchableOpacity>
            </View>
          ) : h.allMessages.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="rgba(255,255,255,0.4)" />
              <Text style={styles.emptyTitle}>Start the Conversation</Text>
              <Text style={styles.emptySub}>Send your first message to {displayName}</Text>
            </View>
          ) : (
            <>
              {pinnedMessages.length > 0 && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(59,130,246,0.12)', paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
                  onPress={() => handleScrollToMessage(pinnedMessages[pinnedMessages.length - 1].id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pin" size={16} color={theme.primary} />
                  <Text style={{ color: theme.text, fontSize: 13, flex: 1 }} numberOfLines={1}>
                    {pinnedMessages[pinnedMessages.length - 1].content}
                  </Text>
                  {pinnedMessages.length > 1 && (
                    <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                      +{pinnedMessages.length - 1}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              <FlashList ref={h.listRef} data={h.rowsAsc} renderItem={renderRow} keyExtractor={item => item.key}
              getItemType={item => item.type} onScroll={h.handleScroll} scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
              removeClippedSubviews={false}
              extraData={{
                currentlyPlayingVoiceId: h.currentlyPlayingVoiceId,
                isOtherTyping: h.isOtherTyping,
                keyboardHeight: h.keyboardHeight,
              }}
              contentContainerStyle={[styles.messagesContent, { paddingBottom: 2 }]} />
            </>
          )}
        </View>

        {/* Scroll FAB */}
        {h.showScrollFab && (
          <TouchableOpacity style={[styles.scrollToBottomFab, { bottom: messageViewportInset + 12 }]} onPress={h.scrollToBottom} activeOpacity={0.8}>
            <Ionicons name="chevron-down" size={22} color="#e2e8f0" />
          </TouchableOpacity>
        )}

        {/* Typing */}
        {h.isOtherTyping && (
          <View style={[styles.typingIndicatorContainer, { bottom: messageViewportInset + 4 }]}>
            <View style={styles.typingIndicatorBubble}>
              <TypingIndicator color="#94a3b8" size={5} /><Text style={styles.typingIndicatorText}>{h.typingText}</Text>
            </View>
          </View>
        )}

        {/* Composer — hidden for announcement channel subscribers */}
        <View style={[styles.composerArea, { bottom: h.keyboardHeight + COMPOSER_FLOAT_GAP + composerExtraBottom, paddingBottom: keyboardUp ? 0 : composerBottomInset }]} onLayout={isComposerReadOnly ? undefined : h.handleComposerLayout}>
          {isComposerReadOnly ? (
            <View style={[announcementBannerStyle, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name={isAnnouncementReadOnly ? 'megaphone-outline' : 'chatbox-ellipses-outline'} size={16} color={theme.textSecondary} />
              <Text style={{ color: theme.textSecondary, fontSize: 13, marginLeft: 8 }}>
                {composerReadOnlyLabel}
              </Text>
            </View>
          ) : (
            <MessageComposer
              onSend={actions.editingMessage ? actions.confirmEdit : h.handleSend}
              onVoiceRecording={h.handleVoiceRecording} onImageAttach={h.handleImageAttach}
              sending={h.sending} replyingTo={h.replyingTo} onCancelReply={() => h.setReplyingTo(null)}
              onTyping={h.setTyping} editingMessage={actions.editingMessage} onCancelEdit={actions.cancelEdit}
              enableDashAssist={canUsePrincipalDashAssist}
              dashAssistRecipientRole={dashAssistRecipientRole}
              showAlert={(config) => showThreadAlert(config.title, config.message, config.buttons)}
              onSchedule={(text) => { h.setPendingScheduleText(text); h.setShowScheduler(true); }}
              onOpenTemplates={() => setShowTemplatePicker(true)}
            />
          )}
        </View>
      </View>

      {/* Modals */}
      {ThreadOptionsMenu && (
        <ThreadOptionsMenu visible={h.showOptionsMenu} onClose={() => h.setShowOptionsMenu(false)}
          onChangeWallpaper={() => { h.setShowOptionsMenu(false); h.setShowWallpaperPicker(true); }}
          onMuteNotifications={opts.handleMuteNotifications} onSearchInChat={opts.handleSearchInChat}
          onClearChat={opts.handleClearChat} onExportChat={opts.handleExportChat}
          onMediaLinksAndDocs={opts.handleMediaLinksAndDocs} onStarredMessages={opts.handleStarredMessages}
          onDisappearingMessages={opts.handleDisappearingMessages} onAddShortcut={opts.handleAddShortcut}
          onReport={opts.handleReport} onBlockUser={opts.handleBlockUser}
          onViewContact={() => {
            h.setShowOptionsMenu(false);
            void openParticipantSheet();
          }}
          isMuted={opts.isMuted} isBlocked={opts.isUserBlocked} disappearingLabel={opts.disappearingStatusLabel}
          contactName={displayName} isGroup={isGroup} participantCount={groupMemberCount || undefined}
          onGroupInfo={isGroup ? () => void openParticipantSheet() : undefined}
          onToggleAutoTranslate={att.toggleAutoTranslate}
          isAutoTranslateEnabled={att.autoTranslateEnabled} />
      )}
      {ChatWallpaperPicker && (
        <ChatWallpaperPicker isOpen={h.showWallpaperPicker} onClose={() => h.setShowWallpaperPicker(false)}
          onSelect={(selection: any) => { h.setCurrentWallpaper(selection); h.setShowWallpaperPicker(false); }} />
      )}
      {MessageActionsMenu && h.selectedMessage && (
        <MessageActionsMenu visible={h.showMessageActions}
          onClose={() => { h.setShowMessageActions(false); h.setSelectedMessage(null); }}
          messageId={h.selectedMessage.id} messageContent={h.selectedMessage.content}
          isOwnMessage={h.selectedMessage.sender_id === user?.id}
          onReact={actions.handleReact} onReply={actions.handleReply} onCopy={actions.handleCopy}
          onForward={actions.handleForward} onDelete={actions.handleDelete}
          onEdit={h.selectedMessage.sender_id === user?.id ? actions.handleEdit : undefined}
          onStar={actions.handleToggleStar}
          showAddToWeeklyProgram={showAddToWeeklyProgram}
          onAddToWeeklyProgram={showAddToWeeklyProgram ? handleAddToWeeklyProgram : undefined}
          showConvertToRoutineRequest={showConvertToRoutineRequest}
          onConvertToRoutineRequest={showConvertToRoutineRequest ? handleConvertToRoutineRequest : undefined}
          onPin={actions.handlePinMessage}
          isPinned={!!(h.selectedMessage as any)?.is_pinned} />
      )}
      <ForwardMessagePicker visible={actions.showForwardPicker} onSelect={actions.confirmForward} onCancel={actions.cancelForward} />
      <ChatSearchOverlay visible={opts.showSearchOverlay} query={opts.searchQuery} results={opts.searchResults as any[]}
        isSearching={opts.isSearching} onSearch={opts.performSearch} onClose={opts.closeSearch}
        onScrollToMessage={handleScrollToMessage} />
      <MediaGalleryView visible={opts.showMediaGallery} threadId={threadId} onClose={opts.closeMediaGallery} />
      <StarredMessagesView visible={opts.showStarredMessages} threadId={threadId} onClose={opts.closeStarredMessages} />
      <MessageScheduler visible={h.showScheduler} onClose={() => { h.setShowScheduler(false); h.setPendingScheduleText(null); }}
        onSchedule={(scheduledAt) => { h.handleScheduledSend(scheduledAt); }} />
      <TemplatePickerSheet visible={showTemplatePicker} onClose={() => setShowTemplatePicker(false)}
        onSelect={(tpl) => { h.handleSend(tpl.body); setShowTemplatePicker(false); }} />
      <ChatParticipantSheet
        visible={showParticipantSheet}
        onClose={() => setShowParticipantSheet(false)}
        title={displayName}
        subtitle={isGroup ? groupTypeLabel || 'Group chat' : (isOnline ? 'Online now' : lastSeenText)}
        role={isGroup ? null : (participantSheetDetails?.role || recipientRole)}
        email={participantSheetDetails?.email}
        phone={participantSheetDetails?.phone}
        avatarUrl={headerAvatarUrl}
        avatarLabel={displayName.charAt(0).toUpperCase()}
        isGroup={isGroup}
        isLoading={participantSheetLoading}
        participantCount={groupMemberCount}
        onlineCount={groupOnlineCount}
        participants={participantSheetMembers}
        quickActions={participantQuickActions}
        groupDescription={h.threadInfo?.group_description || null}
        adminControls={canManageParentGroup ? {
          canManageMembers: true,
          canToggleReplies: true,
          allowReplies: h.threadInfo?.allow_replies ?? true,
          isUpdatingReplies: updateGroupReplyPolicy.isPending,
          onToggleReplies: handleToggleGroupReplies,
          addCandidates: availableParentCandidates,
          isAddingMembers: addGroupParticipants.isPending,
          onAddMembers: handleAddGroupMembers,
          onRemoveParticipant: handleRemoveGroupMember,
          removingParticipantId: removeGroupParticipant.isPending ? (removeGroupParticipant.variables?.userId ?? null) : null,
        } : null}
      />
      <AlertModal {...alertProps} />
    </KeyboardAvoidingView>
  );
}
