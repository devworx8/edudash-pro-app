'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';
import { ChatMessageBubble, type ChatMessage } from '@/components/messaging/ChatMessageBubble';
import { useComposerEnhancements, EMOJI_OPTIONS } from '@/lib/messaging/useComposerEnhancements';
import { useCall, QuickCallModal } from '@/components/calls';
import { useTypingIndicator } from '@/lib/hooks/useTypingIndicator';
import { MessageActionsMenu } from '@/components/messaging/MessageActionsMenu';
import { MessageOptionsMenu } from '@/components/messaging/MessageOptionsMenu';
import { ChatWallpaperPicker } from '@/components/messaging/ChatWallpaperPicker';
import { DashAIAvatar, DashAILoading } from '@/components/dash/DashAIAvatar';
import { InviteContactModal } from '@/components/messaging/InviteContactModal';
import { NewChatModal } from '@/components/messaging/NewChatModal';
import { GroupChatAvatarModal } from '@/components/messaging/GroupChatAvatarModal';
import { getMessageDisplayText, type CallEventContent } from '@/lib/messaging/messageContent';
import { resolveReactionProfiles } from '@/lib/messaging/reactionProfiles';
import { MessageSquare, Send, Search, User, School, Paperclip, Smile, Mic, Loader2, ArrowLeft, Phone, Video, MoreVertical, Trash2, Image, Plus, Sparkles } from 'lucide-react';
import { 
  type MessageThread, 
  type ParticipantProfile, 
  DASH_AI_THREAD_ID, 
  DASH_AI_USER_ID,
  CONTACT_PANEL_WIDTH,
  createDashAIThread
} from '@/lib/messaging/types';
import { 
  ThreadItem, 
  DateSeparator, 
  formatMessageTime, 
  getDateSeparatorLabel, 
  getDateKey 
} from '@/components/messaging/ThreadList';

function ParentMessagesContent() {
  useBodyScrollLock(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadFromUrl = searchParams.get('thread');
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState<string>();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const { slug } = useTenantSlug(userId);
  const { profile, loading: profileLoading } = useUserProfile(userId);
  const schoolId = profile?.preschoolId || profile?.organizationId;
  const CHAT_WALLPAPER_STORAGE_KEY_BASE = 'edudash-chat-wallpaper';
  const wallpaperStorageKey =
    userId && schoolId
      ? `${CHAT_WALLPAPER_STORAGE_KEY_BASE}:${userId}:${schoolId}`
      : CHAT_WALLPAPER_STORAGE_KEY_BASE;

  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(threadFromUrl);
  const selectedThreadIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [messageActionsOpen, setMessageActionsOpen] = useState(false);
  const [messageActionsPosition, setMessageActionsPosition] = useState({ x: 0, y: 0 });
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [optionsMenuAnchor, setOptionsMenuAnchor] = useState<HTMLElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  
  // Reply context state
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  
  // Forward modal state
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  
  // Dash AI state
  const [dashAIMessages, setDashAIMessages] = useState<ChatMessage[]>([]);
  const [dashAILoading, setDashAILoading] = useState(false);
  const [dashAILastMessage, setDashAILastMessage] = useState<string>('Hi! I\'m Dash, your AI assistant. How can I help you today? 🌟');
  const [dashAILastMessageAt, setDashAILastMessageAt] = useState<string>(new Date().toISOString());
  
  // Chat wallpaper state with localStorage persistence
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [wallpaperCss, setWallpaperCss] = useState<string | null>(null);
  
  // Modals state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [quickCallModalOpen, setQuickCallModalOpen] = useState(false);
  const [groupAvatarModalUser, setGroupAvatarModalUser] = useState<{ userId: string; userName: string } | null>(null);
  
  // Presets mapping (shared)
  const presetMap: Record<string, string> = {
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
        } else if (parsed.type === 'preset' && presetMap[parsed.value]) {
          setWallpaperCss(presetMap[parsed.value]);
        }
      } catch (e) {
        console.error('Failed to load wallpaper:', e);
        setWallpaperCss(null);
      }
    } else {
      setWallpaperCss(null);
    }
  }, [wallpaperStorageKey]);
  
  const applyWallpaper = (sel: { type: 'preset' | 'url'; value: string }) => {
    // Save to localStorage
    localStorage.setItem(wallpaperStorageKey, JSON.stringify(sel));
    
    if (sel.type === 'url') {
      setWallpaperCss(`url(${sel.value}) center/cover no-repeat fixed`);
      return;
    }
    setWallpaperCss(presetMap[sel.value] || presetMap['purple-glow']);
  };

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  const scrollToBottom = (instant = false) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
  };

  // Call useComposerEnhancements early to satisfy Rules of Hooks
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
  } = useComposerEnhancements({
    supabase,
    threadId: selectedThreadId,
    userId,
    onRefresh: () => {
      setRefreshTrigger(prev => prev + 1);
    },
    onEmojiInsert: (emoji) => setMessageText((prev) => `${prev}${emoji}`),
  });

  // Call interface hook - use Daily.co based calls
  const { startVoiceCall, startVideoCall } = useCall();

  // Listen for call trigger events from QuickActionsGrid
  useEffect(() => {
    const handleTriggerCall = (event: CustomEvent) => {
      const { recipientId, recipientName, type } = event.detail;
      console.log('[Messages] Triggering call:', { recipientId, recipientName, type });
      
      if (type === 'voice') {
        startVoiceCall(recipientId, recipientName);
      } else if (type === 'video') {
        startVideoCall(recipientId, recipientName);
      }
    };

    window.addEventListener('triggerCall', handleTriggerCall as EventListener);
    return () => window.removeEventListener('triggerCall', handleTriggerCall as EventListener);
  }, [startVoiceCall, startVideoCall]);

  // Typing indicator hook
  const { typingText, startTyping, stopTyping } = useTypingIndicator({ supabase, threadId: selectedThreadId, userId });

  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push('/sign-in');
        return;
      }

      setUserEmail(session.user.email);
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

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const markThreadAsRead = useCallback(async (threadId: string) => {
    // Skip for Dash AI thread - it's virtual, not in database
    if (!userId || threadId === DASH_AI_THREAD_ID) return;
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

  // Mark thread as read when selected (with delay to ensure messages are loaded)
  useEffect(() => {
    // Skip for Dash AI thread
    if (selectedThreadId && userId && selectedThreadId !== DASH_AI_THREAD_ID) {
      // Mark as read and trigger refresh
      const markAndRefresh = async () => {
        await markThreadAsRead(selectedThreadId);
        // Wait a bit for DB to update, then trigger refresh
        setTimeout(() => {
          setRefreshTrigger(prev => prev + 1);
        }, 500);
      };
      
      // Delay slightly to ensure messages are loaded first
      setTimeout(markAndRefresh, 300);
    }
  }, [selectedThreadId, userId, markThreadAsRead]);

  // Deduplication helpers
  const getThreadContactKey = (thread: MessageThread) => {
    const participants = thread.message_participants || [];
    
    // Find the educator (teacher or principal) - anyone who is not a parent
    // Check both direct role and profile role for compatibility
    const educator = participants.find((p) => {
      const role = p.role || p.profiles?.role;
      return role !== 'parent';
    });
    const educatorUserId = educator?.user_id;
    
    if (!educatorUserId) {
      return `thread:${thread.id}`;
    }
    
    const educatorRole = educator.role || educator.profiles?.role;
    
    // Use educator user_id as the unique identifier for deduplication
    // This ensures one conversation per educator (teacher/principal) regardless of students
    return `educator:${educatorUserId}`;
  };

  const getThreadRecencyValue = (thread: MessageThread) => {
    const rawTimestamp = thread.last_message?.created_at || thread.last_message_at;
    return rawTimestamp ? new Date(rawTimestamp).getTime() : 0;
  };

  const fetchThreads = useCallback(async () => {
    if (!userId) return;

    setThreadsLoading(true);
    setError(null);

    try {
      // Get all threads, then fetch participants separately to avoid Supabase nested query issues
      const { data: userThreadIds, error: userThreadIdsError } = await supabase
        .from('message_participants')
        .select('thread_id')
        .eq('user_id', userId)
        .eq('role', 'parent');

      if (userThreadIdsError) throw userThreadIdsError;

      const threadIdsList = userThreadIds?.map((t: { thread_id: string }) => t.thread_id) || [];
      
      if (threadIdsList.length === 0) {
        setThreads([]);
        return;
      }

      // Get thread basic info
      const { data: threadsData, error: threadsError } = await supabase
        .from('message_threads')
        .select(`
          id,
          type,
          subject,
          student_id,
          last_message_at,
          student:students(id, first_name, last_name)
        `)
        .in('id', threadIdsList)
        .order('last_message_at', { ascending: false });

      if (threadsError) throw threadsError;

      // Get participants without profiles first (should include educators due to RLS policy)
      const { data: rawParticipants, error: participantsError } = await supabase
        .from('message_participants')
        .select('thread_id, user_id, role, last_read_at')
        .in('thread_id', threadIdsList);

      if (participantsError) {
        throw participantsError;
      }
      
      // Get profiles for all participants
      const allUserIds = [...new Set((rawParticipants || []).map((p: { user_id: string }) => p.user_id))];
      
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .in('id', allUserIds);

      // Profiles error is non-fatal, continue with available data

      // Combine participants with profiles
      const allParticipants = (rawParticipants || []).map((participant: { thread_id: string; user_id: string; role: string; last_read_at?: string }) => ({
        ...participant,
        profiles: profilesData?.find((profile: { id: string }) => profile.id === participant.user_id) || null
      }));

      // Combine threads with their participants
      const threadsWithParticipants = (threadsData || []).map((thread: { id: string }) => ({
        ...thread,
        message_participants: allParticipants?.filter((p: { thread_id: string }) => p.thread_id === thread.id) || []
      }));

      const parentThreads = threadsWithParticipants as MessageThread[];

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

      const threadsWithDetails: MessageThread[] = parentThreads.map((thread) => {
        const summary = summaryMap.get(thread.id);
        const lastMessage =
          summary?.last_message_id
            ? {
                id: summary.last_message_id,
                content: summary.last_message_content,
                created_at: summary.last_message_created_at,
                sender_id: summary.last_message_sender_id,
                delivered_at: summary.last_message_delivered_at,
                read_by: summary.last_message_read_by,
              }
            : thread.last_message;

        return {
          ...thread,
          last_message: lastMessage,
          unread_count: Number(summary?.unread_count || 0),
        } as MessageThread;
      });

      // Collapse duplicates so each teacher/student pair only shows once
      const uniqueContactThreadMap = new Map<string, MessageThread>();
      threadsWithDetails.forEach((thread) => {
        const key = getThreadContactKey(thread);
        const existing = uniqueContactThreadMap.get(key);
        if (!existing || getThreadRecencyValue(thread) >= getThreadRecencyValue(existing)) {
          uniqueContactThreadMap.set(key, thread);
        }
      });

      const uniqueThreads = Array.from(uniqueContactThreadMap.values()).sort(
        (a, b) => getThreadRecencyValue(b) - getThreadRecencyValue(a)
      );

      setThreads(uniqueThreads);
      // Don't auto-select threads - let user choose
      // Only ensure selection is still valid if one exists
      if (selectedThreadId) {
        const stillSelected = threadsWithDetails.some((t) => t.id === selectedThreadId);
        if (!stillSelected) {
          setSelectedThreadId(null);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setThreadsLoading(false);
    }
  }, [selectedThreadId, supabase, userId]);

  // Load Dash AI messages from localStorage
  const loadDashAIMessages = useCallback(() => {
    const savedMessages = localStorage.getItem('dash-ai-messages');
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        setDashAIMessages(parsed);
        if (parsed.length > 0) {
          const lastMsg = parsed[parsed.length - 1];
          setDashAILastMessage(lastMsg.content);
          setDashAILastMessageAt(lastMsg.created_at);
        }
      } catch (e) {
        // Initialize with welcome message
        const welcomeMessage: ChatMessage = {
          id: 'dash-welcome',
          thread_id: DASH_AI_THREAD_ID,
          sender_id: DASH_AI_USER_ID,
          content: 'Hi! I\'m Dash, your AI assistant. I can help you with questions about your child\'s education, homework help, understanding school announcements, and more! How can I help you today? 🌟',
          created_at: new Date().toISOString(),
          sender: { first_name: 'Dash', last_name: 'AI', role: 'ai_assistant' },
        };
        setDashAIMessages([welcomeMessage]);
      }
    } else {
      // Initialize with welcome message
      const welcomeMessage: ChatMessage = {
        id: 'dash-welcome',
        thread_id: DASH_AI_THREAD_ID,
        sender_id: DASH_AI_USER_ID,
        content: 'Hi! I\'m Dash, your AI assistant. I can help you with questions about your child\'s education, homework help, understanding school announcements, and more! How can I help you today? 🌟',
        created_at: new Date().toISOString(),
        sender: { first_name: 'Dash', last_name: 'AI', role: 'ai_assistant' },
      };
      setDashAIMessages([welcomeMessage]);
    }
  }, []);

  // Save Dash AI messages to localStorage
  const saveDashAIMessages = useCallback((msgs: ChatMessage[]) => {
    localStorage.setItem('dash-ai-messages', JSON.stringify(msgs));
  }, []);

  // Send message to Dash AI
  const sendMessageToDashAI = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || !userId) return;
    
    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      thread_id: DASH_AI_THREAD_ID,
      sender_id: userId,
      content: userMessage,
      created_at: new Date().toISOString(),
      sender: { 
        first_name: profile?.firstName || 'You', 
        last_name: profile?.lastName || '', 
        role: 'parent' 
      },
    };
    
    const updatedMessages = [...dashAIMessages, userMsg];
    setDashAIMessages(updatedMessages);
    setDashAILastMessage(userMessage);
    setDashAILastMessageAt(userMsg.created_at);
    saveDashAIMessages(updatedMessages);
    setMessageText('');
    setTimeout(() => scrollToBottom(), 80);
    
    // Show loading state
    setDashAILoading(true);
    
    try {
      // Call canonical web AI endpoint (proxies to supabase/functions/ai-proxy)
      const response = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'parent',
          service_type: 'chat_message',
          enable_tools: true,
          prefer_openai: true,
          stream: false,
          payload: {
            prompt: userMessage.trim(),
            context:
              "You are Dash, a friendly and helpful AI assistant for parents using the EduDash Pro educational platform. Keep replies warm, supportive, and concise. When helpful, ask one short clarifying question and offer 1-2 actionable next steps.",
            conversationHistory: dashAIMessages.slice(-10).map((m) => ({
              role: m.sender_id === DASH_AI_USER_ID ? 'assistant' : 'user',
              content: m.content,
            })),
          },
          metadata: { role: 'parent', source: 'parent_messages_dash_ai' },
        }),
      });
      
      if (!response.ok) throw new Error('AI request failed');
      
      const data = await response.json();
      const aiContent = data.content || data.message || 'That didn’t go through yet. Please try again or add a bit more detail.';
      
      // Add AI response
      const aiMsg: ChatMessage = {
        id: `dash-${Date.now()}`,
        thread_id: DASH_AI_THREAD_ID,
        sender_id: DASH_AI_USER_ID,
        content: aiContent,
        created_at: new Date().toISOString(),
        sender: { first_name: 'Dash', last_name: 'AI', role: 'ai_assistant' },
      };
      
      const finalMessages = [...updatedMessages, aiMsg];
      setDashAIMessages(finalMessages);
      setDashAILastMessage(aiContent);
      setDashAILastMessageAt(aiMsg.created_at);
      saveDashAIMessages(finalMessages);
      setTimeout(() => scrollToBottom(), 80);
    } catch (err) {
      // Add error message
      const errorMsg: ChatMessage = {
        id: `dash-error-${Date.now()}`,
        thread_id: DASH_AI_THREAD_ID,
        sender_id: DASH_AI_USER_ID,
        content: 'Sorry, I\'m having trouble connecting right now. Please try again in a moment! 🙏',
        created_at: new Date().toISOString(),
        sender: { first_name: 'Dash', last_name: 'AI', role: 'ai_assistant' },
      };
      const errorMessages = [...updatedMessages, errorMsg];
      setDashAIMessages(errorMessages);
      saveDashAIMessages(errorMessages);
    } finally {
      setDashAILoading(false);
    }
  }, [dashAIMessages, userId, profile, saveDashAIMessages]);

  const fetchMessages = useCallback(async (threadId: string) => {
    // Handle Dash AI thread specially
    if (threadId === DASH_AI_THREAD_ID) {
      loadDashAIMessages();
      setMessages([]); // Clear regular messages
      return;
    }
    
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          thread_id,
          sender_id,
          content,
          content_type,
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

      if (error) throw error;
      
      let messagesWithDetails = data || [];

      if (messagesWithDetails.length > 0) {
        const senderIds = [...new Set(messagesWithDetails.map((message: any) => message.sender_id))];
        const { data: senderProfiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, role')
          .in('id', senderIds);

        const profileMap = new Map((senderProfiles || []).map((profile: any) => [profile.id, profile]));
        messagesWithDetails = messagesWithDetails.map((message: any) => ({
          ...message,
          sender: profileMap.get(message.sender_id) || null,
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
            sender: replySenderMap.get(r.sender_id) || null,
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
  }, [markThreadAsRead, supabase, loadDashAIMessages, userId]);

  const refreshConversation = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (userId) {
      fetchThreads();
    }
  }, [userId, fetchThreads, refreshTrigger]);

  useEffect(() => {
    if (selectedThreadId) {
      fetchMessages(selectedThreadId);
    }
  }, [selectedThreadId, fetchMessages]);

  useEffect(() => {
    // Skip realtime subscription for Dash AI thread - it's virtual
    if (!selectedThreadId || selectedThreadId === DASH_AI_THREAD_ID) return;

    const channel = supabase
      .channel(`parent-thread-${selectedThreadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${selectedThreadId}`,
        },
        async (payload: any) => {
          // Fetch the complete message with sender info
          const { data: newMessage } = await supabase
            .from('messages')
            .select(`
              id,
              thread_id,
              sender_id,
              content,
              created_at,
              delivered_at,
              read_by,
              sender:profiles(first_name, last_name, role)
            `)
            .eq('id', payload.new.id)
            .single();

          if (newMessage) {
            // Add new message to state immediately (avoid duplicates)
            setMessages((prev) => {
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
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

            // Update thread's last message in local state (avoid full refetch)
            setThreads((prev) => prev.map(t => 
              t.id === selectedThreadId 
                ? { 
                    ...t, 
                    last_message: {
                      id: newMessage.id,
                      content: newMessage.content,
                      created_at: newMessage.created_at,
                      sender_id: newMessage.sender_id,
                      delivered_at: (newMessage as any).delivered_at,
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
        (payload: any) => {
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

  // Stable keyboard listener with empty deps array - MUST be before any conditional returns
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

  // Compute derived values BEFORE early return (hooks must always be called)
  const filteredThreads = useMemo(() => {
    const query = searchQuery.toLowerCase();
    
    // Create the Dash AI virtual thread
    const dashAIThread = createDashAIThread(dashAILastMessage, dashAILastMessageAt);
    
    // Filter regular threads
    const filtered = threads.filter((thread) => {
      if (!query) return true;
      const participants = thread.message_participants || [];
      const educator = participants.find((p) => p.role !== 'parent');
      const educatorName = educator?.profiles
        ? `${educator.profiles.first_name} ${educator.profiles.last_name}`.toLowerCase()
        : '';
      const studentName = thread.student
        ? `${thread.student.first_name} ${thread.student.last_name}`.toLowerCase()
        : '';
      const lastMessage = thread.last_message?.content?.toLowerCase() || '';

      return (
        educatorName.includes(query) ||
        studentName.includes(query) ||
        lastMessage.includes(query) ||
        thread.subject.toLowerCase().includes(query)
      );
    });
    
    // Check if Dash AI matches search
    const dashAIMatches = !query || 
      'dash ai'.includes(query) || 
      'ai assistant'.includes(query) ||
      dashAIThread.last_message?.content?.toLowerCase().includes(query);
    
    // Always put Dash AI at the top if it matches the search
    return dashAIMatches ? [dashAIThread, ...filtered] : filtered;
  }, [threads, searchQuery, dashAILastMessage, dashAILastMessageAt]);

  // Early return for loading states (AFTER all hooks)
  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const handleDeleteThread = async (threadId: string) => {
    // Handle Dash AI thread deletion differently - just clear local storage
    if (threadId === DASH_AI_THREAD_ID) {
      localStorage.removeItem('dash-ai-messages');
      setDashAIMessages([]);
      setDashAILastMessage('Hi! I\'m Dash, your AI assistant. How can I help you today? 🌟');
      setDashAILastMessageAt(new Date().toISOString());
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null);
      }
      return;
    }
    
    try {
      // First delete all messages in the thread
      const { error: messagesError } = await supabase
        .from('messages')
        .delete()
        .eq('thread_id', threadId);

      if (messagesError) throw messagesError;

      // Delete message_participants
      const { error: participantsError } = await supabase
        .from('message_participants')
        .delete()
        .eq('thread_id', threadId);

      // Participants error is non-fatal

      // Then delete the thread itself
      const { error: threadError } = await supabase
        .from('message_threads')
        .delete()
        .eq('id', threadId);

      if (threadError) throw threadError;

      // Remove from local state
      setThreads(prev => prev.filter(t => t.id !== threadId));
      
      // If it was selected, clear selection
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null);
      }
    } catch (err: any) {
      alert('Failed to delete conversation. Please try again.');
    }
  };

  // Options menu handlers
  const handleOptionsDeleteThread = async () => {
    if (!selectedThreadId || !confirm('Are you sure you want to delete this conversation? This cannot be undone.')) return;
    await handleDeleteThread(selectedThreadId);
  };

  const handleClearConversation = async () => {
    if (!selectedThreadId || !confirm('Are you sure you want to clear all messages in this conversation?')) return;
    
    // Handle Dash AI thread - clear local storage
    if (selectedThreadId === DASH_AI_THREAD_ID) {
      localStorage.removeItem('dash-ai-messages');
      const welcomeMessage: ChatMessage = {
        id: 'dash-welcome',
        thread_id: DASH_AI_THREAD_ID,
        sender_id: DASH_AI_USER_ID,
        content: 'Hi! I\'m Dash, your AI assistant. I can help you with questions about your child\'s education, homework help, understanding school announcements, and more! How can I help you today? 🌟',
        created_at: new Date().toISOString(),
        sender: { first_name: 'Dash', last_name: 'AI', role: 'ai_assistant' },
      };
      setDashAIMessages([welcomeMessage]);
      setDashAILastMessage(welcomeMessage.content);
      setDashAILastMessageAt(welcomeMessage.created_at);
      return;
    }
    
    try {
      const { error } = await supabase.from('messages').delete().eq('thread_id', selectedThreadId);
      if (error) {
        console.error('Error clearing conversation:', error);
        alert('Failed to clear conversation. You may only clear messages you sent.');
        return;
      }
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

  // Handle starting a new chat with a contact
  const handleStartChatWithContact = async (contact: { id: string; first_name: string | null; last_name: string | null; role: string | null }) => {
    if (!userId) return;
    
    try {
      // Check if a thread already exists with this contact
      const { data: existingThreads } = await supabase
        .from('message_participants')
        .select('thread_id')
        .eq('user_id', contact.id);
      
      if (existingThreads && existingThreads.length > 0) {
        // Check which of these threads we're also a participant in
        const threadIds = existingThreads.map((t: { thread_id: string }) => t.thread_id);
        const { data: myThreads } = await supabase
          .from('message_participants')
          .select('thread_id')
          .eq('user_id', userId)
          .in('thread_id', threadIds);
        
        if (myThreads && myThreads.length > 0) {
          // Found existing thread - select it
          setSelectedThreadId(myThreads[0].thread_id);
          return;
        }
      }
      
      // Create new thread
      const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Chat';
      const { data: newThread, error: threadError } = await supabase
        .from('message_threads')
        .insert({
          type: 'parent-teacher',
          subject: contactName,
          preschool_id: profile?.preschoolId,
          created_by: userId,
        })
        .select()
        .single();
      
      if (threadError || !newThread) throw threadError;
      
      // Add participants
      await supabase.from('message_participants').insert([
        { thread_id: newThread.id, user_id: userId, role: profile?.role || 'parent' },
        { thread_id: newThread.id, user_id: contact.id, role: contact.role || 'user' },
      ]);
      
      // Refresh threads and select the new one
      setRefreshTrigger(prev => prev + 1);
      setSelectedThreadId(newThread.id);
    } catch (err) {
      console.error('Error starting chat:', err);
      alert('Failed to start chat. Please try again.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedThreadId || !userId) return;

    // Handle Dash AI messages specially
    if (selectedThreadId === DASH_AI_THREAD_ID) {
      await sendMessageToDashAI(messageText.trim());
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({
        thread_id: selectedThreadId,
        sender_id: userId,
        content: messageText.trim(),
        content_type: 'text',
        reply_to_id: replyingTo?.id || null,
      });

      if (error) throw error;
      
      // Clear reply context after sending
      setReplyingTo(null);

      await supabase
        .from('message_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selectedThreadId);

      // Send push notification to recipient (for when app is closed)
      const selectedThread = threads.find(t => t.id === selectedThreadId);
      const otherParticipant = selectedThread?.message_participants?.find(p => p.user_id !== userId);
      if (otherParticipant?.user_id) {
        const senderName = profile 
          ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Someone'
          : 'Someone';
        
        try {
          // Convert raw message content to display-friendly text (handles __media__ encoded content)
          const notificationBody = getMessageDisplayText(messageText.trim());
          const truncatedBody = notificationBody.length > 50 
            ? notificationBody.slice(0, 50) + '...' 
            : notificationBody;
          
          await fetch('/api/notifications/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: otherParticipant.user_id,
              title: `New message from ${senderName}`,
              body: truncatedBody,
              tag: `message-${selectedThreadId}`,
              type: 'message',
              requireInteraction: false,
              data: {
                url: `/dashboard/parent/messages?thread=${selectedThreadId}`,
                threadId: selectedThreadId,
              },
            }),
          });
        } catch (notifErr) {
          console.warn('Failed to send message push notification:', notifErr);
        }
      }

      setMessageText('');
      setRefreshTrigger(prev => prev + 1);
      
      // Scroll to bottom after sending
      setTimeout(() => scrollToBottom(), 100);
    } catch (err: any) {
      console.error('Error sending message:', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleMessageContextMenu = (e: React.MouseEvent | React.TouchEvent, messageId: string) => {
    const x = 'clientX' in e ? e.clientX : e.touches?.[0]?.clientX || 0;
    const y = 'clientY' in e ? e.clientY : e.touches?.[0]?.clientY || 0;
    setSelectedMessageId(messageId);
    setMessageActionsPosition({ x, y });
    setMessageActionsOpen(true);
  };

  const handleReplyMessage = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      setReplyingTo(message);
      // Focus the input field
      setTimeout(() => {
        const input = document.querySelector('.wa-composer-input') as HTMLTextAreaElement;
        if (input) input.focus();
      }, 100);
    }
    setMessageActionsOpen(false);
  };

  const handleForwardMessage = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      setForwardingMessage(message);
      setForwardModalOpen(true);
    }
    setMessageActionsOpen(false);
  };

  const handleEditMessage = async (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message || message.sender_id !== userId) return;

    const newContent = prompt('Edit message:', message.content);
    if (newContent && newContent.trim() && newContent !== message.content) {
      try {
        const { error } = await supabase
          .from('messages')
          .update({ content: newContent.trim() })
          .eq('id', messageId);

        if (error) throw error;
        setRefreshTrigger(prev => prev + 1);
      } catch (err) {
        console.error('Error editing message:', err);
        alert('Failed to edit message.');
      }
    }
    setMessageActionsOpen(false);
  };

  const handleDeleteMessage = async (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    
    // Only message sender can delete, or "delete for me" which hides the message
    const isOwnMessage = message.sender_id === userId;

    if (confirm(isOwnMessage ? 'Delete this message?' : 'Delete this message for you?')) {
      try {
        if (isOwnMessage) {
          // Soft delete by setting deleted_at
          const { error } = await supabase
            .from('messages')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', messageId)
            .eq('sender_id', userId);

          if (error) throw error;
        } else {
          // For messages from others, we could implement "delete for me"
          // For now, just hide it locally
          setMessages(prev => prev.filter(m => m.id !== messageId));
        }
        setRefreshTrigger(prev => prev + 1);
      } catch (err) {
        console.error('Error deleting message:', err);
        alert('Failed to delete message.');
      }
    }
    setMessageActionsOpen(false);
  };

  const handleCopyMessage = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      navigator.clipboard.writeText(message.content);
      alert('Message copied to clipboard!');
    }
    setMessageActionsOpen(false);
  };

  const handleReactToMessage = async (messageId: string, emoji?: string) => {
    if (!emoji || !userId) return;
    
    try {
      // Toggle reaction - if exists, remove it; if not, add it
      const { data: existing } = await supabase
        .from('message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji)
        .maybeSingle();

      if (existing) {
        // Remove reaction
        await supabase
          .from('message_reactions')
          .delete()
          .eq('id', existing.id);
      } else {
        // Add reaction
        await supabase
          .from('message_reactions')
          .insert({
            message_id: messageId,
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

  const totalUnread = threads.reduce((sum, thread) => sum + (thread.unread_count || 0), 0);
  
  // Check if we're in the Dash AI thread
  const isDashAISelected = selectedThreadId === DASH_AI_THREAD_ID;
  
  const currentThread = selectedThreadId
    ? isDashAISelected 
      ? createDashAIThread(dashAILastMessage, dashAILastMessageAt)
      : threads.find((thread) => thread.id === selectedThreadId)
    : null;
  
  const educator = currentThread?.message_participants?.find((p) => p.role !== 'parent');
  const educatorName = isDashAISelected 
    ? 'Dash AI' 
    : (educator?.profiles
      ? `${educator.profiles.first_name} ${educator.profiles.last_name}`.trim()
      : 'Teacher');

  // Get the messages to display (Dash AI or regular)
  const displayMessages = isDashAISelected ? dashAIMessages : messages;
  const isGroupThread = !isDashAISelected && (currentThread?.is_group || ((currentThread?.message_participants?.length || 0) > 2));

  const findOrSelectDmThread = (targetUserId: string) => {
    const participants = (t: MessageThread) => t.message_participants || t.participants || [];
    const dmThread = threads.find((t) => {
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

  const handleSelectThread = (threadId: string) => {
    if (threadId === DASH_AI_THREAD_ID) {
      router.push('/dashboard/parent/dash-chat');
      return;
    }
    setSelectedThreadId(threadId);
  };

  const handleClearSelection = () => {
    setSelectedThreadId(null);
    // Refresh threads to update unread counts
    fetchThreads();

    // On mobile, don't use router.back() - just clear selection to show contact list
    // Router navigation is not needed since we're staying on the same page
  };

  return (
    <ParentShell
      tenantSlug={slug}
      userEmail={userEmail}
      userName={profile?.firstName}
      preschoolName={profile?.preschoolName}
      unreadCount={totalUnread}
      contentStyle={{ padding: 0, overflow: 'hidden', height: '100vh', maxHeight: '100vh' }}
    >
      <style>{`
        @media (max-width: 1023px) {
          header.topbar {
            display: none !important;
          }
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
      <div
        className="parent-messages-page"
        style={{
          display: 'flex',
          height: '100vh',
          overflow: 'hidden',
          width: '100%',
          margin: 0,
          boxSizing: 'border-box',
          background: '#0f172a',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
            marginRight: 0,
          }}
        >
          {/* Mobile: Show thread list when no selection, otherwise show chat */}
          {!isDesktop && !currentThread ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '100vh', background: '#0f172a' }}>
              {/* Mobile contacts header with back arrow */}
              <div style={{ 
                padding: '16px 12px', 
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                background: '#111827',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                zIndex: 1000,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => router.back()}
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
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Messages
                  </h2>
                </div>
                {/* New chat / Invite button */}
                <button
                  onClick={() => setNewChatModalOpen(true)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    background: 'rgba(124, 58, 237, 0.15)',
                    border: '1px solid rgba(124, 58, 237, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#a78bfa',
                    padding: 0,
                  }}
                >
                  <Plus size={20} />
                </button>
              </div>
              
              {/* Search bar fixed below header */}
              <div style={{ 
                position: 'fixed',
                top: '68px',
                left: 0,
                right: 0,
                padding: '12px 16px',
                background: '#111827',
                backdropFilter: 'blur(12px)',
                zIndex: 999,
              }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search..."
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
              
              <div style={{ flex: 1, overflowY: 'auto', paddingTop: '136px', minHeight: 'calc(100vh - 136px)', background: '#0f172a' }}>
              {threadsLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div className="spinner" style={{ margin: '0 auto' }}></div>
                </div>
              ) : filteredThreads.length > 0 ? (
                filteredThreads.map((thread) => (
                  <ThreadItem
                    key={thread.id}
                    thread={thread}
                    isActive={false}
                    onSelect={() => handleSelectThread(thread.id)}
                    onDelete={handleDeleteThread}
                    isDesktop={isDesktop}
                    currentUserId={userId}
                  />
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <MessageSquare size={48} color="var(--muted)" style={{ margin: '0 auto 16px' }} />
                  <p style={{ color: 'var(--muted)', fontSize: 15 }}>No conversations yet</p>
                </div>
                )}
              </div>
              
              {/* Dash AI FAB - Fixed at bottom right for quick access */}
              <button
                onClick={() => handleSelectThread(DASH_AI_THREAD_ID)}
                style={{
                  position: 'fixed',
                  bottom: 'calc(80px + env(safe-area-inset-bottom))',
                  right: 16,
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(168, 85, 247, 0.5), 0 0 30px rgba(168, 85, 247, 0.3)',
                  zIndex: 999,
                  transition: 'all 0.3s ease',
                }}
              >
                <Sparkles size={24} color="white" />
              </button>
            </div>
          ) : currentThread ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              background: wallpaperCss || 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
              position: 'relative',
              height: '100%',
              overflow: 'hidden',
            }}>
              <div
                style={{
                  position: 'fixed',
                  top: isDesktop ? 'auto' : 0,
                  left: isDesktop ? 'auto' : 0,
                  right: isDesktop ? 'auto' : 0,
                  width: isDesktop ? 'auto' : '100%',
                  zIndex: isDesktop ? 'auto' : 1000,
                  padding: isDesktop ? '20px 28px' : '16px 12px',
                  borderBottom: isDesktop ? '1px solid rgba(148, 163, 184, 0.1)' : 'none',
                  background: isDesktop
                    ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 100%)'
                    : 'var(--surface)',
                  backdropFilter: 'blur(12px)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: isDesktop ? 18 : 12,
                  boxShadow: isDesktop ? '0 2px 12px rgba(0, 0, 0, 0.15)' : '0 2px 8px rgba(0, 0, 0, 0.08)',
                }}
              >
                {!isDesktop && (
                  <button
                    onClick={handleClearSelection}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      background: 'transparent',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#e2e8f0',
                      padding: 0,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <ArrowLeft size={20} />
                  </button>
                )}
                {/* Avatar - Dash AI gets special avatar */}
                {isDashAISelected ? (
                  <DashAIAvatar size={isDesktop ? 52 : 36} showStars={true} animated={true} />
                ) : (
                  <div
                    style={{
                      width: isDesktop ? 52 : 36,
                      height: isDesktop ? 52 : 36,
                      borderRadius: isDesktop ? 26 : 18,
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                      fontSize: isDesktop ? 17 : 13,
                      fontWeight: 600,
                      color: '#fff',
                    }}
                  >
                    {educatorName.trim().split(' ').filter(n => n.length > 0).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h2 style={{ 
                      margin: 0, 
                      fontSize: isDesktop ? 18 : 16, 
                      fontWeight: 700, 
                      color: isDashAISelected ? '#e879f9' : '#f1f5f9',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {educatorName}
                    </h2>
                    {isDashAISelected && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#a855f7',
                        background: 'rgba(168, 85, 247, 0.15)',
                        padding: '3px 8px',
                        borderRadius: 6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        AI
                      </span>
                    )}
                  </div>
                  {isDashAISelected ? (
                    <p style={{ 
                      margin: '4px 0 0', 
                      fontSize: 13, 
                      color: '#22d3ee', 
                      fontWeight: 500,
                    }}>
                      ✨ Your AI Assistant
                    </p>
                  ) : isDesktop && currentThread.student && (
                    <p style={{ 
                      margin: '4px 0 0', 
                      fontSize: 13, 
                      color: '#a78bfa', 
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <span>📚</span>
                      <span>{currentThread.student.first_name} {currentThread.student.last_name}</span>
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 10 : 8 }}>
                  {isDesktop ? (
                    <button
                      onClick={handleClearSelection}
                      style={{
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: 10,
                        padding: '8px 14px',
                        background: 'rgba(100, 116, 139, 0.1)',
                        color: '#94a3b8',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 500,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <ArrowLeft size={14} />
                      Clear
                    </button>
                  ) : (
                    <>
                      {/* Hide call buttons for Dash AI */}
                      {!isDashAISelected && (
                        <>
                          <button
                            onClick={() => educator?.user_id && startVoiceCall(educator.user_id, educatorName, selectedThreadId ? { threadId: selectedThreadId } : undefined)}
                            title="Voice call"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              padding: 0,
                              boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)',
                              transition: 'transform 0.2s ease',
                            }}
                            className="active:scale-95"
                          >
                            <Phone size={16} color="white" />
                          </button>
                          <button
                            onClick={() => educator?.user_id && startVideoCall(educator.user_id, educatorName, selectedThreadId ? { threadId: selectedThreadId } : undefined)}
                            title="Video call"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              padding: 0,
                              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                              transition: 'transform 0.2s ease',
                            }}
                            className="active:scale-95"
                          >
                            <Video size={16} color="white" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setWallpaperOpen(true)}
                        title="Chat wallpaper"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: 'transparent',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: '#e2e8f0',
                          padding: 0,
                        }}
                      >
                        <Image size={18} />
                      </button>
                      <button
                        ref={moreButtonRef}
                        onClick={() => {
                          setOptionsMenuAnchor(moreButtonRef.current);
                          setOptionsMenuOpen(true);
                        }}
                        title="More"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: 'transparent',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: '#e2e8f0',
                          padding: 0,
                        }}
                      >
                        <MoreVertical size={20} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Mobile: Fixed student name subtitle */}
              {!isDesktop && currentThread.student && (
                <div
                  style={{
                    position: 'fixed',
                    top: 68,
                    left: 0,
                    right: 0,
                    zIndex: 999,
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: 'var(--surface)',
                  }}
                >
                  <span style={{ fontSize: 13, color: '#a78bfa', fontWeight: 500 }}>📚</span>
                  <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 500 }}>
                    {currentThread.student.first_name} {currentThread.student.last_name}
                  </span>
                </div>
              )}

              {/* Typing indicator */}
              {typingText && (
                <div style={{
                  padding: '8px 16px',
                  color: 'var(--muted)',
                  fontSize: '12px',
                  position: isDesktop ? 'relative' : 'fixed',
                  top: !isDesktop ? (currentThread.student ? 108 : 68) : undefined,
                  left: !isDesktop ? 0 : undefined,
                  right: !isDesktop ? 0 : undefined,
                  zIndex: !isDesktop ? 998 : undefined,
                  background: !isDesktop ? 'transparent' : undefined,
                }}>
                  {typingText}
                </div>
              )}

              <div
                className="hide-scrollbar"
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  minHeight: 0,
                  padding: isDesktop ? '28px 0px' : '0 8px',
                  paddingTop: isDesktop ? '32px' : (currentThread.student ? '120px' : '88px'),
                  paddingBottom: isDesktop ? 100 : (currentThread.student ? 110 : 100),
                  paddingRight: isDesktop ? 340 : 8,
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                {messagesLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                    <div className="spinner"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      minHeight: 300,
                      padding: 40,
                    }}
                  >
                    <div
                      style={{
                        padding: '40px 32px',
                        borderRadius: 20,
                        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
                        border: '1px solid rgba(148, 163, 184, 0.1)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                      }}
                    >
                      <div
                        style={{
                          width: 72,
                          height: 72,
                          margin: '0 auto 20px',
                          borderRadius: 36,
                          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 16px rgba(99, 102, 241, 0.2)',
                        }}
                      >
                        <Send size={30} color="#818cf8" />
                      </div>
                      <p style={{ color: '#f1f5f9', marginBottom: 10, fontSize: 17, fontWeight: 600 }}>
                        Start a conversation
                      </p>
                      <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 280, lineHeight: 1.6 }}>
                        Send a message below to connect with your educator.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: isDesktop ? 20 : 16 }}>
                    {displayMessages.map((message, index) => {
                      const isOwn = message.sender_id === userId;
                      const isDashAIMessage = message.sender_id === DASH_AI_USER_ID;
                      const senderName = isDashAIMessage
                        ? 'Dash AI'
                        : (message.sender
                          ? `${message.sender.first_name || ''} ${message.sender.last_name || ''}`.trim()
                          : '');

                      // Get other participant IDs (excluding current user) for read status
                      const otherParticipantIds = (currentThread?.message_participants || [])
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
                              showSenderName={isGroupThread}
                              otherParticipantIds={otherParticipantIds}
                              hideAvatars={!isDesktop && !isGroupThread}
                              isGroupChat={isGroupThread}
                              onAvatarClick={isGroupThread ? (senderId, name) => setGroupAvatarModalUser({ userId: senderId, userName: name }) : undefined}
                              onContextMenu={isDashAISelected ? undefined : handleMessageContextMenu}
                              isDashAI={isDashAIMessage}
                              onReplyClick={scrollToMessage}
                              onCallEventPress={handleCallEventPress}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {/* Dash AI Loading indicator */}
                    {isDashAISelected && dashAILoading && (
                      <div style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: 8 }}>
                        <DashAILoading size={36} />
                      </div>
                    )}
                    {/* Spacer for bottom padding on mobile */}
                    <div ref={messagesEndRef} style={{ height: isDesktop ? 16 : 100, flexShrink: 0 }} />
                  </div>
                )}
              </div>

              <div
                style={{
                  position: isDesktop ? 'absolute' : 'fixed',
                  bottom: 0,
                  left: 0,
                  right: isDesktop ? 320 : 0,
                  padding: isDesktop ? '16px 28px' : '12px 16px',
                  paddingBottom: isDesktop ? 16 : 'max(12px, env(safe-area-inset-bottom))',
                  background: isDesktop ? 'rgba(15, 23, 42, 0.95)' : 'linear-gradient(180deg, rgba(15, 23, 42, 0.0) 0%, rgba(15, 23, 42, 0.95) 15%, rgba(15, 23, 42, 1) 100%)',
                  backdropFilter: 'blur(12px)',
                  zIndex: 100,
                }}
              >
                <input
                  type="file"
                  accept="image/*,audio/*,video/*"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleAttachmentChange}
                />
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={cameraInputRef}
                  style={{ display: 'none' }}
                  onChange={handleAttachmentChange}
                />
                
                {/* Reply Preview Bar */}
                {replyingTo && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)',
                    borderRadius: '12px 12px 0 0',
                    marginBottom: -2,
                    borderLeft: '3px solid #3b82f6',
                    gap: 10,
                  }}>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600, marginBottom: 2 }}>
                        Replying to {replyingTo.sender_id === userId ? 'yourself' : (replyingTo.sender?.first_name || 'message')}
                      </div>
                      <p style={{
                        margin: 0,
                        fontSize: 13,
                        color: '#94a3b8',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {replyingTo.content.startsWith('__media__') ? '📎 Media' : replyingTo.content}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 4,
                        cursor: 'pointer',
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                )}
                
                <form onSubmit={handleSendMessage} style={{ position: 'relative', marginLeft: isDesktop ? 0 : '-8px' }}>
                  {showEmojiPicker && (
                    <div
                      ref={emojiPickerRef}
                      style={{
                        position: 'absolute',
                        bottom: 70,
                        left: 12,
                        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                        border: '1px solid rgba(148, 163, 184, 0.15)',
                        borderRadius: 16,
                        padding: 12,
                        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: 8,
                        zIndex: 20,
                      }}
                    >
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleEmojiSelect(emoji)}
                          style={{
                            fontSize: 22,
                            lineHeight: 1,
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            padding: 6,
                            borderRadius: 8,
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(100, 116, 139, 0.2)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: isDesktop ? 10 : 8, alignItems: isDesktop ? 'flex-end' : 'center', maxWidth: isDesktop ? 800 : 'none', margin: isDesktop ? '0 auto' : 0, position: 'relative' }}>
                    {/* Desktop: Icons outside input */}
                    {isDesktop && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          ref={emojiButtonRef}
                          onClick={() => setShowEmojiPicker((prev) => !prev)}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            background: 'rgba(100, 116, 139, 0.1)',
                            border: '1px solid rgba(148, 163, 184, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <Smile size={22} />
                        </button>
                        <button
                          type="button"
                          onClick={triggerFilePicker}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            background: 'rgba(100, 116, 139, 0.1)',
                            border: '1px solid rgba(148, 163, 184, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <Paperclip size={18} />
                        </button>
                      </div>
                    )}

                    {/* Mobile & Desktop: Input field */}
                    <div className="wa-composer" style={{ position: 'relative', flex: 1, zIndex: 101, padding: isDesktop ? 0 : 'var(--scale-xs, 6px)' }}>
                      {/* Mobile: Emoji button */}
                      {!isDesktop && (
                        <button
                          type="button"
                          ref={emojiButtonRef}
                          onClick={() => setShowEmojiPicker((prev) => !prev)}
                          className="wa-composer-btn wa-composer-btn-icon"
                          style={{ width: 'var(--touch-sm, 36px)', height: 'var(--touch-sm, 36px)' }}
                        >
                          <Smile size={22} />
                        </button>
                      )}

                      {/* Input wrapper - WhatsApp style */}
                      <div 
                        className="wa-composer-input-wrap"
                        style={isDesktop ? { 
                          background: 'var(--surface-2)', 
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-lg, 24px)',
                          padding: '8px 16px',
                        } : undefined}
                      >
                        <textarea
                          value={messageText}
                          onChange={(e) => {
                            setMessageText(e.target.value);
                            startTyping();
                            if (!isDesktop) {
                              const ta = e.target as HTMLTextAreaElement;
                              ta.style.height = 'auto';
                              ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
                            }
                          }}
                          onBlur={() => { try { stopTyping(); } catch {} }}
                          placeholder="Message"
                          disabled={sending || attachmentUploading}
                          rows={1}
                          className="wa-composer-input"
                          style={{ 
                            minHeight: isDesktop ? '24px' : 'var(--touch-sm, 36px)',
                            fontSize: 'var(--font-md, 16px)',
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage(e);
                              if (!isDesktop) (e.currentTarget as HTMLTextAreaElement).style.height = '36px';
                            }
                          }}
                        />
                        
                        {/* Inline icons - Camera & Clip (hide camera when typing) */}
                        {!messageText.trim() && (
                          <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            disabled={attachmentUploading}
                            className="wa-composer-btn wa-composer-btn-icon"
                            style={{ width: 'var(--icon-md, 24px)', height: 'var(--icon-md, 24px)' }}
                          >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                              <circle cx="12" cy="13" r="4"/>
                            </svg>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={triggerFilePicker}
                          disabled={attachmentUploading}
                          className="wa-composer-btn wa-composer-btn-icon"
                          style={{ width: 'var(--icon-md, 24px)', height: 'var(--icon-md, 24px)', opacity: attachmentUploading ? 0.5 : 1 }}
                        >
                          <Paperclip size={22} />
                        </button>
                      </div>

                      {/* Send/Mic button - outside on right */}
                      {messageText.trim() ? (
                        <button
                          type="submit"
                          disabled={sending || attachmentUploading}
                          className="wa-composer-btn wa-composer-btn-send"
                          style={{ 
                            width: 'var(--composer-button, 44px)', 
                            height: 'var(--composer-button, 44px)',
                            opacity: sending || attachmentUploading ? 0.6 : 1,
                          }}
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
                          className="wa-composer-btn wa-composer-btn-mic"
                          style={{ 
                            width: 'var(--composer-button, 44px)', 
                            height: 'var(--composer-button, 44px)',
                            background: isRecording 
                              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
                              : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                            boxShadow: isRecording
                              ? '0 4px 16px rgba(245, 158, 11, 0.5), 0 0 20px rgba(245, 158, 11, 0.3)'
                              : '0 4px 16px rgba(0, 212, 255, 0.4), 0 0 20px rgba(0, 212, 255, 0.25)',
                            border: '1px solid rgba(0, 212, 255, 0.3)',
                          }}
                        >
                          <Mic size={20} color={isRecording ? 'white' : '#00d4ff'} />
                        </button>
                      )}
                    </div>
                  </div>
                </form>
                {statusMessage && (
                  <p style={{ marginTop: 10, fontSize: 13, color: '#f87171', textAlign: 'center' }}>{statusMessage}</p>
                )}
                {attachmentUploading && uploadProgress !== null && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Uploading... {Math.round(uploadProgress)}%</span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'rgba(100, 116, 139, 0.2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                          transition: 'width 0.3s ease',
                          width: `${uploadProgress}%`,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            isDesktop && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                paddingRight: 0,
                background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
              }}
            >
              <div
                style={{
                  maxWidth: 360,
                  padding: 40,
                  borderRadius: 20,
                  background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 20px 80px rgba(15, 23, 42, 0.25)',
                }}
              >
                <div style={{ 
                  width: 120, 
                  height: 120, 
                  margin: '0 auto 24px',
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 32px rgba(139, 92, 246, 0.3)'
                }}>
                  <svg width="60" height="60" viewBox="0 0 100 100" fill="none">
                    <path d="M20 30L50 60L80 30" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M20 50L50 80L80 50" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
                  </svg>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: 'white', marginBottom: 12, textAlign: 'center' }}>
                  EduDash Pro Messages
                </h2>
                <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 15, lineHeight: 1.5, textAlign: 'center' }}>
                  Send private, secure messages between parents and teachers.
                </p>
              </div>
            </div>
            )
          )}
        </div>

        {false && isDesktop && (
          <div
            style={{
              position: 'fixed',
              right: 0,
              top: 'var(--topnav-offset)',
              bottom: 0,
              width: 320,
              borderLeft: '1px solid rgba(148, 163, 184, 0.1)',
              background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 20,
              boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
            }}
          >
            <div style={{ 
              padding: '20px 16px 16px', 
              borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
              background: 'rgba(15, 23, 42, 0.5)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ 
                  margin: 0, 
                  fontSize: 18, 
                  fontWeight: 700, 
                  color: '#f1f5f9',
                  letterSpacing: '-0.01em',
                }}>
                  Conversations
                </h3>
                {totalUnread > 0 && (
                  <span style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 12,
                    boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)',
                  }}>
                    {totalUnread} new
                  </span>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 42px',
                    borderRadius: 12,
                    border: '1px solid rgba(148, 163, 184, 0.15)',
                    background: 'rgba(30, 41, 59, 0.6)',
                    color: '#e2e8f0',
                    fontSize: 14,
                    outline: 'none',
                    transition: 'all 0.2s ease',
                  }}
                />
                <Search
                  size={18}
                  color="#64748b"
                  style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
              {threadsLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div className="spinner" style={{ margin: '0 auto' }}></div>
                </div>
              ) : error ? (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <p style={{ color: '#f87171', fontSize: 14, marginBottom: 16 }}>Failed to load messages</p>
                  <button 
                    className="btn btnSecondary" 
                    onClick={fetchThreads}
                    style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      color: '#60a5fa',
                      padding: '8px 16px',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    Try Again
                  </button>
                </div>
              ) : filteredThreads.length > 0 ? (
                filteredThreads.map((thread) => (
                  <ThreadItem
                    key={thread.id}
                    thread={thread}
                    isActive={thread.id === selectedThreadId}
                    onSelect={() => handleSelectThread(thread.id)}
                    onDelete={handleDeleteThread}
                    isDesktop={isDesktop}
                    currentUserId={userId}
                  />
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    margin: '0 auto 16px',
                    borderRadius: 32,
                    background: 'rgba(100, 116, 139, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <MessageSquare size={28} color="#64748b" />
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: 15, fontWeight: 500 }}>No conversations yet</p>
                  <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>Messages will appear here</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Call interface is now handled by CallProvider wrapping the app */}
      <MessageOptionsMenu
        isOpen={optionsMenuOpen}
        onClose={() => setOptionsMenuOpen(false)}
        onDeleteThread={handleOptionsDeleteThread}
        onClearConversation={handleClearConversation}
        onBlockUser={handleBlockUser}
        onExportChat={handleExportChat}
        onReportIssue={handleReportIssue}
        anchorEl={optionsMenuAnchor}
      />
      <ChatWallpaperPicker
        isOpen={wallpaperOpen}
        onClose={() => setWallpaperOpen(false)}
        userId={userId || ''}
        onSelect={applyWallpaper}
      />
      <MessageActionsMenu
        isOpen={messageActionsOpen}
        onClose={() => setMessageActionsOpen(false)}
        position={messageActionsPosition}
        isOwnMessage={messages.find(m => m.id === selectedMessageId)?.sender_id === userId}
        onReply={() => selectedMessageId && handleReplyMessage(selectedMessageId)}
        onForward={() => selectedMessageId && handleForwardMessage(selectedMessageId)}
        onEdit={() => selectedMessageId && handleEditMessage(selectedMessageId)}
        onDelete={() => selectedMessageId && handleDeleteMessage(selectedMessageId)}
        onCopy={() => selectedMessageId && handleCopyMessage(selectedMessageId)}
        onReact={(emoji) => selectedMessageId && handleReactToMessage(selectedMessageId, emoji)}
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
                const name = otherParticipant?.profiles 
                  ? `${otherParticipant.profiles.first_name} ${otherParticipant.profiles.last_name}`.trim()
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
                      transition: 'all 0.15s ease',
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
      
      <InviteContactModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        preschoolId={profile?.preschoolId}
        preschoolName={profile?.preschoolName}
        inviterName={profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : undefined}
        inviterId={userId}
      />
      <NewChatModal
        isOpen={newChatModalOpen}
        onClose={() => setNewChatModalOpen(false)}
        onSelectContact={handleStartChatWithContact}
        onSelectDashAI={() => router.push('/dashboard/parent/dash-chat')}
        onInviteNew={() => {
          setNewChatModalOpen(false);
          setInviteModalOpen(true);
        }}
        currentUserId={userId || null}
        currentUserRole={profile?.role || undefined}
        preschoolId={profile?.preschoolId}
      />
      
      {/* Quick Call Modal */}
      <QuickCallModal
        isOpen={quickCallModalOpen}
        onClose={() => setQuickCallModalOpen(false)}
        onVoiceCall={(uid, userName) => startVoiceCall(uid, userName)}
        onVideoCall={(uid, userName) => startVideoCall(uid, userName)}
        currentUserId={userId}
        preschoolId={profile?.preschoolId}
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
      {!currentThread && (
        <button
          onClick={() => setQuickCallModalOpen(true)}
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
    </ParentShell>
  );
}

// Loading fallback component
function MessagesLoading() {
  return (
    <ParentShell>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'var(--background)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--muted)' }}>Loading messages...</p>
        </div>
      </div>
    </ParentShell>
  );
}

// Export with Suspense wrapper
export default function ParentMessagesPage() {
  return (
    <Suspense fallback={<MessagesLoading />}>
      <ParentMessagesContent />
    </Suspense>
  );
}
