import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isPlatformStaff } from '@/lib/roleUtils';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { useSuperAdminTeamChat } from '@/hooks/useSuperAdminTeamChat';
import type { TeamMessage } from '@/hooks/super-admin-team-chat/types';
import { createStyles } from '@/lib/screen-styles/super-admin-team-chat.styles';
import ChannelSidebar from '@/components/team-chat/ChannelSidebar';

// ── Utilities ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b',
  '#ec4899', '#ef4444', '#6366f1', '#14b8a6',
];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function shouldShowHeader(msgs: TeamMessage[], i: number): boolean {
  if (i === 0) return true;
  if (msgs[i - 1].sender_id !== msgs[i].sender_id) return true;
  return new Date(msgs[i].created_at).getTime() - new Date(msgs[i - 1].created_at).getTime() > 300_000;
}

function shouldShowDate(msgs: TeamMessage[], i: number): boolean {
  if (i === 0) return true;
  return new Date(msgs[i - 1].created_at).toDateString() !== new Date(msgs[i].created_at).toDateString();
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function SuperAdminTeamChatScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();
  const [messageText, setMessageText] = useState('');
  const scrollRef = useRef<FlatList>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const {
    profile, channels, activeChannel, messages, members,
    loading, sendingMessage, selectChannel, handleSendMessage, goBackToChannels,
  } = useSuperAdminTeamChat(showAlert);

  if (!profile || !isPlatformStaff(profile.role)) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <ThemedStatusBar />
        <SafeAreaView style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={48} color="#ef4444" />
          <Text style={styles.accessDeniedText}>Access Denied</Text>
        </SafeAreaView>
      </View>
    );
  }

  const onSend = async () => {
    if (!messageText.trim() || sendingMessage) return;
    const text = messageText;
    setMessageText('');
    await handleSendMessage(text);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  };

  const handleKeyPress = (e: any) => {
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  // ── Desktop: split layout ──
  if (isWide) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <ThemedStatusBar />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.splitRow}>
            <ChannelSidebar
              channels={channels}
              activeChannelId={activeChannel?.id}
              onSelect={selectChannel}
              members={members}
              loading={loading}
              isWide
            />
            {activeChannel ? (
              <ChatPane
                channel={activeChannel}
                messages={messages}
                members={members}
                myId={profile.id}
                messageText={messageText}
                setMessageText={setMessageText}
                sendingMessage={sendingMessage}
                onSend={onSend}
                onKeyPress={handleKeyPress}
                scrollRef={scrollRef}
                styles={styles}
              />
            ) : (
              <View style={styles.noChannel}>
                <Ionicons name="chatbubbles-outline" size={56} color="#1e293b" />
                <Text style={styles.noChannelTitle}>Select a channel</Text>
                <Text style={styles.noChannelSub}>
                  Choose a channel from the sidebar to start chatting
                </Text>
              </View>
            )}
          </View>
        </SafeAreaView>
        <AlertModal {...alertProps} />
      </View>
    );
  }

  // ── Mobile: stacked layout ──
  if (activeChannel) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <ThemedStatusBar />
        <SafeAreaView style={{ flex: 1 }}>
          <ChatPane
            channel={activeChannel}
            messages={messages}
            members={members}
            myId={profile.id}
            messageText={messageText}
            setMessageText={setMessageText}
            sendingMessage={sendingMessage}
            onSend={onSend}
            onKeyPress={handleKeyPress}
            scrollRef={scrollRef}
            styles={styles}
            onBack={goBackToChannels}
          />
        </SafeAreaView>
        <AlertModal {...alertProps} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedStatusBar />
      <SafeAreaView style={{ flex: 1 }}>
        <ChannelSidebar
          channels={channels}
          activeChannelId={undefined}
          onSelect={selectChannel}
          members={members}
          loading={loading}
          isWide={false}
          onBack={() => router.back()}
        />
      </SafeAreaView>
      <AlertModal {...alertProps} />
    </View>
  );
}

// ── Chat Pane ────────────────────────────────────────────────────────────────

function ChatPane({
  channel, messages, members, myId, messageText, setMessageText,
  sendingMessage, onSend, onKeyPress, scrollRef, styles, onBack,
}: {
  channel: { id: string; name: string; description: string | null };
  messages: TeamMessage[];
  members: { user_id: string }[];
  myId: string;
  messageText: string;
  setMessageText: (t: string) => void;
  sendingMessage: boolean;
  onSend: () => void;
  onKeyPress: (e: any) => void;
  scrollRef: React.RefObject<FlatList>;
  styles: ReturnType<typeof createStyles>;
  onBack?: () => void;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.chatPane}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ── */}
      <View style={styles.chatHeader}>
        {onBack && (
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color="#e2e8f0" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.chatTitle}># {channel.name}</Text>
          <Text style={styles.chatSub}>
            {members.length} member{members.length !== 1 ? 's' : ''}
            {channel.description ? ` · ${channel.description}` : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerIconBtn}>
          <Ionicons name="people-outline" size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* ── Messages ── */}
      <FlatList
        ref={scrollRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={
          messages.length === 0
            ? { flex: 1, justifyContent: 'center' }
            : { paddingVertical: 8, paddingHorizontal: 16 }
        }
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item, index }) => (
          <>
            {shouldShowDate(messages, index) && (
              <DateSeparator label={getDateLabel(item.created_at)} styles={styles} />
            )}
            <MessageBubble
              message={item}
              isOwn={item.sender_id === myId}
              showSender={shouldShowHeader(messages, index)}
              styles={styles}
            />
          </>
        )}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <View style={styles.emptyChatCircle}>
              <Ionicons name="chatbubble-ellipses-outline" size={36} color="#334155" />
            </View>
            <Text style={styles.emptyChatTitle}>No messages yet</Text>
            <Text style={styles.emptyChatSub}>
              Be the first to say something in #{channel.name}
            </Text>
          </View>
        }
      />

      {/* ── Input ── */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={messageText}
          onChangeText={setMessageText}
          placeholder={`Message #${channel.name}`}
          placeholderTextColor="#475569"
          multiline
          maxLength={4000}
          returnKeyType="default"
          onKeyPress={onKeyPress}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!messageText.trim() || sendingMessage) && styles.sendBtnOff]}
          onPress={onSend}
          disabled={!messageText.trim() || sendingMessage}
        >
          <Ionicons name="send" size={16} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Message Bubble (Slack-style) ─────────────────────────────────────────────

function MessageBubble({
  message, isOwn, showSender, styles,
}: {
  message: TeamMessage;
  isOwn: boolean;
  showSender: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  if (message.content_type === 'system') {
    return (
      <View style={styles.systemMsg}>
        <Text style={styles.systemMsgText}>{message.content}</Text>
      </View>
    );
  }

  const name = message.sender?.full_name || 'Unknown';
  const color = hashColor(name);

  return (
    <View style={[styles.msgRow, showSender && styles.msgRowSpaced]}>
      <View style={styles.msgAvatarCol}>
        {showSender ? (
          <View style={[styles.msgAvatar, { backgroundColor: isOwn ? '#3b82f6' : color }]}>
            <Text style={styles.msgAvatarText}>{initials(name)}</Text>
          </View>
        ) : (
          <View style={styles.msgAvatarSpacer} />
        )}
      </View>
      <View style={styles.msgBody}>
        {showSender && (
          <View style={styles.msgMeta}>
            <Text style={[styles.msgName, isOwn && { color: '#60a5fa' }]}>
              {isOwn ? 'You' : name}
            </Text>
            {message.sender?.role && (
              <View style={[styles.msgRolePill, { backgroundColor: color + '22' }]}>
                <Text style={[styles.msgRoleLabel, { color }]}>
                  {message.sender.role.replace(/_/g, ' ')}
                </Text>
              </View>
            )}
            <Text style={styles.msgTimestamp}>{formatTime(message.created_at)}</Text>
          </View>
        )}
        <Text style={styles.msgContent}>{message.content}</Text>
      </View>
    </View>
  );
}

// ── Date Separator ───────────────────────────────────────────────────────────

function DateSeparator({ label, styles }: { label: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.dateSep}>
      <View style={styles.dateSepLine} />
      <Text style={styles.dateSepLabel}>{label}</Text>
      <View style={styles.dateSepLine} />
    </View>
  );
}
