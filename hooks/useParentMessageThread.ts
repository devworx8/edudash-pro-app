import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Platform, Keyboard, Vibration, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { type FlashListRef } from '@shopify/flash-list';
import { toast } from '@/components/ui/ToastProvider';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { logger } from '@/lib/logger';
import type { Message } from '@/components/messaging';
import { getDateKey, getDateSeparatorLabel } from '@/components/messaging';
import { COMPOSER_OVERLAY_HEIGHT, COMPOSER_FLOAT_GAP, WALLPAPER_ACCENTS } from '@/lib/screen-styles/parent-message-thread.styles';
let useThreadMessages: (id: string | null) => { data: any[]; isLoading: boolean; error: any; refetch: () => void };
let useSendMessage: () => { mutateAsync: (args: any) => Promise<any>; isLoading: boolean };
let useMarkThreadRead: () => { mutate: (args: any) => void };
let useRealtimeMessages: (threadId: string | null) => void = () => {};
let getStoredWallpaper: (() => Promise<any>) | null = null;
let WALLPAPER_PRESETS: any[] = [];
let uploadVoiceNote: ((uri: string, duration: number, conversationId?: string) => Promise<{ publicUrl: string; storagePath: string }>) | null = null;
let assertSupabase: () => any;

try { assertSupabase = require('@/lib/supabase').assertSupabase; } catch { assertSupabase = () => { throw new Error('Supabase not available'); }; }
try { const h = require('@/hooks/useParentMessaging'); useThreadMessages = h.useThreadMessages; useSendMessage = h.useSendMessage; useMarkThreadRead = h.useMarkThreadRead; useRealtimeMessages = h.useParentMessagesRealtime || (() => {}); } catch { useThreadMessages = () => ({ data: [], isLoading: false, error: null, refetch: () => {} }); useSendMessage = () => ({ mutateAsync: async () => ({}), isLoading: false }); useMarkThreadRead = () => ({ mutate: () => {} }); }
try { const w = require('@/components/messaging/ChatWallpaperPicker'); getStoredWallpaper = w.getStoredWallpaper; WALLPAPER_PRESETS = w.WALLPAPER_PRESETS || []; } catch {}
try { uploadVoiceNote = require('@/services/VoiceStorageService').uploadVoiceNote; } catch {}
let FileSystem: typeof import('expo-file-system/legacy') | null = null;
let base64ToUint8Array: (b: string) => Uint8Array = () => new Uint8Array(0);
try { FileSystem = require('expo-file-system/legacy'); } catch {}
try { base64ToUint8Array = require('@/lib/utils/base64').base64ToUint8Array; } catch {}
export type ChatRow = { type: 'date'; key: string; label: string } | { type: 'message'; key: string; msg: Message; isFirstInGroup: boolean; isLastInGroup: boolean };
export type ThreadParticipant = {
  user_id: string;
  role: string;
  user_profile?: {
    first_name?: string;
    last_name?: string;
    avatar_url?: string | null;
    role?: string;
  } | null;
};

export function useParentMessageThread(threadId: string, userId: string | undefined, userEmail: string | undefined) {
  const listRef = useRef<FlashListRef<any> | null>(null);
  const isAtBottomRef = useRef(true);
  const scrollToLatest = useCallback((animated = true, delay = 60) => {
    setTimeout(() => {
      try {
        listRef.current?.scrollToEnd({ animated });
      } catch {
        // FlashList on web can occasionally reject scrollToEnd while reflowing.
      }
    }, delay);
  }, []);

  const { isOtherTyping, typingText, setTyping, clearTyping } = useTypingIndicator({
    threadId: threadId || null, userId: userId || null, userName: userEmail?.split('@')[0] || 'User',
  });
  const [sending, setSending] = useState(false);
  const [optimisticMsgs, setOptimisticMsgs] = useState<Message[]>([]);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(COMPOSER_OVERLAY_HEIGHT);
  const [currentWallpaper, setCurrentWallpaper] = useState<{ type: string; value: string } | null>(null);
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showMessageActions, setShowMessageActions] = useState(false);
  const [currentlyPlayingVoiceId, setCurrentlyPlayingVoiceId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [pendingScheduleText, setPendingScheduleText] = useState<string | null>(null);
  const [threadParticipantCount, setThreadParticipantCount] = useState<number | null>(null);
  const [threadParticipants, setThreadParticipants] = useState<ThreadParticipant[]>([]);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  useEffect(() => {
    if (getStoredWallpaper) getStoredWallpaper().then(wp => { if (wp) setCurrentWallpaper(wp); }).catch(() => {});
  }, []);
  useEffect(() => {
    let isCancelled = false;

    if (!threadId) {
      setThreadParticipantCount(null);
      setThreadParticipants([]);
      return;
    }

    (async () => {
      try {
        const { data, count, error } = await assertSupabase()
          .from('message_participants')
          .select(
            `
              user_id,
              role,
              user_profile:profiles(first_name, last_name, avatar_url, role)
            `,
            { count: 'exact' }
          )
          .eq('thread_id', threadId);

        if (!isCancelled) {
          setThreadParticipants((data || []) as ThreadParticipant[]);
          setThreadParticipantCount(!error && typeof count === 'number' ? count : null);
        }
      } catch {
        if (!isCancelled) {
          setThreadParticipants([]);
          setThreadParticipantCount(null);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [threadId]);
  let messages: Message[] = [];
  let loading = false;
  let error: any = null;
  let refetch = () => {};
  let sendMessage = async (_: any) => ({});
  let markRead = (_: any) => {};

  try { const r = useThreadMessages(threadId || null); messages = r.data || []; loading = r.isLoading; error = r.error; refetch = r.refetch; } catch (e) { if (__DEV__) logger.warn('ParentThread', 'useThreadMessages error:', e); }
  try { const s = useSendMessage(); sendMessage = s.mutateAsync; } catch (e) { if (__DEV__) logger.warn('ParentThread', 'useSendMessage error:', e); }
  try { const m = useMarkThreadRead(); markRead = m.mutate; } catch (e) { if (__DEV__) logger.warn('ParentThread', 'useMarkThreadRead error:', e); }
  useRealtimeMessages(threadId || null);

  const allMessages = useMemo(() => {
    const ids = new Set(messages.map(m => m.id));
    const unique = optimisticMsgs.filter(m => {
      if (ids.has(m.id)) return false;
      return !messages.some(real => real.sender_id === m.sender_id && real.content === m.content && Math.abs(new Date(real.created_at).getTime() - new Date(m.created_at).getTime()) < 30000);
    });
    return [...messages, ...unique].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages, optimisticMsgs]);

  useEffect(() => {
    if (threadId && messages.length > 0 && !loading && userId) {
      try { assertSupabase().rpc('mark_messages_delivered', { p_thread_id: threadId, p_user_id: userId }).then(() => { if (__DEV__) logger.debug('ParentThread', 'Marked messages as delivered'); }).catch((err: any) => { if (__DEV__) logger.warn('ParentThread', 'Failed to mark delivered:', err); }); } catch {}
      try { markRead({ threadId }); } catch {}
    }
  }, [threadId, messages.length, loading, userId]);

  useEffect(() => {
    if (!allMessages.length) return;
    const lastMessage = allMessages[allMessages.length - 1];
    if (isAtBottomRef.current || lastMessage?.sender_id === userId) {
      scrollToLatest(!lastMessage?._pending, 70);
    }
  }, [allMessages, scrollToLatest, userId]);

  const getWallpaperGradient = useCallback((): [string, string, ...string[]] => {
    if (!currentWallpaper || currentWallpaper.type === 'url') return ['#0f172a', '#1e1b4b', '#0f172a'];
    const preset = WALLPAPER_PRESETS.find((p: any) => p.key === currentWallpaper.value);
    return preset?.colors || ['#0f172a', '#1e1b4b', '#0f172a'];
  }, [currentWallpaper]);

  const voiceMessageIdsAsc = useMemo(() => allMessages.filter(m => m.voice_url).map(m => m.id), [allMessages]);

  const showSenderNames = useMemo(() => {
    if (typeof threadParticipantCount === 'number') {
      return threadParticipantCount > 2;
    }

    const nonSelfSenderIds = new Set(
      messages
        .map((message) => message.sender_id)
        .filter((senderId) => !!senderId && senderId !== userId)
    );
    return nonSelfSenderIds.size > 1;
  }, [messages, threadParticipantCount, userId]);

  const rowsAsc = useMemo<ChatRow[]>(() => {
    const rows: ChatRow[] = [];
    let lastDateKey = '';
    const GROUP_GAP_MS = 2 * 60 * 1000; // 2 minutes
    for (let i = 0; i < allMessages.length; i++) {
      const msg = allMessages[i];
      const dateKey = getDateKey(msg.created_at);
      if (dateKey !== lastDateKey) { rows.push({ type: 'date', key: `date-${dateKey}`, label: getDateSeparatorLabel(msg.created_at) }); lastDateKey = dateKey; }
      const prev = allMessages[i - 1];
      const next = allMessages[i + 1];
      const prevSame = prev && prev.sender_id === msg.sender_id && getDateKey(prev.created_at) === dateKey && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < GROUP_GAP_MS;
      const nextSame = next && next.sender_id === msg.sender_id && getDateKey(next?.created_at) === dateKey && (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) < GROUP_GAP_MS;
      rows.push({ type: 'message', key: `msg-${msg.id}`, msg, isFirstInGroup: !prevSame, isLastInGroup: !nextSame });
    }
    return rows;
  }, [allMessages]);

  const handleSend = useCallback(async (content: string) => {
    if (!content || !threadId || sending) return;
    const replyToId = replyingTo?.id;
    clearTyping();
    setSending(true);
    setReplyingTo(null);
    try { await sendMessage({ threadId, content, replyToId }); scrollToLatest(true, 50); } catch (err) { logger.error('ParentMessageThread', 'Send failed:', err); toast.error('Failed to send message. Please try again.'); } finally { setSending(false); }
  }, [threadId, sending, sendMessage, clearTyping, replyingTo, scrollToLatest]);

  const handleScheduledSend = useCallback(async (scheduledAt: Date) => {
    if (!pendingScheduleText || !threadId) return;
    const content = pendingScheduleText;
    setPendingScheduleText(null);
    setShowScheduler(false);
    try {
      await sendMessage({ threadId, content, scheduledAt });
      toast.success(`Message scheduled for ${scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch (err) {
      logger.error('ParentMessageThread', 'Schedule failed:', err);
      toast.error('Failed to schedule message.');
    }
  }, [threadId, pendingScheduleText, sendMessage]);

  const handleVoiceRecording = useCallback(async (uri: string, duration: number) => {
    if (!threadId) return;
    Vibration.vibrate([0, 30, 50, 30]);
    const durationSecs = Math.round(duration / 1000);
    const content = `🎤 Voice (${durationSecs}s)`;
    try {
      if (uploadVoiceNote) { const result = await uploadVoiceNote(uri, duration, threadId); await sendMessage({ threadId, content, voiceUrl: result.storagePath, voiceDuration: durationSecs }); } else { if (__DEV__) logger.warn('ParentThread', 'uploadVoiceNote not available'); await sendMessage({ threadId, content }); }
      scrollToLatest(true, 50);
    } catch (err) { logger.error('ParentThread', 'Voice send failed:', err); toast.error('Failed to send voice message.'); }
  }, [threadId, sendMessage, scrollToLatest]);

  const handleImageAttach = useCallback(async (uri: string, mimeType: string) => {
    if (!threadId || !userId) return;
    Vibration.vibrate([0, 30, 50, 30]);
    try {
      const supabase = assertSupabase();
      const ext = mimeType.split('/')[1]?.replace(/\+.*$/, '') || 'jpg';
      const fileName = `${userId}/${threadId}/${Date.now()}.${ext}`;
      let fileData: Blob | Uint8Array;
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        fileData = await response.blob();
      } else if (FileSystem && uri) {
        const base64Data = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        fileData = base64ToUint8Array(base64Data);
      } else {
        throw new Error('File system not available');
      }
      const { error: uploadError } = await supabase.storage.from('message-attachments').upload(fileName, fileData, { contentType: mimeType });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('message-attachments').getPublicUrl(fileName);
      const isVideo = mimeType.startsWith('video/');
      const content = isVideo
        ? `🎬 Video\n[video](${urlData.publicUrl})`
        : `📷 Photo\n[image](${urlData.publicUrl})`;
      await sendMessage({ threadId, content });
      toast.success(isVideo ? 'Video sent' : 'Photo sent');
      scrollToLatest(true, 50);
    } catch (err) { logger.error('ParentThread', 'Image send failed:', err); toast.error('Failed to send photo.'); }
  }, [threadId, userId, sendMessage, scrollToLatest]);

  const handleMessageLongPress = useCallback((msg: Message) => {
    if (Platform.OS !== 'web') Vibration.vibrate(10);
    setSelectedMessage(msg);
    setShowMessageActions(true);
  }, []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const atBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
    isAtBottomRef.current = atBottom;
    setShowScrollFab(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => { scrollToLatest(true, 0); setShowScrollFab(false); }, [scrollToLatest]);

  const handleComposerLayout = useCallback((event: LayoutChangeEvent) => {
    const h = Math.ceil(event.nativeEvent.layout.height);
    if (h > 0 && Math.abs(h - composerHeight) > 1) {
      setComposerHeight(h);
      if (isAtBottomRef.current) {
        scrollToLatest(false, 20);
      }
    }
  }, [composerHeight, scrollToLatest]);

  // Other participant
  const otherParticipant = useMemo(() => messages.find(m => m.sender_id !== userId), [messages, userId]);

  return {
    listRef, isAtBottomRef, isOtherTyping, typingText, setTyping, clearTyping,
    sending, optimisticMsgs, setOptimisticMsgs, keyboardHeight, composerHeight,
    currentWallpaper, setCurrentWallpaper, showWallpaperPicker, setShowWallpaperPicker,
    showOptionsMenu, setShowOptionsMenu, selectedMessage, setSelectedMessage,
    showMessageActions, setShowMessageActions, currentlyPlayingVoiceId, setCurrentlyPlayingVoiceId,
    replyingTo, setReplyingTo, showScrollFab, showScheduler, setShowScheduler,
    pendingScheduleText, setPendingScheduleText, handleScheduledSend,
    threadParticipantCount, threadParticipants,
    messages, loading, error, refetch, allMessages, voiceMessageIdsAsc, rowsAsc,
    getWallpaperGradient, otherParticipant, showSenderNames,
    handleSend, handleVoiceRecording, handleImageAttach, handleMessageLongPress,
    handleScroll, scrollToBottom, handleComposerLayout, scrollToLatest,
  };
}
