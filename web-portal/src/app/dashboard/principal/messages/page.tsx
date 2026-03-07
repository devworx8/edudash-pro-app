'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { MessageCircle, Search, Send, Smile, Paperclip, Mic, Loader2, ArrowLeft, MoreVertical, Phone, Video, Plus, Sparkles, Reply, X, Users } from 'lucide-react';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';
import { ChatMessageBubble, type ChatMessage } from '@/components/messaging/ChatMessageBubble';
import { useComposerEnhancements, EMOJI_OPTIONS } from '@/lib/messaging/useComposerEnhancements';
import { useTypingIndicator } from '@/lib/hooks/useTypingIndicator';
import { useCall, QuickCallModal } from '@/components/calls';
import { ChatWallpaperPicker } from '@/components/messaging/ChatWallpaperPicker';
import { MessageOptionsMenu } from '@/components/messaging/MessageOptionsMenu';
import { MessageActionsMenu } from '@/components/messaging/MessageActionsMenu';
import { NewChatModal } from '@/components/messaging/NewChatModal';
import { InviteContactModal } from '@/components/messaging/InviteContactModal';
import { CreateGroupModal } from '@/components/messaging/CreateGroupModal';
import { GroupChatAvatarModal } from '@/components/messaging/GroupChatAvatarModal';
import { DashAIAvatar } from '@/components/dash/DashAIAvatar';
import { TypingIndicatorBubble } from '@/components/messaging/TypingIndicatorBubble';
import { VoiceRecordingOverlay } from '@/components/messaging/VoiceRecordingOverlay';
import { getMessageDisplayText, type CallEventContent } from '@/lib/messaging/messageContent';
import { resolveReactionProfiles } from '@/lib/messaging/reactionProfiles';
import { clampPercent } from '@/lib/ui/clampPercent';
import { 
  type MessageThread,
  type ParticipantProfile,
  DASH_AI_THREAD_ID, 
  DASH_AI_USER_ID,
  createDashAIThread
} from '@/lib/messaging/types';
import { 
  DateSeparator, 
  formatMessageTime, 
  getDateSeparatorLabel, 
  getDateKey 
} from '@/components/messaging/ThreadList';

interface ThreadItemProps {
  thread: MessageThread;
  isActive: boolean;
  onSelect: () => void;
  currentUserId?: string;
}

interface ChatContact {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
}

const GROUP_THREAD_TYPES = new Set([
  'class_group',
  'parent_group',
  'teacher_group',
  'announcement',
  'custom',
]);

const isGroupThread = (thread: MessageThread) => {
  if (thread.is_group || thread.group_type) return true;
  return GROUP_THREAD_TYPES.has(thread.type);
};

const formatGroupTypeLabel = (rawType?: string | null) => {
  if (!rawType) return 'Group';
  return rawType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getGroupDisplayName = (thread: MessageThread) =>
  thread.group_name?.trim() || thread.subject?.trim() || 'Group Chat';

// Principal-specific ThreadItem with group-aware rendering
const PrincipalThreadItem = ({ thread, isActive, onSelect, currentUserId }: ThreadItemProps) => {
  const isDashAI = thread.id === DASH_AI_THREAD_ID || thread.type === 'dash_ai';
  const participants = thread.message_participants || thread.participants || [];
  const isGroup = isGroupThread(thread);
  const groupName = getGroupDisplayName(thread);

  const otherParticipant = participants.find((p) => p.user_id !== currentUserId);
  const otherProfile = (otherParticipant
    ? ('profiles' in otherParticipant ? otherParticipant.profiles : otherParticipant.user_profile)
    : undefined) as ParticipantProfile | undefined;
  const contactName = otherProfile
    ? `${otherProfile.first_name || ''} ${otherProfile.last_name || ''}`.trim()
    : 'Contact';
  const contactRole = otherProfile?.role || otherParticipant?.role || 'member';

  const displayName = isDashAI ? 'Dash AI' : isGroup ? groupName : contactName;
  const displayRole = isDashAI
    ? 'ai_assistant'
    : isGroup
    ? thread.group_type === 'announcement' || thread.type === 'announcement'
      ? 'principal'
      : thread.group_type === 'parent_group'
      ? 'parent'
      : 'teacher'
    : contactRole;

  const studentName = thread.student
    ? `${thread.student.first_name} ${thread.student.last_name}`
    : null;
  const hasUnread = (thread.unread_count || 0) > 0;

  const getInitials = (name: string) => {
    if (!name || name.trim() === '') return '?';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0]?.[0]?.toUpperCase() || '?';
  };

  const getMessageStatus = () => {
    if (!thread.last_message || thread.last_message.sender_id !== currentUserId) return null;
    const msg = thread.last_message;
    const otherParticipantIds = participants
      .map((p) => p.user_id)
      .filter((id): id is string => Boolean(id && id !== currentUserId));
    const isRead =
      Array.isArray(msg.read_by) && otherParticipantIds.length > 0
        ? otherParticipantIds.some((id) => msg.read_by?.includes(id))
        : false;

    if (isRead) return { ticks: '✓✓', color: '#34d399' };
    if (msg.delivered_at) return { ticks: '✓✓', color: 'rgba(148, 163, 184, 0.6)' };
    return { ticks: '✓', color: 'rgba(148, 163, 184, 0.6)' };
  };

  const messageStatus = getMessageStatus();

  const getBackgroundGradient = () => {
    if (isDashAI) {
      return isActive
        ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(236, 72, 153, 0.2) 100%)'
        : 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(236, 72, 153, 0.05) 100%)';
    }
    if (displayRole === 'principal') {
      return isActive
        ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.25) 0%, rgba(168, 85, 247, 0.2) 100%)'
        : 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%)';
    }
    if (displayRole === 'parent') {
      return isActive
        ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(16, 185, 129, 0.15) 100%)'
        : 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(16, 185, 129, 0.04) 100%)';
    }
    return isActive
      ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(99, 102, 241, 0.15) 100%)'
      : 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(99, 102, 241, 0.04) 100%)';
  };

  const getAvatarGradient = () => {
    if (isDashAI) return 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)';
    if (displayRole === 'principal') return 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)';
    if (displayRole === 'parent') return 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
    return 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)';
  };

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '14px 16px',
        margin: '4px 8px',
        borderRadius: 16,
        cursor: 'pointer',
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        transition: 'all 0.25s ease',
        background: getBackgroundGradient(),
        border: isActive
          ? isDashAI
            ? '1px solid rgba(168, 85, 247, 0.3)'
            : displayRole === 'principal'
            ? '1px solid rgba(139, 92, 246, 0.35)'
            : '1px solid rgba(59, 130, 246, 0.3)'
          : '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: isActive
          ? isDashAI
            ? '0 4px 20px rgba(168, 85, 247, 0.2), 0 0 30px rgba(168, 85, 247, 0.1)'
            : '0 4px 16px rgba(59, 130, 246, 0.15)'
          : 'none',
        width: 'calc(100% - 16px)',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = getBackgroundGradient();
          e.currentTarget.style.transform = 'translateX(4px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = getBackgroundGradient();
          e.currentTarget.style.transform = 'translateX(0)';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      {isDashAI ? (
        <DashAIAvatar size={48} showStars={true} animated={isActive} />
      ) : (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            background: getAvatarGradient(),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 16,
            fontWeight: 600,
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            transition: 'all 0.25s ease',
          }}
        >
          {getInitials(displayName)}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: hasUnread ? 700 : 600,
                color: isDashAI ? '#e879f9' : (hasUnread ? '#f1f5f9' : '#e2e8f0'),
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                letterSpacing: '0.01em',
              }}
            >
              {displayName}
            </span>
            {isDashAI && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#fff',
                background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                padding: '3px 8px',
                borderRadius: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                boxShadow: '0 2px 8px rgba(168, 85, 247, 0.4)',
              }}>
                AI
              </span>
            )}
          </div>
          {thread.last_message?.created_at && (
            <span style={{ 
              fontSize: 11, 
              color: hasUnread ? '#a78bfa' : '#64748b', 
              fontWeight: hasUnread ? 600 : 400,
              flexShrink: 0,
              marginLeft: 8,
            }}>
              {formatMessageTime(thread.last_message.created_at)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          {messageStatus && (
            <span style={{ 
              fontSize: 13, 
              fontWeight: 600,
              color: messageStatus.color,
              letterSpacing: '-3px',
              marginRight: 4,
              flexShrink: 0,
            }}>
              {messageStatus.ticks}
            </span>
          )}
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: hasUnread ? '#cbd5e1' : '#64748b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.4,
              flex: 1,
            }}
          >
            {thread.last_message?.content 
              ? getMessageDisplayText(thread.last_message.content) 
              : 'No messages yet'}
          </p>
        </div>
        {isGroup ? (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {formatGroupTypeLabel(thread.group_type || thread.type)} • {participants.length} members
          </div>
        ) : studentName ? (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Student: {studentName}
          </div>
        ) : null}
      </div>
      {hasUnread && (
        <div
          style={{
            minWidth: 22,
            height: 22,
            borderRadius: 11,
            background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.4)',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>
            {thread.unread_count && thread.unread_count > 9 ? '9+' : thread.unread_count}
          </span>
        </div>
      )}
    </div>
  );
};

function PrincipalMessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadFromUrl = searchParams.get('thread');
  const directContactId = searchParams.get('to');
  const createParam = searchParams.get('create');
  useBodyScrollLock(true);
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(threadFromUrl);
  const selectedThreadIdRef = useRef<string | null>(null);
  const directContactHandledRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const { profile, loading: profileLoading } = useUserProfile(userId);
  const schoolId = profile?.preschoolId || profile?.organizationId;
  const CHAT_WALLPAPER_STORAGE_KEY_BASE = 'edudash-chat-wallpaper';
  const wallpaperStorageKey =
    userId && schoolId
      ? `${CHAT_WALLPAPER_STORAGE_KEY_BASE}:${userId}:${schoolId}`
      : CHAT_WALLPAPER_STORAGE_KEY_BASE;
  const { slug: tenantSlug } = useTenantSlug(userId);

  // Typing indicator and calling
  const { typingText, startTyping, stopTyping } = useTypingIndicator({ supabase, threadId: selectedThreadId, userId });
  const { startVoiceCall, startVideoCall } = useCall();

  // Chat wallpaper state with localStorage persistence
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [wallpaperCss, setWallpaperCss] = useState<string | null>(null);

  // Presets mapping (shared)
  const presetMapPrincipal: Record<string, string> = {
    'purple-glow': 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
    'midnight': 'linear-gradient(180deg, #0a0f1e 0%, #1a1a2e 50%, #0a0f1e 100%)',
    'ocean-deep': 'linear-gradient(180deg, #0c4a6e 0%, #164e63 50%, #0f172a 100%)',
    'forest-night': 'linear-gradient(180deg, #14532d 0%, #1e3a3a 50%, #0f172a 100%)',
    'sunset-warm': 'linear-gradient(180deg, #7c2d12 0%, #4a1d1d 50%, #0f172a 100%)',
    'dark-slate': 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
  };

  // Load wallpaper from localStorage on mount
  useEffect(() => {
    const savedWallpaper = localStorage.getItem(wallpaperStorageKey);
    if (savedWallpaper) {
      try {
        const parsed = JSON.parse(savedWallpaper);
        if (parsed.type === 'url') {
          setWallpaperCss(`url(${parsed.value}) center/cover no-repeat fixed`);
        } else if (parsed.type === 'preset' && presetMapPrincipal[parsed.value]) {
          setWallpaperCss(presetMapPrincipal[parsed.value]);
        }
      } catch (e) {
        console.error('Failed to load wallpaper:', e);
        setWallpaperCss(null);
      }
    } else {
      setWallpaperCss(null);
    }
  }, [wallpaperStorageKey]);

  // Message options menu state
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [optionsMenuAnchor, setOptionsMenuAnchor] = useState<HTMLElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  // Message actions menu state
  const [messageActionsOpen, setMessageActionsOpen] = useState(false);
  const [messageActionsPosition, setMessageActionsPosition] = useState({ x: 0, y: 0 });
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  
  // Reply context state
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  
  // Forward modal state
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);

  // New Chat modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showQuickCallModal, setShowQuickCallModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupAvatarModalUser, setGroupAvatarModalUser] = useState<{ userId: string; userName: string } | null>(null);

  // Dash AI state
  const [dashAIMessages, setDashAIMessages] = useState<ChatMessage[]>([]);
  const [dashAILastMessage, setDashAILastMessage] = useState<string>('Hi! I\'m Dash, your AI leadership assistant. I can help with staff updates, announcements, and planning. ✨');
  const [dashAILastMessageAt, setDashAILastMessageAt] = useState<string>(new Date().toISOString());
  const [dashAILoading, setDashAILoading] = useState(false);

  const applyWallpaper = (sel: { type: 'preset' | 'url'; value: string }) => {
    // Save to localStorage for persistence
    localStorage.setItem(wallpaperStorageKey, JSON.stringify(sel));
    
    if (sel.type === 'url') {
      setWallpaperCss(`url(${sel.value}) center/cover no-repeat fixed`);
      return;
    }
    // Presets mapping (mirror of ChatWallpaperPicker presets)
    const presetMap: Record<string, string> = {
      'purple-glow': 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      'midnight': 'linear-gradient(180deg, #0a0f1e 0%, #1a1a2e 50%, #0a0f1e 100%)',
      'ocean-deep': 'linear-gradient(180deg, #0c4a6e 0%, #164e63 50%, #0f172a 100%)',
      'forest-night': 'linear-gradient(180deg, #14532d 0%, #1e3a3a 50%, #0f172a 100%)',
      'sunset-warm': 'linear-gradient(180deg, #7c2d12 0%, #4a1d1d 50%, #0f172a 100%)',
      'dark-slate': 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
    };
    setWallpaperCss(presetMap[sel.value] || presetMap['purple-glow']);
  };

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  const startConversationWithContact = useCallback(async (contact: ChatContact) => {
    if (!userId || !schoolId) return;
    if (contact.id === userId) return;

    const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    const contactRole = contact.role || 'member';
    const currentRole = profile?.role || 'principal';

    try {
      const { data: existingThreads, error: threadsError } = await supabase
        .from('message_threads')
        .select(`
          id,
          is_group,
          group_type,
          message_participants(user_id)
        `)
        .eq('preschool_id', schoolId);

      if (threadsError) throw threadsError;

      type ExistingThread = {
        id: string;
        is_group?: boolean | null;
        group_type?: string | null;
        message_participants?: Array<{ user_id: string }>;
      };

      const threads = (existingThreads || []) as ExistingThread[];

      const existingThread = threads.find((thread) => {
        const participants = thread.message_participants || [];
        const hasCurrent = participants.some((p) => p.user_id === userId);
        const hasContact = participants.some((p) => p.user_id === contact.id);
        const isGroup = thread.is_group || thread.group_type;
        return hasCurrent && hasContact && !isGroup;
      });

      if (existingThread?.id) {
        setSelectedThreadId(existingThread.id);
        router.push(`/dashboard/principal/messages?thread=${existingThread.id}`);
        return;
      }

      const threadType = contactRole === 'parent' ? 'parent-principal' : 'staff-chat';
      const threadPayload = {
        preschool_id: schoolId,
        subject: contactName ? `Conversation with ${contactName}` : 'New Conversation',
        created_by: userId,
        type: threadType,
        last_message_at: new Date().toISOString(),
      };

      let newThread: { id: string } | null = null;
      const { data: createdThread, error: threadError } = await supabase
        .from('message_threads')
        .insert(threadPayload)
        .select()
        .single();

      if (threadError) {
        const errorMessage = threadError.message?.toLowerCase() || '';
        if (errorMessage.includes('created_by')) {
          const { data: fallbackThread, error: fallbackError } = await supabase
            .from('message_threads')
            .insert({
              preschool_id: schoolId,
              subject: contactName ? `Conversation with ${contactName}` : 'New Conversation',
              type: threadType,
              last_message_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (fallbackError) throw fallbackError;
          newThread = fallbackThread;
        } else {
          throw threadError;
        }
      } else {
        newThread = createdThread;
      }

      if (!newThread?.id) {
        throw new Error('Unable to create conversation.');
      }

      await supabase.from('message_participants').insert([
        {
          thread_id: newThread.id,
          user_id: userId,
          role: currentRole,
          last_read_at: new Date().toISOString(),
        },
        {
          thread_id: newThread.id,
          user_id: contact.id,
          role: contactRole,
          last_read_at: new Date().toISOString(),
        },
      ]);

      setSelectedThreadId(newThread.id);
      setRefreshTrigger(prev => prev + 1);
      router.push(`/dashboard/principal/messages?thread=${newThread.id}`);
    } catch (err) {
      console.error('Error starting conversation:', err);
      alert('Failed to start conversation. Please try again.');
    }
  }, [profile?.role, router, schoolId, supabase, userId]);

  const startConversationWithContactId = useCallback(async (contactId: string) => {
    if (!contactId) return;
    try {
      const { data: contactProfile, error: contactError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .eq('id', contactId)
        .maybeSingle();

      if (contactError) throw contactError;
      if (!contactProfile) {
        alert('Contact not found.');
        return;
      }

      await startConversationWithContact({
        id: contactProfile.id,
        first_name: contactProfile.first_name,
        last_name: contactProfile.last_name,
        role: contactProfile.role,
      });
    } catch (err) {
      console.error('Error loading contact:', err);
      alert('Unable to start this conversation.');
    }
  }, [startConversationWithContact, supabase]);

  // Auto-select thread from URL query param
  useEffect(() => {
    if (threadFromUrl && threadFromUrl !== selectedThreadId) {
      setSelectedThreadId(threadFromUrl);
    }
  }, [threadFromUrl]);

  useEffect(() => {
    if (createParam === 'group' && profile?.role) {
      setShowCreateGroupModal(true);
    }
  }, [createParam, profile?.role]);

  useEffect(() => {
    if (!directContactId || threadFromUrl) return;
    if (directContactHandledRef.current === directContactId) return;
    if (!userId || !schoolId) return;
    directContactHandledRef.current = directContactId;
    startConversationWithContactId(directContactId);
  }, [directContactId, schoolId, startConversationWithContactId, threadFromUrl, userId]);

  const scrollToBottom = (instant = false) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
  };

  const {
    emojiButtonRef,
    emojiPickerRef,
    showEmojiPicker,
    setShowEmojiPicker,
    handleEmojiSelect,
    triggerFilePicker,
    fileInputRef,
    handleAttachmentChange,
    attachmentUploading,
    isRecording,
    handleMicClick,
    statusMessage,
    uploadProgress,
    recordingDuration,
    recordingLocked,
    handleRecordingLock,
    handleRecordingCancel,
    handleRecordingSend,
  } = useComposerEnhancements({
    supabase,
    threadId: selectedThreadId,
    userId,
    onRefresh: () => setRefreshTrigger(prev => prev + 1),
    onEmojiInsert: (emoji) => setMessageText((prev) => `${prev}${emoji}`),
  });

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setAuthLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  // Initial scroll to bottom when messages load - use instant scroll
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (messages.length > 0) {
      // Use instant scroll for initial load, smooth for new messages
      scrollToBottom(!initialScrollDone.current);
      initialScrollDone.current = true;
    }
  }, [messages]);

  // Reset initial scroll flag when thread changes
  useEffect(() => {
    initialScrollDone.current = false;
  }, [selectedThreadId]);

  const markThreadAsRead = useCallback(async (threadId: string) => {
    if (!userId) return;
    try {
      const { error } = await supabase.rpc('mark_thread_messages_as_read', {
        thread_id: threadId,
        reader_id: userId,
      });
      if (!error) {
        // Immediately update local state to show 0 unread for this thread
        setThreads(prev => prev.map(t => 
          t.id === threadId ? { ...t, unread_count: 0 } : t
        ));
      }
    } catch (err) {
      // Silent fail - marking as read is not critical
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (selectedThreadId && userId) {
      const markAndRefresh = async () => {
        await markThreadAsRead(selectedThreadId);
        // Refresh threads to get updated last_read_at
        setTimeout(() => setRefreshTrigger(prev => prev + 1), 500);
      };
      // Mark thread as read after a brief delay to let UI render
      setTimeout(markAndRefresh, 300);
    }
  }, [selectedThreadId, userId, markThreadAsRead]);

  const fetchMessages = useCallback(async (threadId: string) => {
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          thread_id,
          sender_id,
          content,
          created_at,
          delivered_at,
          read_by,
          deleted_at,
          reply_to_id,
          forwarded_from_id
        `)
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      
      // Fetch sender profiles separately to avoid ambiguous FK issue
      let messagesWithDetails = data || [];
      if (!error && messagesWithDetails.length > 0) {
        const senderIds = [...new Set(messagesWithDetails.map((m: any) => m.sender_id))];
        const { data: senderProfiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, role')
          .in('id', senderIds);
        
        const profileMap = new Map((senderProfiles || []).map((p: any) => [p.id, p]));
        messagesWithDetails = messagesWithDetails.map((msg: any) => ({
          ...msg,
          sender: profileMap.get(msg.sender_id) || null,
        }));
      }
      
      // Fetch reply_to message content for messages that are replies
      const replyIds = messagesWithDetails
        .filter((m: any) => m.reply_to_id)
        .map((m: any) => m.reply_to_id);
      
      if (replyIds.length > 0) {
        const { data: replyMessages } = await supabase
          .from('messages')
          .select('id, content, sender_id')
          .in('id', replyIds);
        
        // Get sender profiles for replies
        const replySenderIds = [...new Set((replyMessages || []).map((r: any) => r.sender_id))];
        const { data: replySenderProfiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', replySenderIds);
        
        const replySenderMap = new Map((replySenderProfiles || []).map((p: any) => [p.id, p]));
        const replyMap = new Map((replyMessages || [])
          .map((r: any) => [r.id, {
            ...r,
            sender: replySenderMap.get(r.sender_id),
          }]));
        
        messagesWithDetails = messagesWithDetails.map((msg: any) => ({
          ...msg,
          reply_to: msg.reply_to_id ? replyMap.get(msg.reply_to_id) : null,
        }));
      }
      
      // Fetch reactions for all messages
      const messageIds = messagesWithDetails.map((m: any) => m.id);
      if (messageIds.length > 0) {
        const { data: reactions } = await supabase
          .from('message_reactions')
          .select('message_id, emoji, user_id')
          .in('message_id', messageIds);
        
        // Group reactions by message and emoji
        const reactionMap = new Map<string, Map<string, { count: number; users: string[] }>>();
        (reactions || []).forEach((r: any) => {
          if (!reactionMap.has(r.message_id)) {
            reactionMap.set(r.message_id, new Map());
          }
          const msgReactions = reactionMap.get(r.message_id)!;
          if (!msgReactions.has(r.emoji)) {
            msgReactions.set(r.emoji, { count: 0, users: [] });
          }
          const emojiData = msgReactions.get(r.emoji)!;
          emojiData.count++;
          emojiData.users.push(r.user_id);
        });

        const reactorUserIds: string[] = Array.from(new Set(
          (reactions || [])
            .map((r: any) => (typeof r.user_id === 'string' ? r.user_id : String(r.user_id || '')))
            .filter(Boolean),
        ));
        const reactorProfileMap = await resolveReactionProfiles(supabase, reactorUserIds);

        messagesWithDetails = messagesWithDetails.map((msg: any) => {
          const msgReactions = reactionMap.get(msg.id);
          if (!msgReactions) return { ...msg, reactions: [] };
          
          const reactionsArray = Array.from(msgReactions.entries()).map(([emoji, data]) => ({
            emoji,
            count: data.count,
            hasReacted: data.users.includes(userId || ''),
            reactedByUserIds: data.users,
            reactedBy: data.users.map((uid: string) => reactorProfileMap.get(uid)).filter(Boolean).map((p: any) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name })),
          }));
          
          return { ...msg, reactions: reactionsArray };
        });
      }

      if (error) throw error;
      setMessages(messagesWithDetails);
      // Web must explicitly mark delivery for incoming messages (sender sees delivered tick).
      if (userId) {
        try {
          await supabase.rpc('mark_messages_delivered', {
            p_thread_id: threadId,
            p_user_id: userId,
          });
        } catch {
          // Non-critical.
        }
      }
      await markThreadAsRead(threadId);
      // Instant scroll to bottom when opening chat (no animation)
      setTimeout(() => scrollToBottom(true), 10);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  }, [markThreadAsRead, supabase, userId]);

  const getThreadContactKey = (thread: MessageThread, currentUserId: string | undefined) => {
    if (isGroupThread(thread)) {
      return `thread:${thread.id}`;
    }
    const participants = thread.message_participants || thread.participants || [];
    const otherParticipant = participants.find((p) => p.user_id !== currentUserId);
    if (!otherParticipant?.user_id) {
      return `thread:${thread.id}`;
    }
    return `contact:${otherParticipant.user_id}`;
  };

  const getThreadRecencyValue = (thread: MessageThread) => {
    const rawTimestamp = thread.last_message?.created_at || thread.last_message_at;
    return rawTimestamp ? new Date(rawTimestamp).getTime() : 0;
  };

  const fetchThreads = useCallback(async () => {
    if (!userId || !schoolId) {
      return;
    }

    setThreadsLoading(true);
    setError(null);

    try {
      // First fetch threads with participants (no FK to profiles, so fetch separately)
      const { data: threads, error: threadsError } = await supabase
        .from('message_threads')
        .select(`
          id,
          type,
          subject,
          is_group,
          group_name,
          group_type,
          allow_replies,
          student_id,
          last_message_at,
          student:students(id, first_name, last_name),
          message_participants!inner(
            user_id,
            role,
            last_read_at,
            is_admin,
            can_send_messages
          )
        `)
        .eq('preschool_id', schoolId)
        .order('last_message_at', { ascending: false });
      
      if (threadsError) throw threadsError;
      
      // Collect unique user IDs from all participants to fetch their profiles
      const allUserIds = new Set<string>();
      (threads || []).forEach((thread: any) => {
        (thread.message_participants || []).forEach((p: any) => {
          if (p.user_id) allUserIds.add(p.user_id);
        });
      });
      
      // Fetch all participant profiles in one query
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .in('id', Array.from(allUserIds));
      
      // Create a lookup map for profiles
      const profilesMap = new Map<string, any>();
      (profilesData || []).forEach((p: any) => {
        profilesMap.set(p.id, p);
      });
      
      // Attach user_profile to each participant
      const threadsWithProfiles = (threads || []).map((thread: any) => ({
        ...thread,
        message_participants: (thread.message_participants || []).map((p: any) => ({
          ...p,
          user_profile: profilesMap.get(p.user_id) || null
        }))
      }));
      
      const uniqueThreadMap = new Map<string, any>();
      threadsWithProfiles.forEach((thread: any) => {
        if (!thread?.id) return;
        const existing = uniqueThreadMap.get(thread.id);
        if (!existing) {
          uniqueThreadMap.set(thread.id, thread);
          return;
        }
        const mergedParticipants = [
          ...(existing.message_participants || []),
          ...(thread.message_participants || []),
        ];
        const uniqueParticipants = Array.from(
          new Map(
            mergedParticipants
              .filter((participant) => participant?.user_id)
              .map((participant) => [participant.user_id, participant])
          ).values()
        );
        uniqueThreadMap.set(thread.id, {
          ...existing,
          ...thread,
          message_participants: uniqueParticipants,
        });
      });
      const dedupedThreads = Array.from(uniqueThreadMap.values());
      
      const userThreads = dedupedThreads.filter((thread: any) => 
        thread.message_participants?.some((p: any) => p.user_id === userId)
      );
      
      const { data: threadSummaries, error: summaryError } = await supabase.rpc(
        'get_my_message_threads_summary'
      );
      if (summaryError) {
        console.warn('Failed to load thread summaries via RPC:', summaryError);
      }

      const summaryMap = new Map<string, any>();
      (threadSummaries || []).forEach((summary: any) => {
        if (summary?.thread_id) {
          summaryMap.set(summary.thread_id, summary);
        }
      });

      const threadsWithDetails = userThreads.map((thread: any) => {
        const summary = summaryMap.get(thread.id);
        return {
          ...thread,
          last_message: summary?.last_message_id
            ? {
                id: summary.last_message_id,
                content: summary.last_message_content,
                created_at: summary.last_message_created_at,
                sender_id: summary.last_message_sender_id,
                delivered_at: summary.last_message_delivered_at,
                read_by: summary.last_message_read_by,
              }
            : thread.last_message,
          unread_count: Number(summary?.unread_count || 0),
        };
      });
      
      // Collapse duplicates so each contact only shows a single conversation (one inbox per contact)
      const uniqueParentThreadMap = new Map<string, MessageThread>();
      threadsWithDetails.forEach((thread) => {
        const key = getThreadContactKey(thread, userId);
        const existing = uniqueParentThreadMap.get(key);
        if (!existing || getThreadRecencyValue(thread) >= getThreadRecencyValue(existing)) {
          uniqueParentThreadMap.set(key, thread);
        }
      });

      const uniqueThreads = Array.from(uniqueParentThreadMap.values()).sort(
        (a, b) => getThreadRecencyValue(b) - getThreadRecencyValue(a)
      );

      setThreads(uniqueThreads);

      if (selectedThreadId) {
        const stillSelected = uniqueThreads.some((t) => t.id === selectedThreadId);
        if (!stillSelected) {
          const originalSelected = threadsWithDetails.find((t) => t.id === selectedThreadId);
          if (originalSelected) {
            const replacementKey = getThreadContactKey(originalSelected, userId);
            const replacement = uniqueParentThreadMap.get(replacementKey);
            setSelectedThreadId(replacement?.id || null);
          } else {
            setSelectedThreadId(null);
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setThreadsLoading(false);
    }
  }, [schoolId, selectedThreadId, supabase, userId]);

  useEffect(() => {
    if (userId && schoolId) {
      fetchThreads();
    }
  }, [userId, schoolId, fetchThreads, refreshTrigger]);

  useEffect(() => {
    if (selectedThreadId) {
      fetchMessages(selectedThreadId);
    } else {
      setMessages([]);
    }
  }, [selectedThreadId, fetchMessages]);

  useEffect(() => {
    if (!selectedThreadId) return;

    const channel = supabase
      .channel(`principal-messages:${selectedThreadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${selectedThreadId}`,
        },
        async (payload: { new: Record<string, unknown> }) => {
          // Fetch the complete message with sender info
          const newMsg = payload.new as { id: string; thread_id: string };
          const { data: newMessage } = await supabase
            .from('messages')
            .select(`
              id,
              thread_id,
              sender_id,
              content,
              created_at,
              delivered_at,
              read_by
            `)
            .eq('id', newMsg.id)
            .single();

          if (newMessage) {
            // Fetch sender profile
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('id, first_name, last_name, role')
              .eq('id', newMessage.sender_id)
              .single();
            
            const messageWithSender = {
              ...newMessage,
              sender: senderProfile || null
            };

            // Add new message to state immediately (avoid full re-fetch)
            setMessages((prev) => {
              // Avoid duplicate messages
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, messageWithSender];
            });

            // Play notification sound for incoming messages
            if (newMessage.sender_id !== userId) {
              try {
                const audio = new Audio('/sounds/notification.mp3');
                audio.volume = 0.5;
                audio.play().catch(() => {});
                // Vibrate on mobile if supported
                if ('vibrate' in navigator) {
                  navigator.vibrate(100);
                }
              } catch (e) {
                // Ignore audio errors
              }
            }

            // Update thread's last message in local state
            setThreads((prev) => prev.map(t => 
              t.id === selectedThreadId 
                ? { 
                    ...t, 
                    last_message: {
                      id: newMessage.id,
                      content: newMessage.content,
                      created_at: newMessage.created_at,
                      sender_id: newMessage.sender_id,
                      delivered_at: newMessage.delivered_at,
                      read_by: newMessage.read_by,
                    },
                    last_message_at: newMessage.created_at,
                    // User is viewing this thread, so unread stays at 0.
                    unread_count: 0,
                  } 
                : t
            ));

            // If we're actively viewing the thread, consider incoming messages delivered + read immediately.
            if (newMessage.sender_id !== userId && userId) {
              supabase
                .rpc('mark_messages_delivered', { p_thread_id: selectedThreadId, p_user_id: userId })
                .catch(() => {});
              supabase
                .rpc('mark_thread_messages_as_read', { thread_id: selectedThreadId, reader_id: userId })
                .catch(() => {});
            }

            // Scroll to bottom
            setTimeout(() => scrollToBottom(), 100);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${selectedThreadId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new as any;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id ? { ...m, delivered_at: updated.delivered_at, read_by: updated.read_by } : m
            )
          );
          setThreads((prev) =>
            prev.map((t) => {
              if (t.id !== selectedThreadId) return t;
              if (!t.last_message || t.last_message.id !== updated.id) return t;
              return {
                ...t,
                last_message: {
                  ...t.last_message,
                  delivered_at: updated.delivered_at,
                  read_by: updated.read_by,
                },
              };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedThreadId, supabase, userId]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        (event.key.toLowerCase() === 'x' || event.key === 'Escape') &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        if (selectedThreadIdRef.current) {
          setSelectedThreadId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Dash AI message handling
  const loadDashAIMessages = useCallback(() => {
    try {
      const stored = localStorage.getItem('principal-dash-ai-messages');
      if (stored) {
        const parsed = JSON.parse(stored);
        setDashAIMessages(parsed);
        if (parsed.length > 0) {
          const lastMsg = parsed[parsed.length - 1];
          setDashAILastMessage(lastMsg.content);
          setDashAILastMessageAt(lastMsg.created_at);
        }
      } else {
        // Create welcome message
        const welcomeMessage: ChatMessage = {
          id: 'dash-welcome',
          thread_id: DASH_AI_THREAD_ID,
          sender_id: DASH_AI_USER_ID,
          content: 'Hi! I\'m Dash, your AI leadership assistant. I can help with staff updates, announcements, planning, and parent communication templates. ✨',
          created_at: new Date().toISOString(),
          sender: {
            first_name: 'Dash',
            last_name: 'AI',
            role: 'ai_assistant',
          },
        };
        setDashAIMessages([welcomeMessage]);
      }
    } catch (e) {
      console.error('Failed to load Dash AI messages:', e);
      setDashAIMessages([]);
    }
  }, []);

  const saveDashAIMessages = useCallback((msgs: ChatMessage[]) => {
    try {
      localStorage.setItem('principal-dash-ai-messages', JSON.stringify(msgs));
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        setDashAILastMessage(lastMsg.content);
        setDashAILastMessageAt(lastMsg.created_at);
      }
    } catch (e) {
      console.error('Failed to save Dash AI messages:', e);
    }
  }, []);

  const sendDashAIMessage = useCallback(async (content: string) => {
    if (!content.trim() || !userId) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      thread_id: DASH_AI_THREAD_ID,
      sender_id: userId,
      content: content.trim(),
      created_at: new Date().toISOString(),
      sender: {
        first_name: profile?.firstName || 'Principal',
        last_name: profile?.lastName || '',
        role: profile?.role || 'principal',
      },
    };

    const updatedMessages = [...dashAIMessages, userMsg];
    setDashAIMessages(updatedMessages);
    saveDashAIMessages(updatedMessages);
    setDashAILoading(true);
    setTimeout(() => scrollToBottom(), 100);

    try {
      // Call canonical web AI endpoint (proxies to supabase/functions/ai-proxy)
      const response = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'principal',
          service_type: 'chat_message',
          enable_tools: true,
          prefer_openai: true,
          stream: false,
          payload: {
            prompt: content.trim(),
            context:
              'You are Dash, an AI assistant for school principals. Keep replies practical and concise. When helpful, offer templates (weekly plan, parent message, staff notice) and ask one short clarifying question.',
            conversationHistory: dashAIMessages.slice(-10).map((m) => ({
              role: m.sender_id === DASH_AI_USER_ID ? 'assistant' : 'user',
              content: m.content,
            })),
          },
          metadata: { role: 'principal', source: 'principal_messages_dash_ai' },
        }),
      });

      if (!response.ok) throw new Error('AI request failed');

      const data = await response.json();
      const aiResponse = data.content || data.message || 'That didn’t go through yet. Please try again or add more detail.';

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        thread_id: DASH_AI_THREAD_ID,
        sender_id: DASH_AI_USER_ID,
        content: aiResponse,
        created_at: new Date().toISOString(),
        sender: {
          first_name: 'Dash',
          last_name: 'AI',
          role: 'ai_assistant',
        },
      };

      const finalMessages = [...updatedMessages, aiMsg];
      setDashAIMessages(finalMessages);
      saveDashAIMessages(finalMessages);
    } catch (err) {
      console.error('Dash AI error:', err);
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        thread_id: DASH_AI_THREAD_ID,
        sender_id: DASH_AI_USER_ID,
        content: 'I\'m having trouble connecting right now. Please try again in a moment. 🔄',
        created_at: new Date().toISOString(),
        sender: {
          first_name: 'Dash',
          last_name: 'AI',
          role: 'ai_assistant',
        },
      };
      const errorMessages = [...updatedMessages, errorMsg];
      setDashAIMessages(errorMessages);
      saveDashAIMessages(errorMessages);
    } finally {
      setDashAILoading(false);
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [dashAIMessages, userId, profile, saveDashAIMessages]);

  // Load Dash AI messages when thread is selected
  useEffect(() => {
    if (selectedThreadId === DASH_AI_THREAD_ID) {
      loadDashAIMessages();
    }
  }, [selectedThreadId, loadDashAIMessages]);

  // Early return for loading state - MUST be after all hooks
  if (authLoading || profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSendMessages) return;
    if (!messageText.trim() || !selectedThreadId || !userId) return;

    // Handle Dash AI messages separately
    if (selectedThreadId === DASH_AI_THREAD_ID) {
      const content = messageText.trim();
      setMessageText('');
      await sendDashAIMessage(content);
      return;
    }

    setSending(true);
    try {
      const insertData: Record<string, unknown> = {
        thread_id: selectedThreadId,
        sender_id: userId,
        content: messageText.trim(),
        content_type: 'text',
      };
      
      // Include reply_to_id if replying to a message
      if (replyingTo?.id) {
        insertData.reply_to_id = replyingTo.id;
      }
      
      const { error } = await supabase
        .from('messages')
        .insert(insertData);

      if (error) throw error;

      await supabase
        .from('message_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selectedThreadId);

      setMessageText('');
      setReplyingTo(null); // Clear reply context after sending
      setRefreshTrigger(prev => prev + 1);
      setTimeout(() => scrollToBottom(), 100);
    } catch (err: any) {
      console.error('Error sending message:', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const filteredThreads = (() => {
    const query = searchQuery.toLowerCase();
    
    // Create the Dash AI virtual thread
    const dashAIThread = createDashAIThread(dashAILastMessage, dashAILastMessageAt);
    
    // Filter regular threads
    const filtered = threads.filter((thread) => {
      if (!query) return true;
      const participants = thread.message_participants || thread.participants || [];
      const participantNames = participants
        .map((participant) => {
          const profile = ('profiles' in participant ? participant.profiles : participant.user_profile) as ParticipantProfile | undefined;
          if (!profile) return '';
          return `${profile.first_name || ''} ${profile.last_name || ''}`.trim().toLowerCase();
        })
        .filter(Boolean)
        .join(' ');
      const groupName = isGroupThread(thread)
        ? getGroupDisplayName(thread).toLowerCase()
        : '';
      const studentName = thread.student
        ? `${thread.student.first_name} ${thread.student.last_name}`.toLowerCase()
        : '';
      const lastMessage = thread.last_message?.content.toLowerCase() || '';
      const subject = thread.subject?.toLowerCase() || '';

      return (
        participantNames.includes(query) ||
        groupName.includes(query) ||
        studentName.includes(query) ||
        lastMessage.includes(query) ||
        subject.includes(query)
      );
    });
    
    // Check if Dash AI matches search
    const dashAIMatches = !query || 
      'dash ai'.includes(query) || 
      'ai assistant'.includes(query) ||
      'principal assistant'.includes(query) ||
      'leadership assistant'.includes(query) ||
      dashAIThread.last_message?.content?.toLowerCase().includes(query);
    
    // Always put Dash AI at the top if it matches the search
    return dashAIMatches ? [dashAIThread, ...filtered] : filtered;
  })();

  const totalUnread = threads.reduce((sum, thread) => sum + (thread.unread_count || 0), 0);
  const isDashAISelected = selectedThreadId === DASH_AI_THREAD_ID;
  const selectedThread = isDashAISelected 
    ? createDashAIThread(dashAILastMessage, dashAILastMessageAt)
    : threads.find((thread) => thread.id === selectedThreadId);
  const isGroupSelected = !!selectedThread && isGroupThread(selectedThread);
  const selectedParticipants = selectedThread?.message_participants || selectedThread?.participants || [];

  const findOrSelectDmThread = (targetUserId: string) => {
    const participants = (t: MessageThread) => t.message_participants || t.participants || [];
    const dmThread = threads.find((t) => {
      if (isGroupThread(t)) return false;
      const p = participants(t);
      if (p.length !== 2) return false;
      const ids = new Set(p.map((x: { user_id: string }) => x.user_id));
      return ids.has(userId ?? '') && ids.has(targetUserId);
    });
    if (dmThread) {
      setSelectedThreadId(dmThread.id);
      return true;
    }
    return false;
  };
  const currentParticipant = selectedParticipants?.find((p: any) => p.user_id === userId);
  const groupDisplayName = selectedThread && isGroupSelected ? getGroupDisplayName(selectedThread) : 'Group Chat';
  // Find the other participant (the contact) for the chat header
  const contactParticipant = isGroupSelected
    ? undefined
    : selectedParticipants?.find((p: any) => p.user_id !== userId)
      || selectedParticipants?.find((p: any) => p.role === 'parent')
      || selectedParticipants?.[0];
  const contactName = isDashAISelected
    ? 'Dash AI'
    : isGroupSelected
      ? groupDisplayName
      : contactParticipant?.user_profile
        ? `${contactParticipant.user_profile.first_name} ${contactParticipant.user_profile.last_name}`.trim()
        : 'Contact';
  const currentIsAdmin = currentParticipant && 'is_admin' in currentParticipant
    ? Boolean(currentParticipant.is_admin)
    : false;
  const currentCanSend = currentParticipant && 'can_send_messages' in currentParticipant
    ? currentParticipant.can_send_messages
    : undefined;
  const canSendMessages = (() => {
    if (isDashAISelected) return true;
    if (!selectedThread) return false;
    if (isGroupSelected) {
      if (currentIsAdmin) return true;
      if (selectedThread.allow_replies === false) return false;
      if (currentCanSend === false) return false;
      return true;
    }
    return true;
  })();
  const isReadOnlyThread = !!selectedThread && isGroupSelected && !canSendMessages;
  const groupTypeLabel = selectedThread && isGroupSelected
    ? formatGroupTypeLabel(selectedThread.group_type || selectedThread.type)
    : '';
  const groupMemberCount = isGroupSelected ? selectedParticipants.length : 0;
  const groupStatusLabel = isReadOnlyThread
    ? 'Read-only'
    : selectedThread?.allow_replies === false
      ? 'Replies off'
      : null;
  const groupSubtitle = isGroupSelected
    ? [
        groupTypeLabel,
        groupMemberCount ? `${groupMemberCount} member${groupMemberCount === 1 ? '' : 's'}` : null,
        groupStatusLabel,
      ].filter(Boolean).join(' • ')
    : '';
  const composerPlaceholder = isReadOnlyThread
    ? 'Announcements are read-only'
    : !canSendMessages
      ? 'You do not have permission to send messages here'
      : 'Type a message';
  const composerDisabled = !canSendMessages || sending || attachmentUploading;
  
  // Display messages - use Dash AI messages when that thread is selected
  const displayMessages = isDashAISelected ? dashAIMessages : messages;

  // Message options menu handlers
  const handleDeleteThread = async () => {
    if (!selectedThreadId || !confirm('Are you sure you want to delete this conversation? This cannot be undone.')) return;
    try {
      // First delete all messages in the thread
      const { error: messagesError } = await supabase
        .from('messages')
        .delete()
        .eq('thread_id', selectedThreadId);

      if (messagesError) {
        console.error('Error deleting messages:', messagesError);
        // Continue anyway - messages deletion failure shouldn't block thread deletion
      }

      // Delete message_participants (non-fatal)
      await supabase
        .from('message_participants')
        .delete()
        .eq('thread_id', selectedThreadId);

      // Then delete the thread itself
      const { error: threadError } = await supabase
        .from('message_threads')
        .delete()
        .eq('id', selectedThreadId);

      if (threadError) {
        console.error('Error deleting thread:', threadError);
        alert('Failed to delete conversation. You may only delete conversations you created.');
        return;
      }

      setSelectedThreadId(null);
      setRefreshTrigger(prev => prev + 1);
      alert('Conversation deleted successfully.');
    } catch (err) {
      console.error('Error deleting thread:', err);
      alert('Failed to delete conversation.');
    }
  };

  const handleClearConversation = async () => {
    if (!selectedThreadId || !confirm('Are you sure you want to clear all messages in this conversation?')) return;
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('thread_id', selectedThreadId);

      if (error) {
        console.error('Error clearing conversation:', error);
        alert('Failed to clear conversation. You may only clear messages you sent or in threads you created.');
        return;
      }

      // Clear local messages immediately
      setMessages([]);
      setRefreshTrigger(prev => prev + 1);
      alert('Conversation cleared successfully.');
    } catch (err) {
      console.error('Error clearing conversation:', err);
      alert('Failed to clear conversation.');
    }
  };

  const handleBlockUser = () => {
    alert('Block/Unblock functionality coming soon!');
  };

  const handleExportChat = () => {
    alert('Export chat functionality coming soon!');
  };

  const handleReportIssue = () => {
    alert('Report issue functionality coming soon!');
  };

  // Message action handlers
  const handleMessageContextMenu = (e: React.MouseEvent | React.TouchEvent, messageId: string) => {
    const x = 'clientX' in e ? e.clientX : e.touches?.[0]?.clientX || 0;
    const y = 'clientY' in e ? e.clientY : e.touches?.[0]?.clientY || 0;
    setMessageActionsPosition({ x, y });
    setSelectedMessageId(messageId);
    setMessageActionsOpen(true);
  };

  const handleReplyMessage = () => {
    const msg = messages.find(m => m.id === selectedMessageId);
    if (msg) {
      setReplyingTo(msg);
      setMessageActionsOpen(false);
      // Focus the input
      setTimeout(() => {
        const input = document.querySelector('.wa-composer-input') as HTMLTextAreaElement;
        if (input) input.focus();
      }, 100);
    }
  };

  const handleForwardMessage = () => {
    const msg = messages.find(m => m.id === selectedMessageId);
    if (msg) {
      setForwardingMessage(msg);
      setForwardModalOpen(true);
    }
    setMessageActionsOpen(false);
  };

  const handleEditMessage = () => {
    const msg = messages.find(m => m.id === selectedMessageId);
    if (msg) {
      const newContent = prompt('Edit message:', msg.content);
      if (newContent && newContent.trim()) {
        supabase
          .from('messages')
          .update({ content: newContent.trim() })
          .eq('id', selectedMessageId)
          .then(() => {
            setRefreshTrigger(prev => prev + 1);
            alert('Message updated!');
          })
          .catch((err: any) => {
            console.error('Error editing message:', err);
            alert('Failed to edit message.');
          });
      }
    }
  };

  const handleDeleteMessage = async () => {
    if (!selectedMessageId) return;
    const msg = messages.find(m => m.id === selectedMessageId);
    if (!msg) return;
    
    const isOwnMessage = msg.sender_id === userId;
    
    if (!confirm(isOwnMessage ? 'Delete this message?' : 'Delete this message for you?')) return;
    
    try {
      if (isOwnMessage) {
        // Soft delete by setting deleted_at
        await supabase
          .from('messages')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', selectedMessageId)
          .eq('sender_id', userId);
      } else {
        // For messages from others, just hide locally
        setMessages(prev => prev.filter(m => m.id !== selectedMessageId));
      }
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Error deleting message:', err);
      alert('Failed to delete message.');
    }
    setMessageActionsOpen(false);
  };

  const handleCopyMessage = () => {
    const msg = messages.find(m => m.id === selectedMessageId);
    if (msg) {
      navigator.clipboard.writeText(msg.content).then(() => {
        alert('Message copied to clipboard!');
      }).catch(() => {
        alert('Failed to copy message.');
      });
    }
  };

  const handleReactToMessage = async (emoji?: string) => {
    if (!selectedMessageId || !emoji || !userId) return;
    
    try {
      // Toggle reaction
      const { data: existing } = await supabase
        .from('message_reactions')
        .select('id')
        .eq('message_id', selectedMessageId)
        .eq('user_id', userId)
        .eq('emoji', emoji)
        .maybeSingle();

      if (existing) {
        await supabase.from('message_reactions').delete().eq('id', existing.id);
      } else {
        await supabase.from('message_reactions').insert({
          message_id: selectedMessageId,
          user_id: userId,
          emoji: emoji,
        });
      }
      
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Error reacting to message:', err);
    }
    setMessageActionsOpen(false);
  };

  // Scroll to a specific message (used when clicking on reply context)
  const scrollToMessage = (messageId: string) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Briefly highlight the message
      messageElement.style.transition = 'background 0.3s ease';
      messageElement.style.background = 'rgba(59, 130, 246, 0.2)';
      setTimeout(() => {
        messageElement.style.background = 'transparent';
      }, 1500);
    }
  };

  const handleCallEventPress = (event: CallEventContent) => {
    if (!event.callerId) return;
    const callOptions = selectedThreadId ? { threadId: selectedThreadId } : undefined;
    if (event.callType === 'video') {
      startVideoCall(event.callerId, event.callerName || 'Contact', callOptions);
      return;
    }
    startVoiceCall(event.callerId, event.callerName || 'Contact', callOptions);
  };

  return (
    <>
      {/* Hide global header on small screens for a focused messaging UI */}
      <style jsx global>{`
        @media (max-width: 1023px) {
          header.topbar { display: none !important; }
          .frame {
            padding: 0 !important;
            gap: 0 !important;
          }
          .content {
            padding: 0 !important;
            padding-bottom: 0 !important;
            max-height: 100vh !important;
            max-height: 100dvh !important;
            height: 100vh !important;
            height: 100dvh !important;
          }
          .app {
            height: 100vh !important;
            height: 100dvh !important;
            overflow: hidden !important;
          }
        }
      `}</style>
      <PrincipalShell
        tenantSlug={tenantSlug}
        userEmail={profile?.email}
        userName={profile?.firstName}
        preschoolName={profile?.preschoolName}
        preschoolId={schoolId}
        unreadCount={totalUnread}
        contentStyle={{ padding: 0, margin: 0, overflow: 'hidden', height: '100vh', maxHeight: '100vh', position: 'relative' }}
      >
        <div className="flex h-screen w-full overflow-hidden bg-[var(--bg)]">
          {/* Collapsible Sidebar */}
          <div
            style={{
              order: isDesktop ? 2 : 0,
              width: isDesktop ? '340px' : '100%',
              height: '100%',
              display: (!isDesktop && selectedThread) ? 'none' : 'flex',
              flexDirection: 'column',
              background: isDesktop ? '#0f172a' : '#0f172a',
              borderLeft: isDesktop ? '1px solid var(--border)' : 'none',
              boxShadow: isDesktop ? '-2px 0 12px rgba(0, 0, 0, 0.1)' : 'none',
              position: isDesktop ? 'relative' : 'fixed',
              top: isDesktop ? 0 : 0,
              right: isDesktop ? 0 : 'auto',
              left: isDesktop ? 'auto' : 0,
              bottom: isDesktop ? 0 : 0,
              zIndex: isDesktop ? 1 : 1000,
              flexShrink: 0,
            }}
          >
          {/* Sidebar Header */}
          <div style={{
            padding: !isDesktop ? '16px 12px' : '16px',
            borderBottom: !isDesktop ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            gap: 12,
            position: !isDesktop ? 'fixed' : 'relative',
            top: !isDesktop ? 0 : 'auto',
            left: !isDesktop ? 0 : 'auto',
            right: !isDesktop ? 0 : 'auto',
            background: !isDesktop ? '#111827' : 'var(--surface-2)',
            backdropFilter: !isDesktop ? 'blur(12px)' : 'none',
            boxShadow: !isDesktop ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0_2px_8px_rgba(0,0,0,0.05)',
            zIndex: !isDesktop ? 1000 : 'auto',
            flexDirection: 'column',
            alignItems: 'stretch'
          }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              {!isDesktop && (
                <button
                  onClick={() => router.push('/dashboard/principal')}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    background: 'transparent',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    padding: 0,
                  }}
                >
                  <ArrowLeft size={22} />
                </button>
              )}
              <h2 style={{ 
                fontSize: 20, 
                fontWeight: 700, 
                color: 'var(--text-primary)', 
                margin: 0,
                flex: 1,
                textAlign: !isDesktop ? 'left' : 'left',
                marginLeft: !isDesktop ? 0 : 0
              }}>
                Messages
              </h2>
              {totalUnread > 0 && (
                <span className="bg-[var(--primary)] text-white text-[12px] font-bold px-2.5 py-1 rounded-[12px] shadow-[0_2px_8px_rgba(124,58,237,0.3)]">
                  {totalUnread}
                </span>
              )}
              <button
                onClick={() => setShowCreateGroupModal(true)}
                title="Create Group"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  border: 'none',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)',
                }}
              >
                <Users size={18} />
              </button>
              <button
                onClick={() => setShowNewChatModal(true)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  border: 'none',
                  background: 'var(--primary)',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)',
                }}
              >
                <Plus size={20} />
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder={!isDesktop ? "Search..." : "Search conversations..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 40px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-primary)',
                  fontSize: 15,
                  outline: 'none'
                }}
              />
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                }}
              />
            </div>
          </div>

          {/* Threads List */}
          <div className="hide-scrollbar" style={{ 
            flex: 1, 
            overflowY: 'auto', 
            padding: '12px',
            paddingTop: !isDesktop ? '136px' : '12px'
          }}>
            {/* Dash AI Assistant - Always at top like Meta AI in WhatsApp */}
            <div
              onClick={() => setSelectedThreadId(DASH_AI_THREAD_ID)}
              className="flex items-center gap-3 p-3.5 cursor-pointer rounded-xl mb-2 transition-all hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(90deg, rgba(124, 58, 237, 0.12) 0%, rgba(6, 182, 212, 0.08) 50%, rgba(236, 72, 153, 0.08) 100%)',
                border: '1px solid rgba(124, 58, 237, 0.25)',
              }}
            >
              <DashAIAvatar size={48} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[16px] font-semibold text-[var(--text)]">Dash AI</span>
                  <Sparkles size={14} className="text-[#a78bfa]" />
                </div>
                <p className="text-[13px] text-[var(--muted)] mt-0.5 truncate">
                  AI leadership assistant for updates & planning
                </p>
              </div>
            </div>
            
            {threadsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <div className="spinner"></div>
              </div>
            ) : error ? (
              <div style={{ textAlign: 'center', padding: '32px' }}>
                <p style={{ color: 'var(--danger)', fontSize: '14px', marginBottom: '16px' }}>Failed to load</p>
                <button
                  onClick={fetchThreads}
                  style={{
                    background: 'var(--primary)',
                    border: 'none',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                  }}
                >
                  Try Again
                </button>
              </div>
            ) : filteredThreads.length > 0 ? (
              filteredThreads.map((thread) => (
                <PrincipalThreadItem
                  key={thread.id}
                  thread={thread}
                  isActive={thread.id === selectedThreadId}
                  onSelect={() => setSelectedThreadId(thread.id)}
                  currentUserId={userId}
                />
              ))
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '60px 20px',
                textAlign: 'center',
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'var(--surface-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                }}>
                  <MessageCircle size={32} color="var(--muted)" />
                </div>
                <p style={{ color: 'var(--text)', fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
                  No conversations yet
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                  Your messages will appear here
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div style={{
          order: 1,
          flex: 1,
          display: (!isDesktop && !selectedThread) ? 'none' : 'flex',
          flexDirection: 'column',
          background: wallpaperCss || 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
          position: 'relative',
          height: '100%',
          overflow: 'hidden',
        }}>
          {!selectedThread ? (
            /* Empty State */
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '40px',
            }}>
              <div style={{
                maxWidth: '400px',
                textAlign: 'center',
                padding: '48px 32px',
                borderRadius: '20px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
              }}>
                <div style={{
                  width: '96px',
                  height: '96px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--primary) 0%, var(--cyan) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                  boxShadow: '0 8px 24px rgba(124, 58, 237, 0.25)',
                }}>
                  <MessageCircle size={48} color="white" />
                </div>
                <h2 style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: 'var(--text)',
                  marginBottom: '12px',
                }}>
                  Select a conversation
                </h2>
                <p style={{
                  color: 'var(--muted)',
                  fontSize: '15px',
                  lineHeight: '1.6',
                }}>
                  Choose a conversation from the sidebar to start messaging with families or staff
                </p>
              </div>
            </div>
          ) : (
            /* Chat View */
            <>
              {/* Chat Header */}
              <div className={`${isDesktop ? 'py-7 px-7' : 'py-15 px-2'} ${isDesktop ? 'border-b border-[var(--border)]' : ''} bg-[var(--surface)] [backdrop-filter:blur(12px)] flex items-center gap-3 shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${isDesktop ? 'sticky' : 'fixed'} ${isDesktop ? 'top-0' : 'top-0'} z-10 w-full ${isDesktop ? '' : 'left-0 right-0'}`}>
                {!isDesktop && (
                  <button
                    onClick={() => setSelectedThreadId(null)}
                    className="w-9 h-9 rounded-[10px] bg-transparent border-none flex items-center justify-center cursor-pointer text-[var(--text)] -ml-1"
                  >
                    <ArrowLeft size={20} />
                  </button>
                )}
                {isDashAISelected ? (
                  <div className={`${isDesktop ? 'w-[52px] h-[52px]' : 'w-8 h-8'} flex-shrink-0`}>
                    <DashAIAvatar size={isDesktop ? 52 : 32} />
                  </div>
                ) : (
                  <div
                    className={`${isDesktop ? 'w-[52px] h-[52px] text-[18px]' : 'w-8 h-8 text-[12px]'} rounded-full bg-[linear-gradient(135deg,var(--primary)_0%,var(--cyan)_100%)] flex items-center justify-center text-white font-bold shadow-[0_4px_16px_rgba(124,58,237,0.3)] flex-shrink-0`}
                  >
                    {isGroupSelected ? (
                      <Users size={isDesktop ? 20 : 16} />
                    ) : (
                      contactName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className={`${isDesktop ? 'text-[18px]' : 'text-[16px]'} m-0 font-bold text-[var(--text)] truncate`}>
                    {contactName}
                  </h3>
                  {isDashAISelected ? (
                    <p className="mt-1 text-[13px] text-[#8b5cf6] font-medium flex items-center gap-1.5">
                      <Sparkles size={12} />
                      <span>AI Leadership Assistant</span>
                    </p>
                  ) : isGroupSelected ? (
                    <p className="mt-1 text-[13px] text-[var(--muted)] font-medium flex items-center gap-1.5">
                      <span>{groupSubtitle || 'Group conversation'}</span>
                    </p>
                  ) : isDesktop && selectedThread.student ? (
                    <p className="mt-1 text-[13px] text-[var(--cyan)] font-medium flex items-center gap-1.5">
                      <span>📚</span>
                      <span>{selectedThread.student.first_name} {selectedThread.student.last_name}</span>
                    </p>
                  ) : null}
                </div>
                {!isDashAISelected && (
                <div className="flex items-center gap-2">
                  {isDesktop ? (
                    <>
                      {!isGroupSelected && (
                        <>
                          <button
                            onClick={() => contactParticipant?.user_id && startVoiceCall(contactParticipant.user_id, contactName, selectedThreadId ? { threadId: selectedThreadId } : undefined)}
                            title="Start voice call"
                            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                            style={{
                              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                              boxShadow: '0 3px 10px rgba(34, 197, 94, 0.35)',
                            }}
                          >
                            <Phone size={18} color="white" />
                          </button>
                          <button
                            onClick={() => contactParticipant?.user_id && startVideoCall(contactParticipant.user_id, contactName, selectedThreadId ? { threadId: selectedThreadId } : undefined)}
                            title="Start video call"
                            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                            style={{
                              background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                              boxShadow: '0 3px 10px rgba(59, 130, 246, 0.35)',
                            }}
                          >
                            <Video size={18} color="white" />
                          </button>
                        </>
                      )}
                      <button
                        ref={moreButtonRef}
                        onClick={() => {
                          setOptionsMenuAnchor(moreButtonRef.current);
                          setOptionsMenuOpen(true);
                        }}
                        className="w-10 h-10 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--muted)] cursor-pointer hover:bg-[var(--surface)] transition-colors"
                      >
                        <MoreVertical size={20} />
                      </button>
                    </>
                  ) : (
                    <>
                      {!isGroupSelected && (
                        <>
                          <button
                            onClick={() => contactParticipant?.user_id && startVoiceCall(contactParticipant.user_id, contactName, selectedThreadId ? { threadId: selectedThreadId } : undefined)}
                            title="Voice call"
                            className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-95"
                            style={{
                              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                              boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)',
                            }}
                          >
                            <Phone size={16} color="white" />
                          </button>
                          <button
                            onClick={() => contactParticipant?.user_id && startVideoCall(contactParticipant.user_id, contactName, selectedThreadId ? { threadId: selectedThreadId } : undefined)}
                            title="Video call"
                            className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-95"
                            style={{
                              background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                            }}
                          >
                            <Video size={16} color="white" />
                          </button>
                        </>
                      )}
                      <button
                        ref={moreButtonRef}
                        type="button"
                        onClick={() => {
                          setOptionsMenuAnchor(moreButtonRef.current);
                          setOptionsMenuOpen(true);
                        }}
                        className="w-10 h-10 rounded-[10px] bg-transparent border-none flex items-center justify-center text-[var(--muted)] cursor-pointer"
                        title="More"
                      >
                        <MoreVertical size={20} />
                      </button>
                    </>
                  )}
                </div>
                )}
              </div>

              {/* Mobile: Fixed student name subtitle */}
              {!isDesktop && selectedThread.student && (
                <div 
                  className="fixed top-[40px]  left-0 right-0 z-[999] px-4 py-8 flex items-center justify-center gap-1.5"
                  style={{ background: 'var(--surface)' }}
                >
                  <span className="text-[13px] text-[var(--cyan)] font-medium">📚</span>
                  <span className="text-[13px] text-[#cbd5e1] font-medium padding-[8px]">
                    {selectedThread.student.first_name} {selectedThread.student.last_name}
                  </span>
                </div>
              )}

              {/* Messages Area */}
              <div
                className="hide-scrollbar"
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: isDesktop ? '24px 28px' : '0px',
                  paddingTop: !isDesktop ? (selectedThread.student ? '100px' : '80px') : undefined,
                  display: 'flex',
                  flexDirection: 'column',
                  paddingBottom: isDesktop ? undefined : selectedThread.student ? '70px' : '60px',
                }}
              >
                <div className={`w-full ${isDesktop ? 'max-w-[860px] mx-auto px-3' : 'px-1'}`}>
                {isReadOnlyThread && (
                  <div
                    style={{
                      padding: '12px 16px',
                      marginBottom: 16,
                      borderRadius: 14,
                      background: 'rgba(234, 179, 8, 0.12)',
                      border: '1px solid rgba(234, 179, 8, 0.35)',
                      color: '#fbbf24',
                      fontSize: 13,
                      fontWeight: 600,
                      textAlign: 'center',
                    }}
                  >
                    Announcements are read-only. Only admins can post updates.
                  </div>
                )}
                {(messagesLoading || (isDashAISelected && dashAILoading && dashAIMessages.length === 0)) ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                    <div className="spinner"></div>
                  </div>
                ) : displayMessages.length === 0 ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                  }}>
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 32px',
                      borderRadius: '16px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                      maxWidth: '320px',
                    }}>
                      <div style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '50%',
                        background: isDashAISelected 
                          ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)'
                          : 'linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(0, 245, 255, 0.15) 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 20px',
                      }}>
                        {isDashAISelected ? <Sparkles size={32} color="#8b5cf6" /> : <Send size={32} color="var(--primary)" />}
                      </div>
                      <p style={{ color: 'var(--text)', fontSize: '17px', fontWeight: '600', marginBottom: '8px' }}>
                        {isDashAISelected ? 'Ask Dash anything!' : 'Start a conversation'}
                      </p>
                      <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.5' }}>
                        {isDashAISelected 
                          ? 'I can help with leadership updates, staff coordination, announcements, and planning. ✨'
                          : 'Send your first message to connect with this contact'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {displayMessages.map((message, index) => {
                      const isOwn = message.sender_id === userId;
                      const senderName = message.sender
                        ? `${message.sender.first_name || ''} ${message.sender.last_name || ''}`.trim()
                        : '';
                      const otherParticipantIds = selectedParticipants
                        .filter((p: any) => p.user_id !== userId)
                        .map((p: any) => p.user_id);

                      // Check if we need to show a date separator
                      const currentDateKey = getDateKey(message.created_at);
                      const prevMessage = index > 0 ? displayMessages[index - 1] : null;
                      const prevDateKey = prevMessage ? getDateKey(prevMessage.created_at) : null;
                      const showDateSeparator = currentDateKey !== prevDateKey;

                      return (
                        <div key={message.id}>
                          {showDateSeparator && (
                            <DateSeparator label={getDateSeparatorLabel(message.created_at)} />
                          )}
                          <div id={`message-${message.id}`}>
                            <ChatMessageBubble
                              message={message}
                              isOwn={isOwn}
                              isDesktop={isDesktop}
                              formattedTime={formatMessageTime(message.created_at)}
                              senderName={!isOwn && senderName ? senderName : undefined}
                              showSenderName={isGroupSelected}
                              otherParticipantIds={otherParticipantIds}
                              hideAvatars={!isDesktop && !isGroupSelected}
                              isGroupChat={isGroupSelected}
                              onAvatarClick={isGroupSelected ? (senderId, name) => setGroupAvatarModalUser({ userId: senderId, userName: name }) : undefined}
                              onContextMenu={isDashAISelected ? undefined : handleMessageContextMenu}
                              onReplyClick={scrollToMessage}
                              onCallEventPress={handleCallEventPress}
                            />
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Typing indicator - shows at bottom as a chat bubble */}
                    {typingText && !isDashAISelected && (
                      <TypingIndicatorBubble 
                        senderName={contactName}
                        isDesktop={isDesktop}
                      />
                    )}
                    
                    {/* Dash AI typing indicator */}
                    {isDashAISelected && dashAILoading && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        marginTop: '8px',
                        paddingLeft: isDesktop ? 8 : 10,
                      }}>
                        <div style={{ width: isDesktop ? 36 : 32, height: isDesktop ? 36 : 32, flexShrink: 0 }}>
                          <DashAIAvatar size={isDesktop ? 36 : 32} />
                        </div>
                        <div style={{
                          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(236, 72, 153, 0.1) 100%)',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                          borderRadius: '16px 16px 16px 4px',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6', animation: 'typing-bounce 1.2s ease-in-out infinite', animationDelay: '0s' }} />
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6', animation: 'typing-bounce 1.2s ease-in-out infinite', animationDelay: '0.15s' }} />
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6', animation: 'typing-bounce 1.2s ease-in-out infinite', animationDelay: '0.3s' }} />
                        </div>
                      </div>
                    )}
                    {/* Spacer for bottom padding on mobile */}
                    <div ref={messagesEndRef} style={{ height: isDesktop ? 16 : 100, flexShrink: 0 }} />
                  </div>
                )}
                </div>
              </div>

              {/* Message Composer */}
              <div className={`${isDesktop ? 'py-3 px-7 border-t border-[var(--border)]' : 'fixed bottom-0 left-0 right-0 px-3 pt-2.5'} z-[100]`} style={{ 
                background: isDesktop ? 'var(--surface)' : 'linear-gradient(180deg, rgba(15, 23, 42, 0.0) 0%, rgba(15, 23, 42, 0.95) 15%, rgba(15, 23, 42, 1) 100%)',
                backdropFilter: 'blur(12px)',
                paddingBottom: isDesktop ? undefined : 'max(10px, env(safe-area-inset-bottom))',
                boxShadow: isDesktop ? '0 -4px 20px rgba(0,0,0,0.08)' : 'none',
              }}>
                <div className={`w-full ${isDesktop ? 'max-w-[860px] mx-auto' : ''}`}>
                <input
                  type="file"
                  accept="image/*,audio/*,video/*"
                  ref={fileInputRef}
                  className="hidden"
                  disabled={composerDisabled}
                  onChange={handleAttachmentChange}
                />
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={cameraInputRef}
                  className="hidden"
                  disabled={composerDisabled}
                  onChange={handleAttachmentChange}
                />
                
                {/* Reply Preview Bar */}
                {replyingTo && (
                  <div className="flex items-center gap-3 mb-2 p-3 bg-[var(--surface-2)] rounded-xl border-l-4 border-blue-500">
                    <Reply size={18} className="text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-blue-400 font-medium mb-0.5">
                        Replying to {replyingTo.sender?.first_name || 'message'}
                      </div>
                      <div className="text-sm text-[var(--muted)] truncate">
                        {replyingTo.content?.startsWith('__media__') 
                          ? '📎 Media'
                          : (replyingTo.content?.substring(0, 50) + (replyingTo.content && replyingTo.content.length > 50 ? '...' : ''))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      className="p-1.5 hover:bg-[var(--surface)] rounded-full transition"
                    >
                      <X size={16} className="text-[var(--muted)]" />
                    </button>
                  </div>
                )}
                
                <form onSubmit={handleSendMessage} className="relative" style={{ marginLeft: isDesktop ? 0 : '-8px' }}>
                  {showEmojiPicker && (
                    <div
                      ref={emojiPickerRef}
                      className="absolute bottom-[70px] left-3 bg-[var(--surface)] border border-[var(--border)] rounded-[16px] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.2)] grid grid-cols-5 gap-2 z-20"
                    >
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleEmojiSelect(emoji)}
                          className="text-[22px] p-1.5 rounded hover:bg-[var(--surface-2)] transition"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className={`flex gap-2.5 ${isDesktop ? 'items-end' : 'items-center'}`}>
                    {isDesktop && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          ref={emojiButtonRef}
                          onClick={() => {
                            if (!canSendMessages) return;
                            setShowEmojiPicker(!showEmojiPicker);
                          }}
                          disabled={composerDisabled}
                          className={`w-11 h-11 rounded-[12px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--muted)] transition ${composerDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <Smile size={22} />
                        </button>
                        <button
                          type="button"
                          onClick={triggerFilePicker}
                          disabled={composerDisabled}
                          className={`w-11 h-11 rounded-[12px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--muted)] transition ${composerDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <Paperclip size={20} />
                        </button>
                      </div>
                    )}

                    {!isDesktop && (
                      <div className="wa-composer">
                        {/* Emoji button */}
                        <button
                          type="button"
                          ref={emojiButtonRef}
                          onClick={() => {
                            if (!canSendMessages) return;
                            setShowEmojiPicker(!showEmojiPicker);
                          }}
                          disabled={composerDisabled}
                          className={`wa-composer-btn bg-[var(--surface-2)] border border-[var(--border)] text-[var(--muted)] ${composerDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          aria-label="Emoji"
                        >
                          <Smile className="wa-icon-sm" />
                        </button>
                        
                        {/* Input container */}
                        <div className="wa-composer-input-wrap">
                          <textarea
                            value={messageText}
                            onChange={(e) => { 
                              setMessageText(e.target.value); 
                              if (canSendMessages) {
                                startTyping();
                              }
                              const ta = e.target as HTMLTextAreaElement;
                              ta.style.height = 'auto';
                              ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
                            }}
                            onBlur={() => { try { stopTyping(); } catch {} }}
                            placeholder={composerPlaceholder}
                            disabled={composerDisabled}
                            rows={1}
                            className="flex-1 min-w-0 min-h-[var(--composer-btn)] py-2 px-2 bg-transparent text-[var(--text)] wa-text outline-none resize-none max-h-[120px] leading-relaxed placeholder:text-[var(--muted)] focus:outline-none focus:ring-0 focus:border-0"
                            style={{ border: 'none', outline: 'none' }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage(e);
                                (e.currentTarget as HTMLTextAreaElement).style.height = 'auto';
                              }
                            }}
                          />
                          {/* Camera (auto-hides when typing) */}
                          {!messageText.trim() && (
                            <button
                              type="button"
                              onClick={() => cameraInputRef.current?.click()}
                              disabled={composerDisabled}
                              className={`text-[var(--muted)] shrink-0 p-1 ${composerDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                              aria-label="Camera"
                            >
                              <svg className="wa-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                <circle cx="12" cy="13" r="4"/>
                              </svg>
                            </button>
                          )}
                          {/* Clip */}
                          <button
                            type="button"
                            onClick={triggerFilePicker}
                            disabled={composerDisabled}
                            className={`text-[var(--muted)] shrink-0 p-1 ${composerDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                            aria-label="Attach file"
                          >
                            <Paperclip className="wa-icon" />
                          </button>
                        </div>
                        
                        {/* Send/Mic button */}
                        {canSendMessages ? (
                          messageText.trim() ? (
                            <button
                              type="submit"
                              disabled={composerDisabled}
                              className={`wa-composer-btn ${composerDisabled ? 'bg-[var(--muted)] cursor-not-allowed' : 'bg-[var(--primary)] shadow-[0_4px_12px_rgba(124,58,237,0.4)]'}`}
                            >
                              {sending || attachmentUploading ? (
                                <Loader2 className="wa-icon-sm animate-spin" color="white" />
                              ) : (
                                <Send className="wa-icon-sm" color="white" />
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleMicClick}
                              disabled={composerDisabled}
                              className={`wa-composer-btn ${composerDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                              style={{
                                background: isRecording 
                                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
                                  : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                                boxShadow: isRecording
                                  ? '0 4px 16px rgba(245, 158, 11, 0.5), 0 0 20px rgba(245, 158, 11, 0.3)'
                                  : '0 4px 16px rgba(0, 212, 255, 0.4), 0 0 20px rgba(0, 212, 255, 0.25)',
                                border: '1px solid rgba(0, 212, 255, 0.3)',
                              }}
                            >
                              <Mic className="wa-icon-sm" color={isRecording ? 'white' : '#00d4ff'} />
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            disabled={true}
                            className="wa-composer-btn opacity-50 cursor-not-allowed"
                            style={{
                              background: 'rgba(148, 163, 184, 0.3)',
                              border: '1px solid rgba(148, 163, 184, 0.3)',
                            }}
                          >
                            <Send className="wa-icon-sm" color="white" />
                          </button>
                        )}
                      </div>
                    )}

                    {isDesktop && (
                      canSendMessages ? (
                        messageText.trim() ? (
                          <button
                            type="submit"
                            disabled={composerDisabled}
                            className={`w-[50px] h-[50px] rounded-[14px] border-0 flex items-center justify-center flex-shrink-0 ${composerDisabled ? 'bg-[var(--muted)] cursor-not-allowed' : 'bg-[var(--primary)] shadow-[0_4px_16px_rgba(124,58,237,0.4)]'}`}
                          >
                            {sending || attachmentUploading ? (
                              <Loader2 size={20} className="animate-spin" color="white" />
                            ) : (
                              <Send size={20} color="white" />
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleMicClick}
                            disabled={composerDisabled}
                            className={`w-[50px] h-[50px] rounded-[14px] border-0 flex items-center justify-center flex-shrink-0 ${composerDisabled ? 'bg-[var(--muted)] cursor-not-allowed' : (isRecording ? 'bg-[var(--warning)] shadow-[0_4px_16px_rgba(245,158,11,0.4)]' : 'bg-[var(--cyan)] shadow-[0_4px_16px_rgba(0,245,255,0.4)]')}`}
                          >
                            <Mic size={22} color="white" />
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          disabled={true}
                          className="w-[50px] h-[50px] rounded-[14px] border-0 flex items-center justify-center flex-shrink-0 bg-[var(--muted)] cursor-not-allowed"
                        >
                          <Send size={20} color="white" />
                        </button>
                      )
                    )}
                  </div>
                </form>
                {statusMessage && (
                  <p className="mt-2.5 text-[13px] text-[var(--danger)] text-center">
                    {statusMessage}
                  </p>
                )}
                {attachmentUploading && uploadProgress !== null && (
                  <div className="mt-2.5">
                    <div className="flex items-center justify-center gap-2 text-[13px] text-[var(--muted)] mb-1.5">
                      <Loader2 size={14} className="animate-spin" />
                      <span>Uploading... {Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--primary)] transition-all duration-300 rounded-full"
                        style={{ width: `${clampPercent(uploadProgress)}%` }}
                      />
                    </div>
                  </div>
                )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
        {/* Call interface is now handled by CallProvider wrapping the app */}
        <ChatWallpaperPicker
          isOpen={wallpaperOpen}
          onClose={() => setWallpaperOpen(false)}
          userId={userId || ''}
          onSelect={applyWallpaper}
        />
        <MessageOptionsMenu
          isOpen={optionsMenuOpen}
          onClose={() => setOptionsMenuOpen(false)}
          onDeleteThread={handleDeleteThread}
          onClearConversation={handleClearConversation}
          onBlockUser={handleBlockUser}
          onExportChat={handleExportChat}
          onReportIssue={handleReportIssue}
          anchorEl={optionsMenuAnchor}
        />
        <MessageActionsMenu
          isOpen={messageActionsOpen}
          onClose={() => setMessageActionsOpen(false)}
          position={messageActionsPosition}
          isOwnMessage={messages.find(m => m.id === selectedMessageId)?.sender_id === userId}
          onReply={handleReplyMessage}
          onForward={handleForwardMessage}
          onEdit={handleEditMessage}
          onDelete={handleDeleteMessage}
          onCopy={handleCopyMessage}
          onReact={(emoji) => handleReactToMessage(emoji)}
          isMobile={!isDesktop}
          messageContent={messages.find(m => m.id === selectedMessageId)?.content}
        />
        
        {/* Forward Message Modal */}
        {forwardModalOpen && forwardingMessage && (
          <div
            onClick={() => setForwardModalOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.6)',
              zIndex: 3000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                borderRadius: 16,
                padding: 20,
                width: '100%',
                maxWidth: 400,
                maxHeight: '80vh',
                overflow: 'auto',
                border: '1px solid rgba(148, 163, 184, 0.15)',
              }}
            >
              <h3 style={{ margin: '0 0 16px', color: '#e2e8f0', fontSize: 18, fontWeight: 600 }}>
                Forward Message
              </h3>
              <div style={{
                padding: 12,
                background: 'rgba(100, 116, 139, 0.1)',
                borderRadius: 12,
                marginBottom: 16,
                borderLeft: '3px solid #3b82f6',
              }}>
                <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>
                  {forwardingMessage.content.startsWith('__media__') ? '📎 Media attachment' : forwardingMessage.content}
                </p>
              </div>
              <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: 14 }}>
                Select a conversation to forward to:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {threads.filter(t => t.id !== selectedThreadId).slice(0, 5).map((thread) => {
                  const otherParticipant = thread.message_participants?.find(p => p.user_id !== userId);
                  const name = otherParticipant?.user_profile 
                    ? `${otherParticipant.user_profile.first_name} ${otherParticipant.user_profile.last_name}`.trim()
                    : 'Unknown';
                  return (
                    <button
                      key={thread.id}
                      onClick={async () => {
                        try {
                          const { error } = await supabase
                            .from('messages')
                            .insert({
                              thread_id: thread.id,
                              sender_id: userId,
                              content: forwardingMessage.content,
                              forwarded_from_id: forwardingMessage.id,
                            });
                          if (error) throw error;
                          setForwardModalOpen(false);
                          setForwardingMessage(null);
                          alert('Message forwarded!');
                        } catch (err) {
                          console.error('Error forwarding message:', err);
                          alert('Failed to forward message.');
                        }
                      }}
                      style={{
                        padding: '12px 16px',
                        background: 'rgba(100, 116, 139, 0.1)',
                        border: '1px solid rgba(148, 163, 184, 0.15)',
                        borderRadius: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: '#e2e8f0',
                        fontSize: 14,
                        fontWeight: 500,
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setForwardModalOpen(false)}
                style={{
                  width: '100%',
                  marginTop: 16,
                  padding: '12px 16px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 12,
                  cursor: 'pointer',
                  color: '#ef4444',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        {/* New Chat Modal */}
        <NewChatModal
          isOpen={showNewChatModal}
          onClose={() => setShowNewChatModal(false)}
          onSelectContact={(contact) => {
            setShowNewChatModal(false);
            startConversationWithContact(contact);
          }}
          onSelectDashAI={() => {
            setShowNewChatModal(false);
            setSelectedThreadId(DASH_AI_THREAD_ID);
          }}
          onInviteNew={() => {
            setShowNewChatModal(false);
            setShowInviteModal(true);
          }}
          currentUserId={userId || null}
          currentUserRole={profile?.role || 'principal'}
          preschoolId={schoolId}
          organizationId={profile?.organizationId}
        />

        {/* Invite Contact Modal */}
        <InviteContactModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          preschoolId={schoolId}
          inviterName={profile?.firstName || 'A principal'}
          preschoolName={profile?.preschoolName}
          inviterId={userId}
        />
        
        {/* Create Group Modal */}
        <CreateGroupModal
          isOpen={showCreateGroupModal}
          onClose={() => setShowCreateGroupModal(false)}
          onGroupCreated={(threadId) => {
            // Navigate to the new group thread
            setSelectedThreadId(threadId);
            fetchThreads();
          }}
          preschoolId={schoolId}
          userId={userId}
          userRole={profile?.role || undefined}
        />
        
        {/* Quick Call Modal */}
        <QuickCallModal
          isOpen={showQuickCallModal}
          onClose={() => setShowQuickCallModal(false)}
          onVoiceCall={(uid, userName) => startVoiceCall(uid, userName)}
          onVideoCall={(uid, userName) => startVideoCall(uid, userName)}
          currentUserId={userId}
          preschoolId={schoolId}
          organizationId={profile?.organizationId}
        />

        {/* Group chat: avatar click opens Message / Voice / Video options */}
        <GroupChatAvatarModal
          isOpen={!!groupAvatarModalUser}
          onClose={() => setGroupAvatarModalUser(null)}
          userName={groupAvatarModalUser?.userName ?? ''}
          userId={groupAvatarModalUser?.userId ?? ''}
          onMessage={(uid) => {
            if (findOrSelectDmThread(uid)) setGroupAvatarModalUser(null);
            else alert('No existing conversation with this contact. Start a new chat from the sidebar.');
          }}
          onVoiceCall={(uid, name) => startVoiceCall(uid, name)}
          onVideoCall={(uid, name) => startVideoCall(uid, name)}
        />
        
        {/* Quick Call FAB - Shows when no conversation is selected */}
        {!selectedThread && (
          <button
            onClick={() => setShowQuickCallModal(true)}
            style={{
              position: 'fixed',
              bottom: isDesktop ? 24 : 'calc(150px + env(safe-area-inset-bottom))',
              right: isDesktop ? 24 : 16,
              width: 52,
              height: 52,
              borderRadius: 26,
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(34, 197, 94, 0.4), 0 0 24px rgba(34, 197, 94, 0.2)',
              zIndex: 998,
              transition: 'transform 0.2s ease',
            }}
            className="active:scale-95 hover:scale-105"
            title="Quick Call"
          >
            <Phone size={22} color="white" />
          </button>
        )}
        
        {/* Voice Recording Overlay */}
        <VoiceRecordingOverlay
          isRecording={isRecording}
          recordingDuration={recordingDuration}
          onCancel={handleRecordingCancel}
          onSend={handleRecordingSend}
          onLock={handleRecordingLock}
          isLocked={recordingLocked}
        />
      </PrincipalShell>
    </>
  );
}

// Wrap with Suspense for useSearchParams
export default function PrincipalMessagesPageWrapper() {
  return (
    <Suspense fallback={
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        background: 'var(--bg)'
      }}>
        <div className="spinner" />
      </div>
    }>
      <PrincipalMessagesPage />
    </Suspense>
  );
}
